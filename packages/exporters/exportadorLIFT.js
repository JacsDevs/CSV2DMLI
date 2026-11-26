import ExportadorBase from './exportadorBase.js';
import { ehUrlRemota } from '../core/helpers.js';
import { TIPOS_SUGERIDOS } from '../core/relacoes.js';

// ============================================
// EXPORTAÇÃO LIFT 0.13 PARA IMPORTAR NO FLEx
// ============================================
// dicionario.lift (entradas) + dicionario.lift-ranges (classes, domínios semânticos e tipos de relação)
// + audio/ e pictures/. Na importação LIFT, o FLEx copia sozinho as mídias dessas pastas para
// LinkedFiles (AudioVisual e Pictures): ver CopyPronunciationFile, CopyPicture e MergeInMultiString
// em LexTextControls.dll. O FLEx exige um guid em cada entrada para reconhecer reimportações.
// Línguas: `vernaculo` (termo, variantes, exemplos), `analise` (traduções e rótulos) e a língua
// de voz `vernaculo-Zxxx-x-audio` para o áudio dos exemplos.
// Só funções puras em gerarLift: sem DOM, para poder ser testado em Node.

export const PASTA_SOM_LIFT = 'audio';
export const PASTA_IMAGEM_LIFT = 'pictures';
export const NOME_LIFT = 'dicionario.lift';
export const NOME_RANGES_LIFT = 'dicionario.lift-ranges';

// Tipos de relação no FLEx (LexRefTypeTags.MappingTypes, SIL.LCModel.dll)
const TIPO_PAR_ENTRADAS = 6;              // kmtEntryPair: simétrica (sinônimo, veja também)
const TIPO_PAR_ASSIMETRICO_ENTRADAS = 7;  // kmtEntryAsymmetricPair: um rótulo de cada lado

