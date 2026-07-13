# The Port Chalmers Company

> Something completely different.

**Live site:** https://deltarun28.github.io/the_port_chalmers_company/

---

## What is this?

This is a collaborative playground for **deltarun28** and **HughARVR** to experiment with GitHub, vibe code together, and figure out how collaboration works in practice — branching, pull requests, pushing and pulling, the lot.

No rules, no pressure. Just two people messing around and building things.

## What's here so far

- A Hello World landing page with a Port Chalmers night-sky theme
- **[Capitals](./capitals-game/)** — daily world-capitals guessing game on a 3D globe
- **[Minesweeper](./minesweeper/)** — the classic, three difficulties
- **[Sudoku](./sudoku/)** — puzzles generated on-device, with notes and hints

### The games

Each game is a self-contained folder, and each one is a **PWA**: install it to your home screen and it runs with no network connection.

They're all built the same way, deliberately — vanilla ES modules, no build step, no framework, no dependencies. Pure game logic lives in `lib/`, rendering in `ui/`, and a service worker precaches the app shell so it works offline.

**No ads. No analytics. No accounts. No server.** Scores, preferences and saved games live in your browser's `localStorage` and never leave your device — there is nowhere for them to be sent.

## How to contribute

1. Clone the repo: `git clone https://github.com/HughARVR/the_port_chalmers_company.git`
2. Make your changes
3. Commit and push — or open a pull request if you want feedback first
