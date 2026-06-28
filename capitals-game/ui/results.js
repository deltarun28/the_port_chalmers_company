const MAX_DISTANCE = 20000;

export function renderResults(container, guesses, status, target, maxAttempts) {
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

  if (status === 'lost') {
    container.innerHTML += `
      <div class="game-over-msg">
        The answer was ${target.flag} <strong>${target.capital}</strong>, ${target.country}
      </div>
    `;
  }
}
