/* Flowtown service worker – offline cache for core shell */
const CACHE = 'flowtown-v14-no-grid';
const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/game.js',
  './js/input.js',
  './js/road.js',
  './js/vehicle.js',
  './js/jobs.js',
  './js/fleet.js',
  './js/meta.js',
  './js/session.js',
  './js/scenarios.js',
  './js/shop.js',
  './js/places.js',
  './js/assets.js',
  './js/audio.js',
  './js/bot.js',
  './js/achievements.js',
  './js/leaderboard.js',
  './js/daily.js',
  './js/tutorial.js',
  './js/tilemap.js',
  './js/water.js',
  './js/worlddraw.js',
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
  './assets/tiles/grass.png',
  './assets/tiles/grass2.png',
  './assets/tiles/grass3.png',
  './assets/tiles/dirt.png',
  './assets/tiles/dirt2.png',
  './assets/tiles/dirt3.png',
  './assets/tiles/forest.png',
  './assets/tiles/water.png',
  './assets/tiles/asphalt.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only same-origin
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html') || url.pathname.endsWith('.png') || url.pathname.endsWith('.webmanifest') || url.pathname.endsWith('/'))) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      // Prefer network for HTML/JS (fresh updates), fall back to cache
      if (url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('/')) {
        return network.then((r) => r || cached || caches.match('./index.html'));
      }
      return cached || network;
    })
  );
});
