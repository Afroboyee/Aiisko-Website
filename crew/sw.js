// Keeps the app shell available when the signal drops. Always tries the network first so updates and
// settings changes show up right away; data requests to the database are never touched.
const VERSION = 'crew-v1';
const SHELL = ['./', 'index.html', 'crew.css', 'config.js', 'app.js', 'lib.js', 'api-demo.js', 'api-live.js', 'manifest.webmanifest', 'icons/icon-192.png',
  '../assets/fonts/figtree-latin.woff2', '../assets/fonts/source-serif-4-latin.woff2'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
