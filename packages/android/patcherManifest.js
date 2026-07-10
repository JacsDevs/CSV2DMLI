// Parser/patcher de AndroidManifest.xml binário (formato AXML do Android).
// Suporta UTF-8 e UTF-16LE, reconstrói o string pool inteiro para acomodar
// strings de qualquer tamanho.
//
// Atributos patcheados:
//   <manifest package="...">           → packageName
//   <manifest android:versionCode="N"> → versionCode (inteiro)
//   <manifest android:versionName="S"> → versionName (string)
//   <application android:label="S">    → appName (converte TYPE_REFERENCE → TYPE_STRING)

// Chunk types
const RES_STRINGPOOL_TYPE        = 0x0001;
const RES_XML_RESOURCEMAP_TYPE   = 0x0180;
const RES_XML_START_NAMESPACE    = 0x0100;
const RES_XML_END_NAMESPACE      = 0x0101;
const RES_XML_START_ELEMENT      = 0x0102;
const RES_XML_END_ELEMENT        = 0x0103;
const RES_XML_CDATA              = 0x0104;

// Value data types
const TYPE_STRING    = 0x03;
const TYPE_INT_DEC   = 0x10;
const TYPE_REFERENCE = 0x01;

// Android attribute resource IDs
const ATTR_VERSION_CODE = 0x0101021b;
const ATTR_VERSION_NAME = 0x0101021c;
const ATTR_LABEL        = 0x01010001;

// UTF-8 string pool flag
const UTF8_FLAG = 1 << 8;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Patches a binary AndroidManifest.xml (AXML) byte array.
 * @param {Uint8Array} bytes
 * @param {{ packageName?: string, appName?: string, versionCode?: number, versionName?: string }} patches
 * @returns {Uint8Array}
 */
export function patchManifest(bytes, patches) {
    const doc = parseAxml(bytes);
    applyPatches(doc, patches);
    return serializeAxml(doc);
}

// ─── Parser ──────────────────────────────────────────────────────────────────

function parseAxml(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let off = 0;

    const magic    = view.getUint32(off, true); off += 4;
    const fileSize = view.getUint32(off, true); off += 4;

    if (magic !== 0x00080003) throw new Error(`AXML: magic invalido 0x${magic.toString(16)}`);

    const chunks = [];

    while (off < bytes.length) {
        const chunkStart  = off;
        const type        = view.getUint16(off,     true);
        const headerSize  = view.getUint16(off + 2, true);
        const chunkSize   = view.getUint32(off + 4, true);

        if (chunkSize === 0 || off + chunkSize > bytes.length) break;

        const chunkBytes = bytes.slice(chunkStart, chunkStart + chunkSize);

        if (type === RES_STRINGPOOL_TYPE) {
            chunks.push(parseStringPool(chunkBytes));
        } else if (type === RES_XML_RESOURCEMAP_TYPE) {
            chunks.push(parseResourceMap(chunkBytes));
        } else if (
            type === RES_XML_START_NAMESPACE ||
            type === RES_XML_END_NAMESPACE   ||
            type === RES_XML_START_ELEMENT   ||
            type === RES_XML_END_ELEMENT     ||
            type === RES_XML_CDATA
        ) {
            chunks.push(parseXmlChunk(type, chunkBytes));
        } else {
            chunks.push({ kind: 'raw', type, bytes: chunkBytes });
        }

        off = chunkStart + chunkSize;
    }

    return { magic, chunks };
}

// ─── String Pool ─────────────────────────────────────────────────────────────

function parseStringPool(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const stringCount  = view.getUint32(8,  true);
    const styleCount   = view.getUint32(12, true);
    const flags        = view.getUint32(16, true);
    const stringsStart = view.getUint32(20, true);  // offset from chunk start
    const stylesStart  = view.getUint32(24, true);

    const isUtf8 = (flags & UTF8_FLAG) !== 0;

    // Read string offsets (at byte 28, after the 28-byte header)
    const offsetsBase = 28;
    const offsets = [];
    for (let i = 0; i < stringCount; i++) {
        offsets.push(view.getUint32(offsetsBase + i * 4, true));
    }

    // Read strings
    const stringsBase = stringsStart;  // already relative to chunk start
    const strings = offsets.map(o => readPoolString(bytes, view, stringsBase + o, isUtf8));

    // Read style offsets and raw style data (preserved verbatim)
    const styleOffsets = [];
    if (styleCount > 0) {
        const styleOffsetsBase = offsetsBase + stringCount * 4;
        for (let i = 0; i < styleCount; i++) {
            styleOffsets.push(view.getUint32(styleOffsetsBase + i * 4, true));
        }
    }

    const stylesDataStart = (stylesStart > 0) ? stylesStart : bytes.length;
    const stylesData = stylesStart > 0
        ? bytes.slice(stylesStart, bytes.length)
        : new Uint8Array(0);

    return {
        kind: 'stringPool',
        flags,
        isUtf8,
        strings,
        styleCount,
        styleOffsets,
        stylesData,
    };
}

