// gerar-versao.mjs
// Escreve <destino>/static/versao.js com a versão do app (src-tauri/tauri.conf.json),
// o commit atual e a data/hora do build. Usado no deploy do GitHub Pages e no
// prepare-frontend-dist (Tauri).
//
//   node scripts/gerar-versao.mjs dist
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const destino = process.argv[2];
if (!destino) {
    console.error('Uso: node scripts/gerar-versao.mjs <pasta-de-destino>');
    process.exit(1);
}

const versao = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version || null;
let commit = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : null;
if (!commit) {
    try { commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { commit = null; }
}
const data = new Date().toISOString();

const info = { versao, commit, data };
writeFileSync(`${destino}/static/versao.js`,
    '// Gerado por scripts/gerar-versao.mjs — não editar.\n' +
    `window.CSV2DMLI_VERSAO = ${JSON.stringify(info)};\n`);
console.log('Versão gerada:', info);
