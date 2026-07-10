// APK Signature Scheme v1 (JAR Signing).
// Gera MANIFEST.MF, CERT.SF e CERT.RSA (PKCS#7 SignedData) dentro de META-INF/.
// Web Crypto faz o hash SHA-256 e a assinatura RSA; node-forge monta o PKCS#7.
//
// RFC 2315 §9.3: quando authenticatedAttributes estão presentes, a assinatura RSA
// é sobre o DER encoding dos authAttrs com tag SET (0x31), não sobre o conteúdo.

const te = new TextEncoder();

/**
 * Assina um AAB/APK (ZIP) com v1 (JAR signing).
 * @param {Uint8Array} zipBytes
 * @param {ArrayBuffer} privateKeyPkcs8
 * @param {string} certPem
 * @returns {Promise<Uint8Array>} ZIP com META-INF adicionado
 */
export async function assinarV1(zipBytes, privateKeyPkcs8, certPem) {
    const { unzipSync, zipSync } = await import(new URL('../../vendor/fflate.min.js', import.meta.url).href);
    const { default: forge } = await import(new URL('../../vendor/node-forge.min.js', import.meta.url).href);

    // Ler métodos de compressão originais antes do unzip, para preservá-los ao remontar.
    const metodosOriginais = lerMetodosCompressao(zipBytes);

    const arquivos = unzipSync(zipBytes);

    // Remove META-INF anterior
    for (const path of Object.keys(arquivos)) {
        if (path.startsWith('META-INF/')) delete arquivos[path];
    }

    // 1. Calcular SHA-256 de cada entrada (exceto META-INF/)
    const entradas = Object.entries(arquivos)
        .filter(([p]) => !p.startsWith('META-INF/'))
        .sort(([a], [b]) => a.localeCompare(b));

    const secoes = [];
    for (const [path, content] of entradas) {
        const bytes  = content instanceof Uint8Array ? content : content[0];
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const b64    = btoa(String.fromCharCode(...new Uint8Array(digest)));
        secoes.push(`Name: ${path}\r\nSHA-256-Digest: ${b64}\r\n\r\n`);
    }

    // 2. MANIFEST.MF
    const manifestHeader  = 'Manifest-Version: 1.0\r\nCreated-By: CSV2DMLI\r\n\r\n';
    const manifestContent = manifestHeader + secoes.join('');
    const manifestBytes   = te.encode(manifestContent);
    arquivos['META-INF/MANIFEST.MF'] = manifestBytes;

    // 3. CERT.SF
    const manifestDigest    = await crypto.subtle.digest('SHA-256', manifestBytes);
    const manifestDigestB64 = btoa(String.fromCharCode(...new Uint8Array(manifestDigest)));

    let sfContent = 'Signature-Version: 1.0\r\nCreated-By: CSV2DMLI\r\n' +
        `SHA-256-Digest-Manifest: ${manifestDigestB64}\r\n\r\n`;

    for (const secao of secoes) {
        const sBytes  = te.encode(secao);
        const sDigest = await crypto.subtle.digest('SHA-256', sBytes);
        const sB64    = btoa(String.fromCharCode(...new Uint8Array(sDigest)));
        const nameLine = secao.split('\r\n')[0];
        sfContent += `${nameLine}\r\nSHA-256-Digest: ${sB64}\r\n\r\n`;
    }

    const sfBytes = te.encode(sfContent);
    arquivos['META-INF/CERT.SF'] = sfBytes;

    // 4. Importar chave RSA
    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', privateKeyPkcs8,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
    );

    // 5. Construir authenticatedAttributes e assinar o DER deles com tag SET
    //    RFC 2315 §9.3: a assinatura é sobre DER(SET(authAttrs)), não sobre sfBytes.
    const cert          = forge.pki.certificateFromPem(certPem);
    const sfDigest      = new Uint8Array(await crypto.subtle.digest('SHA-256', sfBytes));
    const sfDigestHex   = Array.from(sfDigest).map(b => b.toString(16).padStart(2, '0')).join('');
    const authAttrItems = buildAuthAttrItems(forge, sfDigestHex);
    const authAttrsDer  = authAttrsParaAssinar(forge, authAttrItems);

    const signature = new Uint8Array(
        await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, authAttrsDer)
    );

    // 6. Montar PKCS#7 SignedData
    const certAsn1 = forge.pki.certificateToAsn1(cert);
    const p7Asn1   = buildPkcs7Asn1(forge, certAsn1, cert, authAttrItems, signature);
    const p7Der    = forge.asn1.toDer(p7Asn1).getBytes();
    const certRsa  = Uint8Array.from(p7Der, c => c.charCodeAt(0));

    arquivos['META-INF/CERT.RSA'] = certRsa;

    // Remontar preservando o método de compressão original de cada entrada.
    // META-INF deve ser STORED (level 0) obrigatoriamente.
    // Entradas não encontradas (não deveria ocorrer) ficam STORED por segurança.
    const resultado = {};
    for (const [path, content] of Object.entries(arquivos)) {
        const bytes = content instanceof Uint8Array ? content : content[0];
        if (path.startsWith('META-INF/')) {
            resultado[path] = [bytes, { level: 0 }];
        } else {
            const origMethod = metodosOriginais.get(path);
            const level = (origMethod === undefined || origMethod === 0) ? 0 : 6;
            resultado[path] = [bytes, { level }];
        }
    }
    return zipSync(resultado);
}

