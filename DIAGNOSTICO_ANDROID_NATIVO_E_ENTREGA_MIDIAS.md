# Diagnóstico — App Android nativo e entrega de mídias após a instalação

> Documento de diagnóstico. **Nenhum código foi alterado.**
> Escopo: (A) viabilidade de trocar o template Android atual (WebView exibindo um
> HTML com mídias em pasta) por um app nativo com telas próprias, alimentado só
> pelos dados e mídias do projeto; (B) entrega das mídias depois da instalação
> (Play Asset Delivery *fast-follow* / *on-demand*) para projetos acima de ~1 GB,
> com opção de baixar tudo para uso offline, e se o HTML embutido consegue lidar
> com isso ou se é preciso um app totalmente nativo; (C) divisão das mídias em
> etapas (imagens → áudios → vídeos) entre *install-time*, *fast-follow* e
> *on-demand*, e o template nativo como opção ao template WebView.
>
> Data: 28/10/2026 · Branch analisada: `html-midias-embutidas`

---

## 1. Resumo executivo

| Pergunta | Resposta curta |
|---|---|
| O app pode ser nativo (telas, barras, navegação próprias) com o sistema injetando só dados e mídias? | **Sim.** O pipeline de geração (injeção, manifesto, assinatura, PAD) não depende do que o app faz por dentro. |
| O que o sistema perde com isso? | A **personalização por HTML/CSS** (templates customizados) e o modo **"HTML pronto"** no app; prévia e capturas de tela precisam ser refeitas. Passam a existir **duas interfaces** para manter. |
| Entregar mídias depois da instalação faz sentido para projetos > 1 GB? | **Sim**, no modo **on-demand** do Play Asset Delivery, com botão "Baixar todas as mídias". O *fast-follow* ajuda pouco: baixa tudo automaticamente logo após instalar. |
| O HTML embutido consegue lidar com o download sob demanda? | **Sim.** As funções do sistema ficam numa **ponte Java** na `MainActivity`; o HTML só chama essa ponte. **Não é preciso app totalmente nativo.** |
| E o APK de instalação direta? | PAD só existe via Google Play. O APK continua com as mídias embutidas (ou usaria um servidor próprio). |

**Recomendação:** (1) manter o app em HTML e, para projetos com mídias acima de ~1 GB, adotar PAD *on-demand* com ponte Java; (2) se um app nativo for desejado, fazê-lo como **template alternativo** ("App nativo" / "App HTML"), ou no modelo **híbrido** (navegação nativa + entrada renderizada pelo `entrada.tmpl`), sem substituir o atual; (3) antes de qualquer um dos dois, fixar um `dados.json` versionado como contrato entre o sistema e o app.

---

## 2. Estado atual

| Peça | Situação |
|---|---|
| `android-template/app/src/main/java/.../MainActivity.java` | `Activity` simples com uma `WebView` que carrega `file:///android_asset/index.html`. Sem AndroidX. `minSdk 21`, `targetSdk 36`. |
| `vendor/android/template.{apk,aab}` | ~19 KB / ~14 KB, compilados pelo CI (`.github/workflows/android-template.yml`). |
| `packages/android/injetorAab.js` | Substitui `assets/` (APK) ou `base/assets/` (AAB); acima de ~450 MB, coloca as mídias no `midia_pack` (*install-time*). |
| `packages/android/patcherManifest*.js` | Ajusta `package`, `label`, `versionCode`/`versionName` (AXML no APK, protobuf no AAB). |
| `packages/exporters/exportadorHtmlCards.js` | Gera o HTML a partir de `template.html` + `entrada.tmpl` / `card.tmpl` / `lista.tmpl` + CSS. Os dados vão como JSON em `window.dadosDicionarioLexical`. |
| `packages/exporters/exportadorBase.js:63` (`extrairDadosEntrada`) | Converte o banco em objetos por entrada (variações, acepções, exemplos, imagens, vídeos, áudios, textos estruturados). |
| `index.html:2726` | Sistema de templates customizados: o usuário envia `.tmpl`/CSS próprios (guardados no `localStorage`). |
| `index.html` (~l. 3788) | Modo "HTML pronto": o usuário pode fornecer um `.html`/pasta próprios para o app. |
| `packages/android/previaHtml.js`, `geradorCapturas.js` | Prévia no assistente e capturas para a Play, ambas renderizando o HTML (DOM → canvas). |

