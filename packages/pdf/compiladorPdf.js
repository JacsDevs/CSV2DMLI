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
    }

    async inicializar() {
        if (this.inicializado) return;
        
        try {
            console.log('⏳ Inicializando motor Typst WASM...');
            
            // 1. Importa o wrapper dinamicamente
            let $typst;
            try {
                const module = await import('/assets/typst/typst_wrapper.js');
                $typst = module.$typst;
            } catch (err) {
                throw new Error('Arquivo Javascript (typst_wrapper.js) ausente. Verifique se ele está na pasta assets/typst/.');
            }
            
            // 2. Inicializa os WASMs apontando para os binários locais
            await $typst.setCompilerInitOptions({
                getModule: () => '/assets/typst/typst_compiler.wasm'
            });
            
            this.typstModule = $typst;
            
            this.inicializado = true;
            console.log('✅ Motor Typst WASM inicializado com sucesso.');
        } catch (erro) {
            console.error('❌ Erro ao inicializar compilador PDF:', erro);
            throw new Error('Falha ao inicializar o motor de PDF. Verifique os caminhos dos arquivos WASM.');
        }
    }

    async _injetarRecursosTypst() {
        console.log('⏳ Preparando ambiente (Fontes e Dependências)...');
        
        // 1. Carregar Fontes Locais
        const fontes = ['Charis-Regular.ttf', 'Charis-Bold.ttf', 'Charis-Italic.ttf', 'Charis-BoldItalic.ttf'];
        for (const fonte of fontes) {
            try {
                const res = await fetch(`/assets/typst/fonts/${fonte}`);
                if (res.ok) {
                    const buffer = await res.arrayBuffer();
                    const uint8 = new Uint8Array(buffer);
                    if (typeof this.typstModule.mapShadow === 'function') {
                        await this.typstModule.mapShadow(`/${fonte}`, uint8);
                    } else if (typeof this.typstModule.addAsset === 'function') {
                        await this.typstModule.addAsset(`/${fonte}`, uint8);
                    } else {
                        await this.typstModule.addMemoryFile(`/${fonte}`, uint8);
                    }
                } else {
                    console.warn(`⚠️ Fonte local não encontrada no caminho: assets/typst/fonts/${fonte}`);
                }
            } catch (e) {
                console.warn(`⚠️ Erro ao carregar a fonte ${fonte}:`, e);
            }
        }

        // 2. Carrega o plugin binário do cmarker
        try {
            const resPlugin = await fetch(`/assets/typst/plugin.wasm`);
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
                const res = await fetch(`/config/typst-deps/${dep}`);
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

    async gerarPdf(codigoTypst) {
        if (!this.inicializado) await this.inicializar();
        
        // Proteção contra templates antigos no cache (corrige erro 'unexpected argument: keep-together')
        codigoTypst = codigoTypst.replace(/#box\(\s*keep-together:\s*true\s*\)\s*\[/g, '#block(breakable: false)[');

        // Preenche a memória virtual do Typst com fontes e imagens antes de compilar
        await this._injetarRecursosTypst();

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
            throw new Error(`O compilador Typst falhou: ${erro.message || erro}`);
        }
    }
}