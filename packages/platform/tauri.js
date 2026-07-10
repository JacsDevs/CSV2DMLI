import { BrowserPlatform } from './browser.js';

export class TauriPlatform {
    async salvarArquivo(nomeArquivo, blob) {
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
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            // Tauri v2: payload binário + path pelo header evita congelamento da UI
            await core.invoke('plugin:fs|write_file', uint8Array, {
                headers: { 'Tauri-Fs-Path': savePath }
            });
            console.log(`✅ Arquivo salvo nativamente em: ${savePath}`);
            return true;
        } catch (err) {
            console.error('Erro ao salvar no Desktop, usando fallback web:', err);
            return new BrowserPlatform().salvarArquivo(nomeArquivo, blob);
        }
    }
}
