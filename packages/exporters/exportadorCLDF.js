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

    async exportarCldfZip(opcoes, nomeArquivoSaida = 'dicionario_cldf.zip') {
        const zip = new JSZip();
        const dicio = this.db.obterDadosParaTemplate() || [];
        
        const languages = [];
        const entries = [];
        const senses = [];
        const forms = [];
        const examples = [];
        const media = [];
        
        let mediaContador = 1;
        const addMedia = (url) => {
            if (!url) return '';
            const mId = 'M' + String(mediaContador++).padStart(4, '0');
            const isAudio = url.includes('AUDIO/') || url.match(/\.(mp3|wav|ogg)$/i) || url.startsWith('data:audio');
            let folder = isAudio ? 'AUDIO' : 'FOTO';
            let fileName = '';
            
            if (url.startsWith('data:')) {
                const ext = isAudio ? 'mp3' : 'jpg'; 
                fileName = 'media_' + mId + '.' + ext;
            } else {
                fileName = url.split('/').pop();
            }
            
            const relPath = '../' + folder + '/' + fileName;
            
            media.push({
                ID: mId,
                Name: fileName,
                Description: '',
                Media_Type: isAudio ? 'audio/mpeg' : 'image/jpeg',
                Download_URL: relPath,
                _ORIGINAL_URL: url,
                _FOLDER: folder,
                _FILENAME: fileName
            });
            return mId;
        };

        languages.push({
            ID: "L0000",
            Name: (opcoes.metadados && opcoes.metadados.html) ? opcoes.metadados.html : "Idioma do Dicionario",
            Glottocode: "",
            ISO639P3code: ""
        });

        dicio.forEach(entrada => {
            const eId = entrada.ID;
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
            if (entrada.VARIACOES_IDS && entrada.VARIACOES_IDS.length > 0 && this.db.obterBancoDados()) {
                const varIdMain = entrada.VARIACOES_IDS[0];
                const variacaoPrincipal = this.db.obterBancoDados().variacoes[varIdMain];
                if (variacaoPrincipal) {
                    fonemicaPrincipal = variacaoPrincipal.TRANSCRICAO_FONEMICA || '';
                    foneticaPrincipal = variacaoPrincipal.TRANSCRICAO_FONETICA || '';
                }
            }

            entries.push({
                ID: eId,
                Headword: headword,
                Language_ID: "L0000",
                Description: "",
                Phonemic_Transcription: fonemicaPrincipal,
                Phonetic_Transcription: foneticaPrincipal,
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
            });

            if (entrada.VARIACOES_IDS && this.db.obterBancoDados()) {
                entrada.VARIACOES_IDS.forEach(vid => {
                    const v = this.db.obterBancoDados().variacoes[vid];
                    if (!v) return;
                    let mId = '';
                    if (v.ARQUIVO_SONORO_URL) {
                        mId = addMedia(v.ARQUIVO_SONORO_URL);
                    }
                    forms.push({
                        ID: vid,
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
                    const sId = ac.SIGNIFICADO_ID || (eId + "_SIG" + (idx+1));
                    let mediaIdsArr = [];
                    if (ac.IMAGENS_IDS && this.db.obterBancoDados()) {
                        ac.IMAGENS_IDS.forEach(imgId => {
                            const imgData = this.db.obterBancoDados().imagens[imgId];
                            if (imgData && imgData.ARQUIVO_URL) {
                                mediaIdsArr.push(addMedia(imgData.ARQUIVO_URL));
                            }
                        });
                    }
                    
                    let textosIdsArr = [];
                    if (ac.TEXTOS_ESTRUTURADOS) {
                        ac.TEXTOS_ESTRUTURADOS.forEach(txt => {
                            if (txt.ID_TEXTO) textosIdsArr.push(txt.ID_TEXTO);
                        });
                    }

                    senses.push({
                        ID: sId,
                        Entry_ID: eId,
                        Description: ac.TRADUCAO || '',
                        Description_Note: ac.DESCRICAO || '',
                        Media_ID: mediaIdsArr.join(','),
                        Structured_Texts_IDs: textosIdsArr.join(',')
                    });

                    if (ac.EXEMPLOS_IDS && this.db.obterBancoDados()) {
                        ac.EXEMPLOS_IDS.forEach((exId, exIdx) => {
                            const ex = this.db.obterBancoDados().exemplos[exId];
                            if (!ex) return;
                            let exMId = '';
                            if (ex.AUDIO_URL) {
                                exMId = addMedia(ex.AUDIO_URL);
                            }
                            examples.push({
                                ID: exId || (sId + "_EX" + (exIdx+1)),
                                Sense_ID: sId,
                                Primary_Text: ex.FRASE_ORIGINAL || '',
                                Translated_Text: ex.FRASE_TRADUZIDA || '',
                                Media_ID: exMId
                            });
                        });
                    }
                });
            }
        });

        const cldfFolder = zip.folder("cldf");
        const audioFolder = zip.folder("AUDIO");
        const fotoFolder = zip.folder("FOTO");

        const csvLanguages = this.gerarTabelaCsv(["ID", "Name", "Glottocode", "ISO639P3code"], languages);
        const csvEntries = this.gerarTabelaCsv(["ID", "Headword", "Language_ID", "Description", "Phonemic_Transcription", "Phonetic_Transcription", "Part_Of_Speech", "Related_Items", "Semantic_Field", "Sub_Semantic_Field", "Sub_Semantic_Field_1", "Sub_Semantic_Field_2", "Sub_Semantic_Field_3", "Sub_Semantic_Field_4", "Sub_Semantic_Field_5", "Sub_Semantic_Field_6"], entries);
        const csvForms = this.gerarTabelaCsv(["ID", "Language_ID", "Value", "Form", "Entry_ID", "Phonemic_Transcription", "Phonetic_Transcription", "Media_ID"], forms);
        const csvSenses = this.gerarTabelaCsv(["ID", "Entry_ID", "Description", "Description_Note", "Media_ID", "Structured_Texts_IDs"], senses);
        const csvExamples = this.gerarTabelaCsv(["ID", "Sense_ID", "Primary_Text", "Translated_Text", "Media_ID"], examples);
        const csvMedia = this.gerarTabelaCsv(["ID", "Name", "Description", "Media_Type", "Download_URL"], media);

        cldfFolder.file("languages.csv", csvLanguages);
        cldfFolder.file("entries.csv", csvEntries);
        cldfFolder.file("forms.csv", csvForms);
        cldfFolder.file("senses.csv", csvSenses);
        cldfFolder.file("examples.csv", csvExamples);
        cldfFolder.file("media.csv", csvMedia);

        if (this.db.vfs && this.db.vfs.textosExtra && Object.keys(this.db.vfs.textosExtra).length > 0) {
            cldfFolder.file("textos.json", JSON.stringify(this.db.vfs.textosExtra, null, 2));
        }

        const metadata = {
            "dc:title": (opcoes.metadados && opcoes.metadados.html) ? opcoes.metadados.html : "CSV2DMLI CLDF Export",
            "dc:conformsTo": "http://cldf.clld.org/v1.0/terms.rdf#Dictionary",
            "tables": [
                {
                    "dc:conformsTo": "http://cldf.clld.org/v1.0/terms.rdf#LanguageTable",
                    "url": "languages.csv",
                    "tableSchema": {
                        "primaryKey": ["ID"],
                        "columns": [
                            {"name": "ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#id"},
                            {"name": "Name", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#name"},
                            {"name": "Glottocode", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#glottocode"},
                            {"name": "ISO639P3code", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#iso639P3code"}
                        ]
                    }
                },
                {
                    "dc:conformsTo": "http://cldf.clld.org/v1.0/terms.rdf#EntryTable",
                    "url": "entries.csv",
                    "tableSchema": {
                        "primaryKey": ["ID"],
                        "columns": [
                            {"name": "ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#id"},
                            {"name": "Headword", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#headword"},
                            {"name": "Language_ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#languageReference"},
                            {"name": "Description", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#description"},
                            {"name": "Phonemic_Transcription"},
                            {"name": "Phonetic_Transcription"},
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
                        ],
                        "foreignKeys": [{"columnReference": "Language_ID", "reference": {"resource": "languages.csv", "columnReference": "ID"}}]
                    }
                },
                {
                    "dc:conformsTo": "http://cldf.clld.org/v1.0/terms.rdf#SenseTable",
                    "url": "senses.csv",
                    "tableSchema": {
                        "primaryKey": ["ID"],
                        "columns": [
                            {"name": "ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#id"},
                            {"name": "Entry_ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#entryReference", "separator": ","},
                            {"name": "Description", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#description"},
                            {"name": "Description_Note"},
                            {"name": "Media_ID", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#mediaReference", "separator": ","},
                            {"name": "Structured_Texts_IDs", "separator": ","}
                        ],
                        "foreignKeys": [{"columnReference": "Entry_ID", "reference": {"resource": "entries.csv", "columnReference": "ID"}}]
                    }
                },
                {
                    "dc:conformsTo": "http://cldf.clld.org/v1.0/terms.rdf#ExampleTable",
                    "url": "examples.csv",
                    "tableSchema": {
                        "primaryKey": ["ID"],
                        "columns": [
                            {"name": "ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#id"},
                            {"name": "Sense_ID", "required": true, "separator": ","},
                            {"name": "Primary_Text"},
                            {"name": "Translated_Text"},
                            {"name": "Media_ID", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#mediaReference", "separator": ","}
                        ],
                        "foreignKeys": [{"columnReference": "Sense_ID", "reference": {"resource": "senses.csv", "columnReference": "ID"}}]
                    }
                },
                {
                    "dc:conformsTo": "http://cldf.clld.org/v1.0/terms.rdf#MediaTable",
                    "url": "media.csv",
                    "tableSchema": {
                        "primaryKey": ["ID"],
                        "columns": [
                            {"name": "ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#id"},
                            {"name": "Name", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#name"},
                            {"name": "Description"},
                            {"name": "Media_Type", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#mediaType"},
                            {"name": "Download_URL", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#downloadUrl"}
                        ]
                    }
                },
                {
                    "dc:conformsTo": "http://cldf.clld.org/v1.0/terms.rdf#FormTable",
                    "url": "forms.csv",
                    "tableSchema": {
                        "primaryKey": ["ID"],
                        "columns": [
                            {"name": "ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#id"},
                            {"name": "Language_ID", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#languageReference"},
                            {"name": "Value", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#value"},
                            {"name": "Form", "required": true, "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#form"},
                            {"name": "Entry_ID", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#entryReference"},
                            {"name": "Phonemic_Transcription"},
                            {"name": "Phonetic_Transcription"},
                            {"name": "Media_ID", "propertyUrl": "http://cldf.clld.org/v1.0/terms.rdf#mediaReference", "separator": ","}
                        ],
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
