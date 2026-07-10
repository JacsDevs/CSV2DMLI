// ============================================
// CARREGADOR DE CSV
// ============================================

class CarregadorCsv {
    constructor() {
        this.papa = null;
        this.aoProgresso = null;
        this.aoCompletar = null;
        this.aoErro = null;
    }

    // Inicializar com Papa Parse (carregamento dinâmico)
    async init() {
        if (typeof Papa !== 'undefined') {
            this.papa = Papa;
            return true;
        }
        
        // Tentar carregar Papa Parse dinamicamente
        try {
            await this.carregarScript('vendor/papaparse.min.js');
            this.papa = window.Papa;
            return true;
        } catch(e) {
            console.error('Erro ao carregar Papa Parse:', e);
            return false;
        }
    }

    // Helper para carregar script dinamicamente
    carregarScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Processar arquivo CSV
    processarCSV(arquivo, opcoes = {}) {
        return new Promise((resolve, reject) => {
            if (!this.papa) {
                reject(new Error('Papa Parse não inicializado'));
                return;
            }

            const opcoesPadrao = {
                header: true,
                skipEmptyLines: true,
                encoding: 'UTF-8',
                complete: (resultados) => {
                    const dados = resultados.data.filter(linha => 
                        Object.values(linha).some(v => v && String(v).trim() !== '')
                    );
                    const colunas = resultados.meta.fields || [];
                    
                    const resultado = {
                        dados,
                        colunas,
                        linhas: dados.length,
                        nomeArquivo: arquivo.name,
                        erros: resultados.errors
                    };
                    
                    if (this.aoCompletar) this.aoCompletar(resultado);
                    resolve(resultado);
                },
                error: (erro) => {
                    if (this.aoErro) this.aoErro(erro);
                    reject(erro);
                }
            };
            
            // Mesclar opções
            const opcoesFinais = { ...opcoesPadrao, ...opcoes };
            this.papa.parse(arquivo, opcoesFinais);
        });
    }

    // Carregar de string CSV (útil para Electron com arquivos locais)
    processarStringCSV(stringCsv, opcoes = {}) {
        return new Promise((resolve, reject) => {
            if (!this.papa) {
                reject(new Error('Papa Parse não inicializado'));
                return;
            }

            const opcoesPadrao = {
                header: true,
                skipEmptyLines: true,
                complete: (resultados) => {
                    const dados = resultados.data.filter(linha => 
                        Object.values(linha).some(v => v && String(v).trim() !== '')
                    );
                    const colunas = resultados.meta.fields || [];
                    
                    resolve({
                        dados,
                        colunas,
                        linhas: dados.length,
                        erros: resultados.errors
                    });
                },
                error: reject
            };
            
            const opcoesFinais = { ...opcoesPadrao, ...opcoes };
            this.papa.parse(stringCsv, opcoesFinais);
        });
    }

    // Validar estrutura do CSV (colunas obrigatórias)
    validarEstrutura(colunas, colunasObrigatorias = []) {
        const colunasLower = colunas.map(c => c.toLowerCase());
        const faltantes = colunasObrigatorias.filter(obrigatoria => 
            !colunasLower.includes(obrigatoria.toLowerCase())
        );
        
        return {
            valido: faltantes.length === 0,
            faltantes,
            colunas
        };
    }

    // Extrair categorias únicas de uma coluna
    extrairCategorias(dados, coluna) {
        const categorias = new Set();
        dados.forEach(linha => {
            const valor = String(linha[coluna] || '').trim();
            if (valor && valor.toLowerCase() !== 'nan') {
                categorias.add(valor);
            }
        });
        return Array.from(categorias).sort();
    }
}

export default CarregadorCsv;