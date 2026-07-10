// Gera PNGs de placeholder (fundo verde sólido) para cada densidade de mipmap
// no android-template. Execute antes do build:android-template.
//
// Uso: node scripts/generate-mipmap-icons.mjs

import { deflateSync }     from 'zlib';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname }  from 'path';
import { fileURLToPath }     from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '..');

const DENSITIES = [
    { name: 'mipmap-mdpi',    size: 48  },
    { name: 'mipmap-hdpi',    size: 72  },
    { name: 'mipmap-xhdpi',   size: 96  },
    { name: 'mipmap-xxhdpi',  size: 144 },
    { name: 'mipmap-xxxhdpi', size: 192 },
];

// PNG com fundo verde #2E7D32 (R=46, G=125, B=50) em cada pixel.
function gerarPng(size) {
    const w = size, h = size;

    // Construir dados de imagem não filtrados: para cada linha, filter=0x00 + 3 bytes/pixel
    const rawLines = new Uint8Array(h * (1 + w * 3));
    for (let y = 0; y < h; y++) {
        const base = y * (1 + w * 3);
        rawLines[base] = 0x00;  // filter byte: None
        for (let x = 0; x < w; x++) {
            rawLines[base + 1 + x * 3 + 0] = 46;   // R
            rawLines[base + 1 + x * 3 + 1] = 125;  // G
            rawLines[base + 1 + x * 3 + 2] = 50;   // B
        }
    }
    const compressed = deflateSync(rawLines);

    const chunks = [];

    function chunk(type, data) {
        const typeBytes = Buffer.from(type, 'ascii');
        const len       = Buffer.alloc(4);
        len.writeUInt32BE(data.length, 0);
        const payload = Buffer.concat([typeBytes, data]);
        let crc = 0xFFFFFFFF;
        for (const b of payload) {
            crc ^= b;
            for (let i = 0; i < 8; i++) {
                crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
            }
        }
        crc = (crc ^ 0xFFFFFFFF) >>> 0;
        const crcBuf = Buffer.alloc(4);
        crcBuf.writeUInt32BE(crc, 0);
        return Buffer.concat([len, payload, crcBuf]);
    }

    // Assinatura PNG
    chunks.push(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));

    // IHDR: width(4) + height(4) + bitDepth(1) + colorType(1,=2=RGB) +
    //       compression(1,=0) + filter(1,=0) + interlace(1,=0)
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8]  = 8;  // bit depth
    ihdr[9]  = 2;  // color type: RGB
    ihdr[10] = 0;  // compression
    ihdr[11] = 0;  // filter
    ihdr[12] = 0;  // interlace
    chunks.push(chunk('IHDR', ihdr));

    // IDAT
    chunks.push(chunk('IDAT', compressed));

    // IEND
    chunks.push(chunk('IEND', Buffer.alloc(0)));

    return Buffer.concat(chunks);
}

const resDir = resolve(root, 'android-template/app/src/main/res');

for (const { name, size } of DENSITIES) {
    const dir = resolve(resDir, name);
    mkdirSync(dir, { recursive: true });

    const png = gerarPng(size);
    writeFileSync(resolve(dir, 'ic_launcher.png'),       png);
    writeFileSync(resolve(dir, 'ic_launcher_round.png'), png);
    console.log(`✓  ${name}/ic_launcher.png (${size}×${size})`);
}

console.log('\nPronto. Execute agora:');
console.log('  npm run build:android-template');
