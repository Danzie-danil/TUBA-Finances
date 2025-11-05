// sw.js - Service Worker for TUBA Mobile App
const CACHE_NAME = 'tuba-mobile-v1.0';
const STATIC_CACHE = 'tuba-static-v1.0';
const DYNAMIC_CACHE = 'tuba-dynamic-v1.0';

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/tuba-icon.png',
  '/tuba-duplicate-cleaner.js'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

// Activate event - clean old caches and claim clients
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch event - implement cache-first strategy with network fallback
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle same-origin requests
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            console.log('[SW] Serving from cache:', request.url);
            return cachedResponse;
          }

          // Not in cache, fetch from network
          return fetch(request)
            .then(networkResponse => {
              // Don't cache non-successful responses
              if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                return networkResponse;
              }

              // Clone the response for caching
              const responseToCache = networkResponse.clone();

              caches.open(DYNAMIC_CACHE)
                .then(cache => {
                  console.log('[SW] Caching new resource:', request.url);
                  cache.put(request, responseToCache);
                });

              return networkResponse;
            })
            .catch(error => {
              console.error('[SW] Network request failed:', error);

              // Return offline fallback for HTML requests
              if (request.headers.get('accept').includes('text/html')) {
                return caches.match('/index.html');
              }

              throw error;
            });
        })
    );
  }
});

// Background sync for offline data
self.addEventListener('sync', event => {
  console.log('[SW] Background sync triggered:', event.tag);

  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Handle offline data synchronization
      syncOfflineData()
    );
  }
});

// Push notification handling
self.addEventListener('push', event => {
  console.log('[SW] Push notification received');

  const options = {
    body: event.data ? event.data.text() : 'New update available',
    icon: '/tuba-icon.png',
    badge: '/tuba-icon.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Open App',
        icon: '/tuba-icon.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/tuba-icon.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('TUBA', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Helper function for offline data sync
async function syncOfflineData() {
  try {
    // Get offline data from IndexedDB or localStorage
    const offlineData = await getOfflineData();

    if (offlineData && offlineData.length > 0) {
      // Sync data with server when online
      for (const data of offlineData) {
        await syncDataToServer(data);
      }

      // Clear offline data after successful sync
      await clearOfflineData();
      console.log('[SW] Offline data synced successfully');
    }
  } catch (error) {
    console.error('[SW] Failed to sync offline data:', error);
  }
}

// Placeholder functions for offline data management
async function getOfflineData() {
  // Implementation would depend on your data storage strategy
  return [];
}

async function syncDataToServer(data) {
  // Implementation for syncing data to server
  return Promise.resolve();
}

async function clearOfflineData() {
  // Implementation for clearing offline data
  return Promise.resolve();
}