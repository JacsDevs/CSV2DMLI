// prepare-frontend-dist.mjs
// Copia os assets web (sem bundler) para dist-desktop/, isolados de
// node_modules/src-tauri/target — exigência do `tauri build` desde a v2.11
// ("frontendDist includes node_modules/src-tauri folders").
// Mesma lista de pastas usada por .github/workflows/pages.yml, para manter
// a versão desktop e a versão GitHub Pages servindo exatamente os mesmos
// arquivos.
import { cp, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';

const DIST = 'dist-desktop';

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

await cp('index-wizard.html', `${DIST}/index.html`);

for (const dir of ['packages', 'static', 'assets', 'config', 'vendor']) {
    if (existsSync(dir)) {
        await cp(dir, `${DIST}/${dir}`, { recursive: true });
    }
}

console.log(`Frontend dist preparado em ${DIST}/`);
