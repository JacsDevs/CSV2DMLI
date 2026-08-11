import SistemaArquivosVirtual from './sistemaArquivosVirtual.js';
import CarregadorCsv from './carregadorCsv.js';
import ConstrutorBancoDados from './construtorBancoDados.js';
import { buscaFuzzy } from './helpers.js';

/**
 * Gerencia o carregamento e o armazenamento de todos os dados da aplicação,
 * orquestrando os componentes do núcleo conforme a arquitetura modular.
 */
export default class GerenciadorDados {
    constructor(configurador) {
        if (!configurador) {
            throw new Error("GerenciadorDados requer uma instância de Configurador válida.");
        }
        this.configurador = configurador;

        // Instancia os componentes do núcleo
        this.vfs = new SistemaArquivosVirtual(this.configurador);
        this.carregadorCsv = new CarregadorCsv();
        this.construtorDB = new ConstrutorBancoDados(this.vfs, this.configurador);

        this.dadosPlanilha = [];
        this.colunasPlanilha = [];
        this._bancoConstruido = null;
        
        // Propriedades extras legadas/customizadas (vindos de arquivos de texto separados)
        this.introHtml = '';
        this.introPdf = '';
        this.referencia = '';
        this.alfabetoCustomizado = '';
        this.configuracaoTextoLocal = {};
        this.icone = { dataUrl: null, bytes: null, nome: null };
        
        // Opções
        this.silenciarAvisosMidia = false;

        console.log('🗃️ Gerenciador de Dados inicializado (Arquitetura Modular).');
    }

    async inicializar() {
        await this.vfs.carregarDoBanco();
        await this.carregadorCsv.init();
        // Futuramente, pode carregar dados do cache aqui
    }

    get bancoDados() {
        return this._bancoConstruido;
    }

