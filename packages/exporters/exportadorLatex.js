import ExportadorBase from './exportadorBase.js';
import { converterMarkdownParaLatex } from './conversorMarkdownLatex.js';

class ExportadorLatex extends ExportadorBase {
    constructor(gerenciadorDados) {
        super(gerenciadorDados);
        this.templatePrincipal = null;
        this.templateEntrada = null;
        this.imagensUtilizadas = new Set();
    }

    async carregarTemplates() {
        try {
            try {
                const res = await fetch('config/templates/latex/template.tex');
                if (res.ok) this.templatePrincipal = await res.text();
            } catch(e) { console.warn('Fetch de template.tex falhou'); }

            try {
                const res = await fetch('config/templates/latex/entrada.tex');
                if (res.ok) this.templateEntrada = await res.text();
            } catch(e) { console.warn('Fetch de entrada.tex falhou'); }
        } catch (e) {
            console.warn('⚠️ Erro ao carregar templates LaTeX', e);
        }
    }

    escaparLatex(texto) {
        if (!texto) return '';
        let resultado = String(texto);
        const escapes = {
            '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}',
            '$': '\\$', '&': '\\&', '%': '\\%', '#': '\\#',
            '_': '\\_', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}',
            '<': '\\textless{}', '>': '\\textgreater{}'
        };
        resultado = resultado.replace(/[\\{}$&%#_^~<>]/g, (match) => escapes[match] || match);
        return resultado;
    }

    testaFinal(texto, removePonto = false) {
        if (!texto) return '';
        let t = String(texto).trim();
        if (removePonto) {
            if (t.endsWith('.')) t = t.slice(0, -1);
        } else {
            if (t && !/[.?!]$/.test(t)) t += '.';
        }
        return t;
    }

    gerarEntradaLatex(entrada) {
        const dados = this.extrairDadosEntrada(entrada);
        dados.TERMO = this.escaparLatex(dados.TERMO);
        dados.TERMO_PARENT = this.escaparLatex(dados.TERMO_PARENT);
        dados.CLASSE = this.escaparLatex(dados.CLASSE);
        dados.FONEMICA = this.escaparLatex(dados.FONEMICA);
        dados.FONETICA = this.escaparLatex(dados.FONETICA);
        dados.INDEX = this.escaparLatex(dados.INDEX);
        dados.ITENS_RELACIONADOS = this.escaparLatex(dados.ITENS_RELACIONADOS);
        
        dados.SIGNIFICADOS = dados.SIGNIFICADOS.map(s => {
            const traducao = this.escaparLatex(this.testaFinal(s.TRADUCAO, true));
            const descricao = this.escaparLatex(this.testaFinal(s.DESCRICAO, true));
            
            let textoSignificado = '';
            if (traducao) {
                textoSignificado += traducao;
            }
            if (descricao) {
                if (textoSignificado) {
                    textoSignificado += '. ';
                }
                textoSignificado += descricao;
            }
            if (textoSignificado) {
                textoSignificado += '.';
            }

            const sig = {
                ...s, 
                TEXTO_SIGNIFICADO: textoSignificado,
                EXEMPLOS: s.EXEMPLOS.map(e => ({ 
                    TRANS: this.escaparLatex(this.testaFinal(e.TRANS, false)), 
                    TRAD: this.escaparLatex(this.testaFinal(e.TRAD, false)) 
                }))
            };

            // Tratar imagens
            if (sig.IMAGENS && sig.IMAGENS.length > 0) {
                sig.IMAGENS = sig.IMAGENS.map(img => {
                    const arquivoOriginal = img.ARQUIVO;
                    if (!arquivoOriginal) return img;
                    
                    // Extrai apenas o nome do arquivo, ex: "foto.jpg" de "data/foto.jpg"
                    const nomeArquivo = arquivoOriginal.split('/').pop().split('\\').pop();
                    const arquivoLocal = 'images/' + nomeArquivo;
                    
                    // Guarda o arquivo original para incluirmos no ZIP
                    this.imagensUtilizadas.add({ original: arquivoOriginal, local: arquivoLocal });

                    return {
                        ...img,
                        ARQUIVO_LOCAL: arquivoLocal,
                        LEGENDA: this.escaparLatex(img.LEGENDA)
                    };
                });
            }

            return sig;
        });
        
        let saida = this.templateEntrada ? this.processarTemplate(this.templateEntrada, dados) : `\n\\textbf{${dados.TERMO}}\n`;

        return saida;
    }

    gerarCorpoLatex(arvore, categoriasRaizes, manterSet) {
        const partes = [];
        const stripAccents = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        const processarNo = (nomeNo, noDict, nivel, raizCategoria) => {
            if (nivel === 1) {
                raizCategoria = nomeNo;
                partes.push(`\n\\chapter{${this.escaparLatex(nomeNo.toUpperCase())}}\n`);
            } else if (nomeNo !== 'Geral') {
                const sub = nivel === 2 ? 'section' : 'subsection';
                partes.push(`\n\\${sub}{${this.escaparLatex(nomeNo)}}\n`);
            }
            
            if (noDict._entradas && noDict._entradas.length > 0) {
                noDict._entradas.forEach(ent => partes.push(this.gerarEntradaLatex(ent)));
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
        if (!this.templatePrincipal) throw new Error('Template principal LaTeX não carregado');

        this.imagensUtilizadas.clear();

        const { arvore, categoriasRaizes } = this.db.obterArvoreOrdenada();
        const manterSet = new Set((opcoes.categoriasManterOriginal || []).map(c => c.toLowerCase()));
        const corpo = this.gerarCorpoLatex(arvore, categoriasRaizes, manterSet);
        
        let codigo = this.templatePrincipal;
        const meta = opcoes.metadados || {};
        
        const titulo = meta.tituloPdf || meta.tituloHtml || meta.titulo || 'Dicionário';
        const autor = meta.autor || '';
        const ano = meta.ano || '';
        const introMd = meta.introPdf || meta.intro_pdf || '';
        const versao = meta.versao || '1.0';

        const introLatex = converterMarkdownParaLatex(introMd);

        // Limpar metadados para latex (escapar os que são diretos)
        const tituloEscapado = this.escaparLatex(titulo);
        const autorEscapado = this.escaparLatex(autor);

        codigo = codigo.replace(/\{\{\s*metadados\.html\s*\}\}/gi, tituloEscapado)
                       .replace(/\{\{\s*metadados\.titulo\s*\}\}/gi, tituloEscapado)
                       .replace(/\{\{\s*metadados\.pdf\s*\}\}/gi, tituloEscapado)
                       .replace(/\{\{\s*metadados\.autor\s*\}\}/gi, autorEscapado)
                       .replace(/\{\{\s*metadados\.ano\s*\}\}/gi, this.escaparLatex(ano))
                       .replace(/\{\{\s*metadados\.versao\s*\}\}/gi, this.escaparLatex(versao))
                       .replace(/\{\{\s*textos\.intro_pdf\s*\}\}/gi, introLatex)
                       .replace(/\{\{\s*corpo_dicionario\s*(\|\s*safe)?\s*\}\}/gi, corpo);

        // RegEx varredor: apaga quaisquer marcadores órfãos que não foram preenchidos
        codigo = codigo.replace(/\{\{.*?\}\}/g, '');

        return {
            latex: codigo,
            imagens: Array.from(this.imagensUtilizadas)
        };
    }
}
export default ExportadorLatex;
