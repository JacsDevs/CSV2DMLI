# Implementação: `Download_URL` do CLDF como chave única de mídia

Registro do que foi alterado para que a coluna `Download_URL` da tabela
`media.csv` de um pacote CLDF seja usada como referência da mídia em todo o
fluxo: importação, Sistema de Arquivos Virtual (VFS), banco, HTML e ZIP/APK.

## Problema que motivou a mudança

O `Download_URL` já era lido pelo `leitorCLDF.js`, mas o caminho se perdia depois:

1. **O VFS guardava a mídia só pelo nome.** `adicionarArquivos` lia
   `arquivo.caminhoRelativo`, que ninguém preenchia. Dois arquivos com o mesmo
   nome em pastas diferentes colidiam, e o segundo era descartado sem aviso.
2. **O HTML sem mídia embutida apontava para um caminho que não existia no ZIP/APK.**
   O HTML usava o caminho do CLDF (`media/AUDIO/x.mp3`), mas o ZIP/APK gravava
   o arquivo em `audio/x.mp3`.
3. **A pronúncia podia pegar a mídia errada.** Era usado o primeiro `Media_ID`,
   de qualquer tipo (uma imagem ou PDF podia virar "áudio"), e o `Media_Type`
   era descartado.
4. **`Download_URL` remoto ou com query string não era tratado.** Em URLs
   `http(s)`, `file://` ou com `?download=1`, o tipo e o arquivo local não eram
   identificados.

## Fluxo após a mudança

```
Pasta importada: projeto/cldf/cldf-metadata.json
                 projeto/cldf/media/AUDIO/x.mp3

carregadorPasta → pastaBase = "cldf/"; arquivo.caminhoRelativo = "cldf/media/AUDIO/x.mp3"
leitorCLDF      → Download_URL "media/AUDIO/x.mp3" resolvido contra pastaBase → "cldf/media/AUDIO/x.mp3"
VFS             → chave "cldf/media/AUDIO/x.mp3" (busca exata)
exportadorBase  → HTML referencia "cldf/media/AUDIO/x.mp3" (a chave real no VFS)
index.html      → ZIP/APK grava em "cldf/media/AUDIO/x.mp3" (mesmo caminho)
```

## Alterações por arquivo

### 1. `packages/core/carregadorPasta.js`
- **Linhas 170-172**: `resultado.cldf` ganha `pastaBase` (pasta do metadata
  dentro da pasta importada) e `caminhosMidia` (lista das mídias presentes).
- **Linhas 251-253**: ao encontrar o `cldf-metadata.json`/`metadata.json`,
  calcula `pastaBase` (ex.: `"cldf/"`, ou `""` se o metadata estiver na raiz).
- **Linhas 327-333**: só em pacote CLDF, cada arquivo de mídia recebe
  `arquivo.caminhoRelativo` (caminho relativo à pasta raiz) e entra em
  `caminhosMidia`. Com isso o VFS passa a indexar pelo caminho.
  **Projetos não-CLDF (CSV nativo) não mudam**: continuam indexados pelo nome.
- **Linhas 348-351**: novo helper `_ehMidiaValida(extensao)`.

### 2. `packages/core/leitorCLDF.js`
- **Linha 1**: importa `ehUrlRemota`.
- **Linhas 8-61**, novo método `_resolverCaminhoMidia(m, pastaBase, ...)`.
  Resolve cada linha do `media.csv` nesta ordem:
  1. `Download_URL` relativo à pasta do metadata (spec CLDF), com `./`/`..`
     normalizados, `%xx` decodificado e query string/fragmento removidos;
  2. `Download_URL` como está e `Name` (com e sem `pastaBase`);
  3. só o nome do arquivo, **apenas se for único na pasta** (evita pegar a
     mídia de outra entrada);
  4. URL `http(s)` mantida como remota, se não houver arquivo local;
  5. caso contrário, o caminho resolvido (será reportado como faltante).

  `file:///…` aproveita só o nome do arquivo. A comparação de caminhos ignora
  maiúsculas/minúsculas e sempre devolve o caminho real do arquivo.
- **Linhas 63-80**, novo método `_tipoDaMidia(mediaType, caminho)`. Usa o
  `Media_Type` e, se ele faltar ou não for reconhecido, a extensão (via
  `config.json`). Retorna `audio`/`video`/`imagem`/`unknown`.
- **Linha 95**: `carregarCldf` recebe `pastaBase` e `caminhosMidia`.
- **Linhas 109-138**: índices `midiasPorCaminho`/`midiasPorNome`; o
  `mediaMap` passa a usar os dois métodos acima; novo helper
  `primeiraMidiaDoTipo(registro, tipos)` e a constante
  `TIPOS_PRONUNCIA = ['audio', 'video']`.
- **Linhas 207-209 (Entry)** e **346-348 (Form)**: `ARQUIVO_ENTRADA` passa a
  ser a primeira mídia de **áudio ou vídeo**, e não mais o primeiro `Media_ID`
  de qualquer tipo.
- **Linhas 330-331, 401, 413**: `tiposMidiaVariacoes` guarda o tipo da mídia
  de cada variação, alinhado por índice. Form sem mídia própria herda o tipo
  da mídia da Entry.
- **Linhas 422-423 (Example)**: o áudio de exemplo usa a primeira mídia do
  tipo `audio`.
- **Linhas 438-443**: cada variação estruturada ganha o campo `audioTipo`
  (`'audio'|'video'|''`). Ele não vai para `camposBasicos`, então não aparece
  como coluna no editor.

### 3. `packages/core/helpers.js`
- **Linhas 31-33**: `detectarTipoMidia` ignora query string/fragmento antes
  de extrair a extensão (ex.: `sol.mp3?download=1` → `mp3`).
