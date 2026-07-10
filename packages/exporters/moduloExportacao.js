import ExportadorHtmlCards from './exportadorHtmlCards.js';
import ExportadorHtmlLinear from './exportadorHtmlLinear.js';
import ExportadorTypst from './exportadorTypst.js';
import ExportadorZip from './exportadorZip.js';
import CompiladorPdf from '../pdf/compiladorPdf.js';
import { platform } from '../platform/index.js';

export default class ModuloExportacao {
    constructor(gerenciadorDados) {
        this.gerenciador = gerenciadorDados;
        this.exportadorCards = new ExportadorHtmlCards(this.gerenciador);
        this.exportadorLinear = new ExportadorHtmlLinear(this.gerenciador);
        this.exportadorTypstModule = new ExportadorTypst(this.gerenciador);
        this.exportadorZipModule = new ExportadorZip(this.gerenciador);
        this.compiladorPdf = new CompiladorPdf(this.gerenciador);
        console.log('📤 Módulo de Exportação inicializado.');
    }

    async inicializar() {
        await Promise.all([
            this.exportadorCards.carregarTemplates(),
            this.exportadorLinear.carregarTemplates(),
            this.exportadorTypstModule.carregarTemplates()
        ]);
        console.log('✅ Templates de exportação carregados.');
    }

    async exportarHtmlCards(opcoes = {}) {
        return await this.exportadorCards.exportar(opcoes);
    }

    async exportarHtmlLinear(opcoes = {}) {
        return await this.exportadorLinear.exportar(opcoes);
    }

    exportarTypst(opcoes = {}) {
        return this.exportadorTypstModule.exportar(opcoes);
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