    /**
     * Carrega e processa o arquivo CSV da planilha.
     * @param {File} arquivo - O arquivo .csv a ser processado.
     * @returns {Promise<void>}
     */
    async carregarPlanilha(arquivo) {
        console.log(`📄 Processando planilha via CarregadorCsv: ${arquivo.name}`);
        const resultado = await this.carregadorCsv.processarCSV(arquivo);
        
        // Normaliza os dados crus (flat) para o formato aninhado do Editor
        this.dadosPlanilha = resultado.dados.map((linhaMesclada, index) => {
            const imagens = [];
            if (linhaMesclada.IMAGEM || linhaMesclada.LEGENDA_IMAGEM) {
                const imgsRaw = (linhaMesclada.IMAGEM || '').split('|').map(v=>v.trim());
                const legsRaw = (linhaMesclada.LEGENDA_IMAGEM || '').split('|').map(v=>v.trim());
                const maxLen = Math.max(imgsRaw.length, legsRaw.length);
                for(let i = 0; i < maxLen; i++) {
                    if (imgsRaw[i] || legsRaw[i]) {
                        imagens.push({
                            img: imgsRaw[i] ? imgsRaw[i].split('/').pop().split('\\').pop() : '',
                            leg: legsRaw[i] || ''
                        });
                    }
                }
            }
            for(let i=1; i<=10; i++) {
                if (linhaMesclada[`IMAGEM_${i}`] || linhaMesclada[`LEGENDA_${i}`]) {
                    const imgRaw = linhaMesclada[`IMAGEM_${i}`] || '';
                    imagens.push({
                        img: imgRaw ? imgRaw.split('/').pop().split('\\').pop() : '',
                        leg: linhaMesclada[`LEGENDA_${i}`] || ''
                    });
                }
            }
            
            const exemplos = [];
            if (linhaMesclada.ARQUIVO_SONORO_EXEMPLO || linhaMesclada.TRANSCRICAO_EXEMPLO || linhaMesclada.TRADUCAO_EXEMPLO) {
                const exAudioRaw = (linhaMesclada.ARQUIVO_SONORO_EXEMPLO || '').split('|').map(v=>v.trim());
                const exTransRaw = (linhaMesclada.TRANSCRICAO_EXEMPLO || '').split('|').map(v=>v.trim());
                const exTradRaw = (linhaMesclada.TRADUCAO_EXEMPLO || '').split('|').map(v=>v.trim());
                const maxLen = Math.max(exAudioRaw.length, exTransRaw.length, exTradRaw.length);
                for(let i = 0; i < maxLen; i++) {
                    if (exAudioRaw[i] || exTransRaw[i] || exTradRaw[i]) {
                        exemplos.push({
                            audio: exAudioRaw[i] || '',
                            trans: exTransRaw[i] || '',
                            trad: exTradRaw[i] || ''
                        });
                    }
                }
            }
            for(let i=1; i<=10; i++) {
                if (linhaMesclada[`EX_${i}_TRANS`] || linhaMesclada[`EX_${i}_TRAD`] || linhaMesclada[`EX_${i}_AUDIO`]) {
                    exemplos.push({
                        audio: linhaMesclada[`EX_${i}_AUDIO`] || '',
                        trans: linhaMesclada[`EX_${i}_TRANS`] || '',
                        trad: linhaMesclada[`EX_${i}_TRAD`] || ''
                    });
                }
            }
            
            const variacoes = [];
            // Verifica o formato com pipe
            if (linhaMesclada.ITEM_LEXICAL && linhaMesclada.ITEM_LEXICAL.includes('|')) {
                const vi = (linhaMesclada.ITEM_LEXICAL || '').split('|').map(v=>v.trim());
                const va = (linhaMesclada.ARQUIVO_SONORO || '').split('|').map(v=>v.trim());
                const vf = (linhaMesclada.TRANSCRICAO_FONEMICA || '').split('|').map(v=>v.trim());
                const vt = (linhaMesclada.TRANSCRICAO_FONETICA || '').split('|').map(v=>v.trim());
                const lenV = Math.max(vi.length, va.length, vf.length, vt.length);
                for (let i = 0; i < lenV; i++) {
                    variacoes.push({ item: vi[i] || '', audio: va[i] || '', fone: vf[i] || '', fonet: vt[i] || '' });
                }
            } else {
                // Formato de colunas (VAR_1_ITEM) ou item unico
                variacoes.push({
                    item: linhaMesclada.ITEM_LEXICAL || '',
                    audio: linhaMesclada.ARQUIVO_SONORO || '',
                    fone: linhaMesclada.TRANSCRICAO_FONEMICA || '',
                    fonet: linhaMesclada.TRANSCRICAO_FONETICA || ''
                });
                for(let i=1; i<=10; i++) {
                    if (linhaMesclada[`VAR_${i}_ITEM`] || linhaMesclada[`VAR_${i}_AUDIO`] || linhaMesclada[`VAR_${i}_FONE`] || linhaMesclada[`VAR_${i}_FONET`]) {
                        variacoes.push({
                            item: linhaMesclada[`VAR_${i}_ITEM`] || '',
                            audio: linhaMesclada[`VAR_${i}_AUDIO`] || '',
                            fone: linhaMesclada[`VAR_${i}_FONE`] || '',
                            fonet: linhaMesclada[`VAR_${i}_FONET`] || ''
                        });
                    }
                }
            }
            
            // Remove variações vazias
            const variacoesFiltradas = variacoes.filter(v => v.item || v.audio || v.fone || v.fonet);

            return {
                indice: index,
                camposBasicos: {
                    CLASSE_GRAMATICAL: linhaMesclada.CLASSE_GRAMATICAL || '',
                    CAMPO_SEMANTICO: linhaMesclada.CAMPO_SEMANTICO || '',
                    SUB_CAMPO_SEMANTICO: linhaMesclada.SUB_CAMPO_SEMANTICO || '',
                    TEXTO: linhaMesclada.TEXTO || '',
                    TITULO_TEXTO: linhaMesclada.TITULO_TEXTO || '',
                    TRADUCAO_SIGNIFICADO: linhaMesclada.TRADUCAO_SIGNIFICADO || '',
                    ITENS_RELACIONADOS: linhaMesclada.ITENS_RELACIONADOS || '',
                    DESCRICAO: linhaMesclada.DESCRICAO || '',
                    ARQUIVO_VIDEO: linhaMesclada.ARQUIVO_VIDEO || ''
                },
                variacoes: variacoesFiltradas,
                exemplos,
                imagens
            };
            
            const colunasConhecidas = [
                'CLASSE_GRAMATICAL', 'CAMPO_SEMANTICO', 'SUB_CAMPO_SEMANTICO', 
                'TEXTO', 'TITULO_TEXTO', 'TRADUCAO_SIGNIFICADO', 'ITENS_RELACIONADOS', 
                'DESCRICAO', 'ARQUIVO_VIDEO', 'ITEM_LEXICAL', 'ARQUIVO_SONORO', 
                'TRANSCRICAO_FONEMICA', 'TRANSCRICAO_FONETICA', 'ARQUIVO_SONORO_EXEMPLO', 
                'TRANSCRICAO_EXEMPLO', 'TRADUCAO_EXEMPLO', 'IMAGEM', 'LEGENDA_IMAGEM'
            ];
            const extras = [];
            Object.keys(linhaMesclada).forEach(col => {
                if (col.startsWith('#')) return;
                if (colunasConhecidas.includes(col)) return;
                if (col.match(/^VAR_\d+/)) return;
                if (col.match(/^EX_\d+/)) return;
                if (col.match(/^IMAGEM_\d+/)) return;
                if (col.match(/^LEGENDA_\d+/)) return;
                
                const val = linhaMesclada[col];
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                    extras.push({ chave: col, valor: String(val).trim() });
                }
            });
            linhaNormalizada.extras = extras;

            return linhaNormalizada;
        });

