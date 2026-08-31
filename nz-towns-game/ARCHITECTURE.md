# Architecture — NZ Towns Guessing Game

## What this file is for

This is the first file to read before touching any part of the codebase.
It describes how every module fits together, what each one does, and — critically —
what each one does **not** do. Any single module can be read and edited in isolation
without needing to understand the rest of the project.

This game is a port of the sibling `capitals-game` in this repo. Where a decision
here differs from that one, the reason is recorded, because "the world version
did it the other way" is the most likely question a reader will have.

---

## The core idea

A daily guessing game. Five mystery New Zealand towns are chosen per day (the
same five for all players), one per difficulty tier. The player guesses towns —
by typing or clicking on a map — and after each guess is told the distance in km
between their guess and the target. The round ends when the player guesses
correctly or exhausts their six attempts. Five rounds make a session worth up to
1000 points.

---

## Folder structure

```
nz-towns-game/
│
├── ARCHITECTURE.md          ← you are here. read this first.
│
├── data/
│   ├── towns.json           ← source of truth for all town data (generated)
│   └── geography.json       ← coast, region borders and lakes (generated)
│
├── scripts/
│   ├── generate_towns.py             ← builds towns.json from Wikidata + GeoNames
│   ├── generate_difficulty_scores.py ← adds difficulty tiers to towns.json
│   └── generate_geography.py         ← builds geography.json from Natural Earth
│
├── lib/                     ← game logic (no DOM, no UI)
│   ├── constants.js         ← MAX_DISTANCE, shared by every distance-to-colour scale
│   ├── daily_target.js
│   ├── difficulty.js        ← difficulty config (maxGuesses, showGrid, showRings, showDots)
│   ├── distance.js          ← haversine; replaces the world game's distance table
│   ├── game.js
│   ├── ring_calculator.js   ← pure function: distance + guess# → ring inner/outer radius
│   └── validator.js         ← freetext → town, macron-insensitive
│
├── ui/                      ← everything the player sees and interacts with
│   ├── difficulty_picker.js ← difficulty selector buttons
│   ├── input.js             ← autocomplete text box
│   ├── map.js               ← flat SVG map of New Zealand
│   ├── results.js           ← guess history cards
│   └── share.js             ← end-of-session score card
│
├── index.html               ← wires everything together, no logic lives here
│
├── manifest.webmanifest     ← PWA manifest (name, icons, standalone display)
├── sw.js                    ← service worker: precache + offline (bump CACHE_VERSION on deploy)
└── icons/                   ← PWA icon set (192/512/maskable/apple-touch)
```

**PWA note:** the game is installable (Add to Home Screen / install prompt) and
plays offline. `sw.js` precaches the app shell and both data files. Unlike the
world game there are no cross-origin requests at all — no flag CDN — so the
service worker only has a same-origin path. When deploying any change to a
precached file, bump `CACHE_VERSION` in `sw.js` or returning players will keep
the old version. Install/service-worker features require HTTPS (or localhost).

---

## Layer 0 — Where the town list comes from

This is the part of the project with real decisions in it. `data/towns.json` is
generated, but it is not a straight dump of any single source, and it cannot be.

**GeoNames cannot tell a town from a suburb.** It files Remuera, Karori,
Papatoetoe and Onehunga under the same feature code as Gore and Blenheim, so no
filter over its own classification separates them. Its New Zealand population
column is also unreliable in both directions: Kaitaia, Pukekohe and Waipukurau
all sit at population 0, while Papatowai is listed at 6,593 against an actual
population near 20. Manukau City is still there at 362,000, eight years after
being merged into Auckland.

**Wikidata can tell a town from a suburb** — suburbs are classified as
neighbourhoods and never appear — **but its coverage has holes.** Around a third
of its New Zealand towns carry no population statement at all, and its class
list misses a dozen genuine towns outright.

So each source is used for what it is good at:

| | used for |
|---|---|
| Wikidata | **which** places are towns, and their coordinates |
| GeoNames | **how big** they are where Wikidata is silent; region assignment; coordinates for named exceptions |

Three hand-maintained lists in `generate_towns.py` close the remaining gaps.
None of them can be derived, which is exactly why they are written out by name:

- `ADDITIONAL_TOWNS` — real towns Wikidata's class list misses (Waiuku,
  Alexandra, Marton). In GeoNames these are indistinguishable from the suburbs
  alongside them: same feature code, same population band.
- `ALWAYS_INCLUDE` — recognisable places below the population cut. Population is
  a poor proxy for guessability: Kaikōura (~2,200) is far easier to place than
  plenty of 4,000-person dormitory towns, and Hokitika misses the threshold by
  eighty people.
- `EXCLUDE` / `BAD_GEONAMES` — the handful of suburbs and broken records that
  survive every other filter.

**To change which towns are in the game, edit those lists and the tunables above
them, then re-run the two scripts.** Do not hand-edit `towns.json`.

---

## Layer 1 — Data

### `data/towns.json`
The single source of truth. Generated; never edited by hand.

