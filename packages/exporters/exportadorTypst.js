import ExportadorBase from './exportadorBase.js';
import { renderizarReferenciasAbnt } from '../core/bibliografiaAbnt.js';

// Cores da capa quando não há tema (verde original do modelo)
const CORES_CAPA_PADRAO = { primaria: '#1b4332', acento: '#74a383', contraste: '#ffffff' };

/**
 * Logo do projeto para a capa do PDF: só o logo definido pelo usuário (nunca o
 * ícone do app) e só em PNG/JPEG, formatos que o Typst lê pelo nome do arquivo.
 * Usado pelo exportador (caminho no template) e pelo CompiladorPdf (bytes no VFS).
 * @returns {{ caminho: string, bytes: Uint8Array } | null}
 */
export function logoCapaPdf(gerenciador) {
    const bruto = gerenciador && gerenciador.logo && gerenciador.logo.bytes;
    if (!bruto || bruto.length < 4) return null;
    const bytes = bruto instanceof Uint8Array ? bruto : Uint8Array.from(bruto);
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return { caminho: '/capa-logo.png', bytes };
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return { caminho: '/capa-logo.jpg', bytes };
    return null;
}

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
                    const res = await fetch('config/templates/typst/template.typ?v=' + Date.now());
                    if (res.ok) this.templatePrincipal = await res.text();
                } catch(e) { console.warn('Fetch de config/templates/typst/template.typ falhou, usando fallback.'); }
            }

            if (false && cacheEntrada) this.templateEntrada = cacheEntrada;
            else {
                try {
                    const res = await fetch('config/templates/typst/entrada.typ?v=' + Date.now());
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

    /**
     * Índice "nome do arquivo em minúsculas" -> nome real, das imagens do VFS.
     * O CompiladorPdf injeta cada imagem em /foto/<nome real>, então este é o
     * único caminho que o Typst consegue ler.
     */
    montarIndiceImagens() {
        const indice = new Map();
        const imagens = this.db.vfs && this.db.vfs.imagem;
        if (imagens) {
            for (const chave of imagens.keys()) {
                const nome = chave.split('/').pop().split('\\').pop();
                const nomeMinusculo = nome.toLowerCase();
                if (!indice.has(nomeMinusculo)) indice.set(nomeMinusculo, nome);
            }
        }
        return indice;
    }

    /**
     * Mantém só as imagens presentes no VFS, apontando para o caminho em que o
     * compilador as injeta. O Typst aborta a compilação inteira ao não achar um
     * arquivo de #image, então as ausentes são omitidas do PDF.
     */
    filtrarImagensDisponiveis(imagens, termo) {
        if (!imagens || imagens.length === 0) return [];
        if (!this.indiceImagens) this.indiceImagens = this.montarIndiceImagens();

        const disponiveis = [];
        for (const img of imagens) {
            const nome = String(img.ARQUIVO || '').split('/').pop().split('\\').pop();
            const nomeReal = nome ? this.indiceImagens.get(nome.toLowerCase()) : null;
            if (nomeReal) {
                disponiveis.push({ ...img, ARQUIVO: `foto/${nomeReal}` });
            } else {
                console.warn(`⚠️ Imagem "${img.ARQUIVO}" (entrada "${termo}") não encontrada; omitida do PDF.`);
            }
        }
        return disponiveis;
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
        // Bloco {{#SEPARADOR}} do entrada.typ: linha divisória entre verbetes
        // (processarTemplate só omite valores vazios, não `false`)
        dados.SEPARADOR = this.separadorPdf !== false ? true : '';
        dados.SEM_SEPARADOR = dados.SEPARADOR ? '' : true;
        // Em ordem alfabética o capítulo não diz mais o campo semântico: ele vai no cabeçalho do verbete
        dados.CATEGORIA_PDF = this.ordemAlfabeticaPdf ? this.escaparTypst(this.trilhaCategoria(entrada)) : '';

        const escaparTextoTypst = (t) => ({
            ...t,
            TITULO_BASE: this.escaparTypst(t.TITULO_BASE),
            TITULO_EXIBICAO: t.TITULO_EXIBICAO ? this.escaparTypst(t.TITULO_EXIBICAO) : '',
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
        });

        dados.SIGNIFICADOS = dados.SIGNIFICADOS.map(s => ({
            ...s,
            TRADUCAO: this.escaparTypst(s.TRADUCAO),
            DESCRICAO: this.escaparTypst(s.DESCRICAO),
            EXEMPLOS: s.EXEMPLOS.map(e => ({ TRANS: this.escaparTypst(e.TRANS), TRAD: this.escaparTypst(e.TRAD) })),
            IMAGENS: this.filtrarImagensDisponiveis(s.IMAGENS, dados.TERMO_PARENT),
            TEXTOS_ESTRUTURADOS: (s.TEXTOS_ESTRUTURADOS || []).map(escaparTextoTypst)
        }));
        
        // Garante a compatibilidade com a chave {{#TEXTOS}} usada no HTML e nos templates
        const textosArray = dados.TEXTOS || dados.TEXTOS_ESTRUTURADOS;
        if (textosArray) {
            dados.TEXTOS = textosArray.map(escaparTextoTypst);
        }
        
        if (this.templateEntrada) {
            return this.processarTemplate(this.templateEntrada, dados);
        }
        
        // Metadados embutidos para formar o cabeçalho dinâmico do documento em caso de fallback emergencial
        let typ = `\n#v(0.75em, weak: true)\n#metadata("${dados.TERMO}") <dict-word>\n#block[*${dados.TERMO}*`;
        if (dados.CLASSE) typ += ` _${dados.CLASSE}_`;
        dados.SIGNIFICADOS.forEach(s => typ += ` ${s.TRADUCAO}`);

        return typ + ']';
    }

    /** Trilha "Campo › Subcampo › ..." da entrada, sem o nível 'Geral'. */
    trilhaCategoria(entrada) {
        return [entrada.CAMPO_SEMANTICO, ...(entrada.SUB_CAMPOS_SEMANTICOS || [])]
            .map(v => String(v || '').trim())
            .filter(v => v && v !== 'Geral')
            .join(' › ');
    }

    /** Corpo em ordem alfabética: cada letra é um capítulo (nível 1), como os campos semânticos. */
    gerarCorpoAlfabeticoTypst(gruposLetras) {
        const partes = [];
        gruposLetras.forEach(({ letra, entradas }) => {
            // Mesmo absorvedor de fim de capítulo usado entre os campos semânticos
            if (partes.length > 0) partes.push('\n#v(1000fr, weak: true)\n');
            partes.push(`\n#heading(level: 1, outlined: true, bookmarked: true)[${this.escaparTypst(letra)}]\n`);
            entradas.forEach(ent => partes.push(this.gerarEntradaTypst(ent)));
        });
        return partes.join('');
    }

    gerarCorpoTypst(arvore, categoriasRaizes, manterSet) {
        const partes = [];
        const stripAccents = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        const processarNo = (nomeNo, noDict, nivel, raizCategoria) => {
            if (nivel === 1) {
                raizCategoria = nomeNo;
                // Absorvedor de fim de categoria: na última coluna da categoria anterior,
                // o espaço que sobra fica no pé em vez de ir para os blocos 1fr das
                // imagens (ver entrada.typ). Não vai antes da primeira: criaria página vazia.
                if (partes.length > 0) partes.push('\n#v(1000fr, weak: true)\n');
                const nome = this.escaparTypst(nomeNo.toUpperCase());
                partes.push(`\n#heading(level: 1, outlined: true, bookmarked: true)[${nome}]\n`);
            } else if (nomeNo !== 'Geral') {
                const nome = this.escaparTypst(nomeNo);
                partes.push(`\n#heading(level: ${nivel}, outlined: true, bookmarked: true)[${nome}]\n`);
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
        if (!this.db.bancoDados) throw new Error(_t('Banco de dados não gerado'));
        if (!this.templatePrincipal) throw new Error(_t('Template principal Typst não carregado'));

        // Reconstrói o índice a cada exportação: o VFS pode ter mudado desde a última
        this.indiceImagens = this.montarIndiceImagens();

        this.separadorPdf = (opcoes.metadados || {}).separadorPdf !== false;

        this.ordemAlfabeticaPdf = Boolean((opcoes.metadados || {}).ordemAlfabeticaPdf);

        let corpo;
        if (this.ordemAlfabeticaPdf) {
            corpo = this.gerarCorpoAlfabeticoTypst(this.db.obterEntradasAlfabeticas().gruposLetras);
        } else {
            const { arvore, categoriasRaizes } = this.db.obterArvoreOrdenada();
            const manterSet = new Set((opcoes.categoriasManterOriginal || []).map(c => c.toLowerCase()));
            corpo = this.gerarCorpoTypst(arvore, categoriasRaizes, manterSet);
        }
        
        let codigo = this.templatePrincipal;
        const meta = opcoes.metadados || {};
        
        const titulo = meta.tituloPdf || meta.tituloHtml || meta.titulo || 'Dicionário';
        const autor = meta.autor || '';
        const ano = meta.ano || '';
        const introPdf = meta.introPdf || meta.intro_pdf || '';
        const versao = meta.versao || '1.0';
        const modoPdf = meta.modoPdf === 'impressao' ? 'impressao' : 'tela';

        // Capa: cores da paleta de Aparência (versão clara), subtítulo e logo opcionais
        const paleta = (meta.tema && meta.tema.light) || {};
        const corValida = (valor, padrao) => /^#[0-9a-f]{6}$/i.test(String(valor || '').trim()) ? String(valor).trim() : padrao;
        const corPrimaria = corValida(paleta['--cor-primaria'], CORES_CAPA_PADRAO.primaria);
        const corAcento = corValida(paleta['--cor-acento'], CORES_CAPA_PADRAO.acento);
        const corContraste = corValida(paleta['--cor-primaria-contraste'], CORES_CAPA_PADRAO.contraste);
        const subtituloCapa = this.escaparTypst((meta.subtitulo || '').trim());
        const logo = logoCapaPdf(this.db);

        let referenciasTypst = '';
        const temBib = !!(meta.bibliografiaBib || (this.db && this.db.bibliografiaBib));
        if (temBib) {
            referenciasTypst = '#bibliography("bibliografia.bib", style: "abnt-6023.csl", full: true, title: none)';
        }

        if (referenciasTypst) {
            codigo = codigo.replace(/\{\{\s*textos\.referencias_typst\s*(\|\s*safe)?\s*\}\}/gi, referenciasTypst);
        } else {
            // Remove a seção de referências caso não haja bibliografia carregada:
            // entre os marcadores do template atual, ou pelos padrões de templates antigos
            codigo = codigo
                .replace(/\/\/\s*\[REFERENCIAS-INICIO\][\s\S]*?\/\/\s*\[REFERENCIAS-FIM\]/g, '')
                .replace(/#\[\s*#show\s+heading\.where\(level:\s*1\)[\s\S]*?=\s*Refer[eê]ncias[\s\S]*?\{\{\s*textos\.referencias_typst\s*(\|\s*safe)?\s*\}\}\s*\]\s*#(?:pagebreak|nova-secao)\(\)/gi, '')
                .replace(/=\s*Refer[eê]ncias[\s\S]*?\{\{\s*textos\.referencias_typst\s*(\|\s*safe)?\s*\}\}\s*#(?:pagebreak|nova-secao)\(\)/gi, '');
        }

        // Sem texto de introdução, a seção inteira sai do documento (e do sumário)
        if (!String(introPdf).trim()) {
            codigo = codigo.replace(/\/\/\s*\[INTRODUCAO-INICIO\][\s\S]*?\/\/\s*\[INTRODUCAO-FIM\]/g, '');
        }

        codigo = codigo.replace(/\{\{\s*metadados\.html\s*\}\}/gi, meta.tituloHtml || titulo)
                       .replace(/\{\{\s*metadados\.titulo\s*\}\}/gi, titulo)
                       .replace(/\{\{\s*metadados\.pdf\s*\}\}/gi, titulo)
                       .replace(/\{\{\s*metadados\.autor\s*\}\}/gi, autor)
                       .replace(/\{\{\s*metadados\.ano\s*\}\}/gi, ano)
                       .replace(/\{\{\s*metadados\.versao\s*\}\}/gi, versao)
                       .replace(/\{\{\s*metadados\.modo_pdf\s*\}\}/gi, modoPdf)
                       .replace(/\{\{\s*metadados\.cor_primaria\s*\}\}/gi, corPrimaria)
                       .replace(/\{\{\s*metadados\.cor_acento\s*\}\}/gi, corAcento)
                       .replace(/\{\{\s*metadados\.cor_contraste\s*\}\}/gi, corContraste)
                       .replace(/\{\{\s*textos\.intro_pdf\s*\}\}/gi, introPdf)
                       .replace(/\{\{\s*corpo_dicionario\s*(\|\s*safe)?\s*\}\}/gi, corpo);

        codigo = this.processarTemplate(codigo, {
            ...meta,
            corpo_dicionario: corpo,
            SUBTITULO_CAPA: subtituloCapa,
            LOGO_CAPA: logo ? logo.caminho : ''
        });

        // RegEx varredor: apaga quaisquer marcadores órfãos que não foram preenchidos
        codigo = codigo.replace(/\{\{.*?\}\}/g, '');

        return codigo;
    }
}
export default ExportadorTypst;