// Grid rendering and input.
//
// The grid is built once per game and then patched cell-by-cell from the change
// lists the game logic returns — an expert board is 480 cells, and repainting
// all of them on every click is both wasteful and visibly janky mid-flood.
//
// Input is unified through pointer events so mouse and touch share one path:
//
//   tap / left click        reveal (or chord, on a revealed number)
//   right click             flag
//   long press (400ms)      flag — the touch equivalent of a right click
//   flag mode on            tap flags instead of revealing
//
// All listeners are delegated to the container, so there are three of them
// rather than three per cell.

const LONG_PRESS_MS = 400;

export function createGrid(container, { onReveal, onFlag, onChord }) {
  let game = null;
  let cells = [];
  let flagMode = false;

  // Set by a long press so the click that follows it doesn't also reveal.
  let suppressNextClick = false;
  let pressTimer = null;
  let pressedIndex = -1;

  const rc = i => [Math.floor(i / game.cols), i % game.cols];

  function cancelPress() {
    clearTimeout(pressTimer);
    pressTimer = null;
    pressedIndex = -1;
  }

  container.addEventListener('pointerdown', e => {
    const cell = e.target.closest('.cell');
    if (!cell || !game) return;
    // Only a primary press arms the long-press timer; a right click is already
    // a flag and shouldn't also fire one on release.
    if (e.button !== 0) return;

    pressedIndex = Number(cell.dataset.i);
    pressTimer = setTimeout(() => {
      suppressNextClick = true;
      const [r, c] = rc(pressedIndex);
      onFlag(r, c);
      cancelPress();
      if (navigator.vibrate) navigator.vibrate(15);
    }, LONG_PRESS_MS);
  });

  // A pointer that leaves the cell, or is cancelled by the browser taking over
  // for a scroll, must not turn into a flag.
  for (const evt of ['pointerup', 'pointercancel', 'pointerleave']) {
    container.addEventListener(evt, cancelPress);
  }

  container.addEventListener('click', e => {
    const cell = e.target.closest('.cell');
    if (!cell || !game) return;
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const i = Number(cell.dataset.i);
    const [r, c] = rc(i);

    if (game.revealed[i]) onChord(r, c);
    else if (flagMode) onFlag(r, c);
    else onReveal(r, c);
  });

  container.addEventListener('contextmenu', e => {
    const cell = e.target.closest('.cell');
    if (!cell || !game) return;
    e.preventDefault();               // no browser menu on a right-click flag
    const [r, c] = rc(Number(cell.dataset.i));
    onFlag(r, c);
  });

  /** Build a fresh grid of hidden cells for `g`. */
  function mount(g) {
    game = g;
    cells = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < g.rows * g.cols; i++) {
      const cell = document.createElement('button');
      cell.className = 'cell hidden';
      cell.dataset.i = i;
      cell.type = 'button';
      const [r, c] = [Math.floor(i / g.cols), i % g.cols];
      cell.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}`);
      cells.push(cell);
      frag.appendChild(cell);
    }
    container.style.setProperty('--cols', g.cols);
    container.style.setProperty('--rows', g.rows);
    container.replaceChildren(frag);
  }

  /** Repaint only the cells in `changed` (all of them if omitted). */
  function update(changed) {
    const list = changed ?? cells.map((_, i) => i);
    for (const i of list) paint(i);
  }

  function paint(i) {
    const cell = cells[i];
    if (!cell) return;
    const revealed = game.revealed[i];
    const flagged = game.flagged[i];
    const isMine = game.mines?.[i] === 1;

    cell.className = 'cell';
    cell.textContent = '';

    if (flagged) {
      // On a lost board a flag on a safe cell was a mistake — show it as one.
      const wrong = game.status === 'lost' && !isMine;
      cell.classList.add('hidden', 'flagged', ...(wrong ? ['wrong'] : []));
      cell.textContent = wrong ? '✗' : '🚩';
      return;
    }

    if (!revealed) {
      cell.classList.add('hidden');
      return;
    }

    cell.classList.add('revealed');
    if (isMine) {
      cell.classList.add('mine');
      if (i === game.explodedAt) cell.classList.add('exploded');
      cell.textContent = '💣';
      return;
    }

    const n = game.adjacent[i];
    if (n > 0) {
      cell.classList.add(`n${n}`);
      cell.textContent = String(n);
    }
  }

  return {
    mount,
    update,
    setFlagMode(on) { flagMode = on; },
  };
}
