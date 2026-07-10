import ExportadorBase from './exportadorBase.js';

class ExportadorHtmlLinear extends ExportadorBase {
    constructor(gerenciadorDados) {
        super(gerenciadorDados);
        this.templatePrincipal = null;
        this.templateEntrada = null;
        this.estilosGlobais = null;
    }

    async carregarTemplates() {
        try {
            const cachePrincipal = localStorage.getItem('csv2dmli_template_html-linear');
            const cacheEntrada = localStorage.getItem('csv2dmli_templateEntradaLinearHtml');
            
            if (cachePrincipal) this.templatePrincipal = cachePrincipal;
            else {
                try {
                    const res = await fetch('config/templates/html-linear/template.html');
                    if (res.ok) this.templatePrincipal = await res.text();
                } catch(e) { console.warn('Fetch de config/templates/html-linear/template.html falhou, usando fallback.'); }
            }

            if (cacheEntrada) this.templateEntrada = cacheEntrada;
            else {
                try {
                    const res = await fetch('config/templates/html-linear/entrada.html');
                    if (res.ok) this.templateEntrada = await res.text();
                } catch(e) { console.warn('Fetch de config/templates/html-linear/entrada.html falhou, usando fallback.'); }
            }
            
            try {
                const res = await fetch('config/templates/estilos-globais.css');
                if (res.ok) this.estilosGlobais = await res.text();
            } catch(e) { console.warn('Fetch de config/templates/estilos-globais.css falhou, usando fallback.'); }
            
            // Fallback de emergência
            if (!this.templatePrincipal) {
                this.templatePrincipal = `<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>{{ metadados.html }}</title>
    <style>body { font-family: serif; padding: 20px; line-height: 1.6; color: #333; } .categoria { margin-bottom: 20px; } .categoria-titulo { font-size: 1.5em; font-weight: bold; margin-bottom: 10px; } .entry-linear { margin-bottom: 8px; }</style>
</head>
<body>
    <h1>{{ metadados.html }}</h1>
    <div id="dicionario">\n{{ corpo_dicionario }}\n</div>
    {{ scripts_dados_js }}
</body>
</html>`;
            }
        } catch (e) {
            console.warn('⚠️ Erro ao carregar templates HTML Linear', e);
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
        
        let html = `<div class="entry-linear"><strong>${dados.TERMO}</strong>`;
        if (dados.CLASSE) html += ` <em>${dados.CLASSE}</em>`;
        dados.SIGNIFICADOS.forEach(s => html += ` ${s.TRADUCAO} ${s.DESCRICAO}`);
        html += `</div>`;
        return html;
    }

    async gerarScriptsDados(embutir = false) {
        return await this.gerarScriptsDadosEmLotes('linear', embutir);
    }

    async exportar(opcoes = {}) {
        if (!this.db.bancoDados) throw new Error('Banco de dados não gerado');
        if (!this.templatePrincipal) throw new Error('Template principal HTML Linear não carregado');

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

        if (!html.includes('window.dadosDicionarioLexical')) {
            html = html.replace(/<\/body>\s*<\/html>/i, `${scriptsDados}\n</body>\n</html>`);
        }

        return html;
    }
}
export default ExportadorHtmlLinear;