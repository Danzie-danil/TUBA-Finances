// sw.js - Service Worker for TUBA Mobile App
const CACHE_NAME = 'tuba-mobile-v1.0';
const STATIC_CACHE = 'tuba-static-v1.1';
const DYNAMIC_CACHE = 'tuba-dynamic-v1.1';
// Ensure paths work under subdirectories (e.g., GitHub Pages project sites)
const BASE_PATH = new URL(self.registration.scope).pathname; // e.g. '/repo/'

// Third-party CDN assets referenced by index.html that must be available offline
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// Static assets to cache immediately (use subpath-aware URLs)
const STATIC_ASSETS = [
  BASE_PATH + 'index.html',
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'tuba-icon.png',
  ...CDN_ASSETS
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
  const request = event.request;
  const url = new URL(request.url);

  // Only handle GET requests for offline caching; let others pass through
  if (request.method !== 'GET') {
    return; // default behavior
  }

  event.respondWith((async () => {
    // App-shell navigation fallback
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
      try {
        const fresh = await fetch(request);
        return fresh;
      } catch {
        const shell = await caches.match(BASE_PATH + 'index.html');
        if (shell) return shell;
      }
    }

    // Cache-first for all other requests (same-origin and cross-origin)
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    try {
      const networkResponse = await fetch(request);
      // Cache successful or CORS/opaque responses so they are available offline later
      if (networkResponse && (networkResponse.status === 200 || ['basic', 'cors', 'opaque'].includes(networkResponse.type))) {
        const cache = await caches.open(DYNAMIC_CACHE);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (error) {
      console.error('[SW] Network request failed:', error, 'for', request.url);

      // Final fallback: try app shell for navigations; otherwise, return 503 Offline
      if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        const shell = await caches.match(BASE_PATH + 'index.html');
        if (shell) return shell;
      }

      // Attempt path-only match for same-origin static resources
      if (url.origin === location.origin) {
        const pathFallback = await caches.match(BASE_PATH + url.pathname.replace(BASE_PATH, ''));
        if (pathFallback) return pathFallback;
      }

      return new Response('', { status: 503, statusText: 'Offline' });
    }
  })());
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
    icon: BASE_PATH + 'tuba-icon.png',
    badge: BASE_PATH + 'tuba-icon.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Open App',
        icon: BASE_PATH + 'tuba-icon.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: BASE_PATH + 'tuba-icon.png'
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
      clients.openWindow(BASE_PATH)
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