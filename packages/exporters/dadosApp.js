// Contrato de dados com o app Android nativo (android-template-nativo/), versão 1.
//
//   assets/dados.json   → montarDadosApp(): as entradas, no formato de Dados.kt
//   assets/config.json  → montarConfigApp(): nome, créditos, introdução, citação e cores do tema
//
// As entradas de entrada são as mesmas que vão para o HTML (extrairDadosEntrada em
// exportadorBase.js, já com os caminhos de mídia relativos: "audio/x.mp3", "foto/y.jpg"...).
// Só funções puras: o mesmo módulo serve ao gerador no navegador e aos testes em Node.

export const VERSAO_DADOS_APP = 1;

const texto = (v) => (v === undefined || v === null) ? '' : String(v).trim();
const lista = (v) => Array.isArray(v) ? v : [];

// "a ~ b ~ c" → ['a', 'b', 'c'] (separador usado em AUDIO / AUDIO_TIPOS)
const separar = (v) => texto(v) ? texto(v).split(/\s*~\s*/) : [];

const EXT_VIDEO = /\.(mp4|webm|mov|m4v|mkv|ogv|avi)$/i;

// Pronúncia com vários arquivos na mesma célula ("x.mp3|x.mp4"): o sistema só separa o "|"
// quando o termo também tem variações, então o caminho chega inteiro (e com a pasta do
// primeiro arquivo). Cada arquivo vira uma pronúncia, com a pasta e o tipo pela extensão.
function pronuncias(arquivo, tipo) {
    if (!arquivo.includes('|')) return [{ arquivo, tipo }];
    return arquivo.split('|').map(p => p.trim()).filter(Boolean).map(p => {
        const nome = p.split('/').pop();
        const ehVideo = EXT_VIDEO.test(nome);
        return { arquivo: `${ehVideo ? 'video' : 'audio'}/${nome}`, tipo: ehVideo ? 'video' : 'audio' };
    });
}

function converterTexto(t) {
    const frases = [];
    for (const variacao of lista(t.VARIACOES)) {
        for (const f of lista(variacao.FRASES)) {
            if (texto(f.ORIGINAL) || texto(f.TRADUCAO)) frases.push({ original: texto(f.ORIGINAL), traducao: texto(f.TRADUCAO) });
        }
    }
    return {
        titulo: texto(t.TITULO_EXIBICAO) || texto(t.TITULO_BASE),
        naoLiteral: texto(t.TEXTO_NAO_LITERAL),
        frases,
    };
}

function converterEntrada(e, indice) {
    const audios = separar(e.AUDIO);
    const tipos = separar(e.AUDIO_TIPOS);
    // Subcampos por posição (SUB_CAMPO_SEMANTICO, _1 … _6), como o HTML compara nível a nível
    // ao montar os títulos dos grupos; só as posições vazias no fim são cortadas.
    const subcategorias = ['SUB_CAMPO_SEMANTICO', ...[1, 2, 3, 4, 5, 6].map(n => `SUB_CAMPO_SEMANTICO_${n}`)].map(k => texto(e[k]));
    while (subcategorias.length && !subcategorias[subcategorias.length - 1]) subcategorias.pop();
    return {
        id: texto(e.ID) || String(indice + 1),
        termo: texto(e.TERMO),
        classe: texto(e.CLASSE),
        categoria: texto(e.CAMPO_SEMANTICO),
        subcategoria: subcategorias.find(Boolean) || '',
        subcategorias,
        fonemica: texto(e.FONEMICA),
        fonetica: texto(e.FONETICA),
        pronuncias: audios.flatMap((arquivo, i) => pronuncias(arquivo, tipos[i] === 'video' ? 'video' : 'audio')).filter(p => p.arquivo),
        relacionados: texto(e.ITENS_RELACIONADOS),
        acepcoes: lista(e.SIGNIFICADOS).map(s => ({
            numero: texto(s.NUMERO),
            traducao: texto(s.TRADUCAO),
            descricao: texto(s.DESCRICAO),
            exemplos: lista(s.EXEMPLOS).map(x => ({ texto: texto(x.TRANS), traducao: texto(x.TRAD), audio: texto(x.AUDIO) }))
                .filter(x => x.texto || x.traducao || x.audio),
            imagens: lista(s.IMAGENS).map(i => ({ arquivo: texto(i.ARQUIVO), legenda: texto(i.LEGENDA) })).filter(i => i.arquivo),
            videos: lista(s.VIDEOS).map(v => texto(v.ARQUIVO)).filter(Boolean),
            extras: lista(s.EXTRAS).map(x => texto(x.TEXTO)).filter(Boolean),
            textos: lista(s.TEXTOS_ESTRUTURADOS).map(converterTexto),
        })),
    };
}

