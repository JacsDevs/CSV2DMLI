# Colunas do CSV

O `dicionario.csv` tem **uma linha por entrada** e uma coluna para cada informação. Só a coluna `ITEM_LEXICAL` é obrigatória. As outras podem faltar ou ficar vazias.

Os nomes das colunas precisam ser escritos exatamente como abaixo, em maiúsculas e sem acentos.

## Entrada

| Coluna | O que vai nela |
|---|---|
| `ID` | Código fixo da linha, como `e7kq2xm`. Outras entradas usam esse código para se relacionar com esta. Veja [Relações entre entradas](#relações-entre-entradas). |
| `ITEM_LEXICAL` | A palavra na língua documentada. **Obrigatória.** |
| `CLASSE_GRAMATICAL` | Classe gramatical (substantivo, verbo…). |
| `TRANSCRICAO_FONEMICA` | Transcrição fonêmica, por exemplo `/kaza/`. |
| `TRANSCRICAO_FONETICA` | Transcrição fonética, por exemplo `[ˈkazɐ]`. |
| `ARQUIVO_ENTRADA` | Nome do áudio com a pronúncia da palavra. Também aceita o nome antigo `ARQUIVO_SONORO`. |
| `TRADUCAO_SIGNIFICADO` | Tradução ou significado. |
| `DESCRICAO` | Descrição ou explicação mais longa. |
| `ITENS_RELACIONADOS` | Relações com outras entradas (sinônimo, variante, veja também…) ou palavras relacionadas, em texto. Veja [Relações entre entradas](#relações-entre-entradas). |

## Categorias

| Coluna | O que vai nela |
|---|---|
| `CAMPO_SEMANTICO` | A categoria da entrada (por exemplo: Natureza, Corpo, Casa). Organiza o dicionário em seções. |
| `SUB_CAMPO_SEMANTICO` | Uma subcategoria dentro do campo semântico. |
| `SUB_CAMPO_SEMANTICO_1` a `SUB_CAMPO_SEMANTICO_6` | Níveis mais profundos de subcategoria, se precisar. |

## Exemplos de uso

| Coluna | O que vai nela |
|---|---|
| `TRANSCRICAO_EXEMPLO` | Uma frase de exemplo na língua documentada. |
| `TRADUCAO_EXEMPLO` | A tradução da frase de exemplo. |
| `ARQUIVO_SONORO_EXEMPLO` | Nome do áudio da frase de exemplo. |

## Imagens e vídeo

| Coluna | O que vai nela |
|---|---|
| `IMAGEM` | Nome do arquivo de imagem. |
| `LEGENDA_IMAGEM` | Legenda da imagem. |
| `ARQUIVO_VIDEO` | Nome do arquivo de vídeo. |

## Textos

| Coluna | O que vai nela |
|---|---|
| `TEXTO` | Liga a entrada a um texto do `textos.json`. |
| `TITULO_TEXTO` | Título desse texto. |

## Relações entre entradas

Uma entrada pode apontar para outras: sinônimos, antônimos, formas variantes, derivados e assim por diante. No HTML e no app, o termo relacionado vira um link para o verbete dele. No PDF, ele aparece com a página onde está.

1. Cada linha recebe um código fixo na coluna `ID`: a letra `e` seguida de 6 letras ou números, por exemplo `e7kq2xm`. O código nunca muda, mesmo que a entrada mude de lugar ou de grafia. O Programa para Tratamento de Mídias gera esses códigos sozinho.
2. Em `ITENS_RELACIONADOS`, escreva `tipo:código` para cada relação, separando com `|`. Exemplo: `sinonimo:e7kq2xm | forma_variante:e4hmpqr`.
3. Um código sem tipo vale **Veja também**. Um texto que não é código (por exemplo, `kaxi`) aparece como está, sem link, como antes.

A relação é escrita em **uma** das entradas. O dicionário mostra os dois lados: se `pira` diz `forma_variante:` com o código de `kaxi`, o verbete de `kaxi` mostra **Formas variantes: pira**. Quando várias linhas formam uma entrada só (acepções), valem as relações de todas elas.

| Tipo | Como aparece | Do outro lado |
|---|---|---|
| `veja` | Veja também | Veja também |
| `sinonimo` | Sinônimo de | Sinônimo de |
| `antonimo` | Antônimo de | Antônimo de |
| `nao_confundir` | Não confundir com | Não confundir com |
| `forma_variante` | Forma variante de | Formas variantes |
| `derivado` | Derivado de | Derivados |
| `diminutivo` | Diminutivo de | Diminutivos |
| `composto` | Forma parte do composto | Componentes |
| `tipo_de` | É um tipo de | Tipos |
| `parte_de` | Parte de | Partes |

Para criar tipos ou mudar os nomes que aparecem, ponha um `relacoes.txt` na raiz da pasta, uma linha por tipo:

```
# código = como aparece | como aparece do outro lado
sinonimo = Sin.
classificador = Classificador de | Classificadores
```

Sem a parte depois do `|`, o tipo aparece igual dos dois lados. O código usa letras minúsculas sem acento, números e `_`.

## Mais de um valor na mesma célula

Use a barra vertical `|` para separar os valores. A ordem importa: o primeiro valor de uma coluna combina com o primeiro da outra.

- **Várias imagens:** `foto1.jpg|foto2.jpg` em `IMAGEM` e `Legenda 1|Legenda 2` em `LEGENDA_IMAGEM`.
- **Vários exemplos:** separe com `|` em `TRANSCRICAO_EXEMPLO`, `TRADUCAO_EXEMPLO` e `ARQUIVO_SONORO_EXEMPLO`.
- **Variações da palavra:** separe com `|` em `ITEM_LEXICAL`, `ARQUIVO_ENTRADA`, `TRANSCRICAO_FONEMICA` e `TRANSCRICAO_FONETICA`. Cada posição vira uma variação da mesma entrada.

### Alternativa com colunas numeradas

Se preferir uma coluna para cada valor, use colunas numeradas de 1 a 10:

- **Imagens:** `IMAGEM_1`, `LEGENDA_1`, `IMAGEM_2`, `LEGENDA_2`…
- **Exemplos:** `EX_1_TRANS`, `EX_1_TRAD`, `EX_1_AUDIO`, `EX_2_TRANS`…
- **Variações:** `VAR_1_ITEM`, `VAR_1_AUDIO`, `VAR_1_FONE`, `VAR_1_FONET`…

## Como salvar a planilha

- Salve como **CSV com codificação UTF-8**. Outras codificações estragam os acentos e os símbolos fonéticos.
- O separador padrão é a **vírgula**. Se, ao abrir no Excel, tudo aparecer numa coluna só, use **Dados › De texto/CSV** e escolha vírgula como separador e UTF-8 como codificação.
- Nos nomes de mídia, escreva o nome do arquivo **com a extensão** (`casa.mp3`), sem o nome da pasta. Veja [Mídias](midias.md).
