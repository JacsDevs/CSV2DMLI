export class BrowserPlatform {
    /**
     * Baixa o Blob pelo mecanismo padrão do navegador. O Blob não é lido pelo
     * JavaScript: o navegador transmite o conteúdo (inclusive Blobs compostos
     * por partes/arquivos em disco) direto para o download.
     * @param {string} nomeArquivo
     * @param {Blob} blob
     * @param {{ onProgress?: (gravado: number, total: number) => void }} [opcoes]
     */
    async salvarArquivo(nomeArquivo, blob, { onProgress } = {}) {
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
