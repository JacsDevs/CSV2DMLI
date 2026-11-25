// ============================================
// DICIONÁRIO - TYPST (MODELO PROFISSIONAL)
// ============================================

#import "/in-dexter.typ": *
#import "/cmarker.typ": *

// ============================================
// CONFIGURAÇÃO GLOBAL
// ============================================
// Modo do PDF: "impressao" (margens espelhadas, seções em página ímpar)
// ou "tela" (margens simétricas). Qualquer outro valor vale "tela".
#let modo = "{{ metadados.modo_pdf }}"
#let impressao = modo == "impressao"

// Cores da paleta de Aparência (preenchidas pelo ExportadorTypst; padrão: verde).
// Usadas só na capa e na folha de rosto; os títulos de seção ficam em preto.
#let cor-titulo = rgb("{{ metadados.cor_primaria }}")
#let cor-acento = rgb("{{ metadados.cor_acento }}")
#let cor-contraste = rgb("{{ metadados.cor_contraste }}")
#let cor-regua = luma(160)

// Escala tipográfica (~1,2): 7,5 · 8,5 · 9,5 · 11 · 13 · 16 · 20 · 28pt
#let corpo-texto = 11pt
#let corpo-verbete = 9.5pt

#let margens = if impressao {
  (inside: 2.5cm, outside: 1.8cm, top: 2.2cm, bottom: 2.4cm)
} else {
  (x: 2cm, top: 2.2cm, bottom: 2.4cm)
}

// "Charis" é o nome da família nos TTFs embarcados (assets/typst/fonts)
#set text(
  font: "Charis",
  size: corpo-texto,
  lang: "pt",
  region: "BR",
  fallback: true
)
#set par(justify: true, leading: 0.65em, spacing: 1em, first-line-indent: 0pt)

// Títulos: um só estilo para o documento inteiro (pré-textuais, categorias do
// dicionário e pós-textuais), para o livro ficar uniforme
#show heading: set text(weight: "bold", fill: black)
#show heading: set block(sticky: true)
// Nível 1 (Sumário, Introdução, categorias, Referências, Índice): abre página e
// atravessa as colunas, em versalete com filete curto
#show heading.where(level: 1): it => {
  // No modo impressão, cada seção e cada categoria principal do dicionário abre
  // à direita (página ímpar); o verso que sobrar fica em branco
  if impressao {
    [#metadata("fim-secao") <fim-secao>]
    pagebreak(weak: true, to: "odd")
  } else {
    pagebreak(weak: true)
  }
  place(top + center, scope: "parent", float: true, clearance: 1.6em)[
    #set align(center)
    #set text(size: 13pt, weight: "regular", fill: black, tracking: 0.06em)
    #smallcaps(lower(it.body))
    #v(0.2em)
    #line(length: 2.5cm, stroke: 0.4pt + cor-regua)
  ]
}
#show heading.where(level: 2): set text(size: 10.5pt)
#show heading.where(level: 2): set block(above: 1.4em, below: 0.7em)
#show heading.where(level: 3): set text(size: corpo-verbete)
#show heading.where(level: 3): set block(above: 1.1em, below: 0.55em)
#show heading.where(level: 4): set text(size: corpo-verbete, style: "italic")
#show heading.where(level: 4): set block(above: 1em, below: 0.5em)

// Nova seção: no modo impressão começa sempre em página ímpar (direita, o recto),
// como em livros impressos frente e verso; o verso que sobrar fica em branco.
// O marcador <fim-secao> permite identificar esses versos para não pôr neles
// cabeçalho, número nem régua (ver pagina-em-branco)
#let nova-secao() = if impressao {
  [#metadata("fim-secao") <fim-secao>]
  pagebreak(to: "odd")
} else { pagebreak() }

// Verso deixado em branco por nova-secao: entre o fim de uma seção e a página do
// próximo título de nível 1 (ou depois da última seção, no fim do documento)
#let pagina-em-branco(pagina) = {
  query(<fim-secao>).any(f => {
    let fim = f.location().page()
    // próximo título na ordem do documento (não pela página: o título pode estar
    // na mesma página do marcador quando não foi preciso pular nenhuma)
    let seguintes = query(heading.where(level: 1).after(f.location()))
    let inicio = if seguintes.len() > 0 { seguintes.first().location().page() } else { 1000000 }
    pagina > fim and pagina < inicio
  })
}