/** Texto para conteúdo e atributos XML. Remove caracteres de controle, que o XML não aceita. */
export function escaparXml(valor) {
    return String(valor ?? '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const umaLinha = (valor) => String(valor ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim();

const SOBRESCRITOS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
    '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const PADRAO_HOMONIMO = /[⁰¹²³⁴-⁹]+$/;

/** Pronúncia sem os delimitadores da transcrição: "[ka.ʃi]" e "/kaʃi/" → "ka.ʃi" e "kaʃi". */
export function limparTranscricao(valor) {
    return umaLinha(valor).replace(/^\[(.*)\]$/, '$1').replace(/^\/(.*)\/$/, '$1').trim();
}

/** Separa o número sobrescrito que o construtor acrescenta aos homônimos: "kaxi²" → {termo: "kaxi", homonimo: "2"}. */
export function separarHomonimo(termo) {
    const texto = String(termo ?? '').trim();
    const m = texto.match(PADRAO_HOMONIMO);
    if (!m) return { termo: texto, homonimo: '' };
    return { termo: texto.slice(0, -m[0].length).trim(), homonimo: [...m[0]].map(c => SOBRESCRITOS[c]).join('') };
}

/**
 * Coleta as mídias citadas na exportação: cada arquivo recebe um nome único dentro da sua pasta e
 * entra uma vez só em `midias`. Arquivos diferentes com o mesmo nome (pastas do CLDF) recebem sufixo.
 * URL remota ou arquivo fora do VFS contam em `ausentes` e devolvem null.
 * @param {object} opcoes
 * @param {boolean} [opcoes.incluirMidias=true]
 * @param {(tipo: string, nome: string) => string|null} [opcoes.chaveMidia] chave no VFS (null = ausente)
 * @param {(tipo: string) => string} pastaDoTipo pasta de destino no ZIP
 * @returns {{ registrar: (tipo: string, referencia: string) => {pasta: string, nome: string}|null,
 *             midias: Array<{tipo, nome, pasta, arquivo}>, ausentes: () => number }}
 */
export function criarColetorMidias(opcoes, pastaDoTipo) {
    const incluirMidias = opcoes.incluirMidias !== false;
    const chaveMidia = opcoes.chaveMidia || ((tipo, nome) => nome);
    const midias = [];
    const porArquivo = new Map();
    const nomesUsados = new Set();
    let ausentes = 0;
    const registrar = (tipo, referencia) => {
        if (!incluirMidias || !referencia) return null;
        if (ehUrlRemota(referencia)) { ausentes++; return null; }
        const chave = chaveMidia(tipo, referencia);
        if (chave === null || chave === undefined) { ausentes++; return null; }
        const id = `${tipo}:${chave}`;
        if (porArquivo.has(id)) return porArquivo.get(id);
        const pasta = pastaDoTipo(tipo);
        const base = String(chave).split(/[\/\\]/).pop();
        let nome = base;
        for (let n = 2; nomesUsados.has(`${pasta}/${nome}`.toLowerCase()); n++) {
            nome = base.replace(/(\.[^.]*)?$/, (ext) => `_${n}${ext || ''}`);
        }
        nomesUsados.add(`${pasta}/${nome}`.toLowerCase());
        const destino = { pasta, nome };
        porArquivo.set(id, destino);
        midias.push({ tipo, nome, pasta, arquivo: referencia });
        return destino;
    };
    return { registrar, midias, ausentes: () => ausentes };
}

/**
 * GUID determinístico a partir de um texto: a mesma entrada recebe o mesmo guid a cada exportação,
 * e o FLEx atualiza a entrada na reimportação em vez de duplicá-la. Não é criptográfico.
 */
export function guidDeterministico(texto) {
    const partes = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map(semente => {
        let h = semente >>> 0;
        for (const c of String(texto)) {
            h = Math.imul(h ^ c.codePointAt(0), 0x01000193) >>> 0;
            h = (h ^ (h >>> 15)) >>> 0;
        }
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
        return ((h ^ (h >>> 16)) >>> 0).toString(16).padStart(8, '0');
    }).join('');
    // versão 5 e variante RFC 4122, para o guid ser aceito como válido
    const hex = partes.slice(0, 12) + '5' + partes.slice(13, 16)
        + ((parseInt(partes[16], 16) & 0x3) | 0x8).toString(16) + partes.slice(17, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Chave estável da entrada: o ID fixo da primeira linha (coluna ID) ou, sem ele, termo, classe e tradução. */
function chaveEntrada(entrada, banco) {
    if (entrada._IDS_LINHAS && entrada._IDS_LINHAS.length) return entrada._IDS_LINHAS[0];
    const ac = (entrada.ACEPCOES || [])[0];
    const sig = ac && banco.significados ? banco.significados[ac.SIGNIFICADO_ID] : null;
    return ['csv2dmli', entrada._TERMO_PRINCIPAL, entrada.CLASSE_GRAMATICAL, sig ? sig.TRADUCAO : ''].join('|');
}

const forma = (lang, texto) => `<form lang="${escaparXml(lang)}"><text>${escaparXml(umaLinha(texto))}</text></form>`;

/**
 * Arquivos LIFT das `entradas` e a lista de mídias a copiar.
 * @param {object[]} entradas  entradas do banco, já filtradas e ordenadas
 * @param {object} banco       db (entradas, variacoes, significados, exemplos, imagens)
 * @param {object} opcoes
 * @param {string} opcoes.vernaculo        código da língua documentada (ex.: "kui")
 * @param {string} [opcoes.analise="pt"]   código da língua das traduções
 * @param {object[]} [opcoes.tiposRelacao] tipos de relação (GerenciadorDados.tiposRelacao)
 * @param {boolean} [opcoes.incluirMidias=true]
 * @param {(tipo: string, nome: string) => string|null} [opcoes.chaveMidia]
 * @returns {{ lift: string, ranges: string, midias: Array<{tipo, nome, pasta, arquivo}>, avisos: string[] }}
 */
export function gerarLift(entradas, banco, opcoes) {
    const vern = String(opcoes.vernaculo || '').trim();
    if (!vern) throw new Error('Código da língua vernácula não informado.');
    const anal = String(opcoes.analise || 'pt').trim();
    const voz = `${vern}-Zxxx-x-audio`;
    const tipos = new Map((opcoes.tiposRelacao && opcoes.tiposRelacao.length ? opcoes.tiposRelacao : TIPOS_SUGERIDOS).map(t => [t.codigo, t]));
    const avisos = [];
    const contagem = { videos: 0 };
    const coletor = criarColetorMidias(opcoes, tipo => tipo === 'imagem' ? PASTA_IMAGEM_LIFT : PASTA_SOM_LIFT);
    const midia = (tipo, referencia) => {
        const destino = coletor.registrar(tipo, referencia);
        return destino ? destino.nome : '';
    };

    // Identificadores de todas as entradas exportadas, para as relações
    const ids = new Map();
    for (const entrada of entradas) {
        const guid = guidDeterministico(chaveEntrada(entrada, banco));
        const { termo } = separarHomonimo(entrada._TERMO_PRINCIPAL);
        ids.set(entrada.ID, { guid, id: `${umaLinha(termo)}_${guid}` });
    }

    // Listas do .lift-ranges, montadas à medida que aparecem
    const classes = new Set();
    const dominios = new Map();           // id (caminho) -> { nome, pai }
    const tiposUsados = new Map();        // rótulo -> tipo
    let relacoesForaDaSelecao = 0;

    const registrarDominio = (caminho) => {
        let pai = '';
        caminho.forEach((nome, i) => {
            const id = caminho.slice(0, i + 1).join(' > ');
            if (!dominios.has(id)) dominios.set(id, { nome, pai });
            pai = id;
        });
        return pai;
    };

    const blocos = entradas.map(entrada => {
        const { guid, id } = ids.get(entrada.ID);
        const { termo, homonimo } = separarHomonimo(entrada._TERMO_PRINCIPAL);
        const linhas = [];
        linhas.push(`<entry id="${escaparXml(id)}" guid="${guid}"${homonimo ? ` order="${homonimo}"` : ''}>`);
        linhas.push(`<lexical-unit>${forma(vern, termo)}</lexical-unit>`);

        const variacoes = (entrada.VARIACOES_IDS || []).map(v => banco.variacoes && banco.variacoes[v]).filter(Boolean);
        const principal = variacoes[0];
        if (principal) {
            const pronuncia = limparTranscricao(principal.TRANSCRICAO_FONETICA || principal.TRANSCRICAO_FONEMICA);
            const som = principal.ARQUIVO_ENTRADA
                ? midia(principal.ARQUIVO_ENTRADA_TIPO === 'video' ? 'video' : 'audio', principal.ARQUIVO_ENTRADA) : '';
            if (pronuncia || som) {
                linhas.push('<pronunciation>' + (pronuncia ? forma(vern, pronuncia) : '')
                    + (som ? `<media href="${escaparXml(som)}"/>` : '') + '</pronunciation>');
            }
        }
        const vistas = new Set([termo]);
        variacoes.slice(1).forEach(v => {
            const variante = separarHomonimo(v.TRANSCRICAO_ORTOGRAFICA).termo;
            if (variante && !vistas.has(variante)) {
                vistas.add(variante);
                linhas.push(`<variant>${forma(vern, variante)}</variant>`);
            }
        });

        if (umaLinha(entrada.DESCRICAO_ENTRADA)) linhas.push(`<note>${forma(anal, entrada.DESCRICAO_ENTRADA)}</note>`);

        // Relações gravadas nesta entrada (o FLEx monta o outro lado), entre entradas
        const relacionados = new Set();
        (entrada.RELACOES_SAIDA || []).forEach(r => {
            const alvo = ids.get(r.alvo);
            if (!alvo) { relacoesForaDaSelecao++; return; }
            const tipo = tipos.get(r.tipo) || { codigo: r.tipo, rotulo: r.tipo, inverso: null, simetrica: true };
            const chave = `${tipo.rotulo}>${alvo.id}`;
            if (relacionados.has(chave)) return;
            relacionados.add(chave);
            tiposUsados.set(tipo.rotulo, tipo);
            linhas.push(`<relation type="${escaparXml(tipo.rotulo)}" ref="${escaparXml(alvo.id)}"/>`);
        });
        // Texto livre antigo (sem ID) não tem alvo: vai como nota
        const textos = (entrada.RELACOES_TEXTO || []).map(umaLinha).filter(Boolean);
        if (textos.length) {
            const veja = (tipos.get('veja') || TIPOS_SUGERIDOS[0]).rotulo;
            linhas.push(`<note type="comment">${forma(anal, `${veja}: ${textos.join(', ')}`)}</note>`);
        }

        const caminhoDominio = [entrada.CAMPO_SEMANTICO, ...(entrada.SUB_CAMPOS_SEMANTICOS || [])]
            .map(umaLinha).filter(Boolean);
        const dominio = caminhoDominio.length ? registrarDominio(caminhoDominio) : '';
        const classe = umaLinha(entrada.CLASSE_GRAMATICAL);
        if (classe) classes.add(classe);

        (entrada.ACEPCOES || []).forEach((ac, idx) => {
            const sig = ac.SIGNIFICADO_ID && banco.significados ? banco.significados[ac.SIGNIFICADO_ID] : null;
            linhas.push(`<sense id="${guid}_s${idx + 1}" order="${idx}">`);
            if (classe) linhas.push(`<grammatical-info value="${escaparXml(classe)}"/>`);
            if (sig && umaLinha(sig.TRADUCAO)) linhas.push(`<gloss lang="${escaparXml(anal)}"><text>${escaparXml(umaLinha(sig.TRADUCAO))}</text></gloss>`);
            if (sig && umaLinha(sig.DESCRICAO)) linhas.push(`<definition>${forma(anal, sig.DESCRICAO)}</definition>`);
            (ac.EXEMPLOS_IDS || []).forEach(exId => {
                const ex = banco.exemplos && banco.exemplos[exId];
                if (!ex) return;
                const som = ex.ARQUIVO_SONORO_EXEMPLO ? midia('audio', ex.ARQUIVO_SONORO_EXEMPLO) : '';
                if (!umaLinha(ex.TRANSCRICAO_EXEMPLO) && !som) return;
                linhas.push('<example>'
                    + (umaLinha(ex.TRANSCRICAO_EXEMPLO) ? forma(vern, ex.TRANSCRICAO_EXEMPLO) : '')
                    + (som ? forma(voz, som) : '')
                    + (umaLinha(ex.TRADUCAO_EXEMPLO) ? `<translation type="Free translation">${forma(anal, ex.TRADUCAO_EXEMPLO)}</translation>` : '')
                    + '</example>');
            });
            (ac.IMAGENS_IDS || []).forEach(imgId => {
                const img = banco.imagens && banco.imagens[imgId];
                const arquivo = img && img.IMAGEM ? midia('imagem', img.IMAGEM) : '';
                if (!arquivo) return;
                linhas.push(`<illustration href="${escaparXml(arquivo)}">`
                    + (umaLinha(img.LEGENDA_IMAGEM) ? `<label>${forma(anal, img.LEGENDA_IMAGEM)}</label>` : '')
                    + '</illustration>');
            });
            if (dominio) linhas.push(`<trait name="semantic-domain-ddp4" value="${escaparXml(dominio)}"/>`);
            contagem.videos += (ac.VIDEOS_IDS || []).length;
            linhas.push('</sense>');
        });

        linhas.push('</entry>');
        return linhas.join('\r\n');
    });

    if (contagem.videos) avisos.push(`${contagem.videos} vídeo(s) de acepção ficaram de fora: o FLEx não tem vídeo na acepção.`);
    if (coletor.ausentes()) avisos.push(`${coletor.ausentes()} mídia(s) não encontrada(s) na pasta do projeto (ou remotas) foram omitidas.`);
    if (relacoesForaDaSelecao) avisos.push(`${relacoesForaDaSelecao} relação(ões) com entradas fora da seleção foram omitidas.`);

    const lift = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<lift version="0.13" producer="CSV2DMLI">',
        '<header>',
        '<ranges>',
        ...['grammatical-info', 'semantic-domain-ddp4', 'lexical-relation']
            .map(r => `<range id="${r}" href="${NOME_RANGES_LIFT}"/>`),
        '</ranges>',
        '</header>',
        ...blocos,
        '</lift>',
        '',
    ].join('\r\n');

    const elemento = (id, rotulo, extras = '', pai = '') =>
        `<range-element id="${escaparXml(id)}" guid="${guidDeterministico(`range|${id}`)}"${pai ? ` parent="${escaparXml(pai)}"` : ''}>`
        + `<label>${forma(anal, rotulo)}</label>${extras}</range-element>`;
    const ranges = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<lift-ranges>',
        '<range id="grammatical-info">',
        ...[...classes].map(c => elemento(c, c, `<abbrev>${forma(anal, c)}</abbrev>`)),
        '</range>',
        '<range id="semantic-domain-ddp4">',
        ...[...dominios].map(([id, d]) => elemento(id, d.nome, '', d.pai)),
        '</range>',
        '<range id="lexical-relation">',
        ...[...tiposUsados.values()].map(t => elemento(t.rotulo, t.rotulo,
            (t.simetrica ? '' : `<field type="reverse-label">${forma(anal, t.inverso)}</field>`)
            + `<trait name="referenceType" value="${t.simetrica ? TIPO_PAR_ENTRADAS : TIPO_PAR_ASSIMETRICO_ENTRADAS}"/>`)),
        '</range>',
        '</lift-ranges>',
        '',
    ].join('\r\n');

    return { lift, ranges, midias: coletor.midias, avisos };
}

export const LEIA_ME_LIFT = `Dicionário exportado em LIFT 0.13 pelo CSV2DMLI

Conteúdo:
  ${NOME_LIFT}           entradas (XML, UTF-8)
  ${NOME_RANGES_LIFT}    classes gramaticais, domínios semânticos e tipos de relação
  audio/, pictures/            áudios (pronúncia e exemplos) e imagens, quando exportados

Importação no FieldWorks Language Explorer (FLEx):

1. Descompacte o ZIP mantendo as pastas ao lado do arquivo .lift.
2. Arquivo > Importar > Léxico LIFT e escolha ${NOME_LIFT}.
   O FLEx copia as mídias de audio/ e pictures/ para LinkedFiles do projeto.
3. Os sistemas de escrita são os códigos de língua do arquivo: o vernáculo (termo,
   variantes, exemplos), a língua das traduções e a língua de voz do vernáculo
   (sufixo -Zxxx-x-audio) para o som dos exemplos.

Cada entrada tem um guid fixo: ao importar de novo, o FLEx reconhece as entradas
já existentes em vez de duplicá-las.

Não exportados: vídeos de acepção (o FLEx não tem esse campo).
`;

export default class ExportadorLIFT extends ExportadorBase {
    /**
     * ZIP com o .lift, o .lift-ranges, LEIA-ME.txt e (com `incluirMidias`) as pastas audio/ e pictures/.
     * @param {object[]} entradas entradas do banco a exportar, na ordem desejada
     * @param {{vernaculo: string, analise?: string, incluirMidias?: boolean}} opcoes
     * @returns {Promise<{blob: Blob, avisos: string[], total: number}>}
     */
    async gerarZip(entradas, opcoes = {}) {
        if (!window.JSZip) throw new Error(_t('JSZip não carregado.'));
        const vfs = this.db.vfs;
        const chaveMidia = (tipo, nome) => (vfs && typeof vfs.obterChave === 'function') ? vfs.obterChave(tipo, nome) : null;
        const { lift, ranges, midias, avisos } = gerarLift(entradas, this.db.bancoDados, {
            ...opcoes, chaveMidia, tiposRelacao: this.db.tiposRelacao,
        });

        const zip = new window.JSZip();
        zip.file(NOME_LIFT, lift);
        zip.file(NOME_RANGES_LIFT, ranges);
        zip.file('LEIA-ME.txt', LEIA_ME_LIFT.replace(/\n/g, '\r\n'));
        for (const m of midias) {
            const arquivo = vfs.obterArquivo(m.tipo, m.arquivo);
            if (arquivo) zip.file(`${m.pasta}/${m.nome}`, arquivo);
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        return { blob, avisos, total: entradas.length };
    }
}
