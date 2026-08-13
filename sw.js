// const CACHE = 'csv2dmli-v2'; // versão anterior (antes do Toast UI Editor) - reverter para esta linha se abandonar o editor
const CACHE = 'csv2dmli-v7';

// Deriva o base path do próprio URL do SW.
// Em GitHub Pages: '/CSV2DMLI'  |  Em localhost: ''
const BASE = self.location.pathname.replace(/\/sw\.js$/, '');

const PRE_CACHE = [
  BASE + '/index.html',
  BASE + '/manifest.json',
  BASE + '/static/icons/icon-192.png',
  BASE + '/static/icons/icon-512.png',
  BASE + '/vendor/papaparse.min.js',
  BASE + '/vendor/jszip.min.js',
  BASE + '/vendor/marked.min.js',
  BASE + '/vendor/markdown2typst.esm.js',
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
  console.log('[SW] Instalando versão:', CACHE);
  e.waitUntil(
    Promise.all([
      caches.open(CACHE).then(c => {
        console.log('[SW] Fazendo cache dos arquivos estáticos:', PRE_CACHE);
        return c.addAll(PRE_CACHE).catch(err => console.error('[SW] Erro no cache estático:', err));
      }),
      caches.open(ANDROID_CACHE).then(c =>
        Promise.all(
          ANDROID_ASSETS.map(url =>
            fetch(url).then(r => { if (r.ok) c.put(url, r); }).catch(err => console.error('[SW] Erro no asset Android:', url, err))
          )
        )
      ),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  console.log('[SW] Ativado:', CACHE);
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== ANDROID_CACHE)
          .map(k => {
            console.log('[SW] Deletando cache antigo:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Redirecionamento de compatibilidade para atalhos antigos do PWA
  if (url.pathname.endsWith('index-wizard.html')) {
    console.log('[SW] Atalho antigo detectado. Redirecionando para index.html...');
    e.respondWith(
      caches.match(BASE + '/index.html', { ignoreSearch: true })
        .then(cached => cached || fetch(BASE + '/index.html'))
    );
    return;
  }

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

  if (url.origin !== self.location.origin) {
    return;
  }

  e.respondWith(
    fetch(e.request).then(r => {
      if (r && r.ok && r.type !== 'opaque') {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return r;
      }
      console.warn('[SW] Rede respondeu com erro, ativando fallback offline para:', e.request.url);
      if (!r || !r.ok) {
        throw new Error("Network response was not ok");
      }
      return r;
    }).catch(async (err) => {
      console.log('[SW] Erro de rede ou offline. Buscando no cache:', e.request.url, err);
      const cachedResponse = await caches.match(e.request, { ignoreSearch: true });
      if (cachedResponse) {
        console.log('[SW] Servido do cache com sucesso:', e.request.url);
        return cachedResponse;
      }
      
      console.warn('[SW] Falha total. Recurso não está no cache:', e.request.url);
      if (e.request.mode === 'navigate') {
        console.log('[SW] Forçando carregamento do index.html (Navegação fallback)');
        return caches.match(BASE + '/index.html', { ignoreSearch: true });
      }
      
      return new Response("Recurso não encontrado offline.", { status: 404, statusText: "Not Found" });
    })
  );
});

