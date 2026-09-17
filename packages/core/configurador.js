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
            // Removido console.log gigante
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

    /**
     * Aplica o mapeamento de colunas (colunas.mapeamento) a uma linha crua do CSV,
     * preenchendo cada campo canônico a partir do primeiro alias presente na linha.
     * O valor de cada entrada do mapeamento pode ser uma string (alias único,
     * comportamento legado) ou um array de aliases aceitos, na ordem de prioridade.
     * Não remove os campos originais da linha — só adiciona/preenche os canônicos.
     * @param {object} linhaCrua - Linha do CSV já parseada (chave = cabeçalho).
     * @returns {object} A própria linha, com os campos canônicos resolvidos.
     */
    resolverAliasColuna(linhaCrua) {
        const mapeamento = this.getMapeamentoColunas();
        for (const [canonico, aliasOuLista] of Object.entries(mapeamento)) {
            if (linhaCrua[canonico] !== undefined && linhaCrua[canonico] !== '') continue;
            const aliases = Array.isArray(aliasOuLista) ? aliasOuLista : [aliasOuLista];
            for (const alias of aliases) {
                if (alias && linhaCrua[alias] !== undefined && linhaCrua[alias] !== '') {
                    linhaCrua[canonico] = linhaCrua[alias];
                    break;
                }
            }
        }
        return linhaCrua;
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