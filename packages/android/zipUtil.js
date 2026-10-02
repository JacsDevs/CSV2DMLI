// Utilitários de ZIP usados na montagem do AAB/APK e do zip final entregue ao usuário.
// Os arquivos são montados como LISTA DE PARTES (Uint8Array | Blob) e só viram um
// `Blob` no final: o conteúdo das mídias nunca é copiado para um buffer contíguo.
// Limitação: ZIP comum (sem ZIP64) — até 4 GB por arquivo e 65.535 entradas.

export const SIG_LFH  = 0x04034b50;
export const SIG_CD   = 0x02014b50;
export const SIG_EOCD = 0x06054b50;

const LIMITE_ZIP32 = 0xffffffff;
const LIMITE_ENTRADAS = 0xffff;

// Tamanho dos pedaços lidos de um Blob ao percorrê-lo (hash/CRC/salvamento)
export const PEDACO_LEITURA = 8 * 1024 * 1024;

// ─── CRC32 ──────────────────────────────────────────────────────────────────

const TABELA_CRC = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();

/** CRC32 incremental: passe o valor anterior em `crc` para continuar a conta. */
export function crc32(bytes, crc = 0) {
    let c = ~crc;
    for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return ~c >>> 0;
}

// ─── Helpers gerais ─────────────────────────────────────────────────────────

let ultimaCessao = 0;
const INTERVALO_CESSAO_MS = 50;

/**
 * Devolve o controle ao event loop (mantém a interface responsiva em laços longos).
 * Só cede de fato a cada ~50 ms: com milhares de arquivos pequenos, um setTimeout
 * por arquivo somaria vários segundos de espera.
 */
export function ceder() {
    const agora = (typeof performance !== 'undefined' ? performance : Date).now();
    if (agora - ultimaCessao < INTERVALO_CESSAO_MS) return Promise.resolve();
    ultimaCessao = agora;
    return new Promise(resolve => setTimeout(resolve, 0));
}

export function verificarCancelamento(sinal) {
    if (sinal && sinal.aborted) {
        const e = new Error('Geração cancelada pelo usuário.');
        e.name = 'AbortError';
        throw e;
    }
}

export function tamanhoDe(dados) {
    return dados instanceof Uint8Array ? dados.length : dados.size;
}

export async function lerBytes(dados) {
    return dados instanceof Uint8Array ? dados : new Uint8Array(await dados.arrayBuffer());
}

/**
 * Percorre `dados` (Uint8Array ou Blob) em pedaços, sem carregar Blobs inteiros.
 * @param {(pedaco: Uint8Array) => (void|Promise<void>)} fn
 */
export async function paraCadaPedaco(dados, fn, tamanhoPedaco = PEDACO_LEITURA) {
    const total = tamanhoDe(dados);
    for (let off = 0; off < total; off += tamanhoPedaco) {
        const fim = Math.min(off + tamanhoPedaco, total);
        const pedaco = dados instanceof Uint8Array
            ? dados.subarray(off, fim)
            : new Uint8Array(await dados.slice(off, fim).arrayBuffer());
        await fn(pedaco);
    }
}

/** CRC32 de um Uint8Array ou Blob, lendo em pedaços e cedendo o event loop entre eles. */
export async function crc32De(dados) {
    let crc = 0;
    await paraCadaPedaco(dados, async (p) => { crc = crc32(p, crc); await ceder(); });
    return crc;
}

const te = new TextEncoder();

function nomeEhAscii(nome) {
    return /^[\x00-\x7f]*$/.test(nome);
}

function dataHoraDos(data = new Date()) {
    const ano = Math.max(1980, data.getFullYear());
    const dosData = ((ano - 1980) << 9) | ((data.getMonth() + 1) << 5) | data.getDate();
    const dosHora = (data.getHours() << 11) | (data.getMinutes() << 5) | (data.getSeconds() >> 1);
    return { dosData, dosHora };
}

