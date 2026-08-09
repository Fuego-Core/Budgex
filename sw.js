/*
 * sw.js — Service worker d'Oboli.
 * Met en cache tous les fichiers de l'app pour un fonctionnement hors connexion.
 *
 * IMPORTANT : à chaque mise à jour de l'app, incrémente le numéro de version
 * ci-dessous (CACHE → 'oboli-v6', 'oboli-v7'…). Sans ça, le téléphone
 * continue de servir l'ancienne version depuis le cache.
 */

const CACHE = 'oboli-v14';

// Tous les fichiers nécessaires pour tourner sans réseau.
// Chemins relatifs pour fonctionner aussi sous un sous-dossier (GitHub Pages).
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/store.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192-v2.png',
  './icons/icon-512-v2.png',
  './icons/icon-maskable-512-v2.png',
];

// Installation : on pré-remplit le cache et on active la nouvelle version
// immédiatement (mise à jour automatique, sans intervention).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activation : on supprime les anciens caches (versions précédentes).
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stratégie « réseau d'abord, cache en secours ».
// On privilégie la dernière version en ligne (fini le blocage sur du cache
// périmé), tout en restant utilisable hors connexion grâce au cache.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  // On ne gère que les requêtes GET (le reste part directement au réseau).
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Réponse réseau OK : on rafraîchit le cache et on la sert.
        if (response && response.ok && request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        // Hors ligne (ou échec réseau) : on retombe sur le cache.
        caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === 'navigate') return caches.match('./index.html');
          return undefined;
        })
      )
  );
});
