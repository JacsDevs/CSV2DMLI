// Prepara um HTML pronto (gerado pelo exportador HTML Cards) para a prévia do
// gerador de APK sem travar a interface. Roda preferencialmente num Web Worker
// (previaHtmlWorker.js), mas não depende de DOM, então também funciona na thread
// principal como fallback.
//
// - Limita as entradas cortando os scripts `adicionaDados([...])`, que é de onde o
//   template monta os cards (não há `.entry-card` no HTML gerado).
// - Remove de DicionarioMidias as mídias que nenhuma entrada mantida referencia.
// - Troca por "" as mídias embutidas (data: base64) que não devem ir para a
//   prévia: todos os vídeos e, opcionalmente, áudios/imagens acima de um tamanho.

const RE_SCRIPT_LOTE = /<script>\s*adicionaDados\(([\s\S]*?)\);?\s*<\/script>\s*/g;
const RE_DICIONARIO_MIDIAS = /(window\.DicionarioMidias\s*=\s*)(.*);(?=\s*\n)/;
// Base64 pode aparecer com "/" escapado ("\/") dentro de strings JS/JSON; a barra
// invertida só é consumida quando seguida de "/" para não quebrar aspas escapadas.
const RE_DATA_URI = /data:(video|audio|image)\/[^;,"'\s\\]+(?:;[^;,"'\s\\]+)*;base64,(?:[A-Za-z0-9+=]|\\?\/)+/g;

const jsonSeguro = (obj) => JSON.stringify(obj).replace(/<\//g, '<\\/');

/**
 * @param {string} texto HTML completo
 * @param {{ limiteEntradas?: number, removerVideos?: boolean, limiteBytesMidia?: number }} opcoes
 *        limiteBytesMidia: áudios/imagens embutidos maiores que isso são removidos (0 = não remove)
 * @returns {{ html: string, totalEntradas: number|null, entradasMantidas: number|null,
 *             videosRemovidos: number, midiasGrandesRemovidas: number }}
 */
export function processarHtmlPrevia(texto, { limiteEntradas = 0, removerVideos = true, limiteBytesMidia = 0 } = {}) {
    let totalEntradas = null;
    let entradasMantidas = null;

    if (limiteEntradas > 0) {
        let restante = limiteEntradas;
        let total = 0;
        let contavel = true;
        let cortou = false;
        const lotesMantidos = [];

        const html = texto.replace(RE_SCRIPT_LOTE, (bloco, json) => {
            let lote;
            try { lote = JSON.parse(json); } catch (e) { contavel = false; }
            if (!Array.isArray(lote)) { contavel = false; return bloco; }
            total += lote.length;
            if (restante <= 0) { cortou = true; return ''; }
            if (lote.length <= restante) {
                restante -= lote.length;
                lotesMantidos.push(json);
                return bloco;
            }
            const parte = lote.slice(0, restante);
            restante = 0;
            cortou = true;
            const jsonParte = jsonSeguro(parte);
            lotesMantidos.push(jsonParte);
            return `<script>adicionaDados(${jsonParte});<\/script>\n`;
        });

        if (contavel && total > 0) {
            texto = html;
            totalEntradas = total;
            entradasMantidas = Math.min(total, limiteEntradas);
            if (cortou) texto = podarDicionarioMidias(texto, lotesMantidos.join('\n'));
        }
    }

    let videosRemovidos = 0;
    let midiasGrandesRemovidas = 0;
    // Cada caractere Base64 carrega 6 bits
    const limiteChars = limiteBytesMidia > 0 ? Math.ceil(limiteBytesMidia * 4 / 3) : 0;
    texto = texto.replace(RE_DATA_URI, (uri, tipo) => {
        if (tipo === 'video') {
            if (!removerVideos) return uri;
            videosRemovidos++;
            return '';
        }
        if (limiteChars && uri.length > limiteChars) {
            midiasGrandesRemovidas++;
            return '';
        }
        return uri;
    });

    return { html: texto, totalEntradas, entradasMantidas, videosRemovidos, midiasGrandesRemovidas };
}

// Mantém em DicionarioMidias só as chaves citadas pelas entradas que ficaram.
function podarDicionarioMidias(texto, dadosMantidos) {
    return texto.replace(RE_DICIONARIO_MIDIAS, (trecho, prefixo, json) => {
        let midias;
        try { midias = JSON.parse(json); } catch (e) { return trecho; }
        if (!midias || typeof midias !== 'object') return trecho;
        const usadas = {};
        for (const [nome, valor] of Object.entries(midias)) {
            if (dadosMantidos.includes(nome) || dadosMantidos.includes(jsonSeguro(nome).slice(1, -1))) usadas[nome] = valor;
        }
        return `${prefixo}${jsonSeguro(usadas)};`;
    });
}
