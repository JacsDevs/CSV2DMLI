// Utilitários puros (sem DOM) de manipulação do ícone do aplicativo e do logo do projeto.
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

// Enquadramento da imagem dentro do quadrado do ícone, independente de resolução:
//   zoom — porcentagem em que 100 = a imagem preenche o quadrado pelo menor lado
//          (sem sobras); abaixo do "zoom de encaixe" a imagem cabe inteira.
//   cx, cy — centro da imagem em frações do lado do quadrado (0.5 = centralizada).
// O editor (canvas e prévia por densidade) e o PNG final desenham pela mesma
// função (desenharEnquadrado), então a prévia é sempre idêntica ao resultado.

/**
 * Zoom em que a imagem inteira cabe no quadrado (lado maior = lado do quadrado).
 * Para imagens quadradas é 100.
 * @param {{width:number, height:number}} bitmap
 */
export function zoomEncaixe(bitmap) {
    return 100 * Math.min(bitmap.width, bitmap.height) / Math.max(bitmap.width, bitmap.height);
}

/**
 * Retângulo (em px de um quadrado de lado `tamanho`) ocupado pela imagem.
 * @param {{width:number, height:number}} bitmap
 * @param {{zoom:number, cx:number, cy:number}} enquadramento
 * @param {number} tamanho
 */
export function retanguloEnquadrado(bitmap, { zoom, cx, cy }, tamanho) {
    const escala = (tamanho * zoom / 100) / Math.min(bitmap.width, bitmap.height);
    const largura = bitmap.width * escala;
    const altura = bitmap.height * escala;
    return { x: cx * tamanho - largura / 2, y: cy * tamanho - altura / 2, largura, altura };
}

/**
 * Mantém o enquadramento coerente: num eixo em que a imagem é maior que o
 * quadrado, não deixa sobra; num eixo em que é menor, não deixa a imagem sair.
 * @returns {{zoom:number, cx:number, cy:number}} novo enquadramento
 */
export function limitarEnquadramento(bitmap, enquadramento) {
    const { largura, altura } = retanguloEnquadrado(bitmap, enquadramento, 1);
    const limitar = (centro, lado) => {
        const a = lado / 2;
        const b = 1 - lado / 2;
        return Math.min(Math.max(centro, Math.min(a, b)), Math.max(a, b));
    };
    return { ...enquadramento, cx: limitar(enquadramento.cx, largura), cy: limitar(enquadramento.cy, altura) };
}

/**
 * Desenha a imagem enquadrada num contexto 2D quadrado de lado `tamanho`,
 * preenchendo antes com `corFundo` (as sobras ficam com essa cor).
 */
export function desenharEnquadrado(ctx, tamanho, bitmap, enquadramento, corFundo = null) {
    if (corFundo) {
        ctx.fillStyle = corFundo;
        ctx.fillRect(0, 0, tamanho, tamanho);
    } else {
        ctx.clearRect(0, 0, tamanho, tamanho);
    }
    const r = retanguloEnquadrado(bitmap, enquadramento, tamanho);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, r.x, r.y, r.largura, r.altura);
}

/**
 * Gera o PNG quadrado do ícone a partir do enquadramento escolhido no editor.
 * @param {ImageBitmap} bitmap
 * @param {{zoom:number, cx:number, cy:number}} enquadramento
 * @param {number} [tamanhoSaida]
 * @param {string|null} [corFundo]
 * @returns {Promise<Uint8Array>}
 */
export async function gerarIconeEnquadrado(bitmap, enquadramento, tamanhoSaida = ICONE_TAMANHO_CANONICO, corFundo = null) {
    const canvas = new OffscreenCanvas(tamanhoSaida, tamanhoSaida);
    desenharEnquadrado(canvas.getContext('2d'), tamanhoSaida, bitmap, enquadramento, corFundo);
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

// Logo do projeto (cabeçalho): ao contrário do ícone, mantém a proporção original.
// A altura limite cobre o cabeçalho (~2.6rem / 40dp) em telas de densidade 3x–4x
// com folga; a largura limite segura logos muito horizontais.
export const LOGO_ALTURA_MAXIMA = 256;
export const LOGO_LARGURA_MAXIMA = 1024;

/**
 * Redimensiona o logo para caber em `alturaMax`×`larguraMax` sem recortar nem
 * distorcer (nunca amplia) e devolve um PNG, preservando a transparência.
 * @param {ImageBitmap|Uint8Array|Blob} origem
 * @param {number} [alturaMax]
 * @param {number} [larguraMax]
 * @param {{x:number, y:number, largura:number, altura:number}|null} [recorte] - região da
 *   imagem-fonte (px) a usar; null = imagem inteira
 * @returns {Promise<{bytes: Uint8Array, largura: number, altura: number}>}
 */
export async function redimensionarLogo(origem, alturaMax = LOGO_ALTURA_MAXIMA, larguraMax = LOGO_LARGURA_MAXIMA, recorte = null) {
    const bitmap = origem instanceof ImageBitmap ? origem : await carregarBitmap(origem);
    const r = recorte || { x: 0, y: 0, largura: bitmap.width, altura: bitmap.height };
    const escala = Math.min(1, alturaMax / r.altura, larguraMax / r.largura);
    const largura = Math.max(1, Math.round(r.largura * escala));
    const altura = Math.max(1, Math.round(r.altura * escala));
    const canvas = new OffscreenCanvas(largura, altura);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, r.x, r.y, r.largura, r.altura, 0, 0, largura, altura);
    return { bytes: await canvasParaPng(canvas), largura, altura };
}

