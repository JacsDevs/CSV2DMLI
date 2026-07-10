// APK Signature Scheme v2 (APK Signing Block).
// Implementa a especificação completa de:
//   https://source.android.com/docs/security/features/apksigning/v2
//
// Estrutura do APK com v2:
//   [ZIP entries (Contents of ZIP)]
//   [APK Signing Block]  ← inserido aqui
//   [ZIP Central Directory]
//   [ZIP End of Central Directory]

const SIGNING_BLOCK_MAGIC = 'APK Sig Block 42';
const V2_SCHEME_ID = 0x7109871a;
const DIGEST_ALGO_SHA256_RSA = 0x0103;  // RSASSA-PKCS1-v1_5 com SHA-256
const CHUNK_SIZE = 1024 * 1024;          // 1 MB

/**
 * Assina um AAB/APK com v2 (APK Signing Block).
 * @param {Uint8Array} zipBytes
 * @param {ArrayBuffer} privateKeyPkcs8
 * @param {Uint8Array} certDer - certificado X.509 em DER
 * @returns {Promise<Uint8Array>}
 */
export async function assinarV2(zipBytes, privateKeyPkcs8, certDer) {
    // 1. Localizar seções do ZIP
    const { cdOffset, eocdOffset, eocdBytes } = localizarSecoesZip(zipBytes);

    const contentBytes = zipBytes.slice(0, cdOffset);
    const cdBytes      = zipBytes.slice(cdOffset, eocdOffset);

    // 2. Calcular digests de conteúdo em chunks de 1 MB
    const chunkDigests = await calcularDigestsConteudo(contentBytes);

    // 3. Digest do Central Directory
    const cdDigest = new Uint8Array(
        await crypto.subtle.digest('SHA-256', prefixarSecao(0xa5, cdBytes))
    );

    // 4. EOCD para digest: CD offset = cdOffset (= posição do signing block no APK final).
    //    Spec v2: "Start of Central Directory set to the offset of the APK Signing Block".
    const eocdMod = eocdComOffsetCd(eocdBytes, cdOffset);
    const eocdDigest = new Uint8Array(
        await crypto.subtle.digest('SHA-256', prefixarSecao(0xa5, eocdMod))
    );

    // 5. Top-level digest: SHA-256([0x5a][n][d0][d1]...[dN])
    const topDigest = await calcularTopDigest([...chunkDigests, cdDigest, eocdDigest]);

    // 6. Montar signed-data
    const signedData = montarSignedData(topDigest, certDer);

    // 7. Assinar signed-data
    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', privateKeyPkcs8,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
    );
    const sig = new Uint8Array(
        await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, signedData)
    );

    // 8. Montar o APK Signing Block
    const signingBlock = montarSigningBlock(signedData, sig, certDer);

    // 9. Atualizar offset do CD no EOCD (CD deslocado pelo signing block)
    const novoCdOffset = cdOffset + signingBlock.length;
    const eocdAtualizado = eocdComOffsetCd(eocdBytes, novoCdOffset);

    // 10. Concatenar tudo
    return concat([contentBytes, signingBlock, cdBytes, eocdAtualizado]);
}

// ─── ZIP parsing ─────────────────────────────────────────────────────────────

function localizarSecoesZip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Find EOCD by searching backwards for signature 0x06054b50
    let eocdOffset = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocdOffset = i;
            break;
        }
    }
    if (eocdOffset === -1) throw new Error('EOCD não encontrado no ZIP.');

    const cdOffset = view.getUint32(eocdOffset + 16, true);
    const eocdBytes = bytes.slice(eocdOffset);

    return { cdOffset, eocdOffset, eocdBytes };
}

// ─── Digest computation ──────────────────────────────────────────────────────

async function calcularDigestsConteudo(contentBytes) {
    const chunks = [];
    for (let off = 0; off < contentBytes.length; off += CHUNK_SIZE) {
        chunks.push(contentBytes.slice(off, Math.min(off + CHUNK_SIZE, contentBytes.length)));
    }
    if (chunks.length === 0) chunks.push(new Uint8Array(0));

    return Promise.all(chunks.map(async chunk => {
        const prefixed = new Uint8Array(5 + chunk.length);
        prefixed[0] = 0xa5;
        new DataView(prefixed.buffer).setUint32(1, chunk.length, true);
        prefixed.set(chunk, 5);
        return new Uint8Array(await crypto.subtle.digest('SHA-256', prefixed));
    }));
}

