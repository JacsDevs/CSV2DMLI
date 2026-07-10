// ============================================
// CONFIGURADOR - APENAS LÊ O ARQUIVO DE CONFIGURAÇÃO
// ============================================

class Configurador {
    constructor() {
        this.config = null;
    }

    async carregar(caminho = './config/config.json') {
        try {
            const resposta = await fetch(caminho);
            this.config = await resposta.json();
            console.log('✅ Configurações carregadas:', this.config);
            return this.config;
        } catch (erro) {
            console.error('❌ Erro ao carregar configurações:', erro);
            throw new Error(`Não foi possível carregar o arquivo de configuração: ${caminho}`);
        }
    }

    getConfig() {
        if (!this.config) {
            throw new Error('Configurações não carregadas. Execute carregar() primeiro.');
        }
        return this.config;
    }

    // ==========================================
    // MÉTODOS PARA COLUNAS
    // ==========================================
    
    getColunas() {
        return this.getConfig().colunas || {};
    }

    getColunasObrigatorias() {
        return this.getConfig().colunas?.obrigatorias || ["ITEM_LEXICAL"];
    }

    getMapeamentoColunas() {
        return this.getConfig().colunas?.mapeamento || {};
    }

    // ==========================================
    // MÉTODOS PARA MÍDIAS
    // ==========================================
    
    getMidias() {
        return this.getConfig().midias || {};
    }

    getExtensoes(tipo) {
        return this.getConfig().midias?.[tipo]?.extensoes || [];
    }

    getPastasMidia(tipo) {
        return this.getConfig().midias?.[tipo]?.pastas || [tipo];
    }

    getTamanhoMaximoMB(tipo) {
        return this.getConfig().midias?.[tipo]?.tamanhoMaximoMB || 10;
    }

    getTamanhoMaximoBytes(tipo) {
        return this.getTamanhoMaximoMB(tipo) * 1024 * 1024;
    }

    isExtensaoValida(tipo, extensao) {
        const extensoes = this.getExtensoes(tipo);
        return extensoes.includes(extensao.toLowerCase());
    }

    // ==========================================
    // MÉTODOS PARA ARQUIVOS ESPECÍFICOS
    // ==========================================
    
    getNomesArquivo(tipo) {
        const nomes = this.getConfig().arquivos?.[tipo]?.nomes || [];
        return nomes.map(n => n.toLowerCase());
    }

    isArquivoObrigatorio(tipo) {
        return this.getConfig().arquivos?.[tipo]?.obrigatorio || false;
    }

    // ==========================================
    // MESCLAR CONFIGURAÇÃO LOCAL
    // ==========================================
    
    mesclarConfigLocal(configLocal) {
        this.config = this._mesclarObjetos(this.config, configLocal);
        console.log('✅ Configuração local mesclada');
        return this.config;
    }

    _mesclarObjetos(objeto1, objeto2) {
        const resultado = { ...objeto1 };
        
        for (const chave in objeto2) {
            if (objeto2[chave] && typeof objeto2[chave] === 'object' && !Array.isArray(objeto2[chave])) {
                resultado[chave] = this._mesclarObjetos(resultado[chave] || {}, objeto2[chave]);
            } else {
                resultado[chave] = objeto2[chave];
            }
        }
        
        return resultado;
    }
}

export default Configurador;