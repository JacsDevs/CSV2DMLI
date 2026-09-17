# Implementação: `ARQUIVO_ENTRADA` (áudio + vídeo de pronúncia)

Registro do que foi implementado para permitir que a coluna de pronúncia do CSV
aceite tanto o nome antigo (`ARQUIVO_SONORO`) quanto o novo (`ARQUIVO_ENTRADA`),
passando a suportar mídia em vídeo além de áudio, com identificação automática
do tipo, ícones diferenciados (alto-falante/play) e modal de vídeo com autoplay.

Escopo: apenas a coluna principal de pronúncia (a usada em variações do item
lexical). `ARQUIVO_SONORO_EXEMPLO` (áudio de frase-exemplo) e `VAR_i_AUDIO`
(variações numeradas) não foram alterados — continuam só-áudio.

## 1. `config/config.json`
- `colunas.mapeamento.ARQUIVO_ENTRADA` agora é uma lista de aliases aceitos —
  `["ARQUIVO_ENTRADA", "ARQUIVO_SONORO"]` — em vez do mapeamento 1:1 anterior
  (`"ARQUIVO_SONORO": "ARQUIVO_SONORO"`). `ARQUIVO_ENTRADA` tem prioridade sobre
  `ARQUIVO_SONORO` se as duas colunas existirem no mesmo CSV.

## 2. `packages/core/configurador.js`
- Novo método `resolverAliasColuna(linhaCrua)`: aplica `colunas.mapeamento` a
  uma linha crua do CSV, preenchendo cada campo canônico a partir do primeiro
  alias presente (aceita valor string único — legado — ou array de aliases).
  Esse método passa a ser o motor central de resolução de nome de coluna, lido
  diretamente do `config.json`.

## 3. `packages/core/helpers.js`
- Novo helper `detectarTipoMidia(nomeArquivo, configurador)`: retorna
  `'audio'`, `'video'` ou `'desconhecido'` com base na extensão do arquivo,
  consultando `midias.audio.extensoes`/`midias.video.extensoes` do
  `config.json` via `configurador.isExtensaoValida()`. Fallback para `'audio'`
  quando não há configurador ou a extensão não é reconhecida.

## 4. `packages/core/gerenciadorDados.js`
- `carregarPlanilha()`: aplica `configurador.resolverAliasColuna()` em cada
  linha crua do CSV antes de normalizar. As leituras de `ARQUIVO_SONORO` para
  montar as variações passam a ler `ARQUIVO_ENTRADA`.
- `exportar('csv')` (exportação/round-trip da planilha): coluna gerada
  renomeada de `ARQUIVO_SONORO` para `ARQUIVO_ENTRADA`.
- A whitelist de "colunas conhecidas" (usada para separar campos extras) já
  lia `Object.keys(configurador.getMapeamentoColunas())` — passa a incluir
  `ARQUIVO_ENTRADA` automaticamente, sem mudança de código ali.

## 5. `packages/core/leitorCLDF.js` (importação de pacotes CLDF)
- `mediaMap`: passa a reconhecer `Media_Type` contendo `"video"` (antes só
  detectava áudio e imagem; mídia de vídeo caía em `type: 'unknown'`).
- Campo `ARQUIVO_SONORO` renomeado para `ARQUIVO_ENTRADA` nas três linhas onde
  era montado (entrada base, variação de `Form`, e no mapeamento final para
  `variacoesEstruturadas`).

## 6. `packages/core/construtorBancoDados.js`
- Bloco de construção das variações: calcula `tipoMidiaEntrada` via
  `detectarTipoMidia()` e usa esse tipo (em vez de `'audio'` fixo) para
  validar existência (`validarEContarMidia`) e resolver a URL
  (`obterMidiaUrl`) — isso é o que faz o sistema procurar o arquivo na pasta
  certa (`audio/` ou `video/`) dentro do Sistema de Arquivos Virtual.
