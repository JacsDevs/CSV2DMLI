# Contexto de Arquitetura e Regras de Templating (CSV2DMLI)

Este documento foi criado para orientar futuros desenvolvimentos, assistentes de IA e desenvolvedores sobre a arquitetura do frontend do dicionário e, principalmente, as limitações do seu sistema interno de renderização de templates.

## 1. Arquitetura do Sistema
* **Ambiente de Execução:** O sistema deve funcionar nativamente de duas formas:
  1. Como um aplicativo desktop (**Tauri** / Rust).
  2. Como um site web Progressivo (**PWA**) com **JavaScript Puro (Vanilla JS)**.
* **Processamento:** 100% do processamento de dados, parser de CSV e montagem do HTML ocorrem **no frontend** (lado do cliente). Não há servidor em Node.js ou PHP gerando as páginas.
* **Impacto dessa arquitetura:** Por processar tudo localmente e focar em leveza, o sistema *não* utiliza bibliotecas grandes (como React, Vue ou a engine completa oficial do Mustache/Handlebars). Em vez disso, ele utiliza um motor de templates próprio contido em `packages/exporters/renderizador.js`.

## 2. O Motor de Renderização (`renderizador.js`)
O sistema utiliza um interpretador Regex extremamente enxuto e específico para converter arquivos `.tmpl` (como `entrada.tmpl` e `lista.tmpl` em `config/templates/html-cards/`) em código HTML válido inserido no DOM.

### 🔴 REGRAS CRÍTICAS E LIMITAÇÕES (O que NÃO fazer)
Devido à implementação simples por expressões regulares (`/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/`), o motor **não suporta todos os recursos da linguagem Mustache**.
Se você quebrar essas regras, o interpretador entrará em conflito, não renderizará a seção e poderá quebrar o carregamento de todo o dicionário na interface.

1. **NÃO USE Seções Invertidas (Inverted Sections):**
   * ❌ **Proibido:** `{{^TEM_IMAGENS}} ... {{/TEM_IMAGENS}}`
   * O `renderizador.js` falha ao processar o acento circunflexo `^`.
   * *Solução:* Use a ausência de conteúdo condicional apenas estruturando blocos afirmativos. Se precisar de um "else", isso deve ser tratado no JavaScript antes de injetar as propriedades (`gerenciadorDados.js` e `construtorBancoDados.js`), fornecendo à view duas chaves booleanas exclusivas (ex: `TEM_FOTOS` vs `NAO_TEM_FOTOS`).

2. **Cuidado com Comentários de Bloco:**
   * ❌ **Evite:** `{{! Comentário }}`
   * *Solução:* Use comentários de HTML padrão `<!-- Comentário -->`, que passarão batidos pela Regex de substituição e serão tratados pelo navegador.

3. **Não Aninhe a mesma Chave Exata:**
   * ❌ **Problema:** `{{#EXEMPLOS}} ... {{#EXEMPLOS}}...{{/EXEMPLOS}} ... {{/EXEMPLOS}}`
   * *Solução:* O Regex casará o primeiro fechamento que encontrar. As chaves precisam ser estritamente únicas no seu escopo imediato.

### 🟢 SINTAXE SUPORTADA (O que é seguro usar)

1. **Interpolação Simples:**
   Insere texto de variáveis literais.
   ```mustache
   <h1>{{ TERMO }}</h1>
   ```

2. **Blocos Lógicos Afirmativos (Listas e Booleanos):**
   Renderiza se a chave existir e for verdadeira. Se a chave for um *Array* (ex: `{{#EXEMPLOS}}`), iterará renderizando o conteúdo interno para cada item do array.
   ```mustache
   {{#TEM_INFO_GERAL}}
     <p>{{ CAMPO_SEMANTICO }}</p>
   {{/TEM_INFO_GERAL}}

   {{#SIGNIFICADOS}}
     <li>{{ TRADUCAO }}</li>
   {{/SIGNIFICADOS}}
   ```

## 3. Estruturas Especiais Injetadas por `template.html`

O arquivo principal `template.html` intercepta e enriquece os dados brutos do dicionário antes de passá-los aos templates (`adaptarDadosParaTemplate`). Aqui estão algumas estruturas adicionadas dinamicamente que você pode (e deve) usar:

1. **`TERMOS_MISTOS` (Variações e Áudios):** 
   Quando uma palavra possui variações (ex: `yõ ~ yõtam`) e múltiplos áudios correspondentes mapeados, `template.html` "fatia" a string e cria o array `TERMOS_MISTOS`.
   * Para acessar cada pedaço, use o loop `{{#TERMOS_MISTOS}}`.
   * Propriedades disponíveis dentro do loop: `TERMO_PARTE` (a palavra parcial), `TEM_AUDIO` (booleano), `URL` (link do áudio correspondente) e `NAO_E_O_ULTIMO` (booleano para imprimir o til `~` de separação).
   * **Sempre** forneça um *fallback* seguro usando o booleano de negação `{{#NAO_TEM_TERMOS_MISTOS}}` para dicionários que não usam variações:
     ```mustache
     {{#TEM_TERMOS_MISTOS}}
         {{#TERMOS_MISTOS}} {{ TERMO_PARTE }} ... {{/TERMOS_MISTOS}}
     {{/TEM_TERMOS_MISTOS}}
     {{#NAO_TEM_TERMOS_MISTOS}}
         {{ TERMO }}
     {{/NAO_TEM_TERMOS_MISTOS}}
     ```

2. **`TEM_VARIACOES_TRAY` (Espaçamento Inteligente):**
   Criada para resolver o acúmulo de margens verticais vazias. É um booleano que só é verdadeiro se a palavra possuir `TEM_INFO_GERAL`, `TEM_AUDIOS_ADICIONAIS` ou `TEM_PRONUNCIA`. Sempre abrace contêineres de variações (a *tray*) com essa chave (`{{#TEM_VARIACOES_TRAY}}`) para evitar renderizar `divs` fantasmas que geram buracos no layout.

3. **Hierarquia Rigorosa de `TEXTOS_ESTRUTURADOS`:**
   Diferente das mídias que ficam no escopo raiz do card, os blocos de `TEXTOS_ESTRUTURADOS` (ex: frases, áudios de exemplo, textos suplementares) estão anexados semanticamente a cada acepção.
   * **Regra:** O bloco `{{#TEXTOS_ESTRUTURADOS}}` deve existir obrigatoriamente **dentro** do laço `{{#SIGNIFICADOS}}`, logo antes do seu fechamento, e nunca no nível raiz do template.

## 4. Diretrizes para Modificação de Layouts
Sempre que for solicitado a mudar o design (focado nos arquivos `.tmpl` em `config/`), atente-se a:
1. Trabalhe **apenas** com as classes CSS (`template.html`) e a estrutura HTML interna dos `.tmpl`.
2. **Não edite** os scripts do núcleo a menos que explicitamente ordenado e ciente de que afetará a estabilidade do PWA e do Tauri. Contudo, alterações na função `adaptarDadosParaTemplate` dentro de `template.html` são permitidas e recomendadas para criar booleanos auxiliares (como `NAO_TEM_X`) que o renderizador falho exige.
3. Considere que uma palavra (Termo) do dicionário frequentemente possui **múltiplas instâncias de mídia e variações** (como vários áudios `AUDIOS_ARRAY`, várias `IMAGENS` com `LEGENDA`, vários `VIDEOS`). O design dos cards deve sempre ser *responsivo* a cenários onde arrays podem vir lotados de mídias (usar layouts carrossel/scroll, por exemplo, ou agrupamentos).
