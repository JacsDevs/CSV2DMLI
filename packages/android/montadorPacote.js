// Montagem do AAB/APK assinado em uma única passada.
//
// Substitui a sequência antiga injetar (zipSync) → assinarV1 (unzip + zip) →
// zipalign (cópia) → assinarV2 (cópias), que montava o arquivo três vezes em memória:
//   1. escreve cada entrada já alinhada (padding no campo extra, como o zipalign);
//   2. usa CRC32 e SHA-256 de cada entrada (calculados uma única vez e reaproveitados
//      entre AAB e APK por meio do CacheHashes) para o MANIFEST.MF;
//   3. grava META-INF/ (assinatura v1) no final;
//   4. calcula a assinatura v2 lendo o conteúdo em sequência e insere o
//      APK Signing Block antes do diretório central.
// O resultado é um Blob composto pelas partes: mídias recebidas como File/Blob nunca
// são copiadas para a memória do JavaScript como um todo.

import { EscritorZip, crc32, crc32De, ceder, verificarCancelamento, tamanhoDe, lerBytes } from './zipUtil.js';
import { gerarArquivosAssinaturaV1, sha256Base64 } from './signerV1.js';
import { gerarBlocoAssinaturaV2 } from './signerV2.js';

const ALINHAMENTO = 4;
const ALINHAMENTO_SO = 4096;  // bibliotecas nativas não comprimidas: página de 4 KB (zipalign -p)

/**
 * CRC32 + SHA-256 por objeto de dados. A mesma mídia (mesmo Uint8Array/Blob) entra
 * no AAB e no APK: com o cache, cada arquivo é lido e hasheado uma única vez.
 */
export class CacheHashes {
    #mapa = new WeakMap();

    /** @param {Uint8Array|Blob} dados */
    async obter(dados, { sinal, onBytes } = {}) {
        const existente = this.#mapa.get(dados);
        if (existente) return existente;
        verificarCancelamento(sinal);
        // WebCrypto não tem SHA-256 incremental: o arquivo é lido inteiro, um por vez
        // (pico de memória = maior arquivo), e liberado logo em seguida.
        const bytes = await lerBytes(dados);
        const crc = await crc32De(bytes);
        const sha256 = await sha256Base64(bytes);
        const r = { crc, sha256 };
        this.#mapa.set(dados, r);
        if (onBytes) onBytes(bytes.length);
        return r;
    }
}

/**
 * @param {{
 *   entradas: Array<{ caminho: string, dados: Uint8Array|Blob, comprimir: boolean }>,
 *   privateKeyPkcs8: ArrayBuffer,
 *   certPem: string,
 *   certDer: Uint8Array,
 *   alinhar?: boolean,
 *   cache?: CacheHashes,
 *   sinal?: AbortSignal,
 *   onBytesHash?: (n: number) => void,
 *   onBytesAssinatura?: (n: number) => void,
 *   tipoMime?: string,
 * }} opcoes
 * @returns {Promise<{ blob: Blob, crc: number, tamanho: number }>} pacote assinado (v1 + v2)
 *   e o CRC32 do arquivo inteiro (para o zip final não precisar relê-lo)
 */
export async function montarPacoteAssinado({
    entradas, privateKeyPkcs8, certPem, certDer,
    alinhar = false, cache = new CacheHashes(), sinal,
    onBytesHash, onBytesAssinatura, tipoMime = 'application/octet-stream',
}) {
    const { deflateSync } = await import(new URL('../../vendor/fflate.min.js', import.meta.url).href);
    const escritor = new EscritorZip();
    const digests = [];
    const alinhamentoDe = (caminho) => !alinhar ? 0 : (caminho.endsWith('.so') ? ALINHAMENTO_SO : ALINHAMENTO);

    for (const { caminho, dados, comprimir } of entradas) {
        // Assinaturas anteriores do template são descartadas (como no assinarV1)
        if (caminho.startsWith('META-INF/')) continue;
        verificarCancelamento(sinal);

        if (comprimir) {
            // Só arquivos pequenos do template (manifesto, .pb, xml…): processados na hora
            const bruto = await lerBytes(dados);
            const comprimido = deflateSync(bruto, { level: 6 });
            escritor.adicionar(caminho, comprimido, { metodo: 8, crc: crc32(bruto), tamanhoOriginal: bruto.length });
            digests.push([caminho, await sha256Base64(bruto)]);
        } else {
            const { crc, sha256 } = await cache.obter(dados, { sinal, onBytes: onBytesHash });
            escritor.adicionar(caminho, dados, {
                metodo: 0, crc, tamanhoOriginal: tamanhoDe(dados), alinhamento: alinhamentoDe(caminho),
            });
            digests.push([caminho, sha256]);
        }
    }

    // Assinatura v1 (JAR): META-INF sempre STORED
    const metaInf = await gerarArquivosAssinaturaV1(digests, privateKeyPkcs8, certPem);
    for (const [caminho, bytes] of Object.entries(metaInf)) {
        escritor.adicionar(caminho, bytes, {
            metodo: 0, crc: crc32(bytes), tamanhoOriginal: bytes.length, alinhamento: alinhamentoDe(caminho),
        });
    }

    // Assinatura v2: uma leitura sequencial do conteúdo, aproveitada também para o CRC32
    // do arquivo final (usado depois no zip entregue ao usuário).
    const { cd, eocd } = escritor.montarFinal();
    let crcArquivo = 0;
    const { signingBlock, eocdAtualizado } = await gerarBlocoAssinaturaV2(
        escritor.partes, cd, eocd, privateKeyPkcs8, certDer,
        {
            sinal,
            onPedaco: async (pedaco) => {
                crcArquivo = crc32(pedaco, crcArquivo);
                if (onBytesAssinatura) onBytesAssinatura(pedaco.length);
                await ceder();
            },
        }
    );
    for (const final of [signingBlock, cd, eocdAtualizado]) crcArquivo = crc32(final, crcArquivo);

    const blob = new Blob([...escritor.partes, signingBlock, cd, eocdAtualizado], { type: tipoMime });
    return { blob, crc: crcArquivo, tamanho: blob.size };
}
