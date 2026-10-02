// Worker (module) que lê e prepara o HTML pronto da prévia fora da thread
// principal: arquivos com mídias embutidas podem ter centenas de MB.
import { processarHtmlPrevia } from './previaHtml.js';

self.onmessage = async (e) => {
    const { arquivo, opcoes } = e.data;
    try {
        const texto = await arquivo.text();
        self.postMessage({ ok: true, resultado: processarHtmlPrevia(texto, opcoes) });
    } catch (err) {
        self.postMessage({ ok: false, erro: String((err && err.message) || err) });
    }
};
