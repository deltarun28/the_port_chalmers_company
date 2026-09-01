// Saves and restores an in-progress daily session.
//
// Without this, closing the tab loses all five rounds — which matters because
// this is a *daily* game people dip into across a day, not something played in
// one sitting.
//
// Only DAILY sessions are persisted. Random sessions are deliberately throwaway:
// their targets are picked at random rather than derived from the date, so
// restoring one would mean storing the towns themselves, and a player who hits
// "New game" is asking to discard what they had anyway.
//
// Nothing here throws. localStorage is unavailable in private windows on some
// browsers, and can throw on read as well as write when site data is blocked,
// so every access is guarded and failure degrades to "no saved session".

const KEY = 'nz-towns-session';

// Bump when the shape below changes. A stored session whose version does not
// match is discarded rather than migrated — it is at most one day of progress,
// and migration code would outlive its usefulness within a day.
const VERSION = 2;

// Local date, never toISOString() (UTC). The daily target is seeded from the
// local date, so a session saved at 11pm must still match at 11:01pm.
export function todayString(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function save({ difficulty, region, currentRound, roundResults, guesses }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      v: VERSION,
      date: todayString(),
      difficulty,
      region,
      currentRound,
      // Only the fields needed to rebuild state. Guesses are stored as names;
      // everything else about a town is re-read from towns.json on restore, so
      // a regenerated town list can never leave stale copies embedded here.
      roundResults: roundResults.map(r => ({
        target: r.target.name,
        guesses: r.guesses.map(g => g.name),
        score: r.score,
        won: r.won,
      })),
      guesses: guesses.map(g => g.name),
    }));
  } catch {
    // Storage full, disabled, or unavailable — the game plays on regardless.
  }
}

// Returns the stored session, or null if there is none, it is malformed, it is
// from an earlier version, or it does not match today's date and settings.
export function load({ difficulty, region }) {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    clear();
    return null;
  }

  if (data?.v !== VERSION) return null;
  // A session only makes sense against the settings it was played under: the
  // targets are derived from date + difficulty + region, so any mismatch means
  // this save describes a different set of towns.
  if (data.date !== todayString()) return null;
  if (data.difficulty !== difficulty) return null;
  if ((data.region ?? null) !== (region ?? null)) return null;
  if (!Array.isArray(data.roundResults) || !Array.isArray(data.guesses)) return null;

  return data;
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — a stale entry is harmless; it fails the date check.
  }
}
