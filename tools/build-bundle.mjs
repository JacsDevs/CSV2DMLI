#!/usr/bin/env node
// Fase 3 — Gerador de web bundle canônico
// Uso: node tools/build-bundle.mjs --in <dir-entrada> --out <dir-saida> [--template html-cards|html-linear]
// Requer Node.js 18+

import { readFile, writeFile, mkdir, readdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// PapaParse via bundle UMD — createRequire força carregamento CommonJS mesmo com "type":"module"
const require = createRequire(import.meta.url);
const Papa = require(join(ROOT, 'vendor/papaparse.min.js'));

// ── Argumentos ─────────────────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith('--') && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
        args[process.argv[i].slice(2)] = process.argv[i + 1];
        i++;
    }
}
const IN_DIR   = args.in       ? join(process.cwd(), args.in)  : process.cwd();
const OUT_DIR  = args.out      ? join(process.cwd(), args.out) : join(ROOT, 'dist/bundle');
const TEMPLATE = args.template ?? 'html-cards';

console.log(`build-bundle: ${IN_DIR} → ${OUT_DIR} [${TEMPLATE}]`);

// ── Config ─────────────────────────────────────────────────────────────────────
let config = {};
try {
    config = JSON.parse(await readFile(join(IN_DIR, 'config.json'), 'utf8'));
} catch {
    console.warn('  Aviso: config.json não encontrado, usando padrões.');
}
const mapeamento = config.colunas?.mapeamento ?? {};

// ── CSV ────────────────────────────────────────────────────────────────────────
const csvFiles = (await readdir(IN_DIR)).filter(f => f.toLowerCase().endsWith('.csv'));
if (!csvFiles.length) throw new Error(`Nenhum arquivo .csv encontrado em: ${IN_DIR}`);
const csvContent = await readFile(join(IN_DIR, csvFiles[0]), 'utf8');
const { data: rawRows } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
console.log(`  CSV: ${rawRows.length} linhas — ${csvFiles[0]}`);

// ── Mapeamento de colunas ──────────────────────────────────────────────────────
function applyMapping(row) {
    const r = { ...row };
    for (const [canonical, alias] of Object.entries(mapeamento)) {
        if (alias && row[alias] !== undefined && r[canonical] === undefined) {
            r[canonical] = row[alias];
        }
    }
    return r;
}

