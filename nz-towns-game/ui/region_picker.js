// Region selector — restricts a session to the towns of one region.
// Emits onSelected(regionName | null); null means the whole country.
//
// A <select> rather than buttons: there are seventeen options, and unlike the
// three difficulty levels they are a long flat list with no ordering the player
// needs to see at a glance.
//
// The options are derived from the town data, never hardcoded, so a regenerated
// towns.json can never leave this list describing regions that no longer exist.
// The count is shown against each region because it varies enormously — Waikato
// has 29 towns and Nelson one — and it sets the expectation that a small region
// is a short session rather than a broken one.

export function createRegionPicker(container, towns, initial, onSelected) {
  const counts = new Map();
  for (const t of towns) counts.set(t.region, (counts.get(t.region) ?? 0) + 1);
  const regions = [...counts.keys()].sort((a, b) => a.localeCompare(b));

  const opt = (value, label, selected) =>
    `<option value="${value}"${selected ? ' selected' : ''}>${label}</option>`;

  container.innerHTML = `
    <label class="region-label" for="region-select">Region</label>
    <select id="region-select" class="region-select">
      ${opt('', `All of New Zealand (${towns.length})`, !initial)}
      ${regions.map(r => opt(r, `${r} (${counts.get(r)})`, r === initial)).join('')}
    </select>
  `;

  const select = container.querySelector('#region-select');
  select.addEventListener('change', () => {
    // '' is the sentinel for the whole country; everything downstream expects
    // null rather than an empty string, so normalise it here at the boundary.
    onSelected(select.value || null);
  });
}
