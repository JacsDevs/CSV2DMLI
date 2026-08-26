import ExportadorHtmlCards from './exportadorHtmlCards.js';
import ExportadorTypst from './exportadorTypst.js';
import ExportadorLatex from './exportadorLatex.js';
import ExportadorZip from './exportadorZip.js';
import CompiladorPdf from '../pdf/compiladorPdf.js';
import { platform } from '../platform/index.js';

export default class ModuloExportacao {
    constructor(gerenciadorDados) {
        this.gerenciador = gerenciadorDados;
        this.exportadorCards = new ExportadorHtmlCards(this.gerenciador);
        this.exportadorTypstModule = new ExportadorTypst(this.gerenciador);
        this.exportadorLatexModule = new ExportadorLatex(this.gerenciador);
        this.exportadorZipModule = new ExportadorZip(this.gerenciador);
        this.compiladorPdf = new CompiladorPdf(this.gerenciador);
        console.log('📤 Módulo de Exportação inicializado.');
    }

    async inicializar() {
        await Promise.all([
            this.exportadorCards.carregarTemplates(),
            this.exportadorTypstModule.carregarTemplates(),
            this.exportadorLatexModule.carregarTemplates()
        ]);
        console.log('✅ Templates de exportação carregados.');
    }

    async exportarHtmlCards(opcoes = {}) {
        return await this.exportadorCards.exportar(opcoes);
    }

    exportarTypst(opcoes = {}) {
        return this.exportadorTypstModule.exportar(opcoes);
    }

    async exportarLatexZip(opcoes = {}, nomeArquivo = 'dicionario_latex.zip') {
        const resultado = this.exportadorLatexModule.exportar(opcoes);
        
        // Precisamos do JSZip
        if (!window.JSZip) {
            throw new Error('JSZip não carregado.');
        }
        
        const zip = new window.JSZip();
        zip.file("main.tex", resultado.latex);
        
        if (resultado.imagens.length > 0) {
            const imgFolder = zip.folder("images");
            for (const img of resultado.imagens) {
                try {
                    // Tenta buscar o arquivo original via fetch para pegar os bytes
                    const res = await fetch(img.original);
                    if (res.ok) {
                        const blob = await res.blob();
                        const nomeArquivo = img.local.split('/').pop();
                        imgFolder.file(nomeArquivo, blob);
                    }
                } catch (e) {
                    console.warn('Erro ao embutir imagem no ZIP LaTeX:', img.original, e);
                }
            }
        }
        
        const zipBlob = await zip.generateAsync({ type: "blob" });
        await this.salvarArquivoBlob(zipBlob, nomeArquivo);
    }

    async exportarPdf(opcoes = {}, nomeArquivo = 'dicionario.pdf') {
        const pdfBlob = await this.gerarPdfBlob(opcoes);
        await this.salvarArquivoBlob(pdfBlob, nomeArquivo);
    }

    async gerarPdfBlob(opcoes = {}) {
        const codigoTypst = this.exportarTypst(opcoes);
        return await this.compiladorPdf.gerarPdf(codigoTypst);
    }

    async exportarZip(nomeArquivo) {
        const zipBlob = await this.exportadorZipModule.exportar();
        await this.salvarArquivoBlob(zipBlob, nomeArquivo);
    }

    salvarArquivo(conteudo, nomeArquivo, mimeType = 'text/html;charset=utf-8') {
        const blob = new Blob([conteudo], { type: mimeType });
        return this.salvarArquivoBlob(blob, nomeArquivo);
    }

    async salvarArquivoBlob(blob, nomeArquivo) {
        return platform.salvarArquivo(nomeArquivo, blob);
    }
}
