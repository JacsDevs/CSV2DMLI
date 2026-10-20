# Implementação — Exportação HTML com mídias embutidas (vídeos pesados)

> Documento de referência das mudanças na exportação **"Site HTML" com a opção de embutir mídias**.
> Serve de base para futuras modificações e para voltar ao funcionamento original.
>
> Data: 19–20/10/2026 · Branch: `Jeann` · Commit base: `b51fd0e`
> **Nada foi commitado.** As mudanças estão só na cópia de trabalho.

---

## 1. Resumo

| Problema relatado | Causa | Situação |
|---|---|---|
| `Erro ao gerar HTML: Invalid string length` | O HTML inteiro, com todo o Base64, era montado como **uma única string**. O limite do V8 é ~512 MB. | **Resolvido.** Gravação em streaming, por partes. |
| Prévia lenta ou travando com mídias embutidas | A prévia usava o HTML final, com todo o Base64. | **Resolvido.** A prévia usa URLs `blob:`, como a prévia do gerador de APK. |
| "Salvar como" nunca abria para HTML | `accept` recebia `text/html;charset=utf-8`, que o Chrome rejeita. | **Resolvido.** |
| Download "Falha – Sistema ocupado" | Download padrão de um Blob gigante, montado com strings na memória. | **Resolvido.** Streaming + armazenamento temporário em disco. |
| HTML de 1,5 GB abria e dava *out of memory* | Base64 dos vídeos copiado várias vezes ao abrir (JS → template → `innerHTML` → atributo `src`). | **Resolvido.** Vídeos ficam em blocos inertes e são decodificados só ao tocar. |
| Geração "parava" sem avançar | O progresso só mudava ao concluir cada vídeo, e a finalização não mostrava nada. | **Diagnóstico melhorado.** Progresso em MB e logs por fase. |
| "…state had changed since it was read from disk" ao **ler** vídeo | O vídeo foi alterado, substituído ou movido no disco depois de carregado no projeto. | **Mensagem clara** com o nome do arquivo. Resolve recarregando a pasta. |
| Mesmo erro ao **finalizar** o arquivo | O Chrome falha ao concluir a gravação de arquivos enormes no local escolhido. Suspeita principal: o antivírus corporativo (Bitdefender). | **Contornado.** Se o local escolhido falhar, o arquivo é entregue pelo gerenciador de downloads. |

---

## 2. Funcionamento original (antes destas mudanças)

### 2.1 Fluxo

1. `index.html` → `window.gerarExportacao('html')` com o switch "embutir mídias" (`#swMidia`) ligado.
2. Chamava `exportador.exportarHtmlCards({ embutirMidias: true, metadados })`.
3. `ExportadorBase.gerarScriptsDadosEmLotes` (`packages/exporters/exportadorBase.js`):
   - converte **cada mídia** (áudio, imagem e vídeo) em data URL Base64 com `FileReader.readAsDataURL` do arquivo inteiro;
   - monta `window.DicionarioMidias = ${JSON.stringify(midias)}`, ou seja, **uma string com todo o Base64**;
   - monta os lotes `adicionaDados([...])` com `JSON.stringify` de 50 entradas por lote;
   - concatena tudo numa string `scripts`.
4. `ExportadorHtmlCards.exportar` encaixa `scripts` no template com `.replace(/{{ scripts_dados_js }}/, scriptsDados)` e devolve **uma string**.
5. A mesma string servia de prévia (`iframe` com `blob:`) e de conteúdo para baixar.
6. "Baixar" → `exportador.salvarArquivo(string)` → `new Blob([string])` → `platform.salvarArquivo`:
   - **Navegador:** `showSaveFilePicker` (falhava pelo `charset` no `accept`) → download padrão com `<a download>`.
   - **Tauri:** diálogo nativo + gravação em pedaços de 8 MB com `append`.
7. Ao abrir o HTML, o template (`config/templates/html-cards/template.html`) fazia `resolverMidia(nome)`, que devolvia o **Base64 inteiro**. Esse valor entrava no `processarTemplate` e no `innerHTML` (`<source src="data:...">`, `onclick="abrirModalVideoEntrada('data:...')"`).

### 2.2 Código original dos pontos alterados

