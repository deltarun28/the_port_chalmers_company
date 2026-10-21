# Minesweeper: PWA audit

Date: 2026-10-22 · Published to `main`, which GitHub Pages serves. The work was done on `minesweeper-offline-pwa-clean`, based on `main` at `de4f5c0`. Updated after the Opus review and the second round of fixes (§2, items 10–16). The earlier branch `minesweeper-offline-pwa` (at `62050b6`) held two unrelated nz-towns commits. Its commits are all on `border-colour`, so it holds no work of its own.

This is the pilot audit for the Port Chalmers PWA collection. It covers offline reliability first, then a lightweight code and usability review. Items marked **Fixed** are changed on the branch. Items marked **Outstanding** are documented only, as the brief asked.

---

## 1. Overview

| | |
|---|---|
| Type | Single-page PWA. Vanilla ES modules, no build step, no framework |
| Runtime dependencies | None. Pillow is needed only for `scripts/generate_icons.py` |
| Size | `index.html` 519 lines (inline CSS 19–273, inline module 310–516); `lib/` ≈ 320 lines of pure logic; `ui/grid.js` 169; `sw.js` 80 |
| Hosting | Static files in `software/port-chalmers-company`, served by GitHub Pages at `https://deltarun28.github.io/the_port_chalmers_company/minesweeper/` (pattern A in `software/PWA-HOSTING.md`) |
| Network use | None after install. No fonts, scripts, analytics or APIs. Checked by a test |
| Storage | `localStorage` only: `minesweeper.prefs.v1` (level, theme, flag mode) and `minesweeper.stats.v1` (played, won and best time per level) |
| Offline model | Service worker precaches 11 entries (the app shell). Cache-first, single versioned cache (`minesweeper-v2`) |
| Tests before this work | None |
| Tests after this work | 30: 15 Node checks that always run, 15 Chromium checks that run when a Playwright install is provided. All 30 pass |

### Layout

```
index.html         markup, inline CSS (theme tokens), inline module that wires the UI
lib/board.js       mine layout and neighbour counts (pure)
lib/game.js        reveal, flag, chord, win and loss state machine (pure)
lib/stats.js       best times and counts in localStorage
ui/grid.js         DOM rendering and pointer input (touch, mouse, long press)
sw.js              precache and offline fetch handling
manifest.webmanifest, icons/   install metadata
tests/             node:test checks and Playwright browser checks
docs/              this audit, the Android test script and the Opus handoff
```

---

## 2. Problems identified and fixed

