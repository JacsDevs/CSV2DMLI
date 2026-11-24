# Exportar

Na última etapa você escolhe os formatos do dicionário. Dá para gerar quantos quiser, e voltar às etapas anteriores para ajustar e gerar de novo.

## Para o público

### Aplicativo Android

Gera um aplicativo para instalar no celular, que funciona **sem internet**, com áudios e imagens.

- **Nome do aplicativo:** aparece embaixo do ícone no celular e na loja.
- **Versão:** aumente a cada atualização enviada à Google Play.
- **Chave de assinatura:** prova à Google Play que o app é seu.
  - Na primeira publicação, o app cria uma chave nova. Uma cópia vai junto no `.zip` gerado, com o nome `chave_upload.p12`.
  - Nas atualizações, importe **sempre a mesma chave**, com a mesma senha.

> **Guarde a chave e a senha em local seguro.** Se forem perdidas, não será possível publicar atualizações do aplicativo na Google Play.

O conteúdo pode vir do projeto aberto agora ou de um HTML já exportado. As instruções para publicar na loja vêm no LEIA-ME do `.zip`.

### Página web (HTML)

Para abrir no navegador ou publicar na internet.

- **Normal:** o HTML e as pastas de mídia. Publique a pasta inteira.
- **Arquivo único:** as mídias vão dentro do HTML. Basta enviar um arquivo, mas ele fica maior.

### Documento PDF

Para imprimir ou distribuir como livro. Na etapa **Aparência** você escolhe:

- **Leitura em tela** ou **Impressão encadernada** (margens espelhadas e seções começando em página ímpar);
- se haverá uma linha divisória entre os verbetes.

## Formatos técnicos e arquivamento

| Formato | Para quê |
|---|---|
| **CLDF** (ZIP) | Padrão aberto para arquivamento e pesquisa linguística. Use o nome da língua, o código ISO 639-3 e o Glottocode da etapa Metadados. |
| **Typst** | Código-fonte do PDF, para ajustar a diagramação à mão. |
| **LaTeX** (ZIP) | Para editoras e revistas que trabalham com LaTeX. |

## Antes de exportar

- Resolva os **erros** apontados na etapa **Mídias e Validação**. Os avisos não impedem a exportação, mas vale revisar.
- Confira título, autoria e citação na etapa **Metadados**: eles aparecem na capa, no cabeçalho e nos créditos de todos os formatos.
