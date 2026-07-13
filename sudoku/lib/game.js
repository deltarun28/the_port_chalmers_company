// Sudoku game state. Pure logic — no DOM, no timers.
//
// Three parallel 81-cell arrays make up a game:
//
//   givens   the clues, fixed for the life of the puzzle (0 where blank)
//   values   what's on the board now, givens included (0 where still blank)
//   notes    pencil marks as 9-bit masks (bit d-1 set = digit d pencilled in)
//
// Every mutation goes through a *move*: a snapshot of each cell it is about to
// touch, pushed onto the undo stack as one unit. A move is the granularity the
// player thinks in — placing a digit that also clears pencil marks from six
// peers is one action, and one undo has to put all seven cells back.

import { PEERS } from './solver.js';
import { generate, LEVELS } from './generator.js';

export { LEVELS };

export function newGame(levelKey = 'easy', rng = Math.random) {
  const { puzzle, solution, rating, clues } = generate(levelKey, rng);
  return fromPuzzle({ levelKey, puzzle, solution, rating, clues });
}

function fromPuzzle({ levelKey, puzzle, solution, rating, clues, values, notes, mistakes, hints, elapsed }) {
  return {
    levelKey, rating, clues,
    givens: Int8Array.from(puzzle),
    solution: Int8Array.from(solution),
    values: values ? Int8Array.from(values) : Int8Array.from(puzzle),
    notes: notes ? Uint16Array.from(notes) : new Uint16Array(81),
    history: [],                // undo stack; not persisted across reloads
    mistakes: mistakes ?? 0,
    hints: hints ?? 0,
    elapsed: elapsed ?? 0,      // seconds, updated by the view so it can resume
    status: 'playing',          // → 'won'
  };
}

export const isGiven = (game, i) => game.givens[i] !== 0;
export const hasNote = (game, i, d) => (game.notes[i] & (1 << (d - 1))) !== 0;
export const noteDigits = (game, i) => {
  const out = [];
  for (let d = 1; d <= 9; d++) if (hasNote(game, i, d)) out.push(d);
  return out;
};

/** Start a move: captures the mistake count so undo restores that too. */
const beginMove = game => ({ cells: [], mistakes: game.mistakes });

/** Snapshot cell `i`'s current contents into `move`, then write the new ones. */
function write(move, game, i, value, notes) {
  move.cells.push({ i, value: game.values[i], notes: game.notes[i] });
  game.values[i] = value;
  game.notes[i] = notes;
}

/** Push a completed move, and return the indices it touched. */
function finish(game, move) {
  if (move.cells.length) game.history.push(move);
  return move.cells.map(c => c.i);
}

/**
 * Place `digit` in cell `i`. Placing the digit that's already there clears it,
 * so the number pad doubles as an eraser.
 *
 * A digit that contradicts the solution counts as a mistake but is still
 * placed — the board shows you what you did rather than refusing the move.
 * Returns the indices whose display changed (the cell, plus any peers whose
 * pencil marks were tidied up).
 */
export function setValue(game, i, digit) {
  if (game.status !== 'playing' || isGiven(game, i)) return [];

  const move = beginMove(game);

  if (game.values[i] === digit) {               // tapping the same digit clears
    write(move, game, i, 0, game.notes[i]);
    return finish(game, move);
  }

  const wasWrong = game.values[i] !== 0 && game.values[i] !== game.solution[i];
  write(move, game, i, digit, 0);               // a value supersedes its notes
  if (digit !== game.solution[i] && !wasWrong) game.mistakes++;

  // Placing a digit makes the same pencil mark in every peer obsolete. Clearing
  // them is what players do by hand anyway, and doing it for them is the single
  // biggest quality-of-life win in a sudoku app.
  const bit = 1 << (digit - 1);
  for (const p of PEERS[i]) {
    if (game.notes[p] & bit) write(move, game, p, game.values[p], game.notes[p] & ~bit);
  }

  const changed = finish(game, move);
  if (isComplete(game)) game.status = 'won';
  return changed;
}