// ─── authenticatedAttributes ─────────────────────────────────────────────────

function buildAuthAttrItems(forge, sfDigestHex) {
    return [
        // contentType = id-data
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
                forge.asn1.oidToDer(forge.pki.oids.contentType).getBytes()),
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [
                forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
                    forge.asn1.oidToDer(forge.pki.oids.data).getBytes()),
            ]),
        ]),
        // messageDigest = SHA-256(CERT.SF)
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
                forge.asn1.oidToDer(forge.pki.oids.messageDigest).getBytes()),
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [
                forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false,
                    forge.util.hexToBytes(sfDigestHex)),
            ]),
        ]),
    ];
}

// DER-codifica os authAttrs com tag SET (0x31) para a entrada da assinatura RSA.
// No SignerInfo eles ficam com tag [0] (0xa0); para assinar, usa-se SET.
function authAttrsParaAssinar(forge, authAttrItems) {
    const setAsn1 = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, authAttrItems);
    const der = forge.asn1.toDer(setAsn1).getBytes();
    return Uint8Array.from(der, c => c.charCodeAt(0));
}

// ─── PKCS#7 SignedData builder ───────────────────────────────────────────────

function buildPkcs7Asn1(forge, certAsn1, cert, authAttrItems, signature) {
    const issuer = cert.issuer;
    const serial = forge.util.hexToBytes(cert.serialNumber);

    const signerInfoSeq = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        // version = 1
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, '\x01'),
        // issuerAndSerialNumber
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.pki.distinguishedNameToAsn1(issuer),
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, serial),
        ]),
        // digestAlgorithm sha256
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
                forge.asn1.oidToDer('2.16.840.1.101.3.4.2.1').getBytes()),
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
        ]),
        // authenticatedAttributes [0] IMPLICIT
        forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, authAttrItems),
        // digestEncryptionAlgorithm rsaEncryption
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
                forge.asn1.oidToDer(forge.pki.oids.rsaEncryption).getBytes()),
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
        ]),
        // encryptedDigest (assinatura RSA)
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false,
            forge.util.createBuffer(signature).getBytes()),
    ]);

    const signedData = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        // version
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, '\x01'),
        // digestAlgorithms
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
                forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
                    forge.asn1.oidToDer('2.16.840.1.101.3.4.2.1').getBytes()),
                forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
            ]),
        ]),
        // contentInfo (detached)
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
                forge.asn1.oidToDer(forge.pki.oids.data).getBytes()),
        ]),
        // certificates [0]
        forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [certAsn1]),
        // signerInfos
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [signerInfoSeq]),
    ]);

    // ContentInfo wrapper
    return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
            forge.asn1.oidToDer(forge.pki.oids.signedData).getBytes()),
        forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData]),
    ]);
}

// ─── Leitor de métodos de compressão do ZIP ───────────────────────────────────

function lerMetodosCompressao(zipBytes) {
    const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
    const result = new Map();

    // Localizar EOCD
    let eocdOff = -1;
    for (let i = zipBytes.length - 22; i >= Math.max(0, zipBytes.length - 65558); i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocdOff = i; break; }
    }
    if (eocdOff === -1) return result;

    const cdOffset = view.getUint32(eocdOff + 16, true);
    const cdSize   = view.getUint32(eocdOff + 12, true);
    const td       = new TextDecoder();

    let off = cdOffset;
    while (off < cdOffset + cdSize) {
        if (view.getUint32(off, true) !== 0x02014b50) break;
        const method     = view.getUint16(off + 10, true);
        const fnLen      = view.getUint16(off + 28, true);
        const extraLen   = view.getUint16(off + 30, true);
        const commentLen = view.getUint16(off + 32, true);
        const filename   = td.decode(zipBytes.subarray(off + 46, off + 46 + fnLen));
        result.set(filename, method);
        off += 46 + fnLen + extraLen + commentLen;
    }

    return result;
}
