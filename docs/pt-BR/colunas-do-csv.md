# Colunas do CSV

O `dicionario.csv` tem **uma linha por entrada** e uma coluna para cada informação. Só a coluna `ITEM_LEXICAL` é obrigatória. As outras podem faltar ou ficar vazias.

Os nomes das colunas precisam ser escritos exatamente como abaixo, em maiúsculas e sem acentos.

## Entrada

| Coluna | O que vai nela |
|---|---|
| `ID` | Identificador da entrada (número ou código). |
| `ITEM_LEXICAL` | A palavra na língua documentada. **Obrigatória.** |
| `CLASSE_GRAMATICAL` | Classe gramatical (substantivo, verbo…). |
| `TRANSCRICAO_FONEMICA` | Transcrição fonêmica, por exemplo `/kaza/`. |
| `TRANSCRICAO_FONETICA` | Transcrição fonética, por exemplo `[ˈkazɐ]`. |
| `ARQUIVO_ENTRADA` | Nome do áudio com a pronúncia da palavra. Também aceita o nome antigo `ARQUIVO_SONORO`. |
| `TRADUCAO_SIGNIFICADO` | Tradução ou significado. |
| `DESCRICAO` | Descrição ou explicação mais longa. |
| `ITENS_RELACIONADOS` | Outras palavras relacionadas a esta entrada. |

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
