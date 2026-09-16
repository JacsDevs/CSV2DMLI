// Controller do diálogo de recorte de ícone do aplicativo.
// Isolado do index.html (script inline já é grande demais) — expõe uma única
// função pública: abrirEditorIcone(origem) -> Promise<{bytes, dataUrl, nome}|null>.
//
// Requer que o markup do <dialog id="modalRecorteIcone"> já exista na página
// (ver index.html) com os IDs referenciados em els().

import {
    carregarBitmap,
    cortarQuadrado,
    analisarImagem,
    bytesParaDataUrl,
    DENSIDADES_ANDROID,
    ICONE_TAMANHO_CANONICO,
} from '../core/iconeUtil.js';

const VIEWPORT = 360;   // px de exibição do canvas de recorte (== resolução interna)
const ZOOM_MIN = 0;
const ZOOM_REF = 100;   // 100% = tamanho "de encaixe" (fit) da imagem, sem corte nem margem
const ZOOM_MAX = 400;
const DENSIDADE_ROUND_PREVIEW = 96; // tamanho de referência p/ prévia do ícone redondo
const COR_FUNDO_PADRAO = '#FFFFFF';

let _bitmap = null;
let _regiao = null;      // {x, y, tamanho} em px da imagem-fonte — janela de corte atual (zoom >= 100%)
let _regiaoBase = null;  // {x, y, tamanho} — janela de "fit" (imagem inteira, centralizada), fixa
let _baseTamanho = null; // tamanho (px-fonte) correspondente a zoom = 100%
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
    };
}

