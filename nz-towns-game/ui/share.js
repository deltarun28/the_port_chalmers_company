// Generates a shareable score card for a completed 5-round session.
// Called once by endSession() in index.html with the full roundResults array.
//
// roundResults shape: [{ target, guesses, score, won }, …] — one entry per round.
//
// Clipboard text:
//   🥝 NZ Towns 2026-08-31 · Moderate
//   1. Rotorua — 🔴🟡🎯 +180
//   2. Ohakune — 🔴🔴🔴🔴🔴🔴💀 +0
//   Total: 700/1000
//
// Emoji key: 🔴 far  🟠 medium  🟡 close  🟢 very close  🎯 correct  💀 failed
// The thresholds are percentages of MAX_DISTANCE, so they mean the same thing
// here as on the heat bars in results.js.

import { MAX_DISTANCE } from '../lib/constants.js';

// Returns the emoji sequence for one round's guesses
function roundEmoji(guesses, won) {
  return guesses.map(g => {
    if (g.correct) return '🎯';
    const pct = 100 - (g.distance / MAX_DISTANCE) * 100;
    if (pct > 80) return '🟢';
    if (pct > 50) return '🟡';
    if (pct > 25) return '🟠';
    return '🔴';
  }).join('') + (won ? '' : '💀');
}

export function share(container, rounds, difficultyKey, region = null) {
  // Local date, not toISOString() (UTC) — the daily target is seeded from the
  // local date in index.html, and the share card must show the same day
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const total = rounds.reduce((s, r) => s + r.score, 0);
  const diffLabel = difficultyKey[0].toUpperCase() + difficultyKey.slice(1);
  // The maximum is derived from the rounds actually played, not fixed at 1000.
  // Region sessions are shorter wherever the region has fewer than five towns —
  // Nelson is a single round — so a hardcoded denominator would misreport them.
  const max = rounds.length * 200;
  const scope = region ? ` · ${region}` : '';

  const lines = rounds.map((r, i) =>
    `${i + 1}. ${r.target.name} — ${roundEmoji(r.guesses, r.won)} +${r.score}`
  );
  const text = [`🥝 NZ Towns ${date}${scope} · ${diffLabel}`,
                ...lines, `Total: ${total}/${max}`].join('\n');

  container.innerHTML = `
    <div class="share-card">
      <div class="share-text"></div>
      <button id="copy-btn">Copy result</button>
    </div>
  `;
  // textContent, not innerHTML — town names come from data, and there is no
  // markup in this card that needs interpreting.
  container.querySelector('.share-text').textContent = text;

  container.querySelector('#copy-btn').addEventListener('click', async () => {
    const btn = container.querySelector('#copy-btn');
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied!';
    } catch {
      // Clipboard API unavailable (insecure context) or permission denied —
      // the text is already on screen, so tell the player to copy it manually
      btn.textContent = 'Copy failed — select the text above';
    }
  });
}
