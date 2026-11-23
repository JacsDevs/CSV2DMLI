# 002 — Trocar `transition: all` do editor por propriedades explícitas e curva forte

- **Status**: DONE
- **Commit**: 0732aa0
- **Severity**: HIGH
- **Category**: Performance / Cohesion & tokens
- **Estimated scope**: 1 arquivo, ~5 linhas (o token se propaga para cerca de 20 componentes)

## Problem

O editor (`index.html` + `static/css/style.css`) define um único token de transição que anima **todas** as propriedades:

```css
/* static/css/style.css:56-57 — atual */
    /* Transitions */
    --transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
```

O token é usado como `transition: var(--transition);` em `static/css/style.css` nas linhas 206, 264, 340, 356, 437, 584, 638, 857, 1011, 1233, 1313, 1987, 2040, 2113, 2156, 2234, 2636 e 2666, e em `index.html:652` (`.explorer-item`).

Problemas:
1. `all` anima qualquer propriedade que mude, inclusive as de layout. Exemplo: `.aparencia-opcao.ativa` (`style.css:1236`) muda `border` e `padding`, e hoje isso é interpolado a cada quadro.
2. A resposta ao toque do botão, `.btn:active { transform: scale(0.97); }` (`style.css:271`), herda 250ms com a curva padrão do Material. Pressionar um botão deve responder em 160ms com um ease-out forte.
3. `cubic-bezier(0.4, 0, 0.2, 1)` é fraca demais para movimento deliberado.

Mudanças de estado feitas pelos componentes que usam o token (confirmadas no código): `color`, `background`/`background-color`, `border-color`, `box-shadow` e `transform` (`.btn:active` com `scale(0.97)` e `.drop-zone:hover` com `scale(1.01)`, em `style.css:2047`). Nenhum componente ativo depende de transicionar `width`, `height`, `padding`, `margin` ou `opacity` por esse token.

## Target

Redefinir o token no próprio lugar, com propriedades explícitas, e criar um token de curva. O nome `--transition` continua o mesmo, então nenhum dos pontos que o usam precisa mudar.

```css
/* static/css/style.css — alvo, substituindo a linha 57 */
    /* Transitions */
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    --transition:
        color 150ms ease,
        background-color 150ms ease,
        border-color 150ms ease,
        box-shadow 150ms ease,
        transform 160ms var(--ease-out);
```

Por que esses valores:
- Hover e mudança de cor → `ease`, 150ms (dentro da faixa de 100–160ms para feedback).
- Pressionar e escalas pequenas no hover → `transform 160ms` com o ease-out forte `cubic-bezier(0.23, 1, 0.32, 1)`.
- `--ease-out` vira o token compartilhado que o plano 005 também usa.

## Repo conventions to follow

- Os tokens de design ficam no bloco `:root` no topo de `static/css/style.css`, agrupados por comentários (`/* Shadows */`, `/* Transitions */`). Mantenha o novo token sob `/* Transitions */`.
- Exemplo de transição já explícita no projeto: `index.html:121` → `transition: border-color 0.2s, background 0.2s;`.

## Steps

1. Em `static/css/style.css:57`, substitua a linha `--transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);` pelo bloco do Target (a declaração `--ease-out` e depois o novo `--transition` de várias linhas). Mantenha o comentário `/* Transitions */` da linha 56.
2. Não altere nenhum dos pontos que usam `transition: var(--transition);`.

## Boundaries

- NÃO altere `transition: all …` hardcoded em `static/css/style.css` depois da linha 2860 (`.editor-list`, `.btn-danger`, `.btn-outline`, `.download-card`, `.btn-new-project` e outros): esses seletores parecem não ser usados e serão tratados num plano separado de remoção de código morto.
- NÃO altere `config/templates/` (isso é o plano 003).
- NÃO mexa em `.terminal-panel` (`style.css:2271`, `:2424`), no `.wizard-step` (plano 005) nem no `modalPop`.
- NÃO adicione dependências nem rode formatadores.
- Se a linha 57 não for mais `--transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);`, PARE e informe.

## Verification

- **Mecânica**: `grep -n "transition: all" static/css/style.css | awk -F: '$1<2860'` não retorna nada.
- **Conferência visual**: `npm run dev`, abra http://localhost:8080.
  - Passe o mouse sobre botões do cabeçalho, botões principais e secundários e itens do stepper: a cor muda em cerca de 150ms, sem atraso perceptível.
  - Pressione e segure um `.btn`: a redução de escala acontece quase de imediato e começa rápida. No painel Animations do DevTools a 10%, confirme que a curva parte rápido e desacelera (sem início lento).
  - Arraste um arquivo sobre a área de importação ou passe o mouse por ela: borda e fundo mudam juntos; o `scale(1.01)` da `.drop-zone` ainda aparece.
  - Passos de Aparência: selecionar uma `.aparencia-opcao` muda borda e padding na hora, sem a caixa crescer aos poucos. Esse corte seco é intencional.
  - Clique em um campo de texto: a borda e o anel de foco aparecem suavemente.
- **Concluído quando**: o token `--transition` não contém mais `all`, existe `--ease-out` em `:root` e as interações acima se comportam como descrito.
