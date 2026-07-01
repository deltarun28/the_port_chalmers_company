// Deterministic capital selection — the same date string always produces
// the same capitals, so all players share the same daily session.
// Pure functions, no DOM, no side effects.
//
// getDailyTarget  — legacy single-capital API (kept for any callers)
// getDailyTargets — returns `count` unique capitals for a 5-round session

export function getDailyTarget(capitals, dateStr) {
  // djb2-style hash on the YYYY-MM-DD string → stable index into capitals[]
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return capitals[hash % capitals.length];
}

export function getDailyTargets(capitals, dateStr, count = 5) {
  // Seed the same hash, then drive an LCG to pull `count` unique indices.
  // LCG parameters (Knuth): next = (prev × 1664525 + 1013904223) mod 2³²
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  const used = new Set();
  const result = [];
  while (result.length < count) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    const idx = hash % capitals.length;
    if (!used.has(idx)) {
      used.add(idx);
      result.push(capitals[idx]);
    }
  }
  return result;
}