| # | Problem | How it was found | Fix | Status |
|---|---|---|---|---|
| 1 | On a **won** board the mines were not shown as flagged. The counter read `🚩 0`, but the mines still looked covered | Browser test with a fixed mine layout: 0 flagged cells against 10 expected. Failed on the original code | `finish()` repaints the whole board once the game ends. The win auto-flags mines that are not in the move's change list | Fixed. Test passes |
| 2 | **Expert and Intermediate boards could not be scrolled by touch.** The grid had `touch-action: none`, which blocks the browser pan. At 390 px width the Expert board is 364 px wider than its scroll box, and Intermediate is 34 px wider. A touch-drag that started on a cell moved the scroll position from 0 to 0 | Chromium touch emulation (`isMobile`, 390 × 844) | `touch-action: pan-x pan-y`. Panning is allowed, and pinch and double-tap zoom stay blocked on the board. A pan cancels a pending long press, so a drag does not flag | Fixed in emulation (scroll 0 → 156 px). **Needs Android confirmation** |
| 3 | A stored level preference that names an `Object.prototype` key (for example `"constructor"`) produced a board with **zero cells and no error**. Only clearing site data recovered it | Probe after setting the pref in `localStorage` | `Object.hasOwn(LEVELS, prefs.level)` | Fixed. Test passes |
| 4 | After a long press, the suppression flag for the following click is only cleared by a click. Touch browsers do not always send that click after a long press, so the **next tap could be ignored** | Code reading. Not reproducible in emulation, because Chromium does send the click | Every `pointerdown` clears the suppression flag | Defensive. **Needs Android confirmation** |
| 5 | Android can fire `contextmenu` for a long press after the long-press timer has flagged the cell. The handler then toggled the flag straight back off | Code reading. Not reproducible in emulation, which fires no `contextmenu` on long press | `contextmenu` does nothing while a long press's suppression is active | Defensive. **Needs Android confirmation** |
| 6 | Navigations were network-first while assets were cache-first. On the first online launch after a deploy, the new `index.html` could run with the old cached modules | Code reading | Navigations are answered from the same versioned cache as the modules, so the page and its modules always come from one deploy | Fixed. The update test passes. The mixed-version race itself was not reproduced |
| 7 | Precaching used the browser's default cache mode. A copy in the HTTP cache could be stored as the new version | Code reading | Precache requests use `cache: 'reload'` | Fixed. Not reproducible in headless Chromium |
| 8 | Nothing stopped a precached file changing without a `CACHE_VERSION` bump, which would leave returning players on old files | Code reading | Release guard: `tests/static.test.mjs` hashes the precached files and checks them against `tests/release.json` | Fixed |
| 9 | Offline behaviour had never been tested | None existed | Browser test: online visit, then `setOffline(true)`, reload, play. Also a simulated deploy: old cache replaced and offline play still works afterwards | Added. Passes |
| 10 | A second finger on the board left the first long-press timer running. It later flagged index -1, so the mine counter drifted by one with no flag shown. Present in the original code | Browser test with two touch points. The counter read 🚩 9, where 10 is correct | Every `pointerdown` cancels the pending timer first. Only the primary pointer arms a timer, so a second finger never does | Fixed. The regression test fails on the previous code |
| 11 | A held left mouse click over 400 ms flagged the cell instead of revealing it. The timer ignored pointer type. Present in the original code | Browser test: a 700 ms mouse hold gave one flag and no reveal | Long press arms only for a primary touch or pen. A mouse never long-presses, and right-click still flags | Fixed. The regression test fails on the previous code |
| 12 | Malformed saved statistics froze the board. A well-formed value of the wrong type, such as `{"played":"x"}`, made the first reveal throw, and the board stopped updating. Present in the original code | Browser test, plus a unit test of the stats load path | Each stats field is checked on its own. A bad entry is dropped and valid scores are kept. The next save writes back only the valid entries | Fixed. Regression tests (unit and browser) |
| 13 | Light-theme muted text was 4.25:1 on the light background, below the WCAG AA minimum of 4.5:1. The footer and the home link use it | Contrast of 20 text pairs in both themes (40 checks). Only this pair fails | `--text-muted` in the light theme is `#2a6499` (4.96:1). The browser test reads the colour after the 0.25 s fade has finished | Fixed. Static and browser tests |
| 14 | If a context menu arrived before the long-press timer, one press could flag a cell and then unflag it. Android may send that event | Browser test: a synthetic contextmenu 100 ms into a touch | Each press flags at most once, whichever of the timer or the context menu comes first | Fixed in emulation. Android timing still to be confirmed |
| 15 | A stored preference that is not an object, such as `"oops"`, was spread into character keys on the next save | Browser test | A non-object preference is replaced by the defaults | Fixed |
| 16 | Covered and revealed cells differed by only 1.98:1 (dark) and 1.92:1 (light), below the 3:1 non-text guideline (WCAG 1.4.11). A covered cell must be identifiable | Static test on the palette, in both themes | Covered fill `#21496f` → `#306896` and edge `#3a7cb8` → `#6fb1e3` (dark, 3.13:1). Covered fill `#93bade` → `#5a8fc0` (light, 3.24:1). Chosen with margin above 3:1. Checked on phone-width screenshots | Fixed. The look changed on purpose. Hover still lowers the contrast (O16) |

