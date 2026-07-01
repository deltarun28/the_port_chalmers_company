// ── Globe renderer (and legacy flat SVG map, currently unused) ───────────────
//
// Public API (exported at the bottom):
//   createMap(container, capitals, onGuess, difficulty) → { update, reset, applyTheme }
//
//   All difficulty modes currently have globeView:true, so createGlobe() is
//   always called.  createFlatMap() is dead code but kept for reference.
//
//   Callbacks:
//     onGuess(capitalObject) — fired when the player clicks/taps a dot
//   Methods on the returned object:
//     update(guesses, status, target) — recolours dots and redraws rings
//     reset()                         — restores all dots to starting state
//     applyTheme()                    — re-reads CSS theme variables and redraws
//
// Globe coordinate systems:
//   [lat, lng]  — geographic degrees (source: data/land_polygons.js, capitals[])
//   {x, y, z}  — orthographic unit-sphere (ortho() output)
//                 z > 0 → front hemisphere (draw it)
//                 z < 0 → back hemisphere  (skip it)
//   {cx, cy}    — canvas pixels (toCanvas() output; origin = globe centre CX,CY)
//
// Theming:
//   Globe colours are not hardcoded. getThemeColors() reads CSS custom properties
//   (--globe-ocean, --globe-land, etc.) from the document root so the canvas
//   respects whichever theme class (.light-theme) is active on <body>.
//   Call applyTheme() after toggling the theme class to force a redraw.

import { LAND_POLYGONS, LAKE_POLYGONS } from '../data/land_polygons.js';
import { calculateRing } from '../lib/ring_calculator.js';

// ── Flat SVG map (dead code — all modes use globe) ───────────────────────────

const W = 800;
const H = 400;
const MAX_ZOOM = 12;
const HIT_R = 10;
const KM_PER_PX = 40075 / W; // earth circumference / map width
const RING_COLORS = ['#3b82f6', '#f97316', '#a855f7', '#ec4899', '#eab308', '#10b981'];

function project(lat, lng) {
  const x = ((lng + 180) / 360) * W;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = (H / 2) - (W * mercN) / (2 * Math.PI);
  return { x, y: Math.max(0, Math.min(H, y)) };
}

function annulusPath(cx, cy, r1, r2) {
  const arc = (r, sweep) =>
    `M${cx + r},${cy} A${r},${r} 0 1 ${sweep} ${cx - r},${cy} A${r},${r} 0 1 ${sweep} ${cx + r},${cy} Z`;
  return r1 <= 0 ? arc(r2, 0) : arc(r2, 0) + ' ' + arc(r1, 0);
}