function readPoolString(bytes, view, absOff, isUtf8) {
    if (isUtf8) {
        // char length varint (1 or 2 bytes)
        let o = absOff;
        let charLen = bytes[o++];
        if (charLen & 0x80) charLen = ((charLen & 0x7f) << 8) | bytes[o++];

        // byte length varint (1 or 2 bytes)
        let byteLen = bytes[o++];
        if (byteLen & 0x80) byteLen = ((byteLen & 0x7f) << 8) | bytes[o++];

        return new TextDecoder('utf-8').decode(bytes.slice(o, o + byteLen));
    } else {
        // UTF-16LE: uint16 length + chars + null
        const charLen = view.getUint16(absOff, true);
        let str = '';
        for (let i = 0; i < charLen; i++) {
            str += String.fromCharCode(view.getUint16(absOff + 2 + i * 2, true));
        }
        return str;
    }
}

// ─── Resource Map ────────────────────────────────────────────────────────────

function parseResourceMap(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunkSize = view.getUint32(4, true);
    const count = (chunkSize - 8) / 4;
    const ids = [];
    for (let i = 0; i < count; i++) {
        ids.push(view.getUint32(8 + i * 4, true));
    }
    return { kind: 'resourceMap', ids };
}

// ─── XML Chunks ──────────────────────────────────────────────────────────────

function parseXmlChunk(type, bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const lineNumber  = view.getUint32(8,  true);
    const commentRef  = view.getInt32 (12, true);

    if (type === RES_XML_START_ELEMENT) {
        const ns   = view.getInt32(16, true);
        const name = view.getInt32(20, true);
        const attrStart = view.getUint16(24, true);
        const attrSize  = view.getUint16(26, true);
        const attrCount = view.getUint16(28, true);
        const idIndex    = view.getUint16(30, true);
        const classIndex = view.getUint16(32, true);
        const styleIndex = view.getUint16(34, true);

        const attrs = [];
        for (let i = 0; i < attrCount; i++) {
            const base = 36 + i * 20;
            attrs.push({
                ns:        view.getInt32 (base,      true),
                name:      view.getInt32 (base + 4,  true),
                rawValue:  view.getInt32 (base + 8,  true),
                valueSize: view.getUint16(base + 12, true),
                valueRes0: view.getUint8 (base + 14),
                dataType:  view.getUint8 (base + 15),
                data:      view.getUint32(base + 16, true),
            });
        }

        return {
            kind: 'startElement',
            lineNumber, commentRef,
            ns, name,
            attrStart, attrSize, idIndex, classIndex, styleIndex,
            attrs,
        };
    }

    if (type === RES_XML_END_ELEMENT) {
        return {
            kind: 'endElement',
            lineNumber, commentRef,
            ns:   view.getInt32(16, true),
            name: view.getInt32(20, true),
        };
    }

    if (type === RES_XML_START_NAMESPACE || type === RES_XML_END_NAMESPACE) {
        return {
            kind: type === RES_XML_START_NAMESPACE ? 'startNs' : 'endNs',
            lineNumber, commentRef,
            prefix: view.getInt32(16, true),
            uri:    view.getInt32(20, true),
        };
    }

    if (type === RES_XML_CDATA) {
        return {
            kind: 'cdata',
            lineNumber, commentRef,
            data:      view.getInt32(16, true),
            valueSize: view.getUint16(20, true),
            valueRes0: view.getUint8(22),
            dataType:  view.getUint8(23),
            dataValue: view.getUint32(24, true),
        };
    }

    return { kind: 'raw', type, bytes };
}

// ─── Apply Patches ───────────────────────────────────────────────────────────