Fixes 4, 5 and 2 changed touch behaviour, which is what the phone will exercise. They are listed in `OFFLINE_TEST.md` as manual checks. Fixes 10, 11 and 14 changed touch and mouse input again. Their phone checks are in `OFFLINE_TEST.md` §6a.

---

## 3. Outstanding issues

Priority: **P1** affects reliability on the phone. **P2** is noticeable. **P3** is polish or maintenance. Complexity is S (under an hour), M (a few hours) or L (a day or more).

| ID | Pri | Issue | Evidence | Complexity | Expected benefit |
|---|---|---|---|---|---|
| O1 | P1 | Fixes 2, 4 and 5 are unconfirmed on a real Android phone | §2 | S | High. Blocks sign-off |
| O2 | P2 | Storage is not persisted. Android's best-effort storage can be evicted under pressure, which would take the offline cache and the best times with it | `navigator.storage.persist()` is not requested. Browsers differ in how they grant it, so this needs checking on the phone | S | Medium |
| O3 | P2 | No way to reset or back up best times. Reinstalling or clearing site data erases them. `stats.clear()` exists but nothing calls it | `lib/stats.js:57` | S–M | Medium |
| O4 | P2 | No update signal. A deployed change arrives silently on the second launch after the deploy | Designed behaviour (see `sw.js` header). Nothing tells the player | S | Medium |
| O5 | P2 | Accessibility gaps. The cell `aria-label` is set once and replaces the cell's text, so a revealed number is never read out. That is worse than stale position labels. Flagged state is not announced. The timer, mine counter and result banner are not live regions, so a win or loss is not announced. No arrow-key movement; Expert has 480 tab stops | `ui/grid.js:101`, `paint()`, `index.html` status elements | M | Medium |
| O6 | P3 | Touch targets. At 390 px, Intermediate cells are 22.4 px and Expert cells 22 px. With the 2 px gap these pass WCAG 2.2 SC 2.5.8 under its spacing exception (checked by hand; confirm with a tool). They are still below the 48 dp Android guidance, which is a usability trade-off. A 24 px Intermediate board is about 422 px wide, against about 362 px available | Measured with CDP emulation. The CSS floor is `max(22px, …)` at line 183 | M | Medium. Decided: keep 22 px |
| O7 | P3 | `index.html` holds about 250 lines of CSS and 200 lines of script inline. This blocks a Content-Security-Policy and makes the UI logic hard to test | `index.html:19–273`, `index.html:310–516` | M | Medium |
| O8 | P3 | Dead code: `--rows` is set in `ui/grid.js:106` and never read. `stats.clear()` is unused, but it stays for the reset control. The `stats` value returned by `recordStart` and `recordWin` is never used | grep | S | Low |
| O9 | Fixed | Stored values were not validated. Each stats field is now checked on its own, and a bad entry is dropped while valid scores are kept (fix 12). Preferences that are not an object are replaced (fix 15) | `lib/stats.js`, `index.html` `loadPrefs()` | S | Low |
| O10 | Closed | An over-flagged board shows a negative mine count (`🚩 -2`). This matches the classic game. Decision: keep it as it is | `lib/game.js:38` | – | – |
| O11 | P3 | Transitions are not disabled for `prefers-reduced-motion` (0.15–0.25 s on background and colour) | `index.html` CSS | S | Low |
| O12 | P3 | The manifest has no `id`. Install identity falls back to `start_url`, which works until that URL changes | `manifest.webmanifest` | S | Low |
| O13 | P3 | The "← Port Chalmers" link is outside the app's service-worker scope. Offline, it shows the browser's own error page. That is expected, but nothing explains it | `index.html:279` | S | Low |
| O14 | P3 | Version bump and hash are copied by hand into `tests/release.json` | Release guard | S–M | Medium |
| O15 | P3 | No CI. Pages publishes the folder as it is, so nothing runs the tests before a deploy | `software/port-chalmers-company` has no workflow | S–M | Medium |
| O16 | P3 | Hovering a covered cell darkens it toward the revealed colour. Hover is transient and mostly desktop-only, but it lowers the covered-cell contrast while the pointer is over the cell | `index.html`, `.cell.hidden:hover` | S | Low |

