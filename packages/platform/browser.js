export class BrowserPlatform {
    /**
     * Salva o Blob em um local escolhido pelo usuário. Em navegadores com a File
     * System Access API (Chrome/Edge) abre o diálogo "Salvar como" e grava em
     * streaming; nos demais (ou se o diálogo não puder ser aberto) cai no
     * download padrão do navegador.
     * @param {string} nomeArquivo
     * @param {Blob} blob
     * @param {{ onProgress?: (gravado: number, total: number) => void }} [opcoes]
     * @returns {Promise<boolean>} false se o usuário cancelou o diálogo
     */
    async salvarArquivo(nomeArquivo, blob, { onProgress } = {}) {
        const handle = await this.#escolherArquivo(nomeArquivo, blob.type);
        if (handle === false) return false;
        if (handle) {
            await this.#gravarEmStreaming(handle, blob, onProgress);
            console.log(`✅ Arquivo salvo (Modo Web): ${handle.name}`);
            return true;
        }
        return this.#baixar(nomeArquivo, blob, onProgress);
    }

    /**
     * Abre um destino para gravar o arquivo aos poucos, sem montá-lo inteiro na memória.
     * Deve ser chamado direto no clique do usuário, antes de qualquer processamento
     * demorado: o diálogo "Salvar como" exige que o gesto do usuário ainda seja válido.
     *
     * O conteúdo é gravado primeiro num arquivo temporário no armazenamento privado do
     * navegador (OPFS) e só em fechar() vai para o local escolhido. Gravar arquivos enormes
     * direto no local escolhido falhava ao finalizar ("state had changed since it was read
     * from disk") em máquinas com antivírus corporativo; se a cópia para o local escolhido
     * falhar, o arquivo já pronto é entregue pelo gerenciador de downloads (lido do disco,
     * sem passar pela memória). Sem OPFS, grava direto no local escolhido como antes.
     *
     * Com `emMemoria` (arquivos pequenos), o conteúdo é juntado num Blob e gravado no local
     * escolhido de uma vez só em fechar(), sem o temporário: cada escrita e cada finalização
     * de arquivo custam caro (antivírus), e para poucos MB a cópia via OPFS era só custo.
     * Se a gravação falhar, o Blob é entregue pelo gerenciador de downloads.
     * @param {string} nomeArquivo
     * @param {string} mimeType
     * @param {{ emMemoria?: boolean }} [opcoes]
     * @returns {Promise<{ escrever: (dados: string | Blob) => Promise<void>, fechar: () => Promise<{ baixadoEmDownloads: boolean, erroLocalEscolhido?: Error }>, abortar: () => Promise<void> } | null>}
     *          null se o usuário cancelou o diálogo
     */
    async abrirDestino(nomeArquivo, mimeType, { emMemoria = false } = {}) {
        const handle = await this.#escolherArquivo(nomeArquivo, mimeType);
        if (handle === false) return null;

        if (emMemoria) {
            // Cada trecho vira um Blob na hora: o navegador guarda os dados fora do heap JS
            const partes = [];
            return {
                escrever: async (dados) => { partes.push(dados instanceof Blob ? dados : new Blob([dados])); },
                fechar: async () => {
                    const blob = new Blob(partes, { type: mimeType });
                    partes.length = 0;
                    if (handle) {
                        const inicio = performance.now();
                        try {
                            await this.#gravarEmStreaming(handle, blob);
                            console.log(`✅ Arquivo salvo (Modo Web, em memória): ${handle.name} — gravação no local escolhido em ${BrowserPlatform.#segundosDesde(inicio)}s`);
                            return { baixadoEmDownloads: false };
                        } catch (err) {
                            console.warn('Não foi possível gravar no local escolhido; entregando pelo download:', err);
                            try { if (typeof handle.remove === 'function') await handle.remove(); } catch (_) { /* fica vazio */ }
                            this.#baixar(nomeArquivo, blob);
                            return { baixadoEmDownloads: true, erroLocalEscolhido: err };
                        }
                    }
                    this.#baixar(nomeArquivo, blob);
                    return { baixadoEmDownloads: true };
                },
                abortar: async () => { partes.length = 0; },
            };
        }

        const temporario = await this.#abrirTemporario();
        if (temporario) {
            const { arquivoHandle, writable } = temporario;
            return {
                escrever: (texto) => writable.write(texto),
                fechar: async () => {
                    const inicioTemporario = performance.now();
                    await writable.close();
                    const arquivo = await arquivoHandle.getFile();
                    console.log(`⏱️ Temporário (OPFS) fechado em ${BrowserPlatform.#segundosDesde(inicioTemporario)}s`);
                    if (handle) {
                        const inicioCopia = performance.now();
                        // Marca se o erro veio da leitura do temporário ou da gravação no destino
                        let erroNaLeitura = false;
                        try {
                            const destino = await handle.createWritable();
                            const leitor = arquivo.stream().getReader();
                            const origem = new ReadableStream({
                                async pull(controller) {
                                    let lido;
                                    try { lido = await leitor.read(); } catch (e) { erroNaLeitura = true; throw e; }
                                    if (lido.done) controller.close();
                                    else controller.enqueue(lido.value);
                                },
                                cancel: (motivo) => leitor.cancel(motivo),
                            });
                            // pipeTo fecha o writable ao final (ou aborta em caso de erro)
                            await origem.pipeTo(destino);
                            console.log(`✅ Arquivo salvo (Modo Web): ${handle.name} — cópia para o local escolhido em ${BrowserPlatform.#segundosDesde(inicioCopia)}s`);
                            return { baixadoEmDownloads: false };
                        } catch (err) {
                            console.warn(`Não foi possível gravar no local escolhido (erro na ${erroNaLeitura ? 'leitura do temporário' : 'gravação no local escolhido'}, após ${BrowserPlatform.#segundosDesde(inicioCopia)}s); entregando pelo download:`, err);
                            // Remove o arquivo vazio que o "Salvar como" criou
                            try { if (typeof handle.remove === 'function') await handle.remove(); } catch (_) { /* fica vazio */ }
                            // O File lido acima é uma "foto" do temporário: se algo (antivírus) mexeu
                            // no arquivo depois de fechado, a foto fica inválida e o download dela
                            // também falharia. O download usa uma foto nova.
                            const arquivoAtual = await this.#reabrirTemporario(arquivoHandle, arquivo);
                            this.#baixar(nomeArquivo, arquivoAtual, null, BrowserPlatform.#ESPERA_REVOGAR_TEMPORARIO);
                            return { baixadoEmDownloads: true, erroLocalEscolhido: err };
                        }
                    }
                    this.#baixar(nomeArquivo, arquivo, null, BrowserPlatform.#ESPERA_REVOGAR_TEMPORARIO);
                    return { baixadoEmDownloads: true };
                },
                abortar: async () => {
                    try { await writable.abort(); } catch (_) { /* já fechado */ }
                    await this.#removerTemporario();
                },
            };
        }

        if (handle) {
            const writable = await handle.createWritable();
            return {
                escrever: (texto) => writable.write(texto),
                fechar: async () => {
                    await writable.close();
                    console.log(`✅ Arquivo salvo (Modo Web): ${handle.name}`);
                    return { baixadoEmDownloads: false };
                },
                abortar: () => writable.abort(),
            };
        }
        const partes = [];
        return {
            escrever: async (texto) => { partes.push(texto); },
            fechar: async () => {
                this.#baixar(nomeArquivo, new Blob(partes, { type: mimeType }));
                return { baixadoEmDownloads: true };
            },
            abortar: async () => { partes.length = 0; },
        };
    }

    static #NOME_TEMPORARIO = 'csv2dmli-exportacao.tmp';
    // O download lê o temporário do disco enquanto transfere: a URL precisa durar o
    // download inteiro de um arquivo de GBs
    static #ESPERA_REVOGAR_TEMPORARIO = 30 * 60 * 1000;

    static #segundosDesde(inicio) {
        return ((performance.now() - inicio) / 1000).toFixed(1);
    }

    /**
     * Cria o arquivo temporário da exportação no armazenamento privado do navegador (OPFS),
     * substituindo o da exportação anterior — que fica guardado até aqui porque o download
     * dele pode continuar depois de fechar(). null se o navegador não oferece OPFS.
     */
    async #abrirTemporario() {
        try {
            if (!navigator.storage || typeof navigator.storage.getDirectory !== 'function') return null;
            await this.#removerTemporario();
            const raiz = await navigator.storage.getDirectory();
            const arquivoHandle = await raiz.getFileHandle(BrowserPlatform.#NOME_TEMPORARIO, { create: true });
            if (typeof arquivoHandle.createWritable !== 'function') return null;
            const writable = await arquivoHandle.createWritable();
            return { arquivoHandle, writable };
        } catch (err) {
            console.warn('Armazenamento temporário do navegador indisponível, gravando direto no destino:', err);
            return null;
        }
    }

    // Nova "foto" (File) do temporário, registrando se ele mudou desde a foto anterior
    // (data ou tamanho diferentes = alguém mexeu no arquivo depois de fechado). Se não
    // conseguir reabrir, devolve a foto anterior.
    async #reabrirTemporario(arquivoHandle, anterior) {
        try {
            const atual = await arquivoHandle.getFile();
            const mudou = atual.lastModified !== anterior.lastModified || atual.size !== anterior.size;
            if (mudou) {
                console.warn(`🔍 Temporário (OPFS) ALTERADO depois de fechado: data ${new Date(anterior.lastModified).toISOString()} → ${new Date(atual.lastModified).toISOString()}, tamanho ${anterior.size} → ${atual.size} bytes`);
            } else {
                console.log('🔍 Temporário (OPFS) sem alteração depois de fechado (mesma data e tamanho)');
            }
            return atual;
        } catch (err) {
            console.warn('🔍 Não foi possível reabrir o temporário (OPFS); o download usa a foto anterior:', err);
            return anterior;
        }
    }

    async #removerTemporario() {
        try {
            const raiz = await navigator.storage.getDirectory();
            await raiz.removeEntry(BrowserPlatform.#NOME_TEMPORARIO);
        } catch (_) { /* não existe */ }
    }

    /**
     * Abre o diálogo "Salvar como" (File System Access API).
     * @returns {Promise<FileSystemFileHandle | null | false>} false se o usuário cancelou;
     *          null se o diálogo não está disponível (usar o download padrão)
     */
    async #escolherArquivo(nomeArquivo, mimeType) {
        if (typeof window.showSaveFilePicker !== 'function') return null;
        try {
            const ext = nomeArquivo.includes('.') ? nomeArquivo.split('.').pop() : '';
            // O accept só aceita o tipo puro: "text/html;charset=utf-8" é rejeitado
            const tipo = (mimeType || '').split(';')[0].trim() || 'application/octet-stream';
            return await window.showSaveFilePicker({
                suggestedName: nomeArquivo,
                types: ext ? [{
                    description: ext.toUpperCase(),
                    accept: { [tipo]: [`.${ext}`] },
                }] : undefined,
            });
        } catch (err) {
            if (err && err.name === 'AbortError') {
                console.log('❌ Salvamento cancelado pelo usuário.');
                return false;
            }
            // Ex.: SecurityError quando o clique do usuário já "expirou"
            // (operação assíncrona longa antes da chamada) — usa o download.
            console.warn('Diálogo "Salvar como" indisponível, usando download padrão:', err);
            return null;
        }
    }

    // Grava o Blob no arquivo escolhido sem materializá-lo inteiro na memória
    async #gravarEmStreaming(handle, blob, onProgress) {
        const writable = await handle.createWritable();
        const total = blob.size;
        let gravado = 0;
        const contador = new TransformStream({
            transform(pedaco, controller) {
                gravado += pedaco.byteLength;
                if (onProgress) onProgress(gravado, total);
                controller.enqueue(pedaco);
            },
        });
        // pipeTo fecha o writable ao final (ou aborta em caso de erro)
        await blob.stream().pipeThrough(contador).pipeTo(writable);
        if (onProgress) onProgress(total, total);
    }

    /**
     * Download pelo mecanismo padrão do navegador. O Blob não é lido pelo
     * JavaScript: o navegador transmite o conteúdo (inclusive Blobs compostos
     * por partes/arquivos em disco) direto para o download.
     */
    #baixar(nomeArquivo, blob, onProgress, esperaRevogar = 60 * 1000) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Revogar só depois de um tempo: arquivos grandes podem ter o download
        // interrompido se a URL for revogada logo após o clique.
        setTimeout(() => URL.revokeObjectURL(url), esperaRevogar);
        if (onProgress) onProgress(blob.size, blob.size);
        // O navegador não informa à página se o download concluiu ou falhou
        // (falhas aparecem só em chrome://downloads)
        console.log(`⬇️ Download iniciado (Modo Web): ${nomeArquivo}`);
        return true;
    }
}
