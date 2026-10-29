import { ehUrlRemota } from '../core/helpers.js';
import { RUNTIME_MIDIAS_EMBUTIDAS } from './runtimeMidiasEmbutidas.js';

class ExportadorBase {
    constructor(gerenciadorDados) {
        this.db = gerenciadorDados;
    }

    processarTemplate(template, dados) {
        // Função recursiva que avalia blocos e variáveis dinamicamente
        function processar(textoAtual, contextoAtual) {
            // 1. Resolve blocos lógicos e iteradores: {{#CHAVE}}...{{/CHAVE}}
            const regexBloco = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
            
            let textoProcessado = textoAtual.replace(regexBloco, (match, chave, conteudoInterno) => {
                const valor = contextoAtual[chave];
                
                // Regra de Omissão: Se não existe ou está vazio, limpa o bloco.
                if (valor === undefined || valor === null || valor === '' || 
                   (Array.isArray(valor) && valor.length === 0)) {
                    return '';
                }
                
                // Regra de Iteração (Arrays: SIGNIFICADOS, EXEMPLOS, IMAGENS)
                if (Array.isArray(valor)) {
                    return valor.map(item => {
                        if (typeof item === 'object' && item !== null) {
                            const temConteudo = Object.values(item).some(v => v !== null && v !== undefined && String(v).trim() !== '');
                            if (!temConteudo) return '';
                            return processar(conteudoInterno, { ...contextoAtual, ...item });
                        }
                        return ''; 
                    }).join('');
                }
                
                // Regra de Condição Simples
                const novoContexto = (typeof valor === 'object' && valor !== null) ? { ...contextoAtual, ...valor } : contextoAtual;
                return processar(conteudoInterno, novoContexto);
            });
            
            // 2. Resolve variáveis simples de texto: {{ CHAVE }}
            const regexVariavel = /\{\{\s*(\w+)\s*\}\}/g;
            textoProcessado = textoProcessado.replace(regexVariavel, (match, chave) => {
                const valor = contextoAtual[chave];
                return (valor !== undefined && valor !== null) ? String(valor) : '';
            });
            
            return textoProcessado;
        }

        let resultado = processar(template, dados);

        // 3. Limpeza Final de Artefatos e Formatação
        return resultado
            .replace(/#align\s*\(\s*center\s*\)\s*\[\s*\n?\s*\]/g, '')
            .replace(/#image\s*\(\s*"",[^)]*\)/g, '')
            .replace(/\*_\s*_\*/g, '')
            .replace(/^\s*\.\s*\.\s*$/gm, '')
            .replace(/\n\s*\n\s*\n+/g, '\n\n')
            .trim();
    }

    extrairDadosEntrada(entrada) {
        const banco = this.db.bancoDados;
        const variacoes = (entrada.VARIACOES_IDS || []).map(id => banco.variacoes[id]).filter(Boolean);
        
        const termosUnicos = [...new Set(variacoes.map(v => v.TRANSCRICAO_ORTOGRAFICA).filter(Boolean))];
        const fonemicasUnicas = [...new Set(variacoes.map(v => v.TRANSCRICAO_FONEMICA).filter(Boolean))].map(f => `/${f}/`);
        const foneticasUnicas = [...new Set(variacoes.map(v => v.TRANSCRICAO_FONETICA).filter(Boolean))].map(f => `[${f}]`);
        // Mapa nome -> tipo ('audio'|'video'), na ordem de primeira ocorrência, para alinhar com audiosUnicos
        const tiposPorArquivo = new Map();
        variacoes.forEach(v => {
            if (v.ARQUIVO_ENTRADA && !tiposPorArquivo.has(v.ARQUIVO_ENTRADA)) {
                tiposPorArquivo.set(v.ARQUIVO_ENTRADA, v.ARQUIVO_ENTRADA_TIPO || 'audio');
            }
        });
        const audiosUnicos = [...tiposPorArquivo.keys()];

        const significados = [];
        if (entrada.ACEPCOES && entrada.ACEPCOES.length > 0) {
            entrada.ACEPCOES.forEach((ac, idx) => {
                const significado = { NUMERO: entrada.ACEPCOES.length > 1 ? String(idx + 1) : '', TRADUCAO: '', DESCRICAO: '', EXEMPLOS: [], IMAGENS: [], VIDEOS: [], EXTRAS: [], TEXTOS_ESTRUTURADOS: [] };
                
                if (ac.SIGNIFICADO_ID && banco.significados[ac.SIGNIFICADO_ID]) {
                    const sig = banco.significados[ac.SIGNIFICADO_ID];
                    significado.TRADUCAO = sig.TRADUCAO || '';
                    significado.DESCRICAO = sig.DESCRICAO || '';
                }
                
                if (ac.TEXTOS_ESTRUTURADOS) {
                    significado.TEXTOS_ESTRUTURADOS = ac.TEXTOS_ESTRUTURADOS;
                }

                if (ac.EXEMPLOS_IDS) ac.EXEMPLOS_IDS.forEach(exId => {
                    const ex = banco.exemplos[exId];
                    if (ex) {
                        let audioEx = '';
                        if (ex.ARQUIVO_SONORO_EXEMPLO) {
                            const raw = ex.ARQUIVO_SONORO_EXEMPLO;
                            audioEx = (this.midiasGeradas && this.midiasGeradas[raw]) ? this.midiasGeradas[raw] : (raw.includes("/") || raw.includes("\\") ? raw : "audio/" + raw);
                        }
                        significado.EXEMPLOS.push({ TRANS: ex.TRANSCRICAO_EXEMPLO || '', TRAD: ex.TRADUCAO_EXEMPLO || '', AUDIO: audioEx });
                    }
                });
                if (ac.IMAGENS_IDS) ac.IMAGENS_IDS.forEach(imgId => {
                    const img = banco.imagens[imgId];
                    if (img && img.IMAGEM) {
                        const raw = img.IMAGEM;
                        let limpo;
                        try { limpo = decodeURIComponent(raw); } catch(e) { limpo = raw; }
                        limpo = limpo.replace(/[{}]/g, '').trim().toLowerCase();
                        const fallbackPath = (limpo.includes("/") || limpo.includes("\\") ? limpo : "foto/" + limpo);
                        const url = (this.midiasGeradas && this.midiasGeradas[raw]) ? this.midiasGeradas[raw] : fallbackPath;
                        significado.IMAGENS.push({ ARQUIVO: url, LEGENDA: img.LEGENDA_IMAGEM || '' });
                    }
                });
                if (ac.VIDEOS_IDS && this.db.bancoDados) {
                    ac.VIDEOS_IDS.forEach(vidId => {
                        const vid = this.db.bancoDados.videos?.[vidId];
                        if (vid && vid.ARQUIVO_VIDEO) {
                            const raw = vid.ARQUIVO_VIDEO;
                            const url = (this.midiasGeradas && this.midiasGeradas[raw]) ? this.midiasGeradas[raw] : (raw.includes("/") || raw.includes("\\") ? raw : "video/" + raw);
                            significado.VIDEOS.push({ ARQUIVO: url });
                        }
                    });
                }
                if (ac.EXTRAS) ac.EXTRAS.forEach(ext => { 
                    const textoVal = typeof ext === 'string' ? ext : (ext.TEXTO || '');
                    if (textoVal) significado.EXTRAS.push({ TEXTO: textoVal }); 
                });
                
                significados.push(significado);
            });
        }
        
        const fonemicasStr = fonemicasUnicas.join(' ~ ');
        const foneticasStr = foneticasUnicas.join(' ~ ');
        const audiosUnicosResolved = audiosUnicos.map(a => {
            const raw = a;
            const tipo = tiposPorArquivo.get(a) || 'audio';
            const prefixoPadrao = tipo === 'video' ? 'video/' : 'audio/';
            return (this.midiasGeradas && this.midiasGeradas[raw]) ? this.midiasGeradas[raw] : (raw.includes("/") || raw.includes("\\") ? raw : prefixoPadrao + raw);
        });
        const audiosTiposResolved = audiosUnicos.map(a => tiposPorArquivo.get(a) || 'audio');

        const result = {
            TERMO: termosUnicos.length > 0 ? termosUnicos.join(' ~ ') : (entrada._TERMO_PRINCIPAL || '???'),
            TERMO_PARENT: entrada._TERMO_PRINCIPAL || '???', 
            CLASSE: entrada.CLASSE_GRAMATICAL || '',
            CAMPO_SEMANTICO: entrada.CAMPO_SEMANTICO || '',
            SUB_CAMPO_SEMANTICO: entrada.SUB_CAMPO_SEMANTICO || '',
            SUB_CAMPO_SEMANTICO_1: entrada.SUB_CAMPO_SEMANTICO_1 || '',
            SUB_CAMPO_SEMANTICO_2: entrada.SUB_CAMPO_SEMANTICO_2 || '',
            SUB_CAMPO_SEMANTICO_3: entrada.SUB_CAMPO_SEMANTICO_3 || '',
            SUB_CAMPO_SEMANTICO_4: entrada.SUB_CAMPO_SEMANTICO_4 || '',
            SUB_CAMPO_SEMANTICO_5: entrada.SUB_CAMPO_SEMANTICO_5 || '',
            SUB_CAMPO_SEMANTICO_6: entrada.SUB_CAMPO_SEMANTICO_6 || '',
            FONEMICA: fonemicasStr,
            FONETICA: foneticasStr,
            AUDIO: audiosUnicosResolved.join(' ~ '),
            AUDIO_TIPOS: audiosTiposResolved.join(' ~ '),
            SIGNIFICADOS: significados,
            ITENS_RELACIONADOS: entrada.ITENS_RELACIONADOS || '',
            INDEX: significados.length > 0 ? significados[0].TRADUCAO : ''
        };
        return result;
    }

    // `opcoesMidia.comoUrl` (prévia): em vez de converter as mídias em Base64, referencia
    // cada File/Blob do VFS por uma URL blob: — instantâneo, sem copiar bytes. Só serve para
    // HTML aberto nesta mesma sessão (iframe blob: da mesma origem); as URLs criadas são
    // acumuladas em `opcoesMidia.urlsCriadas` para o chamador revogá-las depois.
    async gerarScriptsDadosEmLotes(tipoAtivo, embutirMidias = false, entradasLimitadas = null, opcoesMidia = {}) {
        const db = this.db.bancoDados;
        if (!db) return '';

        // Quando `entradasLimitadas` é informado (prévia), restringe tanto o
        // escaneamento de mídias referenciadas quanto os dados embutidos a essas
        // entradas, para não converter em Base64 mídias de entradas descartadas.
        const entradasConsideradas = entradasLimitadas || Object.values(db.entradas);

        // 1. Extrair mídias referenciadas para não embutir lixo
        const referenciadas = { audio: new Set(), imagem: new Set(), video: new Set() };
        for (const entrada of entradasConsideradas) {
            entrada.VARIACOES_IDS?.forEach(id => {
                const v = db.variacoes[id];
                if (v && v.ARQUIVO_ENTRADA) {
                    const tipo = v.ARQUIVO_ENTRADA_TIPO === 'video' ? 'video' : 'audio';
                    referenciadas[tipo].add(v.ARQUIVO_ENTRADA);
                }
            });
            entrada.ACEPCOES?.forEach(ac => {
                ac.EXEMPLOS_IDS?.forEach(id => {
                    const ex = db.exemplos[id];
                    if (ex && ex.ARQUIVO_SONORO_EXEMPLO) referenciadas.audio.add(ex.ARQUIVO_SONORO_EXEMPLO);
                });
                ac.IMAGENS_IDS?.forEach(id => {
                    const img = db.imagens[id];
                    if (img && img.IMAGEM) referenciadas.imagem.add(img.IMAGEM);
                });
                if (ac.VIDEOS_IDS && db.videos) {
                    ac.VIDEOS_IDS.forEach(vidId => {
                        const vid = db.videos[vidId];
                        if (vid && vid.ARQUIVO_VIDEO) {
                            referenciadas.video.add(vid.ARQUIVO_VIDEO);
                        }
                    });
                }
            });
        }

        const midias = {};
        const tipos = { audio: 'audio/', imagem: 'foto/', video: 'video/' };
        
        if (opcoesMidia.comoUrl && this.db.vfs) {
            // Tamanho das mídias locais: decide como gravar o HTML embutido (ver index.html)
            this.bytesMidiasLocais = 0;
            for (const [tipo, prefixo] of Object.entries(tipos)) {
                for (const nome of referenciadas[tipo]) {
                    if (ehUrlRemota(nome)) { midias[nome] = nome; continue; }
                    const arquivo = this.db.vfs.obterArquivo(tipo, nome);
                    if (arquivo instanceof File || arquivo instanceof Blob) {
                        this.bytesMidiasLocais += arquivo.size;
                        const url = URL.createObjectURL(arquivo);
                        if (Array.isArray(opcoesMidia.urlsCriadas)) opcoesMidia.urlsCriadas.push(url);
                        midias[nome] = url;
                    } else {
                        midias[nome] = (nome.includes("/") || nome.includes("\\") ? nome : prefixo + nome);
                    }
                }
            }
        } else if (embutirMidias && this.db.vfs) {
            const arquivosParaConverter = [];
            
            for (const [tipo, prefixo] of Object.entries(tipos)) {
                for (const nome of referenciadas[tipo]) {
                    // URL remota (Download_URL http/https do CLDF) é referenciada diretamente
                    if (ehUrlRemota(nome)) {
                        midias[nome] = nome;
                        continue;
                    }
                    const arquivo = this.db.vfs.obterArquivo(tipo, nome);
                    if (arquivo instanceof File || arquivo instanceof Blob) {
                        arquivosParaConverter.push({ nome, arquivo, tipo });
                    } else {
                        midias[nome] = (nome.includes("/") || nome.includes("\\") ? nome : prefixo + nome);
                    }
                }
            }
            
            const marcadores = opcoesMidia.midiasPorMarcador;
            if (marcadores && arquivosParaConverter.length > 0) {
                // Gravação em streaming: cada mídia vira um marcador curto, trocado pelo
                // Base64 (lido do arquivo em pedaços) só no momento de gravar — ver
                // ExportadorHtmlCards.gravarEmbutido.
                // Vídeos (com `marcadores.videos`) viram o identificador "midia:N" e são
                // gravados em blocos à parte, decodificados só quando abertos — ver
                // runtimeMidiasEmbutidas.js. O mesmo arquivo citado por nomes diferentes
                // é gravado uma vez só.
                const idPorVideo = new Map();
                arquivosParaConverter.forEach((item, i) => {
                    if (item.tipo === 'video' && marcadores.videos) {
                        let id = idPorVideo.get(item.arquivo);
                        if (!id) {
                            id = `midia:${idPorVideo.size}`;
                            idPorVideo.set(item.arquivo, id);
                            marcadores.videos.set(id, item.arquivo);
                        }
                        midias[item.nome] = id;
                        return;
                    }
                    const marcador = `${marcadores.prefixo}${i}__`;
                    marcadores.mapa.set(marcador, item.arquivo);
                    midias[item.nome] = marcador;
                });
            } else if (arquivosParaConverter.length > 0) {
                console.log(`⏳ Iniciando conversão de ${arquivosParaConverter.length} mídias para Base64 na thread principal...`);
                
                const converterParaBase64 = (blob) => new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });

                let convertidos = 0;
                for (const item of arquivosParaConverter) {
                    try {
                        const b64 = await converterParaBase64(item.arquivo);
                        if (b64) {
                            midias[item.nome] = b64;
                        }
                    } catch (err) {
                        console.warn(`Falha ao converter mídia para Base64: ${item.nome}`, err);
                        // Fallback para caminho relativo
                        const tipo = item.arquivo.type.startsWith('audio') ? 'audio/' : (item.arquivo.type.startsWith('video') ? 'video/' : 'foto/');
                        midias[item.nome] = tipo + item.nome;
                    }
                    convertidos++;
                    if (convertidos % 5 === 0) {
                        const evento = new CustomEvent('exportacaoProgresso', { detail: { progresso: convertidos, total: arquivosParaConverter.length } });
                        window.dispatchEvent(evento);
                        // Evita travamento da UI
                        await new Promise(r => setTimeout(r, 10));
                    }
                }
                
                console.log('✅ Conversão concluída!');
            }
        } else {
            // Apenas referenciar pelo caminho local relativo. Quando a mídia está no VFS, o caminho
            // vem da chave real do arquivo — o mesmo usado para gravá-lo no ZIP/APK
            // (caminhoMidiaExportada em index.html): chave com pasta (mídia CLDF) é mantida,
            // chave só com o nome vai para a pasta padrão do tipo.
            for (const [tipo, prefixo] of Object.entries(tipos)) {
                for (const nome of referenciadas[tipo]) {
                    const vfs = this.db.vfs;
                    const chave = (vfs && typeof vfs.obterChave === 'function' && !ehUrlRemota(nome)) ? vfs.obterChave(tipo, nome) : null;
                    if (chave !== null) {
                        midias[nome] = chave.includes('/') ? chave : prefixo + chave;
                    } else {
                        midias[nome] = (nome.includes("/") || nome.includes("\\") ? nome : prefixo + nome);
                    }
                }
            }
        }
        
        this.midiasGeradas = midias;

        // 2. Preparar os dados para a UI
        // Mídias embutidas (data:) já estão em DicionarioMidias: nas entradas fica só o nome,
        // que o resolverMidia() do app troca pelo Base64 — senão cada mídia seria gravada duas
        // vezes no HTML. Só vale para nomes sem pasta: um "video/x.mp4" o app devolveria como
        // caminho, sem consultar DicionarioMidias.
        const prefixoMarcador = opcoesMidia.midiasPorMarcador && opcoesMidia.midiasPorMarcador.prefixo;
        const videosEmBlocos = opcoesMidia.midiasPorMarcador && opcoesMidia.midiasPorMarcador.videos;
        const ehEmbutida = (valor) => String(valor).startsWith('data:')
            || (!!prefixoMarcador && String(valor).startsWith(prefixoMarcador))
            || (!!videosEmBlocos && videosEmBlocos.has(String(valor)));
        const midiasParaDados = {};
        for (const [nome, valor] of Object.entries(midias)) {
            const soNome = !/[\/\\~]/.test(nome) && !nome.startsWith('data:') && !nome.startsWith('blob:');
            midiasParaDados[nome] = (soNome && ehEmbutida(valor)) ? nome : valor;
        }
        this.midiasGeradas = midiasParaDados;
        const entradasConvertidas = [];
        for (const entrada of entradasConsideradas) {
            const dados = this.extrairDadosEntrada(entrada);
            entradasConvertidas.push({ ...entrada, ...dados });
        }
        this.midiasGeradas = midias;
        // App nativo (dadosApp.js): só as entradas, com as mídias por caminho relativo
        if (opcoesMidia.comoDados) return entradasConvertidas;

        // 3. Empacotar em Scripts por Lotes
        // Escapa </ para evitar que dados do dicionário que contenham </script>
        // encerrem prematuramente o bloco <script> e corrompam o HTML gerado.
        const jsonSeguro = (obj) => JSON.stringify(obj).replace(/<\//g, '<\\/');
        // Base64 de mídia não tem aspas, barra invertida nem "<": vai entre aspas sem passar
        // por JSON.stringify/replace, que copiariam a string inteira (pode ter centenas de MB).
        const stringJsonSegura = (valor) => (typeof valor === 'string' && valor.startsWith('data:') && !/["\\<\u0000-\u001f\u2028\u2029]/.test(valor))
            ? ['"', valor, '"']
            : [jsonSeguro(valor)];

        // O resultado é montado como lista de partes, serializando cada mídia e cada entrada
        // separadamente: com muitas mídias embutidas o total passa do limite de tamanho de
        // string do motor JS ("Invalid string length"). Juntas, as partes produzem exatamente
        // o mesmo texto que serializar os objetos inteiros.
        const partes = [];
        partes.push('<script>\n');
        partes.push('window.DicionarioMidias = {');
        Object.entries(midias).forEach(([nome, valor], i) => {
            partes.push(i > 0 ? ',' : '', jsonSeguro(nome), ':', ...stringJsonSegura(valor));
        });
        partes.push('};\n');
        let cabecalho = `window.dadosDicionarioLexical = [];\n`;
        cabecalho += `window.templateEntradaAtivo = "${tipoAtivo}";\n`;
        if (this.templateEntrada) cabecalho += `window.templateEntrada = ${jsonSeguro(this.templateEntrada)};\n`;
        if (this.templateCard) cabecalho += `window.templateCard = ${jsonSeguro(this.templateCard)};\n`;
        if (this.templateLista) cabecalho += `window.templateLista = ${jsonSeguro(this.templateLista)};\n`;
        cabecalho += `function adicionaDados(lote) { window.dadosDicionarioLexical.push(...lote); }\n`;
        if (videosEmBlocos && videosEmBlocos.size > 0) cabecalho += RUNTIME_MIDIAS_EMBUTIDAS;
        cabecalho += '<\/script>\n';
        partes.push(cabecalho);

        const LOTES = 50;
        for (let i = 0; i < entradasConvertidas.length; i += LOTES) {
            const lote = entradasConvertidas.slice(i, i + LOTES);
            partes.push('<script>adicionaDados([');
            lote.forEach((entrada, j) => partes.push(j > 0 ? ',' : '', jsonSeguro(entrada)));
            partes.push(']);<\/script>\n');
        }

        return opcoesMidia.comoPartes ? partes : partes.join('');
    }
}
export default ExportadorBase;