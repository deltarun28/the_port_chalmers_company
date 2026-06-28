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

  // background
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', W); bg.setAttribute('height', H); bg.setAttribute('fill', '#0a1628');
  svg.appendChild(bg);

  // grid
  for (let lng = -180; lng <= 180; lng += 30) {
    const { x } = project(0, lng);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', x); line.setAttribute('y1', 0);
    line.setAttribute('x2', x); line.setAttribute('y2', H);
    line.setAttribute('stroke', '#1a3050'); line.setAttribute('stroke-width', '0.5');
    svg.appendChild(line);
  }
  for (let lat = -60; lat <= 80; lat += 30) {
    const { y } = project(lat, 0);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', 0); line.setAttribute('y1', y);
    line.setAttribute('x2', W); line.setAttribute('y2', y);
    line.setAttribute('stroke', '#1a3050'); line.setAttribute('stroke-width', '0.5');
    svg.appendChild(line);
  }
  // equator
  const { y: eqY } = project(0, 0);
  const eq = document.createElementNS(ns, 'line');
  eq.setAttribute('x1', 0); eq.setAttribute('y1', eqY);
  eq.setAttribute('x2', W); eq.setAttribute('y2', eqY);
  eq.setAttribute('stroke', '#2e5070'); eq.setAttribute('stroke-width', '1');
  svg.appendChild(eq);

  // viewBox state
  let vb = { x: 0, y: 0, w: W, h: H };

  function applyViewBox() {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    // scale dots so they stay visually consistent
    const scale = vb.w / W;
    dots.forEach(({ circle }) => {
      const base = parseFloat(circle.dataset.baseR || '3');
      circle.setAttribute('r', base * scale);
    });
  }

  function clamp() {
    vb.w = Math.max(W / MAX_ZOOM, Math.min(W, vb.w));
    vb.h = Math.max(H / MAX_ZOOM, Math.min(H, vb.h));
    vb.x = Math.max(0, Math.min(W - vb.w, vb.x));
    vb.y = Math.max(0, Math.min(H - vb.h, vb.y));
  }

  // zoom on wheel
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

  // pan on drag
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

  // touch pan + pinch zoom
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

  // dots
  const dots = new Map();

  capitals.forEach(capital => {
    const { x, y } = project(capital.lat, capital.lng);
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'capital-dot');

    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', x); circle.setAttribute('cy', y);
    circle.setAttribute('r', '3');
    circle.setAttribute('fill', '#2e7ab5');
    circle.setAttribute('opacity', '0.7');
    circle.dataset.baseR = '3';

    const title = document.createElementNS(ns, 'title');
    title.textContent = `${capital.flag} ${capital.capital}, ${capital.country}`;

    g.appendChild(circle); g.appendChild(title);
    g.addEventListener('click', () => {
      if (hasDragged) return;
      onGuess(capital);
    });
    svg.appendChild(g);
    dots.set(capital.capital, { g, circle });
  });

  wrap.appendChild(svg);

  // zoom buttons
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
        dot.circle.dataset.baseR = '5';
        dot.circle.setAttribute('r', 5 * scale);
        dot.circle.setAttribute('opacity', '1');
      });
      if (status !== 'playing' && target) {
        const dot = dots.get(target.capital);
        if (dot) {
          dot.circle.setAttribute('fill', '#22c55e');
          dot.circle.dataset.baseR = '7';
          dot.circle.setAttribute('r', 7 * scale);
          dot.circle.setAttribute('opacity', '1');
        }
      }
    },
    reset() {
      dots.forEach(({ circle }) => {
        circle.setAttribute('fill', '#2e7ab5');
        circle.setAttribute('opacity', '0.7');
        circle.dataset.baseR = '3';
        circle.setAttribute('r', 3 * (vb.w / W));
      });
    },
  };
}