// ─── Escritor de ZIP em partes ──────────────────────────────────────────────

/**
 * Escreve um ZIP entrada a entrada, acumulando partes (sem concatenar os dados).
 * Cada entrada precisa ter CRC e tamanhos conhecidos antes de ser adicionada
 * (sem data descriptor), o que mantém o formato idêntico ao gerado pelo fflate.
 */
export class EscritorZip {
    #partes = [];
    // Partes pequenas consecutivas (cabeçalhos, arquivos pequenos) são agrupadas num
    // único buffer, para o Blob final não ter dezenas de milhares de itens.
    #pendentes = [];
    #tamanhoPendentes = 0;

    constructor({ data = new Date() } = {}) {
        this.offset = 0;
        this.registrosCd = [];
        this.dataHora = dataHoraDos(data);
    }

    /** Partes já escritas (entradas do ZIP, sem o diretório central). */
    get partes() {
        this.#descarregarPendentes();
        return this.#partes;
    }

    #descarregarPendentes() {
        if (this.#pendentes.length === 0) return;
        if (this.#pendentes.length === 1) {
            this.#partes.push(this.#pendentes[0]);
        } else {
            const junto = new Uint8Array(this.#tamanhoPendentes);
            let o = 0;
            for (const p of this.#pendentes) { junto.set(p, o); o += p.length; }
            this.#partes.push(junto);
        }
        this.#pendentes = [];
        this.#tamanhoPendentes = 0;
    }

    #empurrar(parte) {
        const n = tamanhoDe(parte);
        if (n === 0) return;
        if (parte instanceof Uint8Array && n < 64 * 1024) {
            this.#pendentes.push(parte);
            this.#tamanhoPendentes += n;
            if (this.#tamanhoPendentes >= 1024 * 1024) this.#descarregarPendentes();
        } else {
            this.#descarregarPendentes();
            this.#partes.push(parte);
        }
        this.offset += n;
    }

    /**
     * @param {string} nome
     * @param {Uint8Array|Blob} dados - bytes já no formato final (comprimidos se metodo = 8)
     * @param {{ metodo: 0|8, crc: number, tamanhoOriginal: number, alinhamento?: number }} info
     */
    adicionar(nome, dados, { metodo, crc, tamanhoOriginal, alinhamento = 0 }) {
        const nomeBytes = te.encode(nome);
        const tamanhoComprimido = tamanhoDe(dados);
        const flags = nomeEhAscii(nome) ? 0 : 0x0800;  // bit 11: nome em UTF-8
        const offsetLfh = this.offset;

        // Alinhamento (zipalign): o padding vai no campo extra do local header
        let padding = 0;
        if (alinhamento > 0 && metodo === 0) {
            const inicioDados = offsetLfh + 30 + nomeBytes.length;
            const resto = inicioDados % alinhamento;
            if (resto !== 0) padding = alinhamento - resto;
        }

        if (offsetLfh > LIMITE_ZIP32 || tamanhoComprimido > LIMITE_ZIP32 || tamanhoOriginal > LIMITE_ZIP32) {
            throw new Error('O pacote ultrapassou 4 GB, o limite do formato ZIP usado. Reduza o tamanho das mídias.');
        }

        const lfh = new Uint8Array(30 + nomeBytes.length + padding);
        const v = new DataView(lfh.buffer);
        v.setUint32(0, SIG_LFH, true);
        v.setUint16(4, 20, true);                 // versão necessária
        v.setUint16(6, flags, true);
        v.setUint16(8, metodo, true);
        v.setUint16(10, this.dataHora.dosHora, true);
        v.setUint16(12, this.dataHora.dosData, true);
        v.setUint32(14, crc >>> 0, true);
        v.setUint32(18, tamanhoComprimido, true);
        v.setUint32(22, tamanhoOriginal, true);
        v.setUint16(26, nomeBytes.length, true);
        v.setUint16(28, padding, true);
        lfh.set(nomeBytes, 30);

        this.#empurrar(lfh);
        this.#empurrar(dados);

        this.registrosCd.push({ nomeBytes, flags, metodo, crc: crc >>> 0, tamanhoComprimido, tamanhoOriginal, offsetLfh });
        if (this.registrosCd.length > LIMITE_ENTRADAS) {
            throw new Error(`O pacote tem mais de ${LIMITE_ENTRADAS} arquivos, o limite do formato ZIP usado.`);
        }
    }

    /** Monta o diretório central e o EOCD (sem adicioná-los às partes). */
    montarFinal() {
        const tamanhoCd = this.registrosCd.reduce((s, r) => s + 46 + r.nomeBytes.length, 0);
        const cd = new Uint8Array(tamanhoCd);
        const v = new DataView(cd.buffer);
        let o = 0;
        for (const r of this.registrosCd) {
            v.setUint32(o, SIG_CD, true);
            v.setUint16(o + 4, 20, true);         // versão que gerou
            v.setUint16(o + 6, 20, true);         // versão necessária
            v.setUint16(o + 8, r.flags, true);
            v.setUint16(o + 10, r.metodo, true);
            v.setUint16(o + 12, this.dataHora.dosHora, true);
            v.setUint16(o + 14, this.dataHora.dosData, true);
            v.setUint32(o + 16, r.crc, true);
            v.setUint32(o + 20, r.tamanhoComprimido, true);
            v.setUint32(o + 24, r.tamanhoOriginal, true);
            v.setUint16(o + 28, r.nomeBytes.length, true);
            // extra (30), comentário (32), disco (34), attrs internos (36), externos (38) = 0
            v.setUint32(o + 42, r.offsetLfh, true);
            cd.set(r.nomeBytes, o + 46);
            o += 46 + r.nomeBytes.length;
        }

        const offsetCd = this.offset;
        if (offsetCd + tamanhoCd > LIMITE_ZIP32) {
            throw new Error('O pacote ultrapassou 4 GB, o limite do formato ZIP usado. Reduza o tamanho das mídias.');
        }
        const eocd = new Uint8Array(22);
        const ev = new DataView(eocd.buffer);
        ev.setUint32(0, SIG_EOCD, true);
        ev.setUint16(8, this.registrosCd.length, true);
        ev.setUint16(10, this.registrosCd.length, true);
        ev.setUint32(12, tamanhoCd, true);
        ev.setUint32(16, offsetCd, true);
        return { cd, eocd, offsetCd };
    }

    /** Finaliza e devolve o ZIP como Blob (sem copiar os dados das entradas). */
    paraBlob(tipo = 'application/zip') {
        const { cd, eocd } = this.montarFinal();
        return new Blob([...this.partes, cd, eocd], { type: tipo });
    }
}

/** Soma dos tamanhos de um Map/lista de File|Blob|Uint8Array. */
export function somarTamanhos(itens) {
    let total = 0;
    for (const d of itens) total += tamanhoDe(d);
    return total;
}

/**
 * Monta um ZIP sem compressão (STORED) a partir de arquivos já prontos.
 * Usado no zip final: AAB/APK já são comprimidos, recomprimir só gastaria tempo e memória.
 * @param {Array<{ nome: string, dados: Uint8Array|Blob, crc?: number }>} arquivos
 * @returns {Promise<Blob>}
 */
export async function montarZipStored(arquivos, { sinal } = {}) {
    const escritor = new EscritorZip();
    for (const { nome, dados, crc } of arquivos) {
        verificarCancelamento(sinal);
        const crcFinal = crc ?? await crc32De(dados);
        escritor.adicionar(nome, dados, { metodo: 0, crc: crcFinal, tamanhoOriginal: tamanhoDe(dados) });
    }
    return escritor.paraBlob();
}