**`exportadorBase.js` — final de `gerarScriptsDadosEmLotes`:**
```js
const jsonSeguro = (obj) => JSON.stringify(obj).replace(/<\//g, '<\\/');

const LOTES = 50;
let scripts = '<script>\n';
scripts += `window.DicionarioMidias = ${jsonSeguro(midias)};\n`;
scripts += `window.dadosDicionarioLexical = [];\n`;
scripts += `window.templateEntradaAtivo = "${tipoAtivo}";\n`;
if (this.templateEntrada) scripts += `window.templateEntrada = ${jsonSeguro(this.templateEntrada)};\n`;
if (this.templateCard) scripts += `window.templateCard = ${jsonSeguro(this.templateCard)};\n`;
if (this.templateLista) scripts += `window.templateLista = ${jsonSeguro(this.templateLista)};\n`;
scripts += `function adicionaDados(lote) { window.dadosDicionarioLexical.push(...lote); }\n`;
scripts += '<\/script>\n';

for (let i = 0; i < entradasConvertidas.length; i += LOTES) {
    const lote = entradasConvertidas.slice(i, i + LOTES);
    scripts += `<script>adicionaDados(${jsonSeguro(lote)});<\/script>\n`;
}

return scripts;
```
No mesmo arquivo, também no original:
- `arquivosParaConverter.push({ nome, arquivo })`, sem `tipo`;
- `midiasParaDados[nome] = (soNome && String(valor).startsWith('data:')) ? nome : valor;`.

**`exportadorHtmlCards.js` — final de `exportar`:**
```js
    .replace(/\{\{\s*corpo_dicionario\s*(\|\s*safe)?\s*\}\}/gi, corpoHtml)
    .replace(/\{\{\s*scripts_dados_js\s*(\|\s*safe)?\s*\}\}/gi, scriptsDados);

if (!html.includes('window.dadosDicionarioLexical')) {
    html = html.replace(/<\/body>\s*<\/html>/i, `${scriptsDados}\n</body>\n</html>`);
}
return html;
```
No mesmo arquivo, também no original:
- a chave de cache era `[limitePreview || 0, !!opcoes.embutirMidias, !!opcoes.midiasComoUrl, this.templatePrincipal.length]`;
- `gerarPartesDados` passava só `{ comoUrl, urlsCriadas }`.

**`index.html` — ramo HTML de `gerarExportacao`:**
```js
let htmlGerado;
const metadadosExport = coletarMetadadosExportacao();
htmlGerado = await window.exportador.exportarHtmlCards({ embutirMidias: embutir, metadados: metadadosExport });
// ...
} else {   // embutir === true
    conteudoParaBaixar = htmlGerado;
    mimeType = 'text/html;charset=utf-8';
    modalTitle = 'Pré-visualização do Site HTML';
    const previewBlob = new Blob([htmlPreview], { type: 'text/html;charset=utf-8' });
    const previewUrl = URL.createObjectURL(previewBlob);
    previewContentHtml = `<iframe style="width: 100%; height: 100%; border: none; background: white;" src="${previewUrl}"></iframe>`;
}
```

**`index.html` — `baixarArquivoGerado` (síncrona):**
```js
window.baixarArquivoGerado = function() {
    if (!window.arquivoParaBaixarAtual || !window.exportador) return;
    const { conteudo, nomeArquivo, mimeType } = window.arquivoParaBaixarAtual;
    if (conteudo instanceof Blob) {
        window.exportador.salvarArquivoBlob(conteudo, nomeArquivo);
    } else {
        window.exportador.salvarArquivo(conteudo, nomeArquivo, mimeType);
    }
    window.fecharModalGenerico();
};
```

**`index.html` — ouvinte de progresso e fechamento do modal:**
```js
window.addEventListener('exportacaoProgresso', (e) => {
    const { progresso, total } = e.detail;
    // ...
    loaderDesc.textContent = `Processando mídias (Base64): ${progresso}/${total} (${percent}%)`;
});

window.fecharModalGenerico = function() {
    document.getElementById('modalOverlay').style.display = 'none';
    const modalBox = document.getElementById('modalBox');
    modalBox.style.width = ''; modalBox.style.maxWidth = ''; modalBox.style.height = '';
};
```

