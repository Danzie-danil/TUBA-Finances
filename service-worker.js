self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open('tuba-cache-v1').then(function (cache) {
      return cache.addAll(['./', './index.html']);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('sync', function (event) {
  if (event.tag === 'sync-queues') {
    event.waitUntil(
      self.clients.matchAll().then(function (clients) {
        clients.forEach(function (client) {
          client.postMessage({ type: 'sync-queues' });
        });
      })
    );
  }
});
