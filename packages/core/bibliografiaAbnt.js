/**
 * bibliografiaAbnt.js - Motor 100% Offline de Processamento BibTeX e Formatação ABNT (NBR 6023:2018)
 *
 * Módulo puramente ESM (sem dependências externas) para processamento no navegador,
 * em Service Workers (PWA) e no Node.js.
 */

// ── Decodificador de Comandos e Acentuação LaTeX para UTF-8 ──────────────────
const ACENTOS_LATEX = [
    // Dotless i e j no LaTeX: \i, \j (usados com acentos como \'{\i} ou \'{\j})
    [/\\i\b/g, 'i'],
    [/\\j\b/g, 'j'],

    // Acentos com chaves: {\'a}, {\"u}, {\c{c}}, etc.
    [/\{\\\'([aeiouyAEIOUY])\}/g, (_, c) => {
        const m = { a:'á', e:'é', i:'í', o:'ó', u:'ú', y:'ý', A:'Á', E:'É', I:'Í', O:'Ó', U:'Ú', Y:'Ý' };
        return m[c] || c;
    }],
    [/\{\\`([aeiouAEIOU])\}/g, (_, c) => {
        const m = { a:'à', e:'è', i:'ì', o:'ò', u:'ù', A:'À', E:'È', I:'Ì', O:'Ò', U:'Ù' };
        return m[c] || c;
    }],
    [/\{\\^([aeiouAEIOU])\}/g, (_, c) => {
        const m = { a:'â', e:'ê', i:'î', o:'ô', u:'û', A:'Â', E:'Ê', I:'Î', O:'Ô', U:'Û' };
        return m[c] || c;
    }],
    [/\{\\~([aeiouyAEIOUYnN])\}/g, (_, c) => {
        const m = { a:'ã', e:'ẽ', i:'ĩ', o:'õ', u:'ũ', y:'ỹ', n:'ñ', A:'Ã', E:'Ẽ', I:'Ĩ', O:'Õ', U:'Ũ', Y:'Ỹ', N:'Ñ' };
        return m[c] || c;
    }],
    [/\{\\\"([aeiouyAEIOUY])\}/g, (_, c) => {
        const m = { a:'ä', e:'ë', i:'ï', o:'ö', u:'ü', y:'ÿ', A:'Ä', E:'Ë', I:'Ï', O:'Ö', U:'Ü', Y:'Ÿ' };
        return m[c] || c;
    }],
    [/\{\\c\{?([cC])\}?\}/g, (_, c) => (c === 'c' ? 'ç' : 'Ç')],
    [/\\c\{([cC])\}/g, (_, c) => (c === 'c' ? 'ç' : 'Ç')],

    // Acentos sem chaves diretas: \'a, \"u, \^o, etc.
    [/\\\'([aeiouyAEIOUY])/g, (_, c) => {
        const m = { a:'á', e:'é', i:'í', o:'ó', u:'ú', y:'ý', A:'Á', E:'É', I:'Í', O:'Ó', U:'Ú', Y:'Ý' };
        return m[c] || c;
    }],
    [/\\`([aeiouAEIOU])/g, (_, c) => {
        const m = { a:'à', e:'è', i:'ì', o:'ò', u:'ù', A:'À', E:'È', I:'Ì', O:'Ò', U:'Ù' };
        return m[c] || c;
    }],
    [/\\\^([aeiouAEIOU])/g, (_, c) => {
        const m = { a:'â', e:'ê', i:'î', o:'ô', u:'û', A:'Â', E:'Ê', I:'Î', O:'Ô', U:'Û' };
        return m[c] || c;
    }],
    [/\\~([aeiouyAEIOUYnN])/g, (_, c) => {
        const m = { a:'ã', e:'ẽ', i:'ĩ', o:'õ', u:'ũ', y:'ỹ', n:'ñ', A:'Ã', E:'Ẽ', I:'Ĩ', O:'Õ', U:'Ũ', Y:'Ỹ', N:'Ñ' };
        return m[c] || c;
    }],
    [/\\\"([aeiouyAEIOUY])/g, (_, c) => {
        const m = { a:'ä', e:'ë', i:'ï', o:'ö', u:'ü', y:'ÿ', A:'Ä', E:'Ë', I:'Ï', O:'Ö', U:'Ü', Y:'Ÿ' };
        return m[c] || c;
    }],

    // Símbolos especiais comuns em linguística e línguas europeias
    [/\\aa\b/g, 'å'], [/\\AA\b/g, 'Å'],
    [/\\ae\b/g, 'æ'], [/\\AE\b/g, 'Æ'],
    [/\\oe\b/g, 'œ'], [/\\OE\b/g, 'Œ'],
    [/\\ss\b/g, 'ß'],
    [/\\o\b/g, 'ø'], [/\\O\b/g, 'Ø'],
    [/\\l\b/g, 'ł'], [/\\L\b/g, 'Ł'],

    // Pontuações LaTeX
    [/---/g, '—'],
    [/--/g, '–'],
    [/``/g, '“'],
    [/''/g, '”'],
    [/`/g, '‘'],
    [/'/g, '’'],

    // Tags de estilo
    [/\\textbf\{([^}]+)\}/g, '$1'],
    [/\\textit\{([^}]+)\}/g, '$1'],
    [/\\emph\{([^}]+)\}/g, '$1'],
    [/\\underline\{([^}]+)\}/g, '$1'],
    [/\\url\{([^}]+)\}/g, '$1'],
    [/\\href\{[^}]+\}\{([^}]+)\}/g, '$1'],

    // Limpeza de chaves residuais de proteção ({RNA} -> RNA)
    [/\{([^{}]+)\}/g, '$1']
];

export function limparLatex(texto) {
    if (!texto) return '';
    let res = String(texto);
    for (const [re, sub] of ACENTOS_LATEX) {
        res = res.replace(re, sub);
    }
    // Uma segunda passada para chaves duplas restantes: {{Nome}} -> Nome
    res = res.replace(/\{([^{}]+)\}/g, '$1').trim();
    return res;
}

// ── Parser BibTeX Nativo e Resiliente ─────────────────────────────────────────

/**
 * Lê uma string BibTeX completa e extrai as entradas com seus campos.
 * Suporta @string, ignora @comment, lida com chaves aninhadas e aspas.
 * @param {string} conteudoBib 
 * @returns {Array<object>} Lista de entradas BibTeX normalizadas
 */
export function parseBibtex(conteudoBib) {
    if (!conteudoBib || typeof conteudoBib !== 'string') return [];

    const entradas = [];
    const strings = new Map();
    const len = conteudoBib.length;
    let i = 0;

    const pularEspacos = () => {
        while (i < len && /\s/.test(conteudoBib[i])) i++;
    };

    while (i < len) {
        pularEspacos();
        if (i >= len) break;

        if (conteudoBib[i] !== '@') {
            i++;
            continue;
        }

        i++; // Pula o '@'
        pularEspacos();

        // Extrai o tipo da entrada (ex: article, book, string)
        let tipo = '';
        while (i < len && /[a-zA-Z0-9_-]/.test(conteudoBib[i])) {
            tipo += conteudoBib[i++];
        }
        tipo = tipo.toLowerCase();
        pularEspacos();

        if (tipo === 'comment') {
            // Ignora até o final da linha ou bloco
            while (i < len && conteudoBib[i] !== '\n') i++;
            continue;
        }

        const charAbertura = conteudoBib[i];
        if (charAbertura !== '{' && charAbertura !== '(') {
            continue;
        }
        const charFechamento = charAbertura === '{' ? '}' : ')';
        i++; // Pula abertura

        // Trata @string{ chave = "valor" }
        if (tipo === 'string') {
            pularEspacos();
            let chaveStr = '';
            while (i < len && /[a-zA-Z0-9_-]/.test(conteudoBib[i])) {
                chaveStr += conteudoBib[i++];
            }
            pularEspacos();
            if (conteudoBib[i] === '=') {
                i++;
                pularEspacos();
                const valor = lerValorCampo();
                if (chaveStr && valor) {
                    strings.set(chaveStr.toLowerCase(), valor);
                }
            }
            // Encontra fechamento
            while (i < len && conteudoBib[i] !== charFechamento) i++;
            if (i < len) i++;
            continue;
        }

        if (tipo === 'preamble') {
            while (i < len && conteudoBib[i] !== charFechamento) i++;
            if (i < len) i++;
            continue;
        }

        // Lê a chave de citação (ex: Silva2020)
        pularEspacos();
        let citeKey = '';
        while (i < len && conteudoBib[i] !== ',' && conteudoBib[i] !== charFechamento && !/\s/.test(conteudoBib[i])) {
            citeKey += conteudoBib[i++];
        }
        pularEspacos();
        if (conteudoBib[i] === ',') i++;

        const campos = {
            _tipo: tipo,
            _chave: citeKey.trim()
        };

        // Lê os pares campo = valor
        while (i < len) {
            pularEspacos();
            if (i >= len || conteudoBib[i] === charFechamento) break;

            let nomeCampo = '';
            while (i < len && /[a-zA-Z0-9_-]/.test(conteudoBib[i])) {
                nomeCampo += conteudoBib[i++];
            }
            nomeCampo = nomeCampo.trim().toLowerCase();
            pularEspacos();

            if (conteudoBib[i] === '=') {
                i++; // Pula '='
                pularEspacos();
                const valorCampo = lerValorCampo();
                if (nomeCampo) {
                    campos[nomeCampo] = valorCampo;
                }
            }

            pularEspacos();
            if (conteudoBib[i] === ',') {
                i++;
            } else if (conteudoBib[i] === charFechamento) {
                break;
            }
        }

        if (i < len && conteudoBib[i] === charFechamento) {
            i++;
        }

        if (campos._tipo && (campos.title || campos.author || campos._chave)) {
            entradas.push(campos);
        }
    }

    function lerValorCampo() {
        pularEspacos();
        if (i >= len) return '';

        let partes = [];
        
        while (i < len) {
            pularEspacos();
            if (i >= len) break;
            const c = conteudoBib[i];

            if (c === '{') {
                i++;
                let nivel = 1;
                let val = '';
                while (i < len && nivel > 0) {
                    const charAtual = conteudoBib[i++];
                    if (charAtual === '{') nivel++;
                    else if (charAtual === '}') {
                        nivel--;
                        if (nivel === 0) break;
                    }
                    val += charAtual;
                }
                partes.push(val);
            } else if (c === '"') {
                i++;
                let val = '';
                while (i < len) {
                    const charAtual = conteudoBib[i++];
                    if (charAtual === '\\' && i < len) {
                        val += charAtual + conteudoBib[i++];
                    } else if (charAtual === '"') {
                        break;
                    } else {
                        val += charAtual;
                    }
                }
                partes.push(val);
            } else if (/[a-zA-Z0-9_-]/.test(c)) {
                let token = '';
                while (i < len && /[a-zA-Z0-9_-]/.test(conteudoBib[i])) {
                    token += conteudoBib[i++];
                }
                const substituicao = strings.get(token.toLowerCase());
                partes.push(substituicao !== undefined ? substituicao : token);
            } else {
                break;
            }

            pularEspacos();
            if (conteudoBib[i] === '#') {
                i++; // Concatenação BibTeX
            } else {
                break;
            }
        }

        return limparLatex(partes.join(''));
    }

    return entradas;
}

// ── Formatação de Nomes e Autores em Padrão ABNT ──────────────────────────────

const SUFIXOS_AGNOTICOS = new Set(['filho', 'filha', 'neto', 'neta', 'junior', 'júnior', 'jr', 'jr.', 'sobrinho', 'sobrinha']);
const PREPOSICOES_NOME = new Set(['da', 'de', 'do', 'dos', 'das', 'del', 'van', 'von']);

/**
 * Formata um autor individual no padrão "SOBRENOME, Nome" segundo ABNT.
 * Trata sufixos de parentesco (Filho, Neto, Jr.) e preposições (da, de, do).
 * @param {string} autorStr 
 * @returns {string}
 */
export function formatarNomeAutorAbnt(autorStr) {
    if (!autorStr) return '';
    const limpo = autorStr.trim().replace(/\s+/g, ' ');
    if (!limpo) return '';

    // Autores corporativos ou entre chaves duplas
    if (limpo.startsWith('{') && limpo.endsWith('}')) {
        return limpo.replace(/^\{+|\}+$/g, '').toUpperCase();
    }

    // Se já contém vírgula: "Sobrenome, Nome" ou "Sobrenome, Jr., Nome"
    if (limpo.includes(',')) {
        const pedacos = limpo.split(',').map(p => p.trim()).filter(Boolean);
        if (pedacos.length === 2) {
            let [ultimo, prenomes] = pedacos;
            const partesUltimo = ultimo.split(' ');
            if (partesUltimo.length > 1 && PREPOSICOES_NOME.has(partesUltimo[0].toLowerCase())) {
                const prep = partesUltimo[0];
                const sob = partesUltimo.slice(1).join(' ');
                return `${sob.toUpperCase()}, ${prenomes} ${prep}`;
            }
            return `${ultimo.toUpperCase()}, ${prenomes}`;
        } else if (pedacos.length >= 3) {
            // Ex: "Silva, Júnior, João" -> "SILVA JÚNIOR, João"
            const [ultimo, sufixo, ...resto] = pedacos;
            return `${ultimo.toUpperCase()} ${sufixo.toUpperCase()}, ${resto.join(' ')}`;
        }
    }

    // "Nome Prenome Sobrenome [Sufixo]"
    const palavras = limpo.split(' ');
    if (palavras.length === 1) {
        return palavras[0].toUpperCase();
    }

    const ultima = palavras[palavras.length - 1];
    const ultimaNorm = ultima.toLowerCase().replace(/\.$/, '');

    if (SUFIXOS_AGNOTICOS.has(ultimaNorm) && palavras.length >= 3) {
        const penultima = palavras[palavras.length - 2];
        const prenomes = palavras.slice(0, palavras.length - 2).join(' ');
        return `${penultima.toUpperCase()} ${ultima.toUpperCase()}, ${prenomes}`;
    }

    if (palavras.length >= 3 && PREPOSICOES_NOME.has(palavras[palavras.length - 2].toLowerCase())) {
        const sobrenome = palavras[palavras.length - 1];
        const prep = palavras[palavras.length - 2];
        const prenomes = palavras.slice(0, palavras.length - 2).join(' ');
        return `${sobrenome.toUpperCase()}, ${prenomes} ${prep}`;
    }

    const sobrenome = palavras[palavras.length - 1];
    const prenomes = palavras.slice(0, palavras.length - 1).join(' ');
    return `${sobrenome.toUpperCase()}, ${prenomes}`;
}

/**
 * Processa a lista de autores segundo a NBR 6023:
 * - Até 3 autores: separados por ponto e vírgula (; )
 * - Mais de 3 autores: primeiro autor seguido de et al.
 * - Caso editor/organizer: adiciona (ed.) ou (org.)
 * @param {string} autoresStr 
 * @param {number} limite 
 * @returns {string}
 */
export function formatarAutoresAbnt(autoresStr, limite = 3) {
    if (!autoresStr) return '';
    const lista = autoresStr
        .split(/\s+and\s+/i)
        .map(a => formatarNomeAutorAbnt(a))
        .filter(Boolean);

    if (lista.length === 0) return '';
    if (lista.length <= limite) {
        return lista.join('; ');
    }
    return `${lista[0]} et al.`;
}

// ── Formatador Principal de Entrada ABNT NBR 6023:2018 ────────────────────────

/**
 * Representa os componentes formatados de uma referência para renderização em qualquer formato.
 * @typedef {Object} ReferenciaFormatada
 * @property {string} autor - Autoria formatada
 * @property {string} tituloPrincipal - Título principal (recebe destaque em negrito)
 * @property {string} subtitulo - Subtítulo complementar (sem destaque)
 * @property {string} inTitulo - Se incollection/inproceedings: título da obra coletiva em destaque
 * @property {string} inSubtitulo - Subtítulo da obra coletiva
 * @property {string} inAutores - Autores/organizadores da obra coletiva
 * @property {string} revista - Se artigo: nome do periódico (recebe destaque)
 * @property {string} complemento - Edição, local, editora, volume, páginas, etc.
 * @property {string} link - URL / DOI
 * @property {string} chave - Chave BibTeX original para ordenação
 * @property {string} ano - Ano de publicação
 */

export function decomporEntradaAbnt(entry) {
    const tipo = (entry._tipo || 'misc').toLowerCase();

    // 1. Autoria principal
    let autorTexto = '';
    let ehOrganizador = false;

    if (entry.author) {
        autorTexto = formatarAutoresAbnt(entry.author);
    } else if (entry.editor) {
        autorTexto = `${formatarAutoresAbnt(entry.editor)} (org.)`;
        ehOrganizador = true;
    } else if (entry.organization) {
        autorTexto = entry.organization.trim().toUpperCase();
    }

    // 2. Título e subtítulo
    const tituloCompleto = entry.title || '';
    let tituloPrincipal = tituloCompleto;
    let subtitulo = '';

    const idxDoisPontos = tituloCompleto.indexOf(':');
    if (idxDoisPontos > 0) {
        tituloPrincipal = tituloCompleto.substring(0, idxDoisPontos).trim();
        subtitulo = tituloCompleto.substring(idxDoisPontos + 1).trim();
    }

    // Se não houver autor, a primeira palavra do título vai em maiúsculas na ordenação ABNT
    if (!autorTexto && tituloPrincipal) {
        const palavras = tituloPrincipal.split(' ');
        const primeira = palavras[0].toUpperCase();
        tituloPrincipal = [primeira, ...palavras.slice(1)].join(' ');
    }

    // 3. Informações de publicação
    const ano = entry.year ? entry.year.trim() : '';
    const local = entry.address || entry.location || '';
    const editora = entry.publisher || entry.school || entry.institution || '';
    const edicao = entry.edition ? (entry.edition.match(/^\d+$/) ? `${entry.edition}. ed.` : entry.edition) : '';
    const volume = entry.volume ? `v. ${entry.volume}` : '';
    const numero = entry.number ? `n. ${entry.number}` : '';
    const paginas = entry.pages ? (entry.pages.includes('-') ? `p. ${entry.pages.replace(/-+/g, '–')}` : `p. ${entry.pages}`) : '';
    const serie = entry.series ? `(${entry.series}${entry.volume ? `, ${entry.volume}` : ''})` : '';

    let url = entry.url || '';
    if (!url && entry.doi) {
        url = entry.doi.startsWith('http') ? entry.doi : `https://doi.org/${entry.doi}`;
    }
    const acessoEm = entry.urldate || entry.access;

    // Componentes para retorno
    const resultado = {
        tipo,
        chave: entry._chave || '',
        autor: autorTexto,
        tituloPrincipal,
        subtitulo,
        inAutores: '',
        inTitulo: '',
        inSubtitulo: '',
        revista: '',
        complemento: '',
        link: url,
        acessoEm,
        ano
    };

    if (tipo === 'article') {
        // Artigo: Nome do periódico fica em negrito!
        resultado.revista = entry.journal || entry.journaltitle || '';
        const partesComp = [
            local,
            volume,
            numero,
            paginas,
            ano
        ].filter(Boolean);
        resultado.complemento = partesComp.join(', ');
    } else if (tipo === 'incollection' || tipo === 'inbook' || tipo === 'inproceedings' || tipo === 'conference') {
        // Capítulo de livro ou anais: Título do livro/anais fica em negrito
        if (entry.editor) {
            resultado.inAutores = `${formatarAutoresAbnt(entry.editor)} (org.)`;
        }
        const obraCompleta = entry.booktitle || entry.maintitle || '';
        const idxObra = obraCompleta.indexOf(':');
        if (idxObra > 0) {
            resultado.inTitulo = obraCompleta.substring(0, idxObra).trim();
            resultado.inSubtitulo = obraCompleta.substring(idxObra + 1).trim();
        } else {
            resultado.inTitulo = obraCompleta;
        }

        const pub = [local, editora].filter(Boolean).join(': ');
        const partesComp = [
            edicao,
            pub,
            ano,
            volume,
            paginas
        ].filter(Boolean);
        resultado.complemento = partesComp.join(', ');
    } else if (tipo === 'phdthesis' || tipo === 'mastersthesis' || tipo === 'thesis') {
        // Tese / Dissertação
        const grau = tipo === 'phdthesis' ? 'Tese (Doutorado em Linguística)' : 'Dissertação (Mestrado em Linguística)';
        const inst = [editora, local].filter(Boolean).join(', ');
        const partesComp = [
            ano ? `${ano}.` : '',
            entry.pages ? `${entry.pages} f.` : '',
            `${grau} – ${inst || 'Universidade'}`,
            ano
        ].filter(Boolean);
        resultado.complemento = partesComp.join(' ');
    } else {
        // Livro ou Misc
        const pub = [local, editora].filter(Boolean).join(': ');
        const partesComp = [
            edicao,
            pub,
            ano,
            volume,
            paginas,
            serie
        ].filter(Boolean);
        resultado.complemento = partesComp.join(', ');
    }

    return resultado;
}

