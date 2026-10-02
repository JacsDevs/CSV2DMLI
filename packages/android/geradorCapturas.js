// Gera capturas de tela do app para a ficha da Google Play, 100% no browser.
//
// O HTML do app é renderizado num iframe invisível com o viewport real de cada
// dispositivo (as @media do template reagem como no aparelho) e depois
// "fotografado" pela modern-screenshot (DOM → SVG foreignObject → canvas).
//
// Requisitos do Play Console atendidos pelos perfis abaixo:
//   - Telefone: proporção 9:16, lados entre 320 e 3840 px  → 1080×1920
//   - Tablet:   proporção 16:9, lados entre 1080 e 7680 px → 1920×1080
//   - JPEG (o PNG do canvas tem canal alfa, que a Play Store recusa)

const PERFIS = [
    { arquivo: 'telefone-1.jpg', largura: 360,  altura: 640, escala: 3,   tela: 'inicio'  },
    { arquivo: 'telefone-2.jpg', largura: 360,  altura: 640, escala: 3,   tela: 'detalhe' },
    { arquivo: 'tablet-1.jpg',   largura: 1280, altura: 720, escala: 1.5, tela: 'inicio'  },
];

const QUALIDADE_JPEG = 0.92;

// Tempos de espera: o template abre o modal de introdução ~100ms após o
// DOMContentLoaded e as transições dos diálogos duram ~220ms.
const ESPERA_POS_CARGA_MS = 700;
const ESPERA_TRANSICAO_MS = 450;
const TIMEOUT_CARGA_MS    = 20000;
// Limite total de cada captura: nenhuma etapa pode deixar a geração do app presa
const TIMEOUT_CAPTURA_MS  = 45000;

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

// Rejeita se `promessa` não terminar em `ms` (a promessa original segue pendente, mas é ignorada)
function comTimeout(promessa, ms, mensagem) {
    let timer;
    const limite = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(mensagem)), ms); });
    return Promise.race([promessa, limite]).finally(() => clearTimeout(timer));
}

/**
 * Gera as capturas de tela para a Play Store.
 *
 * @param {string} htmlStr HTML completo do app, com mídias embutidas (data URI) ou em URLs blob: desta sessão
 * @param {{ onProgress?: (atual: number, total: number, arquivo: string) => void }} [opcoes]
 * @returns {Promise<{ capturas: Map<string, Uint8Array>, avisos: string[] }>}
 */
export async function gerarCapturasPlayStore(htmlStr, { onProgress = () => {} } = {}) {
    const { domToCanvas } = await import(new URL('../../vendor/modern-screenshot.min.js', import.meta.url).href);

    const htmlLimpo = prepararHtml(htmlStr);
    const capturas = new Map();
    const avisos = [];

    for (let i = 0; i < PERFIS.length; i++) {
        const perfil = PERFIS[i];
        onProgress(i, PERFIS.length, perfil.arquivo);
        try {
            const bytes = await capturarPerfil(domToCanvas, htmlLimpo, perfil);
            if (bytes) capturas.set(perfil.arquivo, bytes);
            else avisos.push(`${perfil.arquivo}: nenhum verbete encontrado para abrir a tela de detalhes.`);
        } catch (e) {
            console.error(`Erro ao gerar captura ${perfil.arquivo}:`, e);
            avisos.push(`${perfil.arquivo}: ${e.message || e}`);
        }
    }
    onProgress(PERFIS.length, PERFIS.length, '');

    return { capturas, avisos };
}

// Ajusta o HTML só para a captura:
// - remove o widget do VLibras (script externo + botão flutuante) e o aviso de
//   "exibindo apenas as N primeiras entradas" da prévia;
// - esconde as barras de rolagem do desktop, que não existem no Android e
//   roubariam largura do layout.
function prepararHtml(htmlStr) {
    try {
        const doc = new DOMParser().parseFromString(htmlStr, 'text/html');
        doc.querySelectorAll('[vw], .preview-limite-aviso').forEach(el => el.remove());
        doc.querySelectorAll('script').forEach(s => {
            const texto = s.textContent || '';
            if ((s.src || '').includes('vlibras') || texto.includes('vlibras.gov.br')) s.remove();
            // Script de live reload injetado pelo Live Server/live-server em dev: dentro
            // do iframe blob: ele monta uma URL de WebSocket inválida e só gera erro.
            else if (texto.includes('Live reload enabled')) s.remove();
        });
        const estilo = doc.createElement('style');
        estilo.textContent = '* { scrollbar-width: none !important; } ::-webkit-scrollbar { display: none !important; }';
        (doc.head || doc.documentElement).appendChild(estilo);
        return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    } catch (e) {
        return htmlStr;
    }
}

async function capturarPerfil(domToCanvas, htmlStr, perfil) {
    const { largura, altura } = perfil;
    const { iframe, url } = await criarIframe(htmlStr, largura, altura);
    try {
        return await comTimeout(
            fotografarIframe(domToCanvas, iframe, perfil),
            TIMEOUT_CAPTURA_MS,
            'Tempo esgotado ao gerar a captura.'
        );
    } finally {
        iframe.remove();
        URL.revokeObjectURL(url);
    }
}

