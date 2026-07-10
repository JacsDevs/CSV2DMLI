import { limparListaPipe } from './helpers.js';

// ============================================
// CONSTRUTOR DO BANCO DE DADOS LEXICAL
// ============================================

class ConstrutorBancoDados {
    constructor(sistemaArquivosVirtual, configurador = null) {
        this.vfs = sistemaArquivosVirtual;
        this.configurador = configurador;
    }

    validarEContarMidia(db, tipo, arquivo, silenciarAvisos = false) {
        if (!arquivo) return true;
        const existe = this.verificarMidia(tipo, arquivo, silenciarAvisos);
        if (existe) {
            db.metadados.midiasValidadas[tipo].encontrados++;
        } else {
            db.metadados.midiasValidadas[tipo].faltantes++;
        }
        return existe;
    }

    verificarMidia(tipo, nomeArquivo, silenciarAvisos = false) {
        if (!nomeArquivo) return false;
        
        const existe = this.vfs.obterArquivo(tipo, nomeArquivo) !== null;
        
        if (!existe && !silenciarAvisos) {
            console.warn(`⚠️ Mídia não encontrada no VFS: ${tipo}/${nomeArquivo}`);
        }
        
        return existe;
    }

    obterMidiaUrl(tipo, nomeArquivo) {
        if (!nomeArquivo) return null;
        
        const arquivo = this.vfs.obterArquivo(tipo, nomeArquivo);
        
        if (arquivo) {
            if (arquivo instanceof File) {
                return URL.createObjectURL(arquivo);
            }
            return arquivo;
        }
        
        return null;
    }