Funções do app atual (em `template.html`, ~4.300 linhas): busca normalizada, filtros, categorias, favoritos, tema claro/escuro, densidade, preferências de acessibilidade, VLibras (online), lightbox, vídeo em modal, áudio de entrada e de exemplo.

---

## 3. Parte A — App nativo

### 3.1 Arquitetura proposta

```
assets/
  config.json        ← nome, cores do tema, textos da interface, metadados
  dados.json         ← entradas já convertidas (o mesmo JSON que hoje vai dentro do HTML)
  audio/ foto/ video/   ← sem mudança (inclusive no midia_pack)
```

- **Interface:** Kotlin + Jetpack Compose + Material 3. Telas: inicial, lista (`LazyColumn`, virtualizada), detalhe da entrada, categorias, favoritos, configurações; barra superior, barra de navegação, voltar por gesto.
- **Busca:** no primeiro uso, importar `dados.json` para SQLite com **FTS4** (disponível no SQLite de todos os aparelhos; FTS5 não é garantido). Para dicionários pequenos, índice em memória basta.
- **Mídia:** Media3/ExoPlayer lendo `asset:///`; Coil para imagens. O `BundleConfig.pb` já marca as mídias como não comprimidas, o que permite *seek* sem cópia.
- **Personalização por projeto:** toda em `config.json`, aplicada em tempo de execução. Alterar `resources.arsc` / `resources.pb` pelo navegador seria frágil; o manifesto continua sendo o único arquivo binário ajustado.
- **Sem código nativo (`.so`):** sem o decoder FFmpeg do Media3, o app fica fora da exigência de páginas de memória de 16 KB da Google Play (que vale para apps com bibliotecas nativas).

### 3.2 Impacto no sistema

| Componente | Impacto |
|---|---|
| `injetorAab.js`, assinadores, `zipalign.js`, `montadorPacote.js`, PAD | **Nenhum ou mínimo.** Muda só o que é injetado (JSON em vez de HTML). |
| `patcherManifest*.js` | Nenhum. |
| Fluxo do assistente em `index.html` | Pequeno: gerar `dados.json` + `config.json` reaproveitando `extrairDadosEntrada`, em vez de `exportarHtmlCards()`. |
| Modo "HTML pronto" | **Deixa de funcionar no app nativo.** |
| Templates customizados (`.tmpl`/CSS) | **Deixam de valer para o app** (continuam na exportação HTML). |
| `previaHtml.js` | Mostraria o HTML, não o app real: precisa de uma prévia aproximada. |
| `geradorCapturas.js` | Quebra: precisa de uma prévia HTML que imite o app ou capturas feitas em emulador no CI. |
| Tamanho do template | De ~20 KB para ~3–6 MB (com R8). Irrelevante perto das mídias. |
| `minSdk` | De 21 para **23**: desde 2025, AndroidX, Compose (BOM 2025.12+) e Media3 1.9+ exigem API 23. Perda residual (Android 5.x). |

### 3.3 Ganhos e custos

**Ganhos:**
- Desempenho em dicionários grandes: hoje todos os dados ficam em JavaScript na memória da WebView; no nativo, lista virtualizada e busca no SQLite.
- Experiência de app real: Material You, tema do sistema, voltar por gesto, transições, tela de abertura.
- Acessibilidade nativa (TalkBack, escala de fonte do sistema).
- Mídia mais robusta (foco de áudio, tela cheia, retomada).
- Menos dependência da WebView e de `file://` com `setAllowFileAccess`, que está sendo desestimulado.
- Menor risco na revisão da Play: apps que são só uma WebView às vezes caem na regra de "funcionalidade mínima".

