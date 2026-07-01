export function getDailyTarget(capitals, dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return capitals[hash % capitals.length];
}

export function getDailyTargets(capitals, dateStr, count = 5) {
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