function createFlatMap(container, capitals, onGuess, difficulty) {
  const ns = 'http://www.w3.org/2000/svg';

  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  container.appendChild(wrap);

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'world-map');
  svg.style.cursor = 'grab';
  svg.style.display = 'block';
  svg.style.userSelect = 'none';

  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', W); bg.setAttribute('height', H); bg.setAttribute('fill', '#0a0e1a');
  svg.appendChild(bg);

  const land = document.createElementNS(ns, 'path');
  land.setAttribute('d', ''); // COASTLINE import removed; flat map is unused
  land.setAttribute('fill', '#111827');
  land.setAttribute('stroke', 'rgba(255,255,255,0.25)');
  land.setAttribute('stroke-width', '0.5');
  land.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(land);

  if (difficulty.showGrid) {
    const line = (x1, y1, x2, y2, stroke, width) => {
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1);
      l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('stroke', stroke); l.setAttribute('stroke-width', width);
      svg.appendChild(l);
    };
    for (let lng = -135; lng <= 135; lng += 45) {
      line(project(0, lng).x, 0, project(0, lng).x, H, '#1e3a52', '0.5');
    }
    line(0, project(0, 0).y, W, project(0, 0).y, '#2e5070', '1');
    for (let lat = 18; lat <= 72; lat += 18) {
      line(0, project(lat, 0).y,  W, project(lat, 0).y,  '#1e3a52', '0.5');
      line(0, project(-lat, 0).y, W, project(-lat, 0).y, '#1e3a52', '0.5');
    }
  }

  const ringsGroup = document.createElementNS(ns, 'g');
  svg.appendChild(ringsGroup);

  let vb = { x: 0, y: 0, w: W, h: H };
  const dots = new Map();
  let hasDragged = false;

  function applyViewBox() {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const scale = vb.w / W;
    dots.forEach(dot => {
      dot.circle.setAttribute('r', dot.baseR * scale);
      dot.hit.setAttribute('r', HIT_R * scale);
    });
  }

  function clamp() {
    vb.w = Math.max(W / MAX_ZOOM, Math.min(W, vb.w));
    vb.h = Math.max(H / MAX_ZOOM, Math.min(H, vb.h));
    vb.x = Math.max(0, Math.min(W - vb.w, vb.x));
    vb.y = Math.max(0, Math.min(H - vb.h, vb.y));
  }

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width)  * vb.w + vb.x;
    const my = ((e.clientY - rect.top)  / rect.height) * vb.h + vb.y;
    const factor = e.deltaY > 0 ? 1.18 : 0.85;
    const newW = vb.w * factor;
    const newH = vb.h * factor;
    vb.x = mx - (mx - vb.x) * (newW / vb.w);
    vb.y = my - (my - vb.y) * (newH / vb.h);
    vb.w = newW; vb.h = newH;
    clamp(); applyViewBox();
  }, { passive: false });

  let dragging = false;
  let dragStart = null;

  svg.addEventListener('mousedown', e => {
    dragging = true; hasDragged = false;
    dragStart = { x: e.clientX, y: e.clientY, vbx: vb.x, vby: vb.y };
    svg.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect = svg.getBoundingClientRect();
    const dx = (e.clientX - dragStart.x) / rect.width  * vb.w;
    const dy = (e.clientY - dragStart.y) / rect.height * vb.h;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasDragged = true;
    vb.x = dragStart.vbx - dx; vb.y = dragStart.vby - dy;
    clamp(); applyViewBox();
  });
  window.addEventListener('mouseup', () => { dragging = false; svg.style.cursor = 'grab'; });

  let lastTouches = null;
  svg.addEventListener('touchstart', e => {
    e.preventDefault(); hasDragged = false; lastTouches = e.touches;
  }, { passive: false });
  svg.addEventListener('touchmove', e => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    if (e.touches.length === 1 && lastTouches.length === 1) {
      const dx = (e.touches[0].clientX - lastTouches[0].clientX) / rect.width  * vb.w;
      const dy = (e.touches[0].clientY - lastTouches[0].clientY) / rect.height * vb.h;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) hasDragged = true;
      vb.x -= dx; vb.y -= dy;
    } else if (e.touches.length === 2 && lastTouches.length === 2) {
      const prev = Math.hypot(lastTouches[0].clientX - lastTouches[1].clientX, lastTouches[0].clientY - lastTouches[1].clientY);
      const curr = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const factor = prev / curr;
      const cx = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) / rect.width  * vb.w + vb.x;
      const cy = ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top)  / rect.height * vb.h + vb.y;
      const newW = vb.w * factor;
      vb.x = cx - (cx - vb.x) * (newW / vb.w);
      vb.y = cy - (cy - vb.y) * (newW / vb.w);
      vb.w = newW; vb.h = newW * (H / W);
    }
    clamp(); applyViewBox(); lastTouches = e.touches;
  }, { passive: false });

  capitals.forEach(capital => {
    const { x, y } = project(capital.lat, capital.lng);
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'capital-dot');
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', x); circle.setAttribute('cy', y);
    circle.setAttribute('r', '3'); circle.setAttribute('fill', '#2e7ab5'); circle.setAttribute('opacity', '0.7');
    const hit = document.createElementNS(ns, 'circle');
    hit.setAttribute('cx', x); hit.setAttribute('cy', y);
    hit.setAttribute('r', HIT_R); hit.setAttribute('fill', 'transparent');
    const title = document.createElementNS(ns, 'title');
    title.textContent = `${capital.flag} ${capital.capital}, ${capital.country}`;
    g.appendChild(hit); g.appendChild(circle); g.appendChild(title);
    g.addEventListener('click', () => { if (!hasDragged) onGuess(capital); });
    svg.appendChild(g);
    dots.set(capital.capital, { g, circle, hit, baseR: 3 });
  });

  wrap.appendChild(svg);

  const controls = document.createElement('div');
  controls.className = 'map-controls';
  controls.innerHTML = `<button data-action="in">+</button><button data-action="reset">⌂</button><button data-action="out">−</button>`;
  controls.addEventListener('click', e => {
    const action = e.target.dataset.action;
    if (!action) return;
    if (action === 'reset') {
      vb = { x: 0, y: 0, w: W, h: H };
    } else {
      const factor = action === 'in' ? 0.65 : 1.5;
      const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
      vb.w *= factor; vb.h *= factor;
      vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2;
    }
    clamp(); applyViewBox();
  });
  wrap.appendChild(controls);

  function drawRings(guesses) {
    ringsGroup.innerHTML = '';
    if (!difficulty.showRings) return;
    guesses.forEach((g, i) => {
      if (!g.distance) return;
      const { innerRadius, outerRadius } = calculateRing(g.distance, i + 1);
      const { x: cx, y: cy } = project(g.lat, g.lng);
      const r1 = innerRadius / KM_PER_PX;
      const r2 = outerRadius / KM_PER_PX;
      const color = RING_COLORS[i % RING_COLORS.length];
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', annulusPath(cx, cy, r1, r2));
      p.setAttribute('fill', color); p.setAttribute('fill-opacity', '0.15');
      p.setAttribute('fill-rule', 'evenodd');
      p.setAttribute('stroke', color); p.setAttribute('stroke-opacity', '0.4');
      p.setAttribute('stroke-width', '0.5');
      ringsGroup.appendChild(p);
    });
  }

  return {
    update(guesses, status, target) {
      drawRings(guesses);
      const scale = vb.w / W;
      guesses.forEach(g => {
        const dot = dots.get(g.capital);
        if (!dot) return;
        dot.circle.setAttribute('fill', g.correct ? '#22c55e' : '#f97316');
        dot.baseR = 5; dot.circle.setAttribute('r', 5 * scale); dot.circle.setAttribute('opacity', '1');
      });
      if (status !== 'playing' && target) {
        const dot = dots.get(target.capital);
        if (dot) { dot.circle.setAttribute('fill', '#22c55e'); dot.baseR = 7; dot.circle.setAttribute('r', 7 * scale); dot.circle.setAttribute('opacity', '1'); }
      }
    },
    reset() {
      ringsGroup.innerHTML = '';
      const scale = vb.w / W;
      dots.forEach(dot => {
        dot.baseR = 3;
        dot.circle.setAttribute('fill', '#2e7ab5'); dot.circle.setAttribute('opacity', '0.7');
        dot.circle.setAttribute('r', 3 * scale); dot.hit.setAttribute('r', HIT_R * scale);
      });
    },
    applyTheme() {}, // flat map has no canvas to redraw
  };
}