**Custos:**
- Duas interfaces para manter; cada função nova da exportação HTML precisa ser reescrita em Kotlin, e as duas tendem a se distanciar.
- Exige conhecimento de Android/Kotlin; o projeto hoje é todo JS e o Java existente tem ~40 linhas.
- Perda da personalização por HTML/CSS e do modo "HTML pronto".
- VLibras é um plugin web: exigiria uma WebView dedicada ou seria removido.
- Prévia e capturas precisam ser refeitas.

### 3.4 Caminhos possíveis

| Opção | Esforço | Mantém personalização? | Ganho |
|---|---|---|---|
| **A.** Manter a WebView e melhorá-la (`WebViewAssetLoader`, barra de status e voltar nativos) | Baixo | Sim | Pequeno a médio |
| **B.** Híbrido: navegação, barras, busca e lista nativas; detalhe da entrada renderizado pelo `entrada.tmpl` numa WebView | Médio | Em parte (tela da entrada) | Médio a alto |
| **C.** Totalmente nativo (Compose + JSON/SQLite + Media3) | Alto | Não | Alto |

Se a personalização importa para os usuários, **B**. Se o objetivo é um app padronizado e o mais refinado possível, **C**, como template alternativo: `exportadorAndroid.js` já busca o template por URL, então trocar de template é barato.

---

## 4. Parte B — Entrega das mídias após a instalação

### 4.1 Modos do Play Asset Delivery

| Modo | Quando baixa | Tamanho na loja / 1º download | Código no app? | Uso |
|---|---|---|---|---|
| ***install-time*** (atual) | Junto com o app | Tudo (> 1 GB) | Não | Mídias essenciais e leves |
| ***fast-follow*** | Logo após instalar, sem perguntar | Menor | Sim (tolerar mídia ainda ausente) | Só abrir o app mais cedo. **Não economiza dados nem espaço.** |
| ***on-demand*** | Quando o app pede | Pequeno | Sim | **Caso dos projetos grandes:** o usuário escolhe se e quando baixar |

Limites da Play (ver `DIAGNOSTICO_ANDROID_GRANDES_PROJETOS.md` e `limitesTamanho.js`): cada pacote até **1,5 GB**; *fast-follow* + *on-demand* somados até **30 GB**. Um projeto de 3 GB precisa de pelo menos 2 pacotes.

### 4.2 Limitações do PAD

1. **A unidade de download é o pacote, não o arquivo.** Os pacotes têm nomes fixos e há limite de quantidade por app; não dá para baixar só o vídeo de uma entrada. O agrupamento é por tipo de mídia, categoria ou blocos de até 1,5 GB.
2. **Só funciona com instalação pela Google Play.** O APK de `instalar-direto/` não tem PAD.
3. **Pacotes *on-demand* não ficam em `file:///android_asset/`.** São extraídos no armazenamento interno; o caminho só é conhecido após o download, via `AssetPackManager.getPackLocation(...).assetsPath()`.
4. **Downloads grandes por dados móveis** exigem confirmação do usuário (`REQUIRES_USER_CONFIRMATION` / `WAITING_FOR_WIFI` → `showConfirmationDialog(activity)`), o que exige uma `Activity` (a `MainActivity` já é uma).
5. **Teste local** com `bundletool --local-testing`.

### 4.3 O HTML embutido consegue lidar? Sim, com uma ponte Java

```
HTML (botão "Baixar tudo", ícones de mídia)
   │  window.Midias.baixar(['midia_video_1', ...]) / estado() / remover()
   ▼
MainActivity (Java, ~300–500 linhas)
   ├─ AssetPackManager: fetch, getPackStates, registerListener, removePack
   ├─ showConfirmationDialog (dados móveis), verificação de espaço livre
   └─ webView.evaluateJavascript("Midias.onProgresso(...)")  → barra de progresso no HTML
```

| Função | Onde roda | Viável no modelo atual? |
|---|---|---|
| Botão "Baixar todas as mídias" com tamanho total e progresso | Botão no HTML, download em Java | Sim |
| Mostrar "não baixado" em cada mídia e baixar o pacote dela ao tocar | HTML, a partir de um `midias-index.json` (arquivo → pacote) | Sim |
| Tocar vídeo/áudio depois de baixado | HTML, recebendo o caminho real pela ponte | Sim (ver cuidado abaixo) |
| "Remover mídias offline" | `removePack` em Java | Sim |
| Download em segundo plano com o app fechado | Gerenciado pela própria Play | Sim |
| Erros: sem rede, sem espaço, app não instalado pela Play | Códigos de erro em Java, mostrados no HTML | Sim |

