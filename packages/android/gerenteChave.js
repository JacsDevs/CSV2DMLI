// Gerenciamento de chave de assinatura Android no browser.
// Usa Web Crypto para geração/assinatura e IndexedDB com AES-GCM para armazenamento seguro.
// node-forge (via vendor/) é usado apenas para gerar o certificado X.509 e exportar/importar .p12.

const DB_NAME = 'csv2dmli-keystore';
const DB_VERSION = 1;
const STORE_NAME = 'chaves';
const KEY_ID = 'upload-key';

export class GerenteChave {
    async #abrirDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = e => {
                e.target.result.createObjectStore(STORE_NAME);
            };
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e.target.error);
        });
    }

    async #salvarIdb(dados) {
        const db = await this.#abrirDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(dados, KEY_ID);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = e => { db.close(); reject(e.target.error); };
        });
    }

    async #carregarIdb() {
        const db = await this.#abrirDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(KEY_ID);
            req.onsuccess = e => { db.close(); resolve(e.target.result || null); };
            req.onerror = e => { db.close(); reject(e.target.error); };
        });
    }

    async #derivarChaveAes(senha, salt) {
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(senha),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async #descriptografarChave(dados, senha) {
        const iv = new Uint8Array(dados.iv);
        const wrapKey = await this.#derivarChaveAes(senha, iv);
        const cifrado = new Uint8Array(dados.privKeyWrapped);
        try {
            return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrapKey, cifrado);
        } catch {
            throw new Error('Senha incorreta ou arquivo corrompido.');
        }
    }

    async temChaveSalva() {
        const dados = await this.#carregarIdb();
        return dados !== null;
    }

    async obterInfoChave() {
        const dados = await this.#carregarIdb();
        if (!dados) return null;
        return {
            alias: dados.alias,
            criadoEm: dados.criadoEm,
            expiraEm: dados.expiraEm,
        };
    }

    async gerarNovaChave(senha, { alias = 'upload', cn, org, pais = 'BR', validadeDias = 10000 } = {}) {
        if (!senha || senha.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.');

        const { default: forge } = await import(new URL('../../vendor/node-forge.min.js', import.meta.url).href);

        const keyPair = await crypto.subtle.generateKey(
            {
                name: 'RSASSA-PKCS1-v1_5',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256',
            },
            true,
            ['sign', 'verify']
        );

        const privKeyBuf = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
        const pubKeyBuf  = await crypto.subtle.exportKey('spki', keyPair.publicKey);

        // Build forge objects from exported DER bytes
        const forgePrivKey = forge.pki.privateKeyFromAsn1(
            forge.asn1.fromDer(forge.util.createBuffer(new Uint8Array(privKeyBuf)))
        );
        const forgePubKey = forge.pki.publicKeyFromAsn1(
            forge.asn1.fromDer(forge.util.createBuffer(new Uint8Array(pubKeyBuf)))
        );

        const cert = forge.pki.createCertificate();
        cert.publicKey = forgePubKey;
        cert.serialNumber = '01';
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + validadeDias);
        const attrs = [
            { name: 'commonName',       value: cn  || alias },
            { name: 'organizationName', value: org || 'CSV2DMLI' },
            { name: 'countryName',      value: pais },
        ];
        cert.setSubject(attrs);
        cert.setIssuer(attrs);
        cert.sign(forgePrivKey, forge.md.sha256.create());

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const wrapKey = await this.#derivarChaveAes(senha, iv);
        const privKeyWrapped = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv }, wrapKey, privKeyBuf
        );

        await this.#salvarIdb({
            privKeyWrapped: Array.from(new Uint8Array(privKeyWrapped)),
            certPem:        forge.pki.certificateToPem(cert),
            iv:             Array.from(iv),
            alias,
            criadoEm: new Date().toISOString(),
            expiraEm: cert.validity.notAfter.toISOString(),
        });
    }

    async carregarChave(senha) {
        const dados = await this.#carregarIdb();
        if (!dados) throw new Error('Nenhuma chave encontrada. Crie ou importe uma chave primeiro.');

        const privKeyBuf = await this.#descriptografarChave(dados, senha);
        const { default: forge } = await import(new URL('../../vendor/node-forge.min.js', import.meta.url).href);

        const cert = forge.pki.certificateFromPem(dados.certPem);
        const certAsn1 = forge.pki.certificateToAsn1(cert);
        const certDerStr = forge.asn1.toDer(certAsn1).getBytes();
        const certDer = Uint8Array.from(certDerStr, c => c.charCodeAt(0));

        return {
            privateKeyPkcs8: privKeyBuf,
            certPem: dados.certPem,
            certDer,
        };
    }

    async exportarP12(senha) {
        const dados = await this.#carregarIdb();
        if (!dados) throw new Error('Nenhuma chave para exportar.');

        const privKeyBuf = await this.#descriptografarChave(dados, senha);
        const { default: forge } = await import(new URL('../../vendor/node-forge.min.js', import.meta.url).href);

        const cert = forge.pki.certificateFromPem(dados.certPem);
        const forgePriv = forge.pki.privateKeyFromAsn1(
            forge.asn1.fromDer(forge.util.createBuffer(new Uint8Array(privKeyBuf)))
        );

        const p12Asn1 = forge.pkcs12.toPkcs12Asn1(forgePriv, [cert], senha, {
            algorithm: '3des',
            friendlyName: dados.alias,
        });
        const p12DerStr = forge.asn1.toDer(p12Asn1).getBytes();
        const bytes = Uint8Array.from(p12DerStr, c => c.charCodeAt(0));
        return new Blob([bytes], { type: 'application/x-pkcs12' });
    }

    async importarP12(arquivo, senha) {
        const { default: forge } = await import(new URL('../../vendor/node-forge.min.js', import.meta.url).href);

        const buf = await arquivo.arrayBuffer();
        const p12Asn1 = forge.asn1.fromDer(
            forge.util.createBuffer(new Uint8Array(buf))
        );
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);

        const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
        const keyBag  = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
        if (!keyBag) throw new Error('Nenhuma chave privada encontrada no arquivo .p12.');

        const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
        const certBag  = certBags[forge.pki.oids.certBag]?.[0];
        if (!certBag) throw new Error('Nenhum certificado encontrado no arquivo .p12.');

        const privForge = keyBag.key;
        const cert      = certBag.cert;

        // Converter para PKCS#8 (PrivateKeyInfo) — Web Crypto exige esse formato
        const privPkcs8Asn1 = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(privForge));
        const privDerStr = forge.asn1.toDer(privPkcs8Asn1).getBytes();
        const privBuf    = Uint8Array.from(privDerStr, c => c.charCodeAt(0));

        // Valida que o Web Crypto consegue importar (checa formato e algoritmo)
        await crypto.subtle.importKey(
            'pkcs8', privBuf.buffer,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false, ['sign']
        );

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const wrapKey = await this.#derivarChaveAes(senha, iv);
        const privKeyWrapped = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv }, wrapKey, privBuf.buffer
        );

        const alias = keyBag.attributes?.friendlyName?.[0] || 'importado';

        await this.#salvarIdb({
            privKeyWrapped: Array.from(new Uint8Array(privKeyWrapped)),
            certPem:        forge.pki.certificateToPem(cert),
            iv:             Array.from(iv),
            alias,
            criadoEm: new Date().toISOString(),
            expiraEm: cert.validity.notAfter.toISOString(),
        });
    }

    async deletarChave() {
        const db = await this.#abrirDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(KEY_ID);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = e => { db.close(); reject(e.target.error); };
        });
    }
}