// ── Normalização de linhas ─────────────────────────────────────────────────────
// Equivalente a GerenciadorDados.carregarPlanilha(), mas sem File/FileReader
function normalizarLinha(rawRow, index) {
    const lm = applyMapping(rawRow);

    const imagens = [];
    if (lm.IMAGEM || lm.LEGENDA_IMAGEM) {
        const ir = (lm.IMAGEM || '').split('|').map(v => v.trim());
        const lr = (lm.LEGENDA_IMAGEM || '').split('|').map(v => v.trim());
        for (let i = 0; i < Math.max(ir.length, lr.length); i++) {
            if (ir[i] || lr[i]) {
                imagens.push({ img: ir[i] ? ir[i].split('/').pop().split('\\').pop() : '', leg: lr[i] || '' });
            }
        }
    }
    for (let i = 1; i <= 10; i++) {
        if (lm[`IMAGEM_${i}`] || lm[`LEGENDA_${i}`]) {
            const raw = lm[`IMAGEM_${i}`] || '';
            imagens.push({ img: raw ? raw.split('/').pop().split('\\').pop() : '', leg: lm[`LEGENDA_${i}`] || '' });
        }
    }

    const exemplos = [];
    if (lm.ARQUIVO_SONORO_EXEMPLO || lm.TRANSCRICAO_EXEMPLO || lm.TRADUCAO_EXEMPLO) {
        const ea = (lm.ARQUIVO_SONORO_EXEMPLO || '').split('|').map(v => v.trim());
        const et = (lm.TRANSCRICAO_EXEMPLO || '').split('|').map(v => v.trim());
        const ed = (lm.TRADUCAO_EXEMPLO || '').split('|').map(v => v.trim());
        for (let i = 0; i < Math.max(ea.length, et.length, ed.length); i++) {
            if (ea[i] || et[i] || ed[i]) {
                exemplos.push({ audio: ea[i] || '', trans: et[i] || '', trad: ed[i] || '' });
            }
        }
    }
    for (let i = 1; i <= 10; i++) {
        if (lm[`EX_${i}_TRANS`] || lm[`EX_${i}_TRAD`] || lm[`EX_${i}_AUDIO`]) {
            exemplos.push({ audio: lm[`EX_${i}_AUDIO`] || '', trans: lm[`EX_${i}_TRANS`] || '', trad: lm[`EX_${i}_TRAD`] || '' });
        }
    }

    const variacoes = [];
    if (lm.ITEM_LEXICAL?.includes('|')) {
        const vi = (lm.ITEM_LEXICAL || '').split('|').map(v => v.trim());
        const va = (lm.ARQUIVO_SONORO || '').split('|').map(v => v.trim());
        const vf = (lm.TRANSCRICAO_FONEMICA || '').split('|').map(v => v.trim());
        const vt = (lm.TRANSCRICAO_FONETICA || '').split('|').map(v => v.trim());
        for (let i = 0; i < Math.max(vi.length, va.length, vf.length, vt.length); i++) {
            variacoes.push({ item: vi[i] || '', audio: va[i] || '', fone: vf[i] || '', fonet: vt[i] || '' });
        }
    } else {
        variacoes.push({
            item:   lm.ITEM_LEXICAL          || '',
            audio:  lm.ARQUIVO_SONORO        || '',
            fone:   lm.TRANSCRICAO_FONEMICA  || '',
            fonet:  lm.TRANSCRICAO_FONETICA  || ''
        });
        for (let i = 1; i <= 10; i++) {
            if (lm[`VAR_${i}_ITEM`] || lm[`VAR_${i}_AUDIO`] || lm[`VAR_${i}_FONE`] || lm[`VAR_${i}_FONET`]) {
                variacoes.push({
                    item:  lm[`VAR_${i}_ITEM`]  || '',
                    audio: lm[`VAR_${i}_AUDIO`] || '',
                    fone:  lm[`VAR_${i}_FONE`]  || '',
                    fonet: lm[`VAR_${i}_FONET`] || ''
                });
            }
        }
    }

    return {
        indice: index,
        camposBasicos: {
            CLASSE_GRAMATICAL:    lm.CLASSE_GRAMATICAL    || '',
            CAMPO_SEMANTICO:      lm.CAMPO_SEMANTICO      || '',
            SUB_CAMPO_SEMANTICO:  lm.SUB_CAMPO_SEMANTICO  || '',
            TRADUCAO_SIGNIFICADO: lm.TRADUCAO_SIGNIFICADO || '',
            ITENS_RELACIONADOS:   lm.ITENS_RELACIONADOS   || '',
            DESCRICAO:            lm.DESCRICAO            || '',
            ARQUIVO_VIDEO:        lm.ARQUIVO_VIDEO        || ''
        },
        variacoes: variacoes.filter(v => v.item || v.audio || v.fone || v.fonet),
        exemplos,
        imagens
    };
}

const dadosPlanilha = rawRows.map(normalizarLinha);

// ── VFS stub (filesystem Node.js) ─────────────────────────────────────────────
// obterArquivo retorna string (caminho) — construtorBancoDados.js verifica
// `arquivo instanceof File` e, como string não é File, retorna o path diretamente
// sem chamar URL.createObjectURL.
const midiasDir = join(IN_DIR, 'midias');
const vfsStub = {
    obterArquivo(tipo, nome) {
        if (!nome) return null;
        const candidatos = [join(midiasDir, nome), join(midiasDir, tipo, nome)];
        for (const p of candidatos) if (existsSync(p)) return p;
        return null;
    }
};

// ── Banco de dados ─────────────────────────────────────────────────────────────
const { default: ConstrutorBancoDados } = await import('../packages/core/construtorBancoDados.js');
const construtor = new ConstrutorBancoDados(vfsStub);
const bancoDados = construtor.normalizarDados(dadosPlanilha, true);
console.log(`  Banco: ${bancoDados.metadados.totalEntradas} entradas, ${bancoDados.metadados.totalVariacoes} variações`);

