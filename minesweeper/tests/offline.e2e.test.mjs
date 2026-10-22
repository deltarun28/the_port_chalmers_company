// Browser checks for what only a real browser can show: the service worker
// serving the game with the network switched off, and the win path on screen.
//
// Skipped unless PLAYWRIGHT_CORE points at a playwright-core install:
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
//   CHROME_PATH=/usr/bin/chromium node --test "tests/*.test.mjs"

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, reveal } from '../lib/game.js';

const here = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(here, '..');
const SITE = resolve(APP_DIR, '..');   // the repo root that GitHub Pages publishes
const APP = '/minesweeper/';
const SW_SOURCE = join(APP_DIR, 'sw.js');
const PW = process.env.PLAYWRIGHT_CORE;
const skip = PW ? false : 'set PLAYWRIGHT_CORE to run the browser checks';

// Seeded so the mine layout is known in advance. The Node replica below must
// consume the RNG exactly as the page does, so the first click lands on the
// same layout in both.
const SEED = 20260922;
const FIRST_I = 4 * 9 + 4;             // centre of the 9x9 beginner board

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function expectedMines() {
  const game = createGame('beginner', mulberry32(SEED));
  reveal(game, 4, 4);
  return new Set(Array.from(game.mines).flatMap((m, i) => (m ? [i] : [])));
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

// What the server reads from. The update test swaps it to stand in for a deploy.
let root = SITE;

function serve() {
  return new Promise(ready => {
    const server = createServer(async (req, res) => {
      const { pathname } = new URL(req.url, 'http://localhost');
      let file = normalize(join(root, decodeURIComponent(pathname)));
      if (!file.startsWith(root)) return void res.writeHead(403).end();
      if (pathname.endsWith('/')) file = join(file, 'index.html');
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(0, '127.0.0.1', () => ready(server));
  });
}

let server, browser, base;

before(async () => {
  if (skip) return;
  const { chromium } = createRequire(import.meta.url)(PW);
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  // Background throttling makes requestAnimationFrame stall in some headless
  // builds, and Playwright's click actionability check waits on it.
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--disable-gpu', '--disable-renderer-backgrounding',
           '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
  });
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function openApp(context) {
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => requests.push(r.url()));
  await page.goto(base + APP);
  return { page, errors, requests };
}

test('a single online visit is enough to play with the network switched off', { skip }, async () => {
  const context = await browser.newContext();
  const { page, errors, requests } = await openApp(context);

  // controller is set once the service worker has installed and claimed the
  // page, which only happens after the whole precache has been stored.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.cell');
  assert.equal(await page.locator('.cell').count(), 81);

  await page.click(`.cell[data-i="${FIRST_I}"]`);
  assert.ok(await page.locator('.cell.revealed').count() > 0, 'first reveal opened nothing');

  assert.deepEqual(errors, [], 'runtime errors while offline');
  assert.ok(requests.every(u => u.startsWith(base)), `non-local request: ${requests.find(u => !u.startsWith(base))}`);
  await context.close();
});

test('a won board shows every mine flagged', { skip }, async () => {
  const context = await browser.newContext();
  await context.addInitScript(`Math.random = (${mulberry32.toString()})(${SEED});`);
  const { page, errors } = await openApp(context);
  const mines = expectedMines();

  await page.waitForSelector('.cell');
  await page.click(`.cell[data-i="${FIRST_I}"]`);

  // Open every safe cell. Revealed cells lose the `hidden` class, so this skips
  // them; flood-fill may open several at once, which is why it re-checks each one.
  for (let i = 0; i < 81; i++) {
    if (mines.has(i)) continue;
    const cell = page.locator(`.cell[data-i="${i}"]`);
    if (await cell.evaluate(el => el.classList.contains('hidden'))) await cell.click();
  }

  await page.waitForFunction(() => document.querySelector('#banner').classList.contains('won'));
  assert.equal(await page.textContent('#mines'), '🚩 0');

  const flagged = await page.locator('.cell.flagged').evaluateAll(els => els.map(el => Number(el.dataset.i)));
  assert.deepEqual(flagged.sort((a, b) => a - b), [...mines].sort((a, b) => a - b),
    'the mines should be visibly flagged on a won board');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a long press flags a cell once, and the tap after it still reveals', { skip }, async () => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const { page, errors } = await openApp(context);
  await page.waitForSelector('.cell');

  const cdp = await context.newCDPSession(page);
  const touch = async (i, holdMs) => {
    const box = await page.locator(`.cell[data-i="${i}"]`).boundingBox();
    const touchPoints = [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
    await page.waitForTimeout(holdMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100);
  };

  await touch(FIRST_I, 900);
  assert.equal(await page.locator('.cell.flagged').count(), 1, 'long press should flag once');

  await touch(0, 50);
  assert.ok(await page.locator('.cell.revealed').count() > 0, 'the tap after a long press was swallowed');
  assert.equal(await page.locator('.cell.flagged').count(), 1, 'the long press flag was toggled off');
  assert.deepEqual(errors, []);
  await context.close();
});

test('an expert board can be panned by touch, and a drag never flags', { skip }, async () => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const { page, errors } = await openApp(context);
  await page.selectOption('#level', 'expert');
  await page.waitForSelector('.cell');

  const box = await page.locator('.cell[data-i="100"]').boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let step = 1; step <= 20; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 8, y, id: 1 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);

  const scrolled = await page.locator('.board-wrap').evaluate(el => el.scrollLeft);
  assert.ok(scrolled > 0, 'a horizontal drag should scroll the expert board');
  assert.equal(await page.locator('.cell.flagged').count(), 0, 'a drag must not flag');
  assert.equal(await page.locator('.cell.revealed').count(), 0, 'a drag must not reveal');
  assert.deepEqual(errors, []);
  await context.close();
});

test('right click flags and toggles, and left click still reveals', { skip }, async () => {
  const context = await browser.newContext();
  const { page, errors } = await openApp(context);
  await page.waitForSelector('.cell');

  const flag = `.cell[data-i="${FIRST_I}"]`;
  await page.click(flag, { button: 'right' });
  assert.equal(await page.locator('.cell.flagged').count(), 1, 'right click should flag');
  await page.click(flag, { button: 'right' });
  assert.equal(await page.locator('.cell.flagged').count(), 0, 'second right click should unflag');

  await page.click('.cell[data-i="0"]');
  assert.ok(await page.locator('.cell.revealed').count() > 0, 'left click should reveal');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a stray level preference does not leave the board empty', { skip }, async () => {
  const context = await browser.newContext();
  const { page, errors } = await openApp(context);
  await page.waitForSelector('.cell');

  await page.evaluate(() => localStorage.setItem('minesweeper.prefs.v1', JSON.stringify({ level: 'constructor' })));
  await page.reload();
  await page.waitForSelector('.cell');

  assert.equal(await page.locator('.cell').count(), 81);
  assert.equal(await page.inputValue('#level'), 'beginner');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a deployed update replaces the old cache on the next launch', { skip }, async () => {
  // Stand in for the previous deploy: the same files, under an older cache name.
  const previous = await mkdtemp(join(tmpdir(), 'minesweeper-previous-'));
  try {
    await cp(APP_DIR, join(previous, 'minesweeper'), {
      recursive: true,
      filter: src => !src.startsWith(join(APP_DIR, 'tests')),
    });
    const oldSw = (await readFile(SW_SOURCE, 'utf8'))
      .replace(/(\$\{CACHE_PREFIX\}v)\d+/, (_, prefix) => `${prefix}0`);
    await writeFile(join(previous, 'minesweeper', 'sw.js'), oldSw);

    const current = `minesweeper-${(await readFile(SW_SOURCE, 'utf8')).match(/\$\{CACHE_PREFIX\}(v\d+)/)[1]}`;
    const cacheNames = page => page.evaluate(async () => (await caches.keys()).sort());

    root = previous;
    const context = await browser.newContext();
    const { page, errors } = await openApp(context);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    assert.deepEqual(await cacheNames(page), ['minesweeper-v0']);

    // "Deploy": the server now returns the current build.
    root = SITE;
    await page.reload();

    // The launch that found the update may still run the old copy, but the new
    // worker must take over and drop the old cache within a few seconds.
    const deadline = Date.now() + 15000;
    let names = await cacheNames(page);
    while (names.join() !== current && Date.now() < deadline) {
      await page.waitForTimeout(250);
      names = await cacheNames(page);
    }
    assert.deepEqual(names, [current]);

    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.cell');
    assert.equal(await page.locator('.cell').count(), 81);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    root = SITE;
    await rm(previous, { recursive: true, force: true });
  }
});

test('an update restores the whole cache after it was deleted, and keeps saved data', { skip }, async () => {
  // A phone with the previous build (v2) installed. The old Study Quiz then deleted every
  // cache on the origin. This build must refill its own cache and leave saved data alone.
  const previous = await mkdtemp(join(tmpdir(), 'minesweeper-previous-'));
  try {
    await cp(APP_DIR, join(previous, 'minesweeper'), {
      recursive: true,
      filter: src => !src.startsWith(join(APP_DIR, 'tests')),
    });
    const v2Sw = (await readFile(SW_SOURCE, 'utf8'))
      .replace(/(\$\{CACHE_PREFIX\}v)\d+/, (_, prefix) => `${prefix}2`);
    await writeFile(join(previous, 'minesweeper', 'sw.js'), v2Sw);

    const source = await readFile(SW_SOURCE, 'utf8');
    const current = `minesweeper-${source.match(/\$\{CACHE_PREFIX\}(v\d+)/)[1]}`;
    const precacheSize = (source.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].match(/'[^']+'/g)).length;
    const stats = { played: { beginner: 3 }, won: { beginner: 1 }, best: { beginner: 42 } };
    const prefs = { level: 'beginner', light: true, flagMode: true };
    const cacheNames = page => page.evaluate(async () => (await caches.keys()).sort());
    const cacheEntries = (page, name) => page.evaluate(async n => (await (await caches.open(n)).keys()).length, name);

    root = previous;
    const context = await browser.newContext();
    const { page, errors } = await openApp(context);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 60000 });
    await page.evaluate(({ s, p }) => {
      localStorage.setItem('minesweeper.stats.v1', JSON.stringify(s));
      localStorage.setItem('minesweeper.prefs.v1', JSON.stringify(p));
    }, { s: stats, p: prefs });

    // The old Study Quiz deleted the cache.
    await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); });
    assert.deepEqual(await cacheNames(page), [], 'the simulated quiz deletion should leave no cache');

    // "Deploy": the server now returns this build.
    root = SITE;
    await page.reload();

    const deadline = Date.now() + 30000;
    let names = await cacheNames(page);
    while (names.join() !== current && Date.now() < deadline) {
      await page.waitForTimeout(250);
      names = await cacheNames(page);
    }
    assert.deepEqual(names, [current], 'this build should replace the deleted cache');
    assert.equal(await cacheEntries(page, current), precacheSize, 'the restored cache should hold every precached file');

    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.cell', { timeout: 15000 });
    assert.equal(await page.locator('.cell').count(), 81);
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('minesweeper.stats.v1'))), stats,
      'saved scores changed during the update');
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('minesweeper.prefs.v1'))), prefs,
      'saved settings changed during the update');
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    root = SITE;
    await rm(previous, { recursive: true, force: true });
  }
});

