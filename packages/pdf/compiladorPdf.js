import { sanearBibParaTypst } from '../core/bibliografiaAbnt.js';
import { logoCapaPdf } from '../exporters/exportadorTypst.js';

/**
 * Encapsula a lógica de compilação do Typst via WebAssembly (WASM).
 * Permite geração de PDF 100% offline no navegador.
 */
export default class CompiladorPdf {
    constructor(gerenciadorDados) {
        this.gerenciador = gerenciadorDados;
        this.inicializado = false;
        this.recursosEstaticosInjetados = false;
        this.typstModule = null;
        // Resolve a raiz do projeto a partir da localização deste módulo
        // (em vez de caminhos absolutos "/..."), para funcionar tanto em
        // localhost quanto em subpastas como o GitHub Pages (ex: /CSV2DMLI/).
        this.baseUrl = new URL('../../', import.meta.url);
    }

    _resolverCaminho(caminhoRelativo) {
        return new URL(caminhoRelativo, this.baseUrl).href;
    }

    async inicializar() {
        if (this.inicializado) return;
        
        try {
            console.log('⏳ Inicializando motor Typst WASM...');
            
            // 1. Importa o wrapper dinamicamente
            let $typst, loadFonts;
            try {
                const module = await import(this._resolverCaminho('assets/typst/typst_wrapper.js'));
                $typst = module.$typst;
                loadFonts = module.loadFonts;
            } catch (err) {
                throw new Error(_t('Arquivo Javascript (typst_wrapper.js) ausente. Verifique se ele está na pasta assets/typst/.'));
            }

            // 2. Fontes locais: o Typst só enxerga fontes registradas na criação do
            // compilador (arquivos no VFS não contam). `assets: false` impede o wrapper
            // de baixar as fontes padrão da CDN, o que quebraria a geração offline.
            const fontes = await this._carregarFontesLocais();

            // 3. Inicializa os WASMs apontando para os binários locais
            await $typst.setCompilerInitOptions({
                getModule: () => this._resolverCaminho('assets/typst/typst_compiler.wasm'),
                beforeBuild: [loadFonts(fontes, { assets: false })]
            });
            
            this.typstModule = $typst;
            
            this.inicializado = true;
            console.log('✅ Motor Typst WASM inicializado com sucesso.');
        } catch (erro) {
            console.error('❌ Erro ao inicializar compilador PDF:', erro);
            throw new Error(_t('Falha ao inicializar o motor de PDF. Verifique os caminhos dos arquivos WASM.'));
        }
    }

    async _carregarFontesLocais() {
        const nomes = ['Charis-Regular.ttf', 'Charis-Bold.ttf', 'Charis-Italic.ttf', 'Charis-BoldItalic.ttf'];
        const fontes = [];
        for (const fonte of nomes) {
            try {
                const res = await fetch(this._resolverCaminho(`assets/typst/fonts/${fonte}`));
                if (res.ok) {
                    fontes.push(new Uint8Array(await res.arrayBuffer()));
                } else {
                    console.warn(`⚠️ Fonte local não encontrada no caminho: assets/typst/fonts/${fonte}`);
                }
            } catch (e) {
                console.warn(`⚠️ Erro ao carregar a fonte ${fonte}:`, e);
            }
        }
        // Sem nenhuma fonte o PDF sairia sem texto visível
        if (fontes.length === 0) {
            throw new Error('Nenhuma fonte encontrada em assets/typst/fonts/');
        }
        return fontes;
    }

