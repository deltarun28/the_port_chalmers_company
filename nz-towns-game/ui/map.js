// ── Flat SVG map of New Zealand ──────────────────────────────────────────────
//
// Public API (exported at the bottom):
//   createMap(container, towns, onGuess, difficulty)
//     → { update, reset, applyTheme, destroy }
//
//   Callbacks:
//     onGuess(townObject) — fired when the player clicks/taps a dot
//   Methods on the returned object:
//     update(guesses, status, target) — recolours dots and redraws rings
//     reset()                         — restores all dots to starting state
//     applyTheme()                    — no-op; SVG colours are CSS variables
//     destroy()                       — removes window listeners; call before rebuilding
//
// Why flat and not a globe:
//   The world game used an orthographic canvas globe because no flat projection
//   can show every continent without wrecking the distances the game is built
//   on. One country 1,400km end to end has no such problem — a Mercator strip
//   over that span is close enough to true scale that the player can eyeball
//   distances, and SVG gives crisp text, real hit targets and free zooming.
//
// Coordinate systems:
//   [lat, lng]  — geographic degrees (source: towns.json, coastline.json)
//   {x, y}      — viewBox units, W×H, origin top-left (project() output)
//   viewBox     — the pan/zoom window over that space (vb)
//
// Theming:
//   Every colour is a CSS custom property (--map-ocean, --map-land, …) applied
//   through `fill`/`stroke` attributes, so a theme change on <body> restyles the
//   map with no redraw. applyTheme() exists only to satisfy the interface the
//   world game's globe needed.

import { calculateRing } from '../lib/ring_calculator.js';

// ── Projection ───────────────────────────────────────────────────────────────
//
// The frame is a deliberate design choice, not the data's bounding box: a
// little ocean around the coast stops Cape Reinga and Bluff from touching the
// edge, and keeps the Chathams' absence from looking like a crop.
//
// Mercator, because the game is about distance and Mercator is conformal —
// a circle on the ground stays a circle on screen. Scale still grows toward the
// poles, so over NZ's 13° of latitude a Wellington kilometre is ~10% smaller on
// screen than an Invercargill one. Rings are therefore drawn as true geodesic
// circles (see geodesicRing) rather than SVG <circle>s, which would be wrong by
// that margin at the top and bottom of the map.

const LAT_MIN = -47.4, LAT_MAX = -34.2;
const LNG_MIN = 166.2, LNG_MAX = 179.0;

const W = 600;
const K = (W / (LNG_MAX - LNG_MIN)) * (180 / Math.PI); // degrees → viewBox units

const mercN = lat => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 180 / 2));
const Y_TOP = -mercN(LAT_MAX) * K;

const H = Math.round((-mercN(LAT_MIN) * K - Y_TOP) * 100) / 100; // ≈ 822

const MAX_ZOOM = 24;   // NZ is small; the endgame needs to separate towns 6km apart
const HIT_R = 9;       // invisible tap target around each dot
const EARTH_R = 6371;

const RING_COLORS = ['#3b82f6', '#f97316', '#a855f7', '#ec4899', '#eab308', '#10b981'];

function project(lat, lng) {
  return {
    x: (lng - LNG_MIN) * (W / (LNG_MAX - LNG_MIN)),
    y: -mercN(lat) * K - Y_TOP,
  };
}

// Points at a fixed great-circle distance from (lat, lng), projected. This is the
// honest shape of "everywhere exactly N km away" — at NZ scale it is very close
// to a circle, but drawing it properly costs nothing and stays correct if the
// frame is ever widened.
function geodesicRing(lat, lng, distanceKm, steps = 96) {
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const δ = distanceKm / EARTH_R;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const θ = (i / steps) * 2 * Math.PI;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
    pts.push(project((φ2 * 180) / Math.PI, (λ2 * 180) / Math.PI));
  }
  return pts;
}

const toPath = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('') + 'Z';

// An annulus as one path: outer ring, then inner ring, filled with evenodd so
// the middle punches out. Both rings are geodesic, so the band is the true
// "between N and M km away" region.
function annulusPath(lat, lng, innerKm, outerKm) {
  const outer = toPath(geodesicRing(lat, lng, outerKm));
  return innerKm <= 0 ? outer : outer + ' ' + toPath(geodesicRing(lat, lng, innerKm));
}