// Centre of a cell, in page coordinates, for the pointer checks below.
async function centre(page, i) {
  const box = await page.locator(`.cell[data-i="${i}"]`).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('two fingers on the board neither flag a cell nor move the counter', { skip }, async () => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const { page, errors } = await openApp(context);
  await page.waitForSelector('.cell');

  const cdp = await context.newCDPSession(page);
  const a = await centre(page, FIRST_I);
  const b = await centre(page, FIRST_I + 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] });
  await page.waitForTimeout(50);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }, { ...b, id: 2 }] });
  await page.waitForTimeout(50);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(800);

  assert.equal(await page.locator('.cell.flagged').count(), 0, 'a two-finger touch flagged a cell');
  assert.equal(await page.textContent('#mines'), '🚩 10', 'a two-finger touch changed the mine counter');

  // The board still responds to an ordinary tap afterwards.
  const t = await centre(page, 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...t, id: 1 }] });
  await page.waitForTimeout(50);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);
  assert.ok(await page.locator('.cell.revealed').count() > 0, 'a tap after a two-finger touch did nothing');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a held mouse click reveals, and never flags', { skip }, async () => {
  const context = await browser.newContext();
  const { page, errors } = await openApp(context);
  await page.waitForSelector('.cell');

  const p = await centre(page, FIRST_I);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(100);

  assert.equal(await page.locator('.cell.flagged').count(), 0, 'a held mouse click flagged a cell');
  assert.ok(await page.locator('.cell.revealed').count() > 0, 'a held mouse click did not reveal');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a context menu that arrives before the long-press timer flags once', { skip }, async () => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const { page, errors } = await openApp(context);
  await page.waitForSelector('.cell');

  const cdp = await context.newCDPSession(page);
  const p = await centre(page, FIRST_I);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
  await page.waitForTimeout(100);
  // Android can send contextmenu for a long press. Here it arrives before the 400 ms timer.
  await page.evaluate(i => document.querySelector(`.cell[data-i="${i}"]`)
    .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })), FIRST_I);
  await page.waitForTimeout(600);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);

  assert.equal(await page.locator('.cell.flagged').count(), 1, 'one press that produced both events did not flag exactly once');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a second long press on a flagged cell removes its flag once', { skip }, async () => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const { page, errors } = await openApp(context);
  await page.waitForSelector('.cell');

  const cdp = await context.newCDPSession(page);
  const p = await centre(page, FIRST_I);
  const press = async holdMs => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
    await page.waitForTimeout(holdMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100);
  };

  await press(900);
  assert.equal(await page.locator('.cell.flagged').count(), 1, 'the first long press should flag once');
  await press(900);
  assert.equal(await page.locator('.cell.flagged').count(), 0, 'the second long press should unflag once');
  assert.deepEqual(errors, []);
  await context.close();
});

