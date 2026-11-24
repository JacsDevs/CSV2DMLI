# Primeiros passos

O CSV2DMLI transforma uma pasta com a planilha do dicionário e as mídias (áudios, imagens e vídeos) em um dicionário multimídia: site, aplicativo Android, PDF e formatos de arquivamento.

Tudo acontece no seu próprio navegador ou computador. Os dados do dicionário não são enviados para nenhum servidor.

## Antes de começar

Você precisa de uma pasta organizada assim:

```
meu-dicionario/
├── dicionario.csv
├── configuracao.txt   (opcional)
├── audio/
├── imagens/
└── video/
```

Ainda não tem uma? Em **Recursos › Projeto modelo** você pode baixar uma pasta pronta ou abrir o exemplo direto no app para ver o resultado. Os detalhes estão em [A pasta do projeto](pasta-do-projeto.md).

## As 6 etapas

1. **Fonte de Dados.** Selecione ou arraste a pasta do projeto. O formato (CSV ou CLDF) é reconhecido sozinho.
2. **Mídias e Validação.** O app confere a planilha e procura cada mídia citada. Corrija os **erros** e revise os **avisos** antes de exportar. Também dá para arrastar mídias que faltaram direto para os cartões de áudio, imagem e vídeo.
3. **Metadados.** Título, autoria, ano, versão, como citar, logo, referências bibliográficas e texto de introdução. O que estiver no `configuracao.txt` já chega preenchido.
4. **Estrutura.** A ordem das categorias (campos semânticos), a ordem das entradas dentro de cada categoria e o alfabeto usado para ordenar. Sem mudanças, tudo fica em ordem alfabética.
5. **Aparência** (opcional). As cores do site e do aplicativo, nos modos claro e escuro, e o layout do PDF.
6. **Exportar.** Gere quantos formatos quiser. Veja [Exportar](exportar.md).

## Onde acompanhar o que aconteceu

O botão **Histórico**, no cabeçalho, lista tudo o que o app fez: a pasta importada, os problemas encontrados e os arquivos gerados.

## Próximos passos

- [A pasta do projeto](pasta-do-projeto.md)
- [Colunas do CSV](colunas-do-csv.md)
- [Mídias](midias.md)
