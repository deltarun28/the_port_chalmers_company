// Local records. Everything lives in this browser's localStorage and is never
// sent anywhere — there is no server to send it to.
//
// All reads are defensive: localStorage can be unavailable (private mode, or a
// browser configured to block storage), and the stored blob can be anything if
// a user has edited it. A game that can't remember your best time should still
// be playable, so a bad value is dropped on its own and the scores beside it are
// kept.

const KEY = 'minesweeper.stats.v1';

const EMPTY = () => ({ played: {}, won: {}, best: {} });

const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCount = v => Number.isInteger(v) && v >= 0;
const isSeconds = v => Number.isFinite(v) && v >= 0;

/** The entries of `record` whose values pass `valid`. Anything else is dropped. */
const keep = (record, valid) => (isRecord(record)
  ? Object.fromEntries(Object.entries(record).filter(([, v]) => valid(v)))
  : {});

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY();
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return EMPTY();
    return {
      played: keep(parsed.played, isCount),
      won: keep(parsed.won, isCount),
      best: keep(parsed.best, isSeconds),
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
 * Record a win. Returns { stats, isBest } so the view can celebrate a new
 * personal best. `seconds` is the elapsed play time.
 */
export function recordWin(levelKey, seconds) {
  const stats = load();
  stats.won[levelKey] = (stats.won[levelKey] ?? 0) + 1;
  const prev = stats.best[levelKey];
  const isBest = prev == null || seconds < prev;
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
