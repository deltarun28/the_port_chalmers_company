// Service worker — makes the game installable as a PWA and playable offline.
//
// Strategy:
//   - install:  precache the whole app: HTML, modules, data, icons, and the flag
//               stylesheet and flags (vendored from flag-icons@7.2.3). Each file
//               is fetched with cache: 'reload', so a copy sitting in the browser's
//               HTTP cache can't be pinned into a new version.
//   - fetch:    cache-first, read only from this version's cache. The page and
//               every file it loads come from the same deploy, so they can never
//               disagree. Anything not precached goes to the network.
//
// Nothing the game loads comes from another origin, so once installed it never
// needs the network. A changed sw.js installs in the background. The launch that
// finds the update is still served from the old cache, and the next launch gets
// the new one.
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
const CACHE_VERSION = `${CACHE_PREFIX}v3`;

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
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './vendor/flag-icons/css/flag-icons.min.css',
  './vendor/flag-icons/flags/4x3/ad.svg',
  './vendor/flag-icons/flags/4x3/ae.svg',
  './vendor/flag-icons/flags/4x3/af.svg',
  './vendor/flag-icons/flags/4x3/ag.svg',
  './vendor/flag-icons/flags/4x3/al.svg',
  './vendor/flag-icons/flags/4x3/am.svg',
  './vendor/flag-icons/flags/4x3/ao.svg',
  './vendor/flag-icons/flags/4x3/ar.svg',
  './vendor/flag-icons/flags/4x3/at.svg',
  './vendor/flag-icons/flags/4x3/au.svg',
  './vendor/flag-icons/flags/4x3/az.svg',
  './vendor/flag-icons/flags/4x3/ba.svg',
  './vendor/flag-icons/flags/4x3/bb.svg',
  './vendor/flag-icons/flags/4x3/bd.svg',
  './vendor/flag-icons/flags/4x3/be.svg',
  './vendor/flag-icons/flags/4x3/bf.svg',
  './vendor/flag-icons/flags/4x3/bg.svg',
  './vendor/flag-icons/flags/4x3/bh.svg',
  './vendor/flag-icons/flags/4x3/bi.svg',
  './vendor/flag-icons/flags/4x3/bj.svg',
  './vendor/flag-icons/flags/4x3/bn.svg',
  './vendor/flag-icons/flags/4x3/bo.svg',
  './vendor/flag-icons/flags/4x3/br.svg',
  './vendor/flag-icons/flags/4x3/bs.svg',
  './vendor/flag-icons/flags/4x3/bt.svg',
  './vendor/flag-icons/flags/4x3/bw.svg',
  './vendor/flag-icons/flags/4x3/by.svg',
  './vendor/flag-icons/flags/4x3/bz.svg',
  './vendor/flag-icons/flags/4x3/ca.svg',
  './vendor/flag-icons/flags/4x3/cd.svg',
  './vendor/flag-icons/flags/4x3/cf.svg',
  './vendor/flag-icons/flags/4x3/cg.svg',
  './vendor/flag-icons/flags/4x3/ch.svg',
  './vendor/flag-icons/flags/4x3/ci.svg',
  './vendor/flag-icons/flags/4x3/cl.svg',
  './vendor/flag-icons/flags/4x3/cm.svg',
  './vendor/flag-icons/flags/4x3/cn.svg',
  './vendor/flag-icons/flags/4x3/co.svg',
  './vendor/flag-icons/flags/4x3/cr.svg',
  './vendor/flag-icons/flags/4x3/cu.svg',
  './vendor/flag-icons/flags/4x3/cv.svg',
  './vendor/flag-icons/flags/4x3/cy.svg',
  './vendor/flag-icons/flags/4x3/cz.svg',
  './vendor/flag-icons/flags/4x3/de.svg',
  './vendor/flag-icons/flags/4x3/dj.svg',
  './vendor/flag-icons/flags/4x3/dk.svg',
  './vendor/flag-icons/flags/4x3/dm.svg',
  './vendor/flag-icons/flags/4x3/do.svg',
  './vendor/flag-icons/flags/4x3/dz.svg',
  './vendor/flag-icons/flags/4x3/ec.svg',
  './vendor/flag-icons/flags/4x3/ee.svg',
  './vendor/flag-icons/flags/4x3/eg.svg',
  './vendor/flag-icons/flags/4x3/er.svg',
  './vendor/flag-icons/flags/4x3/es.svg',
  './vendor/flag-icons/flags/4x3/et.svg',
  './vendor/flag-icons/flags/4x3/fi.svg',
  './vendor/flag-icons/flags/4x3/fj.svg',
  './vendor/flag-icons/flags/4x3/fm.svg',
  './vendor/flag-icons/flags/4x3/fr.svg',
  './vendor/flag-icons/flags/4x3/ga.svg',
  './vendor/flag-icons/flags/4x3/gb.svg',
  './vendor/flag-icons/flags/4x3/gd.svg',
  './vendor/flag-icons/flags/4x3/ge.svg',
  './vendor/flag-icons/flags/4x3/gh.svg',
  './vendor/flag-icons/flags/4x3/gm.svg',
  './vendor/flag-icons/flags/4x3/gn.svg',
  './vendor/flag-icons/flags/4x3/gq.svg',
  './vendor/flag-icons/flags/4x3/gr.svg',
  './vendor/flag-icons/flags/4x3/gt.svg',
  './vendor/flag-icons/flags/4x3/gw.svg',
  './vendor/flag-icons/flags/4x3/gy.svg',
  './vendor/flag-icons/flags/4x3/hn.svg',
  './vendor/flag-icons/flags/4x3/hr.svg',
  './vendor/flag-icons/flags/4x3/ht.svg',
  './vendor/flag-icons/flags/4x3/hu.svg',
  './vendor/flag-icons/flags/4x3/id.svg',
  './vendor/flag-icons/flags/4x3/ie.svg',
  './vendor/flag-icons/flags/4x3/il.svg',
  './vendor/flag-icons/flags/4x3/in.svg',
  './vendor/flag-icons/flags/4x3/iq.svg',
  './vendor/flag-icons/flags/4x3/ir.svg',
  './vendor/flag-icons/flags/4x3/is.svg',
  './vendor/flag-icons/flags/4x3/it.svg',
  './vendor/flag-icons/flags/4x3/jm.svg',
  './vendor/flag-icons/flags/4x3/jo.svg',
  './vendor/flag-icons/flags/4x3/jp.svg',
  './vendor/flag-icons/flags/4x3/ke.svg',
  './vendor/flag-icons/flags/4x3/kg.svg',
  './vendor/flag-icons/flags/4x3/kh.svg',
  './vendor/flag-icons/flags/4x3/ki.svg',
  './vendor/flag-icons/flags/4x3/km.svg',
  './vendor/flag-icons/flags/4x3/kn.svg',
  './vendor/flag-icons/flags/4x3/kp.svg',
  './vendor/flag-icons/flags/4x3/kr.svg',
  './vendor/flag-icons/flags/4x3/kw.svg',
  './vendor/flag-icons/flags/4x3/kz.svg',
  './vendor/flag-icons/flags/4x3/la.svg',
  './vendor/flag-icons/flags/4x3/lb.svg',
  './vendor/flag-icons/flags/4x3/lc.svg',
  './vendor/flag-icons/flags/4x3/li.svg',
  './vendor/flag-icons/flags/4x3/lk.svg',
  './vendor/flag-icons/flags/4x3/lr.svg',
  './vendor/flag-icons/flags/4x3/ls.svg',
  './vendor/flag-icons/flags/4x3/lt.svg',
  './vendor/flag-icons/flags/4x3/lu.svg',
  './vendor/flag-icons/flags/4x3/lv.svg',
  './vendor/flag-icons/flags/4x3/ly.svg',
  './vendor/flag-icons/flags/4x3/ma.svg',
  './vendor/flag-icons/flags/4x3/mc.svg',
  './vendor/flag-icons/flags/4x3/md.svg',
  './vendor/flag-icons/flags/4x3/me.svg',
  './vendor/flag-icons/flags/4x3/mg.svg',
  './vendor/flag-icons/flags/4x3/mh.svg',
  './vendor/flag-icons/flags/4x3/mk.svg',
  './vendor/flag-icons/flags/4x3/ml.svg',
  './vendor/flag-icons/flags/4x3/mm.svg',
  './vendor/flag-icons/flags/4x3/mn.svg',
  './vendor/flag-icons/flags/4x3/mr.svg',
  './vendor/flag-icons/flags/4x3/mt.svg',
  './vendor/flag-icons/flags/4x3/mu.svg',
  './vendor/flag-icons/flags/4x3/mv.svg',
  './vendor/flag-icons/flags/4x3/mw.svg',
  './vendor/flag-icons/flags/4x3/mx.svg',
  './vendor/flag-icons/flags/4x3/my.svg',
  './vendor/flag-icons/flags/4x3/mz.svg',
  './vendor/flag-icons/flags/4x3/na.svg',
  './vendor/flag-icons/flags/4x3/ne.svg',
  './vendor/flag-icons/flags/4x3/ng.svg',
  './vendor/flag-icons/flags/4x3/ni.svg',
  './vendor/flag-icons/flags/4x3/nl.svg',
  './vendor/flag-icons/flags/4x3/no.svg',
  './vendor/flag-icons/flags/4x3/np.svg',
  './vendor/flag-icons/flags/4x3/nr.svg',
  './vendor/flag-icons/flags/4x3/nz.svg',
  './vendor/flag-icons/flags/4x3/om.svg',
  './vendor/flag-icons/flags/4x3/pa.svg',
  './vendor/flag-icons/flags/4x3/pe.svg',
  './vendor/flag-icons/flags/4x3/pg.svg',
  './vendor/flag-icons/flags/4x3/ph.svg',
  './vendor/flag-icons/flags/4x3/pk.svg',
  './vendor/flag-icons/flags/4x3/pl.svg',
  './vendor/flag-icons/flags/4x3/pt.svg',
  './vendor/flag-icons/flags/4x3/pw.svg',
  './vendor/flag-icons/flags/4x3/py.svg',
  './vendor/flag-icons/flags/4x3/qa.svg',
  './vendor/flag-icons/flags/4x3/ro.svg',
  './vendor/flag-icons/flags/4x3/rs.svg',
  './vendor/flag-icons/flags/4x3/ru.svg',
  './vendor/flag-icons/flags/4x3/rw.svg',
  './vendor/flag-icons/flags/4x3/sa.svg',
  './vendor/flag-icons/flags/4x3/sb.svg',
  './vendor/flag-icons/flags/4x3/sc.svg',
  './vendor/flag-icons/flags/4x3/sd.svg',
  './vendor/flag-icons/flags/4x3/se.svg',
  './vendor/flag-icons/flags/4x3/sg.svg',
  './vendor/flag-icons/flags/4x3/si.svg',
  './vendor/flag-icons/flags/4x3/sk.svg',
  './vendor/flag-icons/flags/4x3/sl.svg',
  './vendor/flag-icons/flags/4x3/sm.svg',
  './vendor/flag-icons/flags/4x3/sn.svg',
  './vendor/flag-icons/flags/4x3/so.svg',
  './vendor/flag-icons/flags/4x3/sr.svg',
  './vendor/flag-icons/flags/4x3/ss.svg',
  './vendor/flag-icons/flags/4x3/st.svg',
  './vendor/flag-icons/flags/4x3/sv.svg',
  './vendor/flag-icons/flags/4x3/sy.svg',
  './vendor/flag-icons/flags/4x3/sz.svg',
  './vendor/flag-icons/flags/4x3/td.svg',
  './vendor/flag-icons/flags/4x3/tg.svg',
  './vendor/flag-icons/flags/4x3/th.svg',
  './vendor/flag-icons/flags/4x3/tj.svg',
  './vendor/flag-icons/flags/4x3/tl.svg',
  './vendor/flag-icons/flags/4x3/tm.svg',
  './vendor/flag-icons/flags/4x3/tn.svg',
  './vendor/flag-icons/flags/4x3/to.svg',
  './vendor/flag-icons/flags/4x3/tr.svg',
  './vendor/flag-icons/flags/4x3/tt.svg',
  './vendor/flag-icons/flags/4x3/tv.svg',
  './vendor/flag-icons/flags/4x3/tz.svg',
  './vendor/flag-icons/flags/4x3/ua.svg',
  './vendor/flag-icons/flags/4x3/ug.svg',
  './vendor/flag-icons/flags/4x3/us.svg',
  './vendor/flag-icons/flags/4x3/uy.svg',
  './vendor/flag-icons/flags/4x3/uz.svg',
  './vendor/flag-icons/flags/4x3/va.svg',
  './vendor/flag-icons/flags/4x3/vc.svg',
  './vendor/flag-icons/flags/4x3/ve.svg',
  './vendor/flag-icons/flags/4x3/vn.svg',
  './vendor/flag-icons/flags/4x3/vu.svg',
  './vendor/flag-icons/flags/4x3/ws.svg',
  './vendor/flag-icons/flags/4x3/xk.svg',
  './vendor/flag-icons/flags/4x3/ye.svg',
  './vendor/flag-icons/flags/4x3/za.svg',
  './vendor/flag-icons/flags/4x3/zm.svg',
  './vendor/flag-icons/flags/4x3/zw.svg',
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
  // up, let it go straight to the network rather than caching it.
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
