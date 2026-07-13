# Minesweeper

The classic game, as a PWA. Install it to your home screen and it plays with no network connection at all.

**[▶ Play it here](https://deltarun28.github.io/the_port_chalmers_company/minesweeper/)**

---

## How to play

- Click a cell to uncover it. A number tells you how many mines touch that cell.
- **Right-click** or **long-press** a cell to flag a suspected mine.
- **Flag mode** (🚩 button, or <kbd>F</kbd>) makes a plain tap place a flag — easier on a phone.
- Click a **revealed number** whose flags already add up to it and every remaining neighbour opens at once ("chording"). Fast, and genuinely explosive if your flags are wrong.
- <kbd>N</kbd> starts a new board.

The first click is always safe: mines are laid out *after* it, avoiding the cell you clicked and its neighbours, so an opening move can never lose and always opens a region.

| Difficulty   | Board   | Mines |
|--------------|---------|-------|
| Beginner     | 9 × 9   | 10    |
| Intermediate | 16 × 16 | 40    |
| Expert       | 16 × 30 | 99    |

## Privacy

There is no server. Best times and preferences are kept in your browser's `localStorage` and never leave the device. No ads, no analytics, no accounts, no third-party requests — the app makes no network requests at all once installed.

## Project structure

```
lib/board.js    mine layout + neighbour counts (pure)
lib/game.js     reveal / flag / chord state machine, win + loss (pure)
lib/stats.js    best times in localStorage
ui/grid.js      DOM rendering + pointer input
index.html      layout, theme, and the wiring between them
sw.js           precaches the app shell so it runs offline
```

`lib/` is pure logic with no DOM access, so it can be exercised directly under Node.

## Running locally

Needs to be served over HTTP (not opened as a `file://` URL), because of ES modules and the service worker:

```bash
python3 -m http.server 8765
# then open http://localhost:8765/minesweeper/
```

## Regenerating the icons

```bash
python3 scripts/generate_icons.py   # needs Pillow
```
