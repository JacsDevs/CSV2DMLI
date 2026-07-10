// Gera os bundles browser-ready das libs Node-only usadas pelo exportador Android.
// Execute uma vez após: npm install fflate node-forge axml protobufjs
//
// Uso: node scripts/build-vendor-android.mjs

import { execSync }                   from 'child_process';
import { mkdirSync, existsSync, copyFileSync } from 'fs';
import { resolve, dirname }            from 'path';
import { fileURLToPath }               from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '..');

function run(cmd) {
    console.log(`$ ${cmd}`);
    execSync(cmd, { cwd: root, stdio: 'inherit' });
}

mkdirSync(resolve(root, 'vendor/android'), { recursive: true });

const libs = [
    // [entry, output, format, extraArgs]
    [
        'node_modules/fflate/esm/browser.js',
        'vendor/fflate.min.js',
        'esm',
        '',
    ],
    [
        'node_modules/node-forge/dist/forge.min.js',
        'vendor/node-forge.min.js',
        'esm',
        '--global-name=forge',
    ],
    [
        'node_modules/axml/index.js',
        'vendor/android/axml-browser.js',
        'esm',
        '--platform=browser --define:process.env.NODE_ENV=\\"production\\"',
    ],
    [
        'node_modules/protobufjs/dist/protobuf.min.js',
        'vendor/android/protobufjs-light.min.js',
        'esm',
        '',
    ],
];

for (const [entry, out, fmt, extra] of libs) {
    const entryPath = resolve(root, entry);
    if (!existsSync(entryPath)) {
        console.warn(`⚠️  Arquivo não encontrado: ${entry} — pulando.`);
        console.warn('   Execute: npm install fflate node-forge axml protobufjs');
        continue;
    }
    run(`npx esbuild ${entry} --bundle --format=${fmt} --outfile=${out} --minify ${extra}`.trim());
    console.log(`✓  ${out}`);
}

console.log('\nPronto. Agora execute:');
console.log('  npm run build:android-template');
console.log('para gerar vendor/android/template.aab');
