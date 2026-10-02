import { BrowserPlatform } from './browser.js';

// Pedaço gravado por chamada: o arquivo nunca é materializado inteiro na memória
const PEDACO_GRAVACAO = 8 * 1024 * 1024;

export class TauriPlatform {
    /**
     * @param {string} nomeArquivo
     * @param {Blob} blob
     * @param {{ onProgress?: (gravado: number, total: number) => void }} [opcoes]
     */
    async salvarArquivo(nomeArquivo, blob, { onProgress } = {}) {
        try {
            const { core } = window.__TAURI__;
            const ext = nomeArquivo.split('.').pop();
            const savePath = await core.invoke('plugin:dialog|save', {
                options: {
                    title: 'Salvar Arquivo',
                    defaultPath: nomeArquivo,
                    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
                }
            });
            if (!savePath) {
                console.log('❌ Salvamento cancelado pelo usuário.');
                return false;
            }
            // Grava em pedaços: o primeiro cria/trunca o arquivo, os demais anexam
            // (append). Evita blob.arrayBuffer() do arquivo inteiro + cópia no IPC.
            // Tauri v2: payload binário + path pelo header evita congelamento da UI.
            // Nomes de header exigidos pelo plugin fs (ver @tauri-apps/plugin-fs writeFile):
            // 'path' (URL-encoded) e 'options'. Um nome diferente faz o comando falhar
            // silenciosamente e cair no fallback web.
            const total = blob.size;
            let gravado = 0;
            do {
                const fim = Math.min(gravado + PEDACO_GRAVACAO, total);
                const pedaco = new Uint8Array(await blob.slice(gravado, fim).arrayBuffer());
                await core.invoke('plugin:fs|write_file', pedaco, {
                    headers: {
                        path: encodeURIComponent(savePath),
                        options: JSON.stringify(gravado === 0 ? undefined : { append: true })
                    }
                });
                gravado = fim;
                if (onProgress) onProgress(gravado, total);
            } while (gravado < total);
            console.log(`✅ Arquivo salvo nativamente em: ${savePath}`);
            return true;
        } catch (err) {
            console.error('Erro ao salvar no Desktop, usando fallback web:', err);
            alert(
                `Não foi possível salvar em "${nomeArquivo}" no local escolhido.\n` +
                `O arquivo foi baixado para a pasta padrão de Downloads.\n\n` +
                `Detalhe técnico: ${err && err.message ? err.message : err}`
            );
            return new BrowserPlatform().salvarArquivo(nomeArquivo, blob);
        }
    }
}
