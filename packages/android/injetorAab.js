// Injeta o conteúdo do dicionário (HTML + mídias + ícones) no template AAB/APK.
// Usa fflate para ler o template e Canvas API para redimensionar ícones.
// O template deve ser um ZIP sem conteúdo real em base/assets/ (ou assets/).
//
// Play Asset Delivery (somente AAB): se o template tiver o pacote de recursos
// `midia_pack` (install-time) e o chamador pedir `usarPacoteMidia`, as mídias vão
// para midia_pack/assets/ em vez de base/assets/. No aparelho o Android junta os
// assets de todos os splits instalados, então os caminhos file:///android_asset/...
// usados pelo HTML continuam os mesmos. Sem `usarPacoteMidia`, o módulo do pacote
// é removido e o AAB fica idêntico ao formato anterior (tudo no módulo base).

import { patchManifestAab } from './patcherManifestAab.js';
import { patchManifest } from './patcherManifest.js';
import { lerBytes } from './zipUtil.js';
import { DENSIDADES_ANDROID, redimensionarParaPng, aplicarMascaraCircular } from '../core/iconeUtil.js';

export const PACOTE_MIDIA = 'midia_pack';
const PREFIXO_PACOTE = `${PACOTE_MIDIA}/`;
const MANIFESTO_PACOTE = `${PACOTE_MIDIA}/manifest/AndroidManifest.xml`;
// O assets.pb gerado pelo AGP declara o diretório "assets" do pacote, e o bundletool
// exige que ele tenha ao menos um arquivo direto (as mídias ficam em subpastas).
// Por isso o arquivo de marcação do template é mantido quando o pacote é usado.
const MARCADOR_PACOTE = `${PACOTE_MIDIA}/assets/midia_pack.txt`;

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
     * @param {{ usarPacoteMidia?: boolean, iconesProntos?: Map<string, Uint8Array> }} [opcoes]
     * @returns {Promise<Array<{ caminho: string, dados: Uint8Array|Blob, comprimir: boolean }>>}
     */
    async prepararEntradas(entradasTemplate, conteudo, meta, isApk = false, opcoes = {}) {
        const { usarPacoteMidia = false } = opcoes;
        const arquivos = { ...entradasTemplate };  // cópia rasa: só referências

        const assetsDir = isApk ? 'assets/' : 'base/assets/';
        const resDir = isApk ? 'res/' : 'base/res/';
        const manifestKey = isApk ? 'AndroidManifest.xml' : 'base/manifest/AndroidManifest.xml';

        const temPacote = !isApk && templateTemPacoteMidia(arquivos);
        if (usarPacoteMidia && !isApk && !temPacote) {
            throw new Error(
                'As mídias passam do limite do módulo base da Google Play, mas o template AAB não tem o ' +
                'pacote de recursos (midia_pack). Atualize vendor/android/template.aab com "npm run build:android-template".'
            );
        }
        const destinoMidias = (usarPacoteMidia && temPacote) ? `${PREFIXO_PACOTE}assets/` : assetsDir;

        // Explícito = entradas definidas por nós (sempre STORED, como antes)
        const explicitos = new Set();

        // 1. Remover assets antigos (base e pacote) e, se o pacote não for usado, o módulo inteiro
        for (const path of Object.keys(arquivos)) {
            if (path.startsWith(assetsDir)) delete arquivos[path];
            else if (!isApk && path.startsWith(PREFIXO_PACOTE)) {
                const assetDoPacote = path.startsWith(`${PREFIXO_PACOTE}assets/`) && path !== MARCADOR_PACOTE;
                if (!usarPacoteMidia || assetDoPacote) delete arquivos[path];
            }
        }

        // 2. Injetar HTML principal (sempre no módulo base)
        arquivos[`${assetsDir}index.html`] = conteudo.htmlBytes;
        explicitos.add(`${assetsDir}index.html`);

        // 3. Injetar mídias mantendo caminhos relativos
        for (const [caminho, dados] of conteudo.midias) {
            arquivos[`${destinoMidias}${caminho}`] = dados;
            explicitos.add(`${destinoMidias}${caminho}`);
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
                });
            explicitos.add(manifestKey);
        }

        // 5b. Manifesto do pacote de mídia: o atributo package precisa ser igual ao do app
        if (arquivos[MANIFESTO_PACOTE]) {
            arquivos[MANIFESTO_PACOTE] = patchManifestAab(arquivos[MANIFESTO_PACOTE], { packageName: meta.packageName });
            explicitos.add(MANIFESTO_PACOTE);
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
