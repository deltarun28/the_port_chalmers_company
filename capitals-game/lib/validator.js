export function validate(input, capitals) {
  const q = input.trim().toLowerCase();
  if (!q) return null;

  // exact match on capital or country name first
  for (const c of capitals) {
    if (c.capital.toLowerCase() === q || c.country.toLowerCase() === q) return c;
  }

  // alias match
  for (const c of capitals) {
    if (c.aliases.some(a => a.toLowerCase() === q)) return c;
  }

  // starts-with match on capital
  for (const c of capitals) {
    if (c.capital.toLowerCase().startsWith(q)) return c;
  }

  // starts-with match on country
  for (const c of capitals) {
    if (c.country.toLowerCase().startsWith(q)) return c;
  }

  // contains match
  for (const c of capitals) {
    if (c.capital.toLowerCase().includes(q) || c.country.toLowerCase().includes(q)) return c;
  }

  return null;
}