**`packages/platform/browser.js` — `salvarArquivo`** (versão da cópia de trabalho antes desta sessão; ela já tinha alterações suas, não commitadas):
```js
async salvarArquivo(nomeArquivo, blob, { onProgress } = {}) {
    if (typeof window.showSaveFilePicker === 'function') {
        let handle;
        try {
            const ext = nomeArquivo.includes('.') ? nomeArquivo.split('.').pop() : '';
            handle = await window.showSaveFilePicker({
                suggestedName: nomeArquivo,
                types: ext ? [{
                    description: ext.toUpperCase(),
                    accept: { [blob.type || 'application/octet-stream']: [`.${ext}`] },
                }] : undefined,
            });
        } catch (err) {
            if (err && err.name === 'AbortError') {
                console.log('❌ Salvamento cancelado pelo usuário.');
                return false;
            }
            console.warn('Diálogo "Salvar como" indisponível, usando download padrão:', err);
            handle = null;
        }
        if (handle) {
            await this.#gravarEmStreaming(handle, blob, onProgress);
            console.log(`✅ Arquivo salvo (Modo Web): ${handle.name}`);
            return true;
        }
    }
    return this.#baixar(nomeArquivo, blob, onProgress);
}
```
No mesmo arquivo, também no original:
- `#baixar(nomeArquivo, blob, onProgress)` revogava a URL após 60 s;
- registrava `✅ Arquivo baixado (Modo Web)`;
- **não existiam** `abrirDestino`, `#escolherArquivo`, `#abrirTemporario` e `#removerTemporario`.

**`packages/platform/tauri.js`:** só tinha `salvarArquivo`, com o diálogo `plugin:dialog|save` dentro da função. Não existiam `abrirDestino` e `#escolherCaminho`.

**`config/templates/html-cards/template.html`:**
- `resolverMidia` só deixava passar `data:` e `blob:`;
- `abrirModalVideoEntrada(src, botao)` era **síncrona** e fazia `videoOverlayPlayer.src = src` direto;
- `obterUrlTocavel` não existia.

**`packages/android/previaHtml.js`:** só removia vídeos no formato `data:video/...` (`RE_DATA_URI`).

---

## 3. Arquitetura atual

### 3.1 Fluxo da exportação com mídias embutidas

```
[Exportar → Site HTML, "embutir mídias" ligado]
   │
   ├─ Prévia (rápida): exportarHtmlCards({ midiasComoUrl: true })
   │     mídias = URL blob: dos arquivos do VFS (sem Base64, sem copiar bytes)
   │     URLs revogadas ao fechar o modal (window._urlsPreviewExportacao)
   │
   └─ Clique em "Baixar":
         1. platform.abrirDestino()  ← o "Salvar como" abre AQUI, no gesto do clique
         2. exportador.gravarHtmlCardsEmbutido(destino)
              - exportar({ comoPartes, midiasPorMarcador }) → lista de strings pequenas
              - áudio/imagem: marcador curto → trocado na gravação pelo Base64 (pedaços de 6 MB)
              - vídeo: "midia:N" nos dados + blocos <script type="application/octet-stream">
                antes do </body> (1 bloco por pedaço de 6 MB = ~8 MB de texto)
         3. destino.fechar()
              - Navegador: arquivo temporário no OPFS → cópia para o local escolhido
                            ↳ se falhar: entrega o temporário pelo gerenciador de downloads
              - Tauri: gravação direta com append (sem temporário)
```

### 3.2 Formato do HTML gerado

```html
<script>
window.DicionarioMidias = {"audio.wav":"data:audio/wav;base64,UklG...","pron.mp4":"midia:0","video/galeria.mp4":"midia:1"};
window.dadosDicionarioLexical = [];
/* ... templates ... */
function adicionaDados(lote) { ... }
(function () { /* RUNTIME_MIDIAS_EMBUTIDAS: obterUrlMidiaEmbutida, ehMidiaEmbutida, listener de "play" */ })();
</script>
<script>adicionaDados([{...},{...}]);</script>
...
<script type="application/octet-stream" data-midia="0" data-tipo="video/mp4">AAAAIGZ0eXBpc29t...</script>
<script type="application/octet-stream" data-midia="1" data-tipo="video/mp4">...pedaço 1...</script>
<script type="application/octet-stream" data-midia="1" data-tipo="video/mp4">...pedaço 2...</script>
</body>
```