**Cuidado com vídeo:** abrir o arquivo baixado direto pelo caminho em disco (`file:///data/.../assetpacks/...`), como os assets são abertos hoje. Se passar por `shouldInterceptRequest` / `WebViewAssetLoader`, a WebView não recebe requisições `Range` corretas e o *seek* falha. A página já é carregada via `file://` com `setAllowFileAccess(true)`.

**Ponto de apoio no HTML atual:** `obterUrlTocavel(src)` (`config/templates/html-cards/template.html:3076`) já é a função assíncrona por onde passam áudio e vídeo (criada para as mídias embutidas). Basta um terceiro caso: perguntar à ponte onde está o arquivo ou se ainda não foi baixado. As **imagens** são inseridas com `src` direto pelos `.tmpl`: precisariam de uma etapa de resolução após a renderização, ou ficar no pacote *install-time* (ver 4.4).

### 4.4 Divisão sugerida das mídias

| Pacote | Conteúdo | Motivo |
|---|---|---|
| Base (*install-time*) | HTML, ícones, **áudios** e, se couber, **fotos** | Núcleo do dicionário funciona desde a instalação. Meta: abaixo de ~200 MB (faixa em que a Play avisa sobre dados móveis). |
| `midia_video_N` (*on-demand*) | Vídeos, em blocos ≤ 1,5 GB, agrupados por categoria quando possível | Normalmente a maior parte do tamanho |
| `midia_extra_N` (*on-demand*) | Fotos, se a base passar da meta | — |

**No app:** no primeiro uso, aviso "Este dicionário tem 1,8 GB de vídeos. Baixar agora para uso offline?" com **Baixar tudo** / **Depois**; sem Wi-Fi, a confirmação de dados móveis da Play; nas configurações, estado, tamanho e "Remover".

### 4.5 O que muda no gerador

| Componente | Mudança |
|---|---|
| `android-template/` | Dependência `com.google.android.play:asset-delivery` (algumas centenas de KB, compatível com `minSdk 21`), ponte Java e módulos de pacote *on-demand* no template. |
| `injetorAab.js` | Distribuir as mídias entre N pacotes, clonando e renomeando o módulo-modelo (o mecanismo de ajuste de manifesto de `patcherManifestAab.js` serve de base); remover os pacotes não usados (já acontece hoje com o `midia_pack`). |
| `limitesTamanho.js` | Planejar a divisão (base / vídeos / extras) respeitando 1,5 GB por pacote. |
| Novo `midias-index.json` | Mapa arquivo → pacote, com tamanhos, para o HTML mostrar estados e totais. |
| `template.html` | Ampliar `obterUrlTocavel`, aviso e tela de mídias offline, e tratar a ausência da ponte (o mesmo HTML continua funcionando como site). |
| APK direto | Continua com tudo embutido. |

Nada disso exige reescrever a interface; o pipeline de assinatura e montagem não muda.

### 4.6 Alternativa: servidor próprio

Mídias hospedadas fora da Play (ex.: Cloudflare R2, GitHub Releases, site do projeto) e baixadas pela ponte com `DownloadManager`.

- **A favor:** download arquivo por arquivo; funciona também no APK direto.
- **Contra:** cada projeto precisa de hospedagem com custo e manutenção, e o desenvolvedor precisa publicar os arquivos e manter os links. Para o público do CSV2DMLI, costuma ser uma barreira maior que as limitações do PAD.

### 4.7 Recomendação para a entrega de mídias

1. **PAD *on-demand*, não *fast-follow*.** Só o *on-demand* reduz o tamanho que afasta usuários e deixa a escolha com eles.
2. **Manter o app em HTML** com a ponte Java. Toda a capacidade nativa necessária está nela; um app nativo completo não acrescenta capacidade aqui, só a experiência descrita na Parte A.
3. **Ativar só acima de um limite** (ex.: mídias > 1 GB). Abaixo disso, manter o *install-time* atual.
4. **APK direto completo**, com explicação no `LEIA-ME.txt` de que o download sob demanda só existe na versão da Play.

