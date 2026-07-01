const MAX_DISTANCE = 20000;

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
  const lines = rounds.map((r, i) =>
    `${i + 1}. ${r.target.flag} ${r.target.capital} — ${roundEmoji(r.guesses, r.won)} +${r.score}`
  );
  const text = [
    `🌍 CapitalsGame ${date} · ${diffLabel}`,
    ...lines,
    `Total: ${total}/1000`,
  ].join('\n');

  container.innerHTML = `
    <div class="share-card">
      <pre class="share-text">${text}</pre>
      <button id="copy-btn">Copy result</button>
    </div>
  `;
  container.querySelector('#copy-btn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(text);
    container.querySelector('#copy-btn').textContent = 'Copied!';
  });
}
