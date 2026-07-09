// Generates a shareable score card for a completed 5-round session.
// Called once by endSession() in index.html with the full roundResults array.
//
// roundResults shape: [{ target, guesses, score, won }, …] — one entry per round.
//
// Clipboard text (plain emoji — renders fine in messaging apps and social media):
//   🌍 CapitalsGame 2026-07-01 · Moderate
//   1. 🇫🇷 Paris — 🔴🟡🎯 +180
//   2. 🇧🇷 Brasília — 🔴🔴🔴🔴🔴🔴💀 +0
//   Total: 700/1000
//
// Display HTML uses flag-icons spans instead of emoji so flags render on Windows.
//
// Emoji key: 🔴 far  🟠 medium  🟡 close  🟢 very close  🎯 correct  💀 failed

import { renderFlag } from '../lib/flags.js';

const MAX_DISTANCE = 20000;

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

export function share(container, rounds, difficultyKey) {
  const date = new Date().toISOString().slice(0, 10);
  const total = rounds.reduce((s, r) => s + r.score, 0);
  const diffLabel = difficultyKey[0].toUpperCase() + difficultyKey.slice(1);

  // Plain text for clipboard — flag emojis work fine in chat/social media
  const clipLines = rounds.map((r, i) =>
    `${i + 1}. ${r.target.flag} ${r.target.capital} — ${roundEmoji(r.guesses, r.won)} +${r.score}`
  );
  const clipText = [`🌍 CapitalsGame ${date} · ${diffLabel}`, ...clipLines, `Total: ${total}/1000`].join('\n');

  // HTML lines for display — flags replaced with flag-icons spans for cross-browser rendering
  const htmlLines = rounds.map((r, i) =>
    `${i + 1}. ${renderFlag(r.target.flag)} ${r.target.capital} — ${roundEmoji(r.guesses, r.won)} +${r.score}`
  );
  const displayHtml = [
    `🌍 CapitalsGame ${date} · ${diffLabel}`,
    ...htmlLines,
    `Total: ${total}/1000`,
  ].join('\n');

  container.innerHTML = `
    <div class="share-card">
      <div class="share-text">${displayHtml}</div>
      <button id="copy-btn">Copy result</button>
    </div>
  `;
  container.querySelector('#copy-btn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(clipText);
    container.querySelector('#copy-btn').textContent = 'Copied!';
  });
}