- Campos da variação renomeados/adicionados: `ARQUIVO_SONORO` →
  `ARQUIVO_ENTRADA`, `ARQUIVO_SONORO_EXISTE` → `ARQUIVO_ENTRADA_EXISTE`,
  `ARQUIVO_SONORO_URL` → `ARQUIVO_ENTRADA_URL`, mais o novo
  `ARQUIVO_ENTRADA_TIPO` (`'audio'`|`'video'`).
- `limparUrlsTemporarias()`: passa a revogar também `ARQUIVO_ENTRADA_URL`
  (mantendo a revogação de `ARQUIVO_SONORO_URL` do áudio de exemplo).

## 7. `packages/exporters/exportadorBase.js`
- `extrairDadosEntrada()`: monta um mapa `nome → tipo` por variação; o campo
  exportado `AUDIO` (string `~`-separada, mantido por compatibilidade com o
  restante do pipeline) ganha um companheiro `AUDIO_TIPOS` (também
  `~`-separado, alinhado por índice) com o tipo de cada mídia. O prefixo de
  caminho de fallback agora é `video/` quando o tipo é vídeo (antes sempre
  `audio/`).
- `gerarScriptsDadosEmLotes()`: **correção do bug real da "pasta errada"** — a
  coleta de mídias referenciadas (`referenciadas.audio.add(...)`) jogava
  incondicionalmente a mídia de pronúncia no balde de áudio. Agora usa
  `v.ARQUIVO_ENTRADA_TIPO` para decidir o balde (`audio` ou `video`) antes de
  embutir/copiar a mídia na exportação estática.

## 8. `packages/exporters/exportadorCLDF.js` (exportação de volta para CLDF)
- `v.ARQUIVO_SONORO_URL`/`v.ARQUIVO_SONORO` → `v.ARQUIVO_ENTRADA_URL`/
  `v.ARQUIVO_ENTRADA` na montagem do `media.csv`. A função `addMedia()` já
  detectava áudio/vídeo por extensão sozinha — nenhuma mudança de lógica.

## 9. `config/templates/html-cards/template.html`
- Novo ícone SVG `#ic-play` no sprite (ao lado de `#ic-som`/`#ic-pausa`).
- Novo modal de vídeo (`#video-overlay`, `#video-overlay-player`,
  `#video-overlay-fechar`), com CSS análogo ao lightbox de imagens já
  existente.
- Novas funções JS: `abrirModalVideoEntrada(src)` (autoplay ao abrir, exposta
  em `window.abrirModalVideoEntrada`) e `fecharModalVideoEntrada()` (fecha e
  libera o `<video>`). `player.addEventListener('ended', ...)` fecha o modal
  automaticamente ao final da reprodução.
- Exclusão mútua: abrir o modal de vídeo pausa o áudio tocando (e
  vice-versa: `tocarAudio()` fecha o modal de vídeo se estiver aberto).
- Registro do overlay de vídeo nos handlers globais existentes: tecla
  `Escape`, navegação por `Tab` (focus trap) e a checagem que libera o scroll
  do `body` quando nenhum modal está mais aberto.
- `adaptarDadosParaTemplate()`: `AUDIOS_ARRAY` e `TERMOS_MISTOS` passam a
  carregar, por item, os booleanos exclusivos `TEM_AUDIO`/`TEM_VIDEO` (padrão
  já usado no projeto para contornar a ausência de seções invertidas no motor
  de template) e a URL é resolvida com o tipo correto via `resolverMidia`.
  Também ganham `TIPO_PRIMEIRO`/`TEM_AUDIO_PRIMEIRO`/`TEM_VIDEO_PRIMEIRO`
  (usados pelo botão único do `card.tmpl`).
- Modo reverso (dicionário por tradução): `TEM_AUDIO_REVERSO` ganhou o par
  `TEM_VIDEO_REVERSO`, também resolvido pelo tipo real da mídia.

