// sw.js - Service Worker for TUBA Mobile App
const CACHE_NAME = 'tuba-mobile-v1.0';
const STATIC_CACHE = 'tuba-static-v1.2';
const DYNAMIC_CACHE = 'tuba-dynamic-v1.2';
// Ensure paths work under subdirectories (e.g., GitHub Pages project sites)
const BASE_PATH = new URL(self.registration.scope).pathname; // e.g. '/repo/'

// Essential app-shell assets to cache immediately (keep offline reliable)
const STATIC_ASSETS = [
  BASE_PATH + 'index.html',
  BASE_PATH, // cache scope root to support iOS A2HS launch path
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'tuba-icon.png'
];

// Optional third‑party CDN assets cached at runtime to avoid install failures
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(STATIC_CACHE);
      console.log('[SW] Caching essential assets');
      // Cache essentials individually to avoid failing the whole install
      await Promise.all(
        STATIC_ASSETS.map(url => cache.add(url).catch(err => {
          console.warn('[SW] Skipping asset (cache add failed):', url, err);
        }))
      );
      console.log('[SW] Essentials cached');
      // Do not pre-cache CDN here; cache at runtime
      await self.skipWaiting();
    } catch (error) {
      console.error('[SW] Install error:', error);
    }
  })());
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
    // Always bypass caching for Supabase API requests to avoid stale data
    const isSupabase = url.hostname.endsWith('supabase.co');
    if (isSupabase) {
      try {
        const fresh = await fetch(request, { cache: 'no-store' });
        return fresh;
      } catch (error) {
        console.warn('[SW] Supabase request failed, not cached:', request.url, error);
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    }
    // App-shell navigation fallback
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
      try {
        const fresh = await fetch(request);
        return fresh;
      } catch {
        // Try multiple fallbacks for iOS A2HS launch paths
        const shell1 = await caches.match(BASE_PATH + 'index.html');
        if (shell1) return shell1;
        const shell2 = await caches.match(BASE_PATH);
        if (shell2) return shell2;
        const shell3 = await caches.match('index.html');
        if (shell3) return shell3;
      }
    }

    // Cache-first for all other requests (same-origin and allowed cross-origin)
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    try {
      const networkResponse = await fetch(request);
      // Cache successful same-origin or allowed cross-origin responses
      if (networkResponse && (networkResponse.status === 200 || ['basic', 'cors', 'opaque'].includes(networkResponse.type))) {
        // Do NOT cache Supabase requests
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
