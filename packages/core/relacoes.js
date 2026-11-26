// ============================================
// RELAÇÕES ENTRE ENTRADAS (coluna ITENS_RELACIONADOS)
// ============================================
// Formato combinado com o TRATAR MÍDIAS (ESPECIFICACAO_PLANILHA.md, itens 4 a 6, no repositório
// Tratar-Midias; lá, app/services/relacoes_service.py tem as mesmas regras de leitura):
// - cada linha da planilha tem um ID fixo na coluna ID: "e" + 6 caracteres sem 0 o 1 l i;
// - ITENS_RELACIONADOS tem itens separados por |, cada um "tipo:ID", "ID" (= "veja") ou texto livre;
// - a relação fica gravada numa linha só; o outro lado é montado aqui (rótulo do outro lado);
// - os tipos são os sugeridos mais os do relacoes.txt da pasta, que pode trocar rótulos.
// Só funções puras: sem DOM, para poder ser testado em Node.

export const PADRAO_ID = /^e[23456789abcdefghjkmnpqrstuvwxyz]{6}$/;
const PADRAO_ITEM = /^([a-z][a-z0-9_]*)\s*:\s*(\S+)$/;
const PADRAO_CODIGO = /^[a-z][a-z0-9_]*$/;

export const TIPO_SEM_CODIGO = 'veja';

// código, rótulo, rótulo do outro lado (null = igual nos dois sentidos).
// O rótulo se lê "esta entrada <rótulo> a outra".
export const TIPOS_SUGERIDOS = [
    ['veja', 'Veja também', null],
    ['sinonimo', 'Sinônimo de', null],
    ['antonimo', 'Antônimo de', null],
    ['nao_confundir', 'Não confundir com', null],
    ['forma_variante', 'Forma variante de', 'Formas variantes'],
    ['derivado', 'Derivado de', 'Derivados'],
    ['diminutivo', 'Diminutivo de', 'Diminutivos'],
    ['composto', 'Forma parte do composto', 'Componentes'],
    ['tipo_de', 'É um tipo de', 'Tipos'],
    ['parte_de', 'Parte de', 'Partes'],
].map(([codigo, rotulo, inverso]) => ({ codigo, rotulo, inverso, simetrica: inverso === null, origem: 'sugerido' }));

export function ehId(texto) {
    return PADRAO_ID.test(String(texto ?? '').trim());
}

/**
 * Itens da célula ITENS_RELACIONADOS, na ordem.
 * {tipo, id, texto} para uma relação; {texto} para texto livre;
 * {texto, parece} quando o item tem a forma tipo:algo mas "algo" não é um ID.
 */
export function lerItens(valor) {
    const itens = [];
    String(valor ?? '').split('|').forEach(parte => {
        const texto = parte.trim();
        if (!texto || texto.toLowerCase() === 'nan') return;
        if (ehId(texto)) {
            itens.push({ tipo: TIPO_SEM_CODIGO, id: texto, texto });
            return;
        }
        const m = texto.match(PADRAO_ITEM);
        if (m && ehId(m[2])) itens.push({ tipo: m[1], id: m[2], texto });
        else if (m) itens.push({ texto, parece: m[1] });
        else itens.push({ texto });
    });
    return itens;
}

/**
 * Tipos de relação: os sugeridos, somados aos do relacoes.txt (que pode sobrescrever rótulos).
 * Cada linha: "código = rótulo | rótulo do outro lado" (sem "|" = igual nos dois sentidos);
 * "#" inicia comentário. Linhas inválidas viram avisos e são ignoradas.
 * @returns {{tipos: Array<object>, avisos: string[]}}
 */
export function interpretarRelacoesTxt(conteudo, nomeArquivo = 'relacoes.txt') {
    const tipos = new Map(TIPOS_SUGERIDOS.map(t => [t.codigo, { ...t }]));
    const avisos = [];
    String(conteudo ?? '').split(/\r?\n/).forEach((bruta, i) => {
        const linha = bruta.trim();
        if (!linha || linha.startsWith('#')) return;
        const n = i + 1;
        const igual = linha.indexOf('=');
        if (igual < 0) {
            avisos.push(`${nomeArquivo}, linha ${n}: falta o “=” (use código = rótulo).`);
            return;
        }
        const codigo = linha.slice(0, igual).trim();
        if (!PADRAO_CODIGO.test(codigo)) {
            avisos.push(`${nomeArquivo}, linha ${n}: código “${codigo}” inválido — use letras minúsculas sem acento, números e _, começando por letra.`);
            return;
        }
        const resto = linha.slice(igual + 1);
        const barra = resto.indexOf('|');
        const rotulo = (barra < 0 ? resto : resto.slice(0, barra)).trim();
        const inverso = barra < 0 ? '' : resto.slice(barra + 1).trim();
        if (!rotulo) {
            avisos.push(`${nomeArquivo}, linha ${n}: falta o rótulo de “${codigo}”.`);
            return;
        }
        tipos.set(codigo, { codigo, rotulo, inverso: inverso || null, simetrica: !inverso, origem: 'arquivo' });
    });
    return { tipos: [...tipos.values()], avisos };
}

/**
 * Liga as relações das linhas às entradas do banco (depois do agrupamento em entradas).
 * Em cada entrada: RELACOES_SAIDA [{tipo, alvo}] (gravadas nela) e RELACOES_ENTRADA [{tipo, origem}]
 * (gravadas em outra entrada e apontando para ela); `alvo`/`origem` são IDs de entrada (ENT_…).
 * Usa os campos que o construtor junta de todas as linhas da entrada: _IDS_LINHAS e _ITENS_LINHAS.
 * Relações com um ID que não existe e com outra acepção da mesma entrada são descartadas.
 * @returns {string[]} avisos
 */
