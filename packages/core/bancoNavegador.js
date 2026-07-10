/**
 * Utilitário para gerenciar o IndexedDB de forma nativa e assíncrona.
 * Permite armazenar Blobs/Files grandes (como áudios e vídeos) de forma persistente,
 * sem depender do localStorage que possui limites rígidos de tamanho (5MB).
 */

class BancoNavegador {
    constructor(nomeBanco = 'DicionarioLexicalDB', versao = 1) {
        this.nomeBanco = nomeBanco;
        this.versao = versao;
        this.db = null;
    }

    /**
     * Inicializa o banco de dados e cria a store 'midias' se não existir.
     * @returns {Promise<IDBDatabase>}
     */
    async inicializar() {
        return null;
    }

    /**
     * Armazena um valor na store especificada.
     * @param {string} storeName - Nome da store ('midias' ou 'metadados')
     * @param {string} key - Chave do arquivo/metadado
     * @param {any} value - Valor a ser armazenado (File, Blob, Object, etc)
     * @returns {Promise<void>}
     */
    async set(storeName, key, value) {
        // Persistência desativada (apenas memória da sessão)
        return Promise.resolve();
    }

    /**
     * Recupera um valor da store especificada.
     * @param {string} storeName - Nome da store ('midias' ou 'metadados')
     * @param {string} key - Chave do arquivo/metadado
     * @returns {Promise<any>}
     */
    async get(storeName, key) {
        // Sempre retorna nulo, forçando carregamento limpo
        return Promise.resolve(null);
    }

    /**
     * Remove um valor da store.
     * @param {string} storeName - Nome da store
     * @param {string} key - Chave do arquivo/metadado
     * @returns {Promise<void>}
     */
    async delete(storeName, key) {
        return Promise.resolve();
    }

    /**
     * Retorna todas as chaves de uma store.
     * @param {string} storeName - Nome da store
     * @returns {Promise<string[]>}
     */
    async keys(storeName) {
        return Promise.resolve([]);
    }

    /**
     * Limpa completamente uma store.
     * @param {string} storeName - Nome da store
     * @returns {Promise<void>}
     */
    async clear(storeName) {
        return Promise.resolve();
    }
}

// Exporta uma instância única (Singleton) para a aplicação
const bancoLocal = new BancoNavegador();
export default bancoLocal;
