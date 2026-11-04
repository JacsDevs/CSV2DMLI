// Núcleo de tradução da interface. Funciona offline, sem bibliotecas e sem build.
// É um script clássico, carregado no <head> antes de qualquer script inline.
//
// O texto em português é a própria chave. Se faltar tradução, ele é exibido como está.
//
// No JavaScript:
//   _t('Salvar arquivo')
//   _t('e mais {n} arquivos', { n: 12 })       números são formatados no idioma ativo
//   _t('Novo', { ctx: 'projeto' })             desambigua palavras iguais (chave: 'projeto::Novo')
//   _tn('{n} arquivo', '{n} arquivos', total)  plural (a chave é o singular)
//
// Passe como texto os números que não devem ser formatados, como anos e códigos.
//
// No HTML (traduz só os textos diretos do elemento, preservando ícones e outros filhos):
//   <button data-i18n><i class="fa fa-save"></i> Salvar</button>
//   <p data-i18n="html">Texto com <strong>marcação</strong></p>
//   <input data-i18n-attr="placeholder title" placeholder="Buscar" title="Buscar termo">
//   <button data-i18n data-i18n-ctx="projeto">Novo</button>
//
// Nos dicionários, o plural usa as categorias de Intl.PluralRules:
//   '{n} arquivo': { one: '{n} file', other: '{n} files' }
(function (global) {
    'use strict';

    const PADRAO = global.I18N_IDIOMA_PADRAO || 'pt-BR';
    const IDIOMAS = global.I18N_IDIOMAS || [{ codigo: PADRAO, nome: PADRAO }];
    const CHAVE_ARMAZENAMENTO = 'csv2dmli-idioma';
    const SEPARADOR_CONTEXTO = '::';

    const dicionarios = Object.create(null);
    const estadoTextos = new WeakMap();
    const estadoAtributos = new WeakMap();

    const idiomaValido = (codigo) => IDIOMAS.some(i => i.codigo === codigo);

    function lerIdiomaSalvo() {
        try {
            const salvo = global.localStorage && global.localStorage.getItem(CHAVE_ARMAZENAMENTO);
            return idiomaValido(salvo) ? salvo : null;
        } catch (e) {
            return null; // armazenamento indisponível
        }
    }

    let idiomaAtivo = lerIdiomaSalvo() || PADRAO;

    const normalizar = (texto) => texto.replace(/\s+/g, ' ').trim();

    function buscar(texto, ctx) {
        const dicionario = dicionarios[idiomaAtivo];
        if (!dicionario) return undefined;
        const chave = ctx ? ctx + SEPARADOR_CONTEXTO + texto : texto;
        return Object.prototype.hasOwnProperty.call(dicionario, chave) ? dicionario[chave] : undefined;
    }

    function numero(valor, opcoes) {
        return Number(valor).toLocaleString(idiomaAtivo, opcoes);
    }

    function interpolar(texto, variaveis) {
        if (!variaveis) return texto;
        return texto.replace(/\{(\w+)\}/g, (marcador, nome) => {
            if (!Object.prototype.hasOwnProperty.call(variaveis, nome)) return marcador;
            const valor = variaveis[nome];
            return typeof valor === 'number' ? numero(valor) : String(valor);
        });
    }

    function _t(texto, variaveis) {
        const traducao = buscar(texto, variaveis && variaveis.ctx);
        return interpolar(typeof traducao === 'string' && traducao ? traducao : texto, variaveis);
    }

    function _tn(singular, plural, quantidade, variaveis) {
        const dados = Object.assign({ n: quantidade }, variaveis);
        const formas = buscar(singular, dados.ctx);
        if (formas && typeof formas === 'object') {
            const categoria = new Intl.PluralRules(idiomaAtivo).select(quantidade);
            const forma = formas[categoria] || formas.other;
            if (forma) return interpolar(forma, dados);
        }
        // Texto-fonte em português: "0 arquivos", "1 arquivo", "2 arquivos".
        return interpolar(quantidade === 1 ? singular : plural, dados);
    }

    // Guarda o texto original de cada ponto traduzido. Se outro código mudou o valor
    // depois da última tradução, o valor atual passa a ser o novo original.
    function resolverOriginal(estado, atual) {
        if (estado && estado.aplicado === atual) return estado.original;
        return atual;
    }

    function traduzirTextoDireto(elemento, ctx) {
        elemento.childNodes.forEach((no) => {
            if (no.nodeType !== 3 || !no.nodeValue.trim()) return;
            const original = resolverOriginal(estadoTextos.get(no), no.nodeValue);
            const traducao = buscar(normalizar(original), ctx);
            let final = original;
            if (typeof traducao === 'string' && traducao) {
                // Preserva os espaços das pontas, que separam o texto de ícones vizinhos.
                final = original.match(/^\s*/)[0] + traducao + original.match(/\s*$/)[0];
            }
            if (final !== no.nodeValue) no.nodeValue = final;
            estadoTextos.set(no, { original, aplicado: final });
        });
    }

    function traduzirHtml(elemento, ctx) {
        const original = resolverOriginal(estadoTextos.get(elemento), elemento.innerHTML);
        const traducao = buscar(normalizar(original), ctx);
        const final = typeof traducao === 'string' && traducao ? traducao : original;
        if (final !== elemento.innerHTML) elemento.innerHTML = final;
        // Guarda o valor relido, pois o navegador pode reescrever o HTML atribuído.
        estadoTextos.set(elemento, { original, aplicado: elemento.innerHTML });
    }

    function traduzirAtributos(elemento, ctx) {
        const estados = estadoAtributos.get(elemento) || {};
        elemento.getAttribute('data-i18n-attr').trim().split(/\s+/).forEach((nome) => {
            const atual = elemento.getAttribute(nome);
            if (atual === null) return;
            const original = resolverOriginal(estados[nome], atual);
            const traducao = buscar(normalizar(original), ctx);
            const final = typeof traducao === 'string' && traducao ? traducao : original;
            if (final !== atual) elemento.setAttribute(nome, final);
            estados[nome] = { original, aplicado: final };
        });
        estadoAtributos.set(elemento, estados);
    }

    // Traduz os elementos marcados dentro de `raiz`. Chame após inserir HTML marcado na página.
    function aplicar(raiz) {
        if (typeof document === 'undefined') return;
        const base = raiz || document;
        const elementos = Array.from(base.querySelectorAll('[data-i18n], [data-i18n-attr]'));
        if (base.matches && base.matches('[data-i18n], [data-i18n-attr]')) elementos.unshift(base);
        elementos.forEach((elemento) => {
            const ctx = elemento.getAttribute('data-i18n-ctx') || undefined;
            const modo = elemento.getAttribute('data-i18n');
            if (modo === 'html') traduzirHtml(elemento, ctx);
            else if (modo !== null) traduzirTextoDireto(elemento, ctx);
            if (elemento.hasAttribute('data-i18n-attr')) traduzirAtributos(elemento, ctx);
        });
    }

    function avisarTelas() {
        document.dispatchEvent(new CustomEvent('idioma-alterado', { detail: { idioma: idiomaAtivo } }));
    }

    function definirIdioma(codigo, opcoes) {
        if (!idiomaValido(codigo)) return false;
        idiomaAtivo = codigo;
        if (!opcoes || opcoes.persistir !== false) {
            try {
                if (global.localStorage) global.localStorage.setItem(CHAVE_ARMAZENAMENTO, codigo);
            } catch (e) { /* armazenamento indisponível */ }
        }
        if (typeof document !== 'undefined') {
            document.documentElement.lang = codigo;
            aplicar();
            avisarTelas();
        }
        return true;
    }

    global.I18N = {
        padrao: PADRAO,
        idiomas: IDIOMAS,
        get idioma() { return idiomaAtivo; },
        registrar(codigo, dicionario) { dicionarios[codigo] = dicionario; },
        definirIdioma,
        aplicar,
        numero,
        lista: (itens) => new Intl.ListFormat(idiomaAtivo, { style: 'long', type: 'conjunction' }).format(itens),
        data: (valor, opcoes) => new Date(valor).toLocaleDateString(idiomaAtivo, opcoes),
        hora: (valor, opcoes) => new Date(valor).toLocaleTimeString(idiomaAtivo, opcoes),
    };
    global._t = _t;
    global._tn = _tn;

    // Em PT-BR o HTML já está correto, então nada é tocado na inicialização.
    if (typeof document !== 'undefined' && idiomaAtivo !== PADRAO) {
        document.documentElement.lang = idiomaAtivo;
        document.addEventListener('DOMContentLoaded', () => {
            aplicar();
            avisarTelas();
        });
    }
})(globalThis);