async function calcularTopDigest(digests) {
    const n = digests.length;
    // [0x5a][uint32 count][digest0][digest1]...
    const total = new Uint8Array(5 + n * 32);
    const tv    = new DataView(total.buffer);
    total[0] = 0x5a;
    tv.setUint32(1, n, true);
    for (let i = 0; i < n; i++) {
        total.set(digests[i], 5 + i * 32);
    }
    return new Uint8Array(await crypto.subtle.digest('SHA-256', total));
}

function prefixarSecao(magic, data) {
    const out = new Uint8Array(5 + data.length);
    out[0] = magic;
    new DataView(out.buffer).setUint32(1, data.length, true);
    out.set(data, 5);
    return out;
}

// ─── Signed-data structure ───────────────────────────────────────────────────

function montarSignedData(topDigest, certDer) {
    // signed-data:
    //   digests (length-prefixed):
    //     digest-entry: algId(4) + digest (length-prefixed)
    //   certs (length-prefixed):
    //     cert DER (length-prefixed)
    //   additionalAttributes (length-prefixed): empty

    const digestEntry = lengthPrefixed(concat([
        uint32LE(DIGEST_ALGO_SHA256_RSA),
        lengthPrefixed(topDigest),
    ]));
    const digestsList = lengthPrefixed(digestEntry);

    const certEntry  = lengthPrefixed(certDer);
    const certsList  = lengthPrefixed(certEntry);

    const addAttrs   = lengthPrefixed(new Uint8Array(0));

    return concat([digestsList, certsList, addAttrs]);
}

// ─── Signing Block ───────────────────────────────────────────────────────────

function montarSigningBlock(signedData, signature, certDer) {
    // Public key (SubjectPublicKeyInfo DER) from certDer
    // We extract it from the cert: we reuse certDer as-is for the cert field,
    // and for pubkey we need to extract SPKI from the cert.
    // For simplicity, embed full cert; Android validates via cert chain.
    // pubkey field = the cert's public key in SPKI form (required by spec).
    // Since we don't have easy access to just the SPKI here, we'll encode
    // a minimal signer block where pubkey matches what's in the cert.

    // Actually, we need SPKI. We'll pass certDer and let the caller provide it,
    // OR we extract it. For now we embed a placeholder derivation.
    //
    // Real approach: certDer contains the SubjectPublicKeyInfo at a fixed offset.
    // For a 2048-bit RSA cert, SPKI starts at byte ~24 within the TBSCertificate.
    // This is fragile; the right approach is to use the certDer passed to this function.
    //
    // We pass certDer (the full cert DER) as the "publicKey" field — Android accepts
    // the full certificate bytes in that field per the AAB signing spec variation.
    // For standard APK v2, this field must be the SPKI. Since the caller also provides
    // certDer for the certificates field, and signatures include the full cert, Android
    // will validate this correctly if we derive SPKI properly.
    //
    // Derivation: parse TBSCertificate from certDer to find SubjectPublicKeyInfo.
    const spki = extrairSpkiDoCert(certDer);

    // signer:
    //   signed-data (length-prefixed)
    //   signatures: [ algId + sig (length-prefixed) ]
    //   public-key (length-prefixed)

    const sigEntry = lengthPrefixed(concat([
        uint32LE(DIGEST_ALGO_SHA256_RSA),
        lengthPrefixed(signature),
    ]));
    const sigsList = lengthPrefixed(sigEntry);

    const signer = lengthPrefixed(concat([
        lengthPrefixed(signedData),
        sigsList,
        lengthPrefixed(spki),
    ]));

    const signersList = lengthPrefixed(signer);

    // id-value pair: [uint64 size][uint32 id][value]
    // size = 4 (id) + valuePart.length
    const idValuePair = new Uint8Array(8 + 4 + signersList.length);
    const ipv = new DataView(idValuePair.buffer);
    ipv.setUint32(0, 4 + signersList.length, true);
    ipv.setUint32(4, 0, true);
    ipv.setUint32(8, V2_SCHEME_ID, true);
    idValuePair.set(signersList, 12);

    // Block layout:
    //   [uint64 size_of_block]   ← exclui estes 8 bytes
    //   [id-value pairs]
    //   [uint64 size_of_block]   ← mesmo valor
    //   [16 bytes magic]
    //
    // size_of_block = pairs.length + 8 (segundo uint64) + 16 (magic) = pairs.length + 24
    const pairs        = idValuePair;
    const sizeOfBlock  = pairs.length + 24;
    const magic        = new TextEncoder().encode(SIGNING_BLOCK_MAGIC);

    const block = new Uint8Array(8 + pairs.length + 8 + 16);
    const bv    = new DataView(block.buffer);

    bv.setUint32(0, sizeOfBlock, true);
    bv.setUint32(4, 0,           true);

    block.set(pairs, 8);

    bv.setUint32(8 + pairs.length,     sizeOfBlock, true);
    bv.setUint32(8 + pairs.length + 4, 0,           true);

    block.set(magic, 8 + pairs.length + 8);

    return block;
}

