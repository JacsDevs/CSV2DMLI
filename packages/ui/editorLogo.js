// Controller do diálogo de recorte do logo do projeto (Etapa 3 - Metadados).
// Opcional: o logo funciona sem passar por aqui. Ao contrário do editor de ícone
// (editorIcone.js), a imagem fica fixa e uma caixa de corte é movida e
// redimensionada sobre ela, em proporção livre ou travada (1:1, 2:1, 3:1).
//
// Função pública: abrirEditorLogo(original, recorte, titulo)
//   -> Promise<{ recorte: {x, y, largura, altura} | null } | null>
//   (recorte null = imagem inteira; retorno null = cancelado)
//
// Requer o markup do <dialog id="modalRecorteLogo"> (ver index.html).

import { carregarBitmap, detectarConteudoLogo } from '../core/iconeUtil.js';

const AREA_LARGURA = 560;   // caixa máxima (px CSS) em que a imagem é exibida
const AREA_ALTURA = 340;
const TOLERANCIA_ALCA = 12; // px CSS ao redor de uma alça que ainda contam como clique nela
const LADO_ALCA = 9;
const MIN_LADO_FONTE = 8;   // menor recorte permitido, em px da imagem-fonte
const PREVIA_ALTURA = 84;   // resolução interna da prévia do cabeçalho (exibida com 2.6rem)

let _bitmap = null;
let _recorte = null;        // {x, y, largura, altura} em px da imagem-fonte
let _proporcao = null;      // largura/altura travada, ou null (livre)
let _resolver = null;
let _wired = false;
let _arraste = null;        // { modo: 'mover'|'nw'|'n'|..., inicio: {x,y}, recorte }

function els() {
    return {
        dialog: document.getElementById('modalRecorteLogo'),
        canvas: document.getElementById('logoCropCanvas'),
        proporcoes: document.getElementById('logoProporcoes'),
        btnAparar: document.getElementById('btnLogoAparar'),
        btnRestaurar: document.getElementById('btnLogoRestaurar'),
        info: document.getElementById('logoRecorteInfo'),
        previa: document.getElementById('logoPreviaCanvas'),
        previaTitulo: document.getElementById('logoPreviaTitulo'),
        btnAplicar: document.getElementById('btnAplicarEditorLogo'),
        btnCancelar: document.getElementById('btnCancelarEditorLogo'),
        btnFechar: document.getElementById('btnFecharEditorLogo'),
    };
}

/**
 * @param {Blob} original - imagem original do logo
 * @param {{x:number, y:number, largura:number, altura:number}|null} recorte - recorte atual
 * @param {string} [titulo] - título do dicionário, para a prévia do cabeçalho
 */
export async function abrirEditorLogo(original, recorte = null, titulo = '') {
    garantirListeners();
    const { dialog, canvas, previaTitulo } = els();

    _bitmap?.close?.();
    _bitmap = await carregarBitmap(original);
    _recorte = recorte ? { ...recorte } : imagemInteira();
    selecionarProporcao(null, false);

    // Canvas no tamanho em que a imagem cabe na área (sem ampliar imagens pequenas além de 2x)
    const escala = Math.min(AREA_LARGURA / _bitmap.width, AREA_ALTURA / _bitmap.height, 2);
    canvas.width = Math.max(1, Math.round(_bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(_bitmap.height * escala));

    previaTitulo.textContent = titulo || 'Dicionário';
    dialog.showModal();
    redesenhar();   // depois de abrir: as alças dependem do tamanho exibido do canvas

    return new Promise((resolve) => {
        _resolver = resolve;
    });
}

function imagemInteira() {
    return { x: 0, y: 0, largura: _bitmap.width, altura: _bitmap.height };
}

function garantirListeners() {
    if (_wired) return;
    _wired = true;

    const { dialog, canvas, proporcoes, btnAparar, btnRestaurar, btnAplicar, btnCancelar, btnFechar } = els();

    canvas.addEventListener('pointerdown', (e) => {
        if (!_recorte) return;
        const p = pontoNaImagem(e);
        const modo = alcaEm(p) || (dentro(p, _recorte) ? 'mover' : null);
        if (!modo) return;
        _arraste = { modo, inicio: p, recorte: { ..._recorte } };
        canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
        const p = pontoNaImagem(e);
        if (!_arraste) {
            canvas.style.cursor = cursorPara(alcaEm(p) || (dentro(p, _recorte) ? 'mover' : null));
            return;
        }
        const dx = p.x - _arraste.inicio.x;
        const dy = p.y - _arraste.inicio.y;
        if (_arraste.modo === 'mover') moverRecorte(_arraste.recorte, dx, dy);
        else if (_proporcao) redimensionarComProporcao(_arraste.modo, p);
        else redimensionarLivre(_arraste.recorte, _arraste.modo, dx, dy);
        redesenhar();
    });

    const soltar = (e) => {
        if (!_arraste) return;
        _arraste = null;
        try { canvas.releasePointerCapture(e.pointerId); } catch { /* já liberado */ }
    };
    canvas.addEventListener('pointerup', soltar);
    canvas.addEventListener('pointercancel', soltar);

    proporcoes.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-proporcao]');
        if (!btn) return;
        const valor = btn.dataset.proporcao;
        selecionarProporcao(valor === 'livre' ? null : Number(valor), true);
    });

    btnAparar.addEventListener('click', () => {
        if (!_bitmap) return;
        const conteudo = detectarConteudoLogo(_bitmap);
        if (!conteudo) return;
        // Aparar define um recorte exato do conteúdo: volta para proporção livre
        selecionarProporcao(null, false);
        _recorte = conteudo;
        redesenhar();
    });

    btnRestaurar.addEventListener('click', () => {
        if (!_bitmap) return;
        selecionarProporcao(null, false);
        _recorte = imagemInteira();
        redesenhar();
    });

    btnAplicar.addEventListener('click', () => {
        if (!_bitmap || !_recorte) return;
        const r = arredondar(_recorte);
        const inteira = r.x === 0 && r.y === 0 && r.largura === _bitmap.width && r.altura === _bitmap.height;
        finalizar({ recorte: inteira ? null : r });
    });
    btnCancelar.addEventListener('click', () => finalizar(null));
    btnFechar.addEventListener('click', () => finalizar(null));
    dialog.addEventListener('cancel', () => finalizar(null)); // tecla Esc
}

