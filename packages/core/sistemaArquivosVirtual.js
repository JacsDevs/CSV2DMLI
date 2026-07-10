// ============================================
// SISTEMA DE ARQUIVOS VIRTUAL
// GERENCIA ÁUDIOS, IMAGENS, VÍDEOS E TEXTOS ESTRUTURADOS
// ============================================
import bancoLocal from './bancoNavegador.js';

class SistemaArquivosVirtual {
    constructor(configurador = null) {
        // Configurador para extensões
        this.configurador = configurador;
        
        // Mapas de arquivos por tipo
        this.audio = new Map();
        this.imagem = new Map();
        this.video = new Map();
        
        // Metadados adicionais para cada arquivo
        this.metadados = {
            audio: new Map(),
            imagem: new Map(),
            video: new Map()
        };
        
        // Templates e textos estruturados
        this.alfabeto = '';
        this.templateHtml = null;
        this.templateHtmlLinear = null;
        this.templateTex = null;
        this.templateTypst = null;
        this.textosExtra = {};
        
        // URLs temporárias criadas (para limpeza)
        this.urlsTemporarias = new Set();
        
        // Cache de thumbnails para imagens
        this.thumbnails = new Map();
        
        // Callbacks para notificar mudanças
        this.callbacksMudanca = [];
    }

    // ==========================================
    // GERENCIAMENTO DE CALLBACKS
    // ==========================================
    
    aoMudar(callback) {
        this.callbacksMudanca.push(callback);
    }

    _notificarMudanca(tipo, arquivosAdicionados, detalhes = {}) {
        this.callbacksMudanca.forEach(cb => {
            try {
                cb({ 
                    tipo, 
                    arquivosAdicionados, 
                    total: this.obterContagem(tipo),
                    ...detalhes
                });
            } catch(e) {
                console.debug('Erro no callback:', e);
            }
        });
    }

    // ==========================================
    // CARREGAMENTO DO BANCO DE DADOS
    // ==========================================
    
    async carregarDoBanco() {
        try {
            const chavesMidias = await bancoLocal.keys('midias');
            let carregados = 0;
            
            for (const chave of chavesMidias) {
                const partes = chave.split('_');
                const tipo = partes[0]; // audio, imagem, video
                const nome = partes.slice(1).join('_');
                
                if (this[tipo] !== undefined) {
                    const arquivo = await bancoLocal.get('midias', chave);
                    if (arquivo) {
                        this[tipo].set(nome, arquivo);
                        // Tentar pegar os metadados se existirem, senão cria um básico
                        const metaKey = `meta_${tipo}_${nome}`;
                        let metadado = await bancoLocal.get('metadados', metaKey);
                        if (!metadado) {
                            metadado = {
                                nomeOriginal: arquivo.name || nome,
                                tamanho: arquivo.size,
                                tipo: arquivo.type,
                                ultimaModificacao: arquivo.lastModified,
                                dataAdicao: Date.now(),
                                extensao: nome.split('.').pop().toLowerCase()
                            };
                        }
                        this.metadados[tipo].set(nome, metadado);
                        carregados++;
                        
                        if (tipo === 'imagem') {
                            this._gerarThumbnail(nome, arquivo);
                        }
                    }
                }
            }
            
            // Carregar textos
            const chavesMetadados = await bancoLocal.keys('metadados');
            if (chavesMetadados.includes('textosExtra')) {
                const textos = await bancoLocal.get('metadados', 'textosExtra');
                if (textos) this.textosExtra = textos;
            }
            
            if (carregados > 0) {
                console.log(`📦 ${carregados} mídias carregadas do banco local.`);
                this._notificarMudanca('todos', carregados);
            }
            return carregados;
        } catch (error) {
            console.error('Erro ao carregar do banco local:', error);
            return 0;
        }
    }

    // ==========================================
    // OBTENÇÃO DE CONFIGURAÇÕES
    // ==========================================
    
