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
