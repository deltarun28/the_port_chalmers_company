# Minesweeper: handoff

**Status (2026-10-22):** published to `main`, which GitHub Pages serves. All 30 automated checks pass. The Android test has not been run yet (§4, item 1).

**Branch:** the work was done on `minesweeper-offline-pwa-clean`, based on `main` at `de4f5c0`. It was fast-forwarded into `main` and pushed. The branch holds nothing that is not on `main`.

**Read first:** `OFFLINE_TEST.md` for the phone script. `AUDIT.md` for the findings and the fix list (fixes 1–16).

## 1. Architecture

Vanilla ES modules, no build, no runtime dependencies. Served as static files by GitHub Pages, which publishes `main`.

| File | Responsibility |
|---|---|
| `index.html` | Markup, theme tokens and layout (inline CSS, lines 19–273), and the wiring module (lines 310–516) |
| `lib/board.js` | Mine placement after the first click, keeping the clicked cell and its neighbours clear. Pure |
| `lib/game.js` | State machine: `reveal`, `toggleFlag`, `chord`, win and loss. Returns the changed cells. Pure |
| `lib/stats.js` | Best times and counts in `localStorage`. Each field is checked on its own, and bad entries are dropped |
| `ui/grid.js` | Renders cells and patches changed ones. Pointer input: mouse, touch and long press |
| `sw.js` | Precache of the app shell. Cache-first, from `minesweeper-v3` only |
| `tests/` | `logic.test.mjs` and `static.test.mjs` always run. `offline.e2e.test.mjs` runs in Chromium when `PLAYWRIGHT_CORE` is set. `release.json` holds the release values |

**Data model.** `game` holds `rows`, `cols`, `mineCount`, `status` (`ready` → `playing` → `won` or `lost`), and `Uint8Array` masks for `revealed` and `flagged`. `mines` and `adjacent` are allocated on the first reveal, so the first click is always safe.

**Timing.** Elapsed time is always computed from `startedAt`. The clock starts on the first reveal and stops when the page is hidden or the game ends.

**Input (`ui/grid.js`).**
- A press flags at most once. Whichever of the long-press timer or a `contextmenu` event comes first flags the cell.
- Only a primary touch or pen arms the long-press timer. A mouse never long-presses. A second finger cancels the pending press and arms nothing.
- Each `pointerdown` cancels any earlier timer before anything else.

**Storage.**
- `minesweeper.prefs.v1`: `{ level, light, flagMode }`. A stored value that is not an object is replaced with the defaults.
- `minesweeper.stats.v1`: `{ played, won, best }`. Each field is checked separately. A bad entry is dropped, valid entries are kept, and the next save writes back only the valid ones.

**Offline and updates.** Install precaches the shell. Every request is answered from `minesweeper-v3`, cache-first, so the page and its modules always come from the same deploy. A changed `sw.js` installs in the background. The launch that finds it still runs the cached copy, and the next launch gets the new one. This is the agreed behaviour. From v2 onward a deploy cannot mix versions. Players still on v1 get one mixed launch when v2 first arrives. The upgrade was tested and works (§3).

## 2. Completed

**Git.** The branch was rebuilt from `main`. Earlier work had sat on `minesweeper-offline-pwa`, which also held two nz-towns commits (`808575a`, `62050b6`). Those commits are on `border-colour` and were not carried over.

**Fixes.** The review codes (B1–B5) map to the fix numbers in `AUDIT.md`.

| Review | AUDIT fix | Change | Evidence |
|---|---|---|---|
| B1 | 10 | Multi-touch: each `pointerdown` cancels the pending timer. A second finger arms nothing. The timer keeps its own cell index | Browser test fails on the old code (counter 🚩 9), passes now |
| B2 | 11 | Mouse: long press is primary touch or pen only. A held click reveals | Browser test fails on the old code (one flag, no reveal), passes now |
| B3 | 12 | Stats: each field checked (`played` and `won` are counts, `best` is seconds). Bad entries dropped, valid kept | Unit and browser tests fail on the old code, pass now |
| B3 | 15 | Preferences: a value that is not an object is replaced | Browser test fails on the old code (junk keys), passes now |
| B4 | 14 | One flag per press, whichever of the timer or `contextmenu` comes first | Browser test fails on the old code (flag then unflag), passes now. Android timing still to confirm |
| B5 | 13 | Light `--text-muted` `#2d6fa8` → `#2a6499`. 4.25:1 → 4.96:1 | Static test (20 pairs, both themes) and browser test fail on the old code, pass now |
| – | 16 | Covered cells: dark `#21496f` → `#306896`, edge `#3a7cb8` → `#6fb1e3`. Light `#93bade` → `#5a8fc0`. Covered against revealed: 1.98:1 → 3.13:1 (dark), 1.92:1 → 3.24:1 (light) | Static test (3:1, both themes) fails on the old colours, passes now. Phone-width screenshots checked in both themes |

