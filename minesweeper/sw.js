// Service worker — makes the game installable and playable with no network.
//
// Strategy:
//   - install:  precache the whole app shell. There is no lazily-loaded asset
//               and no third-party request anywhere in this game, so the list
//               below is the entire app: once installed it never needs the
//               network again.
//   - navigate: network-first, falling back to the cached index.html offline.
//               (Network-first so a deploy is picked up on the next online load
//               rather than being pinned to a stale shell.)
//   - assets:   cache-first — every same-origin file is precached and immutable
//               within one deploy.
//
// IMPORTANT: bump CACHE_VERSION on every deploy that changes any precached
// file, otherwise returning players keep the old cached version.

// CacheStorage is shared across the whole origin, not per service-worker scope —
// every game on the site sees the same cache list. So the activate handler must
// only ever delete caches carrying THIS game's prefix; a blanket
// "delete everything that isn't my current version" would wipe out the other
// games' offline caches, and whichever game you opened last would be the only
// one that still worked offline.
const CACHE_PREFIX = 'minesweeper-';
const CACHE_VERSION = `${CACHE_PREFIX}v1`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './lib/board.js',
  './lib/game.js',
  './lib/stats.js',
  './ui/grid.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_VERSION)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  // Cross-origin requests are not something this game makes. If one ever shows
  // up, let it go straight to the network rather than caching it — the cache is
  // for the app shell, not for anything else that wanders past.
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }

  e.respondWith(caches.match(request).then(hit => hit || fetch(request)));
});
