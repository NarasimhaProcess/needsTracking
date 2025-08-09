const CACHE_NAME = 'leaflet-map-cache-v1';
const urlsToCache = [
  // You might want to cache Leaflet's CSS and JS here if they are not already cached by the browser
  // 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  // 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  // Cache-first strategy for map tiles
  if (event.request.url.match(/\.(png|jpg|jpeg|gif|webp)$/)) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        // Return cached response if found
        if (response) {
          return response;
        }
        // Otherwise, fetch from network and cache
        return fetch(event.request).then((response) => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
    );
  } else {
    // For other requests, go to network
    event.respondWith(fetch(event.request));
  }
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