## 10. Templates `.tmpl`
- **`entrada.tmpl`**: todo botão de pronúncia (termo principal, termos
  mistos/variações com `~`, e modo reverso) ganhou o par
  `{{#TEM_AUDIO}}`/`{{#TEM_VIDEO}}`, com o botão de vídeo usando o ícone
  `#ic-play` e chamando `abrirModalVideoEntrada(...)` em vez de
  `tocarAudio(...)`.
- **`card.tmpl`**: botão único trocado de `{{#AUDIO}}` para
  `{{#TEM_AUDIO_PRIMEIRO}}`/`{{#TEM_VIDEO_PRIMEIRO}}`.
- **`lista.tmpl`** (visualização alternativa "lista"): mesmo tratamento
  aplicado em todos os pontos equivalentes (termo principal, termos mistos,
  variações adicionais, modo reverso).
- Os templates em `config/templates/html-cards/old/` (legados, não usados
  pelo pipeline de exportação atual) não foram alterados.

## 11. `packages/exporters/validadorDados.js`
- `validarEdicao()`: `verificarMidia(...)` da variação passa a usar o tipo
  detectado dinamicamente em vez de `'audio'` fixo — evita reportar um vídeo
  válido como "não carregado" por procurar no balde errado da VFS.
- `diagnosticar()`: campo `ARQUIVO_SONORO` → `ARQUIVO_ENTRADA`; a contagem de
  mídias referenciadas para cruzamento agora classifica cada arquivo de
  `ARQUIVO_ENTRADA` por extensão real (áudio ou vídeo) antes de somar no mapa
  correspondente, em vez de assumir sempre áudio.

## 12. `tools/build-bundle.mjs` (script Node de build estático)
- `applyMapping()` passa a suportar valor-array no mapeamento de colunas
  (mesma regra do `Configurador`), lendo diretamente do `config.json` do
  projeto de entrada.
- `lm.ARQUIVO_SONORO` → `lm.ARQUIVO_ENTRADA` na normalização de linha.
- Novo `configuradorStub` (objeto mínimo com `isExtensaoValida`) passado para
  `ConstrutorBancoDados`, para que a detecção de tipo por extensão funcione
  também neste script (que roda fora do navegador, sem a classe
  `Configurador` completa).
- Correção do mesmo bug de balde de mídia do item 7, adaptada para este
  script (classifica por `v.ARQUIVO_ENTRADA_TIPO` antes de copiar o arquivo
  para `audio/` ou `video/` na pasta de saída).

## O que **não** foi alterado
- `ARQUIVO_SONORO_EXEMPLO` (áudio de frase-exemplo) e `VAR_i_AUDIO`
  (variações numeradas legadas) continuam só-áudio, sem mudança de nome ou
  comportamento — fora do escopo definido.
- `ARQUIVO_VIDEO` (vídeo ilustrativo por acepção, já existente) não foi
  tocado — é um conceito independente do vídeo de pronúncia.
- UI de importação de mídias em `index.html` (painéis "Áudios"/"Vídeos"): não
  precisou de mudança — já são baldes separados que classificam por extensão
  automaticamente; um vídeo de pronúncia deve ser importado pelo painel
  "Vídeos" já existente.
- Templates em `config/templates/html-cards/old/` (não usados pelo pipeline
  atual) e demais exportadores (Typst, LaTeX) não referenciavam a coluna de
  pronúncia com player interativo — não precisaram de alteração.

## Verificação
- Sintaxe validada com `node --check` em todos os arquivos `.js`/`.mjs`
  modificados e nos blocos `<script>` inline de `template.html`.
- `config/config.json` validado como JSON.
- Testes funcionais (importar CSV com `ARQUIVO_SONORO` e com `ARQUIVO_ENTRADA`,
  áudio e vídeo, exportação estática, diagnóstico) não foram executados nesta
  sessão — recomenda-se testar manualmente na aplicação antes de publicar.
