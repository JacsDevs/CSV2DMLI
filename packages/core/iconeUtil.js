// Utilitários puros (sem DOM) de manipulação do ícone do aplicativo.
// Compartilhado entre o editor de ícone (packages/ui/editorIcone.js) e o
// empacotador Android (packages/android/injetorAab.js), para que a prévia
// mostrada ao usuário seja sempre idêntica ao que é injetado no AAB/APK.

// Sufixo -v4 é adicionado pelo AAPT2 para recursos de densidade (API 4+ = Android 1.6+).
// Estes são os paths reais gerados pelo Gradle e presentes no resources.arsc dos templates.
export const DENSIDADES_ANDROID = {
    48:  { pasta: 'mdpi',    label: 'mdpi'    },
    72:  { pasta: 'hdpi',    label: 'hdpi'    },
    96:  { pasta: 'xhdpi',   label: 'xhdpi'   },
    144: { pasta: 'xxhdpi',  label: 'xxhdpi'  },
    192: { pasta: 'xxxhdpi', label: 'xxxhdpi' },
};

// Tamanho do PNG "mestre" produzido pelo editor de recorte. Maior que a maior
// densidade (192px), então gerar as densidades a partir dele nunca faz upscale.
export const ICONE_TAMANHO_CANONICO = 512;
export const ICONE_RESOLUCAO_MINIMA_RECOMENDADA = 512;

/**
 * Carrega bytes/blob/file como ImageBitmap.
 * @param {Uint8Array|ArrayBuffer|Blob|File} origem
 */
export async function carregarBitmap(origem) {
    const blob = origem instanceof Blob ? origem : new Blob([origem]);
    return createImageBitmap(blob);
}