    normalizarDados(df, silenciarAvisos = false) {
        const db = { 
            entradas: {}, 
            variacoes: {}, 
            significados: {}, 
            exemplos: {}, 
            imagens: {},
            videos: {},
            metadados: {
                totalEntradas: 0,
                totalVariacoes: 0,
                totalSignificados: 0,
                totalImagens: 0,
                totalVideos: 0,
                dataGeracao: new Date().toISOString(),
                midiasValidadas: {
                    audio: { encontrados: 0, faltantes: 0 },
                    imagem: { encontrados: 0, faltantes: 0 },
                    video: { encontrados: 0, faltantes: 0 }
                }
            }
        };
        
        let contEntradas = 1;
        const mapaEntradas = {};
        const mapaSignificados = {};
        let contSignificados = 1;
        let contExemplos = 1;
        let contImagens = 1;
        let contVideos = 1;

        df.forEach((linhaNormalizada, index) => {
            const camposBasicos = linhaNormalizada.camposBasicos || {};
            const variacoes = linhaNormalizada.variacoes || [];
            const exemplos = linhaNormalizada.exemplos || [];
            const imagens = linhaNormalizada.imagens || [];

            if (variacoes.length === 0 || !variacoes[0].item) return;

            const termoPrincipal = variacoes[0].item.trim().toLowerCase();
            const classe = String(camposBasicos.CLASSE_GRAMATICAL || '').trim().toLowerCase();
            const categoria = String(camposBasicos.CAMPO_SEMANTICO || '').trim().toLowerCase();
            const subCampo = String(camposBasicos.SUB_CAMPO_SEMANTICO || '').trim().toLowerCase();
            const chaveAgrupamento = `${termoPrincipal}##${classe}##${categoria}##${subCampo}`;
            
            let idEntrada = mapaEntradas[chaveAgrupamento];
            if (!idEntrada) {
                idEntrada = `ENT_${String(contEntradas).padStart(5, '0')}`;
                mapaEntradas[chaveAgrupamento] = idEntrada;
                contEntradas++;
                db.entradas[idEntrada] = {
                    ID: idEntrada, 
                    _ORDEM_ORIGINAL: index, 
                    _TERMO_PRINCIPAL: variacoes[0].item,
                    CLASSE_GRAMATICAL: String(camposBasicos.CLASSE_GRAMATICAL || '').trim(),
                    CAMPO_SEMANTICO: String(camposBasicos.CAMPO_SEMANTICO || '').trim(),
                    SUB_CAMPOS_SEMANTICOS: [camposBasicos.SUB_CAMPO_SEMANTICO].filter(Boolean),
                    ITENS_RELACIONADOS: String(camposBasicos.ITENS_RELACIONADOS || '').trim(),
                    TEXTOS_ESTRUTURADOS: [],
                    VARIACOES_IDS: [], 
                    ACEPCOES: []
                };
            }
            const entrada = db.entradas[idEntrada];
            
            // ========== VARIAÇÕES ==========
            variacoes.forEach((v, i) => {
                const lex = v.item || '';
                const audioFile = v.audio || '';
                
                const audioExiste = this.validarEContarMidia(db, 'audio', audioFile, silenciarAvisos);
                
                if (lex && !entrada.VARIACOES_IDS.some(vid => db.variacoes[vid] && db.variacoes[vid].TRANSCRICAO_ORTOGRAFICA === lex)) {
                    const varId = `${idEntrada}_VAR${i+1}`;
                    db.variacoes[varId] = {
                        ID: varId,
                        TRANSCRICAO_ORTOGRAFICA: lex,
                        ARQUIVO_SONORO: audioFile,
                        ARQUIVO_SONORO_EXISTE: audioExiste,
                        ARQUIVO_SONORO_URL: audioExiste ? this.obterMidiaUrl('audio', audioFile) : null,
                        TRANSCRICAO_FONEMICA: v.fone || '',
                        TRANSCRICAO_FONETICA: v.fonet || ''
                    };
                    entrada.VARIACOES_IDS.push(varId);
                }
            });

            // ========== TEXTOS ESTRUTURADOS ==========
            const titulosBusca = limparListaPipe(camposBasicos.TEXTO || '');

            titulosBusca.forEach(tit => {
                if (!tit) return;

                const fonteTextos = this.vfs.textosExtra;
                const textoMatch = fonteTextos && fonteTextos[tit];

                if (!textoMatch || typeof textoMatch !== 'object' || !textoMatch.titulo_base) {
                    console.warn(`⚠️ Texto estruturado "${tit}" referenciado na planilha mas não encontrado em textos.json`);
                    return;
                }

                const jaExiste = entrada.TEXTOS_ESTRUTURADOS.some(t => t.TITULO_BASE === textoMatch.titulo_base);
                if (jaExiste) return;

                const textoFormatado = {
                    TITULO_BASE: textoMatch.titulo_base,
                    TEXTO_NAO_LITERAL: textoMatch.texto_nao_literal || '',
                    VARIACOES: []
                };

                if (textoMatch.textos_variacoes && Array.isArray(textoMatch.textos_variacoes)) {
                    textoMatch.textos_variacoes.forEach(v => {
                        const variacao = { ID_VARIACAO: v.id_variacao || '', FRASES: [] };
                        if (v.frases && Array.isArray(v.frases)) {
                            v.frases.forEach(f => {
                                const audioFrase = f.audio?.arquivo || '';
                                const audioDados = f.audio?.dados || '';

                                let audioExiste = true;
                                let audioFinal = audioDados || audioFrase;

                                if (audioFrase && !audioDados) {
                                    audioExiste = this.validarEContarMidia(db, 'audio', audioFrase, silenciarAvisos);
                                }

                                variacao.FRASES.push({
                                    ORIGINAL: f.texto_original || '',
                                    TRADUCAO: f.traducao || '',
                                    AUDIO_SRC: (audioExiste && audioFrase && !audioDados) ? this.obterMidiaUrl('audio', audioFrase) : audioFinal,
                                    AUDIO_ARQUIVO: audioFinal,
                                    AUDIO_EXISTE: audioExiste,
                                    ARQUIVO_ORIGEM: f.arquivo_origem || ''
                                });
                            });
                        }
                        textoFormatado.VARIACOES.push(variacao);
                    });
                }

                entrada.TEXTOS_ESTRUTURADOS.push(textoFormatado);
            });

            // ========== ACEPÇÃO (SIGNIFICADO) ==========
            const defRaw = String(camposBasicos.TRADUCAO_SIGNIFICADO || '').trim();
            const descRaw = String(camposBasicos.DESCRICAO || '').trim();
            const chaveAcepcao = `${idEntrada}##${defRaw}##${descRaw}`;
            
            let idAcepcao = mapaSignificados[chaveAcepcao];
            if (!idAcepcao && (defRaw || descRaw || exemplos.length > 0 || imagens.length > 0 || camposBasicos.ARQUIVO_VIDEO)) {
                idAcepcao = `${idEntrada}_SIG${contSignificados++}`;
                mapaSignificados[chaveAcepcao] = idAcepcao;
                db.significados[idAcepcao] = {
                    ID: idAcepcao,
                    TRADUCAO: defRaw,
                    DESCRICAO: descRaw,
                    EXEMPLOS_IDS: [],
                    IMAGENS_IDS: [],
                    VIDEOS_IDS: [],
                    EXTRAS: []
                };
                entrada.ACEPCOES.push({
                    SIGNIFICADO_ID: idAcepcao,
                    EXEMPLOS_IDS: [],
                    IMAGENS_IDS: [],
                    VIDEOS_IDS: [],
                    EXTRAS: []
                });
            }
            
            if (idAcepcao) {
                let acepcaoAlvo = entrada.ACEPCOES.find(ac => ac.SIGNIFICADO_ID === idAcepcao);
                if (!acepcaoAlvo) acepcaoAlvo = entrada.ACEPCOES[entrada.ACEPCOES.length - 1];
                
                // ========== EXEMPLOS ==========
                exemplos.forEach((e, i) => {
                    if (e.trans || e.trad || e.audio) {
                        const exAudioExiste = this.validarEContarMidia(db, 'audio', e.audio, silenciarAvisos);
                        const exId = `${idAcepcao}_EX${contExemplos++}`;
                        db.exemplos[exId] = {
                            ID: exId,
                            TRANSCRICAO_EXEMPLO: e.trans || '',
                            TRADUCAO_EXEMPLO: e.trad || '',
                            ARQUIVO_SONORO_EXEMPLO: e.audio || '',
                            ARQUIVO_SONORO_EXISTE: exAudioExiste,
                            ARQUIVO_SONORO_URL: exAudioExiste ? this.obterMidiaUrl('audio', e.audio) : null
                        };
                        acepcaoAlvo.EXEMPLOS_IDS.push(exId);
                    }
                });

                // ========== IMAGENS ==========
                imagens.forEach((imgObj, i) => {
                    if (imgObj.img) {
                        const imgExiste = this.validarEContarMidia(db, 'imagem', imgObj.img, silenciarAvisos);
                        const imgId = `${idAcepcao}_IMG${contImagens++}`;
                        db.imagens[imgId] = {
                            ID: imgId,
                            IMAGEM: imgObj.img,
                            LEGENDA_IMAGEM: imgObj.leg || '',
                            IMAGEM_EXISTE: imgExiste,
                            IMAGEM_URL: imgExiste ? this.obterMidiaUrl('imagem', imgObj.img) : null
                        };
                        acepcaoAlvo.IMAGENS_IDS.push(imgId);
                    }
                });

                // ========== VÍDEOS ==========
                if (camposBasicos.ARQUIVO_VIDEO) {
                    const vidExiste = this.validarEContarMidia(db, 'video', camposBasicos.ARQUIVO_VIDEO, silenciarAvisos);
                    const vidId = `${idAcepcao}_VID${contVideos++}`;
                    if (!db.videos) db.videos = {};
                    db.videos[vidId] = {
                        ID: vidId,
                        ARQUIVO_VIDEO: camposBasicos.ARQUIVO_VIDEO,
                        VIDEO_EXISTE: vidExiste,
                        VIDEO_URL: vidExiste ? this.obterMidiaUrl('video', camposBasicos.ARQUIVO_VIDEO) : null
                    };
                    acepcaoAlvo.VIDEOS_IDS.push(vidId);
                }
            }
        });

        db.metadados.totalEntradas = Object.keys(db.entradas).length;
        db.metadados.totalVariacoes = Object.keys(db.variacoes).length;
        db.metadados.totalSignificados = Object.keys(db.significados).length;
        db.metadados.totalImagens = Object.keys(db.imagens).length;
        db.metadados.totalVideos = Object.keys(db.videos || {}).length;
        
        db.metadados.totalMidiasProcessadas = 
            db.metadados.midiasValidadas.audio.encontrados + 
            db.metadados.midiasValidadas.imagem.encontrados + 
            db.metadados.midiasValidadas.video.encontrados;
        
        db.metadados.totalMidiasFaltantes = 
            db.metadados.midiasValidadas.audio.faltantes + 
            db.metadados.midiasValidadas.imagem.faltantes + 
            db.metadados.midiasValidadas.video.faltantes;
        
        console.log('✅ Banco construído com validação de mídias:');
        console.log(`   - Áudios: ${db.metadados.midiasValidadas.audio.encontrados} encontrados, ${db.metadados.midiasValidadas.audio.faltantes} faltantes`);
        console.log(`   - Imagens: ${db.metadados.midiasValidadas.imagem.encontrados} encontrados, ${db.metadados.midiasValidadas.imagem.faltantes} faltantes`);
        console.log(`   - Vídeos: ${db.metadados.midiasValidadas.video.encontrados} encontrados, ${db.metadados.midiasValidadas.video.faltantes} faltantes`);
        
        return db;
    }

    limparUrlsTemporarias(bancoDados) {
        if (!bancoDados) return;
        
        const limparUrl = (item) => {
            if (item?.ARQUIVO_SONORO_URL?.startsWith('blob:')) {
                URL.revokeObjectURL(item.ARQUIVO_SONORO_URL);
            }
            if (item?.IMAGEM_URL?.startsWith('blob:')) {
                URL.revokeObjectURL(item.IMAGEM_URL);
            }
            if (item?.VIDEO_URL?.startsWith('blob:')) {
                URL.revokeObjectURL(item.VIDEO_URL);
            }
        };
        
        Object.values(bancoDados.variacoes || {}).forEach(limparUrl);
        Object.values(bancoDados.exemplos || {}).forEach(limparUrl);
        Object.values(bancoDados.imagens || {}).forEach(limparUrl);
        Object.values(bancoDados.videos || {}).forEach(limparUrl);
        
        console.log('🧹 URLs temporárias limpas');
    }
}

export default ConstrutorBancoDados;