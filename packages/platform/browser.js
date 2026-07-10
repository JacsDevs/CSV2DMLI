export class BrowserPlatform {
    async salvarArquivo(nomeArquivo, blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`✅ Arquivo baixado (Modo Web): ${nomeArquivo}`);
        return true;
    }
}