export function ligarRelacoes(entradas) {
    const avisos = [];
    const entradaDaLinha = new Map();
    for (const entrada of Object.values(entradas)) {
        for (const id of entrada._IDS_LINHAS || []) {
            if (!entradaDaLinha.has(id)) entradaDaLinha.set(id, entrada.ID);
            else if (entradaDaLinha.get(id) !== entrada.ID) avisos.push(`ID ${id} repetido em mais de uma entrada; vale a primeira.`);
        }
        entrada.RELACOES_SAIDA = [];
        entrada.RELACOES_ENTRADA = [];
        entrada.RELACOES_TEXTO = [];
    }
    for (const entrada of Object.values(entradas)) {
        const vistas = new Set();
        for (const item of entrada._ITENS_LINHAS || []) {
            if (!item.id) {
                if (!entrada.RELACOES_TEXTO.includes(item.texto)) entrada.RELACOES_TEXTO.push(item.texto);
                continue;
            }
            const alvo = entradaDaLinha.get(item.id);
            if (!alvo) {
                avisos.push(`“${entrada._TERMO_PRINCIPAL}”: relação com um ID que não existe (${item.texto}); omitida.`);
                continue;
            }
            if (alvo === entrada.ID) continue; // outra acepção da mesma entrada
            const chave = `${item.tipo}>${alvo}`;
            if (vistas.has(chave)) continue;
            vistas.add(chave);
            entrada.RELACOES_SAIDA.push({ tipo: item.tipo, alvo });
            entradas[alvo].RELACOES_ENTRADA.push({ tipo: item.tipo, origem: entrada.ID });
        }
    }
    return avisos;
}

/**
 * Grupos de relações de uma entrada para os templates, na ordem dos tipos:
 * [{ROTULO, ITENS: [{TERMO, ALVO, SEM_ALVO, VIRGULA}], SEP}].
 * As gravadas na entrada usam o rótulo; as que outras entradas gravaram, o rótulo do outro lado
 * (o próprio rótulo, se a relação é simétrica). Uma relação simétrica gravada nos dois lados
 * aparece uma vez. Textos livres antigos vão para "Veja também", sem link.
 * `escapar` trata o texto para o formato de saída (HTML, Typst, LaTeX).
 */
export function gruposDeRelacoes(entrada, entradas, tipos, escapar = (t) => t) {
    const porCodigo = new Map((tipos && tipos.length ? tipos : TIPOS_SUGERIDOS).map(t => [t.codigo, t]));
    const ordemTipos = [...porCodigo.keys()];
    const grupos = new Map(); // chave "codigo>saida|entrada" -> {rotulo, itens: [{termo, alvo}]}

    const termo = (id) => (entradas[id] && entradas[id]._TERMO_PRINCIPAL) || '';
    const grupo = (codigo, sentido) => {
        const tipo = porCodigo.get(codigo);
        const simetrica = !tipo || tipo.simetrica;
        // simétrica: os dois sentidos dividem o mesmo grupo
        const chave = `${codigo}>${simetrica ? 'saida' : sentido}`;
        if (!grupos.has(chave)) {
            const rotulo = !tipo ? codigo : (sentido === 'entrada' && !simetrica ? tipo.inverso : tipo.rotulo);
            grupos.set(chave, { codigo, sentido: simetrica ? 'saida' : sentido, rotulo, itens: [] });
        }
        return grupos.get(chave);
    };
    const incluir = (g, alvo) => {
        if (!g.itens.some(i => i.alvo === alvo)) g.itens.push({ termo: termo(alvo), alvo });
    };

    (entrada.RELACOES_SAIDA || []).forEach(r => incluir(grupo(r.tipo, 'saida'), r.alvo));
    (entrada.RELACOES_ENTRADA || []).forEach(r => incluir(grupo(r.tipo, 'entrada'), r.origem));
    const textos = entrada.RELACOES_TEXTO || [];
    if (textos.length) {
        const g = grupo(TIPO_SEM_CODIGO, 'saida');
        textos.forEach(t => g.itens.push({ termo: t, alvo: '' }));
    }

    const posicao = (g) => {
        const k = ordemTipos.indexOf(g.codigo);
        return (k < 0 ? ordemTipos.length : k) * 2 + (g.sentido === 'entrada' ? 1 : 0);
    };
    return [...grupos.values()]
        .filter(g => g.itens.length)
        .sort((a, b) => posicao(a) - posicao(b))
        .map((g, k) => ({
            ROTULO: escapar(g.rotulo),
            SEP: k > 0 ? '; ' : '',
            ITENS: g.itens.map((item, i) => ({
                TERMO: escapar(item.termo),
                ALVO: item.alvo,
                SEM_ALVO: item.alvo ? '' : true,
                VIRGULA: i < g.itens.length - 1 ? ', ' : '',
            })),
        }));
}

/**
 * Texto das relações, para templates antigos ({{ ITENS_RELACIONADOS }}) e para o app nativo.
 * Só texto livre (nenhuma relação com ID): os itens como estão, como antes.
 * Com relações: "Sinônimo de: a, b · Formas variantes: c · Veja também: d".
 */
export function textoDasRelacoes(grupos) {
    if (!grupos.length) return '';
    const soTexto = grupos.every(g => g.ITENS.every(i => !i.ALVO));
    if (soTexto) return grupos.flatMap(g => g.ITENS.map(i => i.TERMO)).join(', ');
    return grupos.map(g => `${g.ROTULO}: ${g.ITENS.map(i => i.TERMO).join(', ')}`).join(' · ');
}
