// Orquestrador de geração de AAB 100% no browser.
// Coordena: carregamento do template, injeção de conteúdo, AXML patching,
// assinatura v1 + v2 e download do arquivo final.

import { GerenteChave } from './gerenteChave.js';
import { InjetorAab }   from './injetorAab.js';
import { assinarV1 }    from './signerV1.js';
import { assinarV2 }    from './signerV2.js';
import { zipalign }     from './zipalign.js';
import { platform }     from '../platform/index.js';
import { redimensionarParaPng } from '../core/iconeUtil.js';

// Ícone da ficha da Play Store: PNG 512×512, até 1 MB (o Google aplica a máscara)
const ICONE_LOJA_ARQUIVO = 'icone-512.png';
const ICONE_LOJA_TAMANHO = 512;
const ICONE_LOJA_MAX_BYTES = 1024 * 1024;

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
     *   midias: Map<string, Uint8Array>,
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
        
        const templateBytesAab = new Uint8Array(await templateRespAab.arrayBuffer());
        const templateBytesApk = new Uint8Array(await templateRespApk.arrayBuffer());

        onProgress(15, chaveTemporaria ? 'Gerando chave de assinatura temporária…' : 'Carregando chave de assinatura…');
        const { privateKeyPkcs8, certPem, certDer, alias } = chaveTemporaria
            ? await this.gerenteChave.gerarChaveTemporaria({ cn: nomeResponsavel, org: organizacao, pais })
            : await this.gerenteChave.carregarChave(senha);

        const injector = new InjetorAab();
        const appInfo = { htmlBytes, midias, iconeBytes };
        const metaInfo = { packageName, appName, versionName, versionCode };

        // ---- Processar AAB ----
        onProgress(25, 'Injetando conteúdo no AAB…');
        let aabBytes = await injector.injetar(templateBytesAab, appInfo, metaInfo, false);

        onProgress(40, 'Assinando AAB (v1 e v2)…');
        aabBytes = await assinarV1(aabBytes, privateKeyPkcs8, certPem);
        aabBytes = await assinarV2(aabBytes, privateKeyPkcs8, certDer);

        // ---- Processar APK ----
        onProgress(55, 'Injetando conteúdo no APK…');
        let apkBytes = await injector.injetar(templateBytesApk, appInfo, metaInfo, true);

        onProgress(70, 'Assinando APK (v1, zipalign e v2)…');
        apkBytes = await assinarV1(apkBytes, privateKeyPkcs8, certPem);
        apkBytes = zipalign(apkBytes);
        apkBytes = await assinarV2(apkBytes, privateKeyPkcs8, certDer);

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

        const infoTexto = this.#montarInformacoesTxt({
            nomeResponsavel, organizacao, cidade, estado, pais,
            appName, packageName, versionName, senha, chaveTemporaria, alias, nomeP12, nomesCapturas, iconeLoja,
        });

        const arquivosZip = {
            [nomeAab]: aabBytes,
            [nomeApk]: apkBytes,
            'informacoes.txt': new TextEncoder().encode(infoTexto),
        };
        if (nomeP12) {
            arquivosZip[nomeP12] = await this.gerenteChave.montarP12({ privateKeyPkcs8, certPem, senha, alias });
        }
        for (const [nome, bytes] of capturas) {
            arquivosZip[`play-store/${nome}`] = bytes;
        }
        if (iconeLoja) {
            arquivosZip[`play-store/${iconeLoja.nome}`] = iconeLoja.bytes;
        }

        const { zipSync } = await import(new URL('../../vendor/fflate.min.js', import.meta.url).href);
        const zipBytes = zipSync(arquivosZip);

        const blobZip = new Blob([zipBytes], { type: 'application/zip' });
        await platform.salvarArquivo(nomeZip, blobZip);

        onProgress(100, 'Concluído!');
        return {
            zip: nomeZip, aab: nomeAab, apk: nomeApk, p12: nomeP12,
            capturas: nomesCapturas, iconeLoja: iconeLoja ? iconeLoja.nome : null,
        };
    }

    #montarInformacoesTxt({ nomeResponsavel, organizacao, cidade, estado, pais, appName, packageName, versionName, senha, chaveTemporaria = false, alias, nomeP12, nomesCapturas = [], iconeLoja = null }) {
        const local = [cidade, estado, pais].filter(Boolean).join(' - ') || '(não informado)';
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
                'Guarde o arquivo .p12 em local seguro: ele é necessário para enviar',
                'atualizações do app ao Google Play. Quem tiver este zip poderá assinar',
                'versões do app em seu nome — não compartilhe.',
              ];
        const blocoCapturas = nomesCapturas.length === 0 ? [] : [
            'Capturas de tela (pasta play-store/)',
            '------------------------------------',
            ...nomesCapturas.map(n => `- ${n}`),
            'Geradas a partir da prévia do app, no formato exigido pelo Play Console:',
            'telefone-*.jpg (1080x1920, 9:16) em "Capturas de tela do telefone" e',
            'tablet-*.jpg (1920x1080, 16:9) em "Capturas de tela de tablet de 7 e 10 polegadas".',
            'São sugestões: podem ser substituídas por capturas feitas no próprio aparelho.',
            '',
        ];
        const blocoIconeLoja = !iconeLoja ? [] : [
            'Ícone da Play Store (pasta play-store/)',
            '---------------------------------------',
            `- ${iconeLoja.nome}: PNG 512x512, para o campo "Ícone do app" da ficha da loja.`,
            'É o mesmo ícone do aplicativo; o Google Play aplica o arredondamento automaticamente.',
            ...(iconeLoja.excedeLimite
                ? ['ATENÇÃO: o arquivo passou de 1 MB, limite do Play Console. Reduza-o antes de enviar.']
                : []),
            '',
        ];
        return [
            'Informações do Aplicativo',
            '==========================',
            '',
            `Responsável: ${nomeResponsavel || '(não informado)'}`,
            `Organização: ${organizacao || '(não informado)'}`,
            `Local: ${local}`,
            '',
            `Nome do App: ${appName}`,
            `Pacote: ${packageName}`,
            `Versão: ${versionName}`,
            '',
            ...blocoAssinatura,
            '',
            ...blocoCapturas,
            ...blocoIconeLoja,
            `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
            '',
        ].join('\n');
    }
}