/** Toggle a pencil mark. Ignored on a cell that already holds a value. */
export function toggleNote(game, i, digit) {
  if (game.status !== 'playing' || isGiven(game, i) || game.values[i] !== 0) return [];
  const move = beginMove(game);
  write(move, game, i, 0, game.notes[i] ^ (1 << (digit - 1)));
  return finish(game, move);
}

/** Clear a cell's value and its pencil marks. */
export function erase(game, i) {
  if (game.status !== 'playing' || isGiven(game, i)) return [];
  if (game.values[i] === 0 && game.notes[i] === 0) return [];
  const move = beginMove(game);
  write(move, game, i, 0, 0);
  return finish(game, move);
}

/**
 * Reveal the correct digit for `i`. Counted, so a hint is never free — the
 * count is shown alongside the timer and saved with the result.
 */
export function hint(game, i) {
  if (game.status !== 'playing' || isGiven(game, i)) return [];
  if (game.values[i] === game.solution[i]) return [];
  game.hints++;
  return setValue(game, i, game.solution[i]);
}

/** Step back one move, restoring every cell it touched. */
export function undo(game) {
  if (game.status !== 'playing') return [];
  const move = game.history.pop();
  if (!move) return [];
  for (const c of move.cells) {
    game.values[c.i] = c.value;
    game.notes[c.i] = c.notes;
  }
  game.mistakes = move.mistakes;
  return move.cells.map(c => c.i);
}

/**
 * Cells that duplicate a digit inside a row, column or box.
 *
 * Note this flags *conflicts*, not *mistakes*: a digit can be wrong without
 * conflicting with anything on the board yet. Conflicts are shown live because
 * they're objectively broken; wrongness is only revealed at the end (or by the
 * mistake counter), so the puzzle stays a puzzle.
 */
export function conflicts(game) {
  const bad = new Set();
  for (let i = 0; i < 81; i++) {
    const d = game.values[i];
    if (!d) continue;
    for (const p of PEERS[i]) {
      if (game.values[p] === d) { bad.add(i); bad.add(p); }
    }
  }
  return bad;
}

/** How many of `digit` are already placed — used to grey out a finished digit. */
export function countPlaced(game, digit) {
  let n = 0;
  for (let i = 0; i < 81; i++) if (game.values[i] === digit) n++;
  return n;
}

export function isComplete(game) {
  for (let i = 0; i < 81; i++) if (game.values[i] !== game.solution[i]) return false;
  return true;
}

// ── Resume ─────────────────────────────────────────────────────────────────
// An unfinished game is stashed in localStorage so closing the app (or the
// phone killing it in the background) doesn't lose the board. It's plain local
// state: nothing is uploaded, and there's nowhere for it to be uploaded to.

const SAVE_KEY = 'sudoku.game.v1';

export function save(game) {
  if (!game || game.status !== 'playing') { clearSave(); return; }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      levelKey: game.levelKey,
      rating: game.rating,
      clues: game.clues,
      givens: [...game.givens],
      solution: [...game.solution],
      values: [...game.values],
      notes: [...game.notes],
      mistakes: game.mistakes,
      hints: game.hints,
      elapsed: game.elapsed,
    }));
  } catch { /* storage blocked — the game just won't survive a reload */ }
}

/** Restore a saved game, or null if there isn't a usable one. */
export function restore() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // Anything malformed (hand-edited, or written by an older version) is
    // discarded rather than half-loaded into a broken board.
    const ok = s && LEVELS[s.levelKey]
      && Array.isArray(s.givens) && s.givens.length === 81
      && Array.isArray(s.solution) && s.solution.length === 81
      && Array.isArray(s.values) && s.values.length === 81
      && Array.isArray(s.notes) && s.notes.length === 81;
    if (!ok) return null;

    return fromPuzzle({
      levelKey: s.levelKey,
      rating: s.rating,
      clues: s.clues,
      puzzle: s.givens,
      solution: s.solution,
      values: s.values,
      notes: s.notes,
      mistakes: s.mistakes,
      hints: s.hints,
      elapsed: s.elapsed,
    });
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing stored anyway */ }
}