// ── Globe ────────────────────────────────────────────────────────────────────

const SIZE = 600;        // canvas pixel dimensions (square)
const CX = SIZE / 2;    // canvas X centre
const CY = SIZE / 2;    // canvas Y centre
const BASE_R = 275;     // globe radius in pixels at zoom=1
const GLOBE_MIN = 1;
const GLOBE_MAX = 8;
const EARTH_R = 6371;   // km, used to convert ring radii to angular radians

// Reads globe colour tokens from CSS custom properties so the canvas respects
// the active theme (.light-theme on body vs default dark).
// Called once on globe creation and again whenever applyTheme() is invoked.
function getThemeColors() {
  const s = getComputedStyle(document.documentElement);
  const get = v => s.getPropertyValue(v).trim();
  return {
    ocean:      get('--globe-ocean'),
    land:       get('--globe-land'),
    landStroke: get('--globe-land-stroke'),
    lake:       get('--globe-lake'),
    lakeStroke: get('--globe-lake-stroke'),
    rim:        get('--globe-rim'),
    grid:       get('--globe-grid'),
    gridEq:     get('--globe-grid-eq'),
    dot:        get('--globe-dot'),
  };
}

// Standard orthographic projection centred at (rotLat, rotLng).
// Returns unit-sphere {x, y, z}.
//   z > 0 → front hemisphere (visible to the camera)
//   z < 0 → back hemisphere  (behind the globe, skip)
//   x points screen-right, y points screen-up (toCanvas flips y for canvas coords)
function ortho(lat, lng, rotLat, rotLng) {
  const phi  = lat  * Math.PI / 180;
  const lam  = (lng - rotLng) * Math.PI / 180;
  const phi0 = rotLat * Math.PI / 180;
  const s0 = Math.sin(phi0), c0 = Math.cos(phi0);
  const sp = Math.sin(phi),  cp = Math.cos(phi);
  const cl = Math.cos(lam),  sl = Math.sin(lam);
  return { x: cp * sl, y: c0 * sp - s0 * cp * cl, z: s0 * sp + c0 * cp * cl };
}

