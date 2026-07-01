// Renders the guess history for the current round as a vertical card list.
// Called by index.html after every guess and at round start (with empty guesses[]).
// Read-only: receives state from game.js, renders it, never modifies it.
//
// Each card shows: slot number, flag, capital name, country, distance, heat bar.
// Empty future slots are rendered at reduced opacity so the player can see
// how many attempts remain.  On a 'lost' outcome, a reveal card is appended.
//
// Heat bar colour scale (0 km → 20,000 km ≈ antipode):
//   green  (#22c55e) — within ~4,000 km   (pct > 80)
//   yellow (#eab308) — within ~10,000 km  (pct > 50)
//   orange (#f97316) — within ~15,000 km  (pct > 25)
//   red    (#ef4444) — more than ~15,000 km away

const MAX_DISTANCE = 20000; // approximate max distance between any two capitals (km)

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
        <span class="flag">${g.flag}</span>
        <div class="guess-info">
          <strong>${g.capital}</strong>
          <span class="country-name">${g.country}</span>
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
        The answer was ${target.flag} <strong>${target.capital}</strong>, ${target.country}
      </div>
    `;
  }
}
