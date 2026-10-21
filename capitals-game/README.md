# Capitals Game

A daily world capitals guessing game. One mystery capital is chosen per day — the same for all players. Guess it in 6 attempts.

**[▶ Play it here](https://deltarun28.github.io/the_port_chalmers_company/capitals-game/)**

---

## How to play

- Type a capital city or country name into the search box, or click a dot on the map
- After each guess you'll see how far away you were in km
- The heat bar shows how close you are — green means hot, red means cold
- You have 6 attempts to find the right capital

## Project structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full breakdown of how the code is organised.

## Running locally

Needs to be served over HTTP (not opened as a file) due to ES modules and data fetching:

```bash
python3 -m http.server 8765
# then open http://localhost:8765/capitals-game/
```

## Offline

The service worker precaches the whole game, including the flag stylesheet and
the 195 flags from `flag-icons@7.2.3`, which are vendored in `vendor/`. Nothing
is loaded from a CDN. Cache version: `CACHE_VERSION` in `sw.js`.

After changing any precached file, bump `CACHE_VERSION` and copy the new values
printed by the static test into `tests/release.json`.

```bash
node --test "tests/*.test.mjs" lib/ring_calculator.test.js           # Node checks
PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core CHROME_PATH=/usr/bin/chromium node --test "tests/*.test.mjs" lib/ring_calculator.test.js     # plus browser checks
```