**Shape of one entry:**
```json
{
  "name": "Taupō",
  "region": "Waikato",
  "lat": -38.6875,
  "lng": 176.0708,
  "population": 25400,
  "aliases": ["Waikato", "Taupo"]
}
```

Plus a `difficulty` field (1–5) added by `generate_difficulty_scores.py`.

**Rules:**
- `population` may be `null` for small settlements neither source has a figure
  for. Anything reading it must tolerate that.
- `aliases` carries the region name and, for macronised names, the plain-ASCII
  spelling. All matching happens in `validator.js`, not here.
- There is no `flag` or `country` field — the world game's equivalent — and no
  distance table.

### `data/geography.json`
`{ bounds, coast, regions, lakes }`. Every ring is an array of `[lat, lng]`
pairs; `regions` entries are `{ name, rings }`.

Natural Earth **10m**, not the 50m the world game used. A single country can
afford the detail: the coast alone is ~4,100 points, a tenth of the world file
at five times the resolution. At 50m the Marlborough Sounds, Fiordland and Banks
Peninsula dissolve into smudges, and those are exactly the landmarks a player
reasons about. All three layers together are 213KB, about 63KB gzipped over the
wire.

`regions` are the 16 modern regional councils and unitary authorities — the same
names `towns.json` tags each town with, so the boundary a player sees on the map
is the one named on their guess card. Natural Earth's legal titles are shortened
to match (`Marlborough District` → `Marlborough`), and its uninhabited island
groups are dropped by filtering on authority type. These are deliberately *not*
the historical provinces, which were abolished in 1876 and would match nothing
else in the game.

Stored as raw coordinates rather than pre-projected SVG paths, so the projection
lives in one place (`ui/map.js`) and the framing can be retuned without
re-running the generator.

---

## Layer 2 — Build scripts

Each is run by hand and its output committed. None is imported by the game.
All three cache their downloads in `scripts/.cache/` (gitignored).

### `scripts/generate_towns.py`
Wikidata + GeoNames → `data/towns.json`. The filters and the three
hand-maintained lists are documented in the file's own docstring. Read that
before changing the town list.

### `scripts/generate_difficulty_scores.py`
Adds `difficulty` (1–5) to `towns.json`, **in place**. Run it after
`generate_towns.py` or it will be overwritten.

Difficulty here means something different from the world game. There, every
player roughly knows where every capital is, so difficulty was pure geographic
ambiguity. Here every town sits inside one 1,400km strip and triangulation is
easy for all of them — what varies is whether the player has heard of the place.
So the score is 65% obscurity (population rank) and 35% local density.

### `scripts/generate_geography.py`
Natural Earth 10m → `data/geography.json` (coast, region borders, lakes). Only
needs re-running to change the resolution or which features are included.

---

## Layer 3 — Game logic

These modules contain zero DOM manipulation and zero fetch calls.
They can be run and tested in Node.js with no browser.

### `lib/distance.js`
`distanceKm(a, b)` — haversine, rounded to whole kilometres.

The world game shipped a pre-computed `distances.json` because 195 capitals
produce 37,830 pairs. That does not scale: 187 towns are 17,391 pairs, and the
file would be megabytes of JSON parsed on every cold load to save work the CPU
does in microseconds. Computing on demand removed the file, the loading
skeleton, and the session-sequence guard `index.html` needed to stay responsive
while it downloaded.

### `lib/constants.js`
`MAX_DISTANCE` (1,400km — the length of the country). Every distance-to-colour
scale in the UI reads it from here so the heat bar and the share card cannot
drift apart. The world game hardcoded 20,000 in two files.

### `lib/daily_target.js`
Returns today's five targets, one per difficulty tier, seeded from the date.

**In:** towns array, date (YYYY-MM-DD string)
**Out:** array of 5 town objects, easy to hard

**Rules:** pure function, same date always returns the same towns, no randomness.

### `lib/validator.js`
Takes a raw string and returns the matching town object, or `null`.
Exports `fold()` alongside `validate()`.

**Rules:**
- Pure function. No game state, no UI, no side effects.
- `fold()` strips macrons and case. **Every comparison in this project goes
  through it.** Wikidata stores the correct orthography (Taupō, Whangārei,
  Ōtaki) and that is what the game displays, but nobody types a macron into a
  guess box. Without folding, a third of the North Island would be unreachable
  from a standard keyboard.
- Matching logic lives here and nowhere else.

### `lib/game.js`
Core state for one round. `createGame(target, difficulty)` → `{ submitGuess, getState }`.

**Rules:**
- No DOM. No fetch. Accepts and returns plain objects only.
- Distance comes from `distance.js` at call time.
- `maxAttempts` is driven by the selected difficulty via `difficulty.js`.

### `lib/difficulty.js`
Pure config. Three levels, each with `maxGuesses`, `showGrid`, `showRings`,
`showDots`. The world game's `globeView` flag is gone rather than left dead.