function applyPatches(doc, patches) {
    const pool = doc.chunks.find(c => c.kind === 'stringPool');
    if (!pool) throw new Error('String pool não encontrado no AXML.');

    const strings = pool.strings;

    // Helper: get or add string index
    function intern(s) {
        let idx = strings.indexOf(s);
        if (idx === -1) { idx = strings.length; strings.push(s); }
        return idx;
    }

    // Find resource map for attr name→resId lookup (not strictly needed but helps)
    // const resMap = doc.chunks.find(c => c.kind === 'resourceMap');

    let depth = 0;
    let inManifest = false;
    let inApplication = false;

    for (const chunk of doc.chunks) {
        if (chunk.kind === 'startElement') {
            depth++;
            const tagName = strings[chunk.name] || '';

            if (depth === 1 && tagName === 'manifest') {
                inManifest = true;

                for (const attr of chunk.attrs) {
                    const attrName = strings[attr.name] || '';

                    // package attribute (no namespace, TYPE_STRING)
                    if (attrName === 'package' && attr.dataType === TYPE_STRING) {
                        if (patches.packageName) {
                            const idx = intern(patches.packageName);
                            attr.rawValue = idx;
                            attr.data     = idx;
                        }
                    }

                    // android:versionCode (TYPE_INT_DEC)
                    if (attr.dataType === TYPE_INT_DEC && patches.versionCode !== undefined) {
                        // identify by resource ID via resource map position
                        // attr.name is index into string pool; we check the string value
                        if (attrName === 'versionCode') {
                            attr.data = patches.versionCode >>> 0;
                        }
                    }

                    // android:versionName (TYPE_STRING)
                    if (attrName === 'versionName' && attr.dataType === TYPE_STRING) {
                        if (patches.versionName) {
                            const idx = intern(patches.versionName);
                            attr.rawValue = idx;
                            attr.data     = idx;
                        }
                    }
                }
            }

            if (depth === 2 && tagName === 'application') {
                inApplication = true;

                for (const attr of chunk.attrs) {
                    const attrName = strings[attr.name] || '';

                    // android:label — patch sempre, convertendo TYPE_REFERENCE para TYPE_STRING
                    if (attrName === 'label' && patches.appName) {
                        const idx = intern(patches.appName);
                        attr.rawValue = idx;
                        attr.data     = idx;
                        attr.dataType = TYPE_STRING;
                    }
                }
            }
        }

        if (chunk.kind === 'endElement') depth--;
    }
}

// ─── Serializer ──────────────────────────────────────────────────────────────

function serializeAxml(doc) {
    const parts = [];

    for (const chunk of doc.chunks) {
        if (chunk.kind === 'stringPool') {
            parts.push(serializeStringPool(chunk));
        } else if (chunk.kind === 'resourceMap') {
            parts.push(serializeResourceMap(chunk));
        } else if (chunk.kind === 'startNs' || chunk.kind === 'endNs') {
            parts.push(serializeNs(chunk));
        } else if (chunk.kind === 'startElement') {
            parts.push(serializeStartElement(chunk));
        } else if (chunk.kind === 'endElement') {
            parts.push(serializeEndElement(chunk));
        } else if (chunk.kind === 'cdata') {
            parts.push(serializeCdata(chunk));
        } else {
            parts.push(chunk.bytes);
        }
    }

    const body = concat(parts);
    const header = new Uint8Array(8);
    const hv = new DataView(header.buffer);
    hv.setUint32(0, 0x00080003, true);
    hv.setUint32(4, body.length + 8, true);
    return concat([header, body]);
}

function serializeStringPool(pool) {
    const { strings, flags, isUtf8, styleCount, stylesData } = pool;

    // Encode each string
    const encoded = strings.map(s => encodePoolString(s, isUtf8));

    // Build offsets and data
    const stringOffsets = [];
    let strOff = 0;
    for (const e of encoded) {
        stringOffsets.push(strOff);
        strOff += e.length;
    }

    // Align strings data to 4 bytes
    const pad = (4 - (strOff % 4)) % 4;
    const stringData = new Uint8Array(strOff + pad);
    let pos = 0;
    for (const e of encoded) { stringData.set(e, pos); pos += e.length; }

    const stringCount = strings.length;
    const headerSize  = 28;
    const offsetsSize = stringCount * 4;
    const stringsStart = headerSize + offsetsSize;  // no style offsets (styleCount=0 after rebuild)
    const stylesStart  = stylesData.length > 0 ? stringsStart + stringData.length : 0;

    const chunkSize = headerSize + offsetsSize + stringData.length +
                      (stylesData.length > 0 ? stylesData.length : 0);

    const chunk = new Uint8Array(chunkSize);
    const cv = new DataView(chunk.buffer);

    cv.setUint16(0, RES_STRINGPOOL_TYPE, true);
    cv.setUint16(2, headerSize, true);
    cv.setUint32(4, chunkSize, true);
    cv.setUint32(8,  stringCount, true);
    cv.setUint32(12, 0, true);              // styleCount: rebuilt pool has no styles
    cv.setUint32(16, flags, true);
    cv.setUint32(20, stringsStart, true);
    cv.setUint32(24, stylesStart,  true);

    // Write offsets
    for (let i = 0; i < stringCount; i++) {
        cv.setUint32(28 + i * 4, stringOffsets[i], true);
    }

    // Write string data
    chunk.set(stringData, headerSize + offsetsSize);

    // Write styles data
    if (stylesData.length > 0) {
        chunk.set(stylesData, headerSize + offsetsSize + stringData.length);
    }

    return chunk;
}

