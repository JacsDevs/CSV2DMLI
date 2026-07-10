/**
 * Processa um template de texto (estilo Mustache/Handlebars) com um objeto de dados.
 * É uma adaptação direta da função `processarTemplateEntrada` do seu app.js.
 * @param {string} template - O texto do template com placeholders como {{CHAVE}} e {{#BLOCO}}...{{/BLOCO}}.
 * @param {object} dados - O objeto de dados para preencher o template.
 * @returns {string} - O texto do template processado.
 */
export function processarTemplateEntrada(template, dados) {
    if (!template) {
        console.warn("Template de entrada não fornecido. Retornando string vazia.");
        return '';
    }

    // Função recursiva que avalia blocos e variáveis dinamicamente
    function processar(textoAtual, contextoAtual) {
        // 1. Resolve blocos lógicos e iteradores: {{#CHAVE}}...{{/CHAVE}}
        const regexBloco = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

        let textoProcessado = textoAtual.replace(regexBloco, (match, chave, conteudoInterno) => {
            const valor = contextoAtual[chave];

            if (valor === undefined || valor === null || valor === '' || (Array.isArray(valor) && valor.length === 0)) {
                return ''; // Omite o bloco se a chave não existe, é nula ou vazia
            }

            if (Array.isArray(valor)) {
                // Itera sobre arrays (ex: {{#TEXTOS}}...{{/TEXTOS}})
                return valor.map(item => {
                    if (typeof item === 'object' && item !== null) {
                        // Só verifica as chaves PRÓPRIAS do item, não do contexto herdado
                        const chavesProprias = Object.keys(item);
                        const temConteudoProprio = chavesProprias.some(k => {
                            const v = item[k];
                            return v !== null && v !== undefined && String(v).trim() !== '';
                        });
                        
                        if (!temConteudoProprio) return '';
                        
                        const contextoItem = { ...contextoAtual, ...item };
                        return processar(conteudoInterno, contextoItem);
                    }
                    return '';
                }).join('');
            }

            // Condição simples (se a chave existe e não é false)
            const novoContexto = (typeof valor === 'object' && valor !== null)
                ? { ...contextoAtual, ...valor }
                : contextoAtual;

            return processar(conteudoInterno, novoContexto);
        });

        // 2. Resolve variáveis simples de texto: {{ CHAVE }}
        const regexVariavel = /\{\{\s*(\w+)\s*\}\}/g;
        textoProcessado = textoProcessado.replace(regexVariavel, (match, chave) => {
            const valor = contextoAtual[chave];
            return (valor !== undefined && valor !== null) ? String(valor) : '';
        });

        return textoProcessado;
    }

    // Executa a árvore de renderização
    let resultado = processar(template, dados);

    // 3. Limpeza Final de Artefatos (opcional, adaptado de app.js)
    resultado = resultado
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();

    return resultado;
}