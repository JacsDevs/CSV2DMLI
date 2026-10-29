// Controller do diálogo de enquadramento do ícone do aplicativo.
// Isolado do index.html (script inline já é grande demais) — expõe uma única
// função pública: abrirEditorIcone(origem) -> Promise<{bytes, dataUrl, nome}|null>.
//
// A imagem é um retângulo com zoom e posição livres dentro do quadrado do ícone
// (ver "Enquadramento" em packages/core/iconeUtil.js): abre inteira (encaixada),
// e o usuário decide se amplia, arrasta ou preenche; as sobras ficam com a cor de fundo.
//
// Requer que o markup do <dialog id="modalRecorteIcone"> já exista na página
// (ver index.html) com os IDs referenciados em els().

import {
    carregarBitmap,
    analisarImagem,
    bytesParaDataUrl,
    zoomEncaixe,
    limitarEnquadramento,
    desenharEnquadrado,
    gerarIconeEnquadrado,
    DENSIDADES_ANDROID,
    ICONE_TAMANHO_CANONICO,
} from '../core/iconeUtil.js';

const VIEWPORT = 360;   // px de exibição do canvas de recorte (== resolução interna)
const ZOOM_REF = 100;   // 100% = a imagem preenche o quadrado pelo menor lado, sem sobras
const ZOOM_MAX = 400;
const ZOOM_PASSO_RODA = 5;
const DENSIDADE_ROUND_PREVIEW = 96; // tamanho de referência p/ prévia do ícone redondo
const COR_FUNDO_PADRAO = '#FFFFFF';

let _bitmap = null;
let _enq = null;         // {zoom, cx, cy} — ver retanguloEnquadrado() em iconeUtil.js
let _zoomMin = 10;
let _corFundo = COR_FUNDO_PADRAO;
let _nomeAtual = 'icone.png';
let _resolver = null;
let _wired = false;
let _arrastando = false;
let _debounceGrid = null;

function els() {
    return {
        dialog: document.getElementById('modalRecorteIcone'),
        canvas: document.getElementById('iconeCropCanvas'),
        zoom: document.getElementById('iconeCropZoom'),
        zoomValor: document.getElementById('iconeCropZoomValor'),
        bgColor: document.getElementById('iconeCropBgColor'),
        info: document.getElementById('iconeInfoPanel'),
        grid: document.getElementById('iconeDensityGrid'),
        btnAplicar: document.getElementById('btnAplicarEditorIcone'),
        btnCancelar: document.getElementById('btnCancelarEditorIcone'),
        btnFechar: document.getElementById('btnFecharEditorIcone'),
        btnTrocar: document.getElementById('btnIconeTrocarImagem'),
        inputTroca: document.getElementById('inputIconeTrocarImagem'),
        btnEncaixar: document.getElementById('btnIconeEncaixar'),
        btnPreencher: document.getElementById('btnIconePreencher'),
    };
}

/**
 * Abre o editor para a imagem informada e aguarda a decisão do usuário.
 * @param {File | { dataUrl: string, bytes?: Uint8Array, nome?: string }} origem
 * @returns {Promise<{ bytes: Uint8Array, dataUrl: string, nome: string } | null>}
 */
export async function abrirEditorIcone(origem) {
    garantirListeners();
    const { dialog } = els();

    const arquivo = origem instanceof File
        ? origem
        : await dataUrlParaFile(origem.dataUrl, origem.nome || 'icone.png');

    await carregarOrigem(arquivo);
    dialog.showModal();

    return new Promise((resolve) => {
        _resolver = resolve;
    });
}

async function dataUrlParaFile(dataUrl, nome) {
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    return new File([blob], nome, { type: blob.type || 'image/png' });
}

