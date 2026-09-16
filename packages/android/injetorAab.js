// Injeta o conteúdo do dicionário (HTML + mídias + ícones) no template AAB/APK.
// Usa fflate para manipulação do ZIP e Canvas API para redimensionar ícones.
// O template deve ser um ZIP sem conteúdo real em base/assets/ (ou assets/).

import { patchManifestAab } from './patcherManifestAab.js';
import { patchManifest } from './patcherManifest.js';
import { DENSIDADES_ANDROID, redimensionarParaPng, aplicarMascaraCircular } from '../core/iconeUtil.js';

export class InjetorAab {
    /**
     * @param {Uint8Array} templateBytes - bytes do template (AAB ou APK)
     * @param {{ htmlBytes: Uint8Array, midias: Map<string, Uint8Array>, iconeBytes: Uint8Array|null }} conteudo
     * @param {{ packageName: string, appName: string, versionName: string, versionCode: number }} meta
     * @param {boolean} isApk - se true, o template é um APK, senão é AAB
     * @returns {Promise<Uint8Array>}
     */
    async injetar(templateBytes, conteudo, meta, isApk = false) {
        const { unzipSync, zipSync } = await import(new URL('../../vendor/fflate.min.js', import.meta.url).href);

        // 1. Descompactar todo o arquivo
        const arquivos = unzipSync(templateBytes);

        const assetsDir = isApk ? 'assets/' : 'base/assets/';
        const resDir = isApk ? 'res/' : 'base/res/';
        const manifestKey = isApk ? 'AndroidManifest.xml' : 'base/manifest/AndroidManifest.xml';

        // 2. Remover assets antigos
        for (const path of Object.keys(arquivos)) {
            if (path.startsWith(assetsDir)) delete arquivos[path];
        }

        // 3. Injetar HTML principal
        arquivos[`${assetsDir}index.html`] = [conteudo.htmlBytes, { level: 0 }];

        // 4. Injetar mídias mantendo caminhos relativos
        for (const [caminho, bytes] of conteudo.midias) {
            arquivos[`${assetsDir}${caminho}`] = [bytes, { level: 0 }];
        }

        // 5. Injetar ícones redimensionados para cada densidade
        if (conteudo.iconeBytes && conteudo.iconeBytes.length > 0) {
            for (const [size, { pasta: density }] of Object.entries(DENSIDADES_ANDROID)) {
                try {
                    const tamanho = Number(size);
                    const [quadrado, redondo] = await Promise.all([
                        redimensionarParaPng(conteudo.iconeBytes, tamanho),
                        aplicarMascaraCircular(conteudo.iconeBytes, tamanho),
                    ]);
                    const prefix = `${resDir}mipmap-${density}-v4`;
                    arquivos[`${prefix}/ic_launcher.png`]       = [quadrado, { level: 0 }];
                    arquivos[`${prefix}/ic_launcher_round.png`] = [redondo, { level: 0 }];
                } catch (e) {
                    console.warn(`Não foi possível redimensionar ícone para ${size}px:`, e);
                }
            }
        }

        // 6. Patchear AndroidManifest.xml binário
        if (arquivos[manifestKey]) {
            const manifestBytes = arquivos[manifestKey] instanceof Uint8Array
                ? arquivos[manifestKey]
                : arquivos[manifestKey][0];
            
            const patchado = isApk
                ? patchManifest(manifestBytes, {
                    packageName: meta.packageName,
                    appName:     meta.appName,
                    versionCode: meta.versionCode,
                    versionName: meta.versionName,
                })
                : patchManifestAab(manifestBytes, {
                    packageName:      meta.packageName,
                    appName:          meta.appName,
                    versionCode:      meta.versionCode,
                    versionName:      meta.versionName,
                    targetSdkVersion: meta.targetSdkVersion ?? 35,
                });
            arquivos[manifestKey] = [patchado, { level: 0 }];
        }

        // 7. Reempacotar: DEX e binários sem compressão, o resto com DEFLATE
        const resultado = {};
        for (const [path, entry] of Object.entries(arquivos)) {
            if (Array.isArray(entry)) {
                // Já tem opções explícitas definidas por nós
                resultado[path] = entry;
            } else {
                // Preservar arquivos do template
                const semCompressao = path.endsWith('.dex') ||
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

                resultado[path] = [entry, { level: semCompressao ? 0 : 6 }];
            }
        }

        return zipSync(resultado);
    }
}
