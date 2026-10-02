// Orquestrador de geração de AAB 100% no browser.
// Coordena: carregamento do template, injeção de conteúdo, AXML patching,
// assinatura v1 + v2 e download do arquivo final.
//
// Memória: AAB, APK e o zip final são montados como Blobs compostos por partes
// (montadorPacote.js / zipUtil.js). Mídias recebidas como File/Blob não são
// copiadas para a memória do JavaScript; cada uma é lida uma vez para o hash
// (compartilhado entre AAB e APK) e uma vez por artefato para a assinatura v2.

import { GerenteChave } from './gerenteChave.js';
import { InjetorAab, gerarIconesDensidades } from './injetorAab.js';
import { montarPacoteAssinado, CacheHashes } from './montadorPacote.js';
import { montarZipStored, verificarCancelamento, somarTamanhos } from './zipUtil.js';
import { deveUsarPacoteMidia, formatarTamanho } from './limitesTamanho.js';
import { platform }     from '../platform/index.js';
import { redimensionarParaPng } from '../core/iconeUtil.js';

// Ícone da ficha da Play Store: PNG 512×512, até 1 MB (o Google aplica a máscara)
const ICONE_LOJA_ARQUIVO = 'icone-512.png';
const ICONE_LOJA_TAMANHO = 512;
const ICONE_LOJA_MAX_BYTES = 1024 * 1024;

// Organização do zip entregue ao usuário:
//   LEIA-ME.txt
//   publicar-na-play/   ← AAB, backup .p12 da chave e play-store/ (ícone e capturas)
//   instalar-direto/    ← APK
const ARQUIVO_LEIA_ME = 'LEIA-ME.txt';
const PASTA_PUBLICAR = 'publicar-na-play';
const PASTA_LOJA = `${PASTA_PUBLICAR}/play-store`;
const PASTA_INSTALAR = 'instalar-direto';

// Data local no formato AAAAMMDD (ex.: 20260928), usada nos nomes do zip, AAB e APK
function dataAAAAMMDD(data) {
    const p2 = (n) => String(n).padStart(2, '0');
    return `${data.getFullYear()}${p2(data.getMonth() + 1)}${p2(data.getDate())}`;
}

export class ExportadorAndroid {
    constructor() {
        this.gerenteChave = new GerenteChave();
    }

    async obterInfoChave() {
        return this.gerenteChave.obterInfoChave();
    }

    async temChaveSalva() {
        return this.gerenteChave.temChaveSalva();
    }

    async gerarNovaChave(senha, metadados) {
        return this.gerenteChave.gerarNovaChave(senha, metadados);
    }

    async importarP12(arquivo, senha) {
        return this.gerenteChave.importarP12(arquivo, senha);
    }

    async deletarChave() {
        return this.gerenteChave.deletarChave();
    }