// ── obterArvoreOrdenada (puro JS, sem DOM) ─────────────────────────────────────
// Replica o caminho não-DOM de GerenciadorDados.obterArvoreOrdenada():
// — ordena categorias alfabeticamente
// — ordena entradas dentro de cada categoria por _TERMO_PRINCIPAL
function obterArvoreOrdenada() {
    const arvore = {};
    const cats = new Set();
    Object.values(bancoDados.entradas).forEach(ent => {
        const c = ent.CAMPO_SEMANTICO || 'Geral';
        cats.add(c);
        if (!arvore[c]) arvore[c] = { _entradas: [] };
        arvore[c]._entradas.push(ent);
    });
    const categoriasRaizes = [...cats].sort();
    categoriasRaizes.forEach(c => {
        arvore[c]._entradas.sort((a, b) =>
            (a._TERMO_PRINCIPAL || '').localeCompare(b._TERMO_PRINCIPAL || '', 'pt-BR'));
    });
    return { arvore, categoriasRaizes };
}

// ── Exporter ───────────────────────────────────────────────────────────────────
const templateKey = TEMPLATE === 'html-linear' ? 'html-linear' : 'html-cards';
const templateDir = join(ROOT, `config/templates/${templateKey}`);

const dbProxy = {
    bancoDados,
    vfs: vfsStub,
    obterArvoreOrdenada
};

const modExporter = TEMPLATE === 'html-linear'
    ? await import('../packages/exporters/exportadorHtmlLinear.js')
    : await import('../packages/exporters/exportadorHtmlCards.js');
const exporter = new modExporter.default(dbProxy);

// Injeta templates direto do filesystem — bypassa localStorage/fetch usados no browser
exporter.templatePrincipal = await readFile(join(templateDir, 'template.html'), 'utf8');
exporter.templateEntrada   = await readFile(join(templateDir, 'entrada.html'), 'utf8');
exporter.estilosGlobais    = await readFile(join(ROOT, 'config/templates/estilos-globais.css'), 'utf8').catch(() => '');

// ── Gerar HTML ─────────────────────────────────────────────────────────────────
const meta = {
    tituloHtml: config.metadados?.titulo || config.nome || 'Dicionário',
    tituloPdf:  config.metadados?.titulo || config.nome || 'Dicionário',
    autor:      config.metadados?.autor  || '',
    versao:     config.metadados?.versao || '1.0',
    ano:        config.metadados?.ano    || String(new Date().getFullYear()),
    introHtml:  ''
};
const htmlContent = await exporter.exportar({ embutirMidias: false, metadados: meta });

// ── Gravar output ──────────────────────────────────────────────────────────────
await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, 'index.html'), htmlContent, 'utf8');
console.log(`  index.html (${(htmlContent.length / 1024).toFixed(1)} KB)`);

// ── Copiar mídias referenciadas ────────────────────────────────────────────────
const referenciadas = { audio: new Set(), imagem: new Set(), video: new Set() };
for (const entrada of Object.values(bancoDados.entradas)) {
    entrada.VARIACOES_IDS?.forEach(id => {
        const v = bancoDados.variacoes[id];
        if (v?.ARQUIVO_SONORO) referenciadas.audio.add(v.ARQUIVO_SONORO);
    });
    entrada.ACEPCOES?.forEach(ac => {
        ac.EXEMPLOS_IDS?.forEach(id => {
            const ex = bancoDados.exemplos[id];
            if (ex?.ARQUIVO_SONORO_EXEMPLO) referenciadas.audio.add(ex.ARQUIVO_SONORO_EXEMPLO);
        });
        ac.IMAGENS_IDS?.forEach(id => {
            const img = bancoDados.imagens[id];
            if (img?.IMAGEM) referenciadas.imagem.add(img.IMAGEM.split(/[/\\]/).pop());
        });
        ac.VIDEOS_IDS?.forEach(vidId => {
            const vid = bancoDados.videos?.[vidId];
            if (vid?.ARQUIVO_VIDEO) referenciadas.video.add(vid.ARQUIVO_VIDEO.split(/[/\\]/).pop());
        });
    });
}

const MEDIA_DEST = { audio: 'audio', imagem: 'foto', video: 'video' };
const copiados = { audio: 0, imagem: 0, video: 0 };

for (const [tipo, destSub] of Object.entries(MEDIA_DEST)) {
    const destDir = join(OUT_DIR, destSub);
    for (const nome of referenciadas[tipo]) {
        const src = vfsStub.obterArquivo(tipo, nome);
        if (src) {
            await mkdir(destDir, { recursive: true });
            try { await copyFile(src, join(destDir, nome)); copiados[tipo]++; } catch {}
        }
    }
}

console.log(`  Mídias: ${copiados.audio} áudios, ${copiados.imagem} imagens, ${copiados.video} vídeos`);
console.log(`Bundle gerado em: ${OUT_DIR}`);