async function fotografarIframe(domToCanvas, iframe, perfil) {
    const { largura, altura, escala } = perfil;
    const etapa = (msg) => console.debug(`[capturas] ${perfil.arquivo}: ${msg}`);
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;

    etapa('iframe carregado');
    await esperarRecursos(doc);
    await esperar(ESPERA_POS_CARGA_MS);
    fecharDialogos(win, doc);
    await esperar(ESPERA_TRANSICAO_MS);

    if (perfil.tela === 'detalhe') {
        const aberto = abrirPrimeiroVerbete(doc);
        if (!aberto) return null;
        await esperar(ESPERA_TRANSICAO_MS);
        await esperarRecursos(doc);
    }

    doc.activeElement?.blur?.();
    win.scrollTo(0, 0);

    etapa('renderizando (domToCanvas)');
    const canvas = await domToCanvas(doc.documentElement, {
        width: largura,
        height: altura,
        scale: escala,
        backgroundColor: corDeFundo(win, doc),
        font: false, // o template usa fontes do sistema — nada a embutir
        timeout: 15000,
        style: { overflow: 'hidden' },
        filter: ignorarNaCaptura,
    });

    etapa('codificando JPEG');
    const bytes = await canvasParaJpeg(canvas, largura * escala, altura * escala);
    etapa('concluída');
    return bytes;
}

// O iframe fica dentro da área visível (atrás de tudo e transparente) em vez de
// fora da tela: IntersectionObserver e imagens loading="lazy" do template só
// disparam para conteúdo que intersecta o viewport da página.
function criarIframe(htmlStr, largura, altura) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([htmlStr], { type: 'text/html;charset=utf-8' }));
        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.tabIndex = -1;
        iframe.style.cssText = `position:fixed; left:0; top:0; width:${largura}px; height:${altura}px;`
            + ' border:0; opacity:0; pointer-events:none; z-index:-1;';

        const timer = setTimeout(() => {
            iframe.remove();
            URL.revokeObjectURL(url);
            reject(new Error('Tempo esgotado ao carregar o app para captura.'));
        }, TIMEOUT_CARGA_MS);

        iframe.onload = () => { clearTimeout(timer); resolve({ iframe, url }); };
        iframe.src = url;
        document.body.appendChild(iframe);
    });
}

async function esperarRecursos(doc) {
    doc.querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });
    const imagens = Array.from(doc.images).filter(img => !img.complete);
    await Promise.race([
        Promise.all([
            Promise.resolve(doc.fonts?.ready).catch(() => {}),
            ...imagens.map(img => img.decode().catch(() => {})),
        ]),
        esperar(5000),
    ]);
}

// Nós que não entram na captura. <video> fica de fora porque a modern-screenshot,
// ao clonar um vídeo, aguarda o evento "seeked" sem timeout — que nunca dispara
// num <video> sem src (ex.: o #video-overlay-player vazio do template), travando
// a captura. Nas telas capturadas o player fica num overlay fechado, invisível.
function ignorarNaCaptura(no) {
    if (no.nodeType !== 1) return true;
    return !(no.tagName === 'SCRIPT' || no.tagName === 'VIDEO' || no.hasAttribute('vw'));
}

// Fecha diálogos abertos automaticamente (ex.: modal de introdução do template).
function fecharDialogos(win, doc) {
    doc.querySelectorAll('.modal-overlay.ativo, .modal-global.ativo, .lightbox-overlay.ativo, .video-overlay.ativo')
        .forEach(el => {
            if (el.id && typeof win.fecharModalGlobal === 'function') win.fecharModalGlobal(el.id);
            el.classList.remove('ativo');
        });
    if (doc.body) doc.body.style.overflow = '';
}

// Abre o detalhe do primeiro verbete, dando preferência a um que tenha imagem.
function abrirPrimeiroVerbete(doc) {
    const seletor = '.card, .entry-card';
    const comImagem = Array.from(doc.querySelectorAll(seletor)).find(el => el.querySelector('img'));
    const alvo = comImagem || doc.querySelector(seletor);
    if (!alvo) return false;
    alvo.click();
    return !!doc.querySelector('.modal-overlay.ativo, .modal-global.ativo');
}

// JPEG não tem transparência: usa a cor de fundo do próprio app.
function corDeFundo(win, doc) {
    for (const el of [doc.body, doc.documentElement]) {
        if (!el) continue;
        const cor = win.getComputedStyle(el).backgroundColor;
        if (cor && cor !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(cor)) return cor;
    }
    return '#ffffff';
}

// Redesenha no tamanho exato exigido (evita arredondamentos de escala) e codifica em JPEG.
async function canvasParaJpeg(origem, largura, altura) {
    const destino = document.createElement('canvas');
    destino.width = largura;
    destino.height = altura;
    const ctx = destino.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(origem, 0, 0, largura, altura);
    const blob = await new Promise((resolve, reject) => {
        destino.toBlob(b => b ? resolve(b) : reject(new Error('Falha ao codificar JPEG.')), 'image/jpeg', QUALIDADE_JPEG);
    });
    return new Uint8Array(await blob.arrayBuffer());
}