// Converts a unit-sphere point to canvas pixel coordinates.
// CY - p.y*R because the canvas Y axis points down, geographic Y points up.
function toCanvas(p, R) {
  return { cx: CX + p.x * R, cy: CY - p.y * R };
}

// Computes all points on a geodesic small circle (constant angular distance
// alphaRad from the centre point lat0, lng0) stepping around 0→2π in `steps`
// increments.  Used by drawGlobeRings() to draw the inner and outer arcs of
// each distance ring in easy mode.
function smallCircle(lat0, lng0, alphaRad, steps = 120) {
  const phi0 = lat0 * Math.PI / 180;
  const lam0 = lng0 * Math.PI / 180;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    const sinPhi = Math.sin(phi0) * Math.cos(alphaRad) + Math.cos(phi0) * Math.sin(alphaRad) * Math.cos(theta);
    const phi = Math.asin(Math.max(-1, Math.min(1, sinPhi)));
    const lam = lam0 + Math.atan2(
      Math.sin(theta) * Math.sin(alphaRad) * Math.cos(phi0),
      Math.cos(alphaRad) - Math.sin(phi0) * sinPhi
    );
    pts.push([phi * 180 / Math.PI, lam * 180 / Math.PI]);
  }
  return pts;
}

function createGlobe(container, capitals, onGuess, difficulty) {
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  wrap.style.display = 'inline-block';
  container.appendChild(wrap);

  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  canvas.className = 'globe-canvas';
  canvas.style.cursor = 'grab';
  wrap.appendChild(canvas);

  const tooltip = document.createElement('div');
  tooltip.className = 'map-tooltip';
  tooltip.style.display = 'none';
  wrap.appendChild(tooltip);

  const ctx = canvas.getContext('2d');
  const rot = { lat: 20, lng: 0 }; // initial view: slightly tilted north
  let zoom = 1;
  let R = BASE_R;          // effective radius in pixels = BASE_R * zoom
  let currentGuesses = []; // kept so draw() can re-render rings on every frame
  let colors = getThemeColors(); // read from CSS vars; updated via applyTheme()

  // One entry per capital: { lat, lng, guessColor, r, opacity, visible }
  // guessColor is null for unguessed dots — draw() falls back to colors.dot.
  // visible=false on hard mode until the player guesses or the round ends.
  const dots = new Map();
  capitals.forEach(c => dots.set(c.capital, {
    lat: c.lat, lng: c.lng,
    guessColor: null, // null = unguessed (use theme default); set to a hex on guess
    r: 3, opacity: 0.7,
    visible: difficulty.showDots,
  }));

  function drawGlobeGrid() {
    // Meridians and parallels every 18° ≈ 2,000 km at the equator
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 0.5;
    for (let lng = -180; lng < 180; lng += 18) {
      ctx.beginPath();
      let penDown = false;
      for (let lat = -90; lat <= 90; lat += 2) {
        const p = ortho(lat, lng, rot.lat, rot.lng);
        if (p.z < 0) { penDown = false; continue; }
        const { cx, cy } = toCanvas(p, R);
        if (!penDown) { ctx.moveTo(cx, cy); penDown = true; } else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    // Parallels — equator drawn brighter as a visual reference
    for (let lat = -72; lat <= 72; lat += 18) {
      ctx.strokeStyle = lat === 0 ? colors.gridEq : colors.grid;
      ctx.lineWidth  = lat === 0 ? 1 : 0.5;
      ctx.beginPath();
      let penDown = false;
      for (let lng = -180; lng <= 180; lng += 2) {
        const p = ortho(lat, lng, rot.lat, rot.lng);
        if (p.z < 0) { penDown = false; continue; }
        const { cx, cy } = toCanvas(p, R);
        if (!penDown) { ctx.moveTo(cx, cy); penDown = true; } else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
  }

  // Traces a sequence of [lat, lng] points, lifting the pen at the horizon
  // (p.z < 0) so segments don't wrap across the back of the globe.
  function traceCircle(pts) {
    let penDown = false;
    for (const [lat, lng] of pts) {
      const p = ortho(lat, lng, rot.lat, rot.lng);
      if (p.z < 0) { penDown = false; continue; }
      const { cx, cy } = toCanvas(p, R);
      if (!penDown) { ctx.moveTo(cx, cy); penDown = true; } else ctx.lineTo(cx, cy);
    }
  }

  function drawGlobeRings() {
    // Rings are STROKE-ONLY (no fill).  A filled annulus with evenodd rule
    // becomes semi-transparent when the outer arc clips at the horizon:
    // the back-hemisphere portion of the outer circle is never drawn, leaving
    // an unclosed shape whose evenodd fill floods the visible hemisphere.
    // Stroke-only arcs are immune to this artifact.
    currentGuesses.forEach((g, i) => {
      if (!g.distance) return;
      const { innerRadius, outerRadius } = calculateRing(g.distance, i + 1);
      // Convert km radii to angular radians on the sphere surface
      const outerAlpha = Math.min(Math.PI * 0.99, outerRadius / EARTH_R);
      const innerAlpha = Math.max(0.005, Math.min(Math.PI * 0.99, innerRadius / EARTH_R));
      const color = RING_COLORS[i % RING_COLORS.length];
      const outer = smallCircle(g.lat, g.lng, outerAlpha);
      const inner = smallCircle(g.lat, g.lng, innerAlpha);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); traceCircle(outer); ctx.stroke();
      ctx.beginPath(); traceCircle(inner); ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  function draw() {
    R = BASE_R * zoom;
    ctx.globalAlpha = 1; // guard: ring drawing modifies globalAlpha; reset before each frame
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Clip everything to the circular globe area
    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, R + 1, 0, Math.PI * 2); ctx.clip();

    // Ocean base colour
    ctx.fillStyle = colors.ocean; ctx.fillRect(0, 0, SIZE, SIZE);

    // Land polygons — each ring is a closed polygon, rendered fill + stroke
    // -0.05 threshold (not 0): accept points just past the limb so edges near
    // the horizon don't get clipped mid-stroke by the canvas circular clip.
    ctx.fillStyle = colors.land; ctx.strokeStyle = colors.landStroke; ctx.lineWidth = 0.7;
    for (const ring of LAND_POLYGONS) {
      ctx.beginPath();
      let penDown = false;
      for (const [lat, lng] of ring) {
        const p = ortho(lat, lng, rot.lat, rot.lng);
        if (p.z < -0.05) { penDown = false; continue; }
        const { cx, cy } = toCanvas(p, R);
        if (!penDown) { ctx.moveTo(cx, cy); penDown = true; } else ctx.lineTo(cx, cy);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    // Lakes: drawn over land in ocean colour to punch water bodies out of land,
    // then given a faint blue stroke so shorelines like the Caspian Sea read as water.
    ctx.fillStyle = colors.lake;
    ctx.strokeStyle = colors.lakeStroke;
    ctx.lineWidth = 0.7;
    for (const ring of LAKE_POLYGONS) {
      ctx.beginPath();
      let lpenDown = false;
      for (const [lat, lng] of ring) {
        const p = ortho(lat, lng, rot.lat, rot.lng);
        if (p.z < -0.05) { lpenDown = false; continue; }
        const { cx, cy } = toCanvas(p, R);
        if (!lpenDown) { ctx.moveTo(cx, cy); lpenDown = true; } else ctx.lineTo(cx, cy);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    if (difficulty.showGrid)  drawGlobeGrid();
    if (difficulty.showRings) drawGlobeRings();

    ctx.restore(); // end circular clip

    // Globe rim stroke (drawn outside the clip so it sits on top of all content)
    ctx.beginPath(); ctx.arc(CX, CY, R + 1, 0, Math.PI * 2);
    ctx.strokeStyle = colors.rim; ctx.lineWidth = 1.5; ctx.stroke();

    // Capital dots — fade near the horizon so they don't pop on/off sharply.
    // guessColor is null for unguessed dots; fall back to the theme default.
    dots.forEach(dot => {
      if (!dot.visible) return;
      const p = ortho(dot.lat, dot.lng, rot.lat, rot.lng);
      if (p.z < 0) return;
      const { cx, cy } = toCanvas(p, R);
      // fade: 0 at the very limb (z≈0), full opacity once z ≥ 0.10
      const fade = Math.min(1, (p.z + 0.05) / 0.15);
      ctx.beginPath(); ctx.arc(cx, cy, dot.r, 0, Math.PI * 2);
      ctx.fillStyle = dot.guessColor ?? colors.dot;
      ctx.globalAlpha = dot.opacity * fade; ctx.fill(); ctx.globalAlpha = 1;
    });
  }

  // Convert a mouse/touch event position to canvas pixel coordinates,
  // accounting for the canvas being CSS-scaled to fill its container.
  function canvasXY(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (SIZE / rect.width),
      y: (e.clientY - rect.top)  * (SIZE / rect.height),
    };
  }

  // Returns the nearest capital within hitPx pixels, or null.
  function findNearest(cx, cy, hitPx) {
    let best = null, bestD2 = hitPx * hitPx;
    for (const cap of capitals) {
      const p = ortho(cap.lat, cap.lng, rot.lat, rot.lng);
      if (p.z < 0) continue; // back hemisphere — not clickable
      const { cx: px, cy: py } = toCanvas(p, R);
      const d2 = (px - cx) ** 2 + (py - cy) ** 2;
      if (d2 < bestD2) { bestD2 = d2; best = cap; }
    }
    return best;
  }

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoom = Math.max(GLOBE_MIN, Math.min(GLOBE_MAX, zoom * (e.deltaY > 0 ? 1 / 1.18 : 1.18)));
    draw();
  }, { passive: false });

  let dragging = false, hasDragged = false, dragStart = null;

  canvas.addEventListener('mousedown', e => {
    dragging = true; hasDragged = false;
    dragStart = { x: e.clientX, y: e.clientY, lat: rot.lat, lng: rot.lng };
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasDragged = true;
    const rect = canvas.getBoundingClientRect();
    // deg: pixel delta → degrees of rotation.
    // 90 / (half the globe diameter in px) keeps angular speed in proportion;
    // dividing by zoom keeps it constant regardless of magnification level.
    const deg = 90 / (rect.width * zoom * 0.5);
    // Sign conventions: drag right → lng decreases (globe turns right)
    //                   drag down  → lat increases (globe tilts south)
    // Both match the feel of spinning a physical sphere.
    rot.lng = dragStart.lng - dx * deg;
    rot.lat = Math.max(-80, Math.min(80, dragStart.lat + dy * deg));
    draw();
  });

  window.addEventListener('mouseup', () => { dragging = false; canvas.style.cursor = 'grab'; });

  canvas.addEventListener('mousemove', e => {
    if (dragging) { tooltip.style.display = 'none'; return; }
    const { x, y } = canvasXY(e);
    const hit = findNearest(x, y, 14);
    const rect = canvas.getBoundingClientRect();
    if (hit) {
      tooltip.textContent = `${hit.flag} ${hit.capital}, ${hit.country}`;
      tooltip.style.display = 'block';
      tooltip.style.left = `${e.clientX - rect.left + 12}px`;
      tooltip.style.top  = `${e.clientY - rect.top  - 8}px`;
    } else { tooltip.style.display = 'none'; }
  });
  canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

  canvas.addEventListener('click', e => {
    if (hasDragged) return; // drag release — not a click
    const { x, y } = canvasXY(e);
    const hit = findNearest(x, y, 18);
    if (hit) onGuess(hit);
  });

  // Touch handlers mirror mouse: single-finger drag rotates, two-finger pinch zooms
  let lastTouches = null;
  canvas.addEventListener('touchstart', e => {
    e.preventDefault(); hasDragged = false; lastTouches = e.touches;
    if (e.touches.length === 1) dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, lat: rot.lat, lng: rot.lng };
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    if (e.touches.length === 1 && lastTouches.length === 1) {
      const dx = e.touches[0].clientX - dragStart.x, dy = e.touches[0].clientY - dragStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged = true;
      const deg = 90 / (rect.width * zoom * 0.5);
      rot.lng = dragStart.lng - dx * deg;
      rot.lat = Math.max(-80, Math.min(80, dragStart.lat + dy * deg));
      draw();
    } else if (e.touches.length === 2 && lastTouches.length === 2) {
      const prev = Math.hypot(lastTouches[0].clientX - lastTouches[1].clientX, lastTouches[0].clientY - lastTouches[1].clientY);
      const curr = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      zoom = Math.max(GLOBE_MIN, Math.min(GLOBE_MAX, zoom * (curr / prev)));
      draw();
    }
    lastTouches = e.touches;
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    if (!hasDragged && e.changedTouches.length === 1) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.changedTouches[0].clientX - rect.left) * (SIZE / rect.width);
      const y = (e.changedTouches[0].clientY - rect.top)  * (SIZE / rect.height);
      const hit = findNearest(x, y, 22);
      if (hit) onGuess(hit);
    }
  });

  const controls = document.createElement('div');
  controls.className = 'map-controls';
  controls.innerHTML = `<button data-action="in">+</button><button data-action="reset">⌂</button><button data-action="out">−</button>`;
  controls.addEventListener('click', e => {
    const action = e.target.dataset.action;
    if (!action) return;
    if (action === 'reset') { zoom = 1; rot.lat = 20; rot.lng = 0; }
    else zoom = Math.max(GLOBE_MIN, Math.min(GLOBE_MAX, zoom * (action === 'in' ? 1.4 : 0.7)));
    draw();
  });
  wrap.appendChild(controls);

  draw(); // initial render

  return {
    // Called by index.html after every guess and on round end.
    // Recolours guessed dots and reveals the target dot when the round ends.
    update(guesses, status, target) {
      currentGuesses = guesses;
      guesses.forEach(g => {
        const dot = dots.get(g.capital);
        if (!dot) return;
        dot.visible    = true;
        dot.guessColor = g.correct ? '#22c55e' : '#f97316';
        dot.r          = 5;
        dot.opacity    = 1;
      });
      if (status !== 'playing' && target) {
        // Always show and highlight the target when the round is over
        const dot = dots.get(target.capital);
        if (dot) { dot.visible = true; dot.guessColor = '#22c55e'; dot.r = 7; dot.opacity = 1; }
      }
      draw();
    },

    // Called by index.html at the start of each new round.
    // Clears guesses, restores all dots to their initial state, and recentres the view.
    reset() {
      currentGuesses = [];
      dots.forEach(dot => {
        dot.visible    = difficulty.showDots; // hard mode: dots hidden until guessed
        dot.guessColor = null;               // revert to theme default colour
        dot.r          = 3;
        dot.opacity    = 0.7;
      });
      zoom = 1; rot.lat = 20; rot.lng = 0;
      draw();
    },

    // Re-reads CSS theme variables and redraws.  Call after toggling .light-theme on <body>.
    applyTheme() {
      colors = getThemeColors();
      draw();
    },
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

// Entry point called by index.html.  Delegates to the globe renderer for all
// current difficulty levels (globeView is always true).  The flat map branch
// is retained for completeness but is unreachable with current config.
export function createMap(container, capitals, onGuess, difficulty) {
  if (difficulty.globeView) return createGlobe(container, capitals, onGuess, difficulty);
  return createFlatMap(container, capitals, onGuess, difficulty);
}
