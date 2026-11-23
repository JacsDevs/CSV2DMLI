#v(0.6em, weak: true)
{{#INDEX}}
#index("{{ INDEX }} ({{ TERMO_PARENT }})")
{{/INDEX}}
#metadata("{{ TERMO_PARENT }}") <dict-word>
{{#TERMO}}*{{ TERMO }}*{{/TERMO}}{{#FONEMICA}} {{ FONEMICA }}{{/FONEMICA}}{{#FONETICA}} {{ FONETICA }}{{/FONETICA}}{{#CLASSE}} _{{ CLASSE }}_{{/CLASSE}}{{#DESCRICAO_ENTRADA}} #text(size: 8.5pt, fill: luma(60))[{{ DESCRICAO_ENTRADA }}]{{/DESCRICAO_ENTRADA}}
{{#SIGNIFICADOS}}{{#NUMERO}}*{{ NUMERO }}.* {{/NUMERO}}{{#TRADUCAO}}{{ TRADUCAO }}{{/TRADUCAO}}{{#DESCRICAO}}. {{ DESCRICAO }}{{/DESCRICAO}}{{#EXEMPLOS}}{{#TRANS}} _{{ TRANS }}_{{/TRANS}}{{#TRAD}} – {{ TRAD }}{{/TRAD}}{{/EXEMPLOS}}{{#IMAGENS}}{{#ARQUIVO}}

// Imagem com altura dinâmica: encolhe só quando não cabe inteira no fim da coluna.
// A estrutura abaixo tem o mesmo layout seja qual for o tamanho desenhado, então o
// documento converge (medir posições e mudar o layout causava cascata de passadas):
//  1. bloco mínimo, que não quebra: se nem o mínimo couber, tudo vai para a próxima coluna;
//  2. bloco 1fr: recebe o espaço que sobra na coluna (no fim dela, é o espaço até o pé);
//  3. espaçamento fraco com o resto da altura cheia: some no fim da coluna se não couber.
// A imagem é desenhada a partir do topo do bloco mínimo: cheia quando há espaço,
// ou reduzida ao que sobra quando ela é o último elemento da coluna.
#let img-cheia = 128pt  // ~4.5cm
#let img-min = 100pt    // ~3.5cm: abaixo disso a imagem vai inteira para a próxima coluna
#let img-legenda = 0pt{{#LEGENDA}} + 12pt{{/LEGENDA}}
#block(height: img-min + img-legenda, width: 100%, breakable: false, above: 0.8em, below: 0pt)
#block(height: 1fr, width: 100%, above: 0pt, below: 0pt, context layout(tamanho => {
  let sobra = tamanho.height
  let ate-o-pe = page.height - margens.bottom - here().position().y
  let no-pe-da-coluna = ate-o-pe - sobra < 2pt
  // No meio da coluna, a sobra é folga da coluna: a imagem cresce até 24pt com ela
  // e o que restar fica dividido acima e abaixo, em vez de um vão só embaixo
  let crescimento = if no-pe-da-coluna { 0pt } else { calc.min(sobra, 24pt) }
  let altura = if no-pe-da-coluna { calc.min(img-cheia, img-min + sobra) } else { img-cheia + crescimento }
  let deslocamento = if no-pe-da-coluna { 0pt } else { (sobra - crescimento) / 2 }
  place(top, dy: -(img-min + img-legenda) + deslocamento, block(width: 100%)[
    #align(center)[
      #box(width: 100%, height: altura)[
        #image("{{ ARQUIVO }}", width: 100%, height: 100%, fit: "contain")
      ]
      {{#LEGENDA}}
      #v(0.35em, weak: true)
      #text(size: 7.5pt, style: "italic", fill: luma(70))[{{ LEGENDA }}]
      {{/LEGENDA}}
    ]
  ])
}))
#v(img-cheia - img-min + 0.8em, weak: true)

{{/ARQUIVO}}{{/IMAGENS}}{{#TEXTOS_ESTRUTURADOS}}

#block(above: 0.45em, below: 0.45em, inset: (left: 0.6em), stroke: (left: 0.5pt + luma(190)))[
  #set text(size: 9pt)
  *{{ TITULO_BASE }}*{{#TEXTO_NAO_LITERAL}} -- _{{ TEXTO_NAO_LITERAL }}_{{/TEXTO_NAO_LITERAL}}
  {{#VARIACOES}}
  {{#FRASES}}

  _{{ ORIGINAL }}_ \
  {{ TRADUCAO }}
  {{/FRASES}}
  {{/VARIACOES}}
]
{{/TEXTOS_ESTRUTURADOS}}
{{/SIGNIFICADOS}}{{#ITENS_RELACIONADOS}} #text(size: 8.5pt)[→ _Veja também_ {{ ITENS_RELACIONADOS }}]{{/ITENS_RELACIONADOS}}

// Separador entre verbetes: marca onde um termina e o outro começa
// (opção "Linha divisória" no cartão do PDF)
{{#SEPARADOR}}
#v(0.6em, weak: true)
#align(center)[
  #block(width: 60%)[
    #grid(
      columns: (1fr, auto, 1fr),
      column-gutter: 8pt,
      align: horizon,
      line(length: 100%, stroke: 0.4pt + luma(200)),
      // Losango desenhado (a Charis não tem o glifo ◇)
      rotate(45deg, square(size: 3.5pt, stroke: 0.5pt + luma(160))),
      line(length: 100%, stroke: 0.4pt + luma(200)),
    )
  ]
]
#v(0.6em, weak: true)
{{/SEPARADOR}}
{{#SEM_SEPARADOR}}
#v(1.1em, weak: true)
{{/SEM_SEPARADOR}}
