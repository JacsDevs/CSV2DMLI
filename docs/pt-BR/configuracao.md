# O arquivo configuracao.txt

O `configuracao.txt` fica na raiz da pasta do projeto e guarda as opções do dicionário. Ele é **opcional**: tudo o que está nele também pode ser preenchido nas etapas do app.

## Formato

- Uma opção por linha, no formato `Chave=valor`.
- Linhas que começam com `#` são comentários e são ignoradas.
- Maiúsculas e acentos no nome da chave não fazem diferença (`Versao` e `Versão` funcionam igual).
- Chaves desconhecidas são ignoradas.

```
# Exemplo
Titulo-HTML=Dicionário da Língua X
Autor(es)=Maria Silva; João Souza
Ano=2026
Versao=1.0
```

## Identificação

| Chave | Valor |
|---|---|
| `Titulo-HTML` | Título do dicionário no site e no aplicativo. |
| `Titulo-PDF` | Título do PDF, se for diferente. |
| `Autor(es)` | Autoria. |
| `Ano` | Ano de publicação. |
| `Versao` | Versão do dicionário. Vazio, vale 1.0. |
| `Subtitulo` | Subtítulo da capa do PDF. |
| `Licenca` | Endereço web (URL) da licença de uso (ex.: `https://creativecommons.org/licenses/by/4.0/`) ou a tag de uma licença Creative Commons: `CC BY 4.0`, `CC BY-SA 4.0`, `CC BY-NC 4.0`, `CC BY-NC-SA 4.0`, `CC BY-ND 4.0`, `CC BY-NC-ND 4.0` ou `CC0 1.0`. Com tag, o dicionário mostra o nome da licença junto ao link. Também aceita `Licenca-Link`. Para incluir o texto integral da licença em vez de link, coloque o arquivo `licenca.txt` na pasta. |

## Como citar

Montam a citação do dicionário mostrada no site e no aplicativo.

| Chave | Valor |
|---|---|
| `Citacao-Autores` | Autoria como deve aparecer na citação (por exemplo, `SILVA, Maria`). Sem ela, usa `Autor(es)`. |
| `Citacao-Local` | Cidade da publicação. |
| `Citacao-Editor` | Editora ou instituição. |
| `Citacao-Link` | Endereço onde o dicionário está publicado. |

## Organização

| Chave | Valor |
|---|---|
| `Ordem das categorias` | Nomes dos campos semânticos na ordem desejada, separados por vírgula. `padrao` ou vazio = ordem alfabética. |
| `Entradas em ordem alfabetica` | Categorias cujas entradas ficam em ordem alfabética, separadas por vírgula. `todas` ou vazio = todas. |
| `Alfabeto` | Letras da língua na ordem de classificação, separadas por vírgula. Pode incluir dígrafos. |

## PDF

| Chave | Valor |
|---|---|
| `Layout do PDF` | `tela` (padrão) ou `impressao` (margens espelhadas, para imprimir frente e verso). |
| `Divisoria entre verbetes` | `sim` ou `nao`. Linha separando os verbetes. |

## Site (HTML)

| Chave | Valor |
|---|---|
| `Embutir midias no HTML` | `sim` ou `nao`. Com `sim`, o site é gerado como um arquivo único, mais fácil de enviar, mas maior. |

## Dica

O `configuracao.txt` do **Projeto modelo** (em Recursos) já traz todas as chaves com explicações. É o jeito mais fácil de começar.
