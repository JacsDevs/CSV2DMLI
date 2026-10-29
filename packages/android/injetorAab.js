// Injeta o conteúdo do dicionário (HTML + mídias + ícones) no template AAB/APK.
// Usa fflate para ler o template e Canvas API para redimensionar ícones.
// O template deve ser um ZIP sem conteúdo real em base/assets/ (ou assets/).
//
// Play Asset Delivery (somente AAB): o template traz o pacote de recursos `midia_pack`
// (install-time), usado como modelo. Para cada pacote do plano de entrega
// (planejarEntrega em limitesTamanho.js) o módulo-modelo é clonado com o nome e o modo
// de entrega do pacote (install-time, fast-follow ou on-demand), e as mídias do pacote
// vão para <pacote>/assets/. No aparelho o Android junta os assets dos pacotes
// install-time aos do módulo base, então os caminhos file:///android_asset/... usados
// pelo HTML continuam os mesmos; os pacotes fast-follow/on-demand ficam fora dali e são
// listados no midias-index.json. Sem pacotes no plano, o módulo-modelo é removido e o
// AAB fica idêntico ao formato anterior (tudo no módulo base).

import { patchManifestAab } from './patcherManifestAab.js';
import { patchManifest } from './patcherManifest.js';
import { lerBytes } from './zipUtil.js';
import { ARQUIVO_INDICE_MIDIAS, gerarIndiceMidias, planoTemEtapas } from './limitesTamanho.js';
import { DENSIDADES_ANDROID, redimensionarParaPng, aplicarMascaraCircular } from '../core/iconeUtil.js';

export const PACOTE_MIDIA = 'midia_pack';
const PREFIXO_PACOTE = `${PACOTE_MIDIA}/`;
const MANIFESTO_PACOTE = `${PACOTE_MIDIA}/manifest/AndroidManifest.xml`;
const ASSETS_PB_PACOTE = `${PACOTE_MIDIA}/assets.pb`;
// O assets.pb gerado pelo AGP declara o diretório "assets" do pacote, e o bundletool
// exige que ele tenha ao menos um arquivo direto (as mídias ficam em subpastas).
// Por isso cada pacote gerado recebe um arquivo de marcação, como o do template.
const marcadorPacote = (nome) => `${nome}/assets/${nome}.txt`;

// Arquivos do template que devem ficar sem compressão (já comprimidos ou lidos via mmap)
function templateSemCompressao(path) {
    return path.endsWith('.dex') ||
        path.endsWith('.so')  ||
        path.endsWith('.png') ||
        path.endsWith('.webp')||
        path.endsWith('.jpg') ||
        path.endsWith('.mp3') ||
        path.endsWith('.mp4') ||
        path.endsWith('.ogg') ||
        path.endsWith('.aab') ||
        path.endsWith('.apk') ||
        path === 'resources.arsc';  // Android 11+ exige STORED para mmap direto
}

/** Indica se o template AAB inclui o módulo do pacote de mídia (Play Asset Delivery). */
export function templateTemPacoteMidia(entradasTemplate) {
    return Object.prototype.hasOwnProperty.call(entradasTemplate, MANIFESTO_PACOTE);
}

