// Deterministic town selection — the same date always produces the same towns,
// so all players share the same daily session.
// Pure functions, no DOM, no side effects.
//
// getDailyTargets(towns, dateStr) → array of 5 towns, one per difficulty tier
// (1★ → 5★), ordered easy-to-hard.  The date seed is mixed with the tier number
// so each tier picks from a different position in its pool.

// Hashes `seed` to a stable index in [0, poolSize).
// Appending the tier to the date string ensures each tier gets an independent
// pick even when the date string alone maps to the same pool position.
function seededIndex(seed, poolSize) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % poolSize;
  }
  return Math.abs(hash);
}

export function getDailyTargets(towns, dateStr) {
  return [1, 2, 3, 4, 5].map(tier => {
    const pool = towns.filter(t => t.difficulty === tier);
    const idx = seededIndex(dateStr + tier, pool.length);
    return pool[idx];
  });
}
