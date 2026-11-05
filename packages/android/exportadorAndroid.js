// Orquestrador de geração de AAB 100% no browser.
// Coordena: carregamento do template, injeção de conteúdo, AXML patching,
// assinatura v1 + v2 e montagem do zip final (salvo pela tela de conclusão).
//
// Memória: AAB, APK e o zip final são montados como Blobs compostos por partes
// (montadorPacote.js / zipUtil.js). Mídias recebidas como File/Blob não são
// copiadas para a memória do JavaScript; cada uma é lida uma vez para o hash
// (compartilhado entre AAB e APK) e uma vez por artefato para a assinatura v2.

import { GerenteChave } from './gerenteChave.js';
import { InjetorAab, gerarIconesDensidades } from './injetorAab.js';
import { montarPacoteAssinado, CacheHashes } from './montadorPacote.js';
import { montarZipStored, verificarCancelamento, somarTamanhos } from './zipUtil.js';
import { planejarEntrega, planoTemEtapas, formatarTamanho, rotuloExibicao, ENTREGA } from './limitesTamanho.js';
import { redimensionarParaPng, redimensionarLogo } from '../core/iconeUtil.js';

// Ícone da ficha da Play Store: PNG 512×512, até 1 MB (o Google aplica a máscara)
const ICONE_LOJA_ARQUIVO = 'icone-512.png';
const ICONE_LOJA_TAMANHO = 512;
const ICONE_LOJA_MAX_BYTES = 1024 * 1024;
// Logo do cabeçalho do app nativo (exibido com ~40 dp de altura; 192 px cobre telas
// xxxhdpi). O nome do asset continua icone.png por compatibilidade com o template já compilado.
const LOGO_APP_NATIVO_ARQUIVO = 'icone.png';
const LOGO_APP_NATIVO_ALTURA = 192;
const LOGO_APP_NATIVO_LARGURA = 768;

// Organização do zip entregue ao usuário:
//   LEIA-ME.txt
//   publicar-na-play/   ← AAB, backup .p12 da chave e play-store/ (ícone e capturas)
//   instalar-direto/    ← APK
const arquivoLeiaMe = () => _t('LEIA-ME.txt');
// Título de seção do LEIA-ME, sublinhado no tamanho do texto já traduzido
const secaoLeiaMe = (titulo) => [titulo, '-'.repeat(titulo.length)];
const PASTA_PUBLICAR = 'publicar-na-play';
const PASTA_LOJA = `${PASTA_PUBLICAR}/play-store`;
const PASTA_INSTALAR = 'instalar-direto';

// Data local no formato AAAAMMDD (ex.: 20260928), usada nos nomes do zip, AAB e APK
function dataAAAAMMDD(data) {
    const p2 = (n) => String(n).padStart(2, '0');
    return `${data.getFullYear()}${p2(data.getMonth() + 1)}${p2(data.getDate())}`;
}