async function canvasParaPng(canvas) {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Converte bytes crus em data: URL base64 — usado quando o resultado precisa
 * sobreviver fora da sessão atual (ex.: embutido no HTML exportado), ao
 * contrário de um blob: URL (URL.createObjectURL), que só é válido enquanto
 * a página que o criou continuar aberta.
 * @param {Uint8Array} bytes
 * @param {string} [mime]
 */
export function bytesParaDataUrl(bytes, mime = 'image/png') {
    let binario = '';
    const tamanhoBloco = 0x8000;
    for (let i = 0; i < bytes.length; i += tamanhoBloco) {
        binario += String.fromCharCode.apply(null, bytes.subarray(i, i + tamanhoBloco));
    }
    return `data:${mime};base64,${btoa(binario)}`;
}

/**
 * Recorta uma região quadrada da imagem original (coordenadas em pixels da
 * imagem-fonte) e devolve o PNG já redimensionado para `tamanhoSaida`.
 * Usado pelo editor de recorte ao confirmar o ajuste do usuário.
 * @param {ImageBitmap} bitmap
 * @param {{x:number, y:number, tamanho:number}} regiao
 * @param {number} [tamanhoSaida]
 * @param {{corFundo?: string, escala?: number}} [opcoes] - `corFundo` preenche o
 *   canvas antes de desenhar (mesmo efeito do fundo dinâmico da prévia); `escala`
 *   (0–1) encolhe a imagem final mantendo-a centralizada, reproduzindo o zoom
 *   abaixo de 100% do editor (margens ficam com `corFundo`).
 * @returns {Promise<Uint8Array>}
 */
export async function cortarQuadrado(bitmap, { x, y, tamanho }, tamanhoSaida = ICONE_TAMANHO_CANONICO, opcoes = {}) {
    const { corFundo = null, escala = 1 } = opcoes;
    const canvas = new OffscreenCanvas(tamanhoSaida, tamanhoSaida);
    const ctx = canvas.getContext('2d');

    if (corFundo) {
        ctx.fillStyle = corFundo;
        ctx.fillRect(0, 0, tamanhoSaida, tamanhoSaida);
    }

    const lado = tamanhoSaida * escala;
    const offset = (tamanhoSaida - lado) / 2;
    ctx.drawImage(bitmap, x, y, tamanho, tamanho, offset, offset, lado, lado);
    return canvasParaPng(canvas);
}

/**
 * Redimensiona uma imagem (já preferencialmente quadrada) para `tamanho`.
 * Se a entrada não for quadrada (ex.: caminho que não passou pelo editor de
 * recorte), faz um center-crop defensivo em vez de esticar — evita distorcer
 * o ícone.
 * @param {ImageBitmap|Uint8Array|Blob} origem
 * @param {number} tamanho
 * @returns {Promise<Uint8Array>}
 */
export async function redimensionarParaPng(origem, tamanho) {
    const bitmap = origem instanceof ImageBitmap ? origem : await carregarBitmap(origem);
    const canvas = new OffscreenCanvas(tamanho, tamanho);
    const ctx = canvas.getContext('2d');

    const lado = Math.min(bitmap.width, bitmap.height);
    const offsetX = (bitmap.width - lado) / 2;
    const offsetY = (bitmap.height - lado) / 2;
    ctx.drawImage(bitmap, offsetX, offsetY, lado, lado, 0, 0, tamanho, tamanho);

    return canvasParaPng(canvas);
}

/**
 * Redimensiona e aplica máscara circular — usado para gerar o ic_launcher_round
 * de fato circular (hoje o projeto reusa o PNG quadrado sem máscara nenhuma).
 * @param {ImageBitmap|Uint8Array|Blob} origem
 * @param {number} tamanho
 * @returns {Promise<Uint8Array>}
 */
export async function aplicarMascaraCircular(origem, tamanho) {
    const bitmap = origem instanceof ImageBitmap ? origem : await carregarBitmap(origem);
    const canvas = new OffscreenCanvas(tamanho, tamanho);
    const ctx = canvas.getContext('2d');

    ctx.save();
    ctx.beginPath();
    ctx.arc(tamanho / 2, tamanho / 2, tamanho / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const lado = Math.min(bitmap.width, bitmap.height);
    const offsetX = (bitmap.width - lado) / 2;
    const offsetY = (bitmap.height - lado) / 2;
    ctx.drawImage(bitmap, offsetX, offsetY, lado, lado, 0, 0, tamanho, tamanho);
    ctx.restore();

    return canvasParaPng(canvas);
}

/**
 * Analisa um arquivo de imagem e devolve dimensões, proporção e avisos não
 * bloqueantes (resolução baixa, imagem não quadrada, formato incomum).
 * @param {File} file
 */
export async function analisarImagem(file) {
    const bitmap = await carregarBitmap(file);
    const largura = bitmap.width;
    const altura = bitmap.height;
    const proporcao = largura / altura;
    const menorLado = Math.min(largura, altura);

    const avisos = [];
    if (menorLado < ICONE_RESOLUCAO_MINIMA_RECOMENDADA) {
        avisos.push(
            `Resolução baixa (${largura}×${altura}px) — o recomendado é pelo menos ` +
            `${ICONE_RESOLUCAO_MINIMA_RECOMENDADA}×${ICONE_RESOLUCAO_MINIMA_RECOMENDADA}px. ` +
            `O ícone pode ficar borrado, principalmente em telas de alta densidade (xxxhdpi).`
        );
    }
    if (Math.abs(proporcao - 1) > 0.01) {
        avisos.push('A imagem não é quadrada — será recortada para caber num quadrado.');
    }

    const formato = (file.type || '').replace('image/', '').toUpperCase() || 'DESCONHECIDO';
    if (file.type && file.type !== 'image/png') {
        avisos.push(`Formato ${formato} detectado — PNG é recomendado para ícones (suporta transparência).`);
    }

    bitmap.close?.();

    return {
        largura,
        altura,
        proporcao,
        tamanhoBytes: file.size ?? null,
        formato,
        avisos,
    };
}
