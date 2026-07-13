// Puzzle generation.
//
// Two properties matter, and they're separate:
//
//   1. Every puzzle has exactly one solution. Guaranteed by construction — we
//      start from a full solved grid and only remove a clue if the grid still
//      solves uniquely without it. A puzzle with two solutions is unfair in a
//      way players notice immediately, so this is never traded away.
//
//   2. Difficulty means something. Clue count alone is a poor proxy — a 30-clue
//      grid can be a pushover. So each candidate puzzle is also *rated* by the
//      hardest technique needed to crack it (see rate()), and we keep
//      regenerating until the rating matches the level the player asked for.

import { CELLS, solve, countSolutions, PEERS, rowOf, colOf, boxOf } from './solver.js';

/**
 * `clues` is the number of digits left on the board; `ratings` is the set of
 * technique-ratings acceptable for this level. Fewer clues *tends* to be
 * harder, but the rating is what actually decides.
 */
export const LEVELS = {
  easy:   { label: 'Easy',   clues: 42, ratings: ['easy'] },
  medium: { label: 'Medium', clues: 34, ratings: ['medium'] },
  hard:   { label: 'Hard',   clues: 30, ratings: ['hard'] },
  expert: { label: 'Expert', clues: 26, ratings: ['hard'] },
};

/** The 27 units: 9 rows, 9 columns, 9 boxes. */
const UNITS = (() => {
  const rows = Array.from({ length: 9 }, () => []);
  const cols = Array.from({ length: 9 }, () => []);
  const boxes = Array.from({ length: 9 }, () => []);
  for (let i = 0; i < CELLS; i++) {
    rows[rowOf(i)].push(i);
    cols[colOf(i)].push(i);
    boxes[boxOf(i)].push(i);
  }
  return [...rows, ...cols, ...boxes];
})();

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** A random complete, valid grid. */
export function solvedGrid(rng = Math.random) {
  const grid = new Int8Array(CELLS);
  solve(grid, digits => shuffle(digits.slice(), rng));
  return grid;
}

/** Candidate mask for cell `i` as an array of digits, from the live grid. */
function candidatesOf(grid, i) {
  let used = 0;
  for (const p of PEERS[i]) if (grid[p]) used |= 1 << (grid[p] - 1);
  const out = [];
  for (let d = 1; d <= 9; d++) if (!(used & (1 << (d - 1)))) out.push(d);
  return out;
}

/**
 * Rate a puzzle by the hardest technique needed to finish it, using only the
 * two deductions a human reaches for first:
 *
 *   naked single  — a cell has exactly one candidate left.
 *   hidden single — within a unit, a digit fits in exactly one cell.
 *
 *   'easy'   solvable with naked singles alone
 *   'medium' needs hidden singles too
 *   'hard'   needs something beyond both (pairs, pointing, or a guess)
 *
 * This deliberately stops short of modelling advanced strategies: everything
 * past singles lands in one 'hard' bucket, separated further by clue count.
 */
export function rate(puzzle) {
  const grid = Int8Array.from(puzzle);
  let usedHidden = false;

  for (;;) {
    let progress = false;

    for (let i = 0; i < CELLS; i++) {
      if (grid[i]) continue;
      const cands = candidatesOf(grid, i);
      if (cands.length === 0) return 'hard';     // dead end for a human solver
      if (cands.length === 1) {
        grid[i] = cands[0];
        progress = true;
      }
    }
    if (progress) continue;                      // exhaust naked singles first

    hidden:
    for (const unit of UNITS) {
      for (let d = 1; d <= 9; d++) {
        if (unit.some(i => grid[i] === d)) continue;
        const spots = unit.filter(i => !grid[i] && candidatesOf(grid, i).includes(d));
        if (spots.length === 1) {
          grid[spots[0]] = d;
          usedHidden = true;
          progress = true;
          break hidden;                          // re-run naked singles first
        }
      }
    }
    if (!progress) break;
  }

  const complete = grid.every(v => v !== 0);
  if (!complete) return 'hard';
  return usedHidden ? 'medium' : 'easy';
}

/**
 * Remove clues from `solved` down to `targetClues`, never breaking uniqueness.
 *
 * Cells are tried in random order and a removal is undone the moment it would
 * admit a second solution — which is why the result can end up with a few more
 * clues than asked for. That's fine; the rating check is the real gate.
 */
function dig(solved, targetClues, rng) {
  const puzzle = Int8Array.from(solved);
  let clues = CELLS;

  for (const i of shuffle([...Array(CELLS).keys()], rng)) {
    if (clues <= targetClues) break;
    const saved = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2) === 1) clues--;
    else puzzle[i] = saved;                      // that clue was load-bearing
  }
  return puzzle;
}

/**
 * Generate a puzzle for `levelKey`.
 *
 * Returns { puzzle, solution, rating, clues } — `puzzle` has 0 for blanks,
 * `solution` is the (unique) completed grid.
 *
 * The rating is not guaranteed on the first try, so we regenerate up to
 * `maxAttempts` times looking for a match and fall back to the closest puzzle
 * we saw. Falling back matters: a generator that can hang forever hunting a
 * perfect rating is worse than one that occasionally hands you a slightly easy
 * "hard" board. Every fallback is still a valid, uniquely-solvable puzzle.
 */
export function generate(levelKey = 'easy', rng = Math.random, maxAttempts = 25) {
  const level = LEVELS[levelKey];
  if (!level) throw new Error(`unknown level: ${levelKey}`);

  let fallback = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = solvedGrid(rng);
    const puzzle = dig(solution, level.clues, rng);
    const rating = rate(puzzle);
    const clues = puzzle.reduce((n, v) => n + (v ? 1 : 0), 0);
    const result = { puzzle, solution, rating, clues };

    if (level.ratings.includes(rating)) return result;
    // Keep the attempt that got closest to the requested clue count.
    if (!fallback || Math.abs(clues - level.clues) < Math.abs(fallback.clues - level.clues)) {
      fallback = result;
    }
  }
  return fallback;
}
