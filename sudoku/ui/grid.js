// Board rendering and cell selection.
//
// The whole 81-cell grid is repainted on every render rather than diffed. That
// looks wasteful next to Minesweeper's change-list approach, but selecting a
// cell re-highlights its whole row, column, box *and* every cell sharing its
// digit — so most renders touch a third of the board anyway, and 81 cells is
// far too few for the bookkeeping to pay for itself.
//
// Each cell's DOM is built once in mount() and only its classes and text change
// after that, which is what keeps the full repaint cheap.

import { PEERS, rowOf, colOf } from '../lib/solver.js';
import { conflicts, noteDigits, isGiven } from '../lib/game.js';

export function createGrid(container, { onSelect }) {
  let cells = [];

  container.addEventListener('click', e => {
    const cell = e.target.closest('.cell');
    if (cell) onSelect(Number(cell.dataset.i));
  });

  /** Build the 81 cells. Called once per puzzle. */
  function mount() {
    const frag = document.createDocumentFragment();
    cells = [];

    for (let i = 0; i < 81; i++) {
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.type = 'button';
      cell.dataset.i = i;

      // Thicker rules on the box boundaries — the 3x3 structure has to be
      // readable at a glance or the puzzle is unplayable.
      const r = rowOf(i), c = colOf(i);
      if (c % 3 === 0 && c !== 0) cell.classList.add('box-left');
      if (r % 3 === 0 && r !== 0) cell.classList.add('box-top');

      const val = document.createElement('span');
      val.className = 'val';

      const notes = document.createElement('span');
      notes.className = 'notes';
      for (let d = 1; d <= 9; d++) {
        const n = document.createElement('span');
        n.dataset.d = d;
        notes.appendChild(n);
      }

      cell.append(val, notes);
      cells.push(cell);
      frag.appendChild(cell);
    }
    container.replaceChildren(frag);
  }

  /**
   * Paint the board for `game`, with `selected` (or -1) highlighted.
   *
   * Highlights, in the order they stack:
   *   peer      shares a row, column or box with the selection
   *   same      holds the same digit as the selection (anywhere on the board)
   *   selected  the cell itself
   */
  function render(game, selected) {
    const bad = conflicts(game);
    const selDigit = selected >= 0 ? game.values[selected] : 0;
    const peers = selected >= 0 ? new Set(PEERS[selected]) : null;

    for (let i = 0; i < 81; i++) {
      const cell = cells[i];
      const value = game.values[i];

      const classes = ['cell'];
      if (colOf(i) % 3 === 0 && colOf(i) !== 0) classes.push('box-left');
      if (rowOf(i) % 3 === 0 && rowOf(i) !== 0) classes.push('box-top');

      if (isGiven(game, i)) classes.push('given');
      else if (value) classes.push('user');
      if (bad.has(i)) classes.push('conflict');

      if (peers?.has(i)) classes.push('peer');
      if (selDigit && value === selDigit) classes.push('same');
      if (i === selected) classes.push('selected');

      cell.className = classes.join(' ');
      cell.children[0].textContent = value || '';

      const noteEls = cell.children[1].children;
      const marks = value ? [] : noteDigits(game, i);
      for (let d = 1; d <= 9; d++) {
        noteEls[d - 1].textContent = marks.includes(d) ? String(d) : '';
      }
    }
  }

  return { mount, render };
}
