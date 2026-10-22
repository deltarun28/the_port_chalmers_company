// Service worker — makes the game installable and playable with no network.
//
// Strategy:
//   - install:  precache the whole app shell. There is no lazily-loaded asset
//               and no third-party request anywhere in this game, so the list
//               below is the entire app: once installed it never needs the
//               network again. Each file is fetched with cache: 'reload', so a
//               copy sitting in the browser's HTTP cache can't be pinned into a
//               new version.
//   - fetch:    cache-first, read only from this version's cache. The page and
//               every module it loads come from the same deploy, so they can
//               never disagree. Anything not precached goes to the network.
//
// A changed sw.js installs in the background. The launch that finds the update
// is still served from the old cache, and the next launch gets the new one.
//
// IMPORTANT: bump CACHE_VERSION on every deploy that changes any precached
// file, otherwise returning players keep the old cached version. The static
// tests fail if a precached file changes without a bump.

// CacheStorage is shared across the whole origin, not per service-worker scope —
// every game on the site sees the same cache list. So the activate handler must
// only ever delete caches carrying THIS game's prefix; a blanket
// "delete everything that isn't my current version" would wipe out the other
// games' offline caches, and whichever game you opened last would be the only
// one that still worked offline.
const CACHE_PREFIX = 'minesweeper-';
const CACHE_VERSION = `${CACHE_PREFIX}v3`;

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
      .then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' }))))
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

  // There is only one page, so every navigation gets the cached shell whatever
  // URL it asked for. The lookup is limited to this version's cache.
  const key = request.mode === 'navigate' ? './index.html' : request;
  e.respondWith(
    caches.open(CACHE_VERSION)
      .then(cache => cache.match(key))
      .then(hit => hit || fetch(request))
  );
});
