# Documentação do CSV2DMLI

A mesma documentação aparece dentro do app, em **Recursos › Documentação**.

## Português

1. [Primeiros passos](pt-BR/primeiros-passos.md)
2. [A pasta do projeto](pt-BR/pasta-do-projeto.md)
3. [Colunas do CSV](pt-BR/colunas-do-csv.md)
4. [O arquivo configuracao.txt](pt-BR/configuracao.md)
5. [Mídias](pt-BR/midias.md)
6. [Exportar](pt-BR/exportar.md)
7. [Problemas comuns](pt-BR/problemas-comuns.md)

## Para manter

- Cada página é um arquivo Markdown em `docs/<idioma>/`. A lista de páginas exibida no app fica em `DOCS_PAGINAS`, no `index.html`.
- Links entre páginas usam o nome do arquivo (`[Mídias](midias.md)`): funcionam no GitHub e no app.
- Para traduzir, crie `docs/en/` ou `docs/es/` com os mesmos nomes de arquivo e acrescente o idioma em `DOCS_IDIOMAS`, no `index.html`.
- Ao mudar o formato do projeto (colunas, chaves do `configuracao.txt`, pastas), atualize também o projeto modelo em `assets/projeto-modelo/`.
