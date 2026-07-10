// Patcher de AndroidManifest.xml no formato protobuf AAPT2 (usado em AABs).
//
// Schema AAPT2 confirmado por análise dos bytes do template gerado:
//   XmlNode:      field 1 = XmlElement element
//   XmlElement:   field 1 = XmlNamespaceDecl, field 3 = string name,
//                 field 4 = XmlAttribute (repeated), field 5 = XmlNode child (repeated)
//   XmlAttribute: field 1 = namespace_uri, field 2 = string name, field 3 = string value,
//                 field 4 = SourcePosition, field 5 = uint32 resource_id,
//                 field 6 = Item compiled_value
//   Item:         field 7 = Primitive prim
//   Primitive:    field 6 = int32 int_decimal_value

const te = new TextEncoder();
const td = new TextDecoder();

const WT_VARINT = 0;
const WT_LEN    = 2;
const WT_F32    = 5;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {Uint8Array} bytes
 * @param {{ packageName?: string, appName?: string, versionCode?: number, versionName?: string }} patches
 * @returns {Uint8Array}
 */
export function patchManifestAab(bytes, patches) {
    const rootFields = parseFields(bytes);
    for (const f of rootFields) {
        if (f.fieldNum === 1 && f.wt === WT_LEN) {
            f.raw = patchXmlElement(f.raw, patches);
        }
    }
    return serializeFields(rootFields);
}

// ─── Schema-aware traversal ───────────────────────────────────────────────────

function patchXmlElement(bytes, patches) {
    const fields = parseFields(bytes);
    const out = [];
    for (const f of fields) {
        if (f.fieldNum === 4 && f.wt === WT_LEN) {
            // XmlElement.attribute (repeated) — remover debuggable; patch demais
            if (isAttrNamed(f.raw, 'debuggable')) continue;
            f.raw = patchXmlAttribute(f.raw, patches);
            out.push(f);
        } else if (f.fieldNum === 5 && f.wt === WT_LEN) {
            // XmlElement.child (repeated) = XmlNode — recurse into it
            const xmlNodeFields = parseFields(f.raw);
            for (const nf of xmlNodeFields) {
                if (nf.fieldNum === 1 && nf.wt === WT_LEN) {
                    nf.raw = patchXmlElement(nf.raw, patches);
                }
            }
            f.raw = serializeFields(xmlNodeFields);
            out.push(f);
        } else {
            out.push(f);
        }
    }
    return serializeFields(out);
}

function isAttrNamed(attrBytes, name) {
    const nameField = parseFields(attrBytes).find(f => f.fieldNum === 2 && f.wt === WT_LEN);
    return nameField ? td.decode(nameField.raw) === name : false;
}

function patchXmlAttribute(bytes, patches) {
    const fields    = parseFields(bytes);
    const nameField  = fields.find(f => f.fieldNum === 2 && f.wt === WT_LEN);
    const valueField = fields.find(f => f.fieldNum === 3 && f.wt === WT_LEN);
    if (!nameField || !valueField) return bytes;

    const attrName = td.decode(nameField.raw);
    let changed = false;

    if (attrName === 'package' && patches.packageName) {
        valueField.raw = te.encode(patches.packageName);
        changed = true;
    } else if (attrName === 'versionName' && patches.versionName) {
        valueField.raw = te.encode(patches.versionName);
        changed = true;
    } else if (attrName === 'versionCode' && patches.versionCode !== undefined) {
        valueField.raw = te.encode(String(patches.versionCode));
        patchVersionCodeInt(fields, patches.versionCode);
        changed = true;
    } else if (attrName === 'targetSdkVersion' && patches.targetSdkVersion !== undefined) {
        valueField.raw = te.encode(String(patches.targetSdkVersion));
        patchVersionCodeInt(fields, patches.targetSdkVersion);
        changed = true;
    } else if (attrName === 'label' && patches.appName) {
        valueField.raw = te.encode(patches.appName);
        changed = true;
    }

    return changed ? serializeFields(fields) : bytes;
}

function patchVersionCodeInt(attrFields, newCode) {
    // XmlAttribute.compiled_value = field 6 (Item)
    const compiledField = attrFields.find(f => f.fieldNum === 6 && f.wt === WT_LEN);
    if (!compiledField) return;

    const itemFields = parseFields(compiledField.raw);
    // Item.prim = field 7 (Primitive)
    const primContainer = itemFields.find(f => f.fieldNum === 7 && f.wt === WT_LEN);
    if (!primContainer) return;

    const primFields = parseFields(primContainer.raw);
    // Primitive.int_decimal_value = field 6 (varint)
    const intField = primFields.find(f => f.fieldNum === 6 && f.wt === WT_VARINT);
    if (!intField) return;

    intField.varint = BigInt(newCode);
    primContainer.raw = serializeFields(primFields);
    compiledField.raw = serializeFields(itemFields);
}

// ─── Low-level protobuf parser / serializer ──────────────────────────────────

function parseFields(bytes) {
    const fields = [];
    let off = 0;
    while (off < bytes.length) {
        const savedOff = off;
        const [tag, n0] = decodeVarint(bytes, off);
        if (n0 === 0) break;
        off += n0;
        const fieldNum = Number(tag >> 3n);
        const wt       = Number(tag & 7n);
        if (fieldNum === 0) break;  // invalid field number

        if (wt === WT_VARINT) {
            const [val, n1] = decodeVarint(bytes, off);
            if (n1 === 0) break;
            off += n1;
            fields.push({ fieldNum, wt, varint: val });
        } else if (wt === WT_LEN) {
            const [len, n2] = decodeVarint(bytes, off);
            if (n2 === 0) break;
            off += n2;
            const rawLen = Number(len);
            if (off + rawLen > bytes.length) break;
            const raw = bytes.slice(off, off + rawLen);
            off += rawLen;
            fields.push({ fieldNum, wt, raw });
        } else if (wt === WT_F32) {
            if (off + 4 > bytes.length) break;
            fields.push({ fieldNum, wt, raw: bytes.slice(off, off + 4) });
            off += 4;
        } else {
            break;  // unknown wire type
        }
    }
    return fields;
}

function serializeFields(fields) {
    const parts = [];
    for (const f of fields) {
        const tagVal = (BigInt(f.fieldNum) << 3n) | BigInt(f.wt);
        parts.push(encodeVarint(tagVal));
        if (f.wt === WT_VARINT) {
            parts.push(encodeVarint(f.varint));
        } else if (f.wt === WT_LEN) {
            parts.push(encodeVarint(BigInt(f.raw.length)));
            parts.push(f.raw);
        } else if (f.wt === WT_F32) {
            parts.push(f.raw);
        }
    }
    return concat(parts);
}

// ─── Varint codec ─────────────────────────────────────────────────────────────

function decodeVarint(bytes, startOff) {
    let result = 0n;
    let shift  = 0n;
    let off    = startOff;
    while (off < bytes.length) {
        const b = bytes[off++];
        result |= BigInt(b & 0x7f) << shift;
        shift += 7n;
        if (!(b & 0x80)) break;
    }
    return [result, off - startOff];
}

function encodeVarint(n) {
    if (typeof n === 'number') n = BigInt(n);
    const out = [];
    do {
        let b = Number(n & 0x7fn);
        n >>= 7n;
        if (n > 0n) b |= 0x80;
        out.push(b);
    } while (n > 0n);
    return new Uint8Array(out);
}

function concat(arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out   = new Uint8Array(total);
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
}
