const W = 800;
const H = 400;

function project(lat, lng) {
  const x = ((lng + 180) / 360) * W;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = (H / 2) - (W * mercN) / (2 * Math.PI);
  return { x, y: Math.max(0, Math.min(H, y)) };
}

export function createMap(container, capitals, onGuess) {
  const ns = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'world-map');

  // background
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', W);
  bg.setAttribute('height', H);
  bg.setAttribute('fill', '#0a1628');
  svg.appendChild(bg);

  // grid lines
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

  const dots = new Map();

  capitals.forEach(capital => {
    const { x, y } = project(capital.lat, capital.lng);

    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'capital-dot');
    g.style.cursor = 'pointer';

    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', '3');
    circle.setAttribute('fill', '#2e7ab5');
    circle.setAttribute('opacity', '0.7');

    const title = document.createElementNS(ns, 'title');
    title.textContent = `${capital.flag} ${capital.capital}, ${capital.country}`;

    g.appendChild(circle);
    g.appendChild(title);
    g.addEventListener('click', () => onGuess(capital));
    svg.appendChild(g);
    dots.set(capital.capital, { g, circle });
  });

  container.appendChild(svg);

  return {
    update(guesses, status, target) {
      guesses.forEach(g => {
        const dot = dots.get(g.capital);
        if (!dot) return;
        dot.circle.setAttribute('fill', g.correct ? '#22c55e' : '#f97316');
        dot.circle.setAttribute('r', '5');
        dot.circle.setAttribute('opacity', '1');
      });

      if (status !== 'playing' && target) {
        const dot = dots.get(target.capital);
        if (dot) {
          dot.circle.setAttribute('fill', '#22c55e');
          dot.circle.setAttribute('r', '7');
          dot.circle.setAttribute('opacity', '1');
        }
      }
    },
  };
}
