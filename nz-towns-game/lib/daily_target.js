// Chooses the towns for one session.
// Pure functions, no DOM, no side effects.
//
// getDailyTargets(towns, dateStr, region, rounds)
//   → up to `rounds` towns, ordered easy to hard. The same date, region and
//     difficulty always produce the same towns, so every player shares a puzzle.
//
// getRandomTargets(towns, region, rounds)
//   → the same spread, chosen freshly each call for practice mode.
//
// --- How the spread works ---
//
// Towns are sorted by their difficulty score and cut into `rounds` contiguous
// bands, and one town is drawn from each band. Over the whole country the bands
// land almost exactly on the five difficulty tiers, because the tiers are equal
// percentile buckets to begin with — so a national session still runs 1★ to 5★.
//
// The reason for bands rather than "one town per tier" is region mode. Nelson
// has one town in the list and Gisborne three, and several regions have no town
// in some tier. Picking per tier breaks on those; banding degrades gracefully,
// giving a short session with the widest spread the region can support.

const DEFAULT_ROUNDS = 5;

// Hashes `seed` to a stable index in [0, poolSize).
function seededIndex(seed, poolSize) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % poolSize;
  }
  return Math.abs(hash);
}

function poolFor(towns, region) {
  return region ? towns.filter(t => t.region === region) : towns;
}

// Sorted easiest-first. The name is the tiebreaker so the order is total and
// stable — without it, two towns sharing a difficulty could swap places between
// engines and break the promise that a date always yields the same puzzle.
function byDifficulty(pool) {
  return [...pool].sort((a, b) =>
    a.difficulty - b.difficulty || a.name.localeCompare(b.name));
}

// Cuts the pool into `n` bands and hands each to `pick`, which chooses an index.
function bandPick(pool, rounds, pick) {
  const sorted = byDifficulty(pool);
  const n = Math.min(rounds, sorted.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const lo = Math.floor((i * sorted.length) / n);
    const hi = Math.max(Math.floor(((i + 1) * sorted.length) / n), lo + 1);
    const band = sorted.slice(lo, hi);
    out.push(band[pick(i, band.length)]);
  }
  return out;
}

export function getDailyTargets(towns, dateStr, region = null, rounds = DEFAULT_ROUNDS) {
  const pool = poolFor(towns, region);
  if (!pool.length) return [];
  // The region is mixed into the seed so that "Otago today" and "all of New
  // Zealand today" are different puzzles rather than the same one truncated.
  return bandPick(pool, rounds, (i, size) =>
    seededIndex(`${dateStr}|${region ?? 'all'}|${i}`, size));
}

export function getRandomTargets(towns, region = null, rounds = DEFAULT_ROUNDS) {
  const pool = poolFor(towns, region);
  if (!pool.length) return [];
  return bandPick(pool, rounds, (_i, size) => Math.floor(Math.random() * size));
}
