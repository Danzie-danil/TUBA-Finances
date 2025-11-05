// sw.js - iOS-Compatible Service Worker for TUBA
const CACHE_VERSION = 'v1.0.1';
const CACHE_NAME = `tuba-mobile-${CACHE_VERSION}`;
const STATIC_CACHE = `tuba-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `tuba-dynamic-${CACHE_VERSION}`;

// Only cache files that actually exist
const STATIC_ASSETS = [
  './',
  './index.html',
  './tuba-icon.png'
];

// Install event
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static assets');
        // Use addAll with error handling for iOS
        return Promise.all(
          STATIC_ASSETS.map(url => {
            return cache.add(url).catch(err => {
              console.warn(`[SW] Failed to cache ${url}:`, err);
            });
          })
        );
      })
      .then(() => self.skipWaiting())
      .catch(error => {
        console.error('[SW] Install failed:', error);
      })
  );
});

// Activate event
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName.startsWith('tuba-') && cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - Network first, fall back to cache (better for iOS)
self.addEventListener('fetch', event => {
  const { request } = event;
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and non-http(s) requests
  if (!request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone for caching
        const responseToCache = response.clone();
        
        caches.open(DYNAMIC_CACHE)
          .then(cache => {
            cache.put(request, responseToCache);
          })
          .catch(err => {
            console.warn('[SW] Cache put failed:', err);
          });

        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(request)
          .then(cachedResponse => {
            if (cachedResponse) {
              console.log('[SW] Serving from cache:', request.url);
              return cachedResponse;
            }
            
            // Return index.html for navigation requests
            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            
            throw new Error('No cached response found');
          });
      })
  );
});

// Message handling for manual cache updates
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName.startsWith('tuba-')) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    );
  }
});