test('malformed saved statistics do not freeze the board', { skip }, async () => {
  const context = await browser.newContext();
  const { page, errors } = await openApp(context);
  await page.waitForSelector('.cell');

  await page.evaluate(() => localStorage.setItem('minesweeper.stats.v1', JSON.stringify({ played: 'x' })));
  await page.reload();
  await page.waitForSelector('.cell');
  await page.click(`.cell[data-i="${FIRST_I}"]`);

  assert.ok(await page.locator('.cell.revealed').count() > 0, 'the first reveal did nothing');
  assert.deepEqual(errors, []);
  await context.close();
});

test('valid saved scores survive a malformed field beside them', { skip }, async () => {
  const context = await browser.newContext();
  const { page, errors } = await openApp(context);
  await page.waitForSelector('.cell');

  const saved = { played: { beginner: 3 }, won: 'x', best: { beginner: 42, expert: 'abc' } };
  await page.evaluate(v => localStorage.setItem('minesweeper.stats.v1', JSON.stringify(v)), saved);
  await page.reload();
  await page.waitForSelector('.cell');
  await page.click(`.cell[data-i="${FIRST_I}"]`);

  const after = JSON.parse(await page.evaluate(() => localStorage.getItem('minesweeper.stats.v1')));
  assert.deepEqual(after, { played: { beginner: 4 }, won: {}, best: { beginner: 42 } });
  assert.deepEqual(errors, []);
  await context.close();
});

