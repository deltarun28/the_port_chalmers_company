// Game state machine. Pure logic — no DOM, no timers, no storage.
//
// Every mutating action (reveal, toggleFlag, chord) returns the flat indices of
// the cells whose appearance changed, so the view can repaint just those cells
// instead of the whole grid. A losing move returns every mine and every wrong
// flag as well, since those all become visible at once.
//
// The board itself does not exist until the first reveal — see board.js for why.

import { createBoard, neighbours, idx } from './board.js';

/** Difficulty presets. `mines` is an absolute count, not a density. */
export const LEVELS = {
  beginner:     { label: 'Beginner',     rows: 9,  cols: 9,  mines: 10 },
  intermediate: { label: 'Intermediate', rows: 16, cols: 16, mines: 40 },
  expert:       { label: 'Expert',       rows: 16, cols: 30, mines: 99 },
};

export function createGame(levelKey = 'beginner', rng = Math.random) {
  const level = LEVELS[levelKey];
  if (!level) throw new Error(`unknown level: ${levelKey}`);
  const { rows, cols, mines } = level;
  return {
    levelKey, rows, cols, mineCount: mines,
    status: 'ready',            // ready → playing → won | lost
    mines: null,                // Uint8Array, allocated on the first reveal
    adjacent: null,             // Uint8Array of neighbouring-mine counts
    revealed: new Uint8Array(rows * cols),
    flagged: new Uint8Array(rows * cols),
    revealedCount: 0,
    flagCount: 0,
    explodedAt: -1,             // the mine the player clicked, for highlighting
    rng,
  };
}

/** Mines remaining by the player's own count: total mines minus flags placed. */
export const minesRemaining = g => g.mineCount - g.flagCount;

const isOver = g => g.status === 'won' || g.status === 'lost';

/**
 * Reveal a cell. No-op on flagged or already-revealed cells, which is what lets
 * a flag protect against a misclick.
 */
export function reveal(game, r, c) {
  if (isOver(game)) return [];
  const i = idx(game.cols, r, c);
  if (game.revealed[i] || game.flagged[i]) return [];

  if (game.status === 'ready') {
    const board = createBoard(game.rows, game.cols, game.mineCount, r, c, game.rng);
    game.mines = board.mines;
    game.adjacent = board.adjacent;
    game.status = 'playing';
  }

  if (game.mines[i]) {
    game.explodedAt = i;
    return lose(game);
  }

  const changed = floodReveal(game, i);
  checkWin(game);
  return changed;
}

/**
 * Reveal `start`, and if it turns out to be blank (no adjacent mines) keep
 * spreading through its neighbours. Iterative — a recursive flood overflows the
 * stack on a large empty expert board.
 */
function floodReveal(game, start) {
  const { cols, rows } = game;
  const changed = [];
  const stack = [start];

  while (stack.length) {
    const i = stack.pop();
    if (game.revealed[i] || game.flagged[i]) continue;

    game.revealed[i] = 1;
    game.revealedCount++;
    changed.push(i);

    if (game.adjacent[i] !== 0) continue;   // a number stops the spread
    const r = Math.floor(i / cols);
    const c = i % cols;
    for (const nb of neighbours(rows, cols, r, c)) {
      if (!game.revealed[nb] && !game.flagged[nb]) stack.push(nb);
    }
  }
  return changed;
}

/** Cycle a cell between unflagged and flagged. Revealed cells can't be flagged. */
export function toggleFlag(game, r, c) {
  if (isOver(game)) return [];
  const i = idx(game.cols, r, c);
  if (game.revealed[i]) return [];

  if (game.flagged[i]) {
    game.flagged[i] = 0;
    game.flagCount--;
  } else {
    game.flagged[i] = 1;
    game.flagCount++;
  }
  return [i];
}

/**
 * Chord: click a revealed number whose flag count already matches it, and every
 * remaining neighbour opens at once. This is the standard speed move — and it
 * genuinely explodes if the flags are wrong, which is the point of it.
 */
export function chord(game, r, c) {
  if (game.status !== 'playing') return [];
  const i = idx(game.cols, r, c);
  if (!game.revealed[i] || game.adjacent[i] === 0) return [];

  const nbs = neighbours(game.rows, game.cols, r, c);
  const flags = nbs.reduce((n, nb) => n + game.flagged[nb], 0);
  if (flags !== game.adjacent[i]) return [];

  const changed = [];
  for (const nb of nbs) {
    if (game.flagged[nb] || game.revealed[nb]) continue;
    if (game.mines[nb]) {
      game.explodedAt = nb;
      return lose(game);
    }
    changed.push(...floodReveal(game, nb));
  }
  checkWin(game);
  return changed;
}

/** Every non-mine cell uncovered — flags are irrelevant to winning. */
function checkWin(game) {
  if (game.revealedCount === game.rows * game.cols - game.mineCount) {
    game.status = 'won';
    // Courtesy: auto-flag the mines the player never got round to marking, so a
    // won board reads as complete.
    for (let i = 0; i < game.mines.length; i++) {
      if (game.mines[i] && !game.flagged[i]) {
        game.flagged[i] = 1;
        game.flagCount++;
      }
    }
  }
}

/** Uncover every mine and expose flags that were placed on safe cells. */
function lose(game) {
  game.status = 'lost';
  const changed = [];
  for (let i = 0; i < game.mines.length; i++) {
    if (game.mines[i] && !game.flagged[i]) {
      game.revealed[i] = 1;
      changed.push(i);
    } else if (!game.mines[i] && game.flagged[i]) {
      changed.push(i);           // rendered as a struck-through wrong flag
    }
  }
  if (game.explodedAt >= 0) changed.push(game.explodedAt);
  return changed;
}