---

## 5. Parte C — Divisão das mídias em etapas e template nativo como opção

### 5.1 Proposta avaliada

Verificação em etapas, por tipo de mídia:

1. **Imagens** sempre *install-time*, para nenhuma entrada abrir com imagem quebrada.
2. **Áudios** *install-time* se o tamanho das imagens permitir; senão *fast-follow*; se muito grandes, uma parte *install-time* e o restante *on-demand*.
3. **Vídeos** *fast-follow* se imagens e áudios forem pequenos; senão *on-demand* em pacotes menores (~500 MB) para cada download terminar rápido.

A proposta é boa. Imagens *install-time* ainda eliminam um problema da Parte B (4.3): as imagens não precisam de etapa de resolução de caminho no HTML. Seguem quatro ajustes.

### 5.2 Ajuste 1 — 200 MB é uma meta configurável, não um limite da Play

Os limites da Play são: módulo base 500 MB, pacote 1,5 GB, *install-time* somado 4 GB. Os 200 MB são a faixa em que a Play avisa antes de baixar por dados móveis. Tratar esse valor como **orçamento de instalação** definido pelo sistema (200 MB por padrão, ajustável no assistente): cada etapa gasta uma parte e as seguintes usam o que sobrar.

### 5.3 Ajuste 2 — Imagens acima do orçamento

Se só as imagens passarem do orçamento:

- **(a)** manter tudo *install-time*, com aviso no assistente; ou
- **(b)** oferecer **"otimizar imagens"**: reconverter para WebP em resolução de celular (ex.: 1080 px no lado maior) usando Canvas, que o sistema já usa para os ícones (`packages/core/iconeUtil.js`). Com fotos de câmera, a redução costuma ser grande.

Recomendação: oferecer (b) como opção, sem aplicar automaticamente.

### 5.4 Ajuste 3 — Dividir áudios por tipo, não pelas "primeiras entradas"

Separar pelas primeiras entradas é possível, mas:

- **a ordem não corresponde ao uso**: o usuário chega às entradas pela busca e pelas categorias, então a falta de áudio aparece em pontos aleatórios;
- **a experiência fica inconsistente**: algumas entradas tocam, outras não, sem motivo aparente.

Os dados já distinguem dois tipos (`exportadorBase.js`):

| Tipo | Campo | Característica |
|---|---|---|
| Pronúncia da entrada | `ARQUIVO_ENTRADA` (variações) | Curtos, essenciais |
| Exemplos e textos estruturados | `ARQUIVO_SONORO_EXEMPLO` e áudios de texto | Mais longos, secundários |

Proposta: pronúncias *install-time*; exemplos e textos *fast-follow*. Só se as pronúncias **sozinhas** estourarem o orçamento, dividir por **categoria**: uma categoria inteira completa faz mais sentido para o usuário que "as primeiras N entradas".

### 5.5 Ajuste 4 — Pacotes de vídeo por categoria, até ~500 MB

- **Agrupar por categoria e quebrar em 500 MB quando necessário.** Além do "baixar tudo", o usuário pode baixar só os vídeos da categoria que lhe interessa.
- **Quantidade de pacotes.** A Play limita quantos pacotes um app pode ter (a documentação do .NET MAUI cita 50; confirmar no Play Console). Com 500 MB por pacote isso dá ~25 GB, suficiente na prática, mas o algoritmo deve aumentar o tamanho do pacote se passar do limite.

### 5.6 Consequência técnica do *fast-follow*

Com *fast-follow*, o app pode abrir antes de o pacote terminar de baixar e precisa tratar "mídia ainda não disponível" como no *on-demand*. Portanto, **a ponte Java e os avisos no HTML (Parte B, 4.3) são necessários assim que houver qualquer pacote que não seja *install-time***. A única diferença entre os dois modos é quem inicia o download.

### 5.7 Algoritmo proposto