// ─── EOCD manipulation ───────────────────────────────────────────────────────

function eocdComOffsetCd(eocdBytes, novoCdOffset) {
    const out = new Uint8Array(eocdBytes);
    const ov  = new DataView(out.buffer);
    ov.setUint32(16, novoCdOffset, true);
    return out;
}

// ─── Cert SPKI extraction ────────────────────────────────────────────────────
// Minimal DER walker to extract SubjectPublicKeyInfo from an X.509 cert.

function extrairSpkiDoCert(certDer) {
    // X.509 DER structure:
    //   SEQUENCE {              ← Certificate
    //     SEQUENCE {            ← TBSCertificate
    //       [0] version
    //       INTEGER serialNumber
    //       SEQUENCE algId (signature)
    //       SEQUENCE issuer
    //       SEQUENCE validity
    //       SEQUENCE subject
    //       SEQUENCE subjectPublicKeyInfo  ← we want this
    //       ...
    //     }
    //     ...
    //   }

    let off = 0;
    // Skip outer SEQUENCE
    off = skipTag(certDer, off);       // SEQUENCE (Certificate)
    off = skipTag(certDer, off);       // SEQUENCE (TBSCertificate)
    // version [0] OPTIONAL
    if (certDer[off] === 0xa0) {
        off = skipTlv(certDer, off);
    }
    off = skipTlv(certDer, off);       // serialNumber
    off = skipTlv(certDer, off);       // signature algId
    off = skipTlv(certDer, off);       // issuer
    off = skipTlv(certDer, off);       // validity
    off = skipTlv(certDer, off);       // subject

    // Now at SubjectPublicKeyInfo — return the TLV
    const spkiStart = off;
    skipTlv(certDer, off);             // just to find end
    const spkiLen = derTlvLength(certDer, off);
    return certDer.slice(spkiStart, spkiStart + spkiLen);
}

function skipTag(bytes, off) {
    // Returns offset right after the tag byte and length, pointing to value start
    off++;  // tag
    return derSkipLength(bytes, off);
}

function derSkipLength(bytes, off) {
    const b = bytes[off];
    if (b < 0x80) return off + 1;
    const n = b & 0x7f;
    return off + 1 + n;
}

function derTlvLength(bytes, off) {
    off++;  // skip tag
    const b = bytes[off];
    if (b < 0x80) return 2 + b;
    const n = b & 0x7f;
    let len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | bytes[off + 1 + i];
    return 1 + 1 + n + len;
}

function skipTlv(bytes, off) {
    return off + derTlvLength(bytes, off);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function uint32LE(n) {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, n, true);
    return buf;
}

function lengthPrefixed(data) {
    const out = new Uint8Array(4 + data.length);
    new DataView(out.buffer).setUint32(0, data.length, true);
    out.set(data, 4);
    return out;
}

function concat(arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out   = new Uint8Array(total);
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
}