    /**
     * Gera o AAB e o APK assinados e baixa os dois, junto com um txt de
     * informações do aplicativo e as capturas de tela para a Play Store
     * (quando fornecidas), empacotados num único zip.
     *
     * @param {{
     *   senha?: string,
     *   chaveTemporaria?: boolean,
     *   htmlBytes: Uint8Array,
     *   midias: Map<string, Uint8Array|Blob>,  // File/Blob recomendado: não é copiado para a memória
     *   iconeBytes: Uint8Array,
     *   packageName: string,
     *   appName: string,
     *   versionName: string,
     *   versionCode: number,
     *   nomeResponsavel?: string,
     *   organizacao?: string,
     *   cidade?: string,
     *   estado?: string,
     *   pais?: string,
     *   capturas?: Map<string, Uint8Array>,
     *   onProgress?: (pct: number, msg: string) => void,
     *   sinal?: AbortSignal,  // cancela a geração (antes do salvamento)
     * }} opcoes
     */
    async gerarAmbos(opcoes) {
        const {
            senha,
            chaveTemporaria = false,
            htmlBytes,
            midias,
            iconeBytes,
            packageName,
            appName,
            versionName,
            versionCode,
            nomeResponsavel = '',
            organizacao = '',
            cidade = '',
            estado = '',
            pais = '',
            capturas = new Map(),
            onProgress = () => {},
            sinal,
        } = opcoes;

        onProgress(5, 'Carregando templates (AAB e APK)…');
        const templateUrlAab = new URL('../../vendor/android/template.aab', import.meta.url).href;
        const templateUrlApk = new URL('../../vendor/android/template.apk', import.meta.url).href;
        
        const [templateRespAab, templateRespApk] = await Promise.all([
            fetch(templateUrlAab),
            fetch(templateUrlApk)
        ]);

        if (!templateRespAab.ok || !templateRespApk.ok) {
            throw new Error(
                'Template AAB ou APK não encontrado. Execute "npm run build:android-template" para gerar os templates.'
            );
        }
        
        const { unzipSync } = await import(new URL('../../vendor/fflate.min.js', import.meta.url).href);
        // Templates pequenos (~1 MB): descompactados uma vez, as entradas são só referências
        const entradasTemplateAab = unzipSync(new Uint8Array(await templateRespAab.arrayBuffer()));
        const entradasTemplateApk = unzipSync(new Uint8Array(await templateRespApk.arrayBuffer()));
        verificarCancelamento(sinal);

        onProgress(15, chaveTemporaria ? 'Gerando chave de assinatura temporária…' : 'Carregando chave de assinatura…');
        const { privateKeyPkcs8, certPem, certDer, alias } = chaveTemporaria
            ? await this.gerenteChave.gerarChaveTemporaria({ cn: nomeResponsavel, org: organizacao, pais })
            : await this.gerenteChave.carregarChave(senha);
        verificarCancelamento(sinal);

        const injector = new InjetorAab();
        const iconesProntos = await gerarIconesDensidades(iconeBytes);  // uma vez, para AAB e APK
        const appInfo = { htmlBytes, midias, iconeBytes };
        const metaInfo = { packageName, appName, versionName, versionCode };

        // Play Asset Delivery: mídias acima do limite do módulo base vão para o pacote install-time
        const tamanhoMidias = somarTamanhos(midias.values());
        const usarPacoteMidia = deveUsarPacoteMidia(htmlBytes.length, tamanhoMidias);

        // Progresso por bytes: hash das mídias (uma vez) + leitura da assinatura v2 de cada artefato
        const conteudoTotal = htmlBytes.length + tamanhoMidias;
        const progressoFaixa = (inicio, fim, rotulo, total) => {
            let feito = 0;
            let ultimoPct = -1;
            return (n) => {
                feito += n;
                const frac = total > 0 ? Math.min(1, feito / total) : 1;
                const pct = Math.floor(inicio + (fim - inicio) * frac);
                if (pct === ultimoPct && feito < total) return;
                ultimoPct = pct;
                onProgress(pct, `${rotulo} — ${formatarTamanho(Math.min(feito, total))} de ${formatarTamanho(total)}`);
            };
        };
        const cache = new CacheHashes();
        const assinatura = { privateKeyPkcs8, certPem, certDer, cache, sinal };

        // ---- Processar AAB ----
        onProgress(20, usarPacoteMidia
            ? 'Montando AAB (mídias no pacote de recursos da Play)…'
            : 'Montando AAB…');
        const progAab = progressoFaixa(20, 50, 'Gerando e assinando AAB', 2 * conteudoTotal);
        const aab = await montarPacoteAssinado({
            ...assinatura,
            entradas: await injector.prepararEntradas(entradasTemplateAab, appInfo, metaInfo, false, { usarPacoteMidia, iconesProntos }),
            alinhar: false,
            onBytesHash: progAab,
            onBytesAssinatura: progAab,
        });

        // ---- Processar APK ---- (hashes das mídias já estão no cache)
        onProgress(50, 'Montando APK…');
        const progApk = progressoFaixa(50, 80, 'Gerando e assinando APK', conteudoTotal);
        const apk = await montarPacoteAssinado({
            ...assinatura,
            entradas: await injector.prepararEntradas(entradasTemplateApk, appInfo, metaInfo, true, { iconesProntos }),
            alinhar: true,
            onBytesHash: progApk,
            onBytesAssinatura: progApk,
            tipoMime: 'application/vnd.android.package-archive',
        });
        verificarCancelamento(sinal);

        onProgress(85, 'Empacotando arquivos…');
        const baseName = appName
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9_\-]/g, '_');
        const nomeComData = `${baseName}_${dataAAAAMMDD(new Date())}`;
        const nomeAab = `${nomeComData}.aab`;
        const nomeApk = `${nomeComData}.apk`;
        const nomeZip = `${nomeComData}.zip`;

        // Backup .p12 da chave própria (a chave temporária é descartável e não é incluída)
        const nomeP12 = chaveTemporaria ? null : `chave_${(alias || 'upload').replace(/\s+/g, '_')}.p12`;

        const nomesCapturas = Array.from(capturas.keys());

        // Ícone de alta resolução para a ficha da loja, a partir do mesmo ícone do app
        let iconeLoja = null;
        if (iconeBytes && iconeBytes.length > 0) {
            try {
                const bytes = await redimensionarParaPng(iconeBytes, ICONE_LOJA_TAMANHO);
                iconeLoja = { nome: ICONE_LOJA_ARQUIVO, bytes, excedeLimite: bytes.length > ICONE_LOJA_MAX_BYTES };
            } catch (e) {
                console.warn('Não foi possível gerar o ícone 512×512 da Play Store:', e);
            }
        }

        const infoTexto = this.#montarLeiaMe({
            nomeResponsavel, organizacao, cidade, estado, pais,
            appName, packageName, versionName, senha, chaveTemporaria, alias, nomeAab, nomeApk, nomeP12, nomesCapturas, iconeLoja,
            usarPacoteMidia, tamanhoAab: aab.tamanho, tamanhoApk: apk.tamanho,
        });

        // Zip final sem compressão (STORED), montado em partes: AAB e APK entram como
        // Blobs, com o CRC32 já calculado na assinatura — nada é relido nem copiado.
        const arquivosZip = [
            { nome: ARQUIVO_LEIA_ME, dados: new TextEncoder().encode(infoTexto) },
            { nome: `${PASTA_PUBLICAR}/${nomeAab}`, dados: aab.blob, crc: aab.crc },
        ];
        if (nomeP12) {
            arquivosZip.push({ nome: `${PASTA_PUBLICAR}/${nomeP12}`, dados: await this.gerenteChave.montarP12({ privateKeyPkcs8, certPem, senha, alias }) });
        }
        if (iconeLoja) {
            arquivosZip.push({ nome: `${PASTA_LOJA}/${iconeLoja.nome}`, dados: iconeLoja.bytes });
        }
        for (const [nome, bytes] of capturas) {
            arquivosZip.push({ nome: `${PASTA_LOJA}/${nome}`, dados: bytes });
        }
        arquivosZip.push({ nome: `${PASTA_INSTALAR}/${nomeApk}`, dados: apk.blob, crc: apk.crc });

        const blobZip = await montarZipStored(arquivosZip, { sinal });
        verificarCancelamento(sinal);

        // A partir daqui não há mais cancelamento: o arquivo está sendo gravado
        onProgress(95, `Salvando ${nomeZip} (${formatarTamanho(blobZip.size)})…`);
        const salvo = await platform.salvarArquivo(nomeZip, blobZip, {
            onProgress: (gravado, total) => onProgress(95 + Math.floor(4 * gravado / Math.max(1, total)),
                `Salvando ${nomeZip} — ${formatarTamanho(gravado)} de ${formatarTamanho(total)}`),
        });

        onProgress(100, 'Concluído!');
        return {
            zip: nomeZip, aab: nomeAab, apk: nomeApk, p12: nomeP12,
            capturas: nomesCapturas, iconeLoja: iconeLoja ? iconeLoja.nome : null,
            leiaMe: ARQUIVO_LEIA_ME,
            pastas: { publicar: PASTA_PUBLICAR, loja: PASTA_LOJA, instalar: PASTA_INSTALAR },
            salvo: salvo !== false,
            usarPacoteMidia,
            tamanhos: { aab: aab.tamanho, apk: apk.tamanho, zip: blobZip.size },
        };
    }

    #montarLeiaMe({ nomeResponsavel, organizacao, cidade, estado, pais, appName, packageName, versionName, senha, chaveTemporaria = false, alias, nomeAab, nomeApk, nomeP12, nomesCapturas = [], iconeLoja = null, usarPacoteMidia = false, tamanhoAab = 0, tamanhoApk = 0 }) {
        const local = [cidade, estado, pais].filter(Boolean).join(' - ') || '(não informado)';

        // Mapa do conteúdo do zip, na mesma ordem das pastas
        const itensLoja = [
            ...(iconeLoja ? [iconeLoja.nome] : []),
            ...nomesCapturas,
        ];
        const blocoConteudo = [
            'Conteúdo deste zip',
            '------------------',
            `${ARQUIVO_LEIA_ME}  (este arquivo)`,
            `${PASTA_PUBLICAR}/`,
            `    ${nomeAab}  (${formatarTamanho(tamanhoAab)})`,
            ...(nomeP12 ? [`    ${nomeP12}  (backup da chave de assinatura)`] : []),
            ...(itensLoja.length > 0 ? ['    play-store/', ...itensLoja.map(n => `        ${n}`)] : []),
            `${PASTA_INSTALAR}/`,
            `    ${nomeApk}  (${formatarTamanho(tamanhoApk)})`,
            '',
        ];

        // Instruções por público: quem publica na loja e quem só quer instalar
        const blocoComoUsar = [
            'Como usar',
            '---------',
            `▶ Para publicar na Google Play (pasta ${PASTA_PUBLICAR}/):`,
            ...(chaveTemporaria
                ? ['  Não é possível publicar este pacote: ele foi assinado com uma chave temporária.',
                   '  Crie ou importe uma chave de assinatura própria e gere o app novamente.']
                : [`  1. No Google Play Console, crie uma versão e envie o arquivo ${nomeAab}.`,
                   ...(itensLoja.length > 0
                       ? ['  2. Na ficha da loja, use os arquivos da pasta play-store/ (ícone e/ou capturas de tela).']
                       : []),
                   `  ${itensLoja.length > 0 ? 3 : 2}. Guarde o ${nomeP12} e a senha: sem eles não é possível enviar atualizações.`]),
            '',
            `▶ Para instalar direto em um celular Android (pasta ${PASTA_INSTALAR}/):`,
            `  1. Copie o ${nomeApk} para o celular (cabo USB, e-mail, Drive…).`,
            '  2. Abra o arquivo no celular e permita a instalação de "fontes desconhecidas" se pedido.',
            '  O APK não precisa da Google Play e já contém todas as mídias.',
            '',
        ];
        const blocoAssinatura = chaveTemporaria
            ? [
                'Assinatura',
                '----------',
                'Chave temporária (descartável) — NÃO foi salva.',
                'Este pacote NÃO pode ser publicado ou atualizado na Google Play com esta assinatura.',
                'Crie/importe uma chave de assinatura própria e gere o app novamente antes de publicar.',
              ]
            : [
                'Assinatura',
                '----------',
                `Alias da chave: ${alias || 'upload'}`,
                `Senha da chave: ${senha}`,
                `Backup da chave: ${nomeP12} (protegido pela mesma senha)`,
                `(o .p12 está na pasta ${PASTA_PUBLICAR}/)`,
                'Guarde o arquivo .p12 em local seguro: ele é necessário para enviar',
                'atualizações do app ao Google Play. Quem tiver este zip poderá assinar',
                'versões do app em seu nome — não compartilhe.',
              ];
        const blocoCapturas = nomesCapturas.length === 0 ? [] : [
            `Capturas de tela (pasta ${PASTA_LOJA}/)`,
            '-'.repeat(`Capturas de tela (pasta ${PASTA_LOJA}/)`.length),
            ...nomesCapturas.map(n => `- ${n}`),
            'Geradas a partir da prévia do app, no formato exigido pelo Play Console:',
            'telefone-*.jpg (1080x1920, 9:16) em "Capturas de tela do telefone" e',
            'tablet-*.jpg (1920x1080, 16:9) em "Capturas de tela de tablet de 7 e 10 polegadas".',
            'São sugestões: podem ser substituídas por capturas feitas no próprio aparelho.',
            '',
        ];
        const blocoIconeLoja = !iconeLoja ? [] : [
            `Ícone da Play Store (pasta ${PASTA_LOJA}/)`,
            '-'.repeat(`Ícone da Play Store (pasta ${PASTA_LOJA}/)`.length),
            `- ${iconeLoja.nome}: PNG 512x512, para o campo "Ícone do app" da ficha da loja.`,
            'É o mesmo ícone do aplicativo; o Google Play aplica o arredondamento automaticamente.',
            ...(iconeLoja.excedeLimite
                ? ['ATENÇÃO: o arquivo passou de 1 MB, limite do Play Console. Reduza-o antes de enviar.']
                : []),
            '',
        ];
        const blocoPacoteMidia = !usarPacoteMidia ? [] : [
            'Pacote de mídias (Play Asset Delivery)',
            '--------------------------------------',
            'As mídias passam do limite de 500 MB do módulo base e foram colocadas no',
            'pacote de recursos "midia_pack" do AAB, entregue junto com a instalação.',
            'Nenhuma ação é necessária no Play Console. O APK contém tudo em um único arquivo.',
            '',
        ];
        return [
            `LEIA-ME — ${appName}`,
            '='.repeat(`LEIA-ME — ${appName}`.length),
            '',
            ...blocoConteudo,
            ...blocoComoUsar,
            'Informações do Aplicativo',
            '-------------------------',
            `Responsável: ${nomeResponsavel || '(não informado)'}`,
            `Organização: ${organizacao || '(não informado)'}`,
            `Local: ${local}`,
            '',
            `Nome do App: ${appName}`,
            `Pacote: ${packageName}`,
            `Versão: ${versionName}`,
            '',
            ...blocoPacoteMidia,
            ...blocoAssinatura,
            '',
            ...blocoCapturas,
            ...blocoIconeLoja,
            `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
            '',
        ].join('\n');
    }
}
