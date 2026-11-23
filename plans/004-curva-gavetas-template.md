# 004 — Curva de gaveta (iOS) nas gavetas, sheets e telas deslizantes do dicionário

- **Status**: DONE
- **Commit**: 0732aa0
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: 1 arquivo, ~14 linhas
- **Depends on**: nenhum (pode rodar antes ou depois do 003; se o 003 já tiver rodado, `--ease-out` já existe em `:root`, mas este plano não o usa)

## Problem

Todas as superfícies que deslizam no dicionário usam a curva padrão do Material em 300ms. Para gavetas e sheets, essa curva começa devagar demais e não tem o arraste final característico de iOS que faz uma gaveta parecer física.

```css
/* config/templates/html-cards/template.html:544 — .sidebar — atual */
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
/* :594 — .sidebar-desktop-toggle — atual */
            transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s;
/* :607 — .conteudo-principal — atual */
            transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
/* :1321 — .tela-categorias — atual */
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.3s;
/* :1365 — .bottom-sheet — atual */
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.3s;
/* :1382 — .sheet-overlay — atual */
            transition: opacity 0.3s ease, visibility 0.3s;
/* :1527 — .painel-a11y (mobile, dentro de @media (max-width: 768px)) — atual */
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
/* :1570 — .modal-conteudo (mobile, dentro de @media (max-width: 768px)) — atual */
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

Há também um bug latente: no celular, `.modal-conteudo` e `.painel-a11y` deslizam **dentro** de `.modal-overlay`, que tem `transition: opacity 0.22s ease, visibility 0.22s ease;` (linha 1072). Ao fechar, o overlay fica `visibility: hidden` aos 220ms e corta os últimos 80ms do deslizamento de 300ms. Com a nova duração isso pioraria, então o overlay precisa acompanhar no celular.

## Target

Novo token em `:root`:

```css
            --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

Grupo da sidebar no desktop (sidebar, botão e margem do conteúdo andam juntos, então os três mantêm a mesma duração e curva): **300ms `var(--ease-drawer)`**.

```css
/* :544 */  transition: transform 300ms var(--ease-drawer);
/* :594 */  transition: left 300ms var(--ease-drawer), background 0.2s;
/* :607 */  transition: margin-left 300ms var(--ease-drawer);
```

Sheets e telas do celular: **400ms `var(--ease-drawer)`**, e as transições de `visibility` e do overlay com a mesma duração, para a saída não ser cortada.

```css
/* :1321 */ transition: transform 400ms var(--ease-drawer), visibility 400ms;
/* :1365 */ transition: transform 400ms var(--ease-drawer), visibility 400ms;
/* :1382 */ transition: opacity 400ms ease, visibility 400ms;
/* :1527 */ transition: transform 400ms var(--ease-drawer);
/* :1570 */ transition: transform 400ms var(--ease-drawer);
```

Nova regra dentro do bloco mobile `@media (max-width: 768px)`, logo depois de `.modal-overlay { padding: 0; align-items: flex-end; }` (linha ~1568):

```css
            .modal-overlay { transition: opacity 400ms ease, visibility 400ms; }
```

Ajuste de JS ligado à duração (linha 3448): ele espera o modal de informações fechar antes de abrir o painel de pacotes.

```js
/* atual */  setTimeout(mostrar, 300);
/* alvo  */  setTimeout(mostrar, 400);
```

## Repo conventions to follow

- Tokens no primeiro `:root` do `<style>` (linhas ~10-54), um por linha, indentação de 12 espaços. Coloque `--ease-drawer` junto de `--transicao` (e de `--ease-out`, se o plano 003 já tiver rodado).
- Regras dentro de `@media (max-width: 768px)` usam indentação de 12 espaços para o seletor e 16 para as propriedades; regras de uma linha nesse bloco usam 12 (ex.: linha 1568).

## Steps

1. Adicione `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);` ao `:root`, logo abaixo da linha de `--transicao` (linha 50).
2. Substitua as linhas 544, 594 e 607 pelos valores do grupo da sidebar no Target.
3. Substitua as linhas 1321, 1365, 1382, 1527 e 1570 pelos valores de sheets e telas no Target, mantendo a indentação de cada linha.
4. No bloco `@media (max-width: 768px)`, depois da linha `.modal-overlay { padding: 0; align-items: flex-end; }`, adicione `.modal-overlay { transition: opacity 400ms ease, visibility 400ms; }`.
5. Na linha 3448, troque `setTimeout(mostrar, 300);` por `setTimeout(mostrar, 400);`.

## Boundaries

- NÃO mude a transição de `.modal-overlay` fora do celular (linha 1072, 220ms): no desktop o modal só aparece com opacidade, e o painel de acessibilidade no desktop não desliza.
- NÃO mude `setTimeout(focar, 250)` em `abrirDialogo` (linha 2216): ao abrir, `visibility` fica `visible` desde o primeiro quadro, então o foco funciona antes do fim da animação.
- NÃO mude `.sidebar-overlay` (linha 553), a barra do topo no celular (linhas 1479 e 1489) nem `.cat-n0` (linha 801).
- NÃO troque `margin-left`/`left` por `transform` neste plano. Isso é outro achado da auditoria (performance do recolhimento da sidebar), fora do escopo.
- Se alguma linha não bater, PARE e informe.

## Verification

- **Mecânica**: `grep -n "cubic-bezier(0.4, 0, 0.2, 1)" config/templates/html-cards/template.html` retorna só as linhas da barra do topo e do `.cat-n0` (1479, 801), mais `--transicao` (linha 50) e `#btn-topo` (linha 1219) se o plano 003 ainda não tiver rodado.
- **Conferência visual** (DevTools → Device Toolbar → celular, e também janela de desktop):
  - Celular: abra a tela de categorias, o bottom sheet de opções, o painel de acessibilidade e um verbete. Cada um sobe rápido e se acomoda devagar no fim, sem início lento. A 10% no painel Animations, a curva deve mostrar a maior parte do percurso nos primeiros ~30%.
  - Celular: feche cada um. O deslizamento de saída chega até o fim da tela antes de sumir, sem cortar no meio. Esse é o bug do overlay corrigido.
  - Celular: o escurecimento do fundo aparece e some no mesmo ritmo da sheet.
  - Desktop: recolha e expanda a sidebar. A sidebar, o botão de recolher e o conteúdo andam juntos, sem descompasso.
  - Ligue o `prefers-reduced-motion` (painel Rendering): tudo continua instantâneo.
  - Primeiro acesso com pacotes de mídia pendentes: o painel de pacotes só aparece depois que o modal de informações terminou de fechar.
- **Concluído quando**: todas as superfícies deslizantes usam `var(--ease-drawer)`, a saída no celular não é mais cortada e a sidebar no desktop anda sincronizada.
