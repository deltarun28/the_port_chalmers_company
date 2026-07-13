// Sudoku solver.
//
// A grid is a flat 81-length array of digits 1–9, with 0 for an empty cell,
// stored row-major. Candidate sets are kept as 9-bit masks (bit d-1 set means
// digit d is already used in that row / column / box), which makes "what can go
// here" a couple of ANDs rather than a scan of twenty peer cells.
//
// The search picks the most-constrained empty cell first (fewest candidates).
// That single heuristic is what keeps this fast enough to run inside the
// generator's uniqueness check, which solves a grid once per removed clue.

export const SIZE = 9;
export const CELLS = 81;

const ALL = 0b111111111;                       // all nine digits available

export const rowOf = i => (i / 9) | 0;
export const colOf = i => i % 9;
export const boxOf = i => ((i / 27) | 0) * 3 + (((i % 9) / 3) | 0);

/** The 20 cells that share a row, column or box with `i`. Precomputed once. */
export const PEERS = (() => {
  const peers = [];
  for (let i = 0; i < CELLS; i++) {
    const set = new Set();
    for (let j = 0; j < CELLS; j++) {
      if (j === i) continue;
      if (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i)) set.add(j);
    }
    peers.push([...set]);
  }
  return peers;
})();

/** Population count of a 9-bit candidate mask. */
function popcount(m) {
  let n = 0;
  while (m) { m &= m - 1; n++; }
  return n;
}

/** Build the row/col/box used-digit masks for a grid. */
function masks(grid) {
  const rows = new Int16Array(9);
  const cols = new Int16Array(9);
  const boxes = new Int16Array(9);
  for (let i = 0; i < CELLS; i++) {
    const d = grid[i];
    if (!d) continue;
    const bit = 1 << (d - 1);
    rows[rowOf(i)] |= bit;
    cols[colOf(i)] |= bit;
    boxes[boxOf(i)] |= bit;
  }
  return { rows, cols, boxes };
}

/** True if no unit contains the same digit twice. */
export function isValid(grid) {
  const rows = new Int16Array(9), cols = new Int16Array(9), boxes = new Int16Array(9);
  for (let i = 0; i < CELLS; i++) {
    const d = grid[i];
    if (!d) continue;
    const bit = 1 << (d - 1);
    if (rows[rowOf(i)] & bit || cols[colOf(i)] & bit || boxes[boxOf(i)] & bit) return false;
    rows[rowOf(i)] |= bit;
    cols[colOf(i)] |= bit;
    boxes[boxOf(i)] |= bit;
  }
  return true;
}

/**
 * Solve in place, depth-first, most-constrained cell first.
 *
 * `order` decides which candidate digit is tried first in each cell: pass a
 * shuffling function to generate a random solved grid, leave it out to solve
 * deterministically.
 *
 * Returns true if `grid` was completed (and mutated to the solution).
 */
export function solve(grid, order = null) {
  const { rows, cols, boxes } = masks(grid);

  const step = () => {
    // Most-constrained cell: fewest legal digits. A cell with none means this
    // branch is dead, and we can bail out without recursing at all.
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;

    for (let i = 0; i < CELLS; i++) {
      if (grid[i]) continue;
      const used = rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)];
      const mask = ALL & ~used;
      const count = popcount(mask);
      if (count === 0) return false;
      if (count < bestCount) {
        best = i; bestMask = mask; bestCount = count;
        if (count === 1) break;                // can't do better than forced
      }
    }
    if (best === -1) return true;              // no empty cells left: solved

    let digits = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << (d - 1))) digits.push(d);
    if (order) digits = order(digits);

    const r = rowOf(best), c = colOf(best), b = boxOf(best);
    for (const d of digits) {
      const bit = 1 << (d - 1);
      grid[best] = d;
      rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;

      if (step()) return true;

      grid[best] = 0;
      rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
    }
    return false;
  };

  return step();
}

/**
 * Count solutions, stopping as soon as `limit` is reached.
 *
 * The generator only ever needs to know "exactly one, or more than one", so it
 * calls this with limit 2 — counting every solution of a sparse grid would be
 * pointlessly expensive.
 */
export function countSolutions(grid, limit = 2) {
  const work = Int8Array.from(grid);
  const { rows, cols, boxes } = masks(work);
  let found = 0;

  const step = () => {
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < CELLS; i++) {
      if (work[i]) continue;
      const mask = ALL & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]);
      const count = popcount(mask);
      if (count === 0) return;
      if (count < bestCount) {
        best = i; bestMask = mask; bestCount = count;
        if (count === 1) break;
      }
    }
    if (best === -1) { found++; return; }

    const r = rowOf(best), c = colOf(best), b = boxOf(best);
    for (let d = 1; d <= 9 && found < limit; d++) {
      const bit = 1 << (d - 1);
      if (!(bestMask & bit)) continue;
      work[best] = d;
      rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;

      step();

      work[best] = 0;
      rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
    }
  };

  step();
  return found;
}

/** Candidate digits for an empty cell, given the current grid. */
export function candidates(grid, i) {
  if (grid[i]) return [];
  let used = 0;
  for (const p of PEERS[i]) if (grid[p]) used |= 1 << (grid[p] - 1);
  const out = [];
  for (let d = 1; d <= 9; d++) if (!(used & (1 << (d - 1)))) out.push(d);
  return out;
}
