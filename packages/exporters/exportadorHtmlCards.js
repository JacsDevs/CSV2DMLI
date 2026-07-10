import ExportadorBase from './exportadorBase.js';

class ExportadorHtmlCards extends ExportadorBase {
    constructor(gerenciadorDados) {
        super(gerenciadorDados);
        this.templatePrincipal = null;
        this.templateEntrada = null;
        this.estilosGlobais = null;
    }

    async carregarTemplates() {
        try {
            // Tenta carregar do localStorage ou via fetch
            const cachePrincipal = localStorage.getItem('csv2dmli_template_html');
            const cacheEntrada = localStorage.getItem('csv2dmli_templateEntradaCardHtml');
            
            if (cachePrincipal) this.templatePrincipal = cachePrincipal;
            else {
                try {
                    const res = await fetch('config/templates/html-cards/template.html');
                    if (res.ok) this.templatePrincipal = await res.text();
                } catch(e) { console.warn('Fetch de config/templates/html-cards/template.html falhou, usando fallback.'); }
            }

            if (cacheEntrada) this.templateEntrada = cacheEntrada;
            else {
                try {
                    const res = await fetch('config/templates/html-cards/entrada.html');
                    if (res.ok) this.templateEntrada = await res.text();
                } catch(e) { console.warn('Fetch de config/templates/html-cards/entrada.html falhou, usando fallback.'); }
            }

            try {
                const res = await fetch('config/templates/estilos-globais.css');
                if (res.ok) this.estilosGlobais = await res.text();
            } catch(e) { console.warn('Fetch de config/templates/estilos-globais.css falhou, usando fallback.'); }

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
            EXEMPLOS: s.EXEMPLOS.map(e => ({ TRANS: this.escaparHTML(e.TRANS), TRAD: this.escaparHTML(e.TRAD) })),
            IMAGENS: s.IMAGENS.map(i => ({ ARQUIVO: this.escaparHTML(i.ARQUIVO), LEGENDA: this.escaparHTML(i.LEGENDA) })),
            VIDEOS: s.VIDEOS.map(v => ({ ARQUIVO: this.escaparHTML(v.ARQUIVO) })),
            EXTRAS: s.EXTRAS.map(e => ({ TEXTO: this.escaparHTML(e.TEXTO) }))
        }));
        
        if (dados.TEXTOS_ESTRUTURADOS) {
            dados.TEXTOS_ESTRUTURADOS = dados.TEXTOS_ESTRUTURADOS.map(t => ({
                ...t,
                TITULO_BASE: this.escaparHTML(t.TITULO_BASE),
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

    async gerarScriptsDados(embutir = false) {
        return await this.gerarScriptsDadosEmLotes('card', embutir);
    }

    async exportar(opcoes = {}) {
        if (!this.db.bancoDados) throw new Error('Banco de dados não gerado');
        if (!this.templatePrincipal) throw new Error('Template principal HTML não carregado');

        const { arvore, categoriasRaizes } = this.db.obterArvoreOrdenada();
        
        const scriptsDados = await this.gerarScriptsDados(opcoes.embutirMidias);
        
        let corpoHtml = '';
        const processarEntradasHTML = (noDict) => {
            let html = '';
            if (noDict._entradas) noDict._entradas.forEach(ent => html += this.gerarEntradaHTML(ent));
            Object.keys(noDict).filter(k => k !== '_entradas').forEach(filho => html += processarEntradasHTML(noDict[filho]));
            return html;
        };
        
        for (const cat of categoriasRaizes) {
            corpoHtml += `<section class="categoria">\n<h2 class="categoria-titulo">${cat}</h2>\n`;
            corpoHtml += processarEntradasHTML(arvore[cat]);
            corpoHtml += `</section>\n`;
        }

        const meta = opcoes.metadados || {};

        let html = this.templatePrincipal
            .replace(/\{\{\s*metadados\.html\s*\}\}/gi, meta.tituloHtml || 'Dicionário')
            .replace(/\{\{\s*metadados\.pdf\s*\}\}/gi, meta.tituloPdf || 'Dicionário')
            .replace(/\{\{\s*metadados\.autor\s*\}\}/gi, meta.autor || '')
            .replace(/\{\{\s*metadados\.versao\s*\}\}/gi, meta.versao || '')
            .replace(/\{\{\s*metadados\.ano\s*\}\}/gi, meta.ano || '')
            .replace(/\{\{\s*textos\.intro_html\s*(\|\s*safe)?\s*\}\}/gi, meta.introHtml || '')
            .replace(/\{\{\s*estilos_globais\s*(\|\s*safe)?\s*\}\}/gi, this.estilosGlobais || '')
            .replace(/\{\{\s*corpo_dicionario\s*(\|\s*safe)?\s*\}\}/gi, corpoHtml)
            .replace(/\{\{\s*scripts_dados_js\s*(\|\s*safe)?\s*\}\}/gi, scriptsDados);

        // Prevenção inteligente: Se o template não possui a variável {{ scripts_dados_js }}, 
        // ou já possuía mas falhou na troca, injetamos como última coisa antes de fechar o HTML
        if (!html.includes('window.dadosDicionarioLexical')) {
            html = html.replace(/<\/body>\s*<\/html>/i, `${scriptsDados}\n</body>\n</html>`);
        }

        return html;
    }
}
export default ExportadorHtmlCards;