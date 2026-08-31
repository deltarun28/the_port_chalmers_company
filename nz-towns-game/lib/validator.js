// Resolves a freetext string to a town object from towns.json.
// Called by input.js to turn a typed or autocompleted entry into a structured guess.
// Pure function — no state, no DOM.
//
// Match priority (first match wins, earlier = more specific):
//   1. Exact town or region name
//   2. Exact alias (region name, or the macron-free spelling)
//   3. Town name starts-with
//   4. Region name starts-with
//   5. Town or region name contains the query (broadest fallback)
//
// Every comparison runs through fold(), so "taupo", "Taupō" and "TAUPO" are one
// and the same query. Without that, the correct spelling of a third of the North
// Island's town names would be unreachable from a standard keyboard.

// Taupō → taupo. Unicode NFD splits a macronised vowel into the plain letter
// plus a combining mark; dropping category Mn leaves the plain letter.
export function fold(s) {
  return s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().trim();
}

export function validate(input, towns) {
  const q = fold(input);
  if (!q) return null;

  for (const t of towns) {
    if (fold(t.name) === q || fold(t.region) === q) return t;
  }

  for (const t of towns) {
    if (t.aliases.some(a => fold(a) === q)) return t;
  }

  for (const t of towns) {
    if (fold(t.name).startsWith(q)) return t;
  }

  for (const t of towns) {
    if (fold(t.region).startsWith(q)) return t;
  }

  for (const t of towns) {
    if (fold(t.name).includes(q) || fold(t.region).includes(q)) return t;
  }

  return null;
}
