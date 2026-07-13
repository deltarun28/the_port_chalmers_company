// Local records. Everything lives in this browser's localStorage and is never
// sent anywhere — there is no server to send it to.
//
// All reads are defensive: localStorage can be unavailable (private mode, or a
// browser configured to block storage), and the stored blob can be anything if
// a user has edited it. A game that can't remember your best time should still
// be playable, so every failure path degrades to "no stats".

const KEY = 'sudoku.stats.v1';

const EMPTY = () => ({ played: {}, won: {}, best: {} });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY();
    const parsed = JSON.parse(raw);
    return {
      played: parsed?.played ?? {},
      won: parsed?.won ?? {},
      best: parsed?.best ?? {},
    };
  } catch {
    return EMPTY();
  }
}

function save(stats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    // Storage full or blocked — the current game is unaffected, so carry on.
  }
}

export function recordStart(levelKey) {
  const stats = load();
  stats.played[levelKey] = (stats.played[levelKey] ?? 0) + 1;
  save(stats);
  return stats;
}

/**
 * Record a win. Returns { stats, isBest }.
 *
 * A puzzle finished with hints doesn't set a best time — it wasn't really your
 * solve. It still counts as a win.
 */
export function recordWin(levelKey, seconds, hints = 0) {
  const stats = load();
  stats.won[levelKey] = (stats.won[levelKey] ?? 0) + 1;

  const prev = stats.best[levelKey];
  const isBest = hints === 0 && (prev == null || seconds < prev);
  if (isBest) stats.best[levelKey] = seconds;

  save(stats);
  return { stats, isBest };
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — if we can't write, there was nothing stored anyway.
  }
}