// ---------- Geometria ----------

function escalaCss() {
    // px da imagem-fonte por px CSS do canvas (o CSS responsivo pode encolher o canvas)
    const largura = els().canvas.getBoundingClientRect().width || els().canvas.width;
    return _bitmap.width / largura;
}

function pontoNaImagem(e) {
    const rect = els().canvas.getBoundingClientRect();
    const k = escalaCss();
    return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k };
}

function dentro(p, r) {
    return r && p.x >= r.x && p.x <= r.x + r.largura && p.y >= r.y && p.y <= r.y + r.altura;
}

function posicoesAlcas(r) {
    const xm = r.x + r.largura / 2, ym = r.y + r.altura / 2;
    const x2 = r.x + r.largura, y2 = r.y + r.altura;
    const cantos = { nw: [r.x, r.y], ne: [x2, r.y], se: [x2, y2], sw: [r.x, y2] };
    // Com proporção travada, só os cantos: as laterais mudariam a proporção
    return _proporcao ? cantos : { ...cantos, n: [xm, r.y], e: [x2, ym], s: [xm, y2], w: [r.x, ym] };
}

function alcaEm(p) {
    if (!_recorte) return null;
    const tol = TOLERANCIA_ALCA * escalaCss();
    for (const [id, [x, y]] of Object.entries(posicoesAlcas(_recorte))) {
        if (Math.abs(p.x - x) <= tol && Math.abs(p.y - y) <= tol) return id;
    }
    return null;
}

function cursorPara(modo) {
    if (!modo) return 'default';
    if (modo === 'mover') return 'move';
    return `${modo}-resize`;
}

function moverRecorte(inicio, dx, dy) {
    _recorte = {
        ...inicio,
        x: limitar(inicio.x + dx, 0, _bitmap.width - inicio.largura),
        y: limitar(inicio.y + dy, 0, _bitmap.height - inicio.altura),
    };
}

function redimensionarLivre(inicio, modo, dx, dy) {
    let x1 = inicio.x, y1 = inicio.y;
    let x2 = inicio.x + inicio.largura, y2 = inicio.y + inicio.altura;
    if (modo.includes('w')) x1 = limitar(x1 + dx, 0, x2 - MIN_LADO_FONTE);
    if (modo.includes('e')) x2 = limitar(x2 + dx, x1 + MIN_LADO_FONTE, _bitmap.width);
    if (modo.includes('n')) y1 = limitar(y1 + dy, 0, y2 - MIN_LADO_FONTE);
    if (modo.includes('s')) y2 = limitar(y2 + dy, y1 + MIN_LADO_FONTE, _bitmap.height);
    _recorte = { x: x1, y: y1, largura: x2 - x1, altura: y2 - y1 };
}

