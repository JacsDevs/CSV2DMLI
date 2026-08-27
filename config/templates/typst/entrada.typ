{{#INDEX}}
#index("{{ INDEX }} ({{ TERMO_PARENT }})")
{{/INDEX}}
#metadata("{{ TERMO_PARENT }}") <dict-word>

#text(size: 14pt)[{{#TERMO}}*{{ TERMO }}*{{/TERMO}}]{{#FONEMICA}} {{ FONEMICA }}{{/FONEMICA}}{{#FONETICA}} {{ FONETICA }}{{/FONETICA}}{{#CLASSE}} _{{ CLASSE }}_{{/CLASSE}} {{#SIGNIFICADOS}}{{#NUMERO}}{{ NUMERO }}. {{/NUMERO}}{{#TRADUCAO}}{{ TRADUCAO }}{{/TRADUCAO}}{{#DESCRICAO}}. {{ DESCRICAO }}{{/DESCRICAO}}{{#EXEMPLOS}} {{#TRANS}}*_{{ TRANS }}_*{{/TRANS}} {{#TRAD}}{{ TRAD }}{{/TRAD}}{{/EXEMPLOS}}{{#IMAGENS}}{{#ARQUIVO}}
#v(0.4em)
#align(center)[
  #box(width: 90%, height: 2.5cm)[
    #image("{{ ARQUIVO }}", width: 100%, height: 100%, fit: "contain")
  ]
  {{#LEGENDA}}
  #v(0.1em, weak: true)
  #text(size: 8pt, style: "italic")[{{ LEGENDA }}]
  {{/LEGENDA}}
]
#v(0.3em)
{{/ARQUIVO}}{{/IMAGENS}}
{{#TEXTOS_ESTRUTURADOS}}
#v(0.4em, weak: true)
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
#v(0.3em)
#text(size: 9pt, fill: luma(80))[Veja também: {{ ITENS_RELACIONADOS }}]
{{/ITENS_RELACIONADOS}}

#v(0.3em, weak: true)
#line(length: 100%, stroke: 0.3pt + luma(210))
#v(0.3em, weak: true)