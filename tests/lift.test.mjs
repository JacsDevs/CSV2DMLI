// Exportação LIFT 0.13 para o FLEx: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    gerarLift, guidDeterministico, escaparXml, separarHomonimo, limparTranscricao,
} from '../packages/exporters/exportadorLIFT.js';
import ConstrutorBancoDados from '../packages/core/construtorBancoDados.js';
import { TIPOS_SUGERIDOS } from '../packages/core/relacoes.js';

const A = 'e2aaaaa', B = 'e3aaaaa', C = 'e4aaaaa', D = 'e5aaaaa';

function linha(cb, variacoes, extra = {}) {
    return { camposBasicos: { TRADUCAO_SIGNIFICADO: 'tradução', ...cb }, variacoes, exemplos: [], imagens: [], ...extra };
}

function montarBanco() {
    const vfs = { obterArquivo: () => null, textosExtra: {} };
    const df = [
        linha({ ID: A, CLASSE_GRAMATICAL: 's.', CAMPO_SEMANTICO: 'Animais', SUB_CAMPO_SEMANTICO: 'Aves',
                TRADUCAO_SIGNIFICADO: 'arara', DESCRICAO: 'ave & "grande" <vermelha>', DESCRICAO_ENTRADA: 'nota',
                ITENS_RELACIONADOS: `sinonimo:${B} | forma_variante:${C} | texto livre` },
              [{ item: 'kaxi', fonet: '[ka.ʃi]', audio: 'kaxi.mp3' }, { item: 'kaxï' }],
              { exemplos: [{ trans: 'kaxi pira', trad: 'a arara voa', audio: 'ex.mp3' }], imagens: [{ img: 'arara.jpg', leg: 'Uma arara' }] }),
        linha({ ID: D, TRADUCAO_SIGNIFICADO: 'papagaio', CAMPO_SEMANTICO: 'Animais' }, [{ item: 'kaxi' }]),
        linha({ ID: B, TRADUCAO_SIGNIFICADO: 'arara-azul', CAMPO_SEMANTICO: 'Animais', SUB_CAMPO_SEMANTICO: 'Aves' }, [{ item: 'pira' }]),
        linha({ ID: C, TRADUCAO_SIGNIFICADO: 'pena', CAMPO_SEMANTICO: 'Corpo' }, [{ item: 'tapa' }]),
    ];
    return new ConstrutorBancoDados(vfs).normalizarDados(df, true);
}

const porTraducao = (db, traducao) => Object.values(db.entradas)
    .find(e => db.significados[e.ACEPCOES[0].SIGNIFICADO_ID].TRADUCAO === traducao);
const bloco = (lift, guid) => lift.slice(lift.indexOf(`guid="${guid}"`), lift.indexOf('</entry>', lift.indexOf(`guid="${guid}"`)));
const opcoes = { vernaculo: 'kui', analise: 'pt', tiposRelacao: TIPOS_SUGERIDOS };

/** Confere se as tags abrem e fecham na ordem certa (o Node não tem parser de XML). */
function assertXmlBalanceado(xml) {
    const pilha = [];
    for (const [, fecha, nome, auto] of xml.replace(/<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([\w-]+)[^>]*?(\/?)>/g)) {
        if (auto) continue;
        if (fecha) assert.equal(pilha.pop(), nome, `</${nome}> fora de ordem`);
        else pilha.push(nome);
    }
    assert.deepEqual(pilha, []);
}

test('homônimo e transcrição sem delimitadores', () => {
    assert.deepEqual(separarHomonimo('kaxi²'), { termo: 'kaxi', homonimo: '2' });
    assert.deepEqual(separarHomonimo('kaxi¹²'), { termo: 'kaxi', homonimo: '12' });
    assert.deepEqual(separarHomonimo('pira'), { termo: 'pira', homonimo: '' });
    assert.equal(limparTranscricao('[ka.ʃi]'), 'ka.ʃi');
    assert.equal(limparTranscricao(' /kaʃi/ '), 'kaʃi');
    assert.equal(limparTranscricao('ka[ʃ]i'), 'ka[ʃ]i');
});

