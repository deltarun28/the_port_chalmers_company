// Board construction.
//
// Mines are placed *after* the first click, never before. This is what makes
// the opening move safe: the clicked cell and its eight neighbours are removed
// from the mine pool, so the first reveal can never explode and always opens a
// region rather than a lone number. Every mine layout is therefore generated
// against a known-safe cell, which is why createBoard takes one.

/** The eight offsets around a cell, in reading order. */
const OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];

/** Flat index for a row/column pair. Cells are stored row-major throughout. */
export const idx = (cols, r, c) => r * cols + c;

/** Indices of the cells surrounding (r, c), clipped to the board edges. */
export function neighbours(rows, cols, r, c) {
  const out = [];
  for (const [dr, dc] of OFFSETS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(idx(cols, nr, nc));
  }
  return out;
}

/**
 * Lay out `mineCount` mines, keeping (safeR, safeC) and its neighbours clear.
 *
 * Returns { mines: Uint8Array, adjacent: Uint8Array } — parallel row-major
 * arrays: 1/0 for a mine, and the count of mines touching each cell.
 *
 * `rng` is injectable so tests can pin a layout.
 */
export function createBoard(rows, cols, mineCount, safeR, safeC, rng = Math.random) {
  const total = rows * cols;
  const safe = new Set([idx(cols, safeR, safeC), ...neighbours(rows, cols, safeR, safeC)]);

  // With a full 3x3 opening reserved, a dense board can ask for more mines than
  // there are cells left. Shrink the reserved area to just the clicked cell
  // rather than fail — the click stays safe, it simply may not open a region.
  let pool = [];
  for (let i = 0; i < total; i++) if (!safe.has(i)) pool.push(i);
  if (pool.length < mineCount) {
    const only = idx(cols, safeR, safeC);
    pool = [];
    for (let i = 0; i < total; i++) if (i !== only) pool.push(i);
  }
  if (pool.length < mineCount) {
    throw new RangeError(`cannot place ${mineCount} mines on a ${rows}x${cols} board`);
  }

  // Partial Fisher-Yates: shuffle only the first mineCount slots.
  for (let i = 0; i < mineCount; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const mines = new Uint8Array(total);
  for (let i = 0; i < mineCount; i++) mines[pool[i]] = 1;

  const adjacent = new Uint8Array(total);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(cols, r, c);
      if (mines[i]) continue;
      let n = 0;
      for (const nb of neighbours(rows, cols, r, c)) n += mines[nb];
      adjacent[i] = n;
    }
  }

  return { mines, adjacent };
}