function nomeArquivoP12(alias) {
    return `chave_${(alias || 'upload').replace(/\s+/g, '_')}.p12`;
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

    async verificarSenha(senha) {
        return this.gerenteChave.verificarSenha(senha);
    }

    /** Backup .p12 da chave salva, com o mesmo nome usado no zip gerado. */
    async exportarBackupP12(senha) {
        const info = await this.gerenteChave.obterInfoChave();
        const bytes = await this.gerenteChave.exportarP12(senha);
        return { nome: nomeArquivoP12(info && info.alias), bytes };
    }

    /**
     * Gera o AAB e o APK assinados e baixa os dois, junto com um txt de
     * informações do aplicativo e as capturas de tela para a Play Store
     * (quando fornecidas), empacotados num único zip.
     *
     * @param {{
     *   senha?: string,
     *   chaveTemporaria?: boolean,
     *   modelo?: 'html'|'nativo',  // template WebView (padrão) ou nativo (experimental)
     *   htmlBytes?: Uint8Array,           // modelo 'html': index.html
     *   arquivosBase?: Map<string, Uint8Array>,  // modelo 'nativo': dados.json e config.json
     *   midias: Map<string, Uint8Array|Blob>,  // File/Blob recomendado: não é copiado para a memória
     *   iconeBytes: Uint8Array,  // ícone do launcher e da ficha da loja (quadrado)
     *   logoBytes?: Uint8Array,  // modelo 'nativo': logo do cabeçalho (sem ele, usa o ícone)
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
     *   entrega?: { etapas?: boolean, orcamento?: number, classificacao?: Map },  // opções de planejarEntrega
     *   somenteApk?: boolean,  // teste no celular: só o APK, devolvido sem zip (sem AAB, .p12 nem itens da loja)
     *   onProgress?: (pct: number, msg: string) => void,
     *   sinal?: AbortSignal,  // cancela a geração (antes do salvamento)
     * }} opcoes
     */
    async gerarAmbos(opcoes) {
        const {
            senha,
            chaveTemporaria = false,
            modelo = 'html',
            htmlBytes,
            midias,
            iconeBytes,
            logoBytes,
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
            entrega = {},
            somenteApk = false,
            onProgress = () => {},
            sinal,
        } = opcoes;

        onProgress(5, somenteApk ? _t('Carregando template (APK)…') : _t('Carregando templates (AAB e APK)…'));
        const nomeTemplate = modelo === 'nativo' ? 'template-nativo' : 'template';
        const templateUrlAab = new URL(`../../vendor/android/${nomeTemplate}.aab`, import.meta.url).href;
        const templateUrlApk = new URL(`../../vendor/android/${nomeTemplate}.apk`, import.meta.url).href;

        const [templateRespAab, templateRespApk] = await Promise.all([
            somenteApk ? null : fetch(templateUrlAab),
            fetch(templateUrlApk)
        ]);

        if ((templateRespAab && !templateRespAab.ok) || !templateRespApk.ok) {
            throw Object.assign(new Error(
                _t('Template AAB ou APK não encontrado ({modelo}). Execute "npm run build:android-{modelo}" para gerar os templates.', { modelo: nomeTemplate })
            ), { codigo: 'TEMPLATE_AUSENTE' });
        }

        const { unzipSync } = await import(new URL('../../vendor/fflate.min.js', import.meta.url).href);
        // Templates pequenos (~1 MB): descompactados uma vez, as entradas são só referências
        const entradasTemplateAab = templateRespAab ? unzipSync(new Uint8Array(await templateRespAab.arrayBuffer())) : null;
        const entradasTemplateApk = unzipSync(new Uint8Array(await templateRespApk.arrayBuffer()));
        verificarCancelamento(sinal);

        onProgress(15, chaveTemporaria ? _t('Gerando chave de assinatura temporária…') : _t('Carregando chave de assinatura…'));
        const { privateKeyPkcs8, certPem, certDer, alias } = chaveTemporaria
            ? await this.gerenteChave.gerarChaveTemporaria({ cn: nomeResponsavel, org: organizacao, pais })
            : await this.gerenteChave.carregarChave(senha);
        verificarCancelamento(sinal);

        const injector = new InjetorAab();
        const iconesProntos = await gerarIconesDensidades(iconeBytes);  // uma vez, para AAB e APK
        // App nativo: logo do cabeçalho em assets/ (o ícone do launcher vai em res/, como no app HTML).
        // Sem logo próprio, o cabeçalho usa o ícone, como antes da separação logo × ícone.
        let arquivosBase = opcoes.arquivosBase;
        const bytesCabecalho = logoBytes && logoBytes.length > 0 ? logoBytes : iconeBytes;
        if (modelo === 'nativo' && arquivosBase && bytesCabecalho && bytesCabecalho.length > 0) {
            arquivosBase = new Map(arquivosBase);
            const { bytes } = await redimensionarLogo(bytesCabecalho, LOGO_APP_NATIVO_ALTURA, LOGO_APP_NATIVO_LARGURA);
            arquivosBase.set(LOGO_APP_NATIVO_ARQUIVO, bytes);
        }
        const appInfo = { htmlBytes, arquivosBase, midias, iconeBytes };
        // Peso do conteúdo do módulo base além das mídias (HTML ou dados do app nativo)
        const tamanhoBase = arquivosBase ? [...arquivosBase.values()].reduce((s, b) => s + b.length, 0) : htmlBytes.length;
        const metaInfo = { packageName, appName, versionName, versionCode };

        // Play Asset Delivery: o plano divide as mídias entre o módulo base e os pacotes de recursos
        // (só no AAB; o APK leva tudo num arquivo)
        const tamanhoMidias = somarTamanhos(midias.values());
        const plano = somenteApk ? null : planejarEntrega({ ...entrega, midias, tamanhoHtml: tamanhoBase });
        const usarPacoteMidia = !!plano && plano.pacotes.length > 0;

        // Progresso por bytes: hash das mídias (uma vez) + leitura da assinatura v2 de cada artefato
        const conteudoTotal = tamanhoBase + tamanhoMidias;
        const progressoFaixa = (inicio, fim, rotulo, total) => {
            let feito = 0;
            let ultimoPct = -1;
            return (n) => {
                feito += n;
                const frac = total > 0 ? Math.min(1, feito / total) : 1;
                const pct = Math.floor(inicio + (fim - inicio) * frac);
                if (pct === ultimoPct && feito < total) return;
                ultimoPct = pct;
                onProgress(pct, _t('{etapa} — {feito} de {total}', { etapa: rotulo, feito: formatarTamanho(Math.min(feito, total)), total: formatarTamanho(total) }));
            };
        };
        const cache = new CacheHashes();
        const assinatura = { privateKeyPkcs8, certPem, certDer, cache, sinal };

        const baseName = appName
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9_\-]/g, '_');
        const nomeComData = `${baseName}_${dataAAAAMMDD(new Date())}`;
        const nomeAab = `${nomeComData}.aab`;
        const nomeApk = `${nomeComData}.apk`;
        const nomeZip = `${nomeComData}.zip`;

        // ---- Processar AAB ----
        let aab = null;
        if (!somenteApk) {
            onProgress(20, usarPacoteMidia
                ? _t('Montando AAB (mídias no pacote de recursos da Play)…')
                : _t('Montando AAB…'));
            const progAab = progressoFaixa(20, 50, _t('Gerando e assinando AAB'), 2 * conteudoTotal);
            aab = await montarPacoteAssinado({
                ...assinatura,
                entradas: await injector.prepararEntradas(entradasTemplateAab, appInfo, metaInfo, false, { plano, iconesProntos }),
                alinhar: false,
                onBytesHash: progAab,
                onBytesAssinatura: progAab,
            });
        }

        // ---- Processar APK ---- (hashes das mídias já estão no cache)
        // Só APK: hash e assinatura são feitos aqui, por isso a faixa é maior
        onProgress(somenteApk ? 20 : 50, _t('Montando APK…'));
        const progApk = somenteApk
            ? progressoFaixa(20, 95, _t('Gerando e assinando APK'), 2 * conteudoTotal)
            : progressoFaixa(50, 80, _t('Gerando e assinando APK'), conteudoTotal);
        const apk = await montarPacoteAssinado({
            ...assinatura,
            entradas: await injector.prepararEntradas(entradasTemplateApk, appInfo, metaInfo, true, { iconesProntos }),
            alinhar: true,
            onBytesHash: progApk,
            onBytesAssinatura: progApk,
            tipoMime: 'application/vnd.android.package-archive',
        });
        verificarCancelamento(sinal);

        if (somenteApk) {
            onProgress(100, _t('Concluído!'));
            return { somenteApk: true, apk: nomeApk, blob: apk.blob, tamanhos: { apk: apk.tamanho } };
        }

        onProgress(85, _t('Empacotando arquivos…'));

        // Backup .p12 da chave própria (a chave temporária é descartável e não é incluída)
        const nomeP12 = chaveTemporaria ? null : nomeArquivoP12(alias);

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
            plano, modelo, tamanhoAab: aab.tamanho, tamanhoApk: apk.tamanho,
        });

        // Zip final sem compressão (STORED), montado em partes: AAB e APK entram como
        // Blobs, com o CRC32 já calculado na assinatura — nada é relido nem copiado.
        const arquivosZip = [
            { nome: arquivoLeiaMe(), dados: new TextEncoder().encode(infoTexto) },
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

        onProgress(100, _t('Concluído!'));
        return {
            zip: nomeZip, aab: nomeAab, apk: nomeApk, p12: nomeP12,
            capturas: nomesCapturas, iconeLoja: iconeLoja ? iconeLoja.nome : null,
            leiaMe: arquivoLeiaMe(),
            pastas: { publicar: PASTA_PUBLICAR, loja: PASTA_LOJA, instalar: PASTA_INSTALAR },
            // O zip não é salvo aqui: a tela de conclusão oferece o botão "Salvar"
            blob: blobZip,
            usarPacoteMidia,
            plano,
            tamanhos: { aab: aab.tamanho, apk: apk.tamanho, zip: blobZip.size },
        };
    }

    // Bloco do LEIA-ME com a divisão das mídias entre a instalação e os pacotes de recursos
    #montarBlocoEntrega(plano) {
        const MODOS = {
            [ENTREGA.INSTALACAO]: _t('na instalação'),
            [ENTREGA.SEGUIDA]: _t('baixa logo após a instalação (fast-follow)'),
            [ENTREGA.DEMANDA]: _t('sob demanda (on-demand)'),
        };
        const linhas = [
            ...secaoLeiaMe(_t('Pacotes de mídias (Play Asset Delivery)')),
            _t('Na instalação (módulo base, HTML e app incluídos): {tamanho}', { tamanho: formatarTamanho(plano.totais[ENTREGA.INSTALACAO]) }),
            ...plano.pacotes.map(p => `- ${p.nome}: ${rotuloExibicao(p)}, ${formatarTamanho(p.tamanho)}, ${MODOS[p.entrega]}`),
        ];
        if (planoTemEtapas(plano)) {
            linhas.push(
                '',
                _t('Os pacotes fast-follow são baixados automaticamente logo após a instalação; os\non-demand, quando o usuário pede (Ajustes > Mídias offline, ou ao abrir uma mídia).\nO arquivo midias-index.json (no módulo base) lista o pacote de cada uma dessas mídias.'),
                '',
                _t('Declaração no Play Console (obrigatória para este AAB):'),
                _t('A biblioteca de download de pacotes da Google Play usa um serviço em primeiro plano\npara instalar as mídias baixadas. Em Política > Conteúdo do app > "Permissões de\nserviço em primeiro plano", declare o tipo "Sincronização de dados" (dataSync),\ndescrevendo o uso como "download e instalação de pacotes de mídia do dicionário",\ne informe o link de um vídeo curto mostrando o download em Mídias offline.'),
                '',
                _t('O APK (pasta {pasta}/) contém todas as mídias em um único arquivo.', { pasta: PASTA_INSTALAR }),
                '',
            );
        } else {
            linhas.push(_t('Nenhuma ação é necessária no Play Console. O APK contém tudo em um único arquivo.'), '');
        }
        return linhas;
    }

    #montarLeiaMe({ nomeResponsavel, organizacao, cidade, estado, pais, appName, packageName, versionName, senha, chaveTemporaria = false, alias, nomeAab, nomeApk, nomeP12, nomesCapturas = [], iconeLoja = null, plano = null, modelo = 'html', tamanhoAab = 0, tamanhoApk = 0 }) {
        const naoInformado = _t('(não informado)');
        const local = [cidade, estado, pais].filter(Boolean).join(' - ') || naoInformado;

        // Mapa do conteúdo do zip, na mesma ordem das pastas
        const itensLoja = [
            ...(iconeLoja ? [iconeLoja.nome] : []),
            ...nomesCapturas,
        ];
        const blocoConteudo = [
            ...secaoLeiaMe(_t('Conteúdo deste zip')),
            _t('{arquivo}  (este arquivo)', { arquivo: arquivoLeiaMe() }),
            `${PASTA_PUBLICAR}/`,
            `    ${nomeAab}  (${formatarTamanho(tamanhoAab)})`,
            ...(nomeP12 ? [`    ${_t('{arquivo}  (backup da chave de assinatura)', { arquivo: nomeP12 })}`] : []),
            ...(itensLoja.length > 0 ? ['    play-store/', ...itensLoja.map(n => `        ${n}`)] : []),
            `${PASTA_INSTALAR}/`,
            `    ${nomeApk}  (${formatarTamanho(tamanhoApk)})`,
            '',
        ];

        // Instruções por público: quem publica na loja e quem só quer instalar
        const blocoComoUsar = [
            ...secaoLeiaMe(_t('Como usar')),
            `▶ ${_t('Para publicar na Google Play (pasta {pasta}/):', { pasta: PASTA_PUBLICAR })}`,
            ...(chaveTemporaria
                ? [`  ${_t('Não é possível publicar este pacote: ele foi assinado com uma chave temporária.')}`,
                   `  ${_t('Crie ou importe uma chave de assinatura própria e gere o app novamente.')}`]
                : [`  1. ${_t('No Google Play Console, crie uma versão e envie o arquivo {arquivo}.', { arquivo: nomeAab })}`,
                   ...(itensLoja.length > 0
                       ? [`  2. ${_t('Na ficha da loja, use os arquivos da pasta play-store/ (ícone e/ou capturas de tela).')}`]
                       : []),
                   `  ${itensLoja.length > 0 ? 3 : 2}. ${_t('Guarde o {arquivo} e a senha: sem eles não é possível enviar atualizações.', { arquivo: nomeP12 })}`]),
            '',
            `▶ ${_t('Para instalar direto em um celular Android (pasta {pasta}/):', { pasta: PASTA_INSTALAR })}`,
            `  1. ${_t('Copie o {arquivo} para o celular (cabo USB, e-mail, Drive…).', { arquivo: nomeApk })}`,
            `  2. ${_t('Abra o arquivo no celular e permita a instalação de "fontes desconhecidas" se pedido.')}`,
            `  ${_t('O APK não precisa da Google Play e já contém todas as mídias.')}`,
            '',
        ];
        const blocoAssinatura = chaveTemporaria
            ? [
                ...secaoLeiaMe(_t('Assinatura')),
                _t('Chave temporária (descartável) — NÃO foi salva.'),
                _t('Este pacote NÃO pode ser publicado ou atualizado na Google Play com esta assinatura.'),
                _t('Crie/importe uma chave de assinatura própria e gere o app novamente antes de publicar.'),
              ]
            : [
                ...secaoLeiaMe(_t('Assinatura')),
                _t('Alias da chave: {alias}', { alias: alias || 'upload' }),
                _t('Senha da chave: {senha}', { senha }),
                _t('Backup da chave: {arquivo} (protegido pela mesma senha)', { arquivo: nomeP12 }),
                _t('(o .p12 está na pasta {pasta}/)', { pasta: PASTA_PUBLICAR }),
                _t('Guarde o arquivo .p12 em local seguro: ele é necessário para enviar\natualizações do app ao Google Play. Quem tiver este zip poderá assinar\nversões do app em seu nome — não compartilhe.'),
              ];
        const blocoCapturas = nomesCapturas.length === 0 ? [] : [
            ...secaoLeiaMe(_t('Capturas de tela (pasta {pasta}/)', { pasta: PASTA_LOJA })),
            ...nomesCapturas.map(n => `- ${n}`),
            _t('Geradas a partir da prévia do app, no formato exigido pelo Play Console:\ntelefone-*.jpg (1080x1920, 9:16) em "Capturas de tela do telefone" e\ntablet-*.jpg (1920x1080, 16:9) em "Capturas de tela de tablet de 7 e 10 polegadas".'),
            _t('São sugestões: podem ser substituídas por capturas feitas no próprio aparelho.'),
            '',
        ];
        const blocoIconeLoja = !iconeLoja ? [] : [
            ...secaoLeiaMe(_t('Ícone da Play Store (pasta {pasta}/)', { pasta: PASTA_LOJA })),
            `- ${_t('{arquivo}: PNG 512x512, para o campo "Ícone do app" da ficha da loja.', { arquivo: iconeLoja.nome })}`,
            _t('É o mesmo ícone do aplicativo; o Google Play aplica o arredondamento automaticamente.'),
            ...(iconeLoja.excedeLimite
                ? [_t('ATENÇÃO: o arquivo passou de 1 MB, limite do Play Console. Reduza-o antes de enviar.')]
                : []),
            '',
        ];
        const blocoPacoteMidia = (!plano || plano.pacotes.length === 0) ? [] : this.#montarBlocoEntrega(plano);
        const tituloLeiaMe = _t('LEIA-ME — {app}', { app: appName });
        return [
            tituloLeiaMe,
            '='.repeat(tituloLeiaMe.length),
            '',
            ...blocoConteudo,
            ...blocoComoUsar,
            ...secaoLeiaMe(_t('Informações do Aplicativo')),
            _t('Responsável: {nome}', { nome: nomeResponsavel || naoInformado }),
            _t('Organização: {nome}', { nome: organizacao || naoInformado }),
            _t('Local: {local}', { local }),
            '',
            _t('Nome do App: {nome}', { nome: appName }),
            _t('Pacote: {pacote}', { pacote: packageName }),
            _t('Versão: {versao}', { versao: String(versionName) }),
            ...(modelo === 'nativo' ? [_t('Modelo: App nativo (experimental, Android 6 ou mais novo)')] : []),
            '',
            ...blocoPacoteMidia,
            ...blocoAssinatura,
            '',
            ...blocoCapturas,
            ...blocoIconeLoja,
            _t('Gerado em: {data}', { data: new Date().toLocaleString(I18N.idioma) }),
            '',
        ].join('\n');
    }
}
