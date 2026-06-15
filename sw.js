/* ============================================================
   AMBIENTICA — SERVICE WORKER
   Makes the whole app shell available offline once it has been
   opened (and installed) at least once.

   - All paths below are RELATIVE to this file's location, so this
     works whether the app is served from a domain root or from a
     GitHub Pages project subpath (e.g. /ambientica/).
   - Same-origin assets: cache-first, refreshed in the background
     (stale-while-revalidate) so updates are picked up next visit.
   - Cross-origin assets (Google Fonts / Font Awesome CDN):
     network-first, falling back to cache when offline. Opaque
     (no-cors) responses are cached too.
   - Navigations fall back to the cached app shell if offline.

   Bump CACHE_VERSION whenever you change any file in PRECACHE_URLS
   so clients pick up the new versions and old caches are purged.
   ============================================================ */

const CACHE_VERSION = 'ambientica-v2';

const PRECACHE_URLS = [
    './',
    './index.html',
    './manifest.json',
    './favicon.svg',
    './css/themes.css',
    './css/style.css',
    './js/effects-config.js',
    './js/presets-config.js',
    './js/help-content.js',
    './js/slider.js',
    './js/visualizer.js',
    './js/app.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const isSameOrigin = url.origin === self.location.origin;

    if (isSameOrigin) {
        event.respondWith(staleWhileRevalidate(req));
    } else {
        event.respondWith(networkFirst(req));
    }
});

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);

    const networkFetch = fetch(request)
        .then((response) => {
            if (response && response.status === 200) cache.put(request, response.clone());
            return response;
        })
        .catch(() => null);

    if (cached) {
        networkFetch; // refresh cache in the background, don't block the response
        return cached;
    }

    const network = await networkFetch;
    if (network) return network;

    // Offline and not cached: for page navigations, fall back to the app shell.
    if (request.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
    }
    return Response.error();
}

async function networkFirst(request) {
    const cache = await caches.open(CACHE_VERSION);
    try {
        const response = await fetch(request);
        // Cache opaque (no-cors, e.g. font/CDN) responses too.
        if (response && (response.status === 200 || response.type === 'opaque')) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw err;
    }
}
