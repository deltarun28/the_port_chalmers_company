// Renders the three difficulty buttons (Easy / Moderate / Hard) in the header
// and fires onSelected(key) whenever the player changes their choice.
// Does not know about the game, the map, or DIFFICULTIES config values —
// it only emits the selected key string.  index.html reads DIFFICULTIES[key]
// and persists the choice to localStorage.

export function createDifficultyPicker(container, initial, onSelected) {
  const levels = [
    { key: 'easy',     label: '🟢 Easy'     },
    { key: 'moderate', label: '🟡 Moderate'  },
    { key: 'hard',     label: '🔴 Hard'      },
  ];

  container.innerHTML = levels.map(d =>
    `<button class="diff-btn${d.key === initial ? ' active' : ''}" data-key="${d.key}">${d.label}</button>`
  ).join('');

  // Single delegated listener on the container rather than one per button
  container.addEventListener('click', e => {
    const btn = e.target.closest('.diff-btn');
    if (!btn) return;
    const key = btn.dataset.key;
    container.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b === btn));
    onSelected(key);
  });
}
