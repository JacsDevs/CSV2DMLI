export class BrowserPlatform {
    /**
     * Salva o Blob em um local escolhido pelo usuário. Em navegadores com a File
     * System Access API (Chrome/Edge) abre o diálogo "Salvar como" e grava em
     * streaming; nos demais (ou se o diálogo não puder ser aberto) cai no
     * download padrão do navegador.
     * @param {string} nomeArquivo
     * @param {Blob} blob
     * @param {{ onProgress?: (gravado: number, total: number) => void }} [opcoes]
     * @returns {Promise<boolean>} false se o usuário cancelou o diálogo
     */
    async salvarArquivo(nomeArquivo, blob, { onProgress } = {}) {
        if (typeof window.showSaveFilePicker === 'function') {
            let handle;
            try {
                const ext = nomeArquivo.includes('.') ? nomeArquivo.split('.').pop() : '';
                handle = await window.showSaveFilePicker({
                    suggestedName: nomeArquivo,
                    types: ext ? [{
                        description: ext.toUpperCase(),
                        accept: { [blob.type || 'application/octet-stream']: [`.${ext}`] },
                    }] : undefined,
                });
            } catch (err) {
                if (err && err.name === 'AbortError') {
                    console.log('❌ Salvamento cancelado pelo usuário.');
                    return false;
                }
                // Ex.: SecurityError quando o clique do usuário já "expirou"
                // (operação assíncrona longa antes da chamada) — usa o download.
                console.warn('Diálogo "Salvar como" indisponível, usando download padrão:', err);
                handle = null;
            }
            if (handle) {
                await this.#gravarEmStreaming(handle, blob, onProgress);
                console.log(`✅ Arquivo salvo (Modo Web): ${handle.name}`);
                return true;
            }
        }
        return this.#baixar(nomeArquivo, blob, onProgress);
    }

    // Grava o Blob no arquivo escolhido sem materializá-lo inteiro na memória
    async #gravarEmStreaming(handle, blob, onProgress) {
        const writable = await handle.createWritable();
        const total = blob.size;
        let gravado = 0;
        const contador = new TransformStream({
            transform(pedaco, controller) {
                gravado += pedaco.byteLength;
                if (onProgress) onProgress(gravado, total);
                controller.enqueue(pedaco);
            },
        });
        // pipeTo fecha o writable ao final (ou aborta em caso de erro)
        await blob.stream().pipeThrough(contador).pipeTo(writable);
        if (onProgress) onProgress(total, total);
    }

    /**
     * Download pelo mecanismo padrão do navegador. O Blob não é lido pelo
     * JavaScript: o navegador transmite o conteúdo (inclusive Blobs compostos
     * por partes/arquivos em disco) direto para o download.
     */
    #baixar(nomeArquivo, blob, onProgress) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Revogar só depois de um tempo: arquivos grandes podem ter o download
        // interrompido se a URL for revogada logo após o clique.
        setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
        if (onProgress) onProgress(blob.size, blob.size);
        console.log(`✅ Arquivo baixado (Modo Web): ${nomeArquivo}`);
        return true;
    }
}
