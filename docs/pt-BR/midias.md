# Mídias

Áudios, imagens e vídeos ficam em pastas próprias dentro da pasta do projeto. A planilha cita cada mídia pelo nome do arquivo.

## Formatos aceitos

| Tipo | Pasta | Extensões | Tamanho máximo por arquivo |
|---|---|---|---|
| Áudio | `audio/` | mp3, wav, ogg, m4a, flac, wma | 200 MB |
| Imagem | `imagens/` | jpg, jpeg, png, gif, webp, bmp, svg | 100 MB |
| Vídeo | `video/` | mp4, webm, avi, mov, mkv, m4v | 1 GB |

Outros nomes de pasta aceitos estão em [A pasta do projeto](pasta-do-projeto.md).

Para o dicionário funcionar bem no celular e na web, prefira **mp3** para áudio, **jpg** ou **webp** para imagem e **mp4** para vídeo.

## Como citar a mídia na planilha

Escreva só o nome do arquivo, **com a extensão** e sem o nome da pasta:

| Coluna | Exemplo |
|---|---|
| `ARQUIVO_ENTRADA` | `casa.mp3` |
| `IMAGEM` | `casa.jpg` |
| `ARQUIVO_VIDEO` | `casa.mp4` |

Para evitar problemas, use nomes **sem espaços e sem acentos** e confira se o nome na planilha é exatamente igual ao do arquivo.

## Na etapa Mídias e Validação

Os cartões de áudio, imagem e vídeo mostram:

- o número grande: quantos arquivos há na pasta;
- abaixo dele: quantos a planilha cita e quantos desses **não foram encontrados**.

Se faltar alguma mídia, você pode arrastar os arquivos direto para o cartão, sem precisar importar a pasta de novo. O botão **Ver e adicionar** lista as mídias de cada tipo.

## Tamanho do dicionário

Mídias gravadas em alta qualidade costumam ser muito maiores do que o dicionário precisa, e isso deixa o site lento e o aplicativo pesado.

O **Programa para Tratamento de Mídias** (em **Recursos**) roda no seu computador e:

- reduz o tamanho dos áudios;
- otimiza vídeos e imagens;
- corta áudios a partir de trilhas EAF (ELAN);
- valida os dados e completa campos vazios em lote.

Ele é opcional, mas recomendado para projetos com muitas mídias.
