export class LeitorCLDF {
    constructor(gerenciadorDados) {
        this.gerenciador = gerenciadorDados;
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
        const { metadata, entries, senses, forms, examples, media } = arquivosCldf;
        
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

        const mediaMap = {};
        mediaData.forEach(m => {
            if (!m.ID) return;
            let path = m.Download_URL || m.Name || '';
            let isAudio = m.Media_Type && m.Media_Type.includes('audio');
            let isImg = m.Media_Type && m.Media_Type.includes('image');
            
            let nomeOriginal = path.split('/').pop().split('\\').pop();
            mediaMap[m.ID] = { nome: nomeOriginal, type: isAudio ? 'audio' : (isImg ? 'imagem' : 'unknown') };
        });

        let planilhaVirtual = [];

        const formsByEntry = {};
        formsData.forEach(f => {
            if (!f.Entry_ID) return;
            if (!formsByEntry[f.Entry_ID]) formsByEntry[f.Entry_ID] = [];
            formsByEntry[f.Entry_ID].push(f);
        });

        const sensesByEntry = {};
        const sensesMap = {};
        sensesData.forEach(s => {
            if (!s.Entry_ID) return;
            sensesMap[s.ID] = s;
            if (!sensesByEntry[s.Entry_ID]) sensesByEntry[s.Entry_ID] = [];
            sensesByEntry[s.Entry_ID].push(s);
        });

        const examplesBySense = {};
        examplesData.forEach(ex => {
            if (!ex.Sense_ID) return;
            if (!examplesBySense[ex.Sense_ID]) examplesBySense[ex.Sense_ID] = [];
            examplesBySense[ex.Sense_ID].push(ex);
        });

        entriesData.forEach(entry => {
            const entryId = entry.ID;
            
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
                ITENS_RELACIONADOS: entry.Related_Items || ''
            };

            let entrySenses = sensesByEntry[entryId] || [];
            if (entrySenses.length === 0) {
                entrySenses = [{ ID: 'fake', Description: entry.Description || '' }];
            }

            entrySenses.forEach(sense => {
                let row = { ...baseRow };
                row.TRADUCAO_SIGNIFICADO = sense.Description || '';
                row.DESCRICAO = sense.Description_Note || '';
                
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
                if (entryForms.length > 0) {
                    let items = [];
                    let phonemics = [];
                    let phonetics = [];
                    let audios = [];
                    
                    entryForms.forEach(vf => {
                        items.push(vf.Form || '');
                        phonemics.push(vf.Phonemic_Transcription || '');
                        phonetics.push(vf.Phonetic_Transcription || '');
                        let aud = '';
                        if ((vf.Media_IDs || vf.Media_ID)) {
                            let amId = (vf.Media_IDs || vf.Media_ID).split(',')[0].trim();
                            if (mediaMap[amId]) aud = mediaMap[amId].nome;
                        }
                        audios.push(aud);
                    });
                    
                    if (items.some(i => i.trim() !== '')) {
                        row.ITEM_LEXICAL = items.join(' | ');
                    }
                    row.TRANSCRICAO_FONEMICA = phonemics.join(' | ');
                    row.TRANSCRICAO_FONETICA = phonetics.join(' | ');
                    row.ARQUIVO_SONORO = audios.join(' | ');
                } else {
                    row.TRANSCRICAO_FONEMICA = entry.Phonemic_Transcription || '';
                    row.TRANSCRICAO_FONETICA = entry.Phonetic_Transcription || '';
                }

                let senseExamples = examplesBySense[sense.ID] || [];
                let exAuds = [];
                let exTrans = [];
                let exTrads = [];
                senseExamples.forEach(ex => {
                    let exAud = '';
                    if ((ex.Media_IDs || ex.Media_ID)) {
                        let amId = (ex.Media_IDs || ex.Media_ID).split(',')[0].trim();
                        if (mediaMap[amId]) exAud = mediaMap[amId].nome;
                    }
                    exAuds.push(exAud);
                    exTrans.push(ex.Primary_Text || '');
                    exTrads.push(ex.Translated_Text || '');
                });
                row.ARQUIVO_SONORO_EXEMPLO = exAuds.join(' | ');
                row.TRANSCRICAO_EXEMPLO = exTrans.join(' | ');
                row.TRADUCAO_EXEMPLO = exTrads.join(' | ');

                planilhaVirtual.push(row);
            });
        });

        console.log("CLDF Convertido em Planilha Virtual. Total linhas: ", planilhaVirtual.length);
        this.gerenciador.dadosPlanilha = this.gerenciador._normalizarDadosCrus(planilhaVirtual);
        this.gerenciador.colunasPlanilha = Object.keys(planilhaVirtual[0] || {});
        this.gerenciador._reconstruirBanco();
    }
}