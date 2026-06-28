export function createInput(container, capitals, onGuess) {
  container.innerHTML = `
    <div class="input-wrap">
      <input type="text" id="guess-input" placeholder="Type a capital or country…" autocomplete="off" />
      <ul id="suggestions"></ul>
    </div>
  `;

  const input = container.querySelector('#guess-input');
  const list = container.querySelector('#suggestions');
  let activeIndex = -1;

  function getSuggestions(q) {
    if (!q) return [];
    const lq = q.toLowerCase();
    return capitals.filter(c =>
      c.capital.toLowerCase().includes(lq) ||
      c.country.toLowerCase().includes(lq) ||
      c.aliases.some(a => a.toLowerCase().includes(lq))
    ).slice(0, 6);
  }

  function renderSuggestions(items) {
    list.innerHTML = items.map((c, i) =>
      `<li data-index="${i}">${c.flag} <strong>${c.capital}</strong> — ${c.country}</li>`
    ).join('');
    list.style.display = items.length ? 'block' : 'none';
    activeIndex = -1;
  }

  function commit(capital) {
    input.value = '';
    list.innerHTML = '';
    list.style.display = 'none';
    onGuess(capital);
  }

  input.addEventListener('input', () => {
    const matches = getSuggestions(input.value);
    renderSuggestions(matches);
  });

  input.addEventListener('keydown', e => {
    const items = list.querySelectorAll('li');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        const matches = getSuggestions(input.value);
        if (matches[activeIndex]) commit(matches[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      list.style.display = 'none';
    }
  });

  list.addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li) return;
    const matches = getSuggestions(input.value);
    const i = parseInt(li.dataset.index);
    if (matches[i]) commit(matches[i]);
  });

  document.addEventListener('click', e => {
    if (!container.contains(e.target)) list.style.display = 'none';
  });

  return {
    disable() { input.disabled = true; },
    enable() { input.disabled = false; },
    focus() { input.focus(); },
  };
}
