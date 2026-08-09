/*
 * sw.js — Service worker de Budgex.
 * Met en cache tous les fichiers de l'app pour un fonctionnement hors connexion.
 *
 * IMPORTANT : à chaque mise à jour de l'app, incrémente le numéro de version
 * ci-dessous (CACHE → 'budgex-v2', 'budgex-v3'…). Sans ça, le téléphone
 * continue de servir l'ancienne version depuis le cache.
 */

const CACHE = 'budgex-v1';

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
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

// Installation : on pré-remplit le cache.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  // La nouvelle version prend la main sans attendre.
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

// Stratégie « cache d'abord, réseau en secours ».
// Idéale pour une app 100 % locale : rapide et fonctionnelle hors ligne.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  // On ne gère que les requêtes GET (le reste part directement au réseau).
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          // On met en cache les réponses valides de même origine (nos fichiers).
          if (response && response.ok && request.url.startsWith(self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Hors ligne et non caché : pour une navigation, on renvoie l'accueil.
          if (request.mode === 'navigate') return caches.match('./index.html');
        });
    })
  );
});
