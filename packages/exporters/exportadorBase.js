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
        const audiosUnicos = [...new Set(variacoes.map(v => v.ARQUIVO_SONORO).filter(Boolean))];

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
                            const raw = ex.ARQUIVO_SONORO_EXEMPLO.split(/[\/\\]/).pop();
                            audioEx = (this.midiasGeradas && this.midiasGeradas[raw]) ? this.midiasGeradas[raw] : 'audio/' + raw;
                        }
                        significado.EXEMPLOS.push({ TRANS: ex.TRANSCRICAO_EXEMPLO || '', TRAD: ex.TRADUCAO_EXEMPLO || '', AUDIO: audioEx });
                    }
                });
                if (ac.IMAGENS_IDS) ac.IMAGENS_IDS.forEach(imgId => {
                    const img = banco.imagens[imgId];
                    if (img && img.IMAGEM) {
                        const raw = img.IMAGEM.split(/[\/\\]/).pop();
                        let limpo;
                        try { limpo = decodeURIComponent(raw); } catch(e) { limpo = raw; }
                        limpo = limpo.replace(/[{}]/g, '').trim().toLowerCase();
                        const fallbackPath = 'foto/' + limpo;
                        const url = (this.midiasGeradas && this.midiasGeradas[raw]) ? this.midiasGeradas[raw] : fallbackPath;
                        significado.IMAGENS.push({ ARQUIVO: url, LEGENDA: img.LEGENDA_IMAGEM || '' });
                    }
                });
                if (ac.VIDEOS_IDS && this.db.bancoDados) {
                    ac.VIDEOS_IDS.forEach(vidId => {
                        const vid = this.db.bancoDados.videos?.[vidId];
                        if (vid && vid.ARQUIVO_VIDEO) {
                            const raw = vid.ARQUIVO_VIDEO.split(/[\/\\]/).pop();
                            const url = (this.midiasGeradas && this.midiasGeradas[raw]) ? this.midiasGeradas[raw] : 'video/' + raw;
                            significado.VIDEOS.push({ ARQUIVO: url });
                        }
                    });
                }
                if (ac.EXTRAS) ac.EXTRAS.forEach(ext => { if (ext) significado.EXTRAS.push({ TEXTO: ext }); });
                
                significados.push(significado);
            });
        }
        
        const fonemicasStr = fonemicasUnicas.join(' ~ ');
        const foneticasStr = foneticasUnicas.join(' ~ ');
        const audiosUnicosResolved = audiosUnicos.map(a => {
            const raw = a.split(/[\/\\]/).pop();
            return (this.midiasGeradas && this.midiasGeradas[raw]) ? this.midiasGeradas[raw] : 'audio/' + raw;
        });

        const subCampos = entrada.SUB_CAMPOS_SEMANTICOS || [];
        const result = {
            TERMO: termosUnicos.length > 0 ? termosUnicos.join(' ~ ') : (entrada._TERMO_PRINCIPAL || '???'),
            TERMO_PARENT: entrada._TERMO_PRINCIPAL || '???', 
            CLASSE: entrada.CLASSE_GRAMATICAL || '',
            CAMPO_SEMANTICO: entrada.CAMPO_SEMANTICO || '',
            SUB_CAMPO_SEMANTICO: subCampos[0] || '',
            SUB_CAMPO_SEMANTICO_1: subCampos[1] || '',
            SUB_CAMPO_SEMANTICO_2: subCampos[2] || '',
            SUB_CAMPO_SEMANTICO_3: subCampos[3] || '',
            SUB_CAMPO_SEMANTICO_4: subCampos[4] || '',
            SUB_CAMPO_SEMANTICO_5: subCampos[5] || '',
            SUB_CAMPO_SEMANTICO_6: subCampos[6] || '',
            FONEMICA: fonemicasStr,
            FONETICA: foneticasStr,
            AUDIO: audiosUnicosResolved.join(' ~ '),
            SIGNIFICADOS: significados,  
            ITENS_RELACIONADOS: entrada.ITENS_RELACIONADOS || '',
            INDEX: significados.length > 0 ? significados[0].TRADUCAO : ''
        };
        return result;
    }

    async gerarScriptsDadosEmLotes(tipoAtivo, embutirMidias = false) {
        const db = this.db.bancoDados;
        if (!db) return '';

        // 1. Extrair mídias referenciadas para não embutir lixo
        const referenciadas = { audio: new Set(), imagem: new Set(), video: new Set() };
        for (const entrada of Object.values(db.entradas)) {
            entrada.VARIACOES_IDS?.forEach(id => {
                const v = db.variacoes[id];
                if (v && v.ARQUIVO_SONORO) referenciadas.audio.add(v.ARQUIVO_SONORO);
            });
            entrada.ACEPCOES?.forEach(ac => {
                ac.EXEMPLOS_IDS?.forEach(id => {
                    const ex = db.exemplos[id];
                    if (ex && ex.ARQUIVO_SONORO_EXEMPLO) referenciadas.audio.add(ex.ARQUIVO_SONORO_EXEMPLO);
                });
                ac.IMAGENS_IDS?.forEach(id => {
                    const img = db.imagens[id];
                    if (img && img.IMAGEM) referenciadas.imagem.add(img.IMAGEM.split(/[\/\\]/).pop());
                });
                if (ac.VIDEOS_IDS && db.videos) {
                    ac.VIDEOS_IDS.forEach(vidId => {
                        const vid = db.videos[vidId];
                        if (vid && vid.ARQUIVO_VIDEO) {
                            referenciadas.video.add(vid.ARQUIVO_VIDEO.split(/[\/\\]/).pop());
                        }
                    });
                }
            });
        }

        const midias = {};
        const tipos = { audio: 'audio/', imagem: 'foto/', video: 'video/' };
        
        if (embutirMidias && this.db.vfs) {
            const arquivosParaConverter = [];
            
            for (const [tipo, prefixo] of Object.entries(tipos)) {
                for (const nome of referenciadas[tipo]) {
                    const arquivo = this.db.vfs.obterArquivo(tipo, nome);
                    if (arquivo instanceof File || arquivo instanceof Blob) {
                        arquivosParaConverter.push({ nome, arquivo });
                    } else {
                        midias[nome] = prefixo + nome;
                    }
                }
            }
            
            if (arquivosParaConverter.length > 0) {
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
            // Apenas referenciar pelo caminho local relativo
            for (const [tipo, prefixo] of Object.entries(tipos)) {
                for (const nome of referenciadas[tipo]) {
                    midias[nome] = prefixo + nome;
                }
            }
        }
        
        this.midiasGeradas = midias;

        // 2. Preparar os dados para a UI
        const entradasConvertidas = [];
        for (const entrada of Object.values(db.entradas)) {
            const dados = this.extrairDadosEntrada(entrada);
            entradasConvertidas.push({ ...entrada, ...dados });
        }

        // 3. Empacotar em Scripts por Lotes
        // Escapa </ para evitar que dados do dicionário que contenham </script>
        // encerrem prematuramente o bloco <script> e corrompam o HTML gerado.
        const jsonSeguro = (obj) => JSON.stringify(obj).replace(/<\//g, '<\\/');

        const LOTES = 50;
        let scripts = '<script>\n';
        scripts += `window.DicionarioMidias = ${jsonSeguro(midias)};\n`;
        scripts += `window.dadosDicionarioLexical = [];\n`;
        scripts += `window.templateEntradaAtivo = "${tipoAtivo}";\n`;
        if (this.templateEntrada) scripts += `window.templateEntrada = ${jsonSeguro(this.templateEntrada)};\n`;
        if (this.templateCard) scripts += `window.templateCard = ${jsonSeguro(this.templateCard)};\n`;
        if (this.templateLista) scripts += `window.templateLista = ${jsonSeguro(this.templateLista)};\n`;
        scripts += `function adicionaDados(lote) { window.dadosDicionarioLexical.push(...lote); }\n`;
        scripts += '<\/script>\n';

        for (let i = 0; i < entradasConvertidas.length; i += LOTES) {
            const lote = entradasConvertidas.slice(i, i + LOTES);
            scripts += `<script>adicionaDados(${jsonSeguro(lote)});<\/script>\n`;
        }

        return scripts;
    }
}
export default ExportadorBase;