        this.colunasPlanilha = resultado.colunas;
        
        console.log(`✅ Planilha carregada e normalizada: ${this.dadosPlanilha.length} linhas.`);
        this._reconstruirBanco();
    }

    /**
     * Carrega o arquivo JSON de textos e o transforma em um mapa para acesso rápido.
     * @param {File} arquivo - O arquivo textos.json.
     * @returns {Promise<void>}
     */
    carregarTextos(arquivo) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    this.adicionarTextosEstruturados(json);
                    resolve();
                } catch (err) {
                    console.error(`❌ Erro no formato do textos.json: ${err.message}`);
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsText(arquivo);
        });
    }

    /**
     * Processa os textos estruturados do JSON e os envia ao Sistema de Arquivos Virtual.
     * É chamada tanto por carregarTextos() avulso quanto pelo CarregadorPasta.
     * @param {object} json - O conteúdo parseado do arquivo textos.json
     */
    adicionarTextosEstruturados(json) {
        const textosMap = {};
        const textosArray = json.textos || (Array.isArray(json) ? json : Object.values(json));

        // Mapeia os textos pela chave 'titulo_base' para busca rápida O(1)
        if (Array.isArray(textosArray)) {
            textosArray.forEach(texto => {
                if (texto.titulo_base) {
                    textosMap[texto.titulo_base] = texto;
                }
            });
        } else {
            Object.assign(textosMap, textosArray);
        }

        // Envia para a memória do VFS
        if (typeof this.vfs.adicionarTextosEstruturados === 'function') {
            this.vfs.adicionarTextosEstruturados(textosMap);
        } else {
            this.vfs.textos = textosMap;
        }
        
        console.log(`📝 ${Object.keys(textosMap).length} textos estruturados mapeados e enviados ao VFS.`);
        this._reconstruirBanco();
    }

    /**
     * Adiciona arquivos de mídia (áudio, imagem, vídeo) ao sistema.
     * @param {FileList} arquivos - A lista de arquivos a serem adicionados.
     */
    adicionarMidias(arquivos) {
        console.log(`🖼️ Adicionando ${arquivos.length} arquivos de mídia...`);
        if (!arquivos || arquivos.length === 0) return;

        Array.from(arquivos).forEach(arquivo => {
            const tipo = arquivo.type;
            if (tipo.startsWith('audio/')) {
                this.vfs.adicionarArquivos('audio', [arquivo]);
            } else if (tipo.startsWith('image/')) {
                this.vfs.adicionarArquivos('imagem', [arquivo]);
            } else if (tipo.startsWith('video/')) {
                this.vfs.adicionarArquivos('video', [arquivo]);
            }
        });
        
        this._reconstruirBanco();
    }

    setIntroHtml(conteudo) { this.introHtml = conteudo; }
    setIntroPdf(conteudo) { this.introPdf = conteudo; }
    setReferencia(conteudo) { this.referencia = conteudo; }
    setAlfabetoCustomizado(conteudo) { this.alfabetoCustomizado = conteudo; }
    setConfiguracaoTextoLocal(config) { this.configuracaoTextoLocal = config; }
    setMetadados(metadados) {
        if(this.configurador && this.configurador.mesclarConfigLocal) {
            this.configurador.mesclarConfigLocal({ metadados });
        }
    }

    /**
     * Define o ícone do aplicativo/site a partir de um arquivo de imagem.
     * @param {File} arquivo - Imagem do ícone (ex: icone.png).
     */
    async setIcone(arquivo) {
        const dataUrl = await this._lerArquivoComoDataURL(arquivo);
        const buf = await arquivo.arrayBuffer();
        this.icone = { dataUrl, bytes: Array.from(new Uint8Array(buf)), nome: arquivo.name };
    }

    removerIcone() {
        this.icone = { dataUrl: null, bytes: null, nome: null };
    }

    _lerArquivoComoDataURL(arquivo) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(arquivo);
        });
    }

    _reconstruirBanco() {
        if (this.dadosPlanilha && this.dadosPlanilha.length > 0) {
            this._bancoConstruido = this.construtorDB.normalizarDados(this.dadosPlanilha, this.silenciarAvisosMidia);
        }
    }

    /**
     * Retorna o objeto contendo os mapas de mídias, garantindo compatibilidade.
     */
    getPastasMidia() {
        return { audio: this.vfs.audio, imagem: this.vfs.imagem, video: this.vfs.video };
    }

    carregarPastaVirtual(tipo, arquivos) {
        if (!this.vfs || !arquivos || arquivos.length === 0) return Promise.resolve(0);
        const arquivosFiltrados = arquivos.filter(arquivo => {
            const ext = arquivo.name.split('.').pop().toLowerCase();
            return this.configurador.isExtensaoValida(tipo, ext);
        });
        if (arquivosFiltrados.length > 0) {
            this.vfs.adicionarArquivos(tipo, arquivosFiltrados);
            this._reconstruirBanco();
        }
        return Promise.resolve(arquivosFiltrados.length);
    }

    async carregarProjeto(arquivo) {
        const texto = await this._lerArquivoComoTexto(arquivo);
        const projeto = JSON.parse(texto);
        if (projeto.dadosPlanilha) {
            this.dadosPlanilha = projeto.dadosPlanilha;
            this.colunasPlanilha = projeto.colunasPlanilha || [];
        }
        if (projeto.textosExtra) this.vfs.textosExtra = projeto.textosExtra;
        if (projeto.introHtml) this.introHtml = projeto.introHtml;
        if (projeto.introPdf) this.introPdf = projeto.introPdf;
        if (projeto.referencia) this.referencia = projeto.referencia;
        if (projeto.alfabetoCustomizado) this.alfabetoCustomizado = projeto.alfabetoCustomizado;
        if (projeto.configuracaoTextoLocal) this.configuracaoTextoLocal = projeto.configuracaoTextoLocal;
        this._reconstruirBanco();
        console.log('📦 Projeto restaurado de projeto.json');
    }

    _lerArquivoComoTexto(arquivo) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(arquivo, 'UTF-8');
        });
    }

    limpar() {
        // Opções
        this.silenciarAvisosMidia = false;
        
        // Estado
        this.dadosPlanilha = [];
        this.colunasPlanilha = [];
        this._bancoConstruido = null;
        this.icone = { dataUrl: null, bytes: null, nome: null };
        this.vfs.limpar();
        console.log('🧹 Dados limpos com sucesso.');
    }

    async exportar(tipo) {
        if (tipo === 'csv') {
            if (!this.carregadorCsv.papa || this.dadosPlanilha.length === 0) return null;
            
            // Re-empacota a árvore de volta para linhas planas
            const dadosPlanos = this.dadosPlanilha.map(item => {
                const cb = item.camposBasicos || {};
                const vars = item.variacoes || [];
                const exs = item.exemplos || [];
                const imgs = item.imagens || [];
                
                const linhaPlana = {
                    ITEM_LEXICAL: vars.map(v => v.item || '').join(' | '),
                    CLASSE_GRAMATICAL: cb.CLASSE_GRAMATICAL || '',
                    CAMPO_SEMANTICO: cb.CAMPO_SEMANTICO || '',
                    SUB_CAMPO_SEMANTICO: cb.SUB_CAMPO_SEMANTICO || '',
                    ARQUIVO_SONORO: vars.map(v => v.audio || '').join(' | '),
                    TRANSCRICAO_FONEMICA: vars.map(v => v.fone || '').join(' | '),
                    TRANSCRICAO_FONETICA: vars.map(v => v.fonet || '').join(' | '),
                    TRADUCAO_SIGNIFICADO: cb.TRADUCAO_SIGNIFICADO || '',
                    ITENS_RELACIONADOS: cb.ITENS_RELACIONADOS || '',
                    DESCRICAO: cb.DESCRICAO || '',
                    ARQUIVO_SONORO_EXEMPLO: exs.map(e => e.audio || '').join(' | '),
                    TRANSCRICAO_EXEMPLO: exs.map(e => e.trans || '').join(' | '),
                    TRADUCAO_EXEMPLO: exs.map(e => e.trad || '').join(' | '),
                    IMAGEM: imgs.map(i => i.img || '').join(' | '),
                    LEGENDA_IMAGEM: imgs.map(i => i.leg || '').join(' | '),
                    ARQUIVO_VIDEO: cb.ARQUIVO_VIDEO || ''
                };
                return linhaPlana;
            });
            
            return this.carregadorCsv.papa.unparse(dadosPlanos);
        } else if (tipo === 'projeto') {
            const projeto = {
                dadosPlanilha: this.dadosPlanilha,
                colunasPlanilha: this.colunasPlanilha,
                textosExtra: this.vfs.textosExtra,
                introHtml: this.introHtml,
                introPdf: this.introPdf,
                referencia: this.referencia,
                alfabetoCustomizado: this.alfabetoCustomizado,
                configuracaoTextoLocal: this.configuracaoTextoLocal,
                geradoEm: new Date().toISOString()
            };
            return JSON.stringify(projeto, null, 2);
        }
        return null;
    }

    obterEstatisticas() {
        const b = this._bancoConstruido;
        const categoriasSet = new Set();
        if (b) {
            Object.values(b.entradas).forEach(e => {
                if (e.CAMPO_SEMANTICO) categoriasSet.add(e.CAMPO_SEMANTICO);
            });
        }
        
        return {
            disponivel: this.dadosPlanilha.length > 0,
            entradas: b ? Object.keys(b.entradas).length : 0,
            variacoes: b ? Object.keys(b.variacoes).length : 0,
            significados: b ? Object.keys(b.significados).length : 0,
            colunas: this.colunasPlanilha ? this.colunasPlanilha.length : 0,
            categorias: categoriasSet.size,
            midias: {
                audio: this.vfs.obterContagem('audio'),
                imagem: this.vfs.obterContagem('imagem'),
                video: this.vfs.obterContagem('video')
            }
        };
    }

    obterArvoreOrdenada() {
        if (!this._bancoConstruido) return { arvore: {}, categoriasRaizes: [] };
        
        const arvore = {};
        const categoriasRaizes = new Set();
        
        Object.values(this._bancoConstruido.entradas).forEach(entrada => {
            const cat = entrada.CAMPO_SEMANTICO || 'Geral';
            categoriasRaizes.add(cat);
            if (!arvore[cat]) arvore[cat] = { _entradas: [] };
            arvore[cat]._entradas.push(entrada);
        });
        
        let ordemCategorias = Array.from(categoriasRaizes).sort();
        let categoriasAlfabetico = new Set(ordemCategorias);
        
        try {
            const swSemantic = document.getElementById('swSemantic');
            if (swSemantic && !swSemantic.checked) {
                const gridSemantic = document.getElementById('gridSemantic');
                if (gridSemantic) {
                    const ordemDom = [...gridSemantic.querySelectorAll('.sortable-item')].map(item => item.dataset.category);
                    if (ordemDom.length > 0) {
                        ordemCategorias = ordemDom.filter(cat => categoriasRaizes.has(cat));
                        Array.from(categoriasRaizes).forEach(cat => {
                            if (!ordemCategorias.includes(cat)) ordemCategorias.push(cat);
                        });
                    }
                }
            }
            
            const swAlpha = document.getElementById('swAlpha');
            if (swAlpha && !swAlpha.checked) {
                const cbAtivos = [...document.querySelectorAll('#gridAlpha .cat-checkbox:checked')].map(cb => cb.value.trim());
                categoriasAlfabetico = new Set(cbAtivos);
            }
        } catch(e) {
            // Fallback: usa ordem padrão se não houver DOM disponível
        }
        
        Object.keys(arvore).forEach(cat => {
            if (categoriasAlfabetico.has(cat)) {
                arvore[cat]._entradas.sort((a, b) => {
                    const termoA = (a._TERMO_PRINCIPAL || a.TERMO_PARENT || '').toLowerCase();
                    const termoB = (b._TERMO_PRINCIPAL || b.TERMO_PARENT || '').toLowerCase();
                    return termoA.localeCompare(termoB, 'pt-BR');
                });
            }
        });
        
        return { arvore, categoriasRaizes: ordemCategorias };
    }

    buscarPorTermo(termo, opcoes = { fuzzy: true, global: true }) {
        if (!this._bancoConstruido) return [];
        const termoBusca = termo.trim().toLowerCase();
        
        return Object.values(this._bancoConstruido.entradas).filter(item => {
            let match = false;
            
            // 1. Busca no termo principal e variações
            if (opcoes.fuzzy) {
                match = buscaFuzzy(item._TERMO_PRINCIPAL, termoBusca);
                if (!match && item.VARIACOES_IDS) {
                    for (const vId of item.VARIACOES_IDS) {
                        const v = this._bancoConstruido.variacoes[vId];
                        if (v && buscaFuzzy(v.TRANSCRICAO_ORTOGRAFICA, termoBusca)) {
                            match = true;
                            break;
                        }
                    }
                }
            } else {
                match = item._TERMO_PRINCIPAL && item._TERMO_PRINCIPAL.toLowerCase().includes(termoBusca);
                if (!match && item.VARIACOES_IDS) {
                    for (const vId of item.VARIACOES_IDS) {
                        const v = this._bancoConstruido.variacoes[vId];
                        if (v && v.TRANSCRICAO_ORTOGRAFICA && v.TRANSCRICAO_ORTOGRAFICA.toLowerCase().includes(termoBusca)) {
                            match = true;
                            break;
                        }
                    }
                }
            }

            // 2. Busca Global em Acepções (Significados e Descrições)
            if (!match && opcoes.global && item.ACEPCOES) {
                for (const aId of item.ACEPCOES) {
                    const acep = this._bancoConstruido.significados[aId];
                    if (!acep) continue;
                    
                    if (opcoes.fuzzy) {
                        if (buscaFuzzy(acep.TRADUCAO_SIGNIFICADO, termoBusca) || buscaFuzzy(acep.DESCRICAO, termoBusca)) {
                            match = true; break;
                        }
                    } else {
                        if ((acep.TRADUCAO_SIGNIFICADO && acep.TRADUCAO_SIGNIFICADO.toLowerCase().includes(termoBusca)) ||
                            (acep.DESCRICAO && acep.DESCRICAO.toLowerCase().includes(termoBusca))) {
                            match = true; break;
                        }
                    }
                }
            }
            
            // 3. Filtragem Combinada
            if (match && opcoes.classeGramatical) {
                if (!item.CLASSE_GRAMATICAL || item.CLASSE_GRAMATICAL.toLowerCase() !== opcoes.classeGramatical.toLowerCase()) {
                    match = false;
                }
            }
            if (match && opcoes.campoSemantico) {
                if (!item.CAMPO_SEMANTICO || item.CAMPO_SEMANTICO.toLowerCase() !== opcoes.campoSemantico.toLowerCase()) {
                    match = false;
                }
            }

            return match;
        });
    }
}