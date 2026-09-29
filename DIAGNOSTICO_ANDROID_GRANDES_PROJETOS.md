# Diagnóstico — Geração de AAB/APK para projetos grandes (até ~1 GB de mídia)

> Documento de diagnóstico. **Nenhum código foi alterado.**
> Escopo: viabilidade de Play Asset Delivery / Play Feature Delivery, consumo de
> memória e processamento do pipeline de geração, entrega em ZIP único e
> experiência do usuário, tendo como cenário de referência um projeto com
> **1 GB de mídias** (fotos, vídeos e áudios).
>
> Data: 29/09/2026 · Branch analisada: `Jeann`

---

## 1. Resumo executivo

| Pergunta | Resposta curta |
|---|---|
| O AAB atual suporta 1 GB de mídia? | **Não.** Tudo vai para o módulo base, cujo limite na Play é **500 MB**. |
| Play Asset Delivery (PAD) é viável? | **Sim.** O modo *install-time* é praticamente transparente para o app: as mídias continuam acessíveis em `file:///android_asset/...`, sem mudança no Java nem no HTML. |
| Play Feature Delivery (PFD) é viável? | Tecnicamente sim, mas **não compensa**: serve para código, tem limite de 500 MB por módulo e exige mais trabalho que o PAD. |
| PAD reduz o download? | Só nos modos *fast-follow*/*on-demand*, que exigem biblioteca Play no app, código Java e tratamento de "mídia ainda não baixada". Para ≤ 1 GB, **não recomendado agora**. |
| O navegador aguenta gerar um app de 1 GB hoje? | **Não.** O pipeline mantém várias cópias completas em RAM: pico estimado de **6–8 × o tamanho das mídias** (≈ 6–8 GB para 1 GB). |
| Dá para reduzir? | **Sim.** Reorganizando o fluxo e montando cada arquivo uma única vez, o pico cai para **≈ 1–1,5 × M**; com processamento contínuo em partes, para **dezenas de MB**. |
| Dá para manter um ZIP único para o usuário? | **Sim**, montando o ZIP externo **sem compressão (STORED) e em partes** com a API de streaming do `fflate` já presente em `vendor/`. |

**Recomendação:** (1) validação de tamanho e avisos na interface; (2) redução de memória e processamento (Níveis 1 e 2); (3) ZIP externo em partes; (4) PAD *install-time* com um pacote de mídia. Nesta ordem, cada etapa já entrega valor sozinha.

---

## 2. Estado atual do pipeline

### 2.1 Arquivos envolvidos

| Arquivo | Papel |
|---|---|
| `android-template/` | Projeto Gradle mínimo: `MainActivity` com WebView carregando `file:///android_asset/index.html`. `minSdk 21`, `targetSdk 36`. |
| `.github/workflows/android-template.yml` | Compila o template (`bundleDebug` + `assembleDebug`) e grava `vendor/android/template.{aab,apk}`. |
| `index.html` (≈ l. 3403–3490) | Coleta HTML + mídias (lê **todas** para `Uint8Array`) e chama `ExportadorAndroid.gerarAmbos`. |
| `packages/android/exportadorAndroid.js` | Orquestra: carrega templates → injeta → assina AAB → injeta → assina APK → monta ZIP final → salva. |
| `packages/android/injetorAab.js` | `unzipSync` do template, grava HTML/mídias em `base/assets/` (AAB) ou `assets/` (APK), ícones, patch de manifesto, `zipSync`. |
| `packages/android/patcherManifestAab.js` | Patch do manifesto protobuf (AAPT2) do AAB. |
| `packages/android/signerV1.js` | Assinatura JAR: `unzipSync` → SHA-256 por entrada → META-INF → `zipSync`. |
| `packages/android/zipalign.js` | Alinhamento de 4 bytes (só APK), com cópia completa do arquivo. |
| `packages/android/signerV2.js` | APK Signature Scheme v2: `slice` do conteúdo, digests em pedaços de 1 MB, `concat` final. |
| `packages/platform/{browser,tauri}.js` | Salvamento. No Tauri, `blob.arrayBuffer()` + `invoke('plugin:fs|write_file')` com o arquivo inteiro. |

### 2.2 Estrutura do template AAB

```
BundleConfig.pb                       ← lista de globs não comprimidos (mp3, mp4, jpg, png, ogg, webm…)
base/manifest/AndroidManifest.xml     ← protobuf AAPT2
base/assets.pb
base/assets/index.html                ← substituído pelo dicionário
base/dex/classes*.dex
base/res/…                            ← ícones substituídos
base/resources.pb
```

Todas as mídias são injetadas em `base/assets/<audio|foto|video>/…` com `level: 0` (sem compressão). Como mp3/jpg/mp4 já são comprimidos, **o tamanho do AAB ≈ tamanho de download** calculado pela Play.

Ponto positivo: o `BundleConfig.pb` já marca as extensões de mídia como **não comprimidas** nos APKs gerados pela Play. Isso é importante para vídeo/áudio no WebView (leitura direta e *seek*), e vale também para asset packs.

### 2.3 Limites de configuração atuais

`config/config.json` permite arquivos individuais de até **200 MB (áudio)**, **100 MB (imagem)** e **1000 MB (vídeo)**. Um único vídeo pode, portanto, sozinho, estourar o módulo base.

Não existe hoje **nenhuma verificação de tamanho total** antes da geração. O usuário só descobre o problema ao enviar para o Play Console (ou quando a aba do navegador trava).

---

## 3. Limites da Google Play

Fonte: [Play Console Help — limites de tamanho](https://support.google.com/googleplay/android-developer/answer/9859372). Valores em **tamanho de download comprimido**, calculado pelo Play Console.

| Item | Limite |
|---|---|
| Módulo base | 500 MB |
| Cada feature module | 500 MB |
| Cada asset pack | 1,5 GB |
| Base + módulos + packs *install-time*, somados | 4 GB |
| Packs *fast-follow* / *on-demand*, somados | 30 GB |
| Acima de 200 MB | Aviso (não bloqueante) ao instalar via dados móveis |

Outras observações:
- Packs *install-time* exigem espaço livre de **≈ 2 × o tamanho do pack** durante a instalação.
- A Play só valida a assinatura **v1 (jarsigner)** no upload do AAB. A v2 aplicada ao AAB é inócua.

---

## 4. Cenário de referência: projeto com 1 GB de mídia

Suposição: 1 GB distribuído entre fotos, áudios e alguns vídeos; HTML do dicionário na casa de poucos MB.

| Aspecto | Hoje | Após as mudanças recomendadas |
|---|---|---|
| Upload na Play | **Rejeitado** (base > 500 MB) | Aceito: base pequena + 1 pack *install-time* de ~1 GB (< 1,5 GB) |
| Download para o usuário final | — | ~1 GB, com aviso de dados móveis (> 200 MB) |
| Espaço livre no aparelho | — | ~2 GB durante a instalação |
| APK de instalação direta | ~1 GB, funciona se a geração não travar | Igual (~1 GB, universal) |
| ZIP entregue ao criador | ~2 GB (AAB + APK) | ~2 GB, abaixo do limite de 4 GB do ZIP comum; **sem necessidade de ZIP64** |
| Pico de RAM na geração | **≈ 6–8 GB** → aba trava/fecha | **≈ 1–1,5 GB** (Níveis 1+2) ou **dezenas de MB** (Nível 3) |
| Tauri: salvar o arquivo | +2 GB extras (`arrayBuffer` + IPC) | ~0 com escrita em partes |

Conclusão: **para 1 GB, duas mudanças são obrigatórias** — PAD (limite da Play) e redução de memória (limite do navegador). As demais são melhorias.

---

## 5. Play Asset Delivery e Play Feature Delivery

### 5.1 Comparação

| Critério | PAD *install-time* | PAD *fast-follow* / *on-demand* | Play Feature Delivery |
|---|---|---|---|
| Finalidade | Assets entregues na instalação | Assets baixados depois da instalação | Código e recursos modulares |
| Limite por unidade | 1,5 GB | 1,5 GB | 500 MB |
| Mudança no app Android | **Nenhuma** | Biblioteca `asset-delivery`, código Java, ponte JS↔Java | Biblioteca Play, `SplitCompat`, módulos Gradle |
| Mudança no HTML | **Nenhuma** | Caminhos mudam (armazenamento interno), estado "baixando" | Depende |
| Reduz download inicial | Não | Sim | Sim (on-demand) |
| Paridade com APK de instalação direta | Mantida | Perdida (APK não tem os packs) | Perdida |
| Esforço | Baixo/médio | Alto | Alto |

### 5.2 Por que *install-time* se encaixa

- Packs *install-time* viram *split APKs* instalados junto com o app. O Android junta os assets de todos os splits no mesmo `AssetManager`. Assim, `midia_pack/assets/audio/x.mp3` no AAB fica acessível no aparelho como `file:///android_asset/audio/x.mp3`.
- `MainActivity.java` e `resolverMidia()` no template HTML (`audio/arquivo`, `foto/arquivo`, `video/arquivo`) **não mudam**.
- Não precisa da biblioteca Play Asset Delivery.
- `minSdk 21` já suporta split APKs.

**Ponto a validar antes de investir:** confirmar em aparelho que o WebView enxerga assets de splits via `file:///android_asset`. Na teoria sim (usa o `AssetManager` do app). Teste sugerido: gerar AAB com pack e instalar com `bundletool build-apks --local-testing` + `bundletool install-apks`.

### 5.3 O que precisaria mudar (install-time)

1. **Template (`android-template/`)**
   - Criar o módulo `midia_pack` (plugin `com.android.asset-pack`, `packName = "midia_pack"`, `dynamicDelivery { deliveryType = "install-time" }`) com um asset placeholder.
   - Em `app/build.gradle`: `assetPacks = [":midia_pack"]`; em `settings.gradle`: `include ':midia_pack'`.
   - O AAB gerado passa a conter `midia_pack/manifest/AndroidManifest.xml` (protobuf, com `split="midia_pack"` e `dist:module dist:type="asset-pack"`) e `midia_pack/assets/…`. O workflow de CI já copia o resultado sem mudanças.
2. **`injetorAab.js` (apenas AAB)**
   - Decidir o destino de cada mídia: `base/assets/` enquanto a base couber com folga (ex.: < 450 MB), depois `midia_pack/assets/`. Alternativa mais simples: **todas as mídias sempre no pack**, e a base fica só com HTML + código.
   - Limpar também `midia_pack/assets/` no passo "remover assets antigos".
   - Garantir que nenhum caminho exista em dois módulos.
3. **Manifesto do pack:** o atributo `package` precisa ser igual ao do app. `patchManifestAab` já troca `package` de forma genérica — basta chamá-lo também para `midia_pack/manifest/AndroidManifest.xml`.
4. **Mais de um pack (> 1,5 GB):** fora do cenário de 1 GB. Se um dia for necessário: template com N packs fixos, ou clonar o diretório do pack trocando o atributo `split` no manifesto protobuf (viável com o parser existente, mas mais arriscado).
5. **APK de instalação direta:** permanece como está, com tudo em `assets/`. APK avulso não tem asset packs e não tem limite da Play.
6. **Assinatura:** sem mudanças. `signerV1` percorre todas as entradas do ZIP, inclusive as do pack.

### 5.4 Fast-follow / on-demand (futuro, se necessário)

Só faz sentido se o objetivo for **abrir o app antes de toda a mídia chegar** ou ultrapassar 4 GB. Exigiria:
- `com.google.android.play:asset-delivery` no template;
- código Java para solicitar download, acompanhar progresso, tratar falta de espaço e falhas de rede;
- servir arquivos do armazenamento interno (`WebViewAssetLoader` com *path handler* próprio);
- ponte JS↔Java para o HTML saber se a mídia está disponível e mostrar estado de carregamento;
- aceitar que o APK de instalação direta deixa de ter paridade com o AAB.

---

## 6. Memória e processamento

### 6.1 Onde a RAM é consumida hoje (M = tamanho total das mídias)

| Etapa | Cópias vivas ao mesmo tempo |
|---|---|
| `index.html:3421-3428` lê todas as mídias para `Uint8Array` | 1 × M (vive até o fim) |
| `injetar` → `zipSync` | + 1 × M |
| `assinarV1`: `unzipSync` + `zipSync` de novo | + 2 × M |
| `assinarV2`: `slice` do conteúdo, `slice` de cada pedaço de 1 MB, cópia com prefixo de **todos** os pedaços ao mesmo tempo (`Promise.all`), `concat` final | + 3 a 4 × M |
| AAB pronto continua vivo enquanto o APK passa pelas mesmas etapas; `zipalign` faz mais uma cópia | + 1 × M (AAB) + as mesmas cópias do APK |
| `zipSync` final (AAB + APK + capturas) e o `Blob` | + 2 × M, + 2 × M |
| Tauri: `blob.arrayBuffer()` + IPC | + 2 × M ou mais |

Parte é liberada entre etapas, mas o **pico fica em ≈ 6–8 × M**.

**Web Worker não resolve memória:** roda no mesmo processo e divide o limite da aba. Ele só evita que a interface congele — o que é útil para a experiência, mas é outro problema.

### 6.2 Processamento repetido

Cada byte de mídia hoje é lido/copiado muitas vezes, e o trabalho pesado é duplicado entre AAB e APK:

| Operação sobre as mídias | AAB | APK | Total |
|---|---|---|---|
| CRC32 (dentro do `zipSync`) | 2× (injeção + v1) | 2× | 4× |
| SHA-256 da v1 | 1× | 1× | 2× |
| SHA-256 da v2 | 1× | 1× | 2× |
| CRC32 do ZIP externo | 1× | 1× | 2× |
| Cópias de memória | ~5× | ~6× | ~11× + ZIP final |

**Oportunidade:** o CRC32 e o SHA-256 da v1 de cada mídia são **idênticos no AAB e no APK** (mesmo conteúdo). Calculados uma vez por arquivo, podem ser reutilizados nos dois. Com isso:

| Operação | Total otimizado |
|---|---|
| CRC32 + SHA-256 v1 por mídia (compartilhado) | 1 leitura |
| SHA-256 v2 | 1 leitura por artefato (depende do layout do ZIP, não é reaproveitável) |
| CRC32 do ZIP externo | 1 leitura por artefato (ou 0, com técnica de combinação de CRC — opcional) |

De ~15 passagens/cópias por byte para **3–5 leituras** sequenciais.

Ordem de grandeza (estimativa, não medida): SHA-256 via WebCrypto e CRC32 em JS processam centenas de MB/s em máquinas comuns. Para 1 GB, o pipeline otimizado deve ficar na faixa de **dezenas de segundos**, dominado por leitura de disco e hashing — e não por cópias de memória e coleta de lixo, que hoje dominam.

### 6.3 Plano de redução em níveis

**Nível 1 — Reorganizar o fluxo (pouco esforço; pico ≈ 3–4 × M)**
- Gerar o AAB, convertê-lo em `Blob`, liberar as referências; só então gerar o APK.
- Não manter o `Map` de mídias em `Uint8Array` desde o início (ver Nível 3), ou ao menos liberá-lo assim que os dois artefatos forem montados.
- `signerV2`: trocar `slice` por `subarray` e calcular os digests dos pedaços **em sequência**, reutilizando um único buffer de 1 MB + 5 bytes, em vez de `Promise.all` sobre todos.
- `zipalign`: evitar a cópia inicial `new Uint8Array(zipBytes)` quando o chamador não precisa do original.

**Nível 2 — Montar cada artefato uma única vez (esforço médio; pico ≈ 1–1,5 × M)**
- Hoje o arquivo é montado três vezes: injeção → `assinarV1` (unzip + zip) → `zipalign`. Unificar num **gravador de ZIP próprio** que, em uma passada:
  1. escreve as entradas já alinhadas (padding no campo *extra*, como o `zipalign` faz hoje);
  2. calcula o SHA-256 de cada entrada para o `MANIFEST.MF` enquanto grava;
  3. grava `META-INF/` (v1) ao final;
  4. entrega o resultado para a v2, que só insere o bloco de assinatura antes do diretório central.
- O gravador é simples: as mídias são STORED; só arquivos pequenos (manifesto, dex, `.pb`, HTML) são comprimidos, e para esses o `fflate` continua servindo.
- Reutilizar CRC32 e SHA-256 das mídias entre AAB e APK (seção 6.2).

**Nível 3 — Processamento contínuo em partes (maior esforço; pico ≈ poucos MB + maior arquivo)**
- **Não ler as mídias para a RAM:** os `File`/`Blob` de `sistema.vfs` já são referências a disco.
- **Saída como lista de partes:** `new Blob([cabeçalho, File, cabeçalho, File, …, bloco v2, diretório central, EOCD])`. O conteúdo das mídias nunca passa pela memória do JavaScript como um todo.
- **Hashes lendo cada arquivo uma vez** via `blob.stream()` / `Blob.slice`.
- **Hash incremental:** `crypto.subtle.digest` não é incremental; um vídeo de 1000 MB (permitido pela configuração) precisaria estar inteiro em memória. Para um pico realmente pequeno, adicionar em `vendor/` um SHA-256 incremental (ex.: `hash-wasm`) e um CRC32 simples.
- **Salvamento sem materializar:** ver seção 7.

**Complemento — Web Worker:** mover o pipeline para um worker **depois** dos Níveis 1–2 mantém a interface responsiva (barra de progresso fluida, botão de cancelar funcionando). Não reduz memória.

**Alternativa no desktop (Tauri):** o Rust pode montar e assinar os arquivos lendo mídias direto do disco (crates `zip`, `sha2`, `rsa`), com desempenho e memória superiores. Custo: duas implementações do pipeline (web e desktop). Recomendado apenas se o desktop se tornar o canal principal para projetos grandes.

---

## 7. Entrega em ZIP único

O ZIP único é mais simples para o usuário final (um download, uma pasta organizada). Ele pode ser mantido sem custo de memória:

### 7.1 Por que sem compressão (STORED)

- AAB e APK já são ZIPs, e as mídias dentro já são comprimidas. Recomprimir reduz ~1–3% e custa processamento e memória.
- Um ZIP STORED é apenas cabeçalho + bytes do AAB + cabeçalho + bytes do APK… Abre normalmente no Windows, macOS, Linux e Android.
- Para 1 GB de mídia, o ZIP fica em ~2 GB — abaixo do limite de 4 GB do ZIP comum. **ZIP64 não é necessário.**

### 7.2 Como montar

O `fflate` 0.8.3 em `vendor/fflate.min.js` já inclui a API de streaming (`Zip`, `ZipPassThrough`, `ZipDeflate`). Não precisa de biblioteca nova.

1. AAB e APK terminam como `Blob` (consequência dos Níveis 1/2).
2. Cada um entra no ZIP externo via `ZipPassThrough`, alimentado em pedaços por `blob.stream()`. O `fflate` calcula o CRC32 durante a leitura e grava tamanhos/CRC num *data descriptor* ao final de cada entrada.
3. Arquivos pequenos (`informacoes.txt`, `.p12`, capturas, ícone 512) podem usar `ZipDeflate` ou STORED — impacto irrelevante.
4. A saída do `fflate` (`ondata`) **não é acumulada num array**; vai direto para o destino:

| Plataforma | Destino | Memória do ZIP |
|---|---|---|
| Chrome / Edge (web) | `showSaveFilePicker()` + `createWritable()`: grava no disco conforme os pedaços saem | poucos MB |
| Firefox / Safari (web) | Juntar pedaços em `Blob`s progressivamente (`new Blob([anterior, pedaço])`) e baixar com o `<a download>` atual | baixa na prática (o navegador pode manter Blobs grandes em disco), mas sem garantia |
| Tauri | Gravar em partes: abrir o arquivo e anexar cada pedaço (plugin fs ou comando Rust de "append"). **Remover** o `blob.arrayBuffer()` de `platform/tauri.js:19`, que hoje anula qualquer ganho | poucos MB |

### 7.3 Organização sugerida do ZIP

```
MeuDicionario_20260929.zip
├── LEIA-ME.txt                      ← antigo informacoes.txt, com instruções por público
├── publicar-na-play/
│   ├── MeuDicionario_20260929.aab
│   ├── chave_upload.p12
│   └── play-store/
│       ├── icone-512.png
│       ├── telefone-1.jpg …
│       └── tablet-1.jpg …
└── instalar-direto/
    └── MeuDicionario_20260929.apk
```

### 7.4 Opção complementar

O ZIP carrega a mídia **duas vezes** (AAB e APK). Para projetos grandes, oferecer também "baixar AAB e APK separados" ou "gerar apenas AAB / apenas APK" reduz pela metade o tempo de geração, o espaço em disco e o download de quem só precisa de um dos dois.

---

## 8. Experiência do usuário

### 8.1 Antes de gerar

- **Resumo de tamanho** calculado a partir dos `File` já carregados (sem ler conteúdo): total por tipo (fotos/áudios/vídeos), tamanho estimado do AAB, do APK e do ZIP.
- **Faixas de aviso:**

| Faixa (mídias) | Mensagem |
|---|---|
| < 200 MB | Nenhum aviso. |
| 200–500 MB | Informativo: "Usuários em dados móveis verão um aviso de download grande na Play Store." |
| 500 MB–1,5 GB | Informativo: "As mídias serão entregues como pacote de recursos da Play (Play Asset Delivery). Nenhuma ação necessária." |
| > 1,5 GB | Atenção: exige múltiplos pacotes (fora do escopo atual) — sugerir otimizar mídias. |
| Acima da capacidade estimada do dispositivo | Atenção: "Seu computador pode não ter memória suficiente; feche outras abas" ou recomendar o app desktop. |

- **Maiores arquivos:** listar os 5–10 maiores (geralmente vídeos), com sugestão de compressão. É onde o usuário tem mais ganho com menos esforço.
- **Otimização opcional de imagens:** reduzir fotos acima de, por exemplo, 1920 px no lado maior, reaproveitando a infraestrutura de Canvas já usada em `core/iconeUtil.js`. Deve ser opt-in e aplicado **arquivo a arquivo**, para não virar outro pico de memória. Compressão de vídeo no navegador (WebCodecs) é possível, mas pesada; melhor orientar o usuário a comprimir antes.
- **Escolha de saída:** ZIP único (padrão) · arquivos separados · só AAB · só APK.
- **Espaço em disco:** avisar que a geração precisa de ~2× o tamanho das mídias livres (AAB + APK) — mais, se o ZIP e os arquivos soltos coexistirem.

### 8.2 Durante a geração

- Pipeline em **Web Worker** para a interface não congelar.
- **Progresso por bytes**, não só por etapa: "Assinando AAB — 420 MB de 1,0 GB", com estimativa de tempo restante.
- **Botão Cancelar** que interrompe de fato (worker encerrado, gravações abortadas, arquivo parcial removido quando possível).
- Com `showSaveFilePicker`, pedir o local de destino **no início**, para gravar direto no disco.
- Evitar que capturas de tela e ícones compitam em memória com a montagem (gerar antes e liberar, como já acontece).

### 8.3 Depois de gerar

- Tela de conclusão com tamanhos finais, o que cada arquivo é, e próximo passo (publicar o AAB / instalar o APK).
- No `LEIA-ME.txt`: explicar que apps > 200 MB mostram aviso de dados móveis; que a instalação precisa de ~2× o tamanho livre no aparelho; e, quando houver pack, que isso é normal e transparente.

### 8.4 Mensagens de erro

- Falha de memória (`RangeError: Array buffer allocation failed` ou aba recarregada) hoje aparece como erro genérico ou perda de tudo. Detectar e explicar: "Memória insuficiente para gerar este app. Tente fechar outras abas, usar o app desktop ou gerar AAB e APK separadamente."

---

## 9. Plano recomendado

| Fase | Entrega | Arquivos principais | Resolve |
|---|---|---|---|
| **1** | Resumo de tamanho, faixas de aviso, lista dos maiores arquivos | `index.html` | Usuário não é surpreendido; nada quebra silenciosamente |
| **2** | Nível 1 de memória (ordem do fluxo, `signerV2` sequencial, liberação de referências) | `exportadorAndroid.js`, `signerV2.js`, `zipalign.js`, `index.html` | Pico ≈ 3–4 × M |
| **3** | ZIP externo STORED em partes + salvamento em partes (web e Tauri) | `exportadorAndroid.js`, `platform/browser.js`, `platform/tauri.js` | Remove ≈ 4–6 × M do pico mantendo o ZIP único |
| **4** | Nível 2: gravador de ZIP único (injeção + v1 + alinhamento), reutilização de hashes entre AAB e APK | `injetorAab.js`, `signerV1.js`, `zipalign.js`, `signerV2.js` | Pico ≈ 1–1,5 × M; processamento de ~15 para 3–5 passagens |
| **5** | PAD *install-time* com `midia_pack` | `android-template/`, workflow, `injetorAab.js`, `patcherManifestAab.js` (chamada extra) | Projetos de 500 MB a 1,5 GB aceitos pela Play |
| **6** | Web Worker + progresso por bytes + cancelar | `exportadorAndroid.js`, novo worker, `index.html` | Interface responsiva em gerações longas |
| **7 (opcional)** | Nível 3 (mídias como `Blob`, hash incremental) | idem Fase 4 + `vendor/` | Pico de poucos MB; suporta vídeos individuais muito grandes |
| **Futuro** | Fast-follow/on-demand, múltiplos packs, pipeline nativo no Tauri | template Java, Rust | Apps > 1,5 GB ou download inicial menor |

Com as Fases 1–5, **um projeto de 1 GB é gerado em uma máquina comum e aceito pela Play**.

---

## 10. Riscos e validações necessárias

| Risco | Como validar |
|---|---|
| WebView não enxergar assets de split via `file:///android_asset` | Protótipo: AAB com pack, `bundletool build-apks --local-testing`, instalar em Android 7, 10 e 14; abrir áudio, foto e vídeo do pack. |
| Play Console rejeitar o AAB montado manualmente com pack | `bundletool validate` e `bundletool build-apks` localmente; upload em faixa de teste interno. |
| Vídeo com *seek* quebrado se ficar comprimido no APK final | Confirmar que o `BundleConfig.pb` (globs não comprimidos) é aplicado aos packs; testar avanço/retrocesso de vídeo. |
| Gravador de ZIP próprio gerar arquivo inválido | Comparar com `apksigner verify --verbose`, `zipalign -c -v 4` e `jarsigner -verify` nos arquivos gerados; testes automatizados de ida e volta. |
| `showSaveFilePicker` indisponível (Firefox/Safari) | Fallback por composição de `Blob`; testar com 1 GB nos dois navegadores. |
| Limites de memória variarem por máquina | Medir pico real (DevTools → Memory) com projetos de 250 MB, 500 MB e 1 GB antes e depois de cada fase. |
| Espaço em disco insuficiente no computador ou no aparelho | Avisos da seção 8; mensagem clara em caso de falha de gravação. |

---

## 11. Referências

- Google Play — limites de tamanho: <https://support.google.com/googleplay/android-developer/answer/9859372>
- Play Asset Delivery: <https://developer.android.com/guide/playcore/asset-delivery>
- Integração de asset packs (Gradle): <https://developer.android.com/guide/playcore/asset-delivery/integrate-java>
- APK Signature Scheme v2: <https://source.android.com/docs/security/features/apksigning/v2>
- bundletool: <https://developer.android.com/tools/bundletool>
- fflate (API de streaming `Zip` / `ZipPassThrough`): <https://github.com/101arrowz/fflate>
- File System Access API (`showSaveFilePicker`): <https://developer.mozilla.org/docs/Web/API/Window/showSaveFilePicker>