export class InjetorAab {
    /**
     * Monta a lista de entradas do pacote final, sem compactar nada.
     * As mídias são repassadas como vieram (Uint8Array ou Blob), sem cópia.
     *
     * @param {Record<string, Uint8Array>} entradasTemplate - resultado de unzipSync(template)
     * @param {{ htmlBytes: Uint8Array, midias: Map<string, Uint8Array|Blob>, iconeBytes: Uint8Array|null }} conteudo
     * @param {{ packageName: string, appName: string, versionName: string, versionCode: number, targetSdkVersion?: number }} meta
     * @param {boolean} isApk - se true, o template é um APK, senão é AAB
     * @param {{ plano?: { pacotes: Array<{ nome: string, entrega: string }>, destinos: Map<string, string> },
     *           iconesProntos?: Map<string, Uint8Array> }} [opcoes]
     *   plano: resultado de planejarEntrega (só no AAB; sem ele, tudo vai para o módulo base)
     * @returns {Promise<Array<{ caminho: string, dados: Uint8Array|Blob, comprimir: boolean }>>}
     */
    async prepararEntradas(entradasTemplate, conteudo, meta, isApk = false, opcoes = {}) {
        const plano = isApk ? null : opcoes.plano;
        const pacotes = plano ? plano.pacotes : [];
        const arquivos = { ...entradasTemplate };  // cópia rasa: só referências

        const assetsDir = isApk ? 'assets/' : 'base/assets/';
        const resDir = isApk ? 'res/' : 'base/res/';
        const manifestKey = isApk ? 'AndroidManifest.xml' : 'base/manifest/AndroidManifest.xml';

        if (pacotes.length > 0 && !templateTemPacoteMidia(arquivos)) {
            throw new Error(
                'As mídias precisam de pacotes de recursos da Google Play, mas o template AAB não tem o ' +
                'pacote-modelo (midia_pack). Atualize vendor/android/template.aab com "npm run build:android-template".'
            );
        }
        const modeloManifesto = arquivos[MANIFESTO_PACOTE];
        const modeloAssetsPb = arquivos[ASSETS_PB_PACOTE];

        // Explícito = entradas definidas por nós (sempre STORED, como antes)
        const explicitos = new Set();

        // 1. Remover assets antigos do módulo base e o módulo-modelo (os pacotes são recriados a partir dele)
        for (const path of Object.keys(arquivos)) {
            if (path.startsWith(assetsDir) || (!isApk && path.startsWith(PREFIXO_PACOTE))) delete arquivos[path];
        }

        // 2. Injetar HTML principal (sempre no módulo base)
        arquivos[`${assetsDir}index.html`] = conteudo.htmlBytes;
        explicitos.add(`${assetsDir}index.html`);

        // 2b. Pacotes de recursos: manifesto do modelo com o nome, o package do app e o modo de entrega
        const te = new TextEncoder();
        for (const { nome, entrega } of pacotes) {
            const manifesto = `${nome}/manifest/AndroidManifest.xml`;
            arquivos[manifesto] = patchManifestAab(modeloManifesto, { packageName: meta.packageName, split: nome, entrega });
            arquivos[`${nome}/assets.pb`] = modeloAssetsPb;
            arquivos[marcadorPacote(nome)] = te.encode(
                `Marcador do pacote de recursos ${nome} (Play Asset Delivery, ${entrega}). Mantido no AAB pelo gerador.\n`);
            explicitos.add(manifesto);
        }

        // 2c. Índice dos pacotes baixados depois da instalação, lido pelo app
        if (plano && planoTemEtapas(plano)) {
            const indice = `${assetsDir}${ARQUIVO_INDICE_MIDIAS}`;
            arquivos[indice] = te.encode(JSON.stringify(gerarIndiceMidias(plano, conteudo.midias)));
            explicitos.add(indice);
        }

        // 3. Injetar mídias mantendo caminhos relativos, no módulo base ou no pacote do plano
        for (const [caminho, dados] of conteudo.midias) {
            const pacote = plano && plano.destinos.get(caminho);
            const destino = pacote ? `${pacote}/assets/${caminho}` : `${assetsDir}${caminho}`;
            arquivos[destino] = dados;
            explicitos.add(destino);
        }

        // 4. Injetar ícones redimensionados para cada densidade
        const icones = opcoes.iconesProntos || await gerarIconesDensidades(conteudo.iconeBytes);
        for (const [sufixo, bytes] of icones) {
            arquivos[`${resDir}${sufixo}`] = bytes;
            explicitos.add(`${resDir}${sufixo}`);
        }

        // 5. Patchear AndroidManifest.xml binário
        if (arquivos[manifestKey]) {
            arquivos[manifestKey] = isApk
                ? patchManifest(arquivos[manifestKey], {
                    packageName: meta.packageName,
                    appName:     meta.appName,
                    versionCode: meta.versionCode,
                    versionName: meta.versionName,
                })
                : patchManifestAab(arquivos[manifestKey], {
                    packageName:      meta.packageName,
                    appName:          meta.appName,
                    versionCode:      meta.versionCode,
                    versionName:      meta.versionName,
                    targetSdkVersion: meta.targetSdkVersion ?? 36,
                    // Sem pacotes baixados depois da instalação, o serviço de extração não é usado
                    removerServicoPrimeiroPlano: !(plano && planoTemEtapas(plano)),
                });
            explicitos.add(manifestKey);
        }

        // 6. DEX e binários sem compressão, o resto do template com DEFLATE
        return Object.entries(arquivos)
            .filter(([path]) => !path.endsWith('/'))  // diretórios vazios não entram
            .map(([caminho, dados]) => ({
                caminho,
                dados,
                comprimir: !explicitos.has(caminho) && !templateSemCompressao(caminho),
            }));
    }

    /**
     * Versão legada: devolve o pacote completo (não assinado) como Uint8Array.
     * @param {Uint8Array} templateBytes - bytes do template (AAB ou APK)
     * @returns {Promise<Uint8Array>}
     */
    async injetar(templateBytes, conteudo, meta, isApk = false, opcoes = {}) {
        const { unzipSync, zipSync } = await import(new URL('../../vendor/fflate.min.js', import.meta.url).href);
        const entradas = await this.prepararEntradas(unzipSync(templateBytes), conteudo, meta, isApk, opcoes);
        const resultado = {};
        for (const { caminho, dados, comprimir } of entradas) {
            resultado[caminho] = [await lerBytes(dados), { level: comprimir ? 6 : 0 }];
        }
        return zipSync(resultado);
    }
}

/**
 * Gera os ícones de todas as densidades uma única vez (reaproveitados no AAB e no APK).
 * @returns {Promise<Map<string, Uint8Array>>} caminho relativo a res/ → PNG
 */
export async function gerarIconesDensidades(iconeBytes) {
    const icones = new Map();
    if (!iconeBytes || iconeBytes.length === 0) return icones;
    for (const [size, { pasta: density }] of Object.entries(DENSIDADES_ANDROID)) {
        try {
            const tamanho = Number(size);
            const [quadrado, redondo] = await Promise.all([
                redimensionarParaPng(iconeBytes, tamanho),
                aplicarMascaraCircular(iconeBytes, tamanho),
            ]);
            const prefix = `mipmap-${density}-v4`;
            icones.set(`${prefix}/ic_launcher.png`, quadrado);
            icones.set(`${prefix}/ic_launcher_round.png`, redondo);
        } catch (e) {
            console.warn(`Não foi possível redimensionar ícone para ${size}px:`, e);
        }
    }
    return icones;
}
