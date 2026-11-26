// ============================================
// SELETOR DE ENTRADAS (exportação de parte do dicionário)
// ============================================
// Árvore de campos e subcampos semânticos (a mesma da etapa Estrutura) com caixas de marcar:
// marcar um campo marca tudo o que está nele; as entradas de cada campo aparecem ao abri-lo.
// A busca troca a árvore por uma lista das entradas encontradas (termo, variante ou tradução).
// Feito para a exportação LIFT; não depende dela, para poder servir a outros formatos.

const LIMITE_RESULTADOS = 300;

const normalizar = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * @param {HTMLElement} container
 * @param {object} dados
 * @param {object} dados.arvore            de GerenciadorDados.obterArvoreOrdenada
 * @param {string[]} dados.categoriasRaizes
 * @param {object} dados.banco             db (variacoes, significados), para a tradução e a busca
 * @param {() => void} [dados.aoMudar]     chamado a cada mudança na seleção
 * @returns {{ selecionadas: () => object[], total: number, marcarTodas: (marcar: boolean) => void, buscar: (texto: string) => void }}
 */
export function montarSeletorEntradas(container, { arvore, categoriasRaizes, banco, aoMudar }) {
    const ordem = [];           // entradas na ordem da árvore
    const posicao = new Map();  // entrada -> índice em `ordem`
    const nos = [];             // { caixa, contador, entradas }
    const selecionadas = new Set();

    const traducao = (entrada) => {
        const ac = (entrada.ACEPCOES || [])[0];
        const sig = ac && ac.SIGNIFICADO_ID && banco.significados ? banco.significados[ac.SIGNIFICADO_ID] : null;
        return sig ? (sig.TRADUCAO || '') : '';
    };
    const textoBusca = new Map();
    const indexar = (entrada) => {
        const partes = [entrada._TERMO_PRINCIPAL];
        (entrada.VARIACOES_IDS || []).forEach(id => { const v = banco.variacoes && banco.variacoes[id]; if (v) partes.push(v.TRANSCRICAO_ORTOGRAFICA); });
        (entrada.ACEPCOES || []).forEach(ac => {
            const sig = ac.SIGNIFICADO_ID && banco.significados ? banco.significados[ac.SIGNIFICADO_ID] : null;
            if (sig) partes.push(sig.TRADUCAO);
        });
        textoBusca.set(entrada, normalizar(partes.filter(Boolean).join(' ')));
    };

    const criarCaixaEntrada = (entrada) => {
        const label = document.createElement('label');
        label.className = 'seletor-entrada';
        const caixa = document.createElement('input');
        caixa.type = 'checkbox';
        caixa.dataset.i = String(posicao.get(entrada));
        caixa.checked = selecionadas.has(entrada);
        caixa.addEventListener('change', () => {
            if (caixa.checked) selecionadas.add(entrada); else selecionadas.delete(entrada);
            sincronizar();
        });
        const termo = document.createElement('span');
        termo.className = 'seletor-entrada-termo';
        termo.textContent = entrada._TERMO_PRINCIPAL || '???';
        label.append(caixa, termo);
        const trad = traducao(entrada);
        if (trad) {
            const sub = document.createElement('span');
            sub.className = 'seletor-entrada-traducao';
            sub.textContent = trad;
            label.append(sub);
        }
        return label;
    };

    const montarNo = (nome, no) => {
        const li = document.createElement('li');
        const detalhes = document.createElement('details');
        detalhes.className = 'seletor-no';
        const resumo = document.createElement('summary');
        const caixa = document.createElement('input');
        caixa.type = 'checkbox';
        caixa.setAttribute('aria-label', _t('Selecionar {categoria}', { categoria: nome }));
        // Clicar na caixa não abre nem fecha o campo
        caixa.addEventListener('click', (e) => e.stopPropagation());
        const rotulo = document.createElement('span');
        rotulo.className = 'seletor-no-nome';
        rotulo.textContent = nome;
        const contador = document.createElement('span');
        contador.className = 'seletor-no-contador';
        resumo.append(caixa, rotulo, contador);
        detalhes.append(resumo);

        const entradasNo = [];
        const filhos = Object.keys(no).filter(k => k !== '_entradas');
        // Ordem igual a GerenciadorDados.obterOrdemDicionario: entradas do nó, depois os subcampos
        no._entradas.forEach(e => { posicao.set(e, ordem.length); ordem.push(e); indexar(e); entradasNo.push(e); });
        const lista = document.createElement('ul');
        lista.className = 'seletor-filhos';
        filhos.forEach(filho => {
            const { li: liFilho, entradas } = montarNo(filho, no[filho]);
            entradasNo.push(...entradas);
            lista.append(liFilho);
        });
        if (filhos.length) detalhes.append(lista);

        // Entradas desenhadas só ao abrir: um dicionário pode ter milhares
        if (no._entradas.length) {
            const listaEntradas = document.createElement('div');
            listaEntradas.className = 'seletor-entradas';
            detalhes.append(listaEntradas);
            detalhes.addEventListener('toggle', () => {
                if (detalhes.open && !listaEntradas.childElementCount) {
                    listaEntradas.append(...no._entradas.map(criarCaixaEntrada));
                }
            });
        }

        caixa.addEventListener('change', () => {
            entradasNo.forEach(e => caixa.checked ? selecionadas.add(e) : selecionadas.delete(e));
            sincronizar();
        });
        nos.push({ caixa, contador, entradas: entradasNo });
        li.append(detalhes);
        return { li, entradas: entradasNo };
    };

    const raiz = document.createElement('ul');
    raiz.className = 'seletor-arvore';
    categoriasRaizes.forEach(cat => { if (arvore[cat]) raiz.append(montarNo(cat, arvore[cat]).li); });

    const resultados = document.createElement('div');
    resultados.className = 'seletor-resultados';
    resultados.hidden = true;
    container.replaceChildren(raiz, resultados);

    function sincronizar() {
        nos.forEach(({ caixa, contador, entradas }) => {
            const n = entradas.reduce((soma, e) => soma + (selecionadas.has(e) ? 1 : 0), 0);
            caixa.checked = n > 0 && n === entradas.length;
            caixa.indeterminate = n > 0 && n < entradas.length;
            contador.textContent = `${n}/${entradas.length}`;
        });
        container.querySelectorAll('input[data-i]').forEach(caixa => {
            caixa.checked = selecionadas.has(ordem[Number(caixa.dataset.i)]);
        });
        if (aoMudar) aoMudar();
    }

    function buscar(texto) {
        const termo = normalizar(texto).trim();
        raiz.hidden = !!termo;
        resultados.hidden = !termo;
        if (!termo) { resultados.replaceChildren(); return; }
        const achadas = ordem.filter(e => textoBusca.get(e).includes(termo));
        const itens = achadas.slice(0, LIMITE_RESULTADOS).map(criarCaixaEntrada);
        const aviso = document.createElement('p');
        aviso.className = 'campo-ajuda';
        aviso.textContent = achadas.length === 0
            ? _t('Nenhuma entrada encontrada.')
            : achadas.length > LIMITE_RESULTADOS
                ? _t('Mostrando {n} de {total} entradas encontradas. Refine a busca para ver as demais.', { n: LIMITE_RESULTADOS, total: achadas.length })
                : '';
        resultados.replaceChildren(...(aviso.textContent ? [aviso] : []), ...itens);
    }

    function marcarTodas(marcar) {
        if (marcar) ordem.forEach(e => selecionadas.add(e)); else selecionadas.clear();
        sincronizar();
    }

    marcarTodas(true);

    return {
        selecionadas: () => ordem.filter(e => selecionadas.has(e)),
        total: ordem.length,
        marcarTodas,
        buscar,
    };
}
