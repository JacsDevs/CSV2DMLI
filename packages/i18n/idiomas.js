// Lista dos idiomas da interface. Lida pela página, pelo service worker e pelo verificador.
//
// Para adicionar um idioma:
//   1. Crie packages/i18n/locales/<codigo>.js (copie en.js).
//   2. Registre o idioma nesta lista.
//   3. Adicione a tag <script> do dicionário no <head> do index.html.
//   4. Rode: npm run i18n:verificar
//
// O PT-BR não tem dicionário: os textos em português do próprio código são as chaves.
globalThis.I18N_IDIOMA_PADRAO = 'pt-BR';
globalThis.I18N_IDIOMAS = [
    { codigo: 'pt-BR', nome: 'Português (Brasil)' },
    { codigo: 'en', nome: 'English' },
    { codigo: 'es', nome: 'Español' },
];
