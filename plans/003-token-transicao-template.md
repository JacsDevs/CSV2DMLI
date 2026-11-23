# 003 — Trocar `transition: all` do dicionário (template de cards) por propriedades explícitas

- **Status**: DONE
- **Commit**: 0732aa0
- **Severity**: MEDIUM
- **Category**: Performance / Cohesion & tokens
- **Estimated scope**: 1 arquivo, ~10 linhas

## Problem

O template do dicionário define um token que anima **todas** as propriedades:

```css
/* config/templates/html-cards/template.html:50 — atual */
            --transicao: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
```

Ele é usado como `transition: var(--transicao);` nas linhas 166 (`.btn`), 219 (`.campo-busca`), 261 (`.filtro-select`), 292 (`.seg-opt`), 353 (`.app-bar-btn`), 384 (`.seg-colunas button`), 402 (`.chip-topo`), 416 (`.btn-topo-icone`), 481 (`.switch-trilho`), 668 (`.btn-barra`), 687 (`.card`), 745 (`.btn-audio`), 910 (`.entrada_lexical`), 925 (`.item-bookmark-btn`), 994 (`.dict-media-card`), 1020 (`.dict-text-phrase`), 1112 (`.modal-nav-btn, .modal-fechar, .modal-bookmark-btn, .modal-audio-btn`) e 1174 (`.lightbox-fechar`).

Os botões flutuantes têm um segundo `all` hardcoded:

```css
/* config/templates/html-cards/template.html:1219 — atual (regra #btn-topo, #btn-voltar) */
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

Esses botões entram e saem por `.btn-flutuante-oculto { transform: translateY(120px) !important; opacity: 0; pointer-events: none; }` (linha 1224) e mudam `background`/`color` no hover (linha 1223).

Mudanças de estado feitas pelos componentes que usam o token (confirmadas no código): `color`, `background`, `border-color`, `box-shadow` e `transform` (`.btn-primario:active` com `scale(0.98)`, `.card:active` com `scale(0.99)`, `.btn-audio:active` com `scale(0.92)`, hover dos cards com `translateY(-2px)`). Nenhuma mudança de estado desses componentes depende de transicionar layout (`width`, `height`, `padding`, `margin`).

## Target

```css
/* config/templates/html-cards/template.html — alvo, substituindo a linha 50 */
            --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
            --transicao:
                color 150ms ease,
                background-color 150ms ease,
                border-color 150ms ease,
                box-shadow 150ms ease,
                transform 160ms var(--ease-out);
```

```css
/* config/templates/html-cards/template.html — alvo, substituindo a linha 1219 */
            transition:
                transform 250ms var(--ease-out),
                opacity 250ms var(--ease-out),
                background-color 150ms ease,
                color 150ms ease;
```

Por que esses valores:
- Hover e mudança de cor → `ease`, 150ms. Pressionar e pequenos deslocamentos → `transform 160ms` com ease-out forte.
- Botões flutuantes entrando e saindo → ease-out, 250ms (faixa de dropdowns/popovers; deslocamento curto).

## Repo conventions to follow

- Os tokens ficam no primeiro bloco `:root` do `<style>` do template (linhas ~10-54), um por linha com indentação de 12 espaços. Coloque `--ease-out` logo acima de `--transicao`.
- O bloco `{{ tema.override_claro | safe }}` (linha 56) só sobrescreve cores; não mexa nele.
- Exemplo de transição já explícita no template: linha 1187 → `transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.2s ease;`.

## Steps

1. Em `config/templates/html-cards/template.html:50`, substitua `--transicao: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);` pelo primeiro bloco do Target.
2. Em `config/templates/html-cards/template.html:1219` (dentro da regra `#btn-topo, #btn-voltar { … }` que começa na linha 1205), substitua `transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);` pelo segundo bloco do Target.
3. Não altere nenhum dos pontos que usam `transition: var(--transicao);`.

## Boundaries

- NÃO mude as curvas de gavetas e sheets (`cubic-bezier(0.4, 0, 0.2, 1)` nas linhas 544, 594, 607, 1321, 1365, 1527 e 1570): isso é o plano 004.
- NÃO altere `config/templates/estilos-globais.css`, que também define `--transicao: all 0.2s ease;`. Esse arquivo é injetado só em templates que usam `{{ estilos_globais }}`, e o `template.html` não usa.
- NÃO mexa em `templateOLD*.html` nem em `old/`.
- NÃO mexa nos blocos `@media (prefers-reduced-motion: reduce)` (linha 1643) nem em `html.a11y-sem-animacao` (linha 515): eles reduzem `transition-duration` globalmente e continuam funcionando.
- Se as linhas citadas não baterem, PARE e informe.

## Verification

- **Mecânica**: `grep -n "transition: all\|--transicao: all" config/templates/html-cards/template.html` não retorna nada.
- **Conferência visual**: gere um dicionário HTML de cards pelo app e abra o resultado.
  - Hover em botões, chips, opções segmentadas e no campo de busca: a cor muda em cerca de 150ms.
  - Toque ou clique num card e no botão de áudio: a redução de escala responde quase de imediato.
  - Role a página para baixo e depois volte ao topo: os botões flutuantes "topo" e "voltar" deslizam e desaparecem gradualmente em 250ms, começando rápido e sem início lento. Confira a 10% no painel Animations.
  - Ligue "sem animação" no painel de acessibilidade do dicionário: tudo continua instantâneo, como antes.
  - Abra o painel de acessibilidade e alterne um switch: o fundo do trilho muda de cor e a bolinha desliza (a bolinha tem transição própria na linha 489).
- **Concluído quando**: nenhum `all` em transições do template, `--ease-out` definido em `:root` e as interações acima conferidas.
