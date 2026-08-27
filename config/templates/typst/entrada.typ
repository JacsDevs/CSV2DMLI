{{#INDEX}}
#index("{{ INDEX }} ({{ TERMO_PARENT }})")
{{/INDEX}}
#metadata("{{ TERMO_PARENT }}") <dict-word>

#text(size: 14pt)[{{#TERMO}}*{{ TERMO }}*{{/TERMO}}]{{#FONEMICA}} {{ FONEMICA }}{{/FONEMICA}}{{#FONETICA}} {{ FONETICA }}{{/FONETICA}}{{#CLASSE}} _{{ CLASSE }}_{{/CLASSE}} {{#SIGNIFICADOS}}{{#NUMERO}}{{ NUMERO }}. {{/NUMERO}}{{#TRADUCAO}}{{ TRADUCAO }}{{/TRADUCAO}}{{#DESCRICAO}}. {{ DESCRICAO }}{{/DESCRICAO}}{{#EXEMPLOS}} {{#TRANS}}*_{{ TRANS }}_*{{/TRANS}} {{#TRAD}}{{ TRAD }}{{/TRAD}}{{/EXEMPLOS}}{{#IMAGENS}}{{#ARQUIVO}}

#v(0.6em)

#layout(size => {
  // Espaço restante na coluna atual
  let espaco = size.height
  // Reserva para o separador + margem abaixo da imagem
  let reserva = 1.8em
  let disponivel = espaco - reserva

  // Tamanhos configuráveis
  let altura-ideal = 3.5cm
  let altura-min = 1.2cm

  // Calcula: se cabe no espaço, usa o ideal; senão, encolhe até o mínimo
  let altura-final = if disponivel >= altura-ideal {
    altura-ideal
  } else if disponivel >= altura-min {
    disponivel
  } else {
    // Não cabe nem no mínimo — usa o ideal e deixa o Typst fluir para a próxima coluna
    altura-ideal
  }

  block(breakable: false, width: 100%)[
    #align(center)[
      #box(width: 90%, height: altura-final)[
        #image("{{ ARQUIVO }}", width: 100%, height: 100%, fit: "contain")
      ]
      {{#LEGENDA}}
      #v(0.15em, weak: true)
      #text(size: 8pt, style: "italic")[{{ LEGENDA }}]
      {{/LEGENDA}}
    ]
  ]
})

#v(0.6em)

{{/ARQUIVO}}{{/IMAGENS}}
{{#TEXTOS_ESTRUTURADOS}}

#v(0.6em, weak: true)
#pad(left: 1em)[
  *{{ TITULO_BASE }}*{{#TEXTO_NAO_LITERAL}} -- _{{ TEXTO_NAO_LITERAL }}_{{/TEXTO_NAO_LITERAL}}
  {{#VARIACOES}}
  {{#FRASES}}
  
  *_{{ ORIGINAL }}_* \
  {{ TRADUCAO }}
  {{/FRASES}}
  {{/VARIACOES}}
]
{{/TEXTOS_ESTRUTURADOS}}
{{/SIGNIFICADOS}}{{#ITENS_RELACIONADOS}}

#v(0.4em)
#text(size: 9pt, fill: luma(80))[Veja também: {{ ITENS_RELACIONADOS }}]
{{/ITENS_RELACIONADOS}}

#v(0.6em, weak: true)

#align(center)[
  #block(width: 70%)[ 
    #grid(
      columns: (1fr, auto, 1fr),
      column-gutter: 10pt,
      align: horizon,
      line(length: 100%, stroke: 0.4pt + luma(220)),
      text(fill: luma(180), size: 10pt)[◇],
      line(length: 100%, stroke: 0.4pt + luma(220)),
    )
  ]
]

#v(0.6em, weak: true)