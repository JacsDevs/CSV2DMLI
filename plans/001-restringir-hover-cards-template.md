# 001 — Restringir o hover com movimento dos cards a dispositivos com mouse

- **Status**: DONE
- **Commit**: 0732aa0
- **Severity**: HIGH
- **Category**: Accessibility (pointer gating)
- **Estimated scope**: 1 arquivo, ~6 linhas

## Problem

O `template.html` gera o dicionário final, que roda no navegador do celular e dentro do app Android (WebView). Em telas de toque, o navegador aplica `:hover` ao elemento tocado e o mantém até o próximo toque em outro lugar. Os cards são o elemento mais tocado do app. Hoje, depois de tocar em um card, ele fica "preso" levantado 2px, com sombra maior e imagem ampliada.

```css
/* config/templates/html-cards/template.html:696 — atual */
        .card:hover { box-shadow: var(--sombra-hover); transform: translateY(-2px); border-color: var(--cor-borda-forte); }
```

```css
/* config/templates/html-cards/template.html:713 — atual */
        .card:hover .card-media img { transform: scale(1.04); }
```

```css
/* config/templates/html-cards/template.html:997 — atual */
        .dict-media-card:hover { transform: translateY(-2px); box-shadow: var(--sombra-suave); }
```

## Target

As três regras passam a valer só para dispositivos com hover real e ponteiro preciso. A resposta ao toque (`.card:active { transform: scale(0.99); }`, linha 697) continua fora do media query, porque `:active` funciona corretamente no toque.

```css
/* alvo */
        @media (hover: hover) and (pointer: fine) {
            .card:hover { box-shadow: var(--sombra-hover); transform: translateY(-2px); border-color: var(--cor-borda-forte); }
            .card:hover .card-media img { transform: scale(1.04); }
            .dict-media-card:hover { transform: translateY(-2px); box-shadow: var(--sombra-suave); }
        }
```

## Repo conventions to follow

- O CSS do template fica num único `<style>` dentro do `<head>`, com indentação de 8 espaços nas regras de topo e de 12 dentro de media queries. Exemplo: o bloco `@media (prefers-reduced-motion: reduce)` em `config/templates/html-cards/template.html:1643`.
- Mantenha cada regra perto da posição original. Um media query pequeno logo depois de cada regra original é aceitável; não é preciso juntar tudo num bloco só.

## Steps

1. Em `config/templates/html-cards/template.html:696`, envolva a linha `.card:hover { … }` em `@media (hover: hover) and (pointer: fine) { … }`, sem mudar o conteúdo da regra. Não mova a linha 697 (`.card:active`).
2. Em `config/templates/html-cards/template.html:713`, envolva `.card:hover .card-media img { transform: scale(1.04); }` da mesma forma.
3. Em `config/templates/html-cards/template.html:997`, envolva `.dict-media-card:hover { … }` da mesma forma.

## Boundaries

- NÃO altere outras regras `:hover` que só mudam cor ou fundo: ficar com a cor de hover depois de um toque é tolerável e está fora do escopo.
- NÃO mude valores (sombras, deslocamento, escala, duração da transição). Só envolva as regras.
- NÃO mexa em `config/templates/html-cards/templateOLD*.html` nem em `config/templates/html-cards/old/`.
- Se as linhas citadas não baterem com o código encontrado (alterações depois do commit 0732aa0), PARE e informe, sem improvisar.

## Verification

- **Mecânica**: `grep -n "\.card:hover\|\.dict-media-card:hover" config/templates/html-cards/template.html` mostra as três regras, todas dentro de um bloco `@media (hover: hover) and (pointer: fine)`.
- **Conferência visual**: exporte um dicionário HTML de cards pelo app (`npm run dev`, depois exportar) e abra o resultado.
  - Desktop com mouse: passar o mouse num card ainda o levanta e amplia a imagem, como antes.
  - DevTools → Device Toolbar → um celular com touch (ex.: Pixel 7): tocar em um card não o deixa levantado depois de soltar; a leve redução de `scale(0.99)` ainda aparece durante o toque.
  - Se possível, confirme num celular Android de verdade ou no APK gerado.
- **Concluído quando**: as três regras de hover com `transform` estão dentro do media query e `.card:active` continua fora dele.
