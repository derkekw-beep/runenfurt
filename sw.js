// Offline-Cache für den Spiel-Code. Spielstände liegen NICHT hier, sondern im localStorage.
// Das Spiel kommt immer komplett aus dem Cache EINER Version – nie halb alt, halb neu.
// Bei jeder Änderung die Versionsnummer erhöhen (macht tools/deploy.mjs).
const VERSION = 'runenfurt-v4';
const FILES = [
  './',
  './index.html',
  './style.css',
  './boot.js',
  './main.js',
  './cards.js',
  './sim.js',
  './ai.js',
  './progress.js',
  './render.js',
  './render3d.js',
  './models3d.js',
  './vendor/three.module.min.js',
  './vendor/three.core.js',
  './audio.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-Schlüssel ohne ?…, damit z. B. ./?speed=4 und ./ dasselbe sind
const keyOf = url => {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  return u.href;
};

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(keyOf(req.url));
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const page = (await cache.match(new URL('./index.html', self.location).href)) || (await cache.match(new URL('./', self.location).href));
      if (page) return page;
    }
    try {
      return await fetch(req);
    } catch {
      return Response.error();
    }
  })());
});
