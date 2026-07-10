// Zipalign: alinha entradas stored (method=0) a ALIGNMENT bytes no ZIP.
// Deve ser aplicado APÓS assinatura v1 e ANTES da assinatura v2.
//
// Regra: para cada entrada com método=STORED, o byte inicial dos dados deve
// cair num offset que é múltiplo de ALIGNMENT dentro do arquivo ZIP.
// O ajuste é feito estendendo o campo "extra data" do local file header.
//
// Referência: https://developer.android.com/tools/zipalign

const ALIGNMENT = 4;
const SIG_LFH  = 0x04034b50;
const SIG_CD   = 0x02014b50;
const SIG_EOCD = 0x06054b50;

/**
 * @param {Uint8Array} zipBytes
 * @returns {Uint8Array}
 */
export function zipalign(zipBytes) {
    const src = new Uint8Array(zipBytes);
    const sv  = new DataView(src.buffer, src.byteOffset, src.byteLength);

    // ── 1. Localizar EOCD ───────────────────────────────────────────────────
    let eocdSrcOff = -1;
    for (let i = src.length - 22; i >= Math.max(0, src.length - 65558); i--) {
        if (sv.getUint32(i, true) === SIG_EOCD) { eocdSrcOff = i; break; }
    }
    if (eocdSrcOff === -1) throw new Error('zipalign: EOCD não encontrado.');

    const cdSrcOffset = sv.getUint32(eocdSrcOff + 16, true);
    const cdSize      = sv.getUint32(eocdSrcOff + 12, true);

    // ── 2. Ler Central Directory ─────────────────────────────────────────────
    // Precisamos da lista ordenada de entradas (ordem em que os LFH aparecem no src).
    const cdRecords = [];
    {
        let off = cdSrcOffset;
        while (off < cdSrcOffset + cdSize) {
            if (sv.getUint32(off, true) !== SIG_CD) break;
            const fnLen      = sv.getUint16(off + 28, true);
            const extraLen   = sv.getUint16(off + 30, true);
            const commentLen = sv.getUint16(off + 32, true);
            const lfhSrcOff  = sv.getUint32(off + 42, true);  // offset no src
            cdRecords.push({ cdRecSrcOff: off, fnLen, extraLen, commentLen, lfhSrcOff });
            off += 46 + fnLen + extraLen + commentLen;
        }
    }

    // Ordenar por posição do LFH no arquivo (igual à ordem física dos dados)
    cdRecords.sort((a, b) => a.lfhSrcOff - b.lfhSrcOff);

    // ── 3. Calcular padding para cada entrada ────────────────────────────────
    // No dst, o LFH da entrada i está em: lfhSrcOff[i] + sum(padding[0..i-1])
    // Os dados da entrada i começam em:
    //   dstLfhOff + 30 + fnLen + origExtraLen + thisPadding
    // Queremos: (dstLfhOff + 30 + fnLen + origExtraLen + thisPadding) % ALIGNMENT == 0
    let cumulativePadding = 0;
    const patches = [];

    for (const rec of cdRecords) {
        const srcOff = rec.lfhSrcOff;

        if (sv.getUint32(srcOff, true) !== SIG_LFH) {
            throw new Error(`zipalign: assinatura LFH inválida em 0x${srcOff.toString(16)}`);
        }

        const comprMethod  = sv.getUint16(srcOff + 8,  true);
        const fnLen        = sv.getUint16(srcOff + 26, true);
        const origExtraLen = sv.getUint16(srcOff + 28, true);

        const dstLfhOff = srcOff + cumulativePadding;

        let padding = 0;
        if (comprMethod === 0) {
            const dstDataBase = dstLfhOff + 30 + fnLen + origExtraLen;
            const rem = dstDataBase % ALIGNMENT;
            if (rem !== 0) padding = ALIGNMENT - rem;
        }

        patches.push({ srcLfhOff: srcOff, dstLfhOff, fnLen, origExtraLen, padding });
        cumulativePadding += padding;
    }

    if (cumulativePadding === 0) return zipBytes;  // já alinhado

    // ── 4. Reconstruir o ZIP inserindo os paddings ───────────────────────────
    const dst = new Uint8Array(src.length + cumulativePadding);
    const dv  = new DataView(dst.buffer);

    let srcCursor = 0;
    let dstCursor = 0;

    for (const p of patches) {
        // 4a. Copiar tudo desde srcCursor até o fim do filename deste LFH
        const srcEndOfFn = p.srcLfhOff + 30 + p.fnLen;
        const copyLen    = srcEndOfFn - srcCursor;
        dst.set(src.subarray(srcCursor, srcEndOfFn), dstCursor);
        dstCursor += copyLen;
        srcCursor  = srcEndOfFn;

        // 4b. Atualizar extra field length no LFH já copiado em dst
        //     O LFH foi escrito em dst a partir de dstCursor - copyLen + (p.srcLfhOff - (srcEndOfFn - copyLen))
        //     = dstCursor - copyLen + p.srcLfhOff - srcCursor + copyLen
        //     Mas mais simples: o LFH em dst começa em p.dstLfhOff.
        dv.setUint16(p.dstLfhOff + 28, p.origExtraLen + p.padding, true);

        // 4c. Copiar o extra original
        if (p.origExtraLen > 0) {
            dst.set(src.subarray(srcCursor, srcCursor + p.origExtraLen), dstCursor);
        }
        dstCursor += p.origExtraLen;
        srcCursor += p.origExtraLen;

        // 4d. Inserir padding (dst já foi inicializado com zeros)
        dstCursor += p.padding;
    }

    // 4e. Copiar o restante: dados do último entry + Central Directory + EOCD
    dst.set(src.subarray(srcCursor), dstCursor);

    // ── 5. Atualizar LFH offsets no Central Directory ────────────────────────
    for (let i = 0; i < patches.length; i++) {
        const p      = patches[i];
        const rec    = cdRecords[i];
        // posição do CD record no dst = cdRecSrcOff + cumulativePadding (CD está após todos os paddings)
        const cdRecDstOff = rec.cdRecSrcOff + cumulativePadding;
        dv.setUint32(cdRecDstOff + 42, p.dstLfhOff, true);
    }

    // ── 6. Atualizar CD offset no EOCD ────────────────────────────────────────
    const cdDstOffset  = cdSrcOffset + cumulativePadding;
    const eocdDstOff   = eocdSrcOff  + cumulativePadding;
    dv.setUint32(eocdDstOff + 16, cdDstOffset, true);

    return dst;
}