```
orçamento = 200 MB (configurável)                          total = imagens + áudios + vídeos

1. IMAGENS   → sempre install-time
               se imagens > orçamento: aviso + oferecer "otimizar imagens"
               resta = orçamento − imagens

2. ÁUDIOS    se áudios ≤ resta                     → install-time
             senão se pronúncias ≤ resta           → pronúncias install-time; exemplos/textos fast-follow
             senão se áudios ≤ ~500 MB             → pronúncias por categoria até o orçamento; resto fast-follow
             senão                                 → pronúncias por categoria até o orçamento; resto on-demand (pacotes por categoria)

3. VÍDEOS    se total ≤ ~1 GB                      → fast-follow (1 pacote)
             senão                                 → on-demand, pacotes por categoria de até ~500 MB
                                                     (aumentar o tamanho se passar do limite de pacotes)

Limites rígidos sempre verificados: base ≤ 500 MB · pacote ≤ 1,5 GB · install-time somado ≤ 4 GB
APK direto: ignora o plano, tudo embutido
```

- **Plano visível no assistente.** A análise de tamanho que já existe (`apkAnalisarTamanho` em `index.html`) pode virar uma tabela "Na instalação · Baixa em seguida · Sob demanda", com tamanhos e opção de ajuste. O desenvolvedor vê exatamente o que o usuário final vai baixar.
- **Onde fica o algoritmo.** Num módulo compartilhado (extensão de `packages/android/limitesTamanho.js`) que gera o `midias-index.json`, para servir aos dois templates.

### 5.8 Template nativo como opção ao template WebView

Manter os dois, com escolha no assistente: **"App HTML"** / **"App nativo"** (este marcado como experimental). O pipeline já comporta isso: `exportadorAndroid.js` carrega o template por URL e o resto da geração é igual.

| Compartilhado pelos dois templates | Específico de cada um |
|---|---|
| `dados.json` versionado (de `extrairDadosEntrada`) | WebView: `index.html` gerado pelos templates HTML |
| `midias-index.json` com o plano de pacotes | Nativo: `config.json` com tema e textos |
| Módulos de pacote no AAB, injetor, assinatura, `patcherManifestAab.js` | WebView: PAD via ponte Java |
| Plano de entrega (5.7) | Nativo: `AssetPackManager` chamado diretamente |

### 5.9 Ordem sugerida de implementação

1. **Plano de entrega:** algoritmo (5.7), pacotes no template e tabela no assistente. Vale para os dois templates.
2. **Ponte Java + HTML:** `obterUrlTocavel`, aviso de primeiro uso, tela de mídias offline. Com isso, projetos grandes já funcionam no template atual.
3. **Template nativo mínimo:** lista, busca, entrada, áudio, vídeo e mídias offline, usando o mesmo contrato e oferecido como opção experimental.

### 5.10 Situação da implementação

**Plano 1 — implementado** (branch `entrega-midias-etapas`):

| Peça | Onde |
|---|---|
| Algoritmo 5.7 (`planejarEntrega`), limites rígidos, `midias-index.json` (`gerarIndiceMidias`) | `packages/android/limitesTamanho.js` |
| Pacotes no AAB: o `midia_pack` do template é o **modelo**; cada pacote do plano é um clone com `split` e modo de entrega reescritos no manifesto. **O template não precisou ser recompilado.** | `injetorAab.js`, `patcherManifestAab.js` (`split`, `entrega`) |
| Classificação das mídias (imagem, pronúncia, exemplo, vídeo) e categoria (`CAMPO_SEMANTICO` da primeira entrada que usa o arquivo) | `index.html` (`apkClassificarMidias`) |
| Opção "Entrega em etapas (experimental)", orçamento em MB, tabela "Na instalação · Baixa em seguida · Sob demanda" | `index.html` (passo do app Android) |
| Bloco no `LEIA-ME.txt` com os pacotes | `exportadorAndroid.js` |

