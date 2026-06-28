import { LAND_POLYGONS } from '../data/land_polygons.js';

const SIZE = 600;
const CX = SIZE / 2;
const CY = SIZE / 2;
const BASE_R = 275;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

function ortho(lat, lng, rotLat, rotLng) {
  const phi  = lat * Math.PI / 180;
  const lam  = (lng - rotLng) * Math.PI / 180;
  const phi0 = rotLat * Math.PI / 180;
  const sinPhi0 = Math.sin(phi0), cosPhi0 = Math.cos(phi0);
  const sinPhi  = Math.sin(phi),  cosPhi  = Math.cos(phi);
  const cosLam  = Math.cos(lam),  sinLam  = Math.sin(lam);
  return {
    x: cosPhi * sinLam,
    y: cosPhi0 * sinPhi - sinPhi0 * cosPhi * cosLam,
    z: sinPhi0 * sinPhi + cosPhi0 * cosPhi * cosLam,
  };
}

function toCanvas(p, R) {
  return { cx: CX + p.x * R, cy: CY - p.y * R };
}

export function createMap(container, capitals, onGuess) {
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  wrap.style.display = 'inline-block';
  container.appendChild(wrap);

  const canvas = document.createElement('canvas');
  canvas.width  = SIZE;
  canvas.height = SIZE;
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

  // dot state: { lat, lng, color, r, opacity }
  const dots = new Map();
  capitals.forEach(c => {
    dots.set(c.capital, { lat: c.lat, lng: c.lng, color: '#2e7ab5', r: 3, opacity: 0.7 });
  });

  function draw() {
    R = BASE_R * zoom;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, R + 1, 0, Math.PI * 2);
    ctx.clip();

    // ocean background
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // land polygons
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 0.7;

    for (const ring of LAND_POLYGONS) {
      ctx.beginPath();
      let penDown = false;
      for (const [lat, lng] of ring) {
        const p = ortho(lat, lng, rot.lat, rot.lng);
        if (p.z < -0.05) {
          penDown = false;
          continue;
        }
        const { cx, cy } = toCanvas(p, R);
        if (!penDown) { ctx.moveTo(cx, cy); penDown = true; }
        else ctx.lineTo(cx, cy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // grid lines
    drawGrid();

    ctx.restore();

    // globe rim
    ctx.beginPath();
    ctx.arc(CX, CY, R + 1, 0, Math.PI * 2);
    ctx.strokeStyle = '#163d5e';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // capital dots
    dots.forEach((dot, name) => {
      const p = ortho(dot.lat, dot.lng, rot.lat, rot.lng);
      if (p.z < 0) return;
      const { cx, cy } = toCanvas(p, R);
      const fade = Math.min(1, (p.z + 0.05) / 0.15);
      ctx.beginPath();
      ctx.arc(cx, cy, dot.r, 0, Math.PI * 2);
      ctx.fillStyle = dot.color;
      ctx.globalAlpha = dot.opacity * fade;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  function drawGrid() {
    ctx.strokeStyle = '#1e3a52';
    ctx.lineWidth = 0.5;

    // meridians every 45°
    for (let lng = -180; lng < 180; lng += 45) {
      ctx.beginPath();
      let penDown = false;
      for (let lat = -90; lat <= 90; lat += 2) {
        const p = ortho(lat, lng, rot.lat, rot.lng);
        if (p.z < 0) { penDown = false; continue; }
        const { cx, cy } = toCanvas(p, R);
        if (!penDown) { ctx.moveTo(cx, cy); penDown = true; }
        else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    // parallels every 18°, equator brighter
    for (let lat = -72; lat <= 72; lat += 18) {
      ctx.strokeStyle = lat === 0 ? '#2e5070' : '#1e3a52';
      ctx.lineWidth = lat === 0 ? 1 : 0.5;
      ctx.beginPath();
      let penDown = false;
      for (let lng = -180; lng <= 180; lng += 2) {
        const p = ortho(lat, lng, rot.lat, rot.lng);
        if (p.z < 0) { penDown = false; continue; }
        const { cx, cy } = toCanvas(p, R);
        if (!penDown) { ctx.moveTo(cx, cy); penDown = true; }
        else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
  }

  // --- interaction ---

  let dragging = false;
  let hasDragged = false;
  let dragStart = null;

  function canvasXY(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = SIZE / rect.width;
    const scaleY = SIZE / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  }

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1 / 1.18 : 1.18;
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    draw();
  }, { passive: false });

  canvas.addEventListener('mousedown', e => {
    dragging = true;
    hasDragged = false;
    dragStart = { x: e.clientX, y: e.clientY, lat: rot.lat, lng: rot.lng };
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasDragged = true;
    const rect = canvas.getBoundingClientRect();
    const degPerPx = 90 / (rect.width * zoom * 0.5);
    rot.lng = dragStart.lng + dx * degPerPx;
    rot.lat = Math.max(-80, Math.min(80, dragStart.lat - dy * degPerPx));
    draw();
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    canvas.style.cursor = 'grab';
  });

  // hover tooltip
  canvas.addEventListener('mousemove', e => {
    if (dragging) { tooltip.style.display = 'none'; return; }
    const { x, y } = canvasXY(e);
    const hit = findNearest(x, y, 14);
    if (hit) {
      tooltip.textContent = `${hit.flag} ${hit.capital}, ${hit.country}`;
      const rect = canvas.getBoundingClientRect();
      tooltip.style.display = 'block';
      tooltip.style.left = `${e.clientX - rect.left + 12}px`;
      tooltip.style.top  = `${e.clientY - rect.top  - 8}px`;
    } else {
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

  canvas.addEventListener('click', e => {
    if (hasDragged) return;
    const { x, y } = canvasXY(e);
    const hit = findNearest(x, y, 18);
    if (hit) onGuess(hit);
  });

  // touch
  let lastTouches = null;
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    hasDragged = false;
    lastTouches = e.touches;
    if (e.touches.length === 1) {
      dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, lat: rot.lat, lng: rot.lng };
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    if (e.touches.length === 1 && lastTouches.length === 1) {
      const dx = e.touches[0].clientX - dragStart.x;
      const dy = e.touches[0].clientY - dragStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged = true;
      const degPerPx = 90 / (rect.width * zoom * 0.5);
      rot.lng = dragStart.lng + dx * degPerPx;
      rot.lat = Math.max(-80, Math.min(80, dragStart.lat - dy * degPerPx));
      draw();
    } else if (e.touches.length === 2 && lastTouches.length === 2) {
      const prev = Math.hypot(lastTouches[0].clientX - lastTouches[1].clientX, lastTouches[0].clientY - lastTouches[1].clientY);
      const curr = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * (curr / prev)));
      draw();
    }
    lastTouches = e.touches;
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    if (!hasDragged && e.changedTouches.length === 1) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = SIZE / rect.width;
      const scaleY = SIZE / rect.height;
      const x = (e.changedTouches[0].clientX - rect.left) * scaleX;
      const y = (e.changedTouches[0].clientY - rect.top)  * scaleY;
      const hit = findNearest(x, y, 22);
      if (hit) onGuess(hit);
    }
  });

  function findNearest(cx, cy, hitPx) {
    let best = null, bestDist = hitPx * hitPx;
    for (const cap of capitals) {
      const p = ortho(cap.lat, cap.lng, rot.lat, rot.lng);
      if (p.z < 0) continue;
      const { cx: px, cy: py } = toCanvas(p, R);
      const d2 = (px - cx) ** 2 + (py - cy) ** 2;
      if (d2 < bestDist) { bestDist = d2; best = cap; }
    }
    return best;
  }

  // controls
  const controls = document.createElement('div');
  controls.className = 'map-controls';
  controls.innerHTML = `
    <button data-action="in">+</button>
    <button data-action="reset">⌂</button>
    <button data-action="out">−</button>
  `;
  controls.addEventListener('click', e => {
    const action = e.target.dataset.action;
    if (!action) return;
    if (action === 'reset') {
      zoom = 1; rot.lat = 20; rot.lng = 0;
    } else {
      zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * (action === 'in' ? 1.4 : 0.7)));
    }
    draw();
  });
  wrap.appendChild(controls);

  draw();

  return {
    update(guesses, status, target) {
      guesses.forEach(g => {
        const dot = dots.get(g.capital);
        if (!dot) return;
        dot.color   = g.correct ? '#22c55e' : '#f97316';
        dot.r       = 5;
        dot.opacity = 1;
      });
      if (status !== 'playing' && target) {
        const dot = dots.get(target.capital);
        if (dot) { dot.color = '#22c55e'; dot.r = 7; dot.opacity = 1; }
      }
      draw();
    },
    reset() {
      dots.forEach(dot => { dot.color = '#2e7ab5'; dot.r = 3; dot.opacity = 0.7; });
      zoom = 1; rot.lat = 20; rot.lng = 0;
      draw();
    },
  };
}
