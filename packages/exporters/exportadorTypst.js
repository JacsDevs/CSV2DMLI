import ExportadorBase from './exportadorBase.js';

class ExportadorTypst extends ExportadorBase {
    constructor(gerenciadorDados) {
        super(gerenciadorDados);
        this.templatePrincipal = null;
        this.templateEntrada = null;
    }

    async carregarTemplates() {
        try {
            const cachePrincipal = localStorage.getItem('csv2dmli_template_typst');
            const cacheEntrada = localStorage.getItem('csv2dmli_templateEntradaTypst');
            
            if (false && cachePrincipal) this.templatePrincipal = cachePrincipal;
            else {
                try {
                    const res = await fetch('config/templates/typst/template.typ');
                    if (res.ok) this.templatePrincipal = await res.text();
                } catch(e) { console.warn('Fetch de config/templates/typst/template.typ falhou, usando fallback.'); }
            }

            if (false && cacheEntrada) this.templateEntrada = cacheEntrada;
            else {
                try {
                    const res = await fetch('config/templates/typst/entrada.typ');
                    if (res.ok) this.templateEntrada = await res.text();
                } catch(e) { console.warn('Fetch de config/templates/typst/entrada.typ falhou, usando fallback.'); }
            }

            // Fallback de emergência
            if (!this.templatePrincipal) {
                this.templatePrincipal = `// Template de emergência Typst\n#set page(paper: "a4", margin: (x: 2cm, y: 2.5cm))\n#set text(font: "Linux Libertine", size: 11pt)\n\n= {{ metadados.pdf }}\n#align(center)[#text(size: 1.2em)[_ {{ metadados.autor }} _]]\n\n#v(1em)\n\n{{ corpo_dicionario }}`;
            }
        } catch (e) {
            console.warn('⚠️ Erro ao carregar templates Typst', e);
        }
    }

