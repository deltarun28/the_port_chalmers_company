import { COASTLINE } from '../data/coastline.js';

const W = 800;
const H = 400;
const MAX_ZOOM = 12;

function project(lat, lng) {
  const x = ((lng + 180) / 360) * W;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = (H / 2) - (W * mercN) / (2 * Math.PI);
  return { x, y: Math.max(0, Math.min(H, y)) };
}

export function createMap(container, capitals, onGuess) {
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

  // land outline
  const land = document.createElementNS(ns, 'path');
  land.setAttribute('d', COASTLINE);
  land.setAttribute('fill', '#111827');
  land.setAttribute('stroke', 'rgba(255,255,255,0.25)');
  land.setAttribute('stroke-width', '0.5');
  land.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(land);

  function gridLine(x1, y1, x2, y2, stroke, width) {
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('stroke', stroke); l.setAttribute('stroke-width', width);
    svg.appendChild(l);
  }

  function gridLabel(x, y, text, anchor = 'start') {
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('fill', 'rgba(255,255,255,0.28)');
    t.setAttribute('font-size', '8');
    t.setAttribute('font-family', 'sans-serif');
    t.setAttribute('text-anchor', anchor);
    t.textContent = text;
    svg.appendChild(t);
  }

  // Longitude lines every 45° ≈ 5,000 km along the equator
  for (let lng = -135; lng <= 135; lng += 45) {
    const { x } = project(0, lng);
    gridLine(x, 0, x, H, '#1e3a52', '0.5');
    const km = Math.round(Math.abs(lng) / 360 * 40075 / 1000) * 1000;
    gridLabel(x + 2, 8, `${km.toLocaleString()} km`);
  }

  // Latitude lines every 18° ≈ 2,000 km from equator
  const { y: eqY } = project(0, 0);
  gridLine(0, eqY, W, eqY, '#2e5070', '1');
  gridLabel(2, eqY - 3, 'Equator');

  for (let lat = 18; lat <= 72; lat += 18) {
    const km = `${Math.round(lat / 360 * 40008 / 1000) * 1000}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const { y: yn } = project(lat, 0);
    gridLine(0, yn, W, yn, '#1e3a52', '0.5');
    gridLabel(2, yn - 3, `${km} km N`);

    const { y: ys } = project(-lat, 0);
    gridLine(0, ys, W, ys, '#1e3a52', '0.5');
    gridLabel(2, ys - 3, `${km} km S`);
  }

  let vb = { x: 0, y: 0, w: W, h: H };

  // dots stored as { g, circle, baseR } so we can mutate baseR without dataset
  const dots = new Map();

  const HIT_R = 10;

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
    const mx = ((e.clientX - rect.left) / rect.width) * vb.w + vb.x;
    const my = ((e.clientY - rect.top) / rect.height) * vb.h + vb.y;
    const factor = e.deltaY > 0 ? 1.18 : 0.85;
    const newW = vb.w * factor;
    const newH = vb.h * factor;
    vb.x = mx - (mx - vb.x) * (newW / vb.w);
    vb.y = my - (my - vb.y) * (newH / vb.h);
    vb.w = newW;
    vb.h = newH;
    clamp();
    applyViewBox();
  }, { passive: false });

  let dragging = false;
  let hasDragged = false;
  let dragStart = null;

  svg.addEventListener('mousedown', e => {
    dragging = true;
    hasDragged = false;
    dragStart = { x: e.clientX, y: e.clientY, vbx: vb.x, vby: vb.y };
    svg.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect = svg.getBoundingClientRect();
    const dx = (e.clientX - dragStart.x) / rect.width * vb.w;
    const dy = (e.clientY - dragStart.y) / rect.height * vb.h;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasDragged = true;
    vb.x = dragStart.vbx - dx;
    vb.y = dragStart.vby - dy;
    clamp();
    applyViewBox();
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    svg.style.cursor = 'grab';
  });

  let lastTouches = null;
  svg.addEventListener('touchstart', e => {
    e.preventDefault();
    lastTouches = e.touches;
    hasDragged = false;
  }, { passive: false });

  svg.addEventListener('touchmove', e => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    if (e.touches.length === 1 && lastTouches.length === 1) {
      const dx = (e.touches[0].clientX - lastTouches[0].clientX) / rect.width * vb.w;
      const dy = (e.touches[0].clientY - lastTouches[0].clientY) / rect.height * vb.h;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) hasDragged = true;
      vb.x -= dx; vb.y -= dy;
    } else if (e.touches.length === 2 && lastTouches.length === 2) {
      const prevDist = Math.hypot(
        lastTouches[0].clientX - lastTouches[1].clientX,
        lastTouches[0].clientY - lastTouches[1].clientY
      );
      const newDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = prevDist / newDist;
      const cx = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) / rect.width * vb.w + vb.x;
      const cy = ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top) / rect.height * vb.h + vb.y;
      const newW = vb.w * factor;
      vb.x = cx - (cx - vb.x) * (newW / vb.w);
      vb.y = cy - (cy - vb.y) * (newW / vb.w);
      vb.w = newW;
      vb.h = newW * (H / W);
    }
    clamp();
    applyViewBox();
    lastTouches = e.touches;
  }, { passive: false });

  capitals.forEach(capital => {
    const { x, y } = project(capital.lat, capital.lng);
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'capital-dot');

    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', x); circle.setAttribute('cy', y);
    circle.setAttribute('r', '3');
    circle.setAttribute('fill', '#2e7ab5');
    circle.setAttribute('opacity', '0.7');

    const hit = document.createElementNS(ns, 'circle');
    hit.setAttribute('cx', x); hit.setAttribute('cy', y);
    hit.setAttribute('r', HIT_R);
    hit.setAttribute('fill', 'transparent');

    const title = document.createElementNS(ns, 'title');
    title.textContent = `${capital.flag} ${capital.capital}, ${capital.country}`;

    g.appendChild(hit); g.appendChild(circle); g.appendChild(title);
    g.addEventListener('click', () => {
      if (hasDragged) return;
      onGuess(capital);
    });
    svg.appendChild(g);
    dots.set(capital.capital, { g, circle, hit, baseR: 3 });
  });

  wrap.appendChild(svg);

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
      vb = { x: 0, y: 0, w: W, h: H };
    } else {
      const factor = action === 'in' ? 0.65 : 1.5;
      const cx = vb.x + vb.w / 2;
      const cy = vb.y + vb.h / 2;
      vb.w *= factor; vb.h *= factor;
      vb.x = cx - vb.w / 2;
      vb.y = cy - vb.h / 2;
    }
    clamp();
    applyViewBox();
  });
  wrap.appendChild(controls);

  return {
    update(guesses, status, target) {
      const scale = vb.w / W;
      guesses.forEach(g => {
        const dot = dots.get(g.capital);
        if (!dot) return;
        dot.circle.setAttribute('fill', g.correct ? '#22c55e' : '#f97316');
        dot.baseR = 5;
        dot.circle.setAttribute('r', 5 * scale);
        dot.circle.setAttribute('opacity', '1');
      });
      if (status !== 'playing' && target) {
        const dot = dots.get(target.capital);
        if (dot) {
          dot.circle.setAttribute('fill', '#22c55e');
          dot.baseR = 7;
          dot.circle.setAttribute('r', 7 * scale);
          dot.circle.setAttribute('opacity', '1');
        }
      }
    },
    reset() {
      const scale = vb.w / W;
      dots.forEach(dot => {
        dot.baseR = 3;
        dot.circle.setAttribute('fill', '#2e7ab5');
        dot.circle.setAttribute('opacity', '0.7');
        dot.circle.setAttribute('r', 3 * scale);
        dot.hit.setAttribute('r', HIT_R * scale);
      });
    },
  };
}