// Canto arrastado com proporção travada: o canto oposto fica fixo (âncora)
function redimensionarComProporcao(modo, p) {
    const r = _arraste.recorte;
    const paraLeste = modo.includes('e');
    const paraSul = modo.includes('s');
    const ancoraX = paraLeste ? r.x : r.x + r.largura;
    const ancoraY = paraSul ? r.y : r.y + r.altura;
    const disponivelX = paraLeste ? _bitmap.width - ancoraX : ancoraX;
    const disponivelY = paraSul ? _bitmap.height - ancoraY : ancoraY;

    let largura = Math.max(Math.abs(p.x - ancoraX), Math.abs(p.y - ancoraY) * _proporcao);
    largura = Math.min(largura, disponivelX, disponivelY * _proporcao);
    largura = Math.max(largura, MIN_LADO_FONTE * Math.max(1, _proporcao));
    const altura = largura / _proporcao;
    _recorte = {
        x: paraLeste ? ancoraX : ancoraX - largura,
        y: paraSul ? ancoraY : ancoraY - altura,
        largura,
        altura,
    };
}

// Maior caixa com a proporção pedida que cabe na imagem, centrada no recorte atual
function aplicarProporcao() {
    if (!_proporcao || !_recorte) return;
    const largura = Math.min(_bitmap.width, _bitmap.height * _proporcao);
    const altura = largura / _proporcao;
    const cx = _recorte.x + _recorte.largura / 2;
    const cy = _recorte.y + _recorte.altura / 2;
    _recorte = {
        largura,
        altura,
        x: limitar(cx - largura / 2, 0, _bitmap.width - largura),
        y: limitar(cy - altura / 2, 0, _bitmap.height - altura),
    };
}

function selecionarProporcao(proporcao, aplicar) {
    _proporcao = proporcao;
    els().proporcoes.querySelectorAll('button[data-proporcao]').forEach((btn) => {
        const valor = btn.dataset.proporcao === 'livre' ? null : Number(btn.dataset.proporcao);
        btn.setAttribute('aria-pressed', String(valor === proporcao));
    });
    if (aplicar) {
        aplicarProporcao();
        redesenhar();
    }
}

function limitar(v, min, max) {
    return Math.min(Math.max(v, min), max);
}

function arredondar(r) {
    const x = Math.round(r.x), y = Math.round(r.y);
    return {
        x, y,
        largura: Math.min(Math.round(r.largura), _bitmap.width - x),
        altura: Math.min(Math.round(r.altura), _bitmap.height - y),
    };
}

// ---------- Desenho ----------

function redesenhar() {
    if (!_bitmap || !_recorte) return;
    const { canvas } = els();
    const ctx = canvas.getContext('2d');
    const k = canvas.width / _bitmap.width;   // px do canvas por px da imagem
    const r = { x: _recorte.x * k, y: _recorte.y * k, largura: _recorte.largura * k, altura: _recorte.altura * k };

    // O fundo xadrez (transparência) vem do CSS do canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(_bitmap, 0, 0, canvas.width, canvas.height);

    // Escurece o que fica fora do recorte
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.rect(r.x, r.y, r.largura, r.altura);
    ctx.fill('evenodd');
    ctx.restore();

    // Borda tracejada dupla (preto + branco) para aparecer sobre qualquer cor
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.strokeRect(r.x, r.y, r.largura, r.altura);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineDashOffset = 5;
    ctx.strokeRect(r.x, r.y, r.largura, r.altura);
    ctx.restore();

    // Alças, em px do canvas proporcionais ao tamanho exibido
    const lado = LADO_ALCA * (canvas.width / (canvas.getBoundingClientRect().width || canvas.width));
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 1;
    for (const [x, y] of Object.values(posicoesAlcas(_recorte))) {
        ctx.fillRect(x * k - lado / 2, y * k - lado / 2, lado, lado);
        ctx.strokeRect(x * k - lado / 2, y * k - lado / 2, lado, lado);
    }
    ctx.restore();

    const final = arredondar(_recorte);
    els().info.textContent = `Recorte: ${final.largura}×${final.altura}px (original ${_bitmap.width}×${_bitmap.height}px)`;
    desenharPrevia(final);
}

// Prévia do cabeçalho: o recorte com altura fixa, como .dicionario-icone-img no HTML exportado
function desenharPrevia(r) {
    const { previa } = els();
    const altura = PREVIA_ALTURA;
    const largura = Math.max(1, Math.round(altura * r.largura / r.altura));
    previa.width = largura;
    previa.height = altura;
    const ctx = previa.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, largura, altura);
    ctx.drawImage(_bitmap, r.x, r.y, r.largura, r.altura, 0, 0, largura, altura);
}

function finalizar(resultado) {
    const { dialog } = els();
    if (dialog.open) dialog.close();

    _bitmap?.close?.();
    _bitmap = null;
    _recorte = null;
    _arraste = null;

    const resolve = _resolver;
    _resolver = null;
    if (resolve) resolve(resultado);
}
