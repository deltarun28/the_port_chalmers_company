const MAX_DISTANCE = 20000;

export function share(container, guesses, status, target) {
  const date = new Date().toISOString().slice(0, 10);
  const emoji = guesses.map(g => {
    if (g.correct) return '🎯';
    const pct = 100 - (g.distance / MAX_DISTANCE) * 100;
    if (pct > 80) return '🟢';
    if (pct > 50) return '🟡';
    if (pct > 25) return '🟠';
    return '🔴';
  }).join('');

  const result = status === 'won'
    ? `${guesses.length}/${guesses.length + (6 - guesses.length)}`
    : 'X/6';

  const text = `🌍 CapitalsGame ${date}\n${result}\n${emoji}\n${target.flag} ${target.capital}`;

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