/**
 * Prepara uma imagem para ser o logo do projeto. Guarda o original e o recorte
 * (não destrutivo: o editor de logo reabre sobre o original) e gera o PNG
 * reduzido do cabeçalho com a data: URL para embutir no HTML exportado.
 * @param {File|Blob} arquivo - imagem original
 * @param {{x:number, y:number, largura:number, altura:number}|null} [recorte]
 * @returns {Promise<{bytes: Uint8Array, dataUrl: string, nome: string, largura: number,
 *   altura: number, original: Blob, recorte: object|null}>}
 */
export async function processarLogo(arquivo, recorte = null) {
    const bitmap = await carregarBitmap(arquivo);
    try {
        const { bytes, largura, altura } = await redimensionarLogo(bitmap, LOGO_ALTURA_MAXIMA, LOGO_LARGURA_MAXIMA, recorte);
        const nomeBase = (arquivo.name || 'logo').replace(/\.[^.]+$/, '');
        const original = arquivo instanceof File ? arquivo : new File([arquivo], `${nomeBase}.png`, { type: arquivo.type || 'image/png' });
        return { bytes, dataUrl: bytesParaDataUrl(bytes), nome: `${nomeBase}.png`, largura, altura, original, recorte };
    } finally {
        bitmap.close?.();
    }
}

/**
 * Recorte do logo em resolução total (sem a redução do cabeçalho) — usado como
 * ponto de partida do ícone do app ("Usar o logo do projeto").
 * @param {Blob} original
 * @param {{x:number, y:number, largura:number, altura:number}|null} recorte
 * @returns {Promise<Uint8Array>}
 */
export async function recortarLogoOriginal(original, recorte) {
    return (await redimensionarLogo(original, Infinity, Infinity, recorte)).bytes;
}

/**
 * Detecta as margens "vazias" do logo (transparentes ou da cor do canto
 * superior esquerdo) e devolve o retângulo do conteúdo, em px da imagem-fonte.
 * A análise é feita numa cópia reduzida (até 1024px) para ser rápida em fotos grandes.
 * @param {ImageBitmap} bitmap
 * @returns {{x:number, y:number, largura:number, altura:number}|null} null se não achar conteúdo
 */
export function detectarConteudoLogo(bitmap) {
    const fator = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * fator));
    const h = Math.max(1, Math.round(bitmap.height * fator));
    const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;

    // Fundo = canto superior esquerdo: transparente (alfa baixo) ou uma cor sólida
    const [r0, g0, b0, a0] = [px[0], px[1], px[2], px[3]];
    const fundoTransparente = a0 < 16;
    const ehConteudo = (i) => fundoTransparente
        ? px[i + 3] >= 16
        : px[i + 3] >= 16 && (Math.abs(px[i] - r0) + Math.abs(px[i + 1] - g0) + Math.abs(px[i + 2] - b0)) > 48;

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!ehConteudo((y * w + x) * 4)) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < 0) return null;

    // Volta para px da imagem-fonte, com 1px (da cópia) de folga para não comer a borda
    const x = Math.max(0, (minX - 1) / fator);
    const y = Math.max(0, (minY - 1) / fator);
    const x2 = Math.min(bitmap.width, (maxX + 2) / fator);
    const y2 = Math.min(bitmap.height, (maxY + 2) / fator);
    return { x: Math.round(x), y: Math.round(y), largura: Math.round(x2 - x), altura: Math.round(y2 - y) };
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
    const maiorLado = Math.max(largura, altura);

    const avisos = [];
    if (maiorLado < ICONE_RESOLUCAO_MINIMA_RECOMENDADA) {
        avisos.push(
            `Resolução baixa (${largura}×${altura}px) — o recomendado é pelo menos ` +
            `${ICONE_RESOLUCAO_MINIMA_RECOMENDADA}×${ICONE_RESOLUCAO_MINIMA_RECOMENDADA}px. ` +
            `O ícone pode ficar borrado, principalmente em telas de alta densidade (xxxhdpi).`
        );
    } else if (menorLado < ICONE_RESOLUCAO_MINIMA_RECOMENDADA) {
        // Encaixada inteira, o lado maior ocupa os 512px; ao preencher, o lado menor é ampliado
        avisos.push(
            `Resolução de ${largura}×${altura}px: encaixada inteira fica nítida, mas ao ` +
            `preencher o quadrado (zoom 100% ou mais) pode ficar borrada.`
        );
    }
    if (Math.abs(proporcao - 1) > 0.01) {
        avisos.push('A imagem não é quadrada — ajuste o zoom e a posição; as sobras ficam com a cor de fundo.');
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
