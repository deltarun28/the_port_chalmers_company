// Renders the guess history for the current round as a vertical card list.
// Called by index.html after every guess and at round start (with empty guesses[]).
// Read-only: receives state from game.js, renders it, never modifies it.
//
// Each card shows: slot number, town name, region, distance, bearing arrow, heat bar.
// Empty future slots are rendered at reduced opacity so the player can see
// how many attempts remain.  On a 'lost' outcome, a reveal card is appended.
//
// Heat bar colour scale, against MAX_DISTANCE (1,400km — the length of the
// country, not half the planet):
//   green  (#22c55e) — within ~280km  (pct > 80)
//   yellow (#eab308) — within ~700km  (pct > 50)
//   orange (#f97316) — within ~1,050km (pct > 25)
//   red    (#ef4444) — further than that
//
// The world game showed a flag here; region takes that slot, being the one
// extra fact that helps a player reason about where they just guessed.

import { MAX_DISTANCE } from '../lib/constants.js';

// Town names come from generated data, but they are interpolated into HTML
// alongside player-influenced state, so escape rather than trust the pipeline.
const esc = s => String(s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A single glyph rotated to the exact bearing, rather than snapping to one of
// eight compass points — nothing is gained by throwing the precision away.
// The ➤ glyph points east, so 90deg is subtracted to put 0deg at north.
const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function arrow(bearing) {
  const spoken = COMPASS_POINTS[Math.round(bearing / 45) % 8];
  return `<span class="bearing" style="transform:rotate(${(bearing - 90).toFixed(0)}deg)"
            role="img" aria-label="${spoken}">➤</span>`;
}

// 57 of the 187 towns have no published population — small settlements kept for
// being recognisable. Rendering "population null" would be worse than silence.
const withPop = town =>
  town.population ? ` · pop. ${town.population.toLocaleString()}` : '';

export function renderResults(container, guesses, status, target, maxAttempts, difficulty) {
  const showBearing = difficulty?.showBearing ?? true;

  // Fixed-length slot array ensures empty future slots always show
  const slots = Array.from({ length: maxAttempts }, (_, i) => guesses[i] || null);

  container.innerHTML = slots.map((g, i) => {
    if (!g) {
      return `<div class="guess-card empty"><span class="slot-num">${i + 1}</span></div>`;
    }

    const pct = Math.max(0, Math.min(100, 100 - (g.distance / MAX_DISTANCE) * 100));
    const heat = pct > 80 ? '#22c55e' : pct > 50 ? '#eab308' : pct > 25 ? '#f97316' : '#ef4444';
    const dist = g.correct
      ? '🎯 Correct!'
      : `${g.distance?.toLocaleString() ?? '?'} km`;
    const dir = (!g.correct && showBearing && g.bearing != null) ? arrow(g.bearing) : '';

    return `
      <div class="guess-card ${g.correct ? 'correct' : ''}">
        <span class="slot-num">${i + 1}</span>
        <div class="guess-info">
          <strong>${esc(g.name)}</strong>
          <span class="region-name">${esc(g.region)}${g.correct ? esc(withPop(g)) : ''}</span>
        </div>
        <div class="distance-block">
          <span class="dist-label">${dist}${dir}</span>
          <div class="heat-bar-bg">
            <div class="heat-bar-fill" style="width:${pct}%;background:${heat}"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Reveal the correct answer when the player exhausts all attempts
  if (status === 'lost') {
    container.innerHTML += `
      <div class="game-over-msg">
        The answer was <strong>${esc(target.name)}</strong>, ${esc(target.region)}${esc(withPop(target))}
      </div>
    `;
  }
}