// Cabeçalho único do miolo: palavras-guia no dicionário (primeira palavra da
// página na borda esquerda, última na direita) ou nome da seção nas demais
// páginas, e filete. O número da página fica no rodapé
#let cabecalho = context if not pagina-em-branco(here().page()) {
  let pagina = here().page()
  set text(size: 8.5pt)

  let marcas = query(<dict-word>).filter(m => m.location().page() == pagina)
  if marcas.len() > 0 {
    let first = marcas.first().value
    let last = marcas.last().value
    if first == last {
      strong(first)
    } else {
      grid(columns: (1fr, 1fr), column-gutter: 1em, strong(first), align(right, strong(last)))
    }
  } else {
    // Seção que abre nesta página ou, se nenhuma, a última aberta antes dela
    let titulos = query(heading.where(level: 1))
    let desta = titulos.filter(h => h.location().page() == pagina)
    let anteriores = titulos.filter(h => h.location().page() < pagina)
    let titulo = if desta.len() > 0 { desta.first() } else if anteriores.len() > 0 { anteriores.last() } else { none }
    let corrente = if titulo != none { smallcaps(lower(titulo.body)) }
    // No modo impressão, o nome da seção fica na borda externa
    if impressao and calc.even(pagina) { align(right, corrente) } else { corrente }
  }
  v(-0.35em)
  line(length: 100%, stroke: 0.4pt + cor-regua)
}

// Rodapé do miolo: número da página centralizado (fora dos versos em branco)
#let rodape = context if not pagina-em-branco(here().page()) {
  align(center, text(size: 9pt)[#counter(page).display()])
}

// Réguas verticais finas no meio de cada espaço entre colunas
// (n = número de colunas da seção, entre = espaço entre elas)
#let regua-colunas(n, entre) = context if not pagina-em-branco(here().page()) {
  let m = margens
  let topo = m.top
  let base = m.bottom
  let esquerda = if impressao {
    if calc.odd(here().page()) { m.inside } else { m.outside }
  } else { m.x }
  let direita = if impressao {
    if calc.odd(here().page()) { m.outside } else { m.inside }
  } else { m.x }
  let largura-mancha = page.width - esquerda - direita
  // Em página que abre seção, a régua começa abaixo do título
  let abre-secao = query(heading.where(level: 1)).any(h => h.location().page() == here().page())
  if abre-secao { topo += 1.6cm }
  let largura-coluna = (largura-mancha - (n - 1) * entre) / n
  for k in range(1, n) {
    place(
      top + left,
      dx: esquerda + k * largura-coluna + (k - 1) * entre + entre / 2,
      dy: topo,
      line(angle: 90deg, length: page.height - topo - base, stroke: 0.3pt + luma(200))
    )
  }
}

// ============================================
// 1. CAPA
// ============================================
#let altura-faixa = 13cm

#set page(
  paper: "a4",
  margin: margens,
  binding: left,
  header: none,
  footer: none,
  // Bloco de cor sangrando no topo, só na capa (página física 1)
  background: context if here().page() == 1 {
    place(top, rect(width: 100%, height: altura-faixa, fill: cor-titulo))
  }
)

#[
  #set text(hyphenate: false)
  #show "-": "\u{2011}" // Non-breaking hyphen
  #set par(justify: false, linebreaks: "simple", leading: 0.45em)

  // Logo (opcional), título e subtítulo assentados na base do bloco de cor
  #block(width: 100%, height: altura-faixa - margens.top - 1.3cm)[
    #align(bottom + left)[
      {{#LOGO_CAPA}}
      // Altura fixa e largura proporcional, para a borda esquerda do logo
      // coincidir com a do título; logos muito largos são limitados a 6cm
      #context {
        let logo = image("{{ LOGO_CAPA }}", height: 2.4cm)
        if measure(logo).width > 6cm { image("{{ LOGO_CAPA }}", width: 6cm) } else { logo }
      }
      #v(0.8cm)
      {{/LOGO_CAPA}}
      #text(size: 30pt, fill: cor-contraste)[{{ metadados.pdf }}]
      #v(0.45cm)
      #line(length: 2.5cm, stroke: 1.5pt + cor-acento)
      {{#SUBTITULO_CAPA}}
      #v(0.35cm)
      #text(size: 11pt, tracking: 0.12em, fill: cor-contraste)[#smallcaps(lower[{{ SUBTITULO_CAPA }}])]
      {{/SUBTITULO_CAPA}}
    ]
  ]

  #v(1.3cm + 1.6cm)
  #text(size: 13pt, tracking: 0.08em, fill: luma(40))[#smallcaps(lower[{{ metadados.autor }}])]
  #v(1fr)
  #line(length: 100%, stroke: 0.4pt + cor-regua)
  #v(-0.2em)
  #text(size: 9.5pt, fill: luma(100))[{{ metadados.ano }} #h(1fr) Versão {{ metadados.versao }}]
]