// ── Renderizadores por Formato ────────────────────────────────────────────────

function escaparHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escaparTypst(str) {
    if (!str) return '';
    return str
        .replace(/\\/g, '\\\\')
        .replace(/([#$*_[\]@`])/g, '\\$1');
}

/**
 * Formata um registro decomposto para HTML (com <strong> no item de destaque).
 * @param {ReferenciaFormatada} d 
 * @returns {string} <li> formatado
 */
export function formatarReferenciaHtml(d) {
    const segmentos = [];

    if (d.autor) {
        const aut = d.autor.trim().replace(/\.+$/, '');
        segmentos.push(`${escaparHtml(aut)}.`);
    }

    if (d.tipo === 'article') {
        // Artigo: Título normal, Revista em negrito
        const tit = [d.tituloPrincipal, d.subtitulo].filter(Boolean).join(': ');
        segmentos.push(`${escaparHtml(tit)}.`);
        if (d.revista) {
            segmentos.push(`<strong>${escaparHtml(d.revista)}</strong>${d.complemento ? ',' : '.'}`);
        }
        if (d.complemento) {
            segmentos.push(`${escaparHtml(d.complemento)}.`);
        }
    } else if (d.inTitulo) {
        // Incollection: Título do capítulo normal, In: Organizador. Obra (em negrito)
        const titCap = [d.tituloPrincipal, d.subtitulo].filter(Boolean).join(': ');
        segmentos.push(`${escaparHtml(titCap)}.`);

        const parteIn = ['<em>In</em>:'];
        if (d.inAutores) parteIn.push(`${escaparHtml(d.inAutores)}.`);
        const inTitFormatado = `<strong>${escaparHtml(d.inTitulo)}</strong>` + (d.inSubtitulo ? `: ${escaparHtml(d.inSubtitulo)}` : '');
        parteIn.push(`${inTitFormatado}.`);
        if (d.complemento) parteIn.push(`${escaparHtml(d.complemento)}.`);
        segmentos.push(parteIn.join(' '));
    } else {
        // Livro, Tese ou Misc: Título principal em negrito, subtítulo sem negrito
        const titFormatado = `<strong>${escaparHtml(d.tituloPrincipal)}</strong>` + (d.subtitulo ? `: ${escaparHtml(d.subtitulo)}` : '');
        segmentos.push(`${titFormatado}.`);
        if (d.complemento) {
            segmentos.push(`${escaparHtml(d.complemento)}.`);
        }
    }

    if (d.link) {
        const linkFormatado = `Disponível em: &lt;<a href="${escaparHtml(d.link)}" target="_blank" rel="noopener">${escaparHtml(d.link)}</a>&gt;.`;
        const acessoFormatado = d.acessoEm ? ` Acesso em: ${escaparHtml(d.acessoEm)}.` : '';
        segmentos.push(`${linkFormatado}${acessoFormatado}`);
    }

    return `<p class="referencia-item">${segmentos.join(' ')}</p>`;
}

/**
 * Formata um registro decomposto para sintaxe Typst.
 * @param {ReferenciaFormatada} d 
 * @returns {string} Código Typst com parágrafo suspenso
 */
export function formatarReferenciaTypst(d) {
    const segmentos = [];

    if (d.autor) {
        const aut = d.autor.trim().replace(/\.+$/, '');
        segmentos.push(`${escaparTypst(aut)}.`);
    }

    if (d.tipo === 'article') {
        const tit = [d.tituloPrincipal, d.subtitulo].filter(Boolean).join(': ');
        segmentos.push(`${escaparTypst(tit)}.`);
        if (d.revista) {
            segmentos.push(`*${escaparTypst(d.revista)}*${d.complemento ? ',' : '.'}`);
        }
        if (d.complemento) {
            segmentos.push(`${escaparTypst(d.complemento)}.`);
        }
    } else if (d.inTitulo) {
        const titCap = [d.tituloPrincipal, d.subtitulo].filter(Boolean).join(': ');
        segmentos.push(`${escaparTypst(titCap)}.`);

        const parteIn = ['_In_:'];
        if (d.inAutores) parteIn.push(`${escaparTypst(d.inAutores)}.`);
        const inTitFormatado = `*${escaparTypst(d.inTitulo)}*` + (d.inSubtitulo ? `: ${escaparTypst(d.inSubtitulo)}` : '');
        parteIn.push(`${inTitFormatado}.`);
        if (d.complemento) parteIn.push(`${escaparTypst(d.complemento)}.`);
        segmentos.push(parteIn.join(' '));
    } else {
        const titFormatado = `*${escaparTypst(d.tituloPrincipal)}*` + (d.subtitulo ? `: ${escaparTypst(d.subtitulo)}` : '');
        segmentos.push(`${titFormatado}.`);
        if (d.complemento) {
            segmentos.push(`${escaparTypst(d.complemento)}.`);
        }
    }

    if (d.link) {
        const linkFormatado = `Disponível em: <${escaparTypst(d.link)}>.`;
        const acessoFormatado = d.acessoEm ? ` Acesso em: ${escaparTypst(d.acessoEm)}.` : '';
        segmentos.push(`${linkFormatado}${acessoFormatado}`);
    }

    return `#par(hanging-indent: 1.5em)[${segmentos.join(' ')}]\n#v(0.6em)`;
}

/**
 * Formata um registro decomposto para texto puro (sem formatação HTML/Typst).
 * Usado pelo aplicativo nativo Android e prévias de texto.
 * @param {ReferenciaFormatada} d 
 * @returns {string}
 */
export function formatarReferenciaTexto(d) {
    const segmentos = [];

    if (d.autor) {
        const aut = d.autor.trim().replace(/\.+$/, '');
        segmentos.push(`${aut}.`);
    }

    if (d.tipo === 'article') {
        const tit = [d.tituloPrincipal, d.subtitulo].filter(Boolean).join(': ');
        segmentos.push(`${tit}.`);
        if (d.revista) {
            segmentos.push(`${d.revista}${d.complemento ? ',' : '.'}`);
        }
        if (d.complemento) {
            segmentos.push(`${d.complemento}.`);
        }
    } else if (d.inTitulo) {
        const titCap = [d.tituloPrincipal, d.subtitulo].filter(Boolean).join(': ');
        segmentos.push(`${titCap}.`);

        const parteIn = ['In:'];
        if (d.inAutores) parteIn.push(`${d.inAutores}.`);
        const inTit = [d.inTitulo, d.inSubtitulo].filter(Boolean).join(': ');
        parteIn.push(`${inTit}.`);
        if (d.complemento) parteIn.push(`${d.complemento}.`);
        segmentos.push(parteIn.join(' '));
    } else {
        const tit = [d.tituloPrincipal, d.subtitulo].filter(Boolean).join(': ');
        segmentos.push(`${tit}.`);
        if (d.complemento) {
            segmentos.push(`${d.complemento}.`);
        }
    }

    if (d.link) {
        const linkFormatado = `Disponível em: <${d.link}>.`;
        const acessoFormatado = d.acessoEm ? ` Acesso em: ${d.acessoEm}.` : '';
        segmentos.push(`${linkFormatado}${acessoFormatado}`);
    }

    return segmentos.join(' ');
}

// ── Ponto de Entrada Principal: renderizarReferenciasAbnt ──────────────────────

/**
 * Processa uma string BibTeX completa e gera o resultado pronto para o formato solicitado.
 * As referências são ordenadas alfabeticamente segundo as normas ABNT.
 *
 * @param {string} conteudoBib - Conteúdo textual do arquivo .bib
 * @param {'html' | 'typst' | 'texto'} formato - Formato de saída
 * @returns {string | Array<string>} Saída formatada
 */
export function renderizarReferenciasAbnt(conteudoBib, formato = 'html') {
    if (!conteudoBib || !conteudoBib.trim()) {
        return formato === 'texto' ? [] : '';
    }

    const entradas = parseBibtex(conteudoBib);
    if (!entradas || entradas.length === 0) {
        return formato === 'texto' ? [] : '';
    }

    // Decompõe e aplica regras ABNT
    const decompostas = entradas.map(decomporEntradaAbnt);

    // Ordenação alfabética por autor (ou título principal se sem autor) e ano
    decompostas.sort((a, b) => {
        const chaveA = (a.autor || a.tituloPrincipal || '').toLowerCase();
        const chaveB = (b.autor || b.tituloPrincipal || '').toLowerCase();
        const cmp = chaveA.localeCompare(chaveB, 'pt-BR');
        if (cmp !== 0) return cmp;
        return (a.ano || '').localeCompare(b.ano || '');
    });

    if (formato === 'html') {
        return decompostas.map(formatarReferenciaHtml).join('\n\n');
    }

    if (formato === 'typst') {
        return decompostas.map(formatarReferenciaTypst).join('\n');
    }

    if (formato === 'texto') {
        return decompostas.map(formatarReferenciaTexto);
    }

    throw new Error(`Formato de bibliografia desconhecido: ${formato}`);
}

export default {
    limparLatex,
    parseBibtex,
    formatarNomeAutorAbnt,
    formatarAutoresAbnt,
    decomporEntradaAbnt,
    formatarReferenciaHtml,
    formatarReferenciaTypst,
    formatarReferenciaTexto,
    renderizarReferenciasAbnt
};
