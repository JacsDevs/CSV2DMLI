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
| **LIFT** (ZIP) | Lexicon Interchange Format (XML), para importação no FLEx com as mídias copiadas automaticamente para o projeto. Exporta o dicionário completo ou um subconjunto de entradas (veja abaixo). |

### LIFT para o FLEx

O LIFT (Lexicon Interchange Format) é o formato XML de troca de léxicos do FieldWorks. Ao clicar em **Gerar LIFT**, abre a lista dos campos semânticos (e subcampos) do dicionário:

- marque um campo para levar todas as entradas dele, inclusive as dos subcampos;
- abra um campo para marcar ou desmarcar entradas avulsas;
- use a busca para achar uma entrada pelo termo, pela variante ou pela tradução.

Informe também o **código da língua (vernáculo)**. O ISO 639-3 da etapa Metadados já vem preenchido, se houver; pode ser trocado pelo código do sistema de escrita usado no projeto do FLEx.

O ZIP traz:

- `dicionario.lift`: as entradas;
- `dicionario.lift-ranges`: classes gramaticais, domínios semânticos e tipos de relação;
- `LEIA-ME.txt`: o passo a passo da importação;
- `audio/` e `pictures/`: áudios (pronúncia e exemplos) e imagens, com **Incluir arquivos de mídia** marcado.

Para importar, descompacte mantendo as pastas ao lado do `.lift` e use **Arquivo > Importar > Léxico LIFT** no FLEx. O FLEx copia as mídias para `LinkedFiles` do projeto; não há arquivo de mapeamento nem cópia manual.

Como os dados chegam ao FLEx:

- cada campo traz o código da língua: vernáculo no termo, nas variantes, na pronúncia e nos exemplos; língua das traduções (**Idioma das traduções** do CLDF, português se não escolhido) na glosa, na definição, nas notas e nas legendas de imagem;
- o áudio dos exemplos vai na língua de voz do vernáculo (código com sufixo `-Zxxx-x-audio`);
- campo e subcampos semânticos mantêm a hierarquia no `.lift-ranges`; a acepção recebe o domínio mais específico;
- homônimos saem numerados, e as relações apontam para o identificador da entrada de destino, sem ambiguidade entre homônimos; cada tipo mantém o rótulo do app, inclusive o do outro lado (por exemplo, "Forma variante de" e "Formas variantes"). Relações com entradas que ficaram fora da seleção são omitidas, e relações em texto livre (sem ID) viram uma nota;
- cada entrada tem um `guid` fixo, calculado a partir do ID da linha na planilha (ou, sem ele, do termo, da classe e da tradução): ao importar de novo, o FLEx reconhece as entradas já existentes.

Vídeos de acepção não são exportados (o FLEx não tem esse campo); o histórico de atividades avisa quando isso acontece.

## Antes de exportar

- Resolva os **erros** apontados na etapa **Mídias e Validação**. Os avisos não impedem a exportação, mas vale revisar.
- Confira título, autoria e citação na etapa **Metadados**: eles aparecem na capa, no cabeçalho e nos créditos de todos os formatos.
