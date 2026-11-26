// Relações entre entradas (ITENS_RELACIONADOS com tipo:ID): node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    ehId, lerItens, interpretarRelacoesTxt, ligarRelacoes, gruposDeRelacoes, textoDasRelacoes, TIPOS_SUGERIDOS,
} from '../packages/core/relacoes.js';
import ConstrutorBancoDados from '../packages/core/construtorBancoDados.js';
import ExportadorTypst from '../packages/exporters/exportadorTypst.js';
import ExportadorLatex from '../packages/exporters/exportadorLatex.js';
import ExportadorBase from '../packages/exporters/exportadorBase.js';
import { montarDadosApp } from '../packages/exporters/dadosApp.js';

const A = 'e2aaaaa', B = 'e3aaaaa', C = 'e4aaaaa', D = 'e5aaaaa';

test('formato do ID e leitura dos itens (mesmas regras do TRATAR MÍDIAS)', () => {
    assert.ok(ehId('e7kq2xm'));
    for (const invalido of ['E7kq2xm', 'e7kq2x', 'e0abcde', 'SEM-EX', '', '12']) assert.ok(!ehId(invalido), invalido);
    assert.deepEqual(lerItens(` sinonimo:${A} | ${B} | kaxi | ver: kaxi | sinonimo : ${C} | nan |`), [
        { tipo: 'sinonimo', id: A, texto: `sinonimo:${A}` },
        { tipo: 'veja', id: B, texto: B },
        { texto: 'kaxi' },
        { texto: 'ver: kaxi', parece: 'ver' },
        { tipo: 'sinonimo', id: C, texto: `sinonimo : ${C}` },
    ]);
});

test('relacoes.txt soma aos sugeridos, sobrescreve rótulos e avisa linhas inválidas', () => {
    const { tipos, avisos } = interpretarRelacoesTxt('# comentário\nsinonimo = Sin.\nclassificador = Classificador de | Classificadores\nRuim = X\nsem igual\nvazio =\n');
    const por = Object.fromEntries(tipos.map(t => [t.codigo, t]));
    assert.equal(por.sinonimo.rotulo, 'Sin.');
    assert.equal(por.classificador.inverso, 'Classificadores');
    assert.equal(por.classificador.simetrica, false);
    assert.equal(por.veja.rotulo, 'Veja também');
    assert.equal(avisos.length, 3);
    assert.match(avisos[0], /linha 4/);
    assert.equal(TIPOS_SUGERIDOS.find(t => t.codigo === 'diminutivo').inverso, 'Diminutivos');
});

function entradas() {
    // como o construtor deixa as entradas: IDs e itens de todas as linhas agrupadas
    return {
        ENT_1: { ID: 'ENT_1', _TERMO_PRINCIPAL: 'kaxi', _IDS_LINHAS: [A, D], _ITENS_LINHAS: lerItens(`sinonimo:${B} | forma_variante:${C} | ${D} | texto antigo`) },
        ENT_2: { ID: 'ENT_2', _TERMO_PRINCIPAL: 'pira', _IDS_LINHAS: [B], _ITENS_LINHAS: lerItens(`sinonimo:${A} | antonimo:e9zzzzz`) },
        ENT_3: { ID: 'ENT_3', _TERMO_PRINCIPAL: 'kaxí', _IDS_LINHAS: [C], _ITENS_LINHAS: [] },
    };
}

test('ligar: outro lado, acepção da mesma entrada e ID inexistente', () => {
    const ents = entradas();
    const avisos = ligarRelacoes(ents);
    assert.deepEqual(ents.ENT_1.RELACOES_SAIDA, [{ tipo: 'sinonimo', alvo: 'ENT_2' }, { tipo: 'forma_variante', alvo: 'ENT_3' }]);
    assert.deepEqual(ents.ENT_1.RELACOES_TEXTO, ['texto antigo']);           // D é a própria entrada: omitida
    assert.deepEqual(ents.ENT_3.RELACOES_ENTRADA, [{ tipo: 'forma_variante', origem: 'ENT_1' }]);
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /e9zzzzz/);
});

test('grupos por tipo, com o rótulo do outro lado; simétrica gravada dos dois lados aparece uma vez', () => {
    const ents = entradas();
    ligarRelacoes(ents);
    const kaxi = gruposDeRelacoes(ents.ENT_1, ents, TIPOS_SUGERIDOS);
    assert.deepEqual(kaxi.map(g => [g.ROTULO, g.ITENS.map(i => i.TERMO)]), [
        ['Veja também', ['texto antigo']],
        ['Sinônimo de', ['pira']],
        ['Forma variante de', ['kaxí']],
    ]);
    assert.equal(kaxi[0].ITENS[0].SEM_ALVO, true);
    assert.equal(kaxi[1].ITENS[0].ALVO, 'ENT_2');
    assert.deepEqual(kaxi.map(g => g.SEP), ['', '; ', '; ']);
    const variante = gruposDeRelacoes(ents.ENT_3, ents, TIPOS_SUGERIDOS);
    assert.deepEqual(variante.map(g => [g.ROTULO, g.ITENS.map(i => i.TERMO)]), [['Formas variantes', ['kaxi']]]);
    // pira diz sinonimo:kaxi e kaxi diz sinonimo:pira: um item só
    const pira = gruposDeRelacoes(ents.ENT_2, ents, TIPOS_SUGERIDOS);
    assert.deepEqual(pira.map(g => [g.ROTULO, g.ITENS.map(i => i.TERMO)]), [['Sinônimo de', ['kaxi']]]);
    assert.equal(textoDasRelacoes(kaxi), 'Veja também: texto antigo · Sinônimo de: pira · Forma variante de: kaxí');
});

