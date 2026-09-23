import { ehUrlRemota } from './helpers.js';

export class LeitorCLDF {
    constructor(gerenciadorDados) {
        this.gerenciador = gerenciadorDados;
    }

    /**
     * Resolve o arquivo de uma linha do media.csv para o caminho usado no VFS.
     * Pela spec CLDF, um Download_URL relativo é relativo à pasta do metadata;
     * `pastaBase` é essa pasta dentro da pasta importada (ex.: "cldf/").
     * Ordem: caminho exato (Download_URL, depois Name) → nome do arquivo, se for
     * único na pasta → URL remota (http/https) → caminho resolvido (ficará como faltante).
     */
    _resolverCaminhoMidia(m, pastaBase, midiasPorCaminho, midiasPorNome) {
        const normalizar = (caminho) => {
            const partes = [];
            caminho.replace(/\\/g, '/').split('/').forEach(p => {
                if (!p || p === '.') return;
                if (p === '..') partes.pop();
                else partes.push(p);
            });
            return partes.join('/');
        };
        const decodificar = (caminho) => {
            try { return decodeURIComponent(caminho); } catch (e) { return caminho; }
        };

        const url = String(m.Download_URL || '').replace(/\\/g, '/').trim();
        const nomeDeclarado = String(m.Name || '').replace(/\\/g, '/').trim();
        const remota = ehUrlRemota(url);

        const candidatos = [];
        if (url && !remota) {
            let caminhoUrl = decodificar(url.split(/[?#]/)[0]);
            // file:///C:/... aponta para a máquina de quem gerou o pacote: só o nome do arquivo é aproveitável
            if (/^file:\/\//i.test(caminhoUrl)) caminhoUrl = caminhoUrl.split('/').pop();
            candidatos.push(normalizar(pastaBase + caminhoUrl), normalizar(caminhoUrl));
        }
        if (nomeDeclarado) {
            candidatos.push(normalizar(pastaBase + nomeDeclarado), normalizar(nomeDeclarado));
        }

        for (const candidato of candidatos) {
            const achado = midiasPorCaminho.get(candidato.toLowerCase());
            if (achado) return achado;
        }

        const nomesArquivo = [url.split(/[?#]/)[0], nomeDeclarado]
            .filter(Boolean)
            .map(c => decodificar(c.split('/').pop()).toLowerCase());
        for (const nome of nomesArquivo) {
            const lista = midiasPorNome.get(nome);
            if (lista && lista.length === 1) return lista[0];
        }

        if (remota) return url;
        return candidatos[0] || '';
    }

    /**
     * Tipo da mídia ('audio'|'video'|'imagem'|'unknown'): usa o Media_Type do
     * media.csv e, se ausente ou não reconhecido, a extensão do arquivo.
     */
    _tipoDaMidia(mediaType, caminho) {
        const mt = String(mediaType || '').toLowerCase();
        if (mt.includes('audio')) return 'audio';
        if (mt.includes('video')) return 'video';
        if (mt.includes('image')) return 'imagem';

        const configurador = this.gerenciador && this.gerenciador.configurador;
        const extensao = String(caminho || '').split(/[?#]/)[0].split('/').pop().split('.').pop().toLowerCase();
        if (configurador && configurador.isExtensaoValida) {
            for (const tipo of ['audio', 'video', 'imagem']) {
                if (configurador.isExtensaoValida(tipo, extensao)) return tipo;
            }
        }
        return 'unknown';
    }

    async lerArquivoBase(arquivo) {
        return new Promise((resolve, reject) => {
            const leitor = new FileReader();
            leitor.onload = (e) => {
                const csvData = e.target.result;
                const parseResult = window.Papa.parse(csvData, { header: true, skipEmptyLines: true });
                resolve(parseResult.data);
            };
            leitor.onerror = reject;
            leitor.readAsText(arquivo);
        });
    }

    async carregarCldf(arquivosCldf) {
        const { metadata, entries, senses, forms, examples, media, pastaBase = '', caminhosMidia = [] } = arquivosCldf;
        
        let entriesData = [];
        let sensesData = [];
        let formsData = [];
        let examplesData = [];
        let mediaData = [];

        if (entries) entriesData = await this.lerArquivoBase(entries);
        if (senses) sensesData = await this.lerArquivoBase(senses);
        if (forms) formsData = await this.lerArquivoBase(forms);
        if (examples) examplesData = await this.lerArquivoBase(examples);
        if (media) mediaData = await this.lerArquivoBase(media);

        // Índices das mídias presentes na pasta importada (caminho relativo à pasta raiz),
        // sem diferenciar maiúsculas/minúsculas, para casar com o Download_URL do media.csv.
        const midiasPorCaminho = new Map();
        const midiasPorNome = new Map();
        caminhosMidia.forEach(caminho => {
            midiasPorCaminho.set(caminho.toLowerCase(), caminho);
            const nome = caminho.split('/').pop().toLowerCase();
            if (!midiasPorNome.has(nome)) midiasPorNome.set(nome, []);
            midiasPorNome.get(nome).push(caminho);
        });

        const mediaMap = {};
        mediaData.forEach(m => {
            if (!m.ID) return;
            const nome = this._resolverCaminhoMidia(m, pastaBase, midiasPorCaminho, midiasPorNome);
            mediaMap[m.ID] = { nome, type: this._tipoDaMidia(m.Media_Type, nome) };
        });

        // Primeira mídia referenciada (Media_ID/Media_IDs) cujo tipo esteja entre os aceitos.
        // Evita que uma imagem ou PDF listado primeiro vire o arquivo de pronúncia.
        const primeiraMidiaDoTipo = (registro, tiposAceitos) => {
            const ids = registro.Media_IDs || registro.Media_ID;
            if (!ids) return null;
            for (const id of ids.split(',')) {
                const midia = mediaMap[id.trim()];
                if (midia && midia.nome && tiposAceitos.includes(midia.type)) return midia;
            }
            return null;
        };
        const TIPOS_PRONUNCIA = ['audio', 'video'];

        const colunasPadraoEntry = ["ID", "Headword", "Language_ID", "Description", "Phonemic_Transcription", "Phonetic_Transcription", "Part_Of_Speech", "Related_Items", "Semantic_Field", "Sub_Semantic_Field", "Sub_Semantic_Field_1", "Sub_Semantic_Field_2", "Sub_Semantic_Field_3", "Sub_Semantic_Field_4", "Sub_Semantic_Field_5", "Sub_Semantic_Field_6", "Media_ID", "Media_IDs"];
        const colunasPadraoSense = ["ID", "Entry_ID", "Description", "Description_Note", "Media_ID", "Media_IDs", "Structured_Texts_IDs", "Concepticon_ID", "Concepticon_Gloss"];
        const colunasPadraoForm = ["ID", "Language_ID", "Value", "Form", "Entry_ID", "Phonemic_Transcription", "Phonetic_Transcription", "Media_ID", "Media_IDs"];

        const extraCols = [];
        const allCols = [];

        if (entriesData.length > 0) {
            Object.keys(entriesData[0]).forEach(k => {
                allCols.push({ id: k, origem: 'Entrada' });
                if (!colunasPadraoEntry.includes(k)) extraCols.push({ id: k, origem: 'Entrada' });
            });
        }
        if (sensesData.length > 0) {
            Object.keys(sensesData[0]).forEach(k => {
                allCols.push({ id: k, origem: 'Significado' });
                if (!colunasPadraoSense.includes(k)) extraCols.push({ id: k, origem: 'Significado' });
            });
        }
        if (formsData.length > 0) {
            Object.keys(formsData[0]).forEach(k => {
                allCols.push({ id: k, origem: 'Forma' });
                if (!colunasPadraoForm.includes(k)) extraCols.push({ id: k, origem: 'Forma' });
            });
        }
        
        let cfgMap = {};
        if (window.pedirMapeamentoCldf && (extraCols.length > 0 || allCols.length > 0)) {
            cfgMap = await window.pedirMapeamentoCldf(extraCols, allCols);
        }

        let dmliData = [];

        const assignSemantics = (rowObj, dataObj) => {
            Object.keys(dataObj).forEach(k => {
                if (cfgMap[k] && cfgMap[k].semanticRole) {
                    rowObj[cfgMap[k].semanticRole] = dataObj[k] || '';
                }
            });
        };

        const formsByEntry = Object.create(null);
        formsData.forEach(f => {
            if (!f.Entry_ID) return;
            if (!formsByEntry[f.Entry_ID]) formsByEntry[f.Entry_ID] = [];
            formsByEntry[f.Entry_ID].push(f);
        });

        const sensesByEntry = Object.create(null);
        const sensesMap = Object.create(null);
        sensesData.forEach(s => {
            if (!s.Entry_ID) return;
            sensesMap[s.ID] = s;
            if (!sensesByEntry[s.Entry_ID]) sensesByEntry[s.Entry_ID] = [];
            sensesByEntry[s.Entry_ID].push(s);
        });

        const examplesBySense = Object.create(null);
        examplesData.forEach(ex => {
            if (!ex.Sense_ID) return;
            if (!examplesBySense[ex.Sense_ID]) examplesBySense[ex.Sense_ID] = [];
            examplesBySense[ex.Sense_ID].push(ex);
        });

        entriesData.forEach(entry => {
            const entryId = entry.ID;
            
            const midiaEntry = primeiraMidiaDoTipo(entry, TIPOS_PRONUNCIA);
            const audEntry = midiaEntry ? midiaEntry.nome : '';
            const tipoAudEntry = midiaEntry ? midiaEntry.type : '';

            let baseRow = {
                ITEM_LEXICAL: entry.Headword || '',
                CLASSE_GRAMATICAL: entry.Part_Of_Speech || '',
                CAMPO_SEMANTICO: entry.Semantic_Field || 'Geral', 
                SUB_CAMPO_SEMANTICO: entry.Sub_Semantic_Field || '',
                SUB_CAMPO_SEMANTICO_1: entry.Sub_Semantic_Field_1 || '',
                SUB_CAMPO_SEMANTICO_2: entry.Sub_Semantic_Field_2 || '',
                SUB_CAMPO_SEMANTICO_3: entry.Sub_Semantic_Field_3 || '',
                SUB_CAMPO_SEMANTICO_4: entry.Sub_Semantic_Field_4 || '',
                SUB_CAMPO_SEMANTICO_5: entry.Sub_Semantic_Field_5 || '',
                SUB_CAMPO_SEMANTICO_6: entry.Sub_Semantic_Field_6 || '',
                ITENS_RELACIONADOS: entry.Related_Items || '',
                TRANSCRICAO_FONEMICA: entry.Phonemic_Transcription || '',
                TRANSCRICAO_FONETICA: entry.Phonetic_Transcription || '',
                ARQUIVO_ENTRADA: audEntry
            };

            let descEntradaPieces = [];
            let descSignificadoPieces = [];
            
            Object.keys(entry).forEach(k => {
                assignSemantics(baseRow, entry);
                
                if (!colunasPadraoEntry.includes(k) && entry[k] !== undefined && entry[k] !== '') {
                    const cfg = cfgMap[k];
                    if (!cfg) return;
                    // Always preserve the raw value for CLDF round-trip export
                    if (!baseRow.METADADOS_EXTRAS) baseRow.METADADOS_EXTRAS = {};
                    baseRow.METADADOS_EXTRAS[k] = entry[k];
                    // Additionally concatenate into descriptions for HTML/Typst/LaTeX
                    if (cfg.dest !== 'ignorar' && cfg.dest !== 'coluna_extra') {
                        const pfx = cfg.prefix ? cfg.prefix : '';
                        const sfx = cfg.suffix !== undefined ? cfg.suffix : '';
                        const val = `${pfx}${entry[k]}${sfx}`;
                        
                        if (cfg.dest === 'desc_entrada') {
                            descEntradaPieces.push({ val, order: cfg.order !== undefined ? cfg.order : 999 });
                        } else if (cfg.dest === 'desc_significado') {
                            descSignificadoPieces.push({ val, order: cfg.order !== undefined ? cfg.order : 999 });
                        }
                    }
                }
            });
            
            descEntradaPieces.sort((a, b) => a.order - b.order);
            if (descEntradaPieces.length > 0) {
                const extraStr = descEntradaPieces.map(p => p.val).join(' ');
                baseRow.DESCRICAO_ENTRADA = baseRow.DESCRICAO_ENTRADA ? baseRow.DESCRICAO_ENTRADA + ' ' + extraStr : extraStr;
            }
            baseRow.DESCRICAO_ENTRADA_ORIGINAL = entry.Description || '';

            let entrySenses = sensesByEntry[entryId] || [];
            if (entrySenses.length === 0) {
                entrySenses = [{ ID: 'fake', Description: entry.Description || '' }];
            }

            entrySenses.forEach(sense => {
                let row = { ...baseRow };
                if (baseRow.METADADOS_EXTRAS) {
                    row.METADADOS_EXTRAS = { ...baseRow.METADADOS_EXTRAS };
                }
                row.TRADUCAO_SIGNIFICADO = sense.Description || '';
                row.DESCRICAO = sense.Description_Note || '';
                row.DESCRICAO_ORIGINAL = sense.Description_Note || ''; // preserve for CLDF round-trip
                
                let descEntradaPiecesSense = [];
                let descSignificadoPiecesSense = [];
                
                Object.keys(sense).forEach(k => {
                    assignSemantics(row, sense);
                    
                    if (!colunasPadraoSense.includes(k) && sense[k] !== undefined && sense[k] !== '') {
                        const cfg = cfgMap[k];
                        if (!cfg) return;
                        // Always preserve the raw value for CLDF round-trip export
                        if (!row.METADADOS_EXTRAS) row.METADADOS_EXTRAS = {};
                        row.METADADOS_EXTRAS[k] = sense[k];
                        // Additionally concatenate into descriptions for HTML/Typst/LaTeX
                        if (cfg.dest !== 'ignorar' && cfg.dest !== 'coluna_extra') {
                            const pfx = cfg.prefix ? cfg.prefix : '';
                            const sfx = cfg.suffix !== undefined ? cfg.suffix : '';
                            const val = `${pfx}${sense[k]}${sfx}`;
                            
                            if (cfg.dest === 'desc_entrada') {
                                descEntradaPiecesSense.push({ val, order: cfg.order !== undefined ? cfg.order : 999 });
                            } else if (cfg.dest === 'desc_significado') {
                                descSignificadoPiecesSense.push({ val, order: cfg.order !== undefined ? cfg.order : 999 });
                            }
                        }
                    }
                });
                
                descEntradaPiecesSense.sort((a, b) => a.order - b.order);
                descSignificadoPiecesSense.sort((a, b) => a.order - b.order);
                
                if (descEntradaPiecesSense.length > 0) {
                    const extraStr = descEntradaPiecesSense.map(p => p.val).join(' ');
                    row.DESCRICAO_ENTRADA = row.DESCRICAO_ENTRADA ? row.DESCRICAO_ENTRADA + ' ' + extraStr : extraStr;
                }
                if (descSignificadoPiecesSense.length > 0) {
                    const extraStr = descSignificadoPiecesSense.map(p => p.val).join(' ');
                    row.DESCRICAO = row.DESCRICAO ? row.DESCRICAO + ' ' + extraStr : extraStr;
                }
                
                let fotos = [];
                if ((sense.Media_IDs || sense.Media_ID)) {
                    (sense.Media_IDs || sense.Media_ID).split(',').forEach(mId => {
                        let mapped = mediaMap[mId.trim()];
                        if (mapped && mapped.type === 'imagem') fotos.push(mapped.nome);
                    });
                }
                row.IMAGEM = fotos.join(' | ');

                if (sense.Structured_Texts_IDs) {
                    row.TEXTO = sense.Structured_Texts_IDs.split(',').map(id => id.trim()).join(' | ');
                }

                let entryForms = formsByEntry[entryId] || [];
                let variacoesGlobais = [];
                // Tipo ('audio'|'video') da mídia de pronúncia de cada item de variacoesGlobais, alinhado por índice
                let tiposMidiaVariacoes = [];

                if (entryForms.length > 0) {
                    entryForms.forEach(vf => {
                        let fonemica = vf.Phonemic_Transcription || '';
                        let fonetica = vf.Phonetic_Transcription || '';
                        
                        Object.keys(vf).forEach(k => {
                            if (!colunasPadraoForm.includes(k) && vf[k] !== undefined && vf[k] !== '') {
                                if (!cfgMap[k]) return;
                                if (cfgMap[k].semanticRole === 'TRANSCRICAO_FONEMICA') fonemica = vf[k] || '';
                                if (cfgMap[k].semanticRole === 'TRANSCRICAO_FONETICA') fonetica = vf[k] || '';
                            }
                        });

                        const midiaForm = primeiraMidiaDoTipo(vf, TIPOS_PRONUNCIA);
                        const aud = midiaForm ? midiaForm.nome : '';
                        const tipoAud = midiaForm ? midiaForm.type : '';

                        let descEntradaPiecesForm = [];
                        let descSignificadoPiecesForm = [];
                        
                        Object.keys(vf).forEach(k => {
                            assignSemantics(row, vf);
                            
                            if (!colunasPadraoForm.includes(k) && vf[k] !== undefined && vf[k] !== '') {
                                const cfg = cfgMap[k];
                                if (!cfg) return;
                                // Always preserve the raw value for CLDF round-trip export
                                if (!row.METADADOS_EXTRAS) row.METADADOS_EXTRAS = {};
                                row.METADADOS_EXTRAS[k] = vf[k];
                                // Additionally concatenate into descriptions for HTML/Typst/LaTeX
                                if (cfg.dest !== 'ignorar' && cfg.dest !== 'coluna_extra') {
                                    const pfx = cfg.prefix ? cfg.prefix : '';
                                    const sfx = cfg.suffix !== undefined ? cfg.suffix : '';
                                    const val = `${pfx}${vf[k]}${sfx}`;
                                    
                                    if (cfg.dest === 'desc_entrada') {
                                        descEntradaPiecesForm.push({ val, order: cfg.order !== undefined ? cfg.order : 999 });
                                    } else if (cfg.dest === 'desc_significado') {
                                        descSignificadoPiecesForm.push({ val, order: cfg.order !== undefined ? cfg.order : 999 });
                                    }
                                }
                            }
                        });
                        
                        descEntradaPiecesForm.sort((a, b) => a.order - b.order);
                        descSignificadoPiecesForm.sort((a, b) => a.order - b.order);
                        
                        if (descEntradaPiecesForm.length > 0) {
                            const extraStr = descEntradaPiecesForm.map(p => p.val).join(' ');
                            row.DESCRICAO_ENTRADA = row.DESCRICAO_ENTRADA ? row.DESCRICAO_ENTRADA + ' ' + extraStr : extraStr;
                        }
                        if (descSignificadoPiecesForm.length > 0) {
                            const extraStr = descSignificadoPiecesForm.map(p => p.val).join(' ');
                            row.DESCRICAO = row.DESCRICAO ? row.DESCRICAO + ' ' + extraStr : extraStr;
                        }

                        let formRow = { ...baseRow, ...row };
                        formRow.ITEM_LEXICAL = vf.Form || '';
                        formRow.TRANSCRICAO_FONEMICA = fonemica || baseRow.TRANSCRICAO_FONEMICA || '';
                        formRow.TRANSCRICAO_FONETICA = fonetica || baseRow.TRANSCRICAO_FONETICA || '';
                        formRow.ARQUIVO_ENTRADA = aud || baseRow.ARQUIVO_ENTRADA || '';
                        
                        if (baseRow.METADADOS_EXTRAS || row.METADADOS_EXTRAS) {
                            formRow.METADADOS_EXTRAS = { ...(baseRow.METADADOS_EXTRAS || {}), ...(row.METADADOS_EXTRAS || {}) };
                        }
                        
                        if (formRow.ITEM_LEXICAL.trim() !== '') {
                            variacoesGlobais.push(formRow);
                            tiposMidiaVariacoes.push(aud ? tipoAud : tipoAudEntry);
                        }
                    });
                } else {
                    row.TRANSCRICAO_FONEMICA = row.TRANSCRICAO_FONEMICA || baseRow.TRANSCRICAO_FONEMICA || '';
                    row.TRANSCRICAO_FONETICA = row.TRANSCRICAO_FONETICA || baseRow.TRANSCRICAO_FONETICA || '';

                    let varRow = { ...baseRow, ...row };
                    if (baseRow.METADADOS_EXTRAS || row.METADADOS_EXTRAS) {
                        varRow.METADADOS_EXTRAS = { ...(baseRow.METADADOS_EXTRAS || {}), ...(row.METADADOS_EXTRAS || {}) };
                    }
                    variacoesGlobais.push(varRow);
                    tiposMidiaVariacoes.push(tipoAudEntry);
                }

                let senseExamples = examplesBySense[sense.ID] || [];
                let exAuds = [];
                let exTrans = [];
                let exTrads = [];
                let exemplos = [];
                senseExamples.forEach(ex => {
                    const midiaEx = primeiraMidiaDoTipo(ex, ['audio']);
                    const exAud = midiaEx ? midiaEx.nome : '';
                    exAuds.push(exAud);
                    exTrans.push(ex.Primary_Text || '');
                    exTrads.push(ex.Translated_Text || '');
                    exemplos.push({
                        audio: exAud,
                        trans: ex.Primary_Text || '',
                        trad: ex.Translated_Text || ''
                    });
                });
                row.ARQUIVO_SONORO_EXEMPLO = exAuds.join(' | ');
                row.TRANSCRICAO_EXEMPLO = exTrans.join(' | ');
                row.TRADUCAO_EXEMPLO = exTrads.join(' | ');

                let imagensEstruturadas = fotos.map(f => ({ img: f, leg: '' }));
                if (variacoesGlobais.length === 0) tiposMidiaVariacoes = [tipoAudEntry];
                let variacoesEstruturadas = (variacoesGlobais.length > 0 ? variacoesGlobais : [row]).map((v, i) => ({
                    ...v,
                    item: v.ITEM_LEXICAL || '',
                    audio: v.ARQUIVO_ENTRADA || '',
                    audioTipo: v.ARQUIVO_ENTRADA ? (tiposMidiaVariacoes[i] || '') : '',
                    fone: v.TRANSCRICAO_FONEMICA || '',
                    fonet: v.TRANSCRICAO_FONETICA || ''
                }));

                dmliData.push({
                    camposBasicos: variacoesGlobais.length > 0 ? variacoesGlobais[0] : row,
                    variacoes: variacoesEstruturadas,
                    imagens: imagensEstruturadas,
                    exemplos: exemplos
                });
            });
        });

        console.log("CLDF Convertido em Planilha Virtual. Total linhas: ", dmliData.length);
        if (window.sistema) {
            window.sistema.dadosPlanilha = dmliData;
            window.sistema.colunasPlanilha = Object.keys(dmliData[0] && dmliData[0].camposBasicos || {});
            window.sistema._reconstruirBanco();
            return { dados: dmliData, colunas: window.sistema.colunasPlanilha };
        }
        
        return { dados: dmliData, colunas: [] };
    }
}
