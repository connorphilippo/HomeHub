/**
 * Minimal cache-first service worker. Caches the app shell (HTML/CSS/JS/
 * icons) on install so the app opens even with no network connection —
 * matching the native version's "offline functionality" requirement for
 * everything except voice input, which genuinely needs a network
 * connection in this browser-based build (see js/voice.js).
 *
 * Cache-first, not network-first: for an app shell this small and this
 * infrequently changed, prioritizing instant load over always-fresh
 * assets is the right tradeoff. CACHE_VERSION below is the manual
 * cache-busting mechanism — bump it any time these files change, or
 * returning visitors will keep seeing the old cached version.
 */

const CACHE_VERSION = 'homehub-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css',
  './css/main.css',
  './js/icons.js',
  './js/db.js',
  './js/nlp.js',
  './js/voice.js',
  './js/theme.js',
  './js/screens.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS_TO_CACHE)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests for same-origin assets — anything else
  // (e.g. a future API call) should pass through to the network
  // untouched rather than being intercepted by this cache logic.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        // Offline and not in cache — for a navigation request, fall back
        // to the cached index.html so the app shell still loads rather
        // than showing the browser's default offline error page.
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    }),
  );
});