test('só texto livre continua como antes', () => {
    const ents = { E: { ID: 'E', _TERMO_PRINCIPAL: 'a', _IDS_LINHAS: [], _ITENS_LINHAS: lerItens('kaxi | pira') } };
    ligarRelacoes(ents);
    assert.equal(textoDasRelacoes(gruposDeRelacoes(ents.E, ents, TIPOS_SUGERIDOS)), 'kaxi, pira');
});

// ---------------------------------------------------------------- de ponta a ponta
function linha(cb, termo) {
    return { camposBasicos: { TRADUCAO_SIGNIFICADO: 'tradução', ...cb }, variacoes: [{ item: termo }], exemplos: [], imagens: [] };
}

function montarBanco() {
    const vfs = { obterArquivo: () => null, textosExtra: {} };
    const df = [
        linha({ ID: A, ITENS_RELACIONADOS: `sinonimo:${B}` }, 'kaxi'),
        // segunda acepção de kaxi: as relações dela também valem (antes só a primeira linha contava)
        linha({ ID: D, ITENS_RELACIONADOS: `forma_variante:${C}`, TRADUCAO_SIGNIFICADO: 'outra' }, 'kaxi'),
        linha({ ID: B }, 'pira'),
        linha({ ID: C }, 'kaxí'),
    ];
    return new ConstrutorBancoDados(vfs).normalizarDados(df, true);
}

function porTermo(db, termo) {
    return Object.values(db.entradas).find(e => e._TERMO_PRINCIPAL === termo);
}

test('construtor junta as relações das acepções e guarda o texto cru para o CLDF', () => {
    const db = montarBanco();
    const kaxi = porTermo(db, 'kaxi');
    assert.equal(kaxi.ACEPCOES.length, 2);
    assert.deepEqual(kaxi.RELACOES_SAIDA.map(r => r.tipo), ['sinonimo', 'forma_variante']);
    assert.equal(kaxi.ITENS_RELACIONADOS, `sinonimo:${B} | forma_variante:${C}`);
    assert.deepEqual(db.metadados.avisosRelacoes, []);
});

test('Typst: rótulo em cada verbete e referência com página', () => {
    const db = montarBanco();
    const exp = new ExportadorTypst({ bancoDados: db, tiposRelacao: TIPOS_SUGERIDOS });
    exp.templateEntrada = readFileSync(new URL('../config/templates/typst/entrada.typ', import.meta.url), 'utf8');
    const kaxi = porTermo(db, 'kaxi');
    const typ = exp.gerarEntradaTypst(kaxi);
    assert.match(typ, new RegExp(`#metadata\\("${kaxi.ID}"\\) <ent-${kaxi.ID}>`));
    const pira = porTermo(db, 'pira').ID;
    const kaxiAcento = porTermo(db, 'kaxí').ID;
    assert.ok(typ.includes(`→ _Sinônimo de_ #ver-verbete("${pira}")[pira]; _Forma variante de_ #ver-verbete("${kaxiAcento}")[kaxí]`), typ);
    const outroLado = exp.gerarEntradaTypst(porTermo(db, 'kaxí'));
    assert.ok(outroLado.includes(`_Formas variantes_ #ver-verbete("${kaxi.ID}")[kaxi]`), outroLado);
});

test('LaTeX: rótulo e \\pageref', () => {
    const db = montarBanco();
    const exp = new ExportadorLatex({ bancoDados: db, tiposRelacao: TIPOS_SUGERIDOS });
    exp.templateEntrada = readFileSync(new URL('../config/templates/latex/entrada.tex', import.meta.url), 'utf8');
    const pira = porTermo(db, 'pira');
    const tex = exp.gerarEntradaLatex(pira);
    const kaxi = porTermo(db, 'kaxi').ID;
    assert.ok(tex.includes(`\\phantomsection\\label{ent:${pira.ID}}`), tex);
    assert.ok(tex.includes(`\\textit{Sinônimo de}: \\hyperref[ent:${kaxi}]{kaxi} (p.~\\pageref{ent:${kaxi}})`), tex);
});

test('HTML: links com o ID da entrada; app nativo recebe texto e relações estruturadas', () => {
    const db = montarBanco();
    const base = new ExportadorBase({ bancoDados: db, tiposRelacao: TIPOS_SUGERIDOS });
    const kaxi = porTermo(db, 'kaxi');
    const dados = base.extrairDadosEntrada(kaxi);
    const tmpl = readFileSync(new URL('../config/templates/html-cards/entrada.tmpl', import.meta.url), 'utf8');
    const html = base.processarTemplate(tmpl, dados);
    const pira = porTermo(db, 'pira').ID;
    assert.ok(html.includes(`data-entrada="${pira}"`), html);
    assert.match(html, /Forma variante de:/);
    assert.doesNotMatch(html, /Veja também/);
    const app = montarDadosApp([{ ...kaxi, ...dados }]).entradas[0];
    assert.equal(app.relacionados, 'Sinônimo de: pira · Forma variante de: kaxí');
    assert.deepEqual(app.relacoes[0], { rotulo: 'Sinônimo de', itens: [{ termo: 'pira', id: pira }] });
});