function garantirListeners() {
    if (_wired) return;
    _wired = true;

    const { canvas, zoom, bgColor, btnAplicar, btnCancelar, btnFechar, btnTrocar, inputTroca, dialog, btnEncaixar, btnPreencher } = els();

    let inicioPointer = null;
    let inicioEnq = null;

    canvas.addEventListener('pointerdown', (e) => {
        if (!_enq) return;
        _arrastando = true;
        canvas.classList.add('arrastando');
        canvas.setPointerCapture(e.pointerId);
        inicioPointer = { x: e.clientX, y: e.clientY };
        inicioEnq = { ..._enq };
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!_arrastando || !inicioEnq) return;
        // Usa o tamanho renderizado (CSS) real do canvas, não a constante VIEWPORT,
        // para que o arraste continue calibrado 1:1 mesmo quando o CSS responsivo
        // (telas estreitas) redimensiona o canvas para menos de 360px.
        const lado = canvas.getBoundingClientRect().width || VIEWPORT;
        definirEnquadramento({
            ...inicioEnq,
            cx: inicioEnq.cx + (e.clientX - inicioPointer.x) / lado,
            cy: inicioEnq.cy + (e.clientY - inicioPointer.y) / lado,
        });
    });

    const soltar = (e) => {
        if (!_arrastando) return;
        _arrastando = false;
        canvas.classList.remove('arrastando');
        try { canvas.releasePointerCapture(e.pointerId); } catch { /* já liberado */ }
    };
    canvas.addEventListener('pointerup', soltar);
    canvas.addEventListener('pointercancel', soltar);

    canvas.addEventListener('wheel', (e) => {
        if (!_enq) return;
        e.preventDefault();
        aplicarZoom(_enq.zoom + (e.deltaY < 0 ? ZOOM_PASSO_RODA : -ZOOM_PASSO_RODA));
    }, { passive: false });

    zoom.addEventListener('input', () => aplicarZoom(Number(zoom.value)));

    btnEncaixar.addEventListener('click', () => {
        if (_bitmap) definirEnquadramento({ zoom: zoomEncaixe(_bitmap), cx: 0.5, cy: 0.5 });
    });
    btnPreencher.addEventListener('click', () => {
        if (_bitmap) definirEnquadramento({ zoom: ZOOM_REF, cx: 0.5, cy: 0.5 });
    });

    bgColor.addEventListener('input', () => {
        _corFundo = bgColor.value;
        redesenhar();
    });

    btnAplicar.addEventListener('click', async () => {
        if (!_bitmap || !_enq) return;
        btnAplicar.disabled = true;
        try {
            const bytes = await gerarIconeEnquadrado(_bitmap, _enq, ICONE_TAMANHO_CANONICO, _corFundo);
            const dataUrl = bytesParaDataUrl(bytes);
            finalizar({ bytes, dataUrl, nome: _nomeAtual });
        } finally {
            btnAplicar.disabled = false;
        }
    });
    btnCancelar.addEventListener('click', () => finalizar(null));
    btnFechar.addEventListener('click', () => finalizar(null));
    dialog.addEventListener('cancel', () => finalizar(null)); // tecla Esc

    btnTrocar.addEventListener('click', () => inputTroca.click());
    inputTroca.addEventListener('change', async () => {
        const file = inputTroca.files[0];
        inputTroca.value = '';
        if (file) await carregarOrigem(file);
    });
}

async function carregarOrigem(file) {
    _nomeAtual = file.name || 'icone.png';
    _bitmap?.close?.();
    _bitmap = await carregarBitmap(file);

    // Abre com a imagem inteira visível (encaixada): nada é cortado até o usuário decidir.
    // O zoom mínimo vai até a metade do encaixe, para quem quiser margem extra.
    const encaixe = zoomEncaixe(_bitmap);
    _zoomMin = Math.max(5, Math.floor(encaixe / 2));
    const { zoom } = els();
    zoom.min = String(_zoomMin);
    zoom.max = String(ZOOM_MAX);
    definirEnquadramento({ zoom: encaixe, cx: 0.5, cy: 0.5 });
    await atualizarInfo(file);
}

// Zoom em torno do centro do quadrado: o ponto da imagem que está no centro continua no centro
function aplicarZoom(novoZoom) {
    if (!_enq) return;
    const zoom = Math.min(Math.max(novoZoom, _zoomMin), ZOOM_MAX);
    const fator = zoom / _enq.zoom;
    definirEnquadramento({
        zoom,
        cx: 0.5 + (_enq.cx - 0.5) * fator,
        cy: 0.5 + (_enq.cy - 0.5) * fator,
    });
}

