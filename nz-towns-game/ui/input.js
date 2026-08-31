// Autocomplete text input — the player's primary way to submit a guess.
// Filters towns.json as the user types and shows up to 6 suggestions.
// Committing a suggestion (click or Enter) calls onGuess(townObject) and
// clears the field.  This module does not know what the target town is.
//
// The returned control object (enable/disable/focus/clear) lets index.html
// disable the field while towns.json is loading and between rounds.
//
// Keyboard nav: ↑↓ move through suggestions, Enter commits, Escape dismisses.
// Matching is substring across town name, region name, and aliases, all folded
// through validator.fold() so a player can type "taupo" and reach "Taupō".
// Enter with no suggestion highlighted resolves the raw text via validate(),
// so plain typing + Enter submits a guess without touching the arrow keys.

import { validate, fold } from '../lib/validator.js';

export function createInput(container, towns, onGuess) {
  container.innerHTML = `
    <div class="input-wrap">
      <input type="text" id="guess-input" placeholder="Type a town, city or region…" autocomplete="off" />
      <ul id="suggestions"></ul>
    </div>
  `;

  const input = container.querySelector('#guess-input');
  const list = container.querySelector('#suggestions');
  let activeIndex = -1;

  function getSuggestions(q) {
    const lq = fold(q);
    if (!lq) return [];
    // Towns whose name starts with the query come first — typing "wai" should
    // offer Waiuku before it offers Ngāruawāhia.
    const starts = [], contains = [];
    for (const t of towns) {
      const name = fold(t.name);
      if (name.startsWith(lq)) starts.push(t);
      else if (name.includes(lq) || fold(t.region).includes(lq)
               || t.aliases.some(a => fold(a).includes(lq))) contains.push(t);
    }
    return [...starts, ...contains].slice(0, 6);
  }

  function renderSuggestions(items) {
    list.innerHTML = items.map((t, i) =>
      `<li data-index="${i}"><strong>${t.name}</strong> — ${t.region}</li>`
    ).join('');
    list.style.display = items.length ? 'block' : 'none';
    activeIndex = -1;
  }

  // Clear the field + dropdown and fire the guess event upstream
  function commit(town) {
    input.value = '';
    list.innerHTML = '';
    list.style.display = 'none';
    onGuess(town);
  }

  input.addEventListener('input', () => {
    renderSuggestions(getSuggestions(input.value));
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
      } else {
        // Nothing highlighted — resolve the typed text directly
        const hit = validate(input.value, towns);
        if (hit) commit(hit);
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

  // Dismiss dropdown when the player clicks anywhere outside the widget
  document.addEventListener('click', e => {
    if (!container.contains(e.target)) list.style.display = 'none';
  });

  return {
    disable() { input.disabled = true; },
    enable()  { input.disabled = false; },
    focus()   { input.focus(); },
    clear()   { input.value = ''; list.style.display = 'none'; },
  };
}
