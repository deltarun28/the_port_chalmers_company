// Renders the guess history for the current round as a vertical card list.
// Called by index.html after every guess and at round start (with empty guesses[]).
// Read-only: receives state from game.js, renders it, never modifies it.
//
// Each card shows: slot number, town name, region, distance, heat bar.
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
// The world game showed a flag here. There is no per-town equivalent, so the
// region takes that slot — it is the one extra fact that helps a player reason
// about where they just guessed.

import { MAX_DISTANCE } from '../lib/constants.js';

export function renderResults(container, guesses, status, target, maxAttempts) {
  // Fixed-length slot array ensures empty future slots always show
  const slots = Array.from({ length: maxAttempts }, (_, i) => guesses[i] || null);

  container.innerHTML = slots.map((g, i) => {
    if (!g) {
      return `<div class="guess-card empty"><span class="slot-num">${i + 1}</span></div>`;
    }

    const pct = Math.max(0, Math.min(100, 100 - (g.distance / MAX_DISTANCE) * 100));
    const heat = pct > 80 ? '#22c55e' : pct > 50 ? '#eab308' : pct > 25 ? '#f97316' : '#ef4444';
    const distLabel = g.correct ? '🎯 Correct!' : `${g.distance?.toLocaleString() ?? '?'} km away`;

    return `
      <div class="guess-card ${g.correct ? 'correct' : ''}">
        <span class="slot-num">${i + 1}</span>
        <div class="guess-info">
          <strong>${g.name}</strong>
          <span class="region-name">${g.region}</span>
        </div>
        <div class="distance-block">
          <span class="dist-label">${distLabel}</span>
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
        The answer was <strong>${target.name}</strong>, ${target.region}
      </div>
    `;
  }
}