    escaparTypst(texto) {
        if (!texto) return '';
        let resultado = String(texto);
        const escapes = {
            '\\': '\\\\', '#': '\\#', '*': '\\*', '_': '\\_', '$': '\\$',
            '[': '\\[', ']': '\\]', '(': '\\(', ')': '\\)', '{': '\\{', '}': '\\}',
            '`': '\\`', '|': '\\|', '~': '\\~', '=': '\\=', '+': '\\+', '/': '\\/',
            '&': '\\&', '%': '\\%', '@': '\\@', '!': '\\!', '?': '\\?', ';': '\\;',
            ':': '\\:', '>': '\\>', '<': '\\<'
        };
        resultado = resultado.replace(/[\\#*_$\{}`|~=+\/&%@!?;:><]/g, (match) => escapes[match] || match);
        return resultado;
    }

    gerarEntradaTypst(entrada) {
        const dados = this.extrairDadosEntrada(entrada);
        dados.TERMO = this.escaparTypst(dados.TERMO);
        dados.TERMO_PARENT = this.escaparTypst(dados.TERMO_PARENT);
        dados.CLASSE = this.escaparTypst(dados.CLASSE);
        dados.FONEMICA = this.escaparTypst(dados.FONEMICA);
        dados.FONETICA = this.escaparTypst(dados.FONETICA);
        dados.INDEX = this.escaparTypst(dados.INDEX);
        dados.ITENS_RELACIONADOS = this.escaparTypst(dados.ITENS_RELACIONADOS);
        
        dados.SIGNIFICADOS = dados.SIGNIFICADOS.map(s => ({
            ...s, 
            TRADUCAO: this.escaparTypst(s.TRADUCAO), 
            DESCRICAO: this.escaparTypst(s.DESCRICAO),
            EXEMPLOS: s.EXEMPLOS.map(e => ({ TRANS: this.escaparTypst(e.TRANS), TRAD: this.escaparTypst(e.TRAD) }))
        }));
        
        // Garante a compatibilidade com a chave {{#TEXTOS}} usada no HTML e nos templates
        const textosArray = dados.TEXTOS || dados.TEXTOS_ESTRUTURADOS;
        if (textosArray) {
            dados.TEXTOS = textosArray.map(t => ({
                ...t,
                TITULO_BASE: this.escaparTypst(t.TITULO_BASE),
                TEXTO_NAO_LITERAL: this.escaparTypst(t.TEXTO_NAO_LITERAL),
                VARIACOES: (t.VARIACOES || []).map(v => ({
                    ...v,
                    ID_VARIACAO: this.escaparTypst(v.ID_VARIACAO),
                    FRASES: (v.FRASES || []).map(f => ({
                        ...f,
                        ORIGINAL: this.escaparTypst(f.ORIGINAL),
                        TRADUCAO: this.escaparTypst(f.TRADUCAO),
                        AUDIO_ARQUIVO: this.escaparTypst(f.AUDIO_ARQUIVO)
                    }))
                }))
            }));
        }
        
        if (this.templateEntrada) {
            return this.processarTemplate(this.templateEntrada, dados);
        }
        
        // Metadados embutidos para formar o cabeçalho dinâmico do documento em caso de fallback emergencial
        let typ = `\n#v(0.6em)\n#metadata("${dados.TERMO}") <dict-word>\n*${dados.TERMO}*`;
        if (dados.CLASSE) typ += ` _${dados.CLASSE}_`;
        dados.SIGNIFICADOS.forEach(s => typ += ` ${s.TRADUCAO}`);
        
        if (dados.TEXTOS && dados.TEXTOS.length > 0) {
            dados.TEXTOS.forEach(t => {
                typ += `\n\n#v(1em, weak: true)\n#pad(left: 1em)[\n  *${t.TITULO_BASE}*`;
                if (t.TEXTO_NAO_LITERAL) typ += ` -- _${t.TEXTO_NAO_LITERAL}_`;
                if (t.VARIACOES && t.VARIACOES.length > 0) {
                    t.VARIACOES.forEach(v => {
                        if (v.FRASES && v.FRASES.length > 0) {
                            v.FRASES.forEach(f => {
                                typ += `\n\n  *_${f.ORIGINAL}_*`;
                                if (f.TRADUCAO) typ += ` \\\n  ${f.TRADUCAO}`;
                            });
                        }
                    });
                }
                typ += `\n]`;
            });
        }
        
        return typ;
    }

    gerarCorpoTypst(arvore, categoriasRaizes, manterSet) {
        const partes = [];
        const stripAccents = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        const processarNo = (nomeNo, noDict, nivel, raizCategoria) => {
            if (nivel === 1) {
                raizCategoria = nomeNo;
                partes.push(`\n= ${this.escaparTypst(nomeNo.toUpperCase())}\n#v(0.5em)\n`);
            } else if (nomeNo !== 'Geral') {
                partes.push(`\n${'='.repeat(nivel)} ${this.escaparTypst(nomeNo)}\n#v(0.5em)\n`);
            }
            
            if (noDict._entradas && noDict._entradas.length > 0) {
                noDict._entradas.forEach(ent => partes.push(this.gerarEntradaTypst(ent)));
            }
            
            const filhos = Object.keys(noDict).filter(k => k !== '_entradas')
                .sort((a, b) => stripAccents(a.toLowerCase()).localeCompare(stripAccents(b.toLowerCase())));
            
            for (const filho of filhos) processarNo(filho, noDict[filho], nivel + 1, raizCategoria);
        };
        
        categoriasRaizes.forEach(cat => processarNo(cat, arvore[cat], 1, cat));
        return partes.join('');
    }

    exportar(opcoes = {}) {
        if (!this.db.bancoDados) throw new Error('Banco de dados não gerado');
        if (!this.templatePrincipal) throw new Error('Template principal Typst não carregado');

        const { arvore, categoriasRaizes } = this.db.obterArvoreOrdenada();
        const manterSet = new Set((opcoes.categoriasManterOriginal || []).map(c => c.toLowerCase()));
        const corpo = this.gerarCorpoTypst(arvore, categoriasRaizes, manterSet);
        
        let codigo = this.templatePrincipal;
        const meta = opcoes.metadados || {};
        
        const titulo = meta.tituloPdf || meta.tituloHtml || meta.titulo || 'Dicionário';
        const autor = meta.autor || '';
        const ano = meta.ano || '';
        const introPdf = meta.introPdf || meta.intro_pdf || '';
        const versao = meta.versao || '1.0';

        codigo = codigo.replace(/\{\{\s*metadados\.html\s*\}\}/gi, meta.tituloHtml || titulo)
                       .replace(/\{\{\s*metadados\.titulo\s*\}\}/gi, titulo)
                       .replace(/\{\{\s*metadados\.pdf\s*\}\}/gi, titulo)
                       .replace(/\{\{\s*metadados\.autor\s*\}\}/gi, autor)
                       .replace(/\{\{\s*metadados\.ano\s*\}\}/gi, ano)
                       .replace(/\{\{\s*metadados\.versao\s*\}\}/gi, versao)
                       .replace(/\{\{\s*textos\.intro_pdf\s*\}\}/gi, introPdf)
                       .replace(/\{\{\s*corpo_dicionario\s*(\|\s*safe)?\s*\}\}/gi, corpo);

        codigo = this.processarTemplate(codigo, { ...meta, corpo_dicionario: corpo });

        // RegEx varredor: apaga quaisquer marcadores órfãos que não foram preenchidos
        codigo = codigo.replace(/\{\{.*?\}\}/g, '');

        return codigo;
    }
}
export default ExportadorTypst;