- **Áudios e imagens** continuam como `data:` inline. São pequenos e não mudaram de formato.
- **Vídeos:** os dados citam só `midia:N`. O mesmo arquivo citado por nomes diferentes é gravado **uma vez só**, o que acabou com a duplicação dos vídeos com pasta do CLDF.
- **Runtime** (`packages/exporters/runtimeMidiasEmbutidas.js`): só é injetado quando há vídeos embutidos.
  - `obterUrlMidiaEmbutida(id)` decodifica os blocos (`Uint8Array.fromBase64` ou `atob`), cria um `Blob` e uma URL `blob:` (com cache) e **remove os blocos da página** para liberar memória.
  - Um listener de `play` em fase de captura resolve qualquer `<video>`/`<source>` com `src="midia:N"`. Isso cobre as galerias sem mudar `entrada.tmpl` nem `lista.tmpl`.
  - O identificador também é aceito com pasta (`video/midia:3`), para templates antigos cujo `resolverMidia` não conhece `midia:`.

---

## 4. Modificações por arquivo

| Arquivo | Alterações | Tinha mudanças suas antes? |
|---|---|---|
| `packages/exporters/runtimeMidiasEmbutidas.js` | **Novo.** Script injetado no HTML para decodificar vídeos sob demanda. | — (novo) |
| `packages/exporters/exportadorBase.js` | `import` do runtime. `arquivosParaConverter` com `tipo`. Ramo `opcoesMidia.midiasPorMarcador`: áudio/imagem → marcador; vídeo → `midia:N`, com deduplicação por arquivo. `ehEmbutida` reconhece marcadores e `midia:N`. Scripts montados como **lista de partes** (serialização por mídia/entrada, saída idêntica byte a byte). Opção `comoPartes`. Injeção do runtime. | Não |
| `packages/exporters/exportadorHtmlCards.js` | Remove o script do Live Server do template (`carregarTemplates`). Repassa `comoPartes`/`midiasPorMarcador`. `exportar` com `comoPartes` devolve lista de strings (inserção por marcador, sem `.replace` com o conteúdo, o que também corrige o bug do `$&`). **Novo** `gravarEmbutido(destino, opcoes)`: gravação em streaming, Base64 em pedaços de 6 MB, blocos de vídeo antes do `</body>`, progresso em MB, logs por fase, erro de leitura com nome do arquivo. | Não |
| `packages/exporters/moduloExportacao.js` | **Novos** `abrirDestinoArquivo(nome, mime)` e `gravarHtmlCardsEmbutido(destino, opcoes)`. | Não |
| `packages/platform/browser.js` | `#escolherArquivo` (com o `charset` removido do `accept`). **Novo** `abrirDestino`: grava num temporário no OPFS (`csv2dmli-exportacao.tmp`), copia para o local escolhido e, se falhar, remove o arquivo vazio e entrega pelo download. `#abrirTemporario`/`#removerTemporario`. `#baixar` com tempo de revogação configurável (30 min para o temporário). Log "Download iniciado". | **Sim** |
| `packages/platform/tauri.js` | **Novo** `abrirDestino` (gravação em append via `plugin:fs\|write_file`). Diálogo extraído para `#escolherCaminho`. | **Sim** |
| `packages/android/previaHtml.js` | `RE_BLOCO_VIDEO`: remove os blocos de vídeo na prévia do APK a partir de "HTML pronto". | Não |
| `config/templates/html-cards/template.html` | `resolverMidia` deixa passar `midia:N`. **Novo** `obterUrlTocavel`. `abrirModalVideoEntrada` virou `async` e decodifica antes de tocar (cursor de espera; vale o último clique). | Não |
| `index.html` | Prévia com `midiasComoUrl` quando embute. `conteudoParaBaixar` vira função `(destino) => gravarHtmlCardsEmbutido(...)`. `baixarArquivoGerado` `async`: abre o destino no clique, mostra fases no loader, avisa se foi para Downloads e separa "erro ao gerar" de "erro ao finalizar". `fecharModalGenerico` revoga as URLs da prévia. O ouvinte `exportacaoProgresso` aceita `detail.mensagem`. | **Sim** |

O documento `IMPLEMENTACAO_HTML_MIDIAS_EMBUTIDAS.md` (este) é novo.

**Não foram alterados nesta sessão** (as mudanças que aparecem no `git status` já existiam): `packages/android/exportadorAndroid.js`, `static/css/style.css`, e os arquivos removidos `IMPLEMENTACAO_ARQUIVO_ENTRADA.md`, `IMPLEMENTACAO_DOWNLOAD_URL_CLDF.md` e `dicionario-cards-embutido.html`.

