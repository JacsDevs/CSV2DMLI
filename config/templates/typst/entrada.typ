{{#INDEX}}
#index("{{ INDEX }} ({{ TERMO_PARENT }})")
{{/INDEX}}
#metadata("{{ TERMO_PARENT }}") <dict-word>

#text(size: 14pt)[{{#TERMO}}*{{ TERMO }}*{{/TERMO}}]{{#FONEMICA}} {{ FONEMICA }}{{/FONEMICA}}{{#FONETICA}} {{ FONETICA }}{{/FONETICA}}{{#CLASSE}} _{{ CLASSE }}_{{/CLASSE}} {{#SIGNIFICADOS}}{{#NUMERO}}{{ NUMERO }}. {{/NUMERO}}{{#TRADUCAO}}{{ TRADUCAO }}{{/TRADUCAO}}{{#DESCRICAO}}. {{ DESCRICAO }}{{/DESCRICAO}}{{#EXEMPLOS}} {{#TRANS}}*_{{ TRANS }}_*{{/TRANS}} {{#TRAD}}{{ TRAD }}{{/TRAD}}{{/EXEMPLOS}}{{#IMAGENS}}{{#ARQUIVO}}

#v(1em)

#block(breakable: true, width: 100%)[
  #align(center)[
    #layout(size => {
      let altura-max = calc.min(size.height * 0.45, 3.5cm)
      let altura-min = 2cm
      let altura-final = calc.max(altura-min, altura-max)
      
      box(width: 100% - 2mm, height: altura-final, align(center + horizon)[
        #image("{{ ARQUIVO }}", width: 100%, height: 100%, fit: "contain")
      ])
    })
    
    {{#LEGENDA}}
    #v(0.15em, weak: true)
    #text(size: 8.5pt, style: "italic")[{{ LEGENDA }}]
    {{/LEGENDA}}
  ]
]

#v(1em)

{{/ARQUIVO}}{{/IMAGENS}}
{{#TEXTOS_ESTRUTURADOS}}

#v(1em, weak: true)
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

#v(0.5em)
#text(size: 9pt, fill: luma(80))[Veja também: {{ ITENS_RELACIONADOS }}]
{{/ITENS_RELACIONADOS}}

#v(0.5em, weak: true)

#align(center)[
  #block(width: 70%)[ 
    #grid(
      columns: (1fr, auto, 1fr),
      column-gutter: 10pt,
      align: horizon,
      line(length: 100%, stroke: 0.4pt + luma(220)),
      text(fill: luma(180), size: 12pt)[◇],
      line(length: 100%, stroke: 0.4pt + luma(220)),
    )
  ]
]

#v(0.5em, weak: true)