**Not verified:** GitHub Pages' HTTP caching headers (not inspected); storage eviction; a real install prompt; flight mode; and Android behaviour of everything in O1 and of fixes 10, 11, 14 and 16 on a phone screen. The activate prefix filter is checked by reading the other games' `sw.js` files. Their prefixes are `capitals-`, `nz-towns-` and `sudoku-`, so none overlaps `minesweeper-`.

---

## 4. Recommended code improvements

| ID | Pri | Recommendation | Complexity | Benefit |
|---|---|---|---|---|
| R1 | P3 | Move the inline CSS to `styles.css` and the module to `ui/app.js`. Update the precache list and the release hash in the same change. Deferred: GitHub Pages cannot send a CSP header, and the app loads no third-party script | M | Low for now |
| R2 | P2 | Update each cell's `aria-label` in `paint()`, and give the status readouts and banner `aria-live` (see O5) | S | Medium |
| R3 | P3 | Make one `renderCounter()` function for the mine readout. It is currently written in three places (`applyMove`, `finish`, `newGame`) | S | Low |
| R4 | P3 | Remove the dead code listed in O8 | S | Low |
| R5 | Done | Stored preferences and stats are validated per field (fixes 12 and 15) | S | Low |
| R6 | P3 | Give the release step a script that writes `CACHE_VERSION` and `release.json` together, or move to a build step that stamps the version | S–M | Medium |

---

## 5. Potential gameplay enhancements

These change how the existing game plays. None are implemented. Backlog priorities are in `OPUS_HANDOFF.md` §5.

| ID | Enhancement | Priority | Complexity | Benefit |
|---|---|---|---|---|
| G1 | **Optional question-mark state** in the flag cycle (flag → ? → blank). Off by default, so the current flow is unchanged | P3 | S | Medium for players who rely on it |
| G2 | **No-guess boards.** Regenerate a layout until it can be solved by logic alone. Removes forced guesses, which makes the game fairer and is a distinct mode in its own right | P2 | M–L | High |
| G3 | **Undo last move** in a practice mode only. Undo on a scored game invites save-scumming, so it must not touch best times | P3 | M | Medium |
| G4 | **Keyboard cursor.** Arrow keys move, Enter reveals, F flags. This also fixes O5's tab-stop problem | P2 | M | Medium, and high for desktop use |
| G5 | **Withdrawn.** The game has no pause, so there is nothing to peek through. The timer already stops when the page is hidden | – | – | – |
| G6 | **Haptic feedback on explosion** (`navigator.vibrate`). A long press already vibrates | P3 | S | Low |
| G7 | **Per-difficulty stats:** win rate, streak and average time, shown in the footer or a small panel | P3 | M | Medium |

---

## 6. Suggested new features

| ID | Feature | Priority | Complexity | Benefit | Notes |
|---|---|---|---|---|---|
| F1 | **Daily seeded board**, the same for everyone on a given date, like the Capitals game's daily | P2 | M | High for the collection | Needs a seeded RNG. `tests/logic.test.mjs` already uses one |
| F2 | **Stats export and import** as a JSON file | P2 | S–M | High | Fixes O3's backup gap without an account |
| F3 | **Custom board size** with a sensible cap so it fits a phone | P3 | M | Medium | Interacts with O6 |
| F4 | **Share a result** as text (difficulty, time, a grid of flags and numbers) | P3 | S | Low–medium | No server needed |
| F5 | **Hint**, costing time | P3 | S | Low | Easy to abuse. Decide the penalty first |

Decisions: F1 and F2 are backlog items, and F2 is deferred in favour of a reset control. F3, F4 and F5 are not planned.

---

## 7. How this was verified

