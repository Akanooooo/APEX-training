const CACHE = 'apex-training-v8';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './themes.js',
  './manifest.json',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

async function cacheAssetsFresh() {
  const cache = await caches.open(CACHE);
  await Promise.all(ASSETS.map(async (url) => {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      await cache.put(url, res);
    } catch (err) {
      // offline during install; cached copy (if any) stays as-is
    }
  }));
}

self.addEventListener('install', (e) => {
  e.waitUntil(cacheAssetsFresh());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
