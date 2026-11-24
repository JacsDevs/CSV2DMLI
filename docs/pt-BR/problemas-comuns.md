# Problemas comuns

## A pasta foi importada, mas nenhuma entrada apareceu

- Confira se a planilha está **na raiz** da pasta e se tem um dos nomes aceitos (`dicionario.csv`, por exemplo). Veja [A pasta do projeto](pasta-do-projeto.md).
- Confira se existe a coluna `ITEM_LEXICAL`, escrita exatamente assim.

## Os acentos ou os símbolos fonéticos aparecem estranhos

A planilha não foi salva em **UTF-8**. No Excel, use **Salvar como › CSV UTF-8**. No LibreOffice, marque **Editar configurações do filtro** ao salvar e escolha **Unicode (UTF-8)**.

## No Excel, a planilha abre toda numa coluna só

O Excel em português espera ponto e vírgula, e o CSV usa vírgula. Use **Dados › De texto/CSV**, escolha **vírgula** como delimitador e **UTF-8** como origem do arquivo.

## Uma mídia aparece como "não encontrada"

- O nome na planilha precisa ser **idêntico** ao do arquivo, com a extensão (`casa.mp3`, não `casa`).
- O arquivo precisa estar na pasta do tipo certo (`audio/`, `imagens/` ou `video/`).
- Maiúsculas e minúsculas contam: `Casa.mp3` e `casa.mp3` são nomes diferentes. Acentos também são causa frequente.
- A extensão precisa ser uma das aceitas. Veja [Mídias](midias.md).

Você pode arrastar o arquivo que faltou direto para o cartão da mídia na etapa **Mídias e Validação**.

## O site ou o aplicativo ficaram muito grandes

Reduza o tamanho das mídias com o **Programa para Tratamento de Mídias** (em **Recursos**) antes de importar. No aplicativo Android, as opções avançadas permitem baixar parte das mídias depois da instalação.

## As categorias ou as entradas estão na ordem errada

Ajuste na etapa **Estrutura**, ou use as chaves `Ordem das categorias`, `Entradas em ordem alfabetica` e `Alfabeto` do [configuracao.txt](configuracao.md).

## Perdi a chave do aplicativo Android

Sem a chave usada na primeira publicação (`chave_upload.p12`) e a senha, não é possível atualizar o mesmo aplicativo na Google Play. Procure a cópia que veio no `.zip` da primeira geração.

## Ainda não resolveu?

O **Histórico**, no cabeçalho, mostra os detalhes do que aconteceu. Use **Recursos › Reportar um problema** e inclua essas informações.
