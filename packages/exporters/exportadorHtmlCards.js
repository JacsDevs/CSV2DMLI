import ExportadorBase from './exportadorBase.js';

class ExportadorHtmlCards extends ExportadorBase {
    constructor(gerenciadorDados) {
        super(gerenciadorDados);
        this.templatePrincipal = null;
        this.templateEntrada = null;
        this.templateCard = null;
        this.templateLista = null;
        this.estilosGlobais = null;
    }

    async carregarTemplates() {
        try {
            const cachePrincipal = localStorage.getItem('csv2dmli_template_html');
            const cacheEntrada = localStorage.getItem('csv2dmli_templateEntradaHtml');
            const cacheCard = localStorage.getItem('csv2dmli_templateCardHtml');
            const cacheLista = localStorage.getItem('csv2dmli_templateListaHtml');
            
            const nocache = '?v=' + Date.now();
            
            if (cachePrincipal) this.templatePrincipal = cachePrincipal;
            else {
                try {
                    const res = await fetch('config/templates/html-cards/template.html' + nocache);
                    if (res.ok) this.templatePrincipal = await res.text();
                } catch(e) { console.warn('Fetch de template.html falhou, usando fallback.'); }
            }

            if (cacheEntrada) this.templateEntrada = cacheEntrada;
            else {
                try {
                    const res = await fetch('config/templates/html-cards/entrada.tmpl' + nocache);
                    if (res.ok) this.templateEntrada = await res.text();
                } catch(e) { console.warn('Fetch de entrada.html falhou, usando fallback.'); }
            }

            if (cacheCard) this.templateCard = cacheCard;
            else {
                try {
                    const res = await fetch('config/templates/html-cards/card.tmpl' + nocache);
                    if (res.ok) this.templateCard = await res.text();
                } catch(e) { console.warn('Fetch de card.html falhou, usando fallback.'); }
            }

            if (cacheLista) this.templateLista = cacheLista;
            else {
                try {
                    const res = await fetch('config/templates/html-cards/lista.tmpl' + nocache);
                    if (res.ok) this.templateLista = await res.text();
                } catch(e) { console.warn('Fetch de lista.html falhou, usando fallback.'); }
            }

            const cacheCss = localStorage.getItem('csv2dmli_templateCssCard');
            if (cacheCss) this.estilosGlobais = cacheCss;
            else {
                try {
                    const res = await fetch('config/templates/estilos-globais.css' + nocache);
                    if (res.ok) this.estilosGlobais = await res.text();
                } catch(e) { console.warn('Fetch de config/templates/estilos-globais.css falhou, usando fallback.'); }
            }

            // O Live Server (VS Code) injeta um script de recarga automática em todo .html que
            // serve; sem isso ele iria para a prévia e para o HTML exportado.
            if (this.templatePrincipal) {
                this.templatePrincipal = this.templatePrincipal.replace(/<!-- Code injected by live-server -->\s*<script[^>]*>[\s\S]*?<\/script>\s*/gi, '');
            }

            // Fallback de emergência caso os templates não sejam encontrados
            if (!this.templatePrincipal) {
                this.templatePrincipal = `<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>{{ metadados.html }}</title>
    <style>body { font-family: sans-serif; padding: 20px; background: #f8f9fa; color: #333; } .categoria { margin-bottom: 30px; } .categoria-titulo { color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 5px; } .entry-card { border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 8px; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); } .classe { font-style: italic; color: #666; font-size: 0.9em; }</style>
</head>
<body>
    <h1>{{ metadados.html }}</h1>
    <div id="dicionario">\n{{ corpo_dicionario }}\n</div>
    {{ scripts_dados_js }}
</body>
</html>`;
            }
        } catch (e) {
            console.warn('⚠️ Erro ao carregar templates HTML Cards', e);
        }
    }

