# Planos de animação

Gerados por `improve-animations` no commit `0732aa0`. Cada plano é independente e autossuficiente: pode ser executado por qualquer agente sem o contexto da auditoria.

| # | Título | Severidade | Status |
|---|---|---|---|
| [001](001-restringir-hover-cards-template.md) | Restringir o hover com movimento dos cards a dispositivos com mouse | HIGH | DONE |
| [002](002-token-transicao-editor.md) | Trocar `transition: all` do editor por propriedades explícitas e curva forte | HIGH | DONE |
| [003](003-token-transicao-template.md) | Trocar `transition: all` do dicionário por propriedades explícitas | MEDIUM | DONE |
| [004](004-curva-gavetas-template.md) | Curva de gaveta (iOS) nas gavetas, sheets e telas deslizantes do dicionário | MEDIUM | DONE |
| [005](005-transicao-etapas-wizard.md) | Unificar e encurtar a animação de troca de etapa do wizard | MEDIUM | DONE |

## Ordem recomendada

1. **001**: o menor e com maior impacto para o usuário final (Android/celular).
2. **002**: cria `--ease-out` no editor.
3. **005**: depende do `--ease-out` criado no 002.
4. **003**: template do dicionário.
5. **004**: template do dicionário. Independente do 003, mas os dois editam o mesmo `:root` (linha ~50 do `template.html`); rodar em sequência evita conflito.

## Dependências

- 005 → depende de 002.
- 001, 003 e 004 editam `config/templates/html-cards/template.html`. Os números de linha citados referem-se ao commit `0732aa0`: executar um desloca as linhas dos seguintes. Quem executar deve localizar cada trecho pelo código citado, não só pelo número da linha.

## Achados da auditoria ainda sem plano

- Recolher a sidebar no desktop anima `margin-left` sobre a grade inteira de cards (`template.html:594`, `:607`).
- A barra do topo no celular anima `max-height`/`margin` durante a rolagem (`template.html:1489-1491`).
- `prefers-reduced-motion` no editor não cobre o `modalPop` (`style.css:2394`).
- `prefers-reduced-motion` do sistema no template zera também os fades (`template.html:1643`).
- O painel do terminal anima `width`/`height` (`style.css:2271`, `:2424`). É intencional e pode ficar.
- Cerca de 1.300 linhas de CSS aparentemente sem uso em `style.css` (~2860-4430).
- Oportunidades: fundo e saída do modal do editor; `scale(0.96)` no modal do verbete no desktop.