### 4.1 Contratos novos (para futuras modificações)

```js
// Plataforma (browser.js / tauri.js)
const destino = await platform.abrirDestino(nomeArquivo, mimeType); // null = cancelado
await destino.escrever(texto);            // string; chamado várias vezes
const r = await destino.fechar();         // { baixadoEmDownloads, erroLocalEscolhido? }
await destino.abortar();                  // em caso de erro

// Exportador
await exportador.gravarHtmlCardsEmbutido(destino, { metadados });
await exportadorCards.exportar({ comoPartes: true, midiasPorMarcador: { prefixo, mapa, videos } }); // → string[]

// Evento de progresso (detail.mensagem é opcional)
window.dispatchEvent(new CustomEvent('exportacaoProgresso', { detail: { progresso, total, mensagem } }));

// No HTML exportado (só com vídeos embutidos)
window.ehMidiaEmbutida('midia:3');          // true
await window.obterUrlMidiaEmbutida('midia:3'); // 'blob:...'
```

**Regra a preservar:** o `abrirDestino` precisa ser a **primeira espera** dentro do clique. O "Salvar como" exige gesto do usuário válido, que expira poucos segundos depois do clique.

---

## 5. Testes realizados

| Teste | Resultado |
|---|---|
| Saída da string antiga × nova (com/sem placeholder, com/sem embutir) | Idêntica byte a byte ao código do `HEAD`. |
| Streaming de áudio/imagem × HTML original | Idêntico (tamanhos 0, 1, 2, 3, ~6 MB ± 1, 13 MB; mídia sem tipo; nomes com pasta). |
| Código antigo com 500 MB de vídeo | `RangeError: Invalid string length` (reproduzido). |
| Streaming com 600 MB de vídeo | 800 MB gravados, pico de 51 MB de heap JS, conteúdo decodificado confere. |
| Vídeos em blocos (template real) | Blocos reconstroem os arquivos byte a byte; vídeo duplicado gravado 1×; áudio continua inline. |
| Chrome headless (`http://` e `file://`) | Vídeo de pronúncia e galeria tocam; blocos removidos após decodificar; sem erros no console. |
| Chrome headless, HTML de **1441 MB** (4 vídeos de 283 MB) | Abriu em 26 s sem *out of memory*; heap JS 10 MB; aba ~1,5 GB; play em 1,8 s; memória caiu após o play. |
| Prévia do APK ("HTML pronto") | Todos os blocos de vídeo removidos; áudio mantido. |
| Plataforma do navegador (Chrome, Área de Trabalho, Bitdefender ativo) | 320 MB: sem "Salvar como" → download OK; "Salvar como" falhando ao finalizar → download OK e arquivo vazio removido; "Salvar como" OK → arquivo íntegro. OPFS + download de 1,6 GB: OK. |

Os scripts de teste ficaram fora do projeto, na pasta temporária da sessão.

---

## 6. Limitações conhecidas

- **Abertura lenta:** o navegador lê o arquivo inteiro antes de mostrar a interface (o template inicializa no `DOMContentLoaded`). Isso dá ~26 s para 1,4 GB.
- **Primeiro play de cada vídeo:** espera a decodificação (~2 s para 280 MB).
- **Templates antigos ou personalizados:** templates salvos pelo editor (`localStorage csv2dmli_template_html`), `templateOLD*` e `old/` não têm a mudança em `abrirModalVideoEntrada`. O botão de pronúncia pode mostrar o toast "Não foi possível reproduzir" antes de tocar. As galerias funcionam pelo listener de `play`.
- **Templates com `{{ corpo_dicionario }}`:** ainda montam o corpo como string única.
- **Mídias são referências ao disco:** arquivo alterado, movido ou sincronizado depois de carregado → erro de leitura. É preciso recarregar a pasta do projeto.
- **Temporário no OPFS:** fica no perfil do navegador até a próxima exportação (tamanho ≈ HTML). Iniciar outra exportação embutida com um download ainda em andamento interrompe esse download.
- **Fallback para Downloads:** quando o local escolhido falha, o arquivo vai para a pasta de downloads do navegador, não para o local escolhido.
- **Firefox (sem "Salvar como"):** usa o temporário no OPFS + download. Sem OPFS, volta a acumular na memória.
- **Tauri:** em caso de erro, o arquivo parcial fica no disco.
- **Aviso de tamanho:** não foi adicionado nenhum aviso de tamanho nem sugestão de ZIP, por decisão sua.

