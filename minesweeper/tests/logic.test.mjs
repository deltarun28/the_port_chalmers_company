// Pure game logic, run directly under Node. Only the stats tests touch storage,
// and they get a stand-in localStorage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, createGame, reveal, minesRemaining } from '../lib/game.js';
import { neighbours, idx } from '../lib/board.js';

// Park-Miller generator: the same seed always lays out the same mines.
const seeded = seed => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

const minesOf = game => Array.from(game.mines).flatMap((m, i) => (m ? [i] : []));

test('the first click is never a mine, and nor is anything beside it', () => {
  const { rows, cols } = LEVELS.expert;
  for (let seed = 1; seed <= 50; seed++) {
    const game = createGame('expert', seeded(seed));
    reveal(game, 8, 15);
    assert.equal(game.mines[idx(cols, 8, 15)], 0, `seed ${seed}: first click hit a mine`);
    for (const nb of neighbours(rows, cols, 8, 15)) {
      assert.equal(game.mines[nb], 0, `seed ${seed}: a neighbour of the first click is a mine`);
    }
  }
});

test('uncovering every safe cell wins, and flags every mine', () => {
  const game = createGame('beginner', seeded(7));
  reveal(game, 4, 4);
  for (let i = 0; i < game.rows * game.cols; i++) {
    if (!game.mines[i]) reveal(game, Math.floor(i / game.cols), i % game.cols);
  }
  assert.equal(game.status, 'won');
  assert.equal(game.flagCount, LEVELS.beginner.mines);
  assert.equal(minesRemaining(game), 0);
});

test('a losing reveal uncovers every mine', () => {
  const game = createGame('beginner', seeded(7));
  reveal(game, 4, 4);
  const mine = minesOf(game)[0];
  const changed = reveal(game, Math.floor(mine / game.cols), mine % game.cols);
  assert.equal(game.status, 'lost');
  assert.equal(game.explodedAt, mine);
  for (const m of minesOf(game)) assert.ok(changed.includes(m), `mine ${m} was not uncovered`);
});

// ── Stats ───────────────────────────────────────────────────────────────────

const store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: k => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  },
});
const STATS_KEY = 'minesweeper.stats.v1';
const stats = await import('../lib/stats.js');

test('a best time is kept only when it is beaten', () => {
  store.clear();
  assert.equal(stats.recordWin('beginner', 40).isBest, true, 'first win is a best');
  assert.equal(stats.recordWin('beginner', 50).isBest, false, 'slower win is not');
  assert.equal(stats.recordWin('beginner', 30).isBest, true, 'faster win is');
  assert.equal(stats.load().best.beginner, 30);
  assert.equal(stats.load().won.beginner, 3);
});

test('corrupt storage reads as empty stats instead of throwing', () => {
  store.set(STATS_KEY, '{not json');
  assert.deepEqual(stats.load(), { played: {}, won: {}, best: {} });
  store.clear();
});

test('a stored value of the wrong shape reads as empty stats', () => {
  for (const raw of ['"text"', '5', 'null', '[1, 2]']) {
    store.set(STATS_KEY, raw);
    assert.deepEqual(stats.load(), { played: {}, won: {}, best: {} }, raw);
  }
  store.clear();
});

test('a malformed field is dropped alone, and the valid scores beside it are kept', () => {
  store.set(STATS_KEY, JSON.stringify({
    played: { beginner: 3, expert: 'x', intermediate: -1 },
    won: 5,
    best: { beginner: 42, expert: 'abc', intermediate: null },
  }));
  assert.deepEqual(stats.load(), { played: { beginner: 3 }, won: {}, best: { beginner: 42 } });
  store.clear();
});

test('malformed stats cannot stop a game from starting or being won', () => {
  store.set(STATS_KEY, JSON.stringify({ played: 'x', won: 5, best: { beginner: 40, expert: 'abc' } }));
  assert.doesNotThrow(() => stats.recordStart('beginner'));
  assert.doesNotThrow(() => stats.recordWin('beginner', 35));
  assert.deepEqual(JSON.parse(store.get(STATS_KEY)), {
    played: { beginner: 1 }, won: { beginner: 1 }, best: { beginner: 35 },
  });
  store.clear();
});