test('guid determinístico, no formato aceito pelo FLEx', () => {
    const g = guidDeterministico(A);
    assert.match(g, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(g, guidDeterministico(A));
    assert.notEqual(g, guidDeterministico(B));
    assert.equal(escaparXml('a & <b> "c"\u0001'), 'a &amp; &lt;b&gt; &quot;c&quot;');
});

test('entrada completa: pronúncia, variante, nota, acepção, exemplo com som, imagem, domínio e relações', () => {
    const db = montarBanco();
    const { lift, midias, avisos } = gerarLift(Object.values(db.entradas), db, opcoes);
    assertXmlBalanceado(lift);
    assert.match(lift, /^<\?xml version="1\.0" encoding="utf-8"\?>\r\n<lift version="0\.13" producer="CSV2DMLI">/);

    const kaxi = porTraducao(db, 'arara');
    const guid = guidDeterministico(A);   // ID fixo da primeira linha
    const b = bloco(lift, guid);
    const hm = kaxi._TERMO_PRINCIPAL.endsWith('¹') ? '1' : '2';
    assert.ok(b.startsWith(`guid="${guid}" order="${hm}">`), b);
    assert.ok(b.includes('<lexical-unit><form lang="kui"><text>kaxi</text></form></lexical-unit>'));
    assert.ok(b.includes('<pronunciation><form lang="kui"><text>ka.ʃi</text></form><media href="kaxi.mp3"/></pronunciation>'));
    assert.ok(b.includes('<variant><form lang="kui"><text>kaxï</text></form></variant>'));
    assert.ok(b.includes('<note><form lang="pt"><text>nota</text></form></note>'));
    assert.ok(b.includes('<grammatical-info value="s."/>'));
    assert.ok(b.includes('<gloss lang="pt"><text>arara</text></gloss>'));
    assert.ok(b.includes('<definition><form lang="pt"><text>ave &amp; &quot;grande&quot; &lt;vermelha&gt;</text></form></definition>'));
    assert.ok(b.includes('<example><form lang="kui"><text>kaxi pira</text></form><form lang="kui-Zxxx-x-audio"><text>ex.mp3</text></form>'
        + '<translation type="Free translation"><form lang="pt"><text>a arara voa</text></form></translation></example>'));
    assert.ok(b.includes('<illustration href="arara.jpg"><label><form lang="pt"><text>Uma arara</text></form></label></illustration>'));
    assert.ok(b.includes('<trait name="semantic-domain-ddp4" value="Animais &gt; Aves"/>'));

    // relações pelo id da entrada de destino, com o rótulo do tipo
    const idPira = `pira_${guidDeterministico(B)}`;
    const idTapa = `tapa_${guidDeterministico(C)}`;
    assert.ok(b.includes(`<relation type="Sinônimo de" ref="${idPira}"/>`), b);
    assert.ok(b.includes(`<relation type="Forma variante de" ref="${idTapa}"/>`), b);
    assert.ok(b.includes('<note type="comment"><form lang="pt"><text>Veja também: texto livre</text></form></note>'));
    assert.ok(lift.includes(`<entry id="${idPira}" guid="${guidDeterministico(B)}">`));

    assert.deepEqual(midias.map(m => [m.pasta, m.nome]), [['audio', 'kaxi.mp3'], ['audio', 'ex.mp3'], ['pictures', 'arara.jpg']]);
    assert.deepEqual(avisos, []);
});

test('ranges: classes, domínios com a hierarquia e tipos de relação com o outro lado', () => {
    const db = montarBanco();
    const { ranges } = gerarLift(Object.values(db.entradas), db, opcoes);
    assertXmlBalanceado(ranges);
    assert.match(ranges, /<range-element id="s\." guid="[^"]+"><label><form lang="pt"><text>s\.<\/text><\/form><\/label><abbrev>/);
    assert.match(ranges, /<range-element id="Animais" guid="[^"]+"><label><form lang="pt"><text>Animais<\/text>/);
    assert.match(ranges, /<range-element id="Animais &gt; Aves" guid="[^"]+" parent="Animais"><label><form lang="pt"><text>Aves<\/text>/);
    assert.match(ranges, /<range-element id="Corpo" /);
    // sinônimo: simétrica (kmtEntryPair = 6); forma variante: assimétrica com rótulo inverso (kmtEntryAsymmetricPair = 7)
    assert.match(ranges, /<range-element id="Sinônimo de" [^>]+><label>[^]*?<\/label><trait name="referenceType" value="6"\/><\/range-element>/);
    assert.match(ranges, /<range-element id="Forma variante de" [^>]+><label>[^]*?<\/label><field type="reverse-label"><form lang="pt"><text>Formas variantes<\/text><\/form><\/field><trait name="referenceType" value="7"\/>/);
});

test('seleção parcial: relação com entrada de fora é omitida, com aviso', () => {
    const db = montarBanco();
    const { lift, avisos } = gerarLift([porTraducao(db, 'arara')], db, opcoes);
    assert.doesNotMatch(lift, /<relation /);
    assert.ok(avisos.some(a => /2 relação\(ões\) com entradas fora da seleção/.test(a)), avisos.join('\n'));
});

test('sem mídias; vídeo de acepção vira aviso; vernáculo é obrigatório', () => {
    const db = montarBanco();
    const { lift, midias } = gerarLift(Object.values(db.entradas), db, { ...opcoes, incluirMidias: false });
    assert.doesNotMatch(lift, /<media |<illustration |x-audio/);
    assert.equal(midias.length, 0);
    assert.throws(() => gerarLift([], db, { analise: 'pt' }), /vernácula/);

    const banco = { entradas: {}, variacoes: {}, exemplos: {}, imagens: {}, significados: { S: { TRADUCAO: 't' } } };
    const e = { ID: 'E', _TERMO_PRINCIPAL: 'x', ACEPCOES: [{ SIGNIFICADO_ID: 'S', VIDEOS_IDS: ['V1'] }] };
    assert.ok(gerarLift([e], banco, opcoes).avisos.some(a => /vídeo/.test(a)));
});

test('mídia ausente vira aviso; arquivos diferentes com o mesmo nome recebem sufixo', () => {
    const db = montarBanco();
    const ausente = gerarLift(Object.values(db.entradas), db, { ...opcoes, chaveMidia: (tipo) => tipo === 'imagem' ? null : 'x' });
    assert.doesNotMatch(ausente.lift, /<illustration /);
    assert.ok(ausente.avisos.some(a => /não encontrada/.test(a)));

    // duas imagens com o mesmo nome em pastas diferentes (pacote CLDF)
    const banco = {
        entradas: {}, variacoes: {}, exemplos: {},
        significados: { S: { TRADUCAO: 't' } },
        imagens: { I1: { IMAGEM: 'a/foto.jpg' }, I2: { IMAGEM: 'b/foto.jpg' } },
    };
    const e = { ID: 'E', _TERMO_PRINCIPAL: 'x', ACEPCOES: [{ SIGNIFICADO_ID: 'S', IMAGENS_IDS: ['I1', 'I2'] }] };
    const { lift, midias } = gerarLift([e], banco, opcoes);
    assert.deepEqual(midias.map(m => m.nome), ['foto.jpg', 'foto_2.jpg']);
    assert.match(lift, /<illustration href="foto\.jpg"><\/illustration>\r\n<illustration href="foto_2\.jpg">/);
});

test('sem ID fixo na planilha, o guid vem do termo, da classe e da tradução', () => {
    const banco = { entradas: {}, variacoes: {}, exemplos: {}, imagens: {}, significados: { S: { TRADUCAO: 'um' } } };
    const e = { ID: 'ENT_00001', _TERMO_PRINCIPAL: 'x', CLASSE_GRAMATICAL: 'v.', ACEPCOES: [{ SIGNIFICADO_ID: 'S' }] };
    const { lift } = gerarLift([e], banco, opcoes);
    // o ID interno (ENT_00001) muda se a planilha for reordenada: não entra no guid
    assert.ok(lift.includes(`guid="${guidDeterministico('csv2dmli|x|v.|um')}"`));
});