// WCAG relative luminance for an rgb() string as getComputedStyle returns it.
const rgbLuminance = css => css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
  .map(c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const rgbContrast = (a, b) => {
  const [hi, lo] = [rgbLuminance(a), rgbLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('light theme text meets WCAG AA contrast in the browser', { skip }, async () => {
  const context = await browser.newContext();
  const { page, errors } = await openApp(context);
  await page.waitForSelector('.cell');

  await page.click('#theme');
  // The body background fades over 0.25 s, so read it once the fade has finished.
  await page.waitForTimeout(400);
  const css = await page.evaluate(() => ({
    page: getComputedStyle(document.body).backgroundColor,
    footer: getComputedStyle(document.querySelector('footer')).color,
    home: getComputedStyle(document.querySelector('.home')).color,
  }));
  for (const name of ['footer', 'home']) {
    const ratio = rgbContrast(css[name], css.page);
    assert.ok(ratio >= 4.5, `${name} text is ${ratio.toFixed(2)}:1 on the light background`);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('a malformed preference is replaced, not merged into the saved settings', { skip }, async () => {
  const context = await browser.newContext();
  const { page, errors } = await openApp(context);
  await page.waitForSelector('.cell');

  await page.evaluate(() => localStorage.setItem('minesweeper.prefs.v1', JSON.stringify('oops')));
  await page.reload();
  await page.waitForSelector('.cell');
  await page.selectOption('#level', 'intermediate');

  assert.equal(await page.locator('.cell').count(), 256);
  const prefs = JSON.parse(await page.evaluate(() => localStorage.getItem('minesweeper.prefs.v1')));
  assert.deepEqual(prefs, { level: 'intermediate' });
  assert.deepEqual(errors, []);
  await context.close();
});
