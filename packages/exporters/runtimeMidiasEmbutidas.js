// Script injetado no HTML exportado com vídeos embutidos (ExportadorHtmlCards.gravarEmbutido).
//
// Os vídeos não vão como Base64 dentro do JavaScript: cada um é gravado no fim da página em
// blocos inertes (<script type="application/octet-stream" data-midia="N">), que o navegador
// não executa, e os dados citam só o identificador "midia:N". Assim o Base64 nunca passa
// pelo JavaScript, pelo template nem pelo innerHTML ao abrir a página — cada passagem dessas
// era uma cópia inteira do vídeo na memória e estourava a memória da aba com arquivos grandes.
//
// O vídeo só é decodificado quando é aberto: os blocos viram um Blob (que o navegador pode
// manter em disco), servido por uma URL blob:, e são removidos da página para liberar memória.
//
// - window.obterUrlMidiaEmbutida(id): Promise com a URL blob: do vídeo (cacheada).
// - window.ehMidiaEmbutida(valor): se o valor é um identificador de vídeo embutido.
// - Players <video> cujo src (ou <source>) é um identificador são resolvidos ao dar play —
//   cobre as galerias de vídeo e templates que não chamam obterUrlMidiaEmbutida.
//
// O identificador também é aceito com uma pasta na frente ("video/midia:3"): templates
// antigos/personalizados, sem suporte a "midia:", resolvem o nome para esse caminho.
export const RUNTIME_MIDIAS_EMBUTIDAS = `(function () {
    var RE_ID = /(?:^|\\/)midia:(\\d+)$/;
    var cache = {};

    function numero(valor) {
        var m = typeof valor === 'string' ? RE_ID.exec(valor) : null;
        return m ? m[1] : null;
    }

    function decodificar(b64) {
        if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(b64);
        var bin = atob(b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    window.ehMidiaEmbutida = function (valor) { return numero(valor) !== null; };

    window.obterUrlMidiaEmbutida = function (valor) {
        var n = numero(valor);
        if (n === null) return Promise.resolve(valor);
        if (cache[n]) return cache[n];
        cache[n] = new Promise(function (resolve, reject) {
            var blocos = document.querySelectorAll('script[data-midia="' + n + '"]');
            if (!blocos.length) {
                delete cache[n];
                reject(new Error('Vídeo embutido não encontrado: midia:' + n));
                return;
            }
            var tipo = blocos[0].getAttribute('data-tipo') || 'application/octet-stream';
            var partes = [];
            var i = 0;
            // Um bloco por vez, cedendo a thread entre eles para não travar a interface
            (function proximo() {
                try {
                    if (i < blocos.length) {
                        partes.push(decodificar(blocos[i].textContent));
                        i++;
                        setTimeout(proximo, 0);
                        return;
                    }
                    var url = URL.createObjectURL(new Blob(partes, { type: tipo }));
                    for (var j = 0; j < blocos.length; j++) blocos[j].remove();
                    resolve(url);
                } catch (e) {
                    delete cache[n];
                    reject(e);
                }
            })();
        });
        return cache[n];
    };

    // Elemento (o próprio <video>/<audio> ou um <source>) cujo src é um identificador
    function alvoComIdentificador(midia) {
        if (numero(midia.getAttribute('src')) !== null) return midia;
        var fontes = midia.querySelectorAll('source');
        for (var i = 0; i < fontes.length; i++) {
            if (numero(fontes[i].getAttribute('src')) !== null) return fontes[i];
        }
        return null;
    }

    // "play" não propaga: escuta na fase de captura para pegar qualquer player da página
    document.addEventListener('play', function (e) {
        var midia = e.target;
        if (!(midia instanceof HTMLMediaElement)) return;
        var alvo = alvoComIdentificador(midia);
        if (!alvo) return;
        midia.pause();
        window.obterUrlMidiaEmbutida(alvo.getAttribute('src')).then(function (url) {
            alvo.setAttribute('src', url);
            midia.load();
            return midia.play();
        }).catch(function (err) {
            console.error('Falha ao carregar vídeo embutido:', err);
        });
    }, true);
})();
`;
