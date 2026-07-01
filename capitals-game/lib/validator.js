// Resolves a freetext string to a capital object from capitals.json.
// Called by input.js to turn a typed or autocompleted entry into a structured guess.
// Pure function — no state, no DOM, no imports.
//
// Match priority (first match wins, earlier = more specific):
//   1. Exact capital or country name
//   2. Exact alias (e.g. "USA" → United States, "UK" → United Kingdom)
//   3. Capital name starts-with
//   4. Country name starts-with
//   5. Capital or country name contains the query (broadest fallback)

export function validate(input, capitals) {
  const q = input.trim().toLowerCase();
  if (!q) return null;

  for (const c of capitals) {
    if (c.capital.toLowerCase() === q || c.country.toLowerCase() === q) return c;
  }

  for (const c of capitals) {
    if (c.aliases.some(a => a.toLowerCase() === q)) return c;
  }

  for (const c of capitals) {
    if (c.capital.toLowerCase().startsWith(q)) return c;
  }

  for (const c of capitals) {
    if (c.country.toLowerCase().startsWith(q)) return c;
  }

  for (const c of capitals) {
    if (c.capital.toLowerCase().includes(q) || c.country.toLowerCase().includes(q)) return c;
  }

  return null;
}