- **Linhas 41-50**: novo helper exportado `ehUrlRemota(referencia)`
  (`http://`/`https://`).

### 4. `packages/core/sistemaArquivosVirtual.js`
- **Linhas 254-297**: a busca foi extraída para o novo método
  `obterChave(tipo, nome)`, que devolve a **chave** sob a qual a mídia está
  guardada. `obterArquivo` passa a usá-lo, com a mesma ordem de busca
  (exata → sufixo → caminho reverso → só o nome). Foi removida a comparação
  `chave === nomeBuscado` dentro do laço, que repetia o `has()` anterior.

### 5. `packages/core/construtorBancoDados.js`
- **Linha 1**: importa `ehUrlRemota`.
- **Linhas 152-165**: na montagem das variações:
  - o tipo declarado na origem (`v.audioTipo`, vindo do `Media_Type`) tem
    prioridade sobre a extensão;
  - se o arquivo não estiver no balde do tipo declarado, procura no outro.
    Exemplo: `.webm` com `Media_Type: audio/webm` é guardado no balde de vídeo
    porque a extensão só consta em `midias.video`;
  - URL remota conta como existente e não passa pelo VFS.
- **Linha 174**: `ARQUIVO_ENTRADA_URL` usa a própria URL quando remota.

### 6. `packages/exporters/exportadorBase.js` (`gerarScriptsDadosEmLotes`)
- **Linhas 1-2**: importa `ehUrlRemota`.
- **Linhas 215-219 (modo embutido)**: URL remota é referenciada diretamente,
  sem tentar embutir.
- **Linhas 264-277 (modo não embutido)**: o caminho gravado no HTML vem da
  **chave real no VFS** (`vfs.obterChave`). Chave com pasta (CLDF) é mantida;
  chave só com o nome vai para `audio/`, `foto/` ou `video/`. É a mesma regra
  usada para gravar o ZIP/APK, então o HTML sempre aponta para onde o arquivo
  está. Se o VFS não tiver `obterChave` (o `vfsStub` do `tools/build-bundle.mjs`),
  vale o comportamento anterior.

### 7. `index.html`
- **Linhas 1885-1891**: nova função `caminhoMidiaExportada(dirName, chave)`,
  a regra de caminho de mídia no pacote exportado.
- **Linha 2189 (ZIP do HTML sem mídia embutida)** e **linha 3414 (APK/AAB)**:
  usam `caminhoMidiaExportada` em vez de `${dirName}/${nome}` fixo.
- **Linhas 2212-2216 (pré-visualização, `<img>/<audio>/<video>`)**: procura
  primeiro pelo caminho completo e depois pelo nome do arquivo.
- **Linhas 2232-2236 e 2253-2255 (pré-visualização, dados JS)**: o `blobMap`
  é indexado pelo caminho completo **e** pelo nome, e a substituição tenta o
  caminho completo primeiro.

### 8. `packages/exporters/exportadorZip.js` (backup do projeto)
- **Linhas 35-38**: grava a mídia só pelo nome do arquivo
  (`audio/x.mp3`), como antes. É necessário porque a reimportação do backup
  (`projeto.json`) só aceita mídia diretamente em `audio/`, `foto/` ou
  `video/`. O HTML gerado depois da reimportação continua correto: o item 6
  usa a chave real (`x.mp3` → `audio/x.mp3`).

## O que **não** foi alterado
- **Fluxo CSV nativo**: as chaves do VFS continuam sendo só o nome do arquivo,
  e o caminho no HTML/ZIP (`audio/x.mp3`) é o mesmo de antes.
- **`config.json`**: nenhuma mudança. O alias
  `"ARQUIVO_ENTRADA": ["ARQUIVO_ENTRADA", "ARQUIVO_SONORO"]` vale só para CSV;
  o leitor CLDF grava `ARQUIVO_ENTRADA` diretamente.
- **`tools/build-bundle.mjs`**: trabalha só com CSV e mantém o comportamento
  anterior.
- **Imagens, vídeos ilustrativos (`ARQUIVO_VIDEO`) e áudios de exemplo**
  também passam a vir do `Download_URL` resolvido e indexado pelo caminho.
  URL remota, porém, só é tratada como existente em `ARQUIVO_ENTRADA`.
- **Pendências do diagnóstico anterior, fora deste escopo:**
  - desalinhamento `TERMO` × `AUDIO` quando uma variação não tem mídia;
  - botão exibido para mídia faltante;
  - classificação de `m4a/flac/mkv` na exportação CLDF (`exportadorCLDF.addMedia`);
  - blob URLs não revogadas a cada `_reconstruirBanco()`.

## Verificação
- `node --check` em todos os `.js` alterados e no `<script type="module">`
  do `index.html`: OK.
- Teste de ponta a ponta em Node (fora do repositório), com pacote CLDF
  simulado (`projeto/cldf/…`) passando por `LeitorCLDF` → VFS →
  `ConstrutorBancoDados` → `ExportadorBase` (sem mídia embutida). **14/14
  verificações passaram**, cobrindo:
  - imagem listada antes do áudio na Entry é ignorada;
  - dois `som.mp3` em pastas diferentes não colidem, e cada Form recebe o seu;
  - vídeo identificado pelo `Media_Type`;
  - `Download_URL` com `./`, `%2F`, `file://` e `https://…?download=1`;
  - nenhuma mídia faltante no banco;
  - todo caminho do HTML existe no ZIP;
  - backup reimportado (VFS só com nomes) gera `video/rio.mp4`.
- **Não testado no navegador.** Recomenda-se importar um pacote CLDF real e
  conferir a pré-visualização, o ZIP sem mídia embutida e o APK.