**Wording and colour.** The footer and README now say "Right-click (or long-press on touch) to flag". Two colour changes are visible: light muted text (fix 13) and covered cells (fix 16). The covered-cell change is deliberate, and the phone check (OFFLINE_TEST §6 and §10) should confirm it reads well.

**Tests.** 30 in total: 15 Node checks and 15 Chromium checks. All pass. Each new bug test was run against the previous code and failed for the reason it names. The preference test was checked the same way with the old `loadPrefs`. Two new tests passed on the old code: the wrong-shape stats test and the second-long-press test. They guard existing behaviour, so they are not evidence of a fix.

**Release.** `cacheVersion` is `v3`. v3 was published to restore caches that the old Study Quiz deleted. Its precached files are unchanged, so `precacheSha256` is still `93c92489…`. Any change to a precached file needs a new cache version and an updated `tests/release.json`.

## 3. Verification

| What | Result | Type |
|---|---|---|
| Full suite, Chromium 154, Node 24 | 30 of 30 pass | Automated, desktop |
| Node-only run (no browser) | 15 pass, 15 skipped | Automated, desktop |
| Syntax: `node --check` on every script, and the inline module | Pass | Automated |
| Upgrade from the deployed v1 build (`main`) to this build, then offline play. The old cache is removed, with no page errors | Pass | Automated, one-off script |
| Board at 390 px wide, dark and light, with revealed cells | Covered and revealed cells are clearly different in both themes | Screenshot, desktop emulation |
| Touch long press, tap after a long press, pan, two fingers | Pass | Automated, emulated touch |
| Live site after the push | Checked against the public URL, after the push | Automated, against the public URL |
| Android phone: touch, the covered-cell look, flight mode, install, update | **Not tested** | Needs the phone |

**Not verified.** Anything on Android. The assumption that `isPrimary` behaves on Android Chrome as on desktop. Storage eviction. `navigator.storage.persist()`. GitHub Pages cache headers. The real install prompt. How the covered-cell colours look on a real phone screen.

## 4. Outstanding issues

In priority order:

1. **Android test.** Run `OFFLINE_TEST.md` §6, §6a, §9 and §10 on the live build. This covers the two-finger checks (fix 10), the single flag per press (fix 14), the covered-cell look (fix 16), and the upgrade from v1.
2. **Hover on covered cells (O16).** Hover darkens a covered cell toward the revealed colour, and on touch it can stick after a tap. It is transient, but it lowers the contrast while the pointer is over the cell. Backlog item 2 or 3 can address it.
3. **Accessibility labels.** A revealed number is not read out, because the `aria-label` replaces the text (B6). Flagged state is not announced. Backlog item 3.
4. **Persistent storage.** `navigator.storage.persist()` is not requested. Call it and check the result on the phone before relying on it.
5. **`chord()` returns an incomplete change list** when a mine is hit part-way through (B7). No visible effect, because `finish()` repaints the board. Fix when `game.js` next changes.
6. **Abandoned games count as played.** `recordStart` runs on the first reveal. A restart or a difficulty change is a played game with no win. Backlog item 7 depends on the decision in §6.
7. **Static test gaps (T2).** The module list is hard-coded, and the import regex matches single quotes only. Nothing is missing today.
8. **Dead code and small items (O8, O12, R3).** `--rows` is set and never read. The return values of `recordStart` and `recordWin` are unused. `stats.clear()` is kept for the reset control. The manifest has no `id` (O12), so install identity depends on `start_url`. Adding `"id": "./"` keeps it the same.
9. **Release steps are manual (R6, O15).** `CACHE_VERSION` and `release.json` are updated by hand, and no CI runs the tests before deploy.
10. **No way to reset statistics.** Backlog item 1.
11. **Back link leaves the app's scope.** `← Port Chalmers` shows the browser's offline page when offline. This is expected (O13).
12. **Expert and Intermediate cells are 22 px.** Decided: keep them. A larger size means more panning on a phone (O6).
13. **Docs and tests are published.** `/minesweeper/docs/` and `/minesweeper/tests/` are public. This was approved, and nothing sensitive is in them.