const ns = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => {
  const n = document.createElementNS(ns, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

export function createMap(container, towns, onGuess, difficulty) {
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  container.appendChild(wrap);

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'nz-map',
    preserveAspectRatio: 'xMidYMid meet',
  });
  svg.style.cursor = 'grab';
  svg.style.display = 'block';
  svg.style.userSelect = 'none';
  svg.style.touchAction = 'none';

  svg.appendChild(el('rect', { width: W, height: H, fill: 'var(--map-ocean)' }));

  // Painted in draw order: grid under land, land under rings, rings under dots.
  const gridGroup = el('g', {});
  const landGroup = el('g', {});
  const ringsGroup = el('g', {});
  const dotsGroup = el('g', {});
  svg.append(gridGroup, landGroup, ringsGroup, dotsGroup);

  if (difficulty.showGrid) {
    // Whole degrees. Two-degree spacing gives ~7 lines each way — enough to read
    // position off, sparse enough not to compete with the coastline.
    for (let lng = 168; lng <= 178; lng += 2) {
      const { x } = project(0, lng);
      gridGroup.appendChild(el('line', {
        x1: x, y1: 0, x2: x, y2: H,
        stroke: 'var(--map-grid)', 'stroke-width': 0.5,
      }));
    }
    for (let lat = -46; lat <= -35; lat += 2) {
      const { y } = project(lat, 0);
      gridGroup.appendChild(el('line', {
        x1: 0, y1: y, x2: W, y2: y,
        stroke: 'var(--map-grid)', 'stroke-width': 0.5,
      }));
    }
  }

  // Coastline is 80KB — fetched rather than imported so the first paint (ocean,
  // grid, dots) is not blocked on it. The land simply appears a moment later.
  fetch(new URL('../data/coastline.json', import.meta.url))
    .then(r => r.json())
    .then(({ rings }) => {
      for (const ring of rings) {
        landGroup.appendChild(el('path', {
          d: toPath(ring.map(([lat, lng]) => project(lat, lng))),
          fill: 'var(--map-land)',
          stroke: 'var(--map-coast)',
          'stroke-width': 0.6,
          'stroke-linejoin': 'round',
        }));
      }
    })
    .catch(e => console.error('Failed to load coastline.json:', e));

  // ── Pan and zoom ───────────────────────────────────────────────────────────

  let vb = { x: 0, y: 0, w: W, h: H };
  const dots = new Map();
  let hasDragged = false;

  function applyViewBox() {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    // Dots and rings are drawn in viewBox units, so zooming would inflate them.
    // Counter-scale everything that should stay a constant size on screen.
    const scale = vb.w / W;
    dots.forEach(d => {
      d.circle.setAttribute('r', d.baseR * scale);
      d.hit.setAttribute('r', HIT_R * scale);
      if (d.label) d.label.setAttribute('font-size', 9 * scale);
    });
    ringsGroup.querySelectorAll('path').forEach(p => {
      p.setAttribute('stroke-width', 0.8 * scale);
    });
    gridGroup.querySelectorAll('line').forEach(l => {
      l.setAttribute('stroke-width', 0.5 * scale);
    });
    landGroup.querySelectorAll('path').forEach(p => {
      p.setAttribute('stroke-width', 0.6 * scale);
    });
  }

  function clamp() {
    vb.w = Math.max(W / MAX_ZOOM, Math.min(W, vb.w));
    vb.h = vb.w * (H / W);
    vb.x = Math.max(0, Math.min(W - vb.w, vb.x));
    vb.y = Math.max(0, Math.min(H - vb.h, vb.y));
  }

  function zoomAt(px, py, factor) {
    const newW = vb.w * factor;
    const newH = newW * (H / W);
    vb.x = px - (px - vb.x) * (newW / vb.w);
    vb.y = py - (py - vb.y) * (newH / vb.h);
    vb.w = newW; vb.h = newH;
    clamp(); applyViewBox();
  }

  // Client pixel → viewBox unit
  function toVb(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * vb.w + vb.x,
      y: ((clientY - r.top) / r.height) * vb.h + vb.y,
    };
  }

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const p = toVb(e.clientX, e.clientY);
    zoomAt(p.x, p.y, e.deltaY > 0 ? 1.18 : 0.85);
  }, { passive: false });

  let dragging = false;
  let dragStart = null;

  svg.addEventListener('mousedown', e => {
    dragging = true; hasDragged = false;
    dragStart = { x: e.clientX, y: e.clientY, vbx: vb.x, vby: vb.y };
    svg.style.cursor = 'grabbing';
  });
  // Named so destroy() can remove them — window listeners outlive the container,
  // and index.html rebuilds the map between rounds.
  function onWindowMouseMove(e) {
    if (!dragging) return;
    const r = svg.getBoundingClientRect();
    const dx = ((e.clientX - dragStart.x) / r.width) * vb.w;
    const dy = ((e.clientY - dragStart.y) / r.height) * vb.h;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasDragged = true;
    vb.x = dragStart.vbx - dx;
    vb.y = dragStart.vby - dy;
    clamp(); applyViewBox();
  }
  function onWindowMouseUp() { dragging = false; svg.style.cursor = 'grab'; }
  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);

  let lastTouches = null;
  svg.addEventListener('touchstart', e => {
    hasDragged = false;
    lastTouches = [...e.touches].map(t => ({ x: t.clientX, y: t.clientY }));
  }, { passive: true });

  svg.addEventListener('touchmove', e => {
    if (!lastTouches) return;
    e.preventDefault();
    const now = [...e.touches].map(t => ({ x: t.clientX, y: t.clientY }));
    const r = svg.getBoundingClientRect();

    if (now.length === 1 && lastTouches.length === 1) {
      const dx = ((now[0].x - lastTouches[0].x) / r.width) * vb.w;
      const dy = ((now[0].y - lastTouches[0].y) / r.height) * vb.h;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) hasDragged = true;
      vb.x -= dx; vb.y -= dy;
      clamp(); applyViewBox();
    } else if (now.length === 2 && lastTouches.length === 2) {
      hasDragged = true;
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const factor = dist(lastTouches[0], lastTouches[1]) / dist(now[0], now[1]);
      const mid = toVb((now[0].x + now[1].x) / 2, (now[0].y + now[1].y) / 2);
      zoomAt(mid.x, mid.y, factor);
    }
    lastTouches = now;
  }, { passive: false });

  svg.addEventListener('touchend', e => {
    lastTouches = e.touches.length
      ? [...e.touches].map(t => ({ x: t.clientX, y: t.clientY }))
      : null;
  }, { passive: true });

  // ── Dots ───────────────────────────────────────────────────────────────────

  towns.forEach(town => {
    const { x, y } = project(town.lat, town.lng);
    const g = el('g', { class: 'town-dot' });

    const hit = el('circle', { cx: x, cy: y, r: HIT_R, fill: 'transparent' });
    const circle = el('circle', {
      cx: x, cy: y, r: 3,
      fill: 'var(--dot-idle)',
      opacity: difficulty.showDots ? 0.75 : 0,
    });
    const title = el('title', {});
    title.textContent = `${town.name} — ${town.region}`;

    // Named only once guessed or revealed; showing every label would give the
    // answer away and there is no room for 167 of them anyway.
    const label = el('text', {
      x: x + 6, y: y + 3,
      'font-size': 9,
      fill: 'var(--dot-label)',
      'paint-order': 'stroke',
      stroke: 'var(--map-ocean)',
      'stroke-width': 2.5,
      'stroke-linejoin': 'round',
      opacity: 0,
    });
    label.style.pointerEvents = 'none';
    label.textContent = town.name;

    g.append(hit, circle, label, title);
    g.addEventListener('click', () => { if (!hasDragged) onGuess(town); });
    dotsGroup.appendChild(g);
    dots.set(town.name, { g, circle, hit, label, baseR: 3 });
  });

  wrap.appendChild(svg);

  const controls = document.createElement('div');
  controls.className = 'map-controls';
  controls.innerHTML =
    `<button data-action="in" aria-label="Zoom in">+</button>` +
    `<button data-action="reset" aria-label="Reset view">⌂</button>` +
    `<button data-action="out" aria-label="Zoom out">−</button>`;
  controls.addEventListener('click', e => {
    const action = e.target.dataset.action;
    if (!action) return;
    if (action === 'reset') {
      vb = { x: 0, y: 0, w: W, h: H };
      clamp(); applyViewBox();
    } else {
      zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, action === 'in' ? 0.65 : 1.5);
    }
  });
  wrap.appendChild(controls);

  // ── Render state ───────────────────────────────────────────────────────────

  function drawRings(guesses) {
    ringsGroup.replaceChildren();
    if (!difficulty.showRings) return;
    const scale = vb.w / W;
    guesses.forEach((g, i) => {
      if (g.distance == null || g.correct) return;
      const { innerRadius, outerRadius } = calculateRing(g.distance, i + 1);
      const color = RING_COLORS[i % RING_COLORS.length];
      ringsGroup.appendChild(el('path', {
        d: annulusPath(g.lat, g.lng, innerRadius, outerRadius),
        fill: color, 'fill-opacity': 0.13, 'fill-rule': 'evenodd',
        stroke: color, 'stroke-opacity': 0.45, 'stroke-width': 0.8 * scale,
      }));
    });
  }

  function paint(dot, { fill, r, opacity = 1, labelled = false }) {
    const scale = vb.w / W;
    dot.baseR = r;
    dot.circle.setAttribute('fill', fill);
    dot.circle.setAttribute('r', r * scale);
    dot.circle.setAttribute('opacity', opacity);
    dot.label.setAttribute('opacity', labelled ? 1 : 0);
    dot.label.setAttribute('font-size', 9 * scale);
    if (labelled) dot.g.parentNode.appendChild(dot.g); // raise above its neighbours
  }

  return {
    update(guesses, status, target) {
      drawRings(guesses);
      guesses.forEach(g => {
        const dot = dots.get(g.name);
        if (!dot) return;
        paint(dot, {
          fill: g.correct ? 'var(--dot-correct)' : 'var(--dot-guessed)',
          r: 5,
          labelled: true,
        });
      });
      if (status !== 'playing' && target) {
        const dot = dots.get(target.name);
        if (dot) paint(dot, { fill: 'var(--dot-correct)', r: 7, labelled: true });
      }
    },
    reset() {
      ringsGroup.replaceChildren();
      dots.forEach(dot => paint(dot, {
        fill: 'var(--dot-idle)',
        r: 3,
        opacity: difficulty.showDots ? 0.75 : 0,
        labelled: false,
      }));
    },
    applyTheme() {}, // colours are CSS variables; nothing to redraw
    destroy() {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    },
  };
}
