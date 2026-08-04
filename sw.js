/* Flowtown service worker – netværk først for JS/CSS så opdateringer rammer mobil */
const CACHE = 'flowtown-v17-modern2026';
// Kun statiske assets (ikke JS/CSS/HTML) – ellers sidder man fast i gammel spil-kode
const PRECACHE = [
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-512-maskable.png',
  './assets/icons/tools/draw.png',
  './assets/icons/tools/erase.png',
  './assets/icons/tools/upgrade.png',
  './assets/icons/tools/bridge.png',
  './assets/icons/tools/undo.png',
  './assets/icons/tools/more.png',
  './assets/icons/tools/pause.png',
  './assets/icons/tools/sound.png',
  './assets/icons/tools/shop.png',
  './assets/vehicles/car.png',
  './assets/vehicles/car_fast.png',
  './assets/vehicles/truck.png',
  './assets/vehicles/truck_heavy.png',
  './assets/vehicles/bus.png',
  './assets/vehicles/van.png',
  './assets/places/capital.png',
  './assets/places/town.png',
  './assets/places/town2.png',
  './assets/places/town3.png',
  './assets/places/farm.png',
  './assets/places/factory.png',
  './assets/places/harbor.png',
  './assets/tiles/asphalt.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isCode =
    path.endsWith('.js')
    || path.endsWith('.css')
    || path.endsWith('.html')
    || path.endsWith('.webmanifest')
    || path.endsWith('/sw.js')
    || path.endsWith('/Flowtown')
    || path.endsWith('/Flowtown/')
    || path.endsWith('/');

  // Kode: altid netværk først (ingen gammel tilemap/sw i cache)
  if (isCode) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => res)
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // Billeder: cache først, baggrundsopdater
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
