import ExportadorBase from './exportadorBase.js';

export class ExportadorCLDF extends ExportadorBase {
    constructor(gerenciadorDados, configurador) {
        super(gerenciadorDados, configurador);
        this.nomeZip = 'projeto_cldf.zip';
    }

    escapeCsvCell(valor) {
        const val = String(valor || '');
        if (val.includes(',') || val.includes('\n') || val.includes('"')) {
            return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
    }

    gerarTabelaCsv(cabecalhos, linhas) {
        const headerRow = cabecalhos.join(',');
        const dataRows = linhas.map(linha => {
            return cabecalhos.map(col => this.escapeCsvCell(linha[col])).join(',');
        });
        return [headerRow, ...dataRows].join('\n');
    }

    
    async carregarConcepticon(idiomaBusca) {
        if (!idiomaBusca || idiomaBusca === 'none') return null;
        
        // Cache na memria do navegador
        if (window.cacheConcepticon && window.cacheConcepticon.idioma === idiomaBusca) {
            return window.cacheConcepticon;
        }

        try {
            console.log("Baixando dicionarios Concepticon para o cache offline...");
            // Usar fetch. O Service Worker interceptar e ir armazenar/buscar no cache
            const respConc = await fetch('concepticon-cldf/concepticon.csv');
            if (!respConc.ok) throw new Error("concepticon.csv no encontrado");
            const textConc = await respConc.text();
            
            const id2Gloss = {};
            const linhasConc = textConc.split('\n');
            // ID,Name,Description,...
            for (let i = 1; i < linhasConc.length; i++) {
                if (!linhasConc[i].trim()) continue;
                const colunas = linhasConc[i].split(',');
                if (colunas.length >= 2) {
                    id2Gloss[colunas[0].trim()] = colunas[1].trim();
                }
            }

            const respGloss = await fetch('concepticon-cldf/glosses.csv');
            if (!respGloss.ok) throw new Error("glosses.csv no encontrado");
            const textGloss = await respGloss.text();

            const pt2Ids = {};
            const linhasGloss = textGloss.split('\n');
            // ID,Language_ID,Parameter_ID,Form,...
            // Parameter_ID is the Concepticon ID
            const isoMap = { 'pt': 'portuguese', 'en': 'english', 'es': 'spanish' };
            const idiomaFull = (isoMap[idiomaBusca.toLowerCase()] || idiomaBusca).toLowerCase();
            
            for (let i = 1; i < linhasGloss.length; i++) {
                if (!linhasGloss[i].trim()) continue;
                // Since glosses might have quotes, let's do a simple regex or split
                // We know language is the second column
                const match = /^[^,]+,([^,]+),([^,]+),"?(.*?)"?,/.exec(linhasGloss[i]);
                if (match) {
                    const lang = match[1].toLowerCase().trim();
                    if (lang === idiomaFull) {
                        const paramId = match[2].trim();
                        const form = match[3].toLowerCase().trim();
                        if (!pt2Ids[form]) pt2Ids[form] = [];
                        if (!pt2Ids[form].includes(paramId)) {
                            pt2Ids[form].push(paramId);
                        }
                    }
                }
            }
            
            window.cacheConcepticon = {
                idioma: idiomaBusca,
                id2Gloss,
                pt2Ids
            };
            
            return window.cacheConcepticon;
            
        } catch (e) {
            console.warn("No foi possvel carregar os dados do Concepticon: " + e.message);
            return null;
        }
    }

    async exportarCldfZip(opcoes, nomeArquivoSaida = 'dicionario_cldf.zip') {
        const zip = new JSZip();
        const dicio = Object.values(this.db.bancoDados.entradas) || [];
        

        const languages = [];
        const entries = [];
        const senses = [];
        const forms = [];
        const examples = [];
        const media = [];
        const ambiguidadeConcepticon = [];
        
        const concepticonData = await this.carregarConcepticon(opcoes.metadados && opcoes.metadados.cldfGlossLang);
        

        const extraColumnsEntry = new Set();
        const extraColumnsSense = new Set();
        dicio.forEach(entrada => {
            if (entrada.METADADOS_EXTRAS) {
                Object.keys(entrada.METADADOS_EXTRAS).forEach(k => extraColumnsEntry.add(k));
            }
            if (entrada.EXTRAS_ENTRADA_RAW) {
                entrada.EXTRAS_ENTRADA_RAW.forEach(e => extraColumnsEntry.add(e.chave));
            }
            
            if (entrada.ACEPCOES) {
                entrada.ACEPCOES.forEach(ac => {
                    const sig = this.db.bancoDados.significados[ac.SIGNIFICADO_ID];
                    if (sig) {
                        if (sig.METADADOS_EXTRAS) {
                            Object.keys(sig.METADADOS_EXTRAS).forEach(k => extraColumnsSense.add(k));
                        }
                        if (sig.EXTRAS_RAW) {
                            sig.EXTRAS_RAW.forEach(e => extraColumnsSense.add(e.chave));
                        }
                    }
                });
            }
        });
        const extraColsEntryArr = Array.from(extraColumnsEntry);
        const extraColsSenseArr = Array.from(extraColumnsSense);

        
        let mediaContador = 1;
        let entryContador = 1;
        let formContador = 1;
        let senseContador = 1;
        let exContador = 1;
        
        const addMedia = (url, originalName = null) => {
            if (!url) return '';
            const mId = 'M' + String(mediaContador++).padStart(4, '0');
            
            const nameToTest = originalName || url;
            const isAudio = nameToTest.includes('AUDIO/') || nameToTest.match(/\.(mp3|wav|ogg)$/i) || nameToTest.startsWith('data:audio');
            const isVideo = nameToTest.includes('VIDEO/') || nameToTest.match(/\.(mp4|avi|mov|webm)$/i) || nameToTest.startsWith('data:video');
            
            let folder = isAudio ? 'AUDIO' : (isVideo ? 'VIDEO' : 'FOTO');
            let fileName = '';
            
            if (url.startsWith('data:')) {
                const ext = isAudio ? 'mp3' : (isVideo ? 'mp4' : 'jpg'); 
                fileName = 'media_' + mId + '.' + ext;
            } else if (originalName) {
                // Remove qualquer path (ex: FOTO/imagem.jpg -> imagem.jpg)
                fileName = originalName.split(/[\/\\]/).pop();
            } else {
                fileName = url.split('/').pop();
                if (fileName.length > 20 && !fileName.includes('.')) {
                    fileName = 'media_' + mId + (isAudio ? '.mp3' : '.jpg');
                }
            }
            
            const relPath = 'media/' + folder + '/' + fileName;
            
            media.push({
                ID: mId,
                Name: fileName,
                Description: '',
                Media_Type: isAudio ? 'audio/mpeg' : (isVideo ? 'video/mp4' : 'image/jpeg'),
                Download_URL: relPath,
                _ORIGINAL_URL: url,
                _FOLDER: folder,
                _FILENAME: fileName
            });
            return mId;
        };

        languages.push({
            ID: "L0000",
            Name: (opcoes.metadados && opcoes.metadados.cldfLangName) ? opcoes.metadados.cldfLangName : ((opcoes.metadados && opcoes.metadados.html) ? opcoes.metadados.html : "Idioma do Dicionario"),
            Glottocode: (opcoes.metadados && opcoes.metadados.cldfGlottocode) ? opcoes.metadados.cldfGlottocode : "",
            ISO639P3code: (opcoes.metadados && opcoes.metadados.cldfIso) ? opcoes.metadados.cldfIso : ""
        });

        dicio.forEach(entrada => {
            const eId = "E" + String(entryContador++).padStart(4, '0');
            const headword = entrada._TERMO_PRINCIPAL || '';
            const pos = entrada.CLASSE_GRAMATICAL || '';
            const semanticField = entrada.CAMPO_SEMANTICO || '';
            const subSemanticField = entrada.SUB_CAMPO_SEMANTICO || '';
            const subSemanticField1 = entrada.SUB_CAMPO_SEMANTICO_1 || '';
            const subSemanticField2 = entrada.SUB_CAMPO_SEMANTICO_2 || '';
            const subSemanticField3 = entrada.SUB_CAMPO_SEMANTICO_3 || '';
            const subSemanticField4 = entrada.SUB_CAMPO_SEMANTICO_4 || '';
            const subSemanticField5 = entrada.SUB_CAMPO_SEMANTICO_5 || '';
            const subSemanticField6 = entrada.SUB_CAMPO_SEMANTICO_6 || '';

            let fonemicaPrincipal = '';
            let foneticaPrincipal = '';
            if (entrada.VARIACOES_IDS && entrada.VARIACOES_IDS.length > 0 && this.db.bancoDados) {
                const varIdMain = entrada.VARIACOES_IDS[0];
                const variacaoPrincipal = this.db.bancoDados.variacoes[varIdMain];
                if (variacaoPrincipal) {
                    fonemicaPrincipal = variacaoPrincipal.TRANSCRICAO_FONEMICA || '';
                    foneticaPrincipal = variacaoPrincipal.TRANSCRICAO_FONETICA || '';
                }
            }


            let entryRow = {
                ID: eId,
                Headword: headword,
                Language_ID: "L0000",
                Description: (entrada.METADADOS_EXTRAS && Object.keys(entrada.METADADOS_EXTRAS).length > 0) ? (entrada.DESCRICAO_ENTRADA_ORIGINAL || "") : (entrada.DESCRICAO_ENTRADA || ""),
                Part_Of_Speech: pos,
                Related_Items: entrada.ITENS_RELACIONADOS || '',
                Semantic_Field: semanticField,
                Sub_Semantic_Field: subSemanticField,
                Sub_Semantic_Field_1: subSemanticField1,
                Sub_Semantic_Field_2: subSemanticField2,
                Sub_Semantic_Field_3: subSemanticField3,
                Sub_Semantic_Field_4: subSemanticField4,
                Sub_Semantic_Field_5: subSemanticField5,
                Sub_Semantic_Field_6: subSemanticField6
            };

            if (entrada.METADADOS_EXTRAS || entrada.EXTRAS_ENTRADA_RAW) {
                extraColsEntryArr.forEach(k => {
                    let val = undefined;
                    if (entrada.METADADOS_EXTRAS && entrada.METADADOS_EXTRAS[k] !== undefined) {
                        val = entrada.METADADOS_EXTRAS[k];
                    } else if (entrada.EXTRAS_ENTRADA_RAW) {
                        const extraObj = entrada.EXTRAS_ENTRADA_RAW.find(e => e.chave === k);
                        if (extraObj) val = extraObj.valor;
                    }
                    entryRow[k] = val !== undefined ? val : '';
                });
            }
            entries.push(entryRow);


            if (entrada.VARIACOES_IDS && this.db.bancoDados) {
                entrada.VARIACOES_IDS.forEach(vid => {
                    const v = this.db.bancoDados.variacoes[vid];
                    if (!v) return;
                    let mId = '';
                    if (v.ARQUIVO_SONORO_URL) {
                        mId = addMedia(v.ARQUIVO_SONORO_URL, v.ARQUIVO_SONORO);
                    }
                    const fId = "F" + String(formContador++).padStart(4, '0');
                    forms.push({
                        ID: fId,
                        Language_ID: "L0000",
                        Value: v.TRANSCRICAO_ORTOGRAFICA || headword,
                        Form: v.TRANSCRICAO_ORTOGRAFICA || headword,
                        Entry_ID: eId,
                        Phonemic_Transcription: v.TRANSCRICAO_FONEMICA || '',
                        Phonetic_Transcription: v.TRANSCRICAO_FONETICA || '',
                        Media_ID: mId
                    });
                });
            }

            if (entrada.ACEPCOES) {
                entrada.ACEPCOES.forEach((ac, idx) => {
                    const sId = "S" + String(senseContador++).padStart(4, '0');
                    const sig = ac.SIGNIFICADO_ID ? this.db.bancoDados.significados[ac.SIGNIFICADO_ID] : null;
                    const traducao = sig ? sig.TRADUCAO : '';
                    const descricao = sig ? sig.DESCRICAO : '';
                    
                    let mediaIdsArr = [];
                    if (ac.IMAGENS_IDS && this.db.bancoDados) {
                        ac.IMAGENS_IDS.forEach(imgId => {
                            const imgData = this.db.bancoDados.imagens[imgId];
                            if (imgData && imgData.IMAGEM_URL) {
                                mediaIdsArr.push(addMedia(imgData.IMAGEM_URL, imgData.IMAGEM));
                            }
                        });
                    }
                    if (ac.VIDEOS_IDS && this.db.bancoDados) {
                        ac.VIDEOS_IDS.forEach(vidId => {
                            const vidData = this.db.bancoDados.videos[vidId];
                            if (vidData && vidData.VIDEO_URL) {
                                mediaIdsArr.push(addMedia(vidData.VIDEO_URL, vidData.ARQUIVO_VIDEO));
                            }
                        });
                    }

                    let textosIdsArr = [];
                    if (ac.TEXTOS_ESTRUTURADOS) {
                        ac.TEXTOS_ESTRUTURADOS.forEach(txt => {
                            if (txt.ID_TEXTO) textosIdsArr.push(txt.ID_TEXTO);
                        });
                    }

                    let conceptIds = [];
                    let conceptGlosses = [];
                    
                    if (concepticonData && traducao) {
                        const partes = traducao.split(/[,;]/);
                        for (let p of partes) {
                            const termo = p.trim().toLowerCase();
                            // Ignorar se tem mais de 2 espaos (possivelmente uma frase)
                            if (termo.split(' ').length <= 3) {
                                const idsEncontrados = concepticonData.pt2Ids[termo];
                                if (idsEncontrados && idsEncontrados.length > 0) {
                                    conceptIds.push(...idsEncontrados);
                                    idsEncontrados.forEach(id => {
                                        const gloss = concepticonData.id2Gloss[id] || '';
                                        conceptGlosses.push(gloss);
                                    });
                                    
                                    if (idsEncontrados.length > 1) {
                                        ambiguidadeConcepticon.push(`O termo "${termo}" da acepo ${sId} (Entrada ${eId}) gerou mltiplos IDs no Concepticon: ${idsEncontrados.join(', ')}`);
                                    }
                                    
                                    break; // Usar apenas o primeiro termo traduzido que der match
                                }
                            }
                        }
                    }


                    const acFull = this.db.bancoDados.significados[ac.SIGNIFICADO_ID];
                    // Use original description without concatenated extras for CLDF round-trip
                    const descricaoExport = (acFull && acFull.METADADOS_EXTRAS && Object.keys(acFull.METADADOS_EXTRAS).length > 0) 
                        ? (acFull.DESCRICAO_ORIGINAL || '') 
                        : (descricao || '');
                    let senseRow = {
                        ID: sId,
                        Entry_ID: eId,
                        Description: traducao || '',
                        Description_Note: descricaoExport,
                        Media_ID: mediaIdsArr.join(','),
                        Structured_Texts_IDs: textosIdsArr.join(','),
                        Concepticon_ID: conceptIds.join(' '),
                        Concepticon_Gloss: conceptGlosses.join(' ; ')
                    };

                    if (acFull && (acFull.METADADOS_EXTRAS || acFull.EXTRAS_RAW)) {
                        extraColsSenseArr.forEach(k => {
                            let val = undefined;
                            if (acFull.METADADOS_EXTRAS && acFull.METADADOS_EXTRAS[k] !== undefined) {
                                val = acFull.METADADOS_EXTRAS[k];
                            } else if (acFull.EXTRAS_RAW) {
                                const extraObj = acFull.EXTRAS_RAW.find(e => e.chave === k);
                                if (extraObj) val = extraObj.valor;
                            }
                            senseRow[k] = val !== undefined ? val : '';
                        });
                    }
                    senses.push(senseRow);


                    if (ac.EXEMPLOS_IDS && this.db.bancoDados) {
                        ac.EXEMPLOS_IDS.forEach((exId, exIdx) => {
                            const ex = this.db.bancoDados.exemplos[exId];
                            if (!ex) return;
                            let exMId = '';
                            if (ex.ARQUIVO_SONORO_URL) {
                                exMId = addMedia(ex.ARQUIVO_SONORO_URL, ex.ARQUIVO_SONORO_EXEMPLO);
                            }
                            const newExId = "EX" + String(exContador++).padStart(4, '0');
                            examples.push({
                                ID: newExId,
                                Sense_ID: sId,
                                Primary_Text: ex.TRANSCRICAO_EXEMPLO || '',
                                Translated_Text: ex.TRADUCAO_EXEMPLO || '',
                                Media_ID: exMId
                            });
                        });
                    }
                });
            }
        });

        const cldfFolder = zip.folder("cldf");
        const mediaZipFolder = cldfFolder.folder("media");
        const audioFolder = mediaZipFolder.folder("AUDIO");
        const fotoFolder = mediaZipFolder.folder("FOTO");
        const videoFolder = mediaZipFolder.folder("VIDEO");

        const filterEmptyCols = (headers, schemaColumns, dataRows) => {
            const colHasData = new Set(['ID']); // Sempre manter o ID
            schemaColumns.forEach(col => { if (col.required) colHasData.add(col.name); });
            dataRows.forEach(row => {
                headers.forEach(h => {
                    if (row[h] !== undefined && row[h] !== null && String(row[h]).trim() !== '') {
                        colHasData.add(h);
                    }
                });
            });
            return {
                headers: headers.filter(h => colHasData.has(h)),
                schemaColumns: schemaColumns.filter(col => colHasData.has(col.name))
            };
        };

        const langCols = ["ID", "Name", "Glottocode", "ISO639P3code"];
        const langSchema = [
            {"name": "ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#id"},
            {"name": "Name", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#name"},
            {"name": "Glottocode", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#glottocode"},
            {"name": "ISO639P3code", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#iso639P3code"}
        ];
        const langFiltered = filterEmptyCols(langCols, langSchema, languages);

        const entryCols = ["ID", "Headword", "Language_ID", "Description", "Part_Of_Speech", "Related_Items", "Semantic_Field", "Sub_Semantic_Field", "Sub_Semantic_Field_1", "Sub_Semantic_Field_2", "Sub_Semantic_Field_3", "Sub_Semantic_Field_4", "Sub_Semantic_Field_5", "Sub_Semantic_Field_6"].concat(extraColsEntryArr);
        const entrySchema = [
            {"name": "ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#id"},
            {"name": "Headword", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#headword"},
            {"name": "Language_ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#languageReference"},
            {"name": "Description", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#description"},
            {"name": "Part_Of_Speech"},
            {"name": "Related_Items"},
            {"name": "Semantic_Field"},
            {"name": "Sub_Semantic_Field"},
            {"name": "Sub_Semantic_Field_1"},
            {"name": "Sub_Semantic_Field_2"},
            {"name": "Sub_Semantic_Field_3"},
            {"name": "Sub_Semantic_Field_4"},
            {"name": "Sub_Semantic_Field_5"},
            {"name": "Sub_Semantic_Field_6"}
        ].concat(extraColsEntryArr.map(k => ({ "name": k })));
        const entryFiltered = filterEmptyCols(entryCols, entrySchema, entries);

        const formCols = ["ID", "Language_ID", "Value", "Form", "Entry_ID", "Phonemic_Transcription", "Phonetic_Transcription", "Media_ID"];
        const formSchema = [
            {"name": "ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#id"},
            {"name": "Language_ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#languageReference"},
            {"name": "Value", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#value"},
            {"name": "Form", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#form"},
            {"name": "Entry_ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#entryReference", "separator": ","},
            {"name": "Phonemic_Transcription"},
            {"name": "Phonetic_Transcription"},
            {"name": "Media_ID", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#mediaReference", "separator": ","}
        ];
        const formFiltered = filterEmptyCols(formCols, formSchema, forms);

        const senseCols = ["ID", "Entry_ID", "Description", "Description_Note", "Media_ID", "Structured_Texts_IDs", "Concepticon_ID", "Concepticon_Gloss"].concat(extraColsSenseArr);
        const senseSchema = [
            {"name": "ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#id"},
            {"name": "Entry_ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#entryReference", "separator": ","},
            {"name": "Description", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#description"},
            {"name": "Description_Note"},
            {"name": "Media_ID", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#mediaReference", "separator": ","},
            {"name": "Structured_Texts_IDs", "separator": ","},
            {"name": "Concepticon_ID", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#concepticonReference", "separator": " "},
            {"name": "Concepticon_Gloss"}
        ].concat(extraColsSenseArr.map(k => ({ "name": k })));
        const senseFiltered = filterEmptyCols(senseCols, senseSchema, senses);

        const exampleCols = ["ID", "Sense_ID", "Primary_Text", "Translated_Text", "Media_ID"];
        const exampleSchema = [
            {"name": "ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#id"},
            {"name": "Sense_ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#senseReference", "separator": ","},
            {"name": "Primary_Text", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#primaryText"},
            {"name": "Translated_Text", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#translatedText"},
            {"name": "Media_ID", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#mediaReference", "separator": ","}
        ];
        const exampleFiltered = filterEmptyCols(exampleCols, exampleSchema, examples);

        const mediaCols = ["ID", "Name", "Description", "Media_Type", "Download_URL"];
        const mediaSchema = [
            {"name": "ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#id"},
            {"name": "Name", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#name"},
            {"name": "Description", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#description"},
            {"name": "Media_Type", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#mediaType"},
            {"name": "Download_URL", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#downloadUrl"}
        ];
        const mediaFiltered = filterEmptyCols(mediaCols, mediaSchema, media);

        const csvLanguages = this.gerarTabelaCsv(langFiltered.headers, languages);
        const csvEntries = this.gerarTabelaCsv(entryFiltered.headers, entries);
        const csvForms = this.gerarTabelaCsv(formFiltered.headers, forms);
        const csvSenses = this.gerarTabelaCsv(senseFiltered.headers, senses);
        const csvExamples = this.gerarTabelaCsv(exampleFiltered.headers, examples);
        const csvMedia = this.gerarTabelaCsv(mediaFiltered.headers, media);

        cldfFolder.file("languages.csv", csvLanguages);
        cldfFolder.file("entries.csv", csvEntries);
        cldfFolder.file("forms.csv", csvForms);
        cldfFolder.file("senses.csv", csvSenses);
        cldfFolder.file("examples.csv", csvExamples);
        cldfFolder.file("media.csv", csvMedia);

        if (ambiguidadeConcepticon.length > 0) {
            cldfFolder.file("revisao_concepticon.txt", ambiguidadeConcepticon.join('\n'));
        }

        if (this.db.vfs && this.db.vfs.textosExtra && Object.keys(this.db.vfs.textosExtra).length > 0) {
            cldfFolder.file("textos.json", JSON.stringify(this.db.vfs.textosExtra, null, 2));
        }

        if (opcoes.metadados && opcoes.metadados.introMd) {
            zip.file("README.md", opcoes.metadados.introMd);
        }

        const metadata = {
            "dc:title": (opcoes.metadados && opcoes.metadados.tituloHtml) ? opcoes.metadados.tituloHtml : "CSV2DMLI CLDF Export",
            "dc:creator": (opcoes.metadados && opcoes.metadados.autor) ? opcoes.metadados.autor : "",
            "dc:date": (opcoes.metadados && opcoes.metadados.ano) ? opcoes.metadados.ano : "",
            "dc:identifier": (opcoes.metadados && opcoes.metadados.cldfGlottocode) ? opcoes.metadados.cldfGlottocode : "",
            "dcat:version": (opcoes.metadados && opcoes.metadados.versao) ? opcoes.metadados.versao : "",
            "dc:conformsTo": "http://cldf.clld.org/v1.0/terms.rdf#Dictionary",
            "tables": [
                {
                    "dc:conformsTo": "http://cldf.clld.org/v1.0/terms.rdf#LanguageTable",
                    "url": "languages.csv",
                    "tableSchema": {
                        "primaryKey": ["ID"],
                        "columns": langFiltered.schemaColumns
                    }
                },
                {
                    "dc:conformsTo": "http://cldf.clld.org/v1.0/terms.rdf#EntryTable",
                    "url": "entries.csv",
                    "tableSchema": {
                        "primaryKey": ["ID"],
                        "columns": entryFiltered.schemaColumns,
                        "foreignKeys": [{"columnReference": "Language_ID", "reference": {"resource": "languages.csv", "columnReference": "ID"}}]
                    }
                },
                {
                    "dc:conformsTo": "http://cldf.clld.org/v1.0/terms.rdf#SenseTable",
                    "url": "senses.csv",
                    "tableSchema": {
                        "primaryKey": ["ID"],
                        "columns": senseFiltered.schemaColumns,
                        "foreignKeys": [{"columnReference": "Entry_ID", "reference": {"resource": "entries.csv", "columnReference": "ID"}}]
                    }
                },
                {
                    "dc:conformsTo": "http://cldf.clld.org/v1.0/terms.rdf#ExampleTable",
                    "url": "examples.csv",
                    "tableSchema": {
                        "primaryKey": ["ID"],
                        "columns": exampleFiltered.schemaColumns,
                        "foreignKeys": [{"columnReference": "Sense_ID", "reference": {"resource": "senses.csv", "columnReference": "ID"}}]
                    }
                },
                {
                    "dc:conformsTo": "http://cldf.clld.org/v1.0/terms.rdf#MediaTable",
                    "url": "media.csv",
                    "tableSchema": {
                        "primaryKey": ["ID"],
                        "columns": mediaFiltered.schemaColumns
                    }
                },
                {
                    "dc:conformsTo": "http://cldf.clld.org/v1.0/terms.rdf#FormTable",
                    "url": "forms.csv",
                    "tableSchema": {
                        "primaryKey": ["ID"],
                        "columns": formFiltered.schemaColumns,
                        "foreignKeys": [
                            {"columnReference": "Language_ID", "reference": {"resource": "languages.csv", "columnReference": "ID"}},
                            {"columnReference": "Entry_ID", "reference": {"resource": "entries.csv", "columnReference": "ID"}}
                        ]
                    }
                }
            ]
        };

        cldfFolder.file("cldf-metadata.json", JSON.stringify(metadata, null, 2));

        if (media.length > 0) {
            for (const m of media) {
                try {
                    let blob = null;
                    if (m._ORIGINAL_URL.startsWith('data:')) {
                        const res = await fetch(m._ORIGINAL_URL);
                        blob = await res.blob();
                    } else {
                        const res = await fetch(m._ORIGINAL_URL);
                        if (res.ok) blob = await res.blob();
                    }

                    if (blob) {
                        if (m._FOLDER === 'AUDIO') {
                            audioFolder.file(m._FILENAME, blob);
                        } else if (m._FOLDER === 'VIDEO') {
                            videoFolder.file(m._FILENAME, blob);
                        } else {
                            fotoFolder.file(m._FILENAME, blob);
                        }
                    }
                } catch(e) {
                    console.warn("Aviso: Nao foi possivel embutir midia " + m._FILENAME + " no ZIP.", e);
                }
            }
        }

        const zipContent = await zip.generateAsync({ type: "blob" });
        
        const url = URL.createObjectURL(zipContent);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivoSaida;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        return zipContent;
    }
}
