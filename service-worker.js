const CACHE_NAME = 'shopping-app-v7.2.0'; // Hebrew-only version

self.addEventListener('install', e => {
  console.log('[SW] Installing new service worker...');
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        '/',
        '/index.html',
        '/style.css',
        '/script.js',
        '/manifest.json'
      ]);
    }).then(() => self.skipWaiting()) // Force immediate activation
  );
});

self.addEventListener('activate', e => {
  console.log('[SW] Activating new service worker...');
  e.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim()) // Take control immediately
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});
