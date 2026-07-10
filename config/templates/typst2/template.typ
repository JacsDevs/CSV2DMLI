// ============================================
// DICIONÁRIO - TYPST (MODELO PROFISSIONAL)
// ============================================

#import "/in-dexter.typ": *
#import "/cmarker.typ": *

// CONFIGURAR FONTES - Array de prioridade com fallback
#set text(
  font: ("Charis SIL", "Linux Libertine", "Times New Roman", "Arial"),
  size: 12pt, 
  lang: "pt",
  fallback: true
)

#set par(justify: true, leading: 0.5em, first-line-indent: 0pt)

#show heading: set text(weight: "bold")
#show heading: set block(above: 1.5em, below: 1em)
#show heading.where(level: 1): set text(size: 20pt)
#show heading.where(level: 2): set text(size: 14pt)
#show heading.where(level: 3): set text(size: 12pt)

// ============================================
// 1. CAPA (DEGRADÊ SUPER SUAVE)
// ============================================
#set page(paper: "a4", margin: (top: 3.5cm, bottom: 3.5cm, left: 2cm, right: 2cm), header: none, footer: none)

#[
  #place(top + left, dx: -2cm, dy: -3.5cm)[
    #box(width: 21cm, height: 6cm, clip: true)[
      // Degradê muito suave - último ponto obrigatoriamente 100%
      #rect(
        width: 100%, 
        height: 100%, 
        fill: gradient.linear(
          (rgb("#c8e6d0"), 0%),
          (rgb("#d8f0dc"), 25%),
          (rgb("#e8f5eb"), 50%),
          (rgb("#f5faf6"), 75%),
          (rgb("#ffffff"), 100%),
          angle: 90deg
        )
      )
    ]
  ]

  #set align(center)
  #v(6.5cm) 
  
  #text(weight: "bold", size: 18pt, fill: rgb("#1b4332"), hyphenate: false)[{{ metadados.titulo }}]
  #v(1.5cm)
  #text(size: 16pt, fill: rgb("#2d6a4f"), hyphenate: false)[#strong[{{ metadados.autor }}]]
  #v(1fr)
  #text(size: 12pt, fill: rgb("#5a5a5a"))[{{ metadados.ano }}] \
  #v(0.5cm)
  #text(size: 12pt, fill: rgb("#7a7a7a"))[Versão: {{ metadados.versao }}]
]

// ============================================
// 2. FOLHA DE ROSTO
// ============================================
#pagebreak()
#[
  #set align(center)
  #text(size: 14pt, weight: "bold")[{{ metadados.autor }}]
  #v(6cm)
  #text(size: 24pt, weight: "bold")[{{ metadados.pdf }}]
  #v(0.5cm)
  #text(size: 12pt, style: "italic")[Versão {{ metadados.versao }}]
  #v(4cm)
  #v(1fr)
  #text(size: 12pt)[{{ metadados.ano }}]
]

// ============================================
// 3. PRÉ-TEXTUAIS E INTRODUÇÃO
// ============================================
#pagebreak()
#counter(page).update(1)

#set page(
  header: none,
  footer: context [
    #align(center)[#text(size: 10pt, weight: "bold")[#counter(page).display()]]
  ]
)

#outline(title: "Sumário", indent: 1em)

#pagebreak()
= Introdução
#let texto_markdown = ```
{{ textos.intro_pdf }}
```

#render(texto_markdown.text)

// ============================================
// 4. DICIONÁRIO E CORPO
// ============================================
#pagebreak()

#set page(
  header: context {
    let page-marks = query(<dict-word>).filter(m => m.location().page() == here().page())
    let page-num = counter(page).display()
    
    [
      #align(right)[#text(size: 10pt, weight: "bold")[#page-num]]
      #v(1.5em) 
      
      #if page-marks.len() > 0 {
        let first = page-marks.first().value
        let last = page-marks.last().value
        text(size: 10pt, weight: "bold")[#first #h(1fr) #last]
      } else {
        align(center)[#text(size: 15pt, style: "italic", weight: "regular")[{{ metadados.pdf }}]]
      }
      
      #v(0.2em)
      #line(length: 100%, stroke: 1.1pt)
    ]
  },
  footer: none 
)

#set page(columns: 2)
{{ corpo_dicionario }}

// ============================================
// 5. PÓS-TEXTUAIS
// ============================================
#pagebreak()

#set page(
  columns: 1,
  header: none,
  footer: context [
    #align(center)[#text(size: 10pt, weight: "bold")[#counter(page).display()]]
  ]
)

= Referências Bibliográficas

#pagebreak()
#set page(columns: 3)
= Índice Alfabético
#make-index()