### `lib/ring_calculator.js`
`distanceKm`, `guessNumber` → `{ innerRadius, outerRadius, thickness }` in km.

Retuned for this scale: 6% of the distance, clamped to 4–80km. The world game's
2.5% clamped to 20–500km was tuned for guesses thousands of kilometres apart —
here a 300km guess and a 1,200km guess would both have pinned to the same 20km
floor.

### `lib/scoring.js`
Round outcome → points (0–200). Unchanged from the world game.

---

## Layer 4 — Inputs

Both input modules emit the **same event** — `onGuess(townObject)` — and are
otherwise completely independent. Either can be removed without affecting the
other.

### `ui/input.js`
Autocomplete text box. Filters `towns.json` as the player types, matching name,
region and aliases through `fold()`. Prefix matches are ranked above substring
matches so typing "wai" offers Waiuku before Ngāruawāhia.

**Rules:** does not know the target, does not know game state. Emits a guess and
resets.

### `ui/map.js`
Flat SVG map of New Zealand. One dot per town, Mercator projection over a fixed
NZ frame. Clicking a dot emits `onGuess(townObject)`.

**Why flat and not a globe:** the world game needed an orthographic canvas globe
because no flat projection shows every continent without wrecking the distances
the game runs on. One country 1,400km end to end has no such problem, and SVG
buys crisp text, real hit targets and free zooming. The whole globe renderer is
gone.

**Layers, in paint order:** ocean → grid → land fill → region borders → lakes →
coast stroke → rings → dots. The coast stroke is its own layer *on top of* the
borders rather than a stroke on the land fill, because region polygons and the
country outline come from two different Natural Earth files whose coastal edges
do not align to the pixel — stroking both would show a doubled, slightly offset
shoreline. Drawing the coast last covers the seam, so only the inland runs of
each border are visible.

**Lakes get their own fill token** (`--map-lake-fill`) rather than reusing
`--map-ocean`. In the dark theme the ocean is near-black and the land only a
shade lighter, so an ocean-filled lake disappears entirely.

**Rules:**
- Same `onGuess` contract as `input.js`.
- Knows nothing about the target town.
- Visual state is driven by the `guesses[]` passed into `update()` — the map does
  not manage it.
- Rings are drawn as **true geodesic circles**, not SVG `<circle>`s. Mercator
  scale grows toward the poles, so across NZ's 13° of latitude a Wellington
  kilometre is ~10% smaller on screen than an Invercargill one; a plain circle
  would be visibly wrong at the ends of the country.
- All line work carries `vector-effect="non-scaling-stroke"`, so the browser
  holds strokes at a constant screen width at any zoom. Only dot radii and label
  sizes are corrected by hand in `applyViewBox()`.
- **Labels grow as you zoom in.** Counter-scaling by the full zoom factor would
  hold them at a fixed screen size; `LABEL_ZOOM_EXP` (0.75) under-corrects on
  purpose, so on-screen size is proportional to `zoom^0.25` and a label is about
  2.2x larger at maximum zoom. Set it to 1 for fixed-size labels.
- On Hard the dots are at `opacity: 0` but still in the DOM and still clickable,
  so the map remains an input for a player who knows where they are pointing.

---

## Layer 5 — Output display

Read-only. These receive data and render it. They never modify game state.

### `ui/results.js`
Renders one card per guess: slot number, town name, region, distance, heat bar.
The world game showed a flag here; region takes that slot, being the one extra
fact that helps a player reason about where they just guessed.

### `ui/share.js`
Emoji score card for a completed session, copied to the clipboard.

---

## How the pieces connect

```
daily_target.js  ──→  game.js  ←──  validator.js  ←──  input.js
                          │                       ←──  map.js
                    ┌─────┴──────┐
                    ↓            ↓
               results.js    share.js
                    ↓
               map.js (colours guessed dots)
```

`index.html` is the only place that imports from multiple layers. It wires the
events together:
1. Player types or clicks → `input.js` or `map.js` emits `onGuess`
2. `index.html` passes the guess to `game.js`
3. `game.js` returns new state → passed to `results.js` and `map.js`
4. On session end → `share.js` is activated

---

## Rules for adding new features

- **New town, or a town you want gone?** Edit the lists in
  `generate_towns.py` and re-run it, then re-run
  `generate_difficulty_scores.py`. Never hand-edit `towns.json`.
- **New data field?** Add it in `generate_towns.py` and update this doc.
- **New input method?** Create a new file in `ui/`, emit `onGuess(townObject)`.
  Do not modify `game.js` or `validator.js`.
- **New display element?** Create a new file in `ui/`, accept data as a parameter.
  Do not reach into `game.js` directly.
- **New game mechanic?** Modify `game.js` only. The UI modules receive whatever
  state it returns.
- **Anything that compares two names** must go through `fold()` from
  `validator.js`. Macrons are the single most likely source of a silent bug in
  this codebase.
- **Keep files under ~150 lines.** `ui/map.js` is the deliberate exception; it
  is one coherent renderer and splitting it would spread the projection across
  files.
