// Offline support: cache the app shell on install, serve from cache first,
// and refresh the cache in the background.

const CACHE = 'intransitive-v5';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/engine.js',
  './js/ai.js',
  './js/worker.js',
  './js/board.js',
  './js/lessons.js',
  './js/game.js',
  './js/puzzles.js',
  './js/tutorial.js',
  './js/home.js',
  './js/analysis.js',
  './js/sound.js',
  './js/fx.js',
  './js/stats.js',
  './js/coach.js',
  './js/review.js',
  './js/settings.js',
  './js/online.js',
  './js/strategy.js',
  './js/puzzledata.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  // Network first so an update shows up on the next load; the cache is the
  // offline fallback.
  event.respondWith(
    fetch(event.request).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
      }
      return res;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html'))),
  );
});