function definirEnquadramento(enq) {
    _enq = limitarEnquadramento(_bitmap, enq);
    const { zoom, zoomValor } = els();
    zoom.value = String(Math.round(_enq.zoom));
    if (zoomValor) zoomValor.textContent = `${Math.round(_enq.zoom)}%`;
    redesenhar();
}

function redesenhar() {
    if (!_bitmap || !_enq) return;
    const { canvas } = els();
    const ctx = canvas.getContext('2d');
    desenharEnquadrado(ctx, VIEWPORT, _bitmap, _enq, _corFundo);
    desenharSafeZone(ctx);

    clearTimeout(_debounceGrid);
    _debounceGrid = setTimeout(atualizarGradeDensidades, 80);
}

/**
 * Círculo-guia (sem preenchimento) mostrando a área que sobrevive caso o
 * launcher corte o ícone como redondo/squircle. Traço duplo (preto + branco
 * intercalados) para permanecer visível em qualquer cor de fundo.
 */
function desenharSafeZone(ctx) {
    const cx = VIEWPORT / 2;
    const cy = VIEWPORT / 2;
    const raio = VIEWPORT / 2 - 1;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, raio, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.lineDashOffset = 0;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineDashOffset = 5;
    ctx.stroke();

    ctx.restore();
}

function atualizarGradeDensidades() {
    if (!_bitmap || !_enq) return;
    const { grid } = els();
    grid.innerHTML = '';

    Object.entries(DENSIDADES_ANDROID).forEach(([sizeStr, { label }]) => {
        const tamanho = Number(sizeStr);
        grid.appendChild(criarItemGrade(label, tamanho, false));
    });

    grid.appendChild(criarItemGrade('round', DENSIDADE_ROUND_PREVIEW, true));
}

function criarItemGrade(rotulo, tamanho, redondo) {
    const item = document.createElement('div');
    item.className = 'icone-density-item';

    const canvasEl = document.createElement('canvas');
    canvasEl.width = tamanho;
    canvasEl.height = tamanho;
    canvasEl.className = redondo
        ? 'icone-density-thumb icone-density-thumb-round'
        : 'icone-density-thumb';

    const ctx = canvasEl.getContext('2d');
    if (redondo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(tamanho / 2, tamanho / 2, tamanho / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
    }
    desenharEnquadrado(ctx, tamanho, _bitmap, _enq, _corFundo);
    if (redondo) ctx.restore();

    const label = document.createElement('span');
    label.textContent = `${rotulo} · ${tamanho}px`;

    item.appendChild(canvasEl);
    item.appendChild(label);
    return item;
}

async function atualizarInfo(file) {
    const { info } = els();
    const analise = await analisarImagem(file);
    const tamanhoKb = analise.tamanhoBytes != null ? (analise.tamanhoBytes / 1024).toFixed(1) : '?';

    const avisosHtml = analise.avisos.length
        ? `<ul class="icone-info-avisos">${analise.avisos.map((a) => `<li>⚠️ ${escapeHtml(a)}</li>`).join('')}</ul>`
        : '<p class="icone-info-ok">✅ Nenhum problema detectado.</p>';

    info.innerHTML = `
        <dl class="icone-info-dl">
            <dt>Dimensões originais</dt><dd>${analise.largura}×${analise.altura}px</dd>
            <dt>Formato</dt><dd>${escapeHtml(analise.formato)}</dd>
            <dt>Tamanho do arquivo</dt><dd>${tamanhoKb} KB</dd>
        </dl>
        ${avisosHtml}
    `;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function finalizar(resultado) {
    const { dialog } = els();
    if (dialog.open) dialog.close();

    _bitmap?.close?.();
    _bitmap = null;
    _enq = null;

    const resolve = _resolver;
    _resolver = null;
    if (resolve) resolve(resultado);
}
