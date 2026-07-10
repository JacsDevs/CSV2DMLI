/**
 * Utilitários gerais do sistema
 */

/**
 * Limpa uma string separada por pipes (|), removendo espaços,
 * valores vazios e o valor 'nan' comum em importações.
 * @param {string|null|undefined} valor - A string com os valores
 * @returns {Array<string>} Array de strings limpas
 */
export function limparListaPipe(valor) {
    if (!valor || String(valor).trim() === '' || String(valor).toLowerCase() === 'nan') {
        return [];
    }
    return String(valor).split('|')
        .map(v => v.trim())
        .filter(Boolean)
        .filter(v => v.toLowerCase() !== 'nan');
}

/**
 * Calcula a distância de Levenshtein entre duas strings.
 * Usado para busca fuzzy.
 */
export function calcularDistanciaLevenshtein(a, b) {
    const matrix = [];
    let i, j;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    for (i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    
    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substituição
                    Math.min(matrix[i][j - 1] + 1, // inserção
                    matrix[i - 1][j] + 1) // deleção
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

/**
 * Verifica se um texto contém o termo de busca, com tolerância a erros (fuzzy).
 */
export function buscaFuzzy(texto, termo, maxDistancia = 2) {
    if (!texto || !termo) return false;
    texto = String(texto).toLowerCase();
    termo = String(termo).toLowerCase();
    
    if (texto.includes(termo)) return true;
    
    // Se o termo for muito curto, usar includes apenas (já verificamos acima)
    if (termo.length <= 3) return false;
    
    // Testa contra palavras individuais da string
    const palavras = texto.split(/[\s.,;:!?()-]+/);
    for (const palavra of palavras) {
        // Otimização: só calcula a distância se a diferença de tamanho for menor ou igual à distância máxima permitida
        if (Math.abs(palavra.length - termo.length) <= maxDistancia) {
            const dist = calcularDistanciaLevenshtein(palavra, termo);
            if (dist <= maxDistancia) return true;
        }
    }
    return false;
}
