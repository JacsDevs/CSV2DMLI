# A pasta do projeto

Na etapa **Fonte de Dados** você escolhe uma pasta. O app olha o que há dentro dela e decide sozinho se é um projeto **CSV** ou **CLDF**.

## Projeto CSV

Os arquivos ficam na raiz da pasta. Só a planilha é obrigatória.

| Arquivo ou pasta | Para que serve |
|---|---|
| `dicionario.csv` | A planilha do dicionário. Uma linha por entrada. Veja [Colunas do CSV](colunas-do-csv.md). |
| `configuracao.txt` | Título, autoria, citação e outras opções. Veja [O arquivo configuracao.txt](configuracao.md). |
| `audio/` | Os áudios citados na planilha. |
| `imagens/` | As imagens citadas na planilha. |
| `video/` | Os vídeos citados na planilha. |
| `textos.json` | Textos estruturados ligados às entradas. É gerado pelo Programa para Tratamento de Mídias. |
| `logo.png` | Logo mostrado no cabeçalho do dicionário (também aceita `.jpg`, `.jpeg` e `.webp`). |
| `icone.png` | Ícone do aplicativo. Usado também como logo quando não há `logo.png`. |
| `bibliografia.bib` | Referências bibliográficas em BibTeX, listadas no fim do dicionário no padrão ABNT. |
| `intro.md` ou `intro.txt` | Texto de introdução, exibido na página inicial e no início do PDF. |
| `alfabeto.txt` | Alfabeto da língua para a ordenação. A chave `Alfabeto` do `configuracao.txt` tem prioridade sobre ele. |

### Outros nomes aceitos

- **Planilha:** `dicionario.csv`, `dados.csv`, `lexico.csv` ou `planilha.csv`.
- **Pasta de áudio:** `audio`, `audios`, `som` ou `midia/audio`.
- **Pasta de imagem:** `imagens`, `imagem`, `fotos`, `foto`, `img` ou `pictures`.
- **Pasta de vídeo:** `video`, `videos`, `vid` ou `midia/video`.

## Projeto CLDF

Pacotes no padrão [CLDF](https://cldf.clld.org/) (Cross-Linguistic Data Formats) também são aceitos. A pasta precisa ter o `metadata.json` (ou `cldf-metadata.json`) e as tabelas de dados, como `entries.csv`, `senses.csv`, `forms.csv`, `examples.csv` e `media.csv`. As mídias são encontradas pelos caminhos indicados no `media.csv`.

## Projeto salvo

Uma pasta com um `projeto.json` na raiz é aberta como projeto salvo, com tudo o que foi ajustado nas etapas.

## Começar do zero

Em **Recursos › Projeto modelo** há uma pasta pronta com uma entrada de exemplo, uma mídia de cada tipo, o `configuracao.txt` comentado e um LEIA-ME. O botão **Abrir exemplo no app** carrega essa pasta sem precisar baixar nada.
