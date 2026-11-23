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

#show heading: set text(weight: "bold", fill: black)
#show heading: set block(above: 1.8em, below: 0.9em, sticky: true)
#show heading.where(level: 1): set text(size: 20pt)
#show heading.where(level: 1): set block(above: 0pt, below: 1.6em)
#show heading.where(level: 2): set text(size: 13pt)
#show heading.where(level: 3): set text(size: corpo-texto)

// Nova seção: no modo impressão começa sempre em página ímpar (direita)
#let nova-secao() = if impressao { pagebreak(to: "odd") } else { pagebreak() }

// Número de página: borda externa no modo impressão, centralizado no modo tela
#let alinhamento-externo() = if impressao {
  if calc.odd(here().page()) { right } else { left }
} else { center }

#let rodape-numerado = context align(alinhamento-externo())[
  #text(size: 9pt)[#counter(page).display()]
]

// ============================================
// 1. CAPA
// ============================================
// Losango: mesmo motivo das divisórias entre verbetes
#let losango(tamanho, cor) = rotate(45deg, square(size: tamanho, stroke: 0.6pt + cor))
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

  // Título e subtítulo assentados na base do bloco de cor
  #block(width: 100%, height: altura-faixa - margens.top - 1.3cm)[
    #align(bottom + left)[
      #text(size: 30pt, fill: cor-contraste)[{{ metadados.pdf }}]
      #v(0.45cm)
      #line(length: 2.5cm, stroke: 1.5pt + cor-acento)
      {{#SUBTITULO_CAPA}}
      #v(0.35cm)
      #text(size: 11pt, tracking: 0.12em, fill: cor-contraste)[#smallcaps(lower[{{ SUBTITULO_CAPA }}])]
      {{/SUBTITULO_CAPA}}
    ]
  ]

  // Fileira de losangos logo abaixo do bloco, na largura da mancha
  #v(1.3cm + 0.8cm)
  #box(width: 100%, repeat(gap: 8pt, justify: true, losango(4pt, cor-acento)))
  #v(1.4cm)
  #text(size: 13pt, tracking: 0.08em, fill: luma(40))[#smallcaps(lower[{{ metadados.autor }}])]
  #v(1fr)
  {{#LOGO_CAPA}}
  #box(width: 6cm, height: 2.4cm, image("{{ LOGO_CAPA }}", width: 100%, height: 100%, fit: "contain"))
  #v(1.2cm)
  {{/LOGO_CAPA}}
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
  #v(0.8em)
  #losango(4pt, cor-acento)
  #v(0.6em)
  #text(size: corpo-texto, style: "italic")[Versão {{ metadados.versao }}]
  #v(2fr)
  #text(size: corpo-texto)[{{ metadados.ano }}]
]

// ============================================
// 3. PRÉ-TEXTUAIS E INTRODUÇÃO (NUMERAÇÃO NO RODAPÉ)
// ============================================
#nova-secao()
#counter(page).update(1)

#set page(header: none, footer: rodape-numerado)

#[
  #show outline.entry.where(level: 1): it => {
    set text(weight: "bold")
    v(0.6em, weak: true)
    it
  }
  #set outline.entry(fill: repeat(text(fill: luma(150))[.#h(0.25em)]))
  #outline(title: "Sumário", indent: 1.5em, depth: 3)
]

#nova-secao()
#[
  #set par(first-line-indent: 1.25em, spacing: 0.65em)
  = Introdução
  #let texto_markdown = ```
{{ textos.intro_pdf }}
```

  #render(texto_markdown.text)
]

// ============================================
// 4. DICIONÁRIO (CABEÇALHO COM PALAVRAS-GUIA, SEM RODAPÉ)
// ============================================
#nova-secao()

#set page(
  columns: 2,
  header-ascent: 35%,
  header: context {
    let page-marks = query(<dict-word>).filter(m => m.location().page() == here().page())
    let num = text(size: 9pt)[#counter(page).display()]
    set text(size: 8.5pt)

    let guias = if page-marks.len() > 0 {
      let first = page-marks.first().value
      let last = page-marks.last().value
      if first == last { strong(first) } else [*#first* --- *#last*]
    } else {
      set text(hyphenate: false)
      show "-": "\u{2011}"
      smallcaps[{{ metadados.pdf }}]
    }

    // Número na borda externa; palavras-guia ocupam o restante da linha
    if impressao and calc.even(here().page()) {
      grid(columns: (auto, 1fr), column-gutter: 1em, num, align(right, guias))
    } else {
      grid(columns: (1fr, auto), column-gutter: 1em, guias, num)
    }
    v(-0.35em)
    line(length: 100%, stroke: 0.4pt + cor-regua)
  },
  // Régua vertical fina entre as colunas, só nesta seção
  background: context {
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
    // Em página que abre categoria, a régua começa abaixo do título
    let abre-categoria = query(heading.where(level: 1)).any(h => h.location().page() == here().page())
    if abre-categoria { topo += 1.6cm }
    place(
      top + left,
      dx: esquerda + largura-mancha / 2,
      dy: topo,
      line(angle: 90deg, length: page.height - topo - base, stroke: 0.3pt + luma(200))
    )
  },
  footer: none
)
#set columns(gutter: 7mm)

#[
  #set text(size: corpo-verbete, costs: (widow: 100%, orphan: 100%, hyphenation: 80%))
  #set par(leading: 0.7em, spacing: 0.7em, justify: true)

  // Categoria (nível 1): abre página e atravessa as duas colunas, em versalete
  #show heading.where(level: 1): it => {
    pagebreak(weak: true)
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

{{ corpo_dicionario | safe }}
  // Fim da última categoria (as demais recebem o mesmo do ExportadorTypst)
  #v(1000fr, weak: true)
]

// ============================================
// 5. PÓS-TEXTUAIS (VOLTA NUMERAÇÃO NO RODAPÉ)
// ============================================
#nova-secao()
#set page(columns: 1, header: none, background: none, footer: rodape-numerado)
#set text(size: corpo-texto)
#set par(leading: 0.65em, spacing: 1em)

#[
  #show heading.where(level: 1): it => block(width: 100%, above: 0pt, below: 1.6em)[
    #set align(center)
    #it.body
  ]

  = Referências

  #set text(lang: "pt", region: "BR")
  #set par(first-line-indent: 0pt, justify: false)

  {{ textos.referencias_typst | safe }}
]

#nova-secao()
#set page(columns: 3)
#set columns(gutter: 5mm)
#show heading.where(level: 1): it => place(top + left, scope: "parent", float: true, clearance: 1.6em, it)
= Índice Alfabético
#[
  #set text(size: 8.5pt)
  #set par(justify: false, leading: 0.5em, spacing: 0.5em)
  #make-index()
]
