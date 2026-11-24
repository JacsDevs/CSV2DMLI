SAMPLE PROJECT — CSV2DMLI
=========================

This folder is a dictionary project ready to use as a starting point.
It already works: import the folder into CSV2DMLI to see the result.

WHAT'S HERE
-----------
dicionario.csv     The dictionary spreadsheet. Each row is a word (entry).
configuracao.txt   Title, authors, citation and other options (optional).
audio/             Audio files named in the ARQUIVO_ENTRADA (and ARQUIVO_SONORO_EXEMPLO) column.
imagens/           Images named in the IMAGEM column.
video/             Videos named in the ARQUIVO_VIDEO column.

The file names, folder names and column names are in Portuguese and must be kept
as they are: CSV2DMLI looks for them by name.

HOW TO USE
----------
1. Open dicionario.csv in a spreadsheet (LibreOffice Calc, Excel or Google Sheets).
   If everything shows up in a single column, import the file choosing "comma" as
   the separator and UTF-8 as the encoding.
2. Replace the sample row with your data: one row per word.
   Only ITEM_LEXICAL is required; the other columns may be left empty.
3. Put each media file in the right folder and write its file name, with the
   extension, in the matching column (e.g. house.mp3, house.jpg).
4. Save the spreadsheet as CSV (UTF-8), keeping the name dicionario.csv.
5. Adjust configuracao.txt if you like. It has explanations inside.
6. In CSV2DMLI, step "Data Source", select or drag this folder.

TIPS
----
- More than one value in the same cell: separate them with "|" (e.g.
  photo1.jpg|photo2.jpg in IMAGEM and the captions in the same order in LEGENDA_IMAGEM).
- File names without spaces or accents avoid problems.
- Many media files or large files? The "Media Processing Program" (Resources, in the
  app) reduces the size of audio, video and images before importing.
