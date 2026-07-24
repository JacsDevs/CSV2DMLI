// const CACHE = 'csv2dmli-v2'; // versão anterior (antes do Toast UI Editor) - reverter para esta linha se abandonar o editor
const CACHE = 'csv2dmli-v5';

// Deriva o base path do próprio URL do SW.
// Em GitHub Pages: '/CSV2RMD-teste'  |  Em localhost: ''
const BASE = self.location.pathname.replace(/\/sw\.js$/, '');

const PRE_CACHE = [
  BASE + '/index-wizard.html',
  BASE + '/manifest.json',
  BASE + '/static/icons/icon-192.png',
  BASE + '/static/icons/icon-512.png',
  BASE + '/vendor/papaparse.min.js',
  BASE + '/vendor/jszip.min.js',
  BASE + '/vendor/marked.min.js',
  BASE + '/vendor/markdown2typst.esm.js',
  // Toast UI Editor (avaliação em andamento - remover estas 2 linhas se abandonar o editor)
  BASE + '/vendor/toastui-editor-all.min.js',
  BASE + '/vendor/toastui-editor.min.css',
  BASE + '/vendor/fonts/fonts.css',
  BASE + '/vendor/font-awesome/css/all.min.css',
];

const ANDROID_CACHE = 'csv2dmli-android-v1';
const ANDROID_ASSETS = [
  BASE + '/vendor/fflate.min.js',
  BASE + '/vendor/node-forge.min.js',
  BASE + '/vendor/android/template.aab',
];

self.addEventListener('install', e => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE).then(c => c.addAll(PRE_CACHE).catch(() => {})),
      caches.open(ANDROID_CACHE).then(c =>
        Promise.all(
          ANDROID_ASSETS.map(url =>
            fetch(url).then(r => { if (r.ok) c.put(url, r); }).catch(() => {})
          )
        )
      ),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== ANDROID_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // template.aab — sempre do cache Android (binário grande, imutável entre sessões)
  if (url.pathname.endsWith('template.aab')) {
    e.respondWith(
      caches.match(e.request, { cacheName: ANDROID_CACHE })
        .then(cached => cached || fetch(e.request).then(r => {
          if (r.ok) caches.open(ANDROID_CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        }))
    );
    return;
  }

  // Requisições cross-origin — só rede
  if (url.origin !== self.location.origin) {
    return;
  }

  // Demais requisições — Network First (busca sempre a versão online mais recente), fallback para o cache
  e.respondWith(
    fetch(e.request).then(r => {
      // Se a resposta online for válida, salva no cache e retorna
      if (r && r.ok && r.type !== 'opaque') {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return r;
      }
      // Se o servidor respondeu com 404 ou outro erro (mas estamos online), 
      // força o fallback para o cache!
      if (!r || !r.ok) {
        throw new Error("Network response was not ok, falling back to cache");
      }
      return r;
    }).catch(async () => {
      // Se estiver offline ou a rede falhar/retornar 404, busca no cache (ignorando ?query strings)
      const cachedResponse = await caches.match(e.request, { ignoreSearch: true });
      if (cachedResponse) return cachedResponse;
      
      // Se for uma tentativa de navegação de página e falhar, força o index-wizard
      if (e.request.mode === 'navigate') {
        return caches.match(BASE + '/index-wizard.html', { ignoreSearch: true });
      }
      
      // Retorna uma resposta amigável para evitar travamentos
      return new Response("Recurso não encontrado offline.", { status: 404, statusText: "Not Found" });
    })
  );
});