    async _injetarRecursosTypst(opcoes = {}) {
        console.log('⏳ Preparando ambiente (Fontes e Dependências)...');

        // 1. Carrega o plugin binário do cmarker
        try {
            const resPlugin = await fetch(this._resolverCaminho('assets/typst/plugin.wasm'));
            if (resPlugin.ok) {
                const buffer = await resPlugin.arrayBuffer();
                const uint8 = new Uint8Array(buffer);
                if (typeof this.typstModule.mapShadow === 'function') {
                    await this.typstModule.mapShadow("/plugin.wasm", uint8);
                } else if (typeof this.typstModule.addAsset === 'function') {
                    await this.typstModule.addAsset("/plugin.wasm", uint8);
                } else {
                    await this.typstModule.addMemoryFile("/plugin.wasm", uint8);
                }
            }
        } catch (e) {
            console.warn(`⚠️ Plugin WASM não encontrado.`);
        }

        // 3. Carrega os pacotes exigidos (.typ)
        const dependencias = ['in-dexter.typ', 'cmarker.typ'];
        for (const dep of dependencias) {
            try {
                const res = await fetch(this._resolverCaminho(`config/typst-deps/${dep}`));
                if (res.ok) {
                    let conteudo = await res.text();
                    
                    // Aponta a URL do plugin embutido pelo cmarker para o ambiente virtual correto
                    if (dep === 'cmarker.typ') {
                        conteudo = conteudo.replace(/plugin\("\.\/plugin\.wasm"\)/g, 'plugin("/plugin.wasm")');
                    }
                    
                    if (typeof this.typstModule.addSource === 'function') {
                        await this.typstModule.addSource(`/${dep}`, conteudo);
                    } else {
                        this.typstModule.addMemoryFile(`/${dep}`, conteudo);
                    }
                }
            } catch (e) {
                console.warn(`⚠️ Dependência Typst não encontrada: ${dep}`);
            }
        }

        // 3.1. Carrega estilo CSL para bibliografia ABNT
        try {
            const resCsl = await fetch(this._resolverCaminho('config/typst-deps/abnt-6023.csl'));
            if (resCsl.ok) {
                const bufferCsl = await resCsl.arrayBuffer();
                const uint8Csl = new Uint8Array(bufferCsl);
                if (typeof this.typstModule.mapShadow === 'function') {
                    await this.typstModule.mapShadow('/abnt-6023.csl', uint8Csl);
                } else {
                    this.typstModule.addMemoryFile('/abnt-6023.csl', uint8Csl);
                }
            }
        } catch (e) {
            console.warn('⚠️ Estilo CSL ABNT não encontrado:', e);
        }

        // 3.2. Injeta bibliografia .bib na memória virtual (ou remove se não houver)
        const conteudoBib = (opcoes && opcoes.metadados && opcoes.metadados.bibliografiaBib)
                         || (opcoes && opcoes.bibliografiaBib)
                         || (this.gerenciador && this.gerenciador.bibliografiaBib);
        if (conteudoBib) {
            try {
                const uint8Bib = new TextEncoder().encode(sanearBibParaTypst(conteudoBib));
                if (typeof this.typstModule.mapShadow === 'function') {
                    await this.typstModule.mapShadow('/bibliografia.bib', uint8Bib);
                } else {
                    this.typstModule.addMemoryFile('/bibliografia.bib', uint8Bib);
                }
                console.log(`✅ Arquivo /bibliografia.bib injetado na memória do Typst (${uint8Bib.length} bytes).`);
            } catch (e) {
                console.warn('⚠️ Erro ao injetar /bibliografia.bib:', e);
            }
        } else if (this.typstModule && typeof this.typstModule.unmapShadow === 'function') {
            try {
                await this.typstModule.unmapShadow('/bibliografia.bib');
            } catch (_) {
                // Ignora caso não estivesse mapeado
            }
        }

        // 3.3. Logo do projeto para a capa (mesmo caminho que o ExportadorTypst põe no template)
        const logo = logoCapaPdf(this.gerenciador);
        if (logo) {
            try {
                await this.typstModule.mapShadow(logo.caminho, logo.bytes);
            } catch (e) {
                console.warn('⚠️ Erro ao injetar o logo da capa:', e);
            }
        }

        // 4. Injetar imagens do Sistema de Arquivos Virtual na memória do compilador
        const imagens = this.gerenciador.vfs.imagem;
        if (imagens && imagens.size > 0) {
            for (const [caminhoOriginal, file] of imagens.entries()) {
                try {
                    const nomeArquivo = caminhoOriginal.split('/').pop().split('\\').pop();
                    const buffer = await file.arrayBuffer();
                    const uint8 = new Uint8Array(buffer);
                    const caminhoVirtual = `/foto/${nomeArquivo}`;
                    
                    console.log(`[WASM INJECT] Injetando arquivo: ${caminhoVirtual} (${uint8.length} bytes)`);
                    
                    if (typeof this.typstModule.mapShadow === 'function') {
                        await this.typstModule.mapShadow(caminhoVirtual, uint8);
                    } else if (typeof this.typstModule.addAsset === 'function') {
                        await this.typstModule.addAsset(caminhoVirtual, uint8);
                    } else {
                        await this.typstModule.addMemoryFile(caminhoVirtual, uint8);
                    }
                } catch (e) {
                    console.warn(`⚠️ Erro ao injetar imagem ${caminhoOriginal}:`, e);
                }
            }
            console.log(`✅ ${imagens.size} imagens injetadas na memória do compilador.`);
        }
    }

    async gerarPdf(codigoTypst, opcoes = {}) {
        if (!this.inicializado) await this.inicializar();
        
        // Proteção contra templates antigos no cache (corrige erro 'unexpected argument: keep-together')
        codigoTypst = codigoTypst.replace(/#box\(\s*keep-together:\s*true\s*\)\s*\[/g, '#block(breakable: false)[');

        // Preenche a memória virtual do Typst com fontes e imagens antes de compilar
        await this._injetarRecursosTypst(opcoes);

        console.log('⏳ Compilando documento PDF...');
        
        // Adiciona o código principal gerado pelo ExportadorTypst
        if (typeof this.typstModule.addSource === 'function') {
            await this.typstModule.addSource('/main.typ', codigoTypst);
        } else {
            this.typstModule.addMemoryFile('/main.typ', codigoTypst);
        }

        try {
            const pdfDados = await this.typstModule.pdf({ mainFilePath: '/main.typ' });
            return new Blob([pdfDados], { type: 'application/pdf' });
        } catch (erro) {
            console.error("Erro profundo na compilação do Typst:", erro);
            throw new Error(_t('O compilador Typst falhou: {erro}', { erro: erro.message || erro }));
        }
    }
}