## 5. Future development backlog

Approved for the backlog. None of these are implemented. The order is the recommended one, by player benefit, complexity and reliability. Revisit after the Android test.

| Rank | Item | Player benefit | Complexity | Reliability risk | Notes |
|---|---|---|---|---|---|
| 1 | **Reset statistics** | Medium. Players can clear shared-device or old scores | Low. Uses the existing `stats.clear()` with one confirmation | Low | Clears best times and counts only. Keeps preferences |
| 2 | **Better touch feedback** | High on phones. Shows a press, and the long-press wait | Low. A CSS press state, possibly a short progress cue | Low | Also fixes hover sticking after a tap (§4, item 2) |
| 3 | **Improved accessibility** | Medium to high. Screen readers hear numbers and results | Medium. Labels in `paint()`, and a polite live region on the banner. Covered-cell contrast is done (fix 16) | Low to medium | Labels and banner first |
| 4 | **Update-available notice** | Medium. Players learn a new version is ready | Medium. A `controllerchange` banner, guarded so a first visit does not show it | Medium. A reload mid-game loses the board, so offer it only when no game is in progress | Keeps cache-first updates. Do it after the Android update test |
| 5 | **Keyboard controls** | Medium on desktop, and essential for keyboard users | Medium. Arrow keys or roving focus in `grid.js` | Low to medium. Focus must not get lost | Also removes the 480 Tab stops on Expert |
| 6 | **Offline daily challenge** | High for returning players. Fits the collection | Medium. Move the seeded generator into `lib/`, choose a date basis, record "played today" | Medium. The same seed must give the same board on every device, so it needs tests | Date basis (§6) should match the Capitals game |
| 7 | **Per-difficulty statistics** | Medium | Medium. Count finished games only. A new stats key so old totals are not misread | Medium. Migrating existing `played` values | Needs the decision in §6 |
| 8 | **Optional no-guess mode** | High for some players | High. A logic solver, and generation time on phone CPUs | Medium. Bounded retries. Classic stays the default | Spike first. If Expert is too slow or rare, ship Intermediate first |

**Declined or deferred:** custom board size (breaks the phone layout), hint (changes what the game is), share text (low value), pause peek (no pause exists), stats export and import (a reset control covers the need), and moving CSS and JS out of `index.html` (GitHub Pages cannot send a CSP header, so the gain is small). Question marks (G1) and undo in practice mode (G3) stay in `AUDIT.md` as optional ideas.

## 6. Decisions

1. **Publishing.** Done. You approved publishing straight to `main` and skipping the Tailscale test route.
2. **Covered-cell edge.** Done (fix 16). Judge it on the phone.
3. **Stats semantics.** Still open. Count only finished games as played (recommended). It matters for backlog item 7, not for this build.
4. **Daily date basis.** Open. Decide when backlog item 6 is approved.
5. **Old branch and backup.** Approved for deletion once the push is verified. The old branch holds no commits that are not on `border-colour`. The scratchpad backup holds earlier drafts of these docs and the pre-cleanup files. Their content is in `main` or was deliberately corrected.

## 7. Working method (for the other PWA games)

1. Check Git status and history. Work on a branch from `main`, and never on a branch that carries unrelated commits.
2. Back up every uncommitted file with checksums before any branch change. Confirm the checksums afterwards.
3. Write each regression test first, and run it against the current code to watch it fail for the reason it names.
4. Make the smallest change that turns it green. Recompute the release hash and bump the cache version if precached files changed.
5. Run the full suite with the browser checks on. Run the upgrade test from the currently deployed build.
6. Check visuals at phone width in both themes. Push to `main` only after those checks pass, then check the live URL. Only a phone test counts as an Android pass.

## 8. Running the tests

```bash
cd software/port-chalmers-company/minesweeper
node --test "tests/*.test.mjs"                  # Node 21+; browser checks skip
PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
CHROME_PATH=/usr/bin/chromium \
node --test "tests/*.test.mjs"                  # all 30
```

Quote the glob. On Node 24, passing `tests/` as a directory fails. The Playwright install is not a project dependency. Browser checks run headless Chromium with background throttling off. Without those flags, `requestAnimationFrame` stalls here and Playwright's clicks time out.