| Area | Method | Result |
|---|---|---|
| Offline launch and play | Chromium 154 (Playwright-core 1.60). Online visit, wait for the controller, `setOffline(true)`, reload, click | Pass |
| Only local requests | Every request is recorded during the offline test | Pass |
| Win repaint, prefs, touch pan, right click | Browser tests | Pass after the fixes. Fails on the original code (win, pan, prefs) |
| Long press | Chromium touch emulation | Passes before and after. A regression check, not evidence of the fix |
| Update path | The server root is swapped from a copy with `minesweeper-v0` to the current build | Pass. Old cache removed, new cache serves offline |
| Precache completeness | Static: every file referenced by HTML, modules and manifest is precached and exists | Pass |
| Manifest and icons | Static: display mode, 192 and 512 icons present, PNG sizes match the declared sizes | Pass |
| Logic | Node: first click safe across 50 seeds, win and auto-flag, losing reveal, best times, corrupt and wrong-shape storage | Pass |
| Syntax | `node --check` on every script, and on the inline module in `index.html` | Pass |
| Multi-touch | Browser: two touch points on the board, then a tap | Pass after fix 10. Fails on the previous code (counter 🚩 9) |
| Mouse | Browser: a 700 ms held click | Pass after fix 11. Fails on the previous code (one flag, no reveal) |
| Context menu order | Browser: a synthetic contextmenu before the long-press timer | Pass after fix 14. Fails on the previous code. Android timing not tested |
| Malformed stats and prefs | Node and browser | Pass after fixes 12 and 15. Valid scores survive a malformed neighbour |
| Contrast | Static (token pairs, both themes) and browser (computed footer and link colours) | Pass after fix 13. Fails on the previous code (4.25:1) |
| Upgrade from the deployed v1 build | One-off script. The v1 build on `main` is installed, replaced by this build, then played offline | Pass. Old cache removed, offline play works, no page errors |
| Covered-cell contrast | Static (covered against revealed, both themes) and phone-width screenshots | Pass after fix 16. Fails on the previous colours (1.98:1 dark, 1.92:1 light) |

**Not verified:** an actual Android device, a real install prompt, real flight mode, storage eviction, and anything Android-specific in O1. The Chromium touch emulation is an approximation of the phone.

---

## 8. Lessons for the other PWAs

1. **Headless Chromium can stall `requestAnimationFrame`.** Playwright's click waits on it, so clicks time out. The system Chromium here worked with `--disable-gpu --disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows`. Use those flags in every harness.
2. **Make browser tests deterministic.** Seed `Math.random` with `addInitScript`, and replay the same generator in Node to predict the layout. The test can then click the mines it means to avoid.
3. **Check the precache list against what the app actually loads.** The static test parses the HTML, the imports and the manifest. A missing file fails before anyone deploys.
4. **Guard the cache version.** Hash the precached files and require a version bump whenever the hash changes. This is the single most likely offline-update bug.
5. **Test an update by swapping the server root.** Serve an old copy, load it, swap in the new build, reload, and check the old cache is gone and the app still works offline.
6. **Keep the test harness out of the app's dependencies.** `node:test` with an optional Playwright path needs no install. On Node 24, pass a glob (`"tests/*.test.mjs"`), not a directory.
7. **Expect touch to differ from emulation.** Chromium emulation shows pan behaviour and long presses, but not the `contextmenu` on long press. Every touch change still needs a phone check.
8. **Keep one pending timer per pointer.** Pointer events fire for every finger. A new `pointerdown` must cancel the pending timer before it arms its own, and only the primary pointer should arm one. `isPrimary` and `pointerType` do that.
9. **Check every text pair in both themes in a test.** A static read of the CSS tokens found the one failing pair without a browser. Read computed colours only after a transition has finished, because a fade gives an in-between colour.
10. **Run each regression test against the old code first.** Each new bug test failed, for the reason it names, before its fix went in. That shows the test really catches the bug. Two guard tests passed on the old code, as expected, because they cover behaviour that already worked.