function encodePoolString(str, isUtf8) {
    if (isUtf8) {
        const encoded = new TextEncoder().encode(str);
        const charLen = str.length;
        const byteLen = encoded.length;
        const parts = [];

        // Char length varint
        if (charLen > 0x7f) {
            parts.push(0x80 | (charLen >> 8), charLen & 0xff);
        } else {
            parts.push(charLen);
        }

        // Byte length varint
        if (byteLen > 0x7f) {
            parts.push(0x80 | (byteLen >> 8), byteLen & 0xff);
        } else {
            parts.push(byteLen);
        }

        const out = new Uint8Array(parts.length + byteLen + 1);
        out.set(parts);
        out.set(encoded, parts.length);
        // last byte is null terminator (already zero from new Uint8Array)
        return out;
    } else {
        // UTF-16LE
        const out = new Uint8Array(2 + str.length * 2 + 2);
        const ov  = new DataView(out.buffer);
        ov.setUint16(0, str.length, true);
        for (let i = 0; i < str.length; i++) {
            ov.setUint16(2 + i * 2, str.charCodeAt(i), true);
        }
        // null terminator already zero
        return out;
    }
}

function serializeResourceMap(rm) {
    const size = 8 + rm.ids.length * 4;
    const buf  = new Uint8Array(size);
    const v    = new DataView(buf.buffer);
    v.setUint16(0, RES_XML_RESOURCEMAP_TYPE, true);
    v.setUint16(2, 8, true);
    v.setUint32(4, size, true);
    for (let i = 0; i < rm.ids.length; i++) {
        v.setUint32(8 + i * 4, rm.ids[i], true);
    }
    return buf;
}

function serializeNs(chunk) {
    const buf = new Uint8Array(24);
    const v   = new DataView(buf.buffer);
    const type = chunk.kind === 'startNs' ? RES_XML_START_NAMESPACE : RES_XML_END_NAMESPACE;
    v.setUint16(0, type, true);
    v.setUint16(2, 16, true);
    v.setUint32(4, 24, true);
    v.setUint32(8,  chunk.lineNumber, true);
    v.setInt32 (12, chunk.commentRef, true);
    v.setInt32 (16, chunk.prefix,     true);
    v.setInt32 (20, chunk.uri,        true);
    return buf;
}

function serializeStartElement(chunk) {
    const attrCount = chunk.attrs.length;
    const size = 36 + attrCount * 20;
    const buf  = new Uint8Array(size);
    const v    = new DataView(buf.buffer);

    v.setUint16(0, RES_XML_START_ELEMENT, true);
    v.setUint16(2, 16, true);
    v.setUint32(4, size, true);
    v.setUint32(8,  chunk.lineNumber, true);
    v.setInt32 (12, chunk.commentRef, true);
    v.setInt32 (16, chunk.ns,         true);
    v.setInt32 (20, chunk.name,       true);
    v.setUint16(24, 0x14, true);      // attributeStart
    v.setUint16(26, 0x14, true);      // attributeSize
    v.setUint16(28, attrCount, true);
    v.setUint16(30, chunk.idIndex    || 0, true);
    v.setUint16(32, chunk.classIndex || 0, true);
    v.setUint16(34, chunk.styleIndex || 0, true);

    for (let i = 0; i < attrCount; i++) {
        const a = chunk.attrs[i];
        const b = 36 + i * 20;
        v.setInt32 (b,      a.ns,        true);
        v.setInt32 (b + 4,  a.name,      true);
        v.setInt32 (b + 8,  a.rawValue,  true);
        v.setUint16(b + 12, a.valueSize || 8, true);
        v.setUint8 (b + 14, a.valueRes0 || 0);
        v.setUint8 (b + 15, a.dataType);
        v.setUint32(b + 16, a.data,      true);
    }

    return buf;
}

function serializeEndElement(chunk) {
    const buf = new Uint8Array(24);
    const v   = new DataView(buf.buffer);
    v.setUint16(0, RES_XML_END_ELEMENT, true);
    v.setUint16(2, 16, true);
    v.setUint32(4, 24, true);
    v.setUint32(8,  chunk.lineNumber, true);
    v.setInt32 (12, chunk.commentRef, true);
    v.setInt32 (16, chunk.ns,         true);
    v.setInt32 (20, chunk.name,       true);
    return buf;
}

function serializeCdata(chunk) {
    const buf = new Uint8Array(28);
    const v   = new DataView(buf.buffer);
    v.setUint16(0, RES_XML_CDATA, true);
    v.setUint16(2, 16, true);
    v.setUint32(4, 28, true);
    v.setUint32(8,  chunk.lineNumber, true);
    v.setInt32 (12, chunk.commentRef, true);
    v.setInt32 (16, chunk.data,       true);
    v.setUint16(20, chunk.valueSize || 8, true);
    v.setUint8 (22, chunk.valueRes0 || 0);
    v.setUint8 (23, chunk.dataType  || 0);
    v.setUint32(24, chunk.dataValue || 0, true);
    return buf;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function concat(arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
}
