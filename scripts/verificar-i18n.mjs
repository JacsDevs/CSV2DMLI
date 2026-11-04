// verificar-i18n.mjs
// Confere se os textos marcados no código e os dicionários estão coerentes.
//
//   npm run i18n:verificar               erros reprovam; pendências são só avisos
//   npm run i18n:verificar -- --estrito  traduções faltando e órfãs também reprovam
//
// Executar a partir da raiz do projeto. Não tem dependências.
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import vm from 'vm';

const ESTRITO = process.argv.includes('--estrito');
const PASTA_I18N = 'packages/i18n';
const SEPARADOR_CONTEXTO = '::';
const MAX_LISTADOS = 15;

const erros = [];
const avisos = [];

const ELEMENTOS_VAZIOS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr']);
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', bull: '•', hellip: '…',
    mdash: '—', ndash: '–', copy: '©', middot: '·', rarr: '→', larr: '←' };

const normalizar = (texto) => texto.replace(/\s+/g, ' ').trim();
const decodificar = (texto, origem) => texto.replace(/&(#x?[0-9a-f]+|\w+);/gi, (bruto, nome) => {
    if (nome[0] === '#') {
        const hexa = nome[1].toLowerCase() === 'x';
        return String.fromCodePoint(parseInt(nome.slice(hexa ? 2 : 1), hexa ? 16 : 10));
    }
    if (ENTIDADES[nome] !== undefined) return ENTIDADES[nome];
    erros.push(`${origem}: entidade ${bruto} desconhecida pelo verificador`);
    return bruto;
});
const chaveCom = (texto, ctx) => (ctx ? ctx + SEPARADOR_CONTEXTO + texto : texto);
const linhaDe = (fonte, posicao) => fonte.slice(0, posicao).split('\n').length;
const marcadores = (texto) => [...texto.matchAll(/\{(\w+)\}/g)].map(m => m[1]);

function listarJs(pasta) {
    const saida = [];
    for (const item of readdirSync(pasta, { withFileTypes: true })) {
        const caminho = `${pasta}/${item.name}`;
        if (item.isDirectory()) {
            if (caminho !== PASTA_I18N) saida.push(...listarJs(caminho));
        } else if (item.name.endsWith('.js')) {
            saida.push(caminho);
        }
    }
    return saida;
}

// ---- Chamadas _t() e _tn() no JavaScript ----

// Lê um literal de texto a partir de `inicio`. Retorna null se não for um literal fixo.
function lerLiteral(fonte, inicio) {
    const aspa = fonte[inicio];
    if (aspa !== "'" && aspa !== '"' && aspa !== '`') return null;
    let valor = '';
    for (let i = inicio + 1; i < fonte.length; i++) {
        const c = fonte[i];
        if (c === '\\') {
            const prox = fonte[++i];
            valor += { n: '\n', t: '\t' }[prox] ?? prox;
        } else if (c === aspa) {
            return { valor, fim: i + 1 };
        } else if (aspa === '`' && c === '$' && fonte[i + 1] === '{') {
            return null;
        } else {
            valor += c;
        }
    }
    return null;
}

const pularEspacos = (fonte, i) => {
    while (/\s/.test(fonte[i] || '')) i++;
    return i;
};