---

## 7. Como reverter

> **Antes de qualquer reversão, salve o estado atual:** `git stash`, ou um commit numa branch nova (`git switch -c backup-midias-embutidas && git add -A && git commit`).

### 7.1 Arquivos que só têm mudanças desta implementação

Estes voltam ao original com segurança:
```bash
git checkout -- packages/exporters/exportadorBase.js \
                packages/exporters/exportadorHtmlCards.js \
                packages/exporters/moduloExportacao.js \
                packages/android/previaHtml.js \
                config/templates/html-cards/template.html
rm packages/exporters/runtimeMidiasEmbutidas.js
```

### 7.2 Arquivos com mudanças suas anteriores (NÃO usar `git checkout`)

`index.html`, `packages/platform/browser.js` e `packages/platform/tauri.js` já tinham alterações não commitadas antes desta sessão. `git checkout` apagaria esse trabalho também. Reverta **manualmente** os trechos da seção 4, usando o código original da seção 2.2:
- **`index.html`:** ramo HTML de `gerarExportacao`, `baixarArquivoGerado`, `fecharModalGenerico` e o ouvinte `exportacaoProgresso`.
- **`browser.js`:** restaurar `salvarArquivo`/`#baixar` e remover `abrirDestino`, `#escolherArquivo`, `#abrirTemporario`, `#removerTemporario` e os campos estáticos. **Recomendação:** manter a correção do `charset` no `accept`, porque sem ela o "Salvar como" nunca abre para HTML.
- **`tauri.js`:** remover `abrirDestino` e `#escolherCaminho` e devolver o diálogo para dentro de `salvarArquivo`.

### 7.3 Reversões parciais (manter parte das melhorias)

| Para desfazer só… | Faça |
|---|---|
| Vídeos em blocos (voltar a vídeo inline `data:`) | Em `gravarEmbutido`, criar `midiasPorMarcador` **sem** `videos: new Map()`. Os vídeos voltam a ser marcadores inline e o runtime deixa de ser injetado. O template continua compatível. |
| Temporário no OPFS (gravar direto no local escolhido) | Em `BrowserPlatform.abrirDestino`, remover o bloco `const temporario = await this.#abrirTemporario(); if (temporario) {...}`. |
| Prévia com `blob:` | No `index.html`, voltar a gerar `htmlGerado` com `embutirMidias: embutir`. Isso volta o gargalo da prévia. |
| Remoção do script do Live Server | Apagar o `replace` em `ExportadorHtmlCards.carregarTemplates`. |

### 7.4 Limpeza manual

- **Área de Trabalho:** podem ser apagados `dicionario-cards-embutido.html.crswap` (~1,6 GB), `dicionario-cards-embutido.html.1.crswap` (~72 MB) e `dicionario-cards-embutido.html` (0 bytes), sobras das tentativas que falharam.
- **Temporário do OPFS:** remover pelo console da página do app:
  ```js
  (await navigator.storage.getDirectory()).removeEntry('csv2dmli-exportacao.tmp')
  ```

---

## 8. Ideias para o futuro

- **Arquivos enormes:** recomendar o app desktop (Tauri), que grava direto no disco sem as verificações do navegador. Outra opção é pedir à TI uma exclusão do Bitdefender para a pasta de destino.
- **Modo híbrido:** embutir áudio e imagem, deixando os vídeos como arquivos ao lado do HTML ou como URLs remotas (`Download_URL` do CLDF).
- **Abertura mais rápida:** montar a interface antes do fim do *parse* (sem esperar o `DOMContentLoaded`), mostrando "carregando" nos vídeos cujos blocos ainda não chegaram.
- **Galerias:** usar miniatura ou botão "carregar vídeo" no lugar do `<video>` vazio, com indicação visual durante a decodificação.
- **ZIP:** usar `midiasComoUrl` também na prévia do ZIP, no lugar do `DOMParser` + injeção de `blobMap` em `index.html`.
- **Templates personalizados:** aplicar as mudanças de `resolverMidia`/`abrirModalVideoEntrada` nos templates salvos no `localStorage`.
