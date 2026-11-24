# 005 — Unificar e encurtar a animação de troca de etapa do wizard do editor

- **Status**: DONE
- **Commit**: 0732aa0
- **Severity**: MEDIUM
- **Category**: Easing & duration / Cohesion
- **Estimated scope**: 2 arquivos, ~15 linhas
- **Depends on**: 002 (usa o token `--ease-out` que o 002 cria em `static/css/style.css`)

## Problem

A troca de etapa do wizard tem **duas** definições de animação concorrentes. A de `index.html` vence porque o `<style>` inline (linha 45) vem depois de `<link rel="stylesheet" href="static/css/style.css">` (linha 37), com a mesma especificidade.

```css
/* static/css/style.css:520-528 — atual (sem efeito, é sobrescrita) */
.wizard-step {
    display: none;
    animation: slideFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes slideFadeIn {
    from { opacity: 0; transform: translateY(15px); }
    to { opacity: 1; transform: translateY(0); }
}
```

```css
/* index.html:64-67 — atual (é a que vale) */
        .wizard-step {
            display: none;
            animation: fadeIn 0.4s ease;
        }
```

```css
/* index.html:95-98 — atual */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }
```

Problemas:
1. 400ms com o `ease` padrão: a troca de etapa acontece dezenas de vezes por sessão, e 400ms com uma curva fraca faz cada clique em "Próximo" parecer lento.
2. Duas fontes de verdade: alguém que edite `style.css` não verá efeito nenhum.
3. Não há tratamento de `prefers-reduced-motion`: o deslocamento acontece mesmo quando o usuário pediu menos movimento.

Uso de keyframes aqui é aceitável: a etapa troca de `display: none` para `display: block` (`.wizard-step.active`), e keyframes rodam na entrada. Não é um elemento acionado repetidamente em sequência rápida.

## Target

A definição única fica em `static/css/style.css`, com 200ms e o ease-out forte:

```css
/* static/css/style.css — alvo, substituindo as linhas 520-528 */
.wizard-step {
    display: none;
    animation: wizardEntrada 200ms var(--ease-out);
}

@keyframes wizardEntrada {
    from { opacity: 0; transform: translateY(8px); }
}

@keyframes wizardEntradaSuave {
    from { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
    .wizard-step { animation-name: wizardEntradaSuave; }
}
```

Em `index.html`, remova a linha `animation: fadeIn 0.4s ease;` da regra `.wizard-step` (linha 66). A regra continua com `display: none;`.

Notas:
- Keyframes só com `from` animam até o valor computado do elemento (`opacity: 1`, sem transform). Não é preciso `forwards`.
- `@keyframes slideFadeIn` também é usado por `.custom-tab-content` (`style.css:2692`). Por isso este plano **não** apaga `slideFadeIn`; ele cria `wizardEntrada`.
- `@keyframes fadeIn` em `index.html:95` também é usado por `.apk-status-inline` (`index.html:405`). **Não** apague esse keyframe.

## Repo conventions to follow

- `static/css/style.css` usa indentação de 4 espaços e nomes de keyframes em camelCase (`slideFadeIn`, `modalPop`, `fadeInEditor`). Nomes em português, como `wizardEntrada`, seguem a tendência do código mais novo (`.carregando-giro`, `.importar-zona`).
- Exemplo de `prefers-reduced-motion` no repositório: `static/css/style.css:1796` → `@media (prefers-reduced-motion: reduce) { .carregando-giro { animation-duration: 2.4s; } }`.
- O token `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);` é criado pelo plano 002 em `:root` de `static/css/style.css`. Confirme que ele existe antes de começar. Se não existir, PARE: o plano 002 precisa rodar antes.

## Steps

1. Confirme que `--ease-out` existe em `:root` de `static/css/style.css` (`grep -n -- "--ease-out" static/css/style.css`).
2. Em `static/css/style.css`, substitua as linhas 520-528 (regra `.wizard-step` e `@keyframes slideFadeIn`) pelo bloco do Target. Atenção: `@keyframes slideFadeIn` está nessas linhas e é usado em `:2692`. Mantenha `slideFadeIn` ou mova a definição para perto de `.custom-tab-content`, sem mudar o conteúdo.
3. Em `index.html:66`, apague só a linha `animation: fadeIn 0.4s ease;` dentro de `.wizard-step { … }`.

## Boundaries

- NÃO apague `@keyframes fadeIn` de `index.html` nem `@keyframes slideFadeIn` de `style.css` (ambos têm outros usos).
- NÃO altere o JS que troca a classe `.active` entre etapas.
- NÃO mexa em `.custom-tab-content`, `modalPop` ou `.apk-status-inline`.
- NÃO adicione transição de saída: a etapa anterior some na hora (`display: none`), e isso é correto para uma troca de conteúdo no mesmo lugar.
- Se as linhas citadas não baterem, PARE e informe.

## Verification

- **Mecânica**:
  - `grep -n "wizard-step" index.html` mostra a regra `.wizard-step` sem a propriedade `animation`.
  - `grep -n "slideFadeIn\|wizardEntrada" static/css/style.css` mostra `wizardEntrada`, `wizardEntradaSuave` e `slideFadeIn` (ainda usado por `.custom-tab-content`).
- **Conferência visual**: `npm run dev`, abra http://localhost:8080 e avance e volte pelas etapas do wizard.
  - A nova etapa aparece subindo levemente (8px) e fica nítida em cerca de 200ms, começando rápida. A 10% no painel Animations, confirme que a curva é ease-out forte.
  - Clicar em "Próximo" várias vezes seguidas não parece lento nem deixa conteúdo atrasado.
  - Ative `prefers-reduced-motion: reduce` (DevTools → Rendering): a etapa aparece só com opacidade, sem deslocamento.
- **Concluído quando**: existe uma única definição de animação para `.wizard-step`, em `style.css`, com 200ms `var(--ease-out)` e variante para movimento reduzido.
