# NZ Towns Game

A daily New Zealand towns guessing game. Five mystery towns per day — the same
five for every player. Guess each one in six attempts from distance clues.

**Play it here:** https://deltarun28.github.io/the_port_chalmers_company/nz-towns-game/

---

## How to play

- Type a town, city or region into the search box, or click a dot on the map
- After each guess you'll see how far away you were, and which way to go
- The heat bar shows how close you are — green means hot, red means cold
- Six attempts per town, five towns per session, 1000 points on the line
- Pick a region to play just that part of the country. Small regions make for
  short sessions — Nelson has one town in the list, so it is a single round.
- Your daily session is saved as you go, so you can close the tab and come back

Macrons are optional. Typing `taupo` finds Taupō, `whangarei` finds Whangārei.

Three difficulties, all with six guesses — what changes is how much help the map
gives you:

| | grid | distance rings | dots visible | bearing |
|---|---|---|---|---|
| Easy | yes | yes | yes | yes |
| Moderate | yes | no | yes | yes |
| Hard | no | no | no | no |

On Hard the dots are invisible but still clickable, so the map stays usable as
an input if you know where you're pointing.

## Project structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full breakdown of how the code is
organised, and for the reasoning behind the town list — which is the part of
this project with the most decisions baked into it.

## Running locally

Needs to be served over HTTP (not opened as a file) due to ES modules and data
fetching:

```bash
python3 -m http.server 8765
# then open http://localhost:8765/nz-towns-game/
```

## Regenerating the data

Neither script needs re-running unless you want to change the town list. Both
cache their downloads in `scripts/.cache/` (gitignored).

```bash
python3 scripts/generate_towns.py             # → data/towns.json
python3 scripts/generate_difficulty_scores.py # → adds difficulty tiers, in place
python3 scripts/generate_geography.py          # → data/geography.json
python3 scripts/generate_terrain.py            # → data/terrain.png
```

Run the difficulty script after the towns script — it edits `towns.json` in
place and will be overwritten otherwise.

## Tests

```bash
node --test lib/logic.test.js
```

Covers ring geometry, distance and bearing, macron-insensitive matching, and
daily/region target selection.
