export function createDifficultyPicker(container, initial, onSelected) {
  const levels = [
    { key: 'easy',     label: '🟢 Easy'     },
    { key: 'moderate', label: '🟡 Moderate'  },
    { key: 'hard',     label: '🔴 Hard'      },
  ];

  container.innerHTML = levels.map(d =>
    `<button class="diff-btn${d.key === initial ? ' active' : ''}" data-key="${d.key}">${d.label}</button>`
  ).join('');

  container.addEventListener('click', e => {
    const btn = e.target.closest('.diff-btn');
    if (!btn) return;
    const key = btn.dataset.key;
    container.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b === btn));
    onSelected(key);
  });
}