    // Gera um bloco CSS (ex.: ":root{--cor-primaria:#5c6b41;}") a partir de um mapa
    // { '--var': 'valor' }. Só aceita hex e rgba/rgb para não abrir espaço a injeção
    // de CSS arbitrário via valores vindos do wizard.
    gerarBlocoTemaCSS(vars, seletor) {
        if (!vars) return '';
        const chaveValida = /^--[a-z0-9-]+$/i;
        const valorValido = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\))$/;
        const propriedades = Object.entries(vars)
            .filter(([chave, valor]) => chaveValida.test(chave) && valorValido.test(String(valor).trim()))
            .map(([chave, valor]) => `${chave}:${valor};`)
            .join('');
        return propriedades ? `${seletor}{${propriedades}}` : '';
    }

    escaparHTML(texto) {
        if (!texto) return '';
        const mapa = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(texto).replace(/[&<>"']/g, char => mapa[char] || char);
    }

    gerarEntradaHTML(entrada) {
        const dados = this.extrairDadosEntrada(entrada);
        dados.TERMO = this.escaparHTML(dados.TERMO);
        dados.CLASSE = this.escaparHTML(dados.CLASSE);
        dados.FONEMICA = this.escaparHTML(dados.FONEMICA);
        dados.FONETICA = this.escaparHTML(dados.FONETICA);
        dados.ITENS_RELACIONADOS = this.escaparHTML(dados.ITENS_RELACIONADOS);
        
        dados.SIGNIFICADOS = dados.SIGNIFICADOS.map(s => ({
            ...s,
            TRADUCAO: this.escaparHTML(s.TRADUCAO),
            DESCRICAO: this.escaparHTML(s.DESCRICAO),
            EXEMPLOS: s.EXEMPLOS.map(e => ({ TRANS: this.escaparHTML(e.TRANS), TRAD: this.escaparHTML(e.TRAD), AUDIO: this.escaparHTML(e.AUDIO) })),
            IMAGENS: s.IMAGENS.map(i => ({ ARQUIVO: this.escaparHTML(i.ARQUIVO), LEGENDA: this.escaparHTML(i.LEGENDA) })),
            VIDEOS: s.VIDEOS.map(v => ({ ARQUIVO: this.escaparHTML(v.ARQUIVO) })),
            EXTRAS: s.EXTRAS.map(e => ({ TEXTO: this.escaparHTML(e.TEXTO) })),
            TEM_EXTRAS: s.EXTRAS && s.EXTRAS.length > 0
        }));
        
        if (dados.TEXTOS_ESTRUTURADOS) {
            dados.TEXTOS_ESTRUTURADOS = dados.TEXTOS_ESTRUTURADOS.map(t => ({
                ...t,
                ID_TEXTO: this.escaparHTML(t.ID_TEXTO),
                TITULO_BASE: this.escaparHTML(t.TITULO_BASE),
                TITULO_EXIBICAO: t.TITULO_EXIBICAO ? this.escaparHTML(t.TITULO_EXIBICAO) : '',
                TEXTO_NAO_LITERAL: this.escaparHTML(t.TEXTO_NAO_LITERAL),
                VARIACOES: (t.VARIACOES || []).map(v => ({
                    ...v,
                    ID_VARIACAO: this.escaparHTML(v.ID_VARIACAO),
                    FRASES: (v.FRASES || []).map(f => ({
                        ...f,
                        ORIGINAL: this.escaparHTML(f.ORIGINAL),
                        TRADUCAO: this.escaparHTML(f.TRADUCAO),
                        AUDIO_ARQUIVO: this.escaparHTML(f.AUDIO_ARQUIVO)
                    }))
                }))
            }));
        }
        
        if (this.templateEntrada) {
            return this.processarTemplate(this.templateEntrada, dados);
        }
        
        // Fallback básico caso o template falhe
        let html = `<div class="entry-card"><h2>${dados.TERMO}</h2>`;
        if (dados.CLASSE) html += `<span class="classe">${dados.CLASSE}</span>`;
        dados.SIGNIFICADOS.forEach(s => html += `<p><strong>${s.TRADUCAO}</strong> ${s.DESCRICAO}</p>`);
        html += `</div>`;
        return html;
    }

    async gerarScriptsDados(embutir = false, entradasLimitadas = null, opcoesMidia = {}) {
        return await this.gerarScriptsDadosEmLotes('card', embutir, entradasLimitadas, opcoesMidia);
    }

    // Percorre a árvore na mesma ordem/recursão de processarEntradasHTML, mas só
    // coleta as referências das entradas (sem gerar HTML) até `limite`. Usado para
    // restringir gerarScriptsDados às entradas que de fato aparecerão na prévia,
    // evitando embutir em Base64 as mídias de entradas que serão descartadas.
    coletarEntradasAteLimite(arvore, categoriasRaizes, limite) {
        const lista = [];
        let atingiu = false;
        const visitar = (noDict) => {
            if (atingiu) return;
            if (noDict._entradas) {
                for (const ent of noDict._entradas) {
                    if (lista.length >= limite) { atingiu = true; return; }
                    lista.push(ent);
                }
            }
            if (atingiu) return;
            Object.keys(noDict).filter(k => k !== '_entradas').forEach(filho => { if (!atingiu) visitar(noDict[filho]); });
        };
        for (const cat of categoriasRaizes) {
            if (atingiu) break;
            visitar(arvore[cat]);
        }
        return lista;
    }

    // Scripts de dados + corpo estático do dicionário (a parte cara da exportação).
    async gerarPartesDados(opcoes) {
        const { arvore, categoriasRaizes } = this.db.obterArvoreOrdenada();

        const limitePreview = opcoes.limitePreview;
        const entradasLimitadas = limitePreview
            ? this.coletarEntradasAteLimite(arvore, categoriasRaizes, limitePreview)
            : null;

        const scriptsDados = await this.gerarScriptsDados(opcoes.embutirMidias, entradasLimitadas, {
            comoUrl: !!opcoes.midiasComoUrl,
            urlsCriadas: opcoes.urlsCriadas,
            comoPartes: !!opcoes.comoPartes,
            midiasPorMarcador: opcoes.midiasPorMarcador
        });

        // O template atual monta os cards via JS a partir dos scripts de dados; o corpo
        // estático só é gerado para templates (personalizados/antigos) que o utilizam.
        if (!/\{\{\s*corpo_dicionario\s*(\|\s*safe)?\s*\}\}/i.test(this.templatePrincipal)) {
            return { scriptsDados, corpoHtml: '' };
        }

        let contadorEntradas = 0;
        let limiteAtingido = false;

        let corpoHtml = '';
        const processarEntradasHTML = (noDict) => {
            let html = '';
            if (noDict._entradas) {
                for (const ent of noDict._entradas) {
                    if (limitePreview && contadorEntradas >= limitePreview) { limiteAtingido = true; break; }
                    html += this.gerarEntradaHTML(ent);
                    contadorEntradas++;
                }
            }
            if (!limiteAtingido) {
                Object.keys(noDict).filter(k => k !== '_entradas').forEach(filho => html += processarEntradasHTML(noDict[filho]));
            }
            return html;
        };

        for (const cat of categoriasRaizes) {
            if (limiteAtingido) break;
            corpoHtml += `<section class="categoria">\n<h2 class="categoria-titulo">${cat}</h2>\n`;
            corpoHtml += processarEntradasHTML(arvore[cat]);
            corpoHtml += `</section>\n`;
        }

        if (limiteAtingido) {
            corpoHtml += `<p class="preview-limite-aviso" style="padding:14px; text-align:center; color:#888; font-size:0.85em; font-style:italic;">Exibindo apenas as ${limitePreview} primeiras entradas na prévia...</p>\n`;
        }

        return { scriptsDados, corpoHtml };
    }

    // Opções da prévia:
    // - midiasComoUrl + urlsCriadas: mídias referenciadas por URL blob: (ver gerarScriptsDadosEmLotes);
    // - cachePrevia: objeto mantido pelo chamador; guarda dados e corpo já gerados para
    //   que mudanças só de metadados (nome, ícone) não reprocessem entradas e mídias.
    //   O chamador descarta o objeto quando os dados puderem ter mudado.
    // - comoPartes: devolve uma lista de strings em vez de uma string única (os scripts de
    //   dados nunca são concatenados) — usada por gravarEmbutido.
    // - midiasPorMarcador: { prefixo, mapa }: mídias embutidas viram marcadores em vez de
    //   Base64 (ver gerarScriptsDadosEmLotes e gravarEmbutido).
    async exportar(opcoes = {}) {
        if (!this.db.bancoDados) throw new Error('Banco de dados não gerado');
        if (!this.templatePrincipal) throw new Error('Template principal HTML não carregado');

        const limitePreview = opcoes.limitePreview;
        const cache = opcoes.cachePrevia || null;
        const chaveCache = [limitePreview || 0, !!opcoes.embutirMidias, !!opcoes.midiasComoUrl, !!opcoes.comoPartes, !!opcoes.midiasPorMarcador, this.templatePrincipal.length].join('|');

        let partes = (cache && cache.chave === chaveCache) ? cache.partes : null;
        if (!partes) {
            try {
                partes = await this.gerarPartesDados(opcoes);
            } finally {
                // Não reter strings Base64/URLs blob: nem vazá-las para outros exportadores
                // que usam extrairDadosEntrada (Typst, LaTeX...).
                this.midiasGeradas = null;
            }
            if (cache) { cache.chave = chaveCache; cache.partes = partes; }
        }
        const { scriptsDados, corpoHtml } = partes;

        const meta = opcoes.metadados || {};

        const iconeHtml = meta.iconeDataUrl
            ? `<img src="${this.escaparHTML(meta.iconeDataUrl)}" alt="Ícone do dicionário" class="dicionario-icone-img">`
            : '';

        const versao = meta.versao || '';
        const ano = meta.ano || '';

        const versaoAnoHtml = versao && ano
            ? `Versão ${versao} (${ano})`
            : versao
                ? `Versão ${versao}`
                : ano
                    ? ano
                    : '';

        const subtitleComAutorHtml = [meta.autor || '', versaoAnoHtml].filter(Boolean).join(' &bull; ');

        const versaoAnoLabelHtml = [
            versao ? `<strong>Versão:</strong> ${versao}` : '',
            ano ? `<strong>Ano:</strong> ${ano}` : ''
        ].filter(Boolean).join(' &bull; ');
        const autorLinhaHtml = versaoAnoLabelHtml
            ? `<strong>Autoria e colaboração:</strong> ${meta.autor || ''}<br>\n                   ${versaoAnoLabelHtml}`
            : `<strong>Autoria e colaboração:</strong> ${meta.autor || ''}`;

        const versaoAnoCitacaoHtml = versao && ano
            ? `Versão ${versao}, ${ano}.`
            : versao
                ? `Versão ${versao}.`
                : ano
                    ? `${ano}.`
                    : '';

        const linhasReferencias = String(meta.referencia || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const referenciasHtml = linhasReferencias.length
            ? `<ul class="lista-referencias">${linhasReferencias.map(l => `<li>${this.escaparHTML(l)}</li>`).join('')}</ul>`
            : '';

        const tema = meta.tema || null;
        const temaOverrideClaro = this.gerarBlocoTemaCSS(tema && tema.light, ':root');
        const temaOverrideEscuro = this.gerarBlocoTemaCSS(tema && tema.dark, 'html[data-tema="escuro"]');

        let html = this.templatePrincipal
            .replace(/\{\{\s*metadados\.html\s*\}\}/gi, meta.tituloHtml || 'Dicionário')
            .replace(/\{\{\s*metadados\.icone_html\s*(\|\s*safe)?\s*\}\}/gi, iconeHtml)
            .replace(/\{\{\s*metadados\.pdf\s*\}\}/gi, meta.tituloPdf || 'Dicionário')
            .replace(/\{\{\s*metadados\.autor\s*\}\}\s*&bull;\s*Vers[aã]o\s*\{\{\s*metadados\.versao\s*\}\}\s*\(\{\{\s*metadados\.ano\s*\}\}\)/gi, subtitleComAutorHtml)
            .replace(/Vers[aã]o\s*\{\{\s*metadados\.versao\s*\}\}\s*\(\{\{\s*metadados\.ano\s*\}\}\)/gi, versaoAnoHtml)
            .replace(/<strong>Autoria e colabora[cç][aã]o:<\/strong>\s*\{\{\s*metadados\.autor\s*\}\}<br>\s*<strong>Vers[aã]o:<\/strong>\s*\{\{\s*metadados\.versao\s*\}\}\s*&bull;\s*<strong>Ano:<\/strong>\s*\{\{\s*metadados\.ano\s*\}\}/gi, autorLinhaHtml)
            .replace(/Vers[aã]o\s*\{\{\s*metadados\.versao\s*\}\},\s*\{\{\s*metadados\.ano\s*\}\}\./gi, versaoAnoCitacaoHtml)
            .replace(/\{\{\s*metadados\.autor\s*\}\}/gi, meta.autor || '')
            .replace(/\{\{\s*metadados\.versao\s*\}\}/gi, versao)
            .replace(/\{\{\s*metadados\.ano\s*\}\}/gi, ano)
            .replace(/\{\{\s*textos\.intro_html\s*(\|\s*safe)?\s*\}\}/gi, meta.introHtml || '')
            .replace(/\{\{\s*textos\.referencias_html\s*(\|\s*safe)?\s*\}\}/gi, referenciasHtml)
            .replace(/\{\{\s*estilos_globais\s*(\|\s*safe)?\s*\}\}/gi, this.estilosGlobais || '')
            .replace(/\{\{\s*tema\.override_claro\s*(\|\s*safe)?\s*\}\}/gi, temaOverrideClaro)
            .replace(/\{\{\s*tema\.override_escuro\s*(\|\s*safe)?\s*\}\}/gi, temaOverrideEscuro)
            .replace(/\{\{\s*corpo_dicionario\s*(\|\s*safe)?\s*\}\}/gi, corpoHtml);

        if (Array.isArray(scriptsDados)) {
            // Marca o(s) ponto(s) de inserção e intercala os trechos do template com as
            // partes dos scripts de dados.
            const marcador = `\u0000SCRIPTS_DADOS_${Date.now()}\u0000`;
            html = html.replace(/\{\{\s*scripts_dados_js\s*(\|\s*safe)?\s*\}\}/gi, () => marcador);
            if (!html.includes(marcador) && !html.includes('window.dadosDicionarioLexical')) {
                html = html.replace(/<\/body>\s*<\/html>/i, () => `${marcador}\n</body>\n</html>`);
            }
            const conteudo = [];
            html.split(marcador).forEach((trecho, i) => {
                // Laço em vez de push(...): dicionários grandes geram partes demais para spread
                if (i > 0) for (const parte of scriptsDados) conteudo.push(parte);
                conteudo.push(trecho);
            });
            return conteudo;
        }

        html = html.replace(/\{\{\s*scripts_dados_js\s*(\|\s*safe)?\s*\}\}/gi, scriptsDados);

        // Prevenção inteligente: Se o template não possui a variável {{ scripts_dados_js }}, 
        // ou já possuía mas falhou na troca, injetamos como última coisa antes de fechar o HTML
        if (!html.includes('window.dadosDicionarioLexical')) {
            html = html.replace(/<\/body>\s*<\/html>/i, `${scriptsDados}\n</body>\n</html>`);
        }

        return html;
    }

    // Grava o HTML com mídias embutidas em `destino` (ver BrowserPlatform.abrirDestino) sem
    // nunca montá-lo inteiro na memória: o HTML é gerado com marcadores no lugar das mídias,
    // e cada marcador é trocado na gravação pelo Base64 lido do arquivo original em pedaços.
    // Assim nem o arquivo final nem uma mídia isolada esbarram no limite de tamanho de
    // string do motor JS, e o uso de memória não depende do tamanho dos vídeos.
    //
    // Vídeos não vão inline: os dados citam só "midia:N" e o Base64 de cada vídeo é gravado
    // em blocos inertes antes do </body>, decodificados pela página só quando o vídeo é
    // aberto (ver runtimeMidiasEmbutidas.js). Inline, o Base64 dos vídeos passava pelo
    // JavaScript, pelo template e pelo innerHTML ao abrir a página e estourava a memória.
    async gravarEmbutido(destino, opcoes = {}) {
        const prefixo = `__CSV2DMLI_MIDIA_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}_`;
        const midiasPorMarcador = { prefixo, mapa: new Map(), videos: new Map() };
        const MB = 1024 * 1024;
        const inicio = performance.now();
        const segundos = () => ((performance.now() - inicio) / 1000).toFixed(1);
        console.log('⏳ HTML embutido: gerando dados...');
        const partes = await this.exportar({ ...opcoes, embutirMidias: true, comoPartes: true, midiasPorMarcador });
        const { mapa, videos } = midiasPorMarcador;

        // Junta trechos pequenos para não fazer uma escrita por trecho
        const LIMITE_BUFFER = 4 * 1024 * 1024;
        let buffer = [];
        let tamanhoBuffer = 0;
        const descarregar = async () => {
            if (!buffer.length) return;
            const texto = buffer.join('');
            buffer = [];
            tamanhoBuffer = 0;
            await destino.escrever(texto);
        };
        const escrever = async (texto) => {
            if (!texto) return;
            buffer.push(texto);
            tamanhoBuffer += texto.length;
            if (tamanhoBuffer >= LIMITE_BUFFER) await descarregar();
        };

        // As mídias do projeto são referências aos arquivos no disco (seleção de pasta): se um
        // arquivo foi alterado, substituído ou movido depois de carregado, o navegador recusa a
        // leitura. A mensagem original não diz qual arquivo nem o que fazer.
        const lerBase64 = (arquivo, pos) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
            reader.onerror = () => {
                const nome = arquivo.webkitRelativePath || arquivo.name || 'mídia sem nome';
                const erro = new Error(`Não foi possível ler o arquivo "${nome}". Ele provavelmente foi alterado, substituído ou movido no disco depois de ser carregado no projeto. Recarregue a pasta do projeto (ou as mídias) e gere o HTML novamente.\n\nDetalhe técnico: ${reader.error && reader.error.message}`);
                erro.cause = reader.error;
                reject(erro);
            };
            reader.readAsDataURL(arquivo.slice(pos, pos + PEDACO));
        });
        // Múltiplo de 3 bytes: o Base64 de cada pedaço não tem preenchimento ("=") e os
        // pedaços concatenados formam exatamente o Base64 do arquivo inteiro.
        const PEDACO = 3 * 2 * 1024 * 1024;

        // Progresso em MB, atualizado a cada pedaço: vídeos grandes levam tempo e, contando
        // só mídias concluídas, a tela ficava parada e parecia travada. Uma mídia citada
        // mais de uma vez (gravada de novo) não soma ao progresso.
        const totalBytes = [...mapa.values(), ...videos.values()].reduce((soma, a) => soma + a.size, 0);
        let bytesGravados = 0;
        const concluidas = new Set();
        const avisarProgresso = (fase) => {
            const pct = totalBytes ? Math.min(100, Math.round(bytesGravados / totalBytes * 100)) : 100;
            window.dispatchEvent(new CustomEvent('exportacaoProgresso', { detail: {
                progresso: bytesGravados, total: totalBytes,
                mensagem: `${fase}: ${(bytesGravados / MB).toFixed(0)} de ${(totalBytes / MB).toFixed(0)} MB (${pct}%)`
            } }));
        };
        console.log(`⏳ HTML embutido: dados prontos em ${segundos()}s; gravando ${mapa.size} mídias e ${videos.size} vídeos (${(totalBytes / MB).toFixed(0)} MB)...`);

        // Grava o Base64 do arquivo em pedaços; `antesDoPedaco`/`depoisDoPedaco` envolvem cada
        // pedaço (tags dos blocos de vídeo)
        const gravarBase64 = async (chave, arquivo, fase, antesDoPedaco = null, depoisDoPedaco = null) => {
            const primeiraVez = !concluidas.has(chave);
            let pos = 0;
            do {
                if (antesDoPedaco) await escrever(antesDoPedaco);
                await descarregar();
                await destino.escrever(await lerBase64(arquivo, pos));
                if (depoisDoPedaco) await escrever(depoisDoPedaco);
                if (primeiraVez) bytesGravados += Math.min(PEDACO, arquivo.size - pos);
                avisarProgresso(fase);
                pos += PEDACO;
            } while (pos < arquivo.size);
            concluidas.add(chave);
        };
        const gravarMidia = async (marcador, arquivo) => {
            // Mesmo prefixo que o FileReader.readAsDataURL usaria para o arquivo inteiro
            await escrever(`data:${arquivo.type || 'application/octet-stream'};base64,`);
            await gravarBase64(marcador, arquivo, 'Gravando áudios e imagens');
        };
        // Um bloco por pedaço (~8 MB de texto): a página decodifica um de cada vez
        const gravarBlocosVideos = async () => {
            let k = 0;
            for (const [id, arquivo] of videos) {
                k++;
                const numero = id.slice('midia:'.length);
                const tipo = this.escaparHTML(arquivo.type || 'application/octet-stream');
                console.log(`⏳ HTML embutido: vídeo ${k}/${videos.size} "${arquivo.name || id}" (${(arquivo.size / MB).toFixed(0)} MB) — ${segundos()}s`);
                await gravarBase64(id, arquivo, `Gravando vídeo ${k} de ${videos.size}`,
                    `<script type="application/octet-stream" data-midia="${numero}" data-tipo="${tipo}">`, '</script>\n');
            }
        };

        const reMarcador = new RegExp(`${prefixo}\\d+__`, 'g');
        const escreverParte = async (parte) => {
            if (!mapa.size || !parte.includes(prefixo)) { await escrever(parte); return; }
            let ultimo = 0;
            let m;
            reMarcador.lastIndex = 0;
            while ((m = reMarcador.exec(parte))) {
                await escrever(parte.slice(ultimo, m.index));
                const arquivo = mapa.get(m[0]);
                if (arquivo) await gravarMidia(m[0], arquivo);
                else await escrever(m[0]);
                ultimo = m.index + m[0].length;
            }
            await escrever(parte.slice(ultimo));
        };

        // Os blocos dos vídeos entram antes do último </body> (ou no fim, se não houver)
        let parteBody = -1;
        let posBody = -1;
        if (videos.size) {
            for (let i = partes.length - 1; i >= 0 && parteBody < 0; i--) {
                const pos = partes[i].lastIndexOf('</body>');
                if (pos >= 0) { parteBody = i; posBody = pos; }
            }
        }
        for (let i = 0; i < partes.length; i++) {
            if (i !== parteBody) { await escreverParte(partes[i]); continue; }
            await escreverParte(partes[i].slice(0, posBody));
            await gravarBlocosVideos();
            await escreverParte(partes[i].slice(posBody));
        }
        if (videos.size && parteBody < 0) await gravarBlocosVideos();
        await descarregar();
        console.log(`✅ HTML embutido: conteúdo gravado em ${segundos()}s`);
    }
}
export default ExportadorHtmlCards;