Decisões:
- **Etapas desligadas por padrão.** Sem a ponte do Plano 2, mídias em pacotes *fast-follow*/*on-demand* não abrem no app. Desligada, a opção ainda divide as mídias da instalação em vários pacotes *install-time* de até 1,5 GB (antes, mídias acima de 1,5 GB faziam o AAB ser recusado).
- **Só no modo projeto.** "HTML pronto" não tem banco para classificar as mídias, e o HTML dele não terá a ponte.
- **Vídeos de pronúncia** (`ARQUIVO_ENTRADA_TIPO = 'video'`) seguem a etapa de vídeos, como em 5.7.
- **Vídeos cabem no orçamento:** se sobrar orçamento depois de imagens e áudios, os vídeos também vão na instalação (5.2: cada etapa usa o que sobrar).
- **Limite de pacotes:** 50 (a confirmar no Play Console). Acima disso, categorias seguidas passam a dividir pacotes e o tamanho-alvo dobra até 1,5 GB.
- **Imagens acima do orçamento:** só aviso; a otimização é feita por um script Python externo (5.3 (b) não será implementado no sistema).

**Plano 2 — implementado:**

| Peça | Onde |
|---|---|
| Ponte `window.PonteMidias` (`indice`, `local`, `atualizar`, `baixar`, `cancelar`, `remover`), confirmação de dados móveis pela Play, verificação de espaço, eventos para o HTML | `android-template/.../PonteMidias.java`, `MainActivity.java` |
| Dependência `com.google.android.play:asset-delivery:2.2.2` (+ `androidx.activity:activity:1.2.4` para compilar `showConfirmationDialog`); `android.useAndroidX=true` | `android-template/app/build.gradle`, `gradle.properties` |
| `obterUrlTocavel` com o caso "mídia de pacote"; vídeo de pronúncia, `tocarAudio` e qualquer `<video>/<audio>` da página passam por ela | `config/templates/html-cards/template.html` (`MidiasPacotes`) |
| Aviso de primeiro uso (uma vez, depois da janela de informações) e painel "Mídias offline" em Ajustes (celular) e na barra lateral (telas largas): estado, progresso, Baixar/Cancelar/Remover, Baixar tudo, Remover tudo (dois toques) | idem |
| Pedido de download ao abrir mídia não baixada: "Baixar" (o pacote) ou "Baixar todas as mídias" | idem |

Decisões:
- **Serviço em primeiro plano.** A biblioteca declara `FOREGROUND_SERVICE_DATA_SYNC` e o `ExtractionForegroundService`, o que exige uma declaração no Play Console. O gerador **remove** os dois do manifesto do AAB quando não há pacotes fast-follow/on-demand (`removerServicoPrimeiroPlano` em `patcherManifestAab.js`); com etapas, eles ficam e o LEIA-ME explica a declaração.
- **Mídias abertas pelo caminho real** (`file:///data/.../assetpacks/<pacote>/<versão>/<n>/assets/...`), sem interceptar requisições: o avanço/retrocesso do vídeo funciona.
- **Sem a ponte** (site, HTML exportado, APK direto, AAB sem etapas), `MidiasPacotes` fica inativo e nada muda.

Teste em aparelho (Galaxy S25, Android API 37, `bundletool --local-testing`, projeto Makurap com 13 pacotes on-demand / 1,67 GB): aviso de primeiro uso, pedido de download, download de um pacote e de todos, vídeo tocando do arquivo baixado com avanço, `<video>` da página e áudio passando pela ponte, remoção, e estado preservado ao reabrir o app.

**Plano 3 — implementado (experimental):**

| Peça | Onde |
|---|---|
| Contrato `dados.json` / `config.json` v1 (entradas, créditos, introdução, citação, cores do tema) | `packages/exporters/dadosApp.js`; `exportarArquivosApp` em `exportadorHtmlCards.js` / `moduloExportacao.js` |
| App nativo: Kotlin + Jetpack Compose + Material 3, `minSdk 23`, R8 completo (APK ~3 MB). Telas: lista (filtro por categoria, salvos), busca sem acento em termo e tradução, entrada (transcrições, acepções, exemplos com áudio, imagens ampliáveis, vídeos, textos estruturados como texto), informações/como citar, ajustes (tema sistema/claro/escuro), mídias offline | `android-template-nativo/` → `vendor/android/template-nativo.{aab,apk}` |
| Áudio e vídeo com Media3/ExoPlayer (`asset:///` e arquivos dos pacotes baixados); mídias offline com a biblioteca da Play direto em Kotlin (`MidiasOffline.kt`), mesmo comportamento do Plano 2 | idem |
| Seletor "App HTML / App nativo (experimental)" no assistente; no nativo, "HTML pronto" e capturas automáticas ficam desligados e a prévia é marcada como aproximada | `index.html` |
| Injetor aceita `arquivosBase` (dados.json + config.json) no lugar do `index.html`; exportador escolhe o template pelo `modelo` | `injetorAab.js`, `exportadorAndroid.js` |
| Permissão `…DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` e autoridade `…androidx-startup` (do AndroidX) renomeadas para o package do app, no AAB e no APK — sem isso, dois apps gerados do template nativo não instalariam juntos | `patcherManifest.js`, `patcherManifestAab.js` (`renomearValorDoPacote`) |
| CI compila os dois templates | `.github/workflows/android-template.yml` |

Ajustes feitos no teste em aparelho (mesmo celular, projeto Makurap, 12 pacotes on-demand):
- **Mídias ausentes ficam ocultas.** No Makurap, ~40% das pronúncias citam arquivos que não estão no projeto; o app nativo só mostra botão, miniatura ou galeria quando o arquivo existe (assets ou pacote). Falha de reprodução mostra aviso em vez de tela preta.
- **Pronúncias com `|`** (`"x.mp3|x.mp4"`): `dadosApp.js` separa em uma pronúncia por arquivo, com pasta e tipo pela extensão. O sistema só separa o `|` quando o termo tem variações, então o **app HTML continua recebendo o caminho inteiro** e não toca essas mídias — correção a fazer em `gerenciadorDados.js`, fora deste plano.
- **R8 completo:** a variante debug do template nativo usa `debuggable false` (o gerador já removia o atributo); o `classes.dex` caiu de ~10 MB para ~3 MB.

Testado: lista (998 entradas), busca sem acento por termo e tradução, entrada com imagem e áudio de exemplo, vídeo de pacote baixado, aviso de primeiro uso, pedido de download, baixar um/todos, remover, tema escuro e informações (HTML da introdução).

Fora desta versão (decisão de escopo): VLibras, templates HTML/CSS personalizados, "HTML pronto", áudio sincronizado dos textos estruturados, categorias em vários níveis (só o campo semântico principal) e capturas automáticas para a Play.

---

## 6. Fontes

- [AssetPackManager — Android Developers](https://developer.android.com/reference/com/google/android/play/core/assetpacks/AssetPackManager)
- [AssetPackLocation — Android Developers](https://developer.android.com/reference/com/google/android/play/core/assetpacks/AssetPackLocation)
- [Integrar o Asset Delivery (Kotlin e Java)](https://developer.android.com/guide/playcore/asset-delivery/integrate-java?hl=vi)
- [Play Console Help — limites de tamanho](https://support.google.com/googleplay/android-developer/answer/9859372)
- [androidx/media 1.9.0 (minSdk 23)](https://newreleases.io/project/github/androidx/media/release/1.9.0)
- [Zendesk — minSdk 23 a partir do Compose BOM 2025.12](https://support.zendesk.com/hc/en-us/articles/10934369609370-Announcing-a-new-minimum-Android-version-requirement-for-the-Zendesk-messaging-SDK)
- [Bitmovin — AndroidX exigindo minSdk 23 desde junho/2025](https://community.bitmovin.com/t/bitmovin-android-sdk-raising-minimum-sdk-version-to-23/3815)
- [Páginas de 16 KB — Pushwoosh](https://help.pushwoosh.com/hc/en-us/articles/31409797287453-Android-16KB-Page-Size-Support)
- [Páginas de 16 KB — Expo](https://github.com/expo/fyi/blob/main/android-16kb-page-sizes.md)
- [Asset packs no .NET MAUI — Microsoft](https://learn.microsoft.com/en-us/dotnet/maui/android/asset-packs?view=net-maui-8.0)