/**
 * Abre o editor de recorte para a imagem informada e aguarda a decisão do usuário.
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

    const { canvas, zoom, zoomValor, bgColor, btnAplicar, btnCancelar, btnFechar, btnTrocar, inputTroca, dialog } = els();

    let inicioPointer = null;
    let inicioRegiao = null;

    canvas.addEventListener('pointerdown', (e) => {
        // Abaixo de 100% a região de corte é a "base" fixa (imagem inteira) —
        // arrastar não faz sentido enquanto não houver corte de fato.
        if (!_regiao || Number(zoom.value) < ZOOM_REF) return;
        _arrastando = true;
        canvas.classList.add('arrastando');
        canvas.setPointerCapture(e.pointerId);
        inicioPointer = { x: e.clientX, y: e.clientY };
        inicioRegiao = { ..._regiao };
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!_arrastando || !inicioRegiao) return;
        // Usa o tamanho renderizado (CSS) real do canvas, não a constante VIEWPORT,
        // para que o arraste continue calibrado 1:1 mesmo quando o CSS responsivo
        // (telas estreitas) redimensiona o canvas para menos de 360px.
        const larguraRenderizada = canvas.getBoundingClientRect().width || VIEWPORT;
        const escala = inicioRegiao.tamanho / larguraRenderizada;
        const dx = (e.clientX - inicioPointer.x) * escala;
        const dy = (e.clientY - inicioPointer.y) * escala;
        _regiao = { ...inicioRegiao, x: inicioRegiao.x - dx, y: inicioRegiao.y - dy };
        clampRegiao();
        redesenhar();
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
        if (!_regiao) return;
        e.preventDefault();
        const passo = e.deltaY < 0 ? 10 : -10;
        zoom.value = String(clamp(Number(zoom.value) + passo, ZOOM_MIN, ZOOM_MAX));
        aplicarZoom();
    }, { passive: false });

    zoom.addEventListener('input', () => {
        if (zoomValor) zoomValor.textContent = `${zoom.value}%`;
        aplicarZoom();
    });

    bgColor.addEventListener('input', () => {
        _corFundo = bgColor.value;
        redesenhar();
    });

    btnAplicar.addEventListener('click', async () => {
        if (!_bitmap || !_regiao) return;
        btnAplicar.disabled = true;
        try {
            const zoomPct = Number(zoom.value);
            const escala = zoomPct < ZOOM_REF ? zoomPct / ZOOM_REF : 1;
            const bytes = await cortarQuadrado(_bitmap, _regiao, ICONE_TAMANHO_CANONICO, {
                corFundo: _corFundo,
                escala,
            });
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

    const lado = Math.min(_bitmap.width, _bitmap.height);
    _baseTamanho = lado;
    _regiaoBase = {
        x: (_bitmap.width - lado) / 2,
        y: (_bitmap.height - lado) / 2,
        tamanho: lado,
    };
    _regiao = { ..._regiaoBase };

    const { zoom, zoomValor } = els();
    zoom.value = String(ZOOM_REF);
    if (zoomValor) zoomValor.textContent = `${ZOOM_REF}%`;
    redesenhar();
    await atualizarInfo(file);
}

function aplicarZoom() {
    if (!_regiaoBase || !_baseTamanho) return;
    const zoomPct = Number(els().zoom.value);

    if (zoomPct >= ZOOM_REF) {
        // 100–400%: encolhe a janela de origem (crop), sempre preenchendo o canvas.
        const atual = _regiao || _regiaoBase;
        const centroX = atual.x + atual.tamanho / 2;
        const centroY = atual.y + atual.tamanho / 2;
        const novoTamanho = _baseTamanho * (ZOOM_REF / zoomPct);
        _regiao = {
            tamanho: novoTamanho,
            x: centroX - novoTamanho / 2,
            y: centroY - novoTamanho / 2,
        };
        clampRegiao();
    } else {
        // 0–100%: a região de corte volta a ser a base fixa (imagem inteira,
        // centralizada) — o zoom reduzido só encolhe o desenho dentro do
        // canvas, sem distorcer, sobrando a cor de fundo nas margens.
        _regiao = { ..._regiaoBase };
    }

    redesenhar();
}

function clampRegiao() {
    if (!_bitmap || !_regiao) return;
    _regiao.tamanho = Math.min(_regiao.tamanho, _bitmap.width, _bitmap.height);
    _regiao.x = clamp(_regiao.x, 0, _bitmap.width - _regiao.tamanho);
    _regiao.y = clamp(_regiao.y, 0, _bitmap.height - _regiao.tamanho);
}

function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
}

function redesenhar() {
    const { canvas } = els();
    const ctx = canvas.getContext('2d');
    const zoomPct = Number(els().zoom.value);

    ctx.clearRect(0, 0, VIEWPORT, VIEWPORT);
    ctx.fillStyle = _corFundo;
    ctx.fillRect(0, 0, VIEWPORT, VIEWPORT);

    if (_bitmap && _regiao) {
        if (zoomPct >= ZOOM_REF) {
            ctx.drawImage(_bitmap, _regiao.x, _regiao.y, _regiao.tamanho, _regiao.tamanho, 0, 0, VIEWPORT, VIEWPORT);
        } else {
            // Zoom < 100%: desenha a imagem inteira reduzida e centralizada
            // (sem distorcer) — o espaço restante mostra a cor de fundo.
            const lado = VIEWPORT * (zoomPct / ZOOM_REF);
            const offset = (VIEWPORT - lado) / 2;
            ctx.drawImage(_bitmap, _regiao.x, _regiao.y, _regiao.tamanho, _regiao.tamanho, offset, offset, lado, lado);
        }
    }

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
    if (!_bitmap || !_regiao) return;
    const { grid } = els();
    const zoomPct = Number(els().zoom.value);
    grid.innerHTML = '';

    Object.entries(DENSIDADES_ANDROID).forEach(([sizeStr, { label }]) => {
        const tamanho = Number(sizeStr);
        grid.appendChild(criarItemGrade(label, tamanho, tamanho, false, zoomPct));
    });

    grid.appendChild(criarItemGrade('round', DENSIDADE_ROUND_PREVIEW, DENSIDADE_ROUND_PREVIEW, true, zoomPct));
}

function criarItemGrade(rotulo, tamanhoPx, tamanhoCanvas, redondo, zoomPct) {
    const item = document.createElement('div');
    item.className = 'icone-density-item';

    const canvasEl = document.createElement('canvas');
    canvasEl.width = tamanhoCanvas;
    canvasEl.height = tamanhoCanvas;
    canvasEl.className = redondo
        ? 'icone-density-thumb icone-density-thumb-round'
        : 'icone-density-thumb';

    const ctx = canvasEl.getContext('2d');

    // Fundo primeiro — inclusive sob o clip redondo, senão o recorte
    // circular mostraria transparência em vez da cor escolhida.
    ctx.fillStyle = _corFundo;
    ctx.fillRect(0, 0, tamanhoCanvas, tamanhoCanvas);

    if (redondo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(tamanhoCanvas / 2, tamanhoCanvas / 2, tamanhoCanvas / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
    }

    if (zoomPct >= ZOOM_REF) {
        ctx.drawImage(_bitmap, _regiao.x, _regiao.y, _regiao.tamanho, _regiao.tamanho, 0, 0, tamanhoCanvas, tamanhoCanvas);
    } else {
        const lado = tamanhoCanvas * (zoomPct / ZOOM_REF);
        const offset = (tamanhoCanvas - lado) / 2;
        ctx.drawImage(_bitmap, _regiao.x, _regiao.y, _regiao.tamanho, _regiao.tamanho, offset, offset, lado, lado);
    }

    if (redondo) ctx.restore();

    const label = document.createElement('span');
    label.textContent = `${rotulo} · ${tamanhoPx}px`;

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
    _regiao = null;
    _regiaoBase = null;

    const resolve = _resolver;
    _resolver = null;
    if (resolve) resolve(resultado);
}