    obterExtensoes(tipo) {
        // Usar configurador se disponível
        if (this.configurador && this.configurador.getExtensoes) {
            const ext = this.configurador.getExtensoes(tipo);
            if (ext && ext.length > 0) return ext;
        }
        
        // Fallback padrão
        const extensoes = {
            audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'wma', 'aac'],
            imagem: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'],
            video: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'm4v', 'ogv']
        };
        return extensoes[tipo] || [];
    }

    obterTamanhoMaximo(tipo) {
        // Usar configurador se disponível
        if (this.configurador && this.configurador.getTamanhoMaximoMB) {
            const tamanhoMB = this.configurador.getTamanhoMaximoMB(tipo);
            if (tamanhoMB) return tamanhoMB * 1024 * 1024;
        }
        
        // Fallback padrão
        const tamanhos = {
            audio: 20 * 1024 * 1024,
            imagem: 10 * 1024 * 1024,
            video: 100 * 1024 * 1024
        };
        return tamanhos[tipo] || 10 * 1024 * 1024;
    }

    // ==========================================
    // ADIÇÃO E REMOÇÃO DE ARQUIVOS
    // ==========================================
    
    adicionarArquivos(tipo, listaArquivos) {
        if (!this[tipo]) {
            console.error(`Tipo "${tipo}" não suportado. Use: audio, imagem, video`);
            return 0;
        }
        
        let adicionados = 0;
        const detalhes = { nomes: [], tamanhos: [], tipos: [] };
        
        for (const arquivo of listaArquivos) {
            const nome = this._normalizarNome(arquivo.name);
            const ext = nome.split('.').pop().toLowerCase();
            const extValidas = this.obterExtensoes(tipo);
            
            if (extValidas.includes(ext)) {
                if (!this[tipo].has(nome)) {
                    this[tipo].set(nome, arquivo);
                    
                    const metadado = {
                        nomeOriginal: arquivo.name,
                        tamanho: arquivo.size,
                        tipo: arquivo.type,
                        ultimaModificacao: arquivo.lastModified,
                        dataAdicao: Date.now(),
                        extensao: ext
                    };
                    
                    this.metadados[tipo].set(nome, metadado);
                    
                    // Persistir no IndexedDB assincronamente (não bloqueia)
                    bancoLocal.set('midias', `${tipo}_${nome}`, arquivo).catch(e => console.error("Erro ao salvar no IDB", e));
                    bancoLocal.set('metadados', `meta_${tipo}_${nome}`, metadado).catch(e => console.error("Erro ao salvar no IDB", e));
                    
                    adicionados++;
                    detalhes.nomes.push(nome);
                    detalhes.tamanhos.push(arquivo.size);
                    detalhes.tipos.push(arquivo.type);
                    
                    if (tipo === 'imagem') {
                        this._gerarThumbnail(nome, arquivo);
                    }
                }
            }
        }
        
        if (adicionados > 0) {
            this._notificarMudanca(tipo, adicionados, detalhes);
            this.salvarCache();
        }
        
        return adicionados;
    }

    removerArquivo(tipo, nome) {
        if (!this[tipo]) return false;
        
        const nomeNormalizado = this._normalizarNome(nome);
        const arquivo = this[tipo].get(nomeNormalizado);
        
        if (arquivo) {
            if (this.urlsTemporarias.has(nomeNormalizado)) {
                URL.revokeObjectURL(this.obterUrl(tipo, nomeNormalizado));
                this.urlsTemporarias.delete(nomeNormalizado);
            }
            
            if (tipo === 'imagem' && this.thumbnails.has(nomeNormalizado)) {
                URL.revokeObjectURL(this.thumbnails.get(nomeNormalizado));
                this.thumbnails.delete(nomeNormalizado);
            }
            
            this[tipo].delete(nomeNormalizado);
            this.metadados[tipo].delete(nomeNormalizado);
            
            // Remover do IndexedDB
            bancoLocal.delete('midias', `${tipo}_${nomeNormalizado}`).catch(e => console.error(e));
            bancoLocal.delete('metadados', `meta_${tipo}_${nomeNormalizado}`).catch(e => console.error(e));
            
            this._notificarMudanca(tipo, -1, { nomeRemovido: nomeNormalizado });
            this.salvarCache();
            return true;
        }
        
        return false;
    }

    // ==========================================
    // CONSULTA DE ARQUIVOS
    // ==========================================
    
    obterArquivo(tipo, nome) {
        if (!this[tipo]) return null;
        const nomeNormalizado = this._normalizarNome(nome);
        return this[tipo].get(nomeNormalizado) || null;
    }

    obterMetadados(tipo, nome) {
        if (!this.metadados[tipo]) return null;
        const nomeNormalizado = this._normalizarNome(nome);
        return this.metadados[tipo].get(nomeNormalizado) || null;
    }

    obterTodosNomes(tipo) {
        return this[tipo] ? [...this[tipo].keys()] : [];
    }

    obterTodosArquivos(tipo) {
        return this[tipo] ? [...this[tipo].values()] : [];
    }

    obterContagem(tipo) {
        return this[tipo]?.size || 0;
    }

    obterTotalMidias() {
        return this.obterContagem('audio') + 
               this.obterContagem('imagem') + 
               this.obterContagem('video');
    }

    // ==========================================
    // URLS E THUMBNAILS
    // ==========================================
    
    obterUrl(tipo, nome) {
        const arquivo = this.obterArquivo(tipo, nome);
        if (!arquivo) return null;
        
        const nomeNormalizado = this._normalizarNome(nome);
        
        if (this.urlsTemporarias.has(nomeNormalizado)) {
            return this._getUrlFromStore(tipo, nomeNormalizado);
        }
        
        let url = null;
        
        if (arquivo instanceof File || arquivo instanceof Blob) {
            url = URL.createObjectURL(arquivo);
            this.urlsTemporarias.add(nomeNormalizado);
            this._storeUrl(tipo, nomeNormalizado, url);
        } else if (typeof arquivo === 'string') {
            url = arquivo;
        }
        
        return url;
    }

    async obterThumbnail(nome, tamanhoMaximo = 100) {
        const nomeNormalizado = this._normalizarNome(nome);
        
        if (this.thumbnails.has(nomeNormalizado)) {
            return this.thumbnails.get(nomeNormalizado);
        }
        
        const arquivo = this.obterArquivo('imagem', nomeNormalizado);
        if (!arquivo) return null;
        
        return await this._gerarThumbnail(nomeNormalizado, arquivo, tamanhoMaximo);
    }

    async _gerarThumbnail(nome, arquivo, tamanhoMaximo = 100) {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(arquivo);
            
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > tamanhoMaximo) {
                        height = (height * tamanhoMaximo) / width;
                        width = tamanhoMaximo;
                    }
                } else {
                    if (height > tamanhoMaximo) {
                        width = (width * tamanhoMaximo) / height;
                        height = tamanhoMaximo;
                    }
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
                this.thumbnails.set(nome, thumbnail);
                
                URL.revokeObjectURL(url);
                resolve(thumbnail);
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(null);
            };
            
            img.src = url;
        });
    }

    // ==========================================
    // TEXTOS ESTRUTURADOS
    // ==========================================
    
    adicionarTextosEstruturados(dadosJson) {
        if (typeof dadosJson === 'string') {
            try {
                dadosJson = JSON.parse(dadosJson);
            } catch(e) {
                console.error('Erro ao processar JSON de textos:', e);
                return false;
            }
        }
        
        const novosTextos = { ...this.textosExtra, ...dadosJson };
        const qtdAdicionada = Object.keys(dadosJson).length;
        
        this.textosExtra = novosTextos;
        
        // Persistir no IndexedDB
        bancoLocal.set('metadados', 'textosExtra', novosTextos).catch(e => console.error(e));
        
        this.salvarCache();
        this._notificarMudanca('textos', qtdAdicionada, { 
            titulos: Object.keys(dadosJson) 
        });
        
        return true;
    }

    obterTextoEstruturado(titulo) {
        return this.textosExtra[titulo] || null;
    }

    listarTextosEstruturados() {
        return Object.keys(this.textosExtra);
    }

    // ==========================================
    // PERSISTÊNCIA
    // ==========================================
    
    salvarCache() {
        try {
            const metadadosParaCache = {
                audio: this._serializarMetadados('audio'),
                imagem: this._serializarMetadados('imagem'),
                video: this._serializarMetadados('video'),
                textosExtraKeys: Object.keys(this.textosExtra),
                timestamp: Date.now()
            };
            
            localStorage.setItem('sistema_midias_cache', JSON.stringify(metadadosParaCache));
        } catch(e) {
            console.debug('Cache não salvo:', e.message);
        }
    }

    carregarCache() {
        const cache = localStorage.getItem('sistema_midias_cache');
        if (cache) {
            try {
                const dados = JSON.parse(cache);
                if (Date.now() - dados.timestamp < 86400000) {
                    console.log('📦 Cache carregado');
                    return true;
                }
            } catch(e) {}
        }
        return false;
    }

    // ==========================================
    // LIMPEZA
    // ==========================================
    
    limparUrlsTemporarias() {
        for (const url of this.urlsTemporarias) {
            URL.revokeObjectURL(url);
        }
        this.urlsTemporarias.clear();
        
        for (const thumbnail of this.thumbnails.values()) {
            if (thumbnail && thumbnail.startsWith('blob:')) {
                URL.revokeObjectURL(thumbnail);
            }
        }
        this.thumbnails.clear();
    }

    limpar(tipo = null) {
        if (tipo && this[tipo]) {
            for (const nome of this[tipo].keys()) {
                if (this.urlsTemporarias.has(nome)) {
                    URL.revokeObjectURL(this.obterUrl(tipo, nome));
                    this.urlsTemporarias.delete(nome);
                }
                if (tipo === 'imagem' && this.thumbnails.has(nome)) {
                    URL.revokeObjectURL(this.thumbnails.get(nome));
                    this.thumbnails.delete(nome);
                }
            }
            
            this[tipo].clear();
            this.metadados[tipo].clear();
            
            // Não limpamos todo o banco aqui facilmente por tipo, precisaria buscar as chaves.
            // Para manter simples, vamos deixar o IndexedDB como está a menos que limpe tudo.
            
            this._notificarMudanca(tipo, 0);
            
        } else if (!tipo) {
            this.limparUrlsTemporarias();
            this.audio.clear();
            this.imagem.clear();
            this.video.clear();
            this.metadados.audio.clear();
            this.metadados.imagem.clear();
            this.metadados.video.clear();
            this.textosExtra = {};
            
            // Limpa tudo do IndexedDB
            bancoLocal.clear('midias').catch(e => console.error(e));
            bancoLocal.clear('metadados').catch(e => console.error(e));
            
            this._notificarMudanca('todos', 0);
        }
        
        this.salvarCache();
    }

    // ==========================================
    // MÉTODOS PRIVADOS
    // ==========================================
    
    _normalizarNome(nome) {
        return nome.split('/').pop().split('\\').pop().trim();
    }

    _serializarMetadados(tipo) {
        const metadados = [];
        for (const [nome, meta] of this.metadados[tipo]) {
            metadados.push({
                nome,
                tamanho: meta.tamanho,
                tipo: meta.tipo,
                extensao: meta.extensao,
                dataAdicao: meta.dataAdicao
            });
        }
        return metadados;
    }

    _urlStore = {
        audio: new Map(),
        imagem: new Map(),
        video: new Map()
    };

    _storeUrl(tipo, nome, url) {
        this._urlStore[tipo].set(nome, url);
    }

    _getUrlFromStore(tipo, nome) {
        return this._urlStore[tipo].get(nome) || null;
    }

    async adicionarArquivoPorCaminho(tipo, caminhoAbsoluto) {
        if (typeof require !== 'undefined') {
            try {
                const fs = require('fs');
                const path = require('path');
                
                const stats = fs.statSync(caminhoAbsoluto);
                const nome = path.basename(caminhoAbsoluto);
                
                const arquivoVirtual = {
                    name: nome,
                    path: caminhoAbsoluto,
                    size: stats.size,
                    type: this._obterTipoMime(nome),
                    lastModified: stats.mtimeMs
                };
                
                return this.adicionarArquivos(tipo, [arquivoVirtual]);
            } catch(e) {
                console.error('Erro ao adicionar arquivo por caminho:', e);
                return 0;
            }
        }
        return 0;
    }

    _obterTipoMime(nomeArquivo) {
        const ext = nomeArquivo.split('.').pop().toLowerCase();
        const tipos = {
            mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
            gif: 'image/gif', webp: 'image/webp',
            mp4: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo'
        };
        return tipos[ext] || 'application/octet-stream';
    }
}

export default SistemaArquivosVirtual;