# Sudoku

Clean sudoku, as a PWA. Puzzles are generated on your device, so it works with no network connection at all.

**[▶ Play it here](https://deltarun28.github.io/the_port_chalmers_company/sudoku/)**

---

## How to play

- Tap a cell, then tap a digit (or press <kbd>1</kbd>–<kbd>9</kbd>). Tapping the same digit again clears it.
- **✏️ Notes** (or <kbd>Space</kbd>) switches the number pad to pencil marks. Placing a digit automatically rubs that pencil mark out of every cell in the same row, column and box.
- **↶ Undo** (<kbd>Ctrl</kbd>+<kbd>Z</kbd>), **⌫ Erase**, and **💡 Hint** — a hint fills in the correct digit, but it's counted, and a puzzle solved with hints won't set a best time.
- Cells that clash with another cell in the same row, column or box are flagged red as you go. Digits that are simply *wrong* aren't given away — that's the puzzle.
- Arrow keys move the selection.

An unfinished board is saved as you play, so closing the app and coming back later picks up exactly where you left off.

## Difficulty

Clue count alone is a bad measure of difficulty — a 30-clue grid can be a pushover. So each puzzle is also **rated by the hardest technique needed to solve it**, and the generator keeps dealing until the rating matches:

| Level  | Clues | Needs                                          |
|--------|-------|------------------------------------------------|
| Easy   | 42    | naked singles only                             |
| Medium | 34    | hidden singles                                 |
| Hard   | 30    | something beyond singles                       |
| Expert | 26    | something beyond singles, on a sparser grid    |

Every puzzle has **exactly one solution**, guaranteed by construction: the generator starts from a completed grid and only removes a clue if the grid still solves uniquely without it.

## Privacy

There is no server. Your in-progress board, best times and preferences are kept in your browser's `localStorage` and never leave the device. No ads, no analytics, no accounts, no third-party requests — the app makes no network requests at all once installed.

## Project structure

```
lib/solver.js     bitmask backtracking solver + solution counter (pure)
lib/generator.js  unique-solution puzzle generation + difficulty rating (pure)
lib/game.js       values, pencil marks, undo, hints, conflicts, save/resume
lib/stats.js      best times in localStorage
ui/grid.js        DOM rendering + selection highlighting
index.html        layout, theme, and the wiring between them
sw.js             precaches the app shell so it runs offline
```

`lib/` is pure logic with no DOM access, so it can be exercised directly under Node:

```bash
node --input-type=module -e "
  import { generate } from './lib/generator.js';
  import { countSolutions } from './lib/solver.js';
  const { puzzle, rating } = generate('hard');
  console.log(rating, countSolutions(puzzle, 2));   // hard 1
"
```

## Running locally

Needs to be served over HTTP (not opened as a `file://` URL), because of ES modules and the service worker:

```bash
python3 -m http.server 8765
# then open http://localhost:8765/sudoku/
```

## Regenerating the icons

```bash
python3 scripts/generate_icons.py   # needs Pillow
```