// ============================================
// 2. FOLHA DE ROSTO (mesma tipografia da capa, sem o bloco de cor)
// ============================================
#nova-secao()
#[
  #set align(center)
  #set text(hyphenate: false)
  #show "-": "\u{2011}" // Non-breaking hyphen
  #set par(justify: false, linebreaks: "simple", leading: 0.45em)
  #text(size: 12pt, tracking: 0.08em)[#smallcaps(lower[{{ metadados.autor }}])]
  #v(1fr)
  #text(size: 22pt, fill: cor-titulo)[{{ metadados.pdf }}]
  {{#SUBTITULO_CAPA}}
  #v(0.5em)
  #text(size: 10.5pt, tracking: 0.1em)[#smallcaps(lower[{{ SUBTITULO_CAPA }}])]
  {{/SUBTITULO_CAPA}}
  #v(1.2em)
  #text(size: corpo-texto, style: "italic")[Versão {{ metadados.versao }}]
  #v(2fr)
  #text(size: corpo-texto)[{{ metadados.ano }}]
  {{#LICENCA_LINK_ROSTO}}
  #v(1.5em)
  #text(size: 8.5pt)[Licença: {{ LICENCA_ROTULO_ROSTO }}#link("{{ LICENCA_LINK_ROSTO }}")]
  {{/LICENCA_LINK_ROSTO}}
]


// ============================================
// 3. MIOLO: MESMO ESTILO DO PRÉ AO PÓS-TEXTUAL
// ============================================
// Daqui em diante todas as páginas usam o cabeçalho único, o número no rodapé, o corpo e
// a entrelinha dos verbetes e os mesmos títulos de seção
#nova-secao()
#counter(page).update(1)

#set page(header: cabecalho, header-ascent: 35%, footer: rodape, footer-descent: 35%, background: none)
#set columns(gutter: 7mm)
#set text(size: corpo-verbete, costs: (widow: 100%, orphan: 100%, hyphenation: 80%))
#set par(leading: 0.7em, spacing: 0.7em, justify: true)

// Sumário (uma coluna)
#heading(outlined: false, bookmarked: true)[Sumário]
#[
  #set outline.entry(fill: repeat(text(fill: luma(150))[.#h(0.25em)]))
  // Primeiro nível em versalete, como os títulos de seção no corpo
  #show outline.entry.where(level: 1): it => {
    v(0.6em, weak: true)
    link(it.element.location(), it.indented(it.prefix(), [
      #smallcaps(lower(it.body())) #box(width: 1fr, it.fill) #it.page()
    ]))
  }
  #outline(title: none, indent: 1.5em, depth: 3)
]

// [INTRODUCAO-INICIO] Introdução (uma coluna). O ExportadorTypst remove este
// trecho quando o texto da introdução está vazio
#nova-secao()
= Introdução
#let texto_markdown = ```
{{ textos.intro_pdf }}
```

// Texto corrido: recuo na primeira linha para marcar o início de cada parágrafo
#[
  #set par(first-line-indent: 1em)
  #render(texto_markdown.text)
]
// [INTRODUCAO-FIM]

// [LICENCA-INICIO] Licença (uma coluna). O ExportadorTypst remove este
// trecho quando não há licença em arquivo de texto importada
#nova-secao()
= Licença
#let texto_licenca = ```
{{ textos.licenca_typst }}
```

#[
  #set par(first-line-indent: 1em)
  #render(texto_licenca.text)
]
// [LICENCA-FIM]

// ============================================
// 4. DICIONÁRIO (DUAS COLUNAS, PALAVRAS-GUIA NO CABEÇALHO)
// ============================================
#nova-secao()
#set page(columns: 2, background: regua-colunas(2, 7mm))
#set columns(gutter: 7mm)

{{ corpo_dicionario | safe }}
// Fim da última categoria (as demais recebem o mesmo do ExportadorTypst)
#v(1000fr, weak: true)

// ============================================
// 5. PÓS-TEXTUAIS
// ============================================
// Referências em uma coluna
#nova-secao()
#set page(columns: 1, background: none)

// [REFERENCIAS-INICIO] O ExportadorTypst remove este trecho quando não há .bib
#[
  = Referências

  #set par(justify: false)

  {{ textos.referencias_typst | safe }}
]
#nova-secao()
// [REFERENCIAS-FIM]

// Índice em três colunas
#set page(columns: 3, background: regua-colunas(3, 5mm))
#set columns(gutter: 5mm)
= Índice Alfabético
#[
  // Corpo menor que o do texto: em três colunas, 9,5pt quebraria quase toda entrada
  #set text(size: 8.5pt)
  #set par(justify: false)
  #make-index()
]

// Impressão frente e verso: total de páginas par, com o verso da última folha em branco
// (mede a página pelo marcador de fim, que fica na última página com conteúdo;
// medir a própria posição oscilaria, pois ela muda quando a página é inserida)
#if impressao [
  #metadata("fim-secao") <fim-secao>
  #context if calc.odd(query(<fim-secao>).last().location().page()) { pagebreak() }
]
