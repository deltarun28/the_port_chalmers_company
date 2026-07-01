import { COASTLINE } from '../data/coastline.js';
import { LAND_POLYGONS, LAKE_POLYGONS } from '../data/land_polygons.js';
import { calculateRing } from '../lib/ring_calculator.js';

// ── Flat SVG map (easy / moderate) ─────────────────────────────────────────

const W = 800;
const H = 400;
const MAX_ZOOM = 12;
const HIT_R = 10;
const KM_PER_PX = 40075 / W;
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
  land.setAttribute('d', COASTLINE);
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
  };
}

// ── Globe ───────────────────────────────────────────────────────────────────

const SIZE = 600;
const CX = SIZE / 2;
const CY = SIZE / 2;
const BASE_R = 275;
const GLOBE_MIN = 1;
const GLOBE_MAX = 8;

function ortho(lat, lng, rotLat, rotLng) {
  const phi  = lat  * Math.PI / 180;
  const lam  = (lng - rotLng) * Math.PI / 180;
  const phi0 = rotLat * Math.PI / 180;
  const s0 = Math.sin(phi0), c0 = Math.cos(phi0);
  const sp = Math.sin(phi),  cp = Math.cos(phi);
  const cl = Math.cos(lam),  sl = Math.sin(lam);
  return { x: cp * sl, y: c0 * sp - s0 * cp * cl, z: s0 * sp + c0 * cp * cl };
}

function toCanvas(p, R) {
  return { cx: CX + p.x * R, cy: CY - p.y * R };
}

const EARTH_R = 6371;

// Points on a small circle (geodesic ring) around (lat0, lng0) at angular radius alphaRad
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
  const rot = { lat: 20, lng: 0 };
  let zoom = 1;
  let R = BASE_R;
  let currentGuesses = [];

  const dots = new Map();
  capitals.forEach(c => dots.set(c.capital, { lat: c.lat, lng: c.lng, color: '#2e7ab5', r: 3, opacity: 0.7, visible: difficulty.showDots }));

  function drawGlobeGrid() {
    // meridians every 18° ≈ 2,000 km at the equator
    ctx.strokeStyle = '#1e3a52';
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
    // parallels every 18°, equator brighter
    for (let lat = -72; lat <= 72; lat += 18) {
      ctx.strokeStyle = lat === 0 ? '#2e5070' : '#1e3a52';
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
    currentGuesses.forEach((g, i) => {
      if (!g.distance) return;
      const { innerRadius, outerRadius } = calculateRing(g.distance, i + 1);
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
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, R + 1, 0, Math.PI * 2); ctx.clip();

    ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.fillStyle = '#111827'; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.7;
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

    // lakes drawn over land as ocean colour
    ctx.fillStyle = '#0a0e1a';
    ctx.strokeStyle = 'rgba(100,160,200,0.2)';
    ctx.lineWidth = 0.5;
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

    ctx.restore();
    ctx.beginPath(); ctx.arc(CX, CY, R + 1, 0, Math.PI * 2);
    ctx.strokeStyle = '#163d5e'; ctx.lineWidth = 1.5; ctx.stroke();

    dots.forEach(dot => {
      if (!dot.visible) return;
      const p = ortho(dot.lat, dot.lng, rot.lat, rot.lng);
      if (p.z < 0) return;
      const { cx, cy } = toCanvas(p, R);
      const fade = Math.min(1, (p.z + 0.05) / 0.15);
      ctx.beginPath(); ctx.arc(cx, cy, dot.r, 0, Math.PI * 2);
      ctx.fillStyle = dot.color; ctx.globalAlpha = dot.opacity * fade; ctx.fill(); ctx.globalAlpha = 1;
    });
  }

  function canvasXY(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (SIZE / rect.width), y: (e.clientY - rect.top) * (SIZE / rect.height) };
  }

  function findNearest(cx, cy, hitPx) {
    let best = null, bestD2 = hitPx * hitPx;
    for (const cap of capitals) {
      const p = ortho(cap.lat, cap.lng, rot.lat, rot.lng);
      if (p.z < 0) continue;
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
    const deg = 90 / (rect.width * zoom * 0.5);
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
    if (hasDragged) return;
    const { x, y } = canvasXY(e);
    const hit = findNearest(x, y, 18);
    if (hit) onGuess(hit);
  });

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

  draw();

  return {
    update(guesses, status, target) {
      currentGuesses = guesses;
      guesses.forEach(g => {
        const dot = dots.get(g.capital);
        if (!dot) return;
        dot.visible = true;
        dot.color   = g.correct ? '#22c55e' : '#f97316';
        dot.r       = 5;
        dot.opacity = 1;
      });
      if (status !== 'playing' && target) {
        const dot = dots.get(target.capital);
        if (dot) { dot.visible = true; dot.color = '#22c55e'; dot.r = 7; dot.opacity = 1; }
      }
      draw();
    },
    reset() {
      currentGuesses = [];
      dots.forEach(dot => {
        dot.visible = difficulty.showDots;
        dot.color   = '#2e7ab5';
        dot.r       = 3;
        dot.opacity = 0.7;
      });
      zoom = 1; rot.lat = 20; rot.lng = 0;
      draw();
    },
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export function createMap(container, capitals, onGuess, difficulty) {
  if (difficulty.globeView) return createGlobe(container, capitals, onGuess, difficulty);
  return createFlatMap(container, capitals, onGuess, difficulty);
}