function extrairDoJs(fonte, origem, usadas) {
    const padrao = /(?<![\w$.])(_tn?)\(/g;
    let m;
    while ((m = padrao.exec(fonte))) {
        const local = `${origem}:${linhaDe(fonte, m.index)}`;
        const primeiro = lerLiteral(fonte, pularEspacos(fonte, padrao.lastIndex));
        if (!primeiro) {
            erros.push(`${local}: ${m[1]}() precisa de um texto fixo; use {variáveis} em vez de concatenar`);
            continue;
        }
        let fim = primeiro.fim;
        if (m[1] === '_tn') {
            let i = pularEspacos(fonte, fim);
            const segundo = fonte[i] === ',' ? lerLiteral(fonte, pularEspacos(fonte, i + 1)) : null;
            if (!segundo) {
                erros.push(`${local}: _tn() precisa do plural como texto fixo`);
                continue;
            }
            fim = segundo.fim;
        }
        const resto = fonte.slice(fim, fonte.indexOf(')', fim));
        const ctx = resto.match(/\bctx\s*:\s*['"]([^'"]+)['"]/);
        usadas.set(chaveCom(primeiro.valor, ctx && ctx[1]), { tipo: m[1] === '_tn' ? 'plural' : 'texto', local });
    }
}

// ---- Marcações data-i18n no HTML ----

function lerTagAbertura(fonte, inicio) {
    let aspa = null;
    for (let i = inicio; i < fonte.length; i++) {
        const c = fonte[i];
        if (aspa) {
            if (c === aspa) aspa = null;
        } else if (c === '"' || c === "'") {
            aspa = c;
        } else if (c === '>') {
            return i;
        }
    }
    return -1;
}

function lerAtributos(tag) {
    const atributos = new Map();
    for (const m of tag.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) {
        atributos.set(m[1], m[2] ?? m[3] ?? '');
    }
    return atributos;
}

// Retorna os textos diretos do elemento e o HTML interno.
function lerConteudo(fonte, inicio, origem) {
    const textos = [];
    let profundidade = 0;
    let i = inicio;
    while (i < fonte.length) {
        const proximo = fonte.indexOf('<', i);
        if (proximo < 0) break;
        if (profundidade === 0) textos.push(fonte.slice(i, proximo));
        if (fonte.startsWith('<!--', proximo)) {
            i = fonte.indexOf('-->', proximo) + 3;
        } else if (fonte[proximo + 1] === '/') {
            if (profundidade === 0) return { textos, interno: fonte.slice(inicio, proximo) };
            profundidade--;
            i = fonte.indexOf('>', proximo) + 1;
        } else {
            const fim = lerTagAbertura(fonte, proximo);
            if (fim < 0) break;
            const nome = (fonte.slice(proximo + 1, fim).match(/^[\w-]+/) || [''])[0].toLowerCase();
            if (fonte[fim - 1] !== '/' && !ELEMENTOS_VAZIOS.has(nome)) profundidade++;
            i = fim + 1;
        }
    }
    erros.push(`${origem}: elemento marcado com data-i18n sem fechamento`);
    return { textos, interno: '' };
}

function extrairDoHtml(fonte, origem, usadas) {
    const vistos = new Set();
    let posicao = -1;
    while ((posicao = fonte.indexOf('data-i18n', posicao + 1)) >= 0) {
        const inicio = fonte.lastIndexOf('<', posicao);
        if (inicio < 0 || vistos.has(inicio)) continue;
        vistos.add(inicio);
        const fimTag = lerTagAbertura(fonte, inicio);
        if (fimTag < 0) continue;
        const local = `${origem}:${linhaDe(fonte, inicio)}`;
        const atributos = lerAtributos(fonte.slice(inicio + 1, fimTag));
        const ctx = atributos.get('data-i18n-ctx');
        const registrar = (bruto, tipo = 'texto') => {
            if (bruto.includes('${')) {
                erros.push(`${local}: texto marcado com \${}; use _t() com {variáveis}`);
                return;
            }
            const texto = normalizar(tipo === 'html' ? bruto : decodificar(bruto, local));
            if (texto) usadas.set(chaveCom(texto, ctx), { tipo: 'texto', local });
        };
        if (atributos.has('data-i18n')) {
            const { textos, interno } = lerConteudo(fonte, fimTag + 1, local);
            if (atributos.get('data-i18n') === 'html') registrar(interno, 'html');
            else textos.forEach(t => registrar(t));
        }
        for (const nome of (atributos.get('data-i18n-attr') || '').split(/\s+/).filter(Boolean)) {
            if (atributos.has(nome)) registrar(atributos.get(nome));
            else erros.push(`${local}: data-i18n-attr cita "${nome}", ausente no elemento`);
        }
    }
}

// ---- Registro dos idiomas ----

function carregarIdiomas() {
    const contexto = {};
    contexto.globalThis = contexto;
    vm.runInNewContext(readFileSync(`${PASTA_I18N}/idiomas.js`, 'utf8'), contexto);
    return { padrao: contexto.I18N_IDIOMA_PADRAO, idiomas: contexto.I18N_IDIOMAS.map(i => i.codigo) };
}

function carregarDicionario(codigo) {
    const caminho = `${PASTA_I18N}/locales/${codigo}.js`;
    if (!existsSync(caminho)) {
        erros.push(`${codigo}: arquivo ${caminho} não encontrado`);
        return null;
    }
    const registros = [];
    vm.runInNewContext(readFileSync(caminho, 'utf8'), {
        I18N: { registrar: (c, d) => registros.push([c, d]) },
    });
    if (registros.length !== 1 || registros[0][0] !== codigo) {
        erros.push(`${caminho}: deve registrar apenas o idioma "${codigo}"`);
        return null;
    }
    return registros[0][1];
}

function verificarRegistro(html, sw, idiomas, padrao) {
    const inlineInicial = html.search(/<script(?![^>]*\bsrc=)[^>]*>/);
    const posicaoTag = (arquivo) => {
        const posicao = html.indexOf(`<script src="${arquivo}"></script>`);
        if (posicao < 0) erros.push(`index.html: falta <script src="${arquivo}"></script>`);
        else if (inlineInicial >= 0 && posicao > inlineInicial) {
            erros.push(`index.html: ${arquivo} precisa vir antes do primeiro script inline`);
        }
        return posicao;
    };
    const ordem = [`${PASTA_I18N}/idiomas.js`, `${PASTA_I18N}/nucleo.js`,
        ...idiomas.filter(c => c !== padrao).map(c => `${PASTA_I18N}/locales/${c}.js`)];
    const posicoes = ordem.map(posicaoTag);
    if (posicoes[0] > posicoes[1] || posicoes.slice(2).some(p => p >= 0 && p < posicoes[1])) {
        erros.push('index.html: a ordem deve ser idiomas.js, nucleo.js e depois os dicionários');
    }
    const locais = [...html.matchAll(/packages\/i18n\/locales\/([\w-]+)\.js/g)].map(m => m[1]);
    for (const codigo of locais) {
        if (!idiomas.includes(codigo) || codigo === padrao) {
            erros.push(`index.html: carrega o dicionário "${codigo}", que não está em idiomas.js`);
        }
    }
    if (!sw.includes(`importScripts('${PASTA_I18N}/idiomas.js')`)) {
        erros.push(`sw.js: falta importScripts('${PASTA_I18N}/idiomas.js')`);
    }
    for (const arquivo of readdirSync(join(PASTA_I18N, 'locales'))) {
        const codigo = arquivo.replace(/\.js$/, '');
        if (!idiomas.includes(codigo)) erros.push(`${PASTA_I18N}/locales/${arquivo}: idioma fora de idiomas.js`);
    }
}

// ---- Dicionários ----

function verificarDicionario(codigo, dicionario, usadas) {
    const faltando = [...usadas.keys()].filter(k => !Object.hasOwn(dicionario, k));
    const orfas = Object.keys(dicionario).filter(k => !usadas.has(k));

    for (const [chave, valor] of Object.entries(dicionario)) {
        const uso = usadas.get(chave);
        const local = `${codigo}: "${chave}"`;
        if (uso && uso.tipo === 'plural') {
            if (typeof valor !== 'object' || valor === null || !valor.other) {
                erros.push(`${local}: plural precisa de um objeto com a forma "other"`);
                continue;
            }
            const permitidos = new Set(marcadores(chave));
            for (const forma of Object.values(valor)) {
                marcadores(forma).filter(n => !permitidos.has(n) && n !== 'n').forEach(n => {
                    erros.push(`${local}: marcador {${n}} não existe no texto original`);
                });
            }
            continue;
        }
        if (typeof valor !== 'string' || !valor.trim()) {
            if (uso) erros.push(`${local}: tradução vazia ou com formato inválido`);
            continue;
        }
        if (uso) {
            const original = marcadores(chave).sort().join();
            const traduzido = marcadores(valor).sort().join();
            if (original !== traduzido) {
                erros.push(`${local}: marcadores diferentes ({${original}} / {${traduzido}})`);
            }
        }
    }

    const relatar = ESTRITO ? erros : avisos;
    if (faltando.length) {
        const amostra = faltando.slice(0, MAX_LISTADOS).map(k => `\n    - ${k}`).join('');
        relatar.push(`${codigo}: ${faltando.length} tradução(ões) faltando${amostra}`);
    }
    if (orfas.length) {
        const amostra = orfas.slice(0, MAX_LISTADOS).map(k => `\n    - ${k}`).join('');
        relatar.push(`${codigo}: ${orfas.length} tradução(ões) sem uso no código${amostra}`);
    }
    return { total: usadas.size, traduzidas: usadas.size - faltando.length };
}

// ---- Execução ----

const html = readFileSync('index.html', 'utf8');
const sw = readFileSync('sw.js', 'utf8');
const { padrao, idiomas } = carregarIdiomas();

verificarRegistro(html, sw, idiomas, padrao);

const usadas = new Map();
extrairDoHtml(html, 'index.html', usadas);
extrairDoJs(html, 'index.html', usadas);
for (const arquivo of listarJs('packages')) {
    extrairDoJs(readFileSync(arquivo, 'utf8'), arquivo, usadas);
}

console.log(`Textos marcados: ${usadas.size}`);
for (const codigo of idiomas.filter(c => c !== padrao)) {
    const dicionario = carregarDicionario(codigo);
    if (!dicionario) continue;
    const { total, traduzidas } = verificarDicionario(codigo, dicionario, usadas);
    console.log(`  ${codigo}: ${traduzidas}/${total} traduzidos`);
}

avisos.forEach(a => console.warn(`AVISO  ${a}`));
erros.forEach(e => console.error(`ERRO   ${e}`));
if (erros.length) {
    console.error(`\nVerificação reprovada: ${erros.length} erro(s).`);
    process.exit(1);
}
console.log('\nVerificação aprovada.');