/**
 * @param {Array<object>} entradas - entradas convertidas por extrairDadosEntrada (com ID)
 * @returns {{ versao: number, entradas: Array<object> }}
 */
export function montarDadosApp(entradas) {
    const convertidas = entradas.map(converterEntrada);
    // IDs repetidos quebrariam a lista do app (chaves únicas): o repetido ganha sufixo
    const vistos = new Set();
    for (const e of convertidas) {
        let id = e.id;
        for (let n = 2; vistos.has(id); n++) id = `${e.id}-${n}`;
        e.id = id;
        vistos.add(id);
    }
    // Ordem alfabética do termo, como a lista do app
    convertidas.sort((a, b) => a.termo.localeCompare(b.termo, 'pt-BR', { sensitivity: 'base' }));
    return { versao: VERSAO_DADOS_APP, entradas: convertidas };
}

// Variáveis CSS do tema do projeto (coletarTemaExportacao em index.html) → nomes do config.json
const CORES = {
    primaria: '--cor-primaria',
    primariaHover: '--cor-primaria-hover',
    primariaClara: '--cor-primaria-light',
    contraste: '--cor-primaria-contraste',
    fundo: '--cor-fundo',
    fundo2: '--cor-fundo-2',
    superficie: '--cor-superficie',
    superficie2: '--cor-superficie-2',
    texto: '--cor-texto',
    textoSecundario: '--cor-texto-secundario',
    borda: '--cor-borda',
    bordaForte: '--cor-borda-forte',
    acento: '--cor-acento',
    acentoForte: '--cor-acento-forte',
    acentoClaro: '--cor-acento-light',
    perigo: '--cor-perigo',
};

function converterCores(vars) {
    const cores = {};
    if (!vars) return cores;
    for (const [nome, variavel] of Object.entries(CORES)) {
        const valor = texto(vars[variavel]);
        if (/^(#([0-9a-f]{3}|[0-9a-f]{6})|rgba?\([\d.,\s%]+\))$/i.test(valor)) cores[nome] = valor;
    }
    return cores;
}

/**
 * @param {{ tituloHtml?: string, autor?: string, versao?: string, ano?: string, introHtml?: string,
 *           referencia?: string, tema?: { light?: object, dark?: object } }} meta - coletarMetadadosExportacao()
 */
export function montarConfigApp(meta = {}) {
    const nome = texto(meta.tituloHtml) || 'Dicionário';
    const autor = texto(meta.autor);
    const versaoApp = texto(meta.versao);
    const ano = texto(meta.ano);
    const versaoCitacao = [versaoApp && `Versão ${versaoApp}`, ano].filter(Boolean).join(', ');
    return {
        versao: VERSAO_DADOS_APP,
        nome,
        autor,
        versaoApp,
        ano,
        introducao: texto(meta.introHtml),
        referencias: texto(meta.referencia).split(/\r?\n/).map(l => l.trim()).filter(Boolean),
        citacao: [autor && `${autor}.`, `${nome}.`, versaoCitacao && `${versaoCitacao}.`].filter(Boolean).join(' '),
        tema: {
            claro: converterCores(meta.tema && meta.tema.light),
            escuro: converterCores(meta.tema && meta.tema.dark),
        },
    };
}
