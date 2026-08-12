/*
 * sw.js — Service worker d'Oboli.
 * Met en cache tous les fichiers de l'app pour un fonctionnement hors connexion.
 *
 * IMPORTANT : à chaque mise à jour de l'app, incrémente le numéro de version
 * ci-dessous (CACHE → 'oboli-v7', 'oboli-v8'…). Sans ça, le téléphone
 * continue de servir l'ancienne version depuis le cache.
 */

const CACHE = 'oboli-v7';

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/store.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok && request.url.startsWith(self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') return caches.match('./index.html');
        });
    })
  );
});
