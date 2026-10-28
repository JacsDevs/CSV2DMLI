import { BrowserPlatform } from './browser.js';

// Pedaço gravado por chamada: o arquivo nunca é materializado inteiro na memória
const PEDACO_GRAVACAO = 8 * 1024 * 1024;

export class TauriPlatform {
    /**
     * Abre um destino para gravar o arquivo aos poucos (ver BrowserPlatform.abrirDestino).
     * Cada escrita é anexada ao arquivo escolhido; o primeiro pedaço cria/trunca o arquivo.
     * @param {string} nomeArquivo
     * @param {string} mimeType
     * @param {{ emMemoria?: boolean }} [opcoes] só usado no fallback web: aqui a gravação já
     *        é direta no disco, sem temporário
     */
    async abrirDestino(nomeArquivo, mimeType, opcoes = {}) {
        let savePath;
        try {
            savePath = await this.#escolherCaminho(nomeArquivo);
        } catch (err) {
            console.error('Erro ao abrir o diálogo de salvar no Desktop, usando fallback web:', err);
            return new BrowserPlatform().abrirDestino(nomeArquivo, mimeType, opcoes);
        }
        if (!savePath) {
            console.log('❌ Salvamento cancelado pelo usuário.');
            return null;
        }
        const { core } = window.__TAURI__;
        const codificador = new TextEncoder();
        let primeiro = true;
        const gravar = async (bytes) => {
            await core.invoke('plugin:fs|write_file', bytes, {
                headers: {
                    path: encodeURIComponent(savePath),
                    options: JSON.stringify(primeiro ? undefined : { append: true })
                }
            });
            primeiro = false;
        };
        return {
            // Blob grande (ex.: os primeiros 128 MB juntos) vai em pedaços, sem ser lido inteiro
            escrever: async (dados) => {
                if (typeof dados === 'string') return gravar(codificador.encode(dados));
                for (let pos = 0; pos < dados.size; pos += PEDACO_GRAVACAO) {
                    await gravar(new Uint8Array(await dados.slice(pos, pos + PEDACO_GRAVACAO).arrayBuffer()));
                }
            },
            fechar: async () => {
                if (primeiro) await gravar(new Uint8Array(0));
                console.log(`✅ Arquivo salvo nativamente em: ${savePath}`);
                return { baixadoEmDownloads: false };
            },
            // O arquivo parcial fica no disco; o chamador avisa o usuário do erro
            abortar: async () => {},
        };
    }

    async #escolherCaminho(nomeArquivo) {
        const { core } = window.__TAURI__;
        const ext = nomeArquivo.split('.').pop();
        return core.invoke('plugin:dialog|save', {
            options: {
                title: 'Salvar Arquivo',
                defaultPath: nomeArquivo,
                filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
            }
        });
    }

    /**
     * @param {string} nomeArquivo
     * @param {Blob} blob
     * @param {{ onProgress?: (gravado: number, total: number) => void }} [opcoes]
     */
    async salvarArquivo(nomeArquivo, blob, { onProgress } = {}) {
        try {
            const { core } = window.__TAURI__;
            const savePath = await this.#escolherCaminho(nomeArquivo);
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
                `Será usado o salvamento do navegador como alternativa.\n\n` +
                `Detalhe técnico: ${err && err.message ? err.message : err}`
            );
            return new BrowserPlatform().salvarArquivo(nomeArquivo, blob);
        }
    }
}
