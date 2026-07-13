// Service worker — makes the game installable as a PWA and playable offline.
//
// Strategy:
//   - install:  precache the app shell (HTML, modules, data files, manifest).
//   - navigate: network-first, falling back to the cached index.html offline.
//   - same-origin assets: cache-first (everything is precached and immutable
//     within one deploy).
//   - cross-origin (flag-icons CDN): stale-while-revalidate — individual flag
//     SVGs are fetched lazily as guesses render, then cached for offline use.
//
// IMPORTANT: bump CACHE_VERSION on every deploy that changes any precached
// file, otherwise returning players keep the old cached version.

// CacheStorage is shared across the whole origin, not per service-worker scope —
// every game on the site sees the same cache list. So the activate handler must
// only ever delete caches carrying THIS game's prefix; a blanket
// "delete everything that isn't my current version" would wipe out the other
// games' offline caches, and whichever game you opened last would be the only
// one that still worked offline.
const CACHE_PREFIX = 'capitals-';
const CACHE_VERSION = `${CACHE_PREFIX}v2`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './lib/daily_target.js',
  './lib/difficulty.js',
  './lib/flags.js',
  './lib/game.js',
  './lib/ring_calculator.js',
  './lib/scoring.js',
  './lib/validator.js',
  './ui/difficulty_picker.js',
  './ui/input.js',
  './ui/map.js',
  './ui/results.js',
  './ui/share.js',
  './data/capitals.json',
  './data/distances.json',
  './data/land_polygons.json',
  './icons/icon-192.png',
  'https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/css/flag-icons.min.css',
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

  // Page loads: try the network so deploys are picked up, fall back to cache offline
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  const sameOrigin = new URL(request.url).origin === self.location.origin;

  if (sameOrigin) {
    // Cache-first: all same-origin assets are precached and versioned by deploy
    e.respondWith(
      caches.match(request).then(hit => hit || fetch(request))
    );
    return;
  }

  // CDN (flag-icons CSS + per-country SVGs): serve from cache immediately,
  // refresh the cached copy in the background
  e.respondWith(
    caches.open(CACHE_VERSION).then(async cache => {
      const hit = await cache.match(request);
      const refresh = fetch(request)
        .then(res => { if (res.ok) cache.put(request, res.clone()); return res; })
        .catch(() => hit); // offline: fall back to whatever we had
      return hit || refresh;
    })
  );
});
