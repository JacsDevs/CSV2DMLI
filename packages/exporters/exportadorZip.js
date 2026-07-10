class ExportadorZip {
    constructor(gerenciadorDados) {
        this.db = gerenciadorDados;
    }

    async exportar() {
        if (typeof JSZip === 'undefined') {
            throw new Error('Biblioteca JSZip não está disponível. Por favor, inclua-a no HTML.');
        }
        
        const zip = new JSZip();

        // 1. Exportar e anexar o CSV Base
        const csvContent = await this.db.exportar('csv');
        if (csvContent) {
            zip.file('dicionario.csv', csvContent);
        }

        // 2. Exportar e anexar o Projeto (Para retomar edição depois)
        const projetoJson = await this.db.exportar('projeto');
        if (projetoJson) {
            zip.file('projeto.json', projetoJson);
        }

        // 3. Empacotar todas as mídias mantendo a estrutura de pastas
        if (this.db.vfs) {
            const tipos = ['audio', 'imagem', 'video'];
            
            for (const tipo of tipos) {
                const arquivos = this.db.vfs.obterTodosArquivos(tipo);
                const nomes = this.db.vfs.obterTodosNomes(tipo);
                const dirName = tipo === 'imagem' ? 'foto' : tipo;
                
                for (let i = 0; i < arquivos.length; i++) {
                    zip.file(`${dirName}/${nomes[i]}`, arquivos[i]);
                }
            }
        }
        return await zip.generateAsync({ type: 'blob' });
    }
}
export default ExportadorZip;