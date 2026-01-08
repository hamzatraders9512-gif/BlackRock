const CACHE_NAME = 'blackrock-static-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/css/styles-new.css',
  '/css/mobile.css',
  '/js/auth.js',
  '/js/auth-shared.js',
  '/js/theme-toggle.js',
  '/js/mobile-utils.js',
  '/js/pwa-register.js',
  '/assets/google.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Only attempt to cache a valid, successful response
          if (!res || !res.ok) return res;

          // Don't try to cache streaming EventSource responses or opaque responses
          const contentType = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
          if (contentType.includes('text/event-stream') || res.type === 'opaque') {
            return res;
          }

          // Clone the response before consuming it for cache
          const resClone = res.clone();

          // Use event.waitUntil so caching errors don't break the fetch handler
          event.waitUntil(
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(req.clone(), resClone))
              .catch((err) => {
                // Log cache errors for debugging (network errors, opaque responses, etc.)
                console.warn('service-worker cache.put failed:', err);
              })
          );

          return res;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});
