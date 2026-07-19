const CACHE_NAME = 'sut-sihirbazi-pwa-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.png',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Service worker yüklendiğinde cache oluştur ve varlıkları kaydet
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 PWA: Cache açıldı ve statik varlıklar önbelleğe alınıyor.');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Yeni service worker aktif olduğunda eski cache'leri sil
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🧹 PWA: Eski cache siliniyor:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Ağ isteklerini dinle ve Cache-First veya Network-Fallback stratejisi kullan
self.addEventListener('fetch', (event) => {
  // Sadece HTTP/HTTPS isteklerini yönet
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Önbellekte varsa doğrudan önbellekten ver
        return cachedResponse;
      }
      
      // Önbellekte yoksa ağdan çek
      return fetch(event.request).then((response) => {
        // Başarılı ve yerel kaynak olan yanıtları önbelleğe kaydet (dinamik cache)
        if (
          response && 
          response.status === 200 && 
          response.type === 'basic' &&
          !event.request.url.includes('/query/') && // Yapay zeka sorgularını cache'leme
          !event.request.url.includes('/alarms')    // Canlı alarmları cache'leme
        ) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      }).catch((err) => {
        console.log('📴 PWA: Çevrimdışı bağlantı ve ağ hatası:', err);
        // Ağ hatası durumunda alternatif çevrimdışı yanıt verilebilir
      });
    })
  );
});
