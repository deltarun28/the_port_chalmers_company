// Browser checks for offline play. Skipped unless PLAYWRIGHT_CORE points at a
// playwright-core install:
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
//   CHROME_PATH=/usr/bin/chromium node --test "tests/*.test.mjs"

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '..');
const SITE = resolve(APP, '..');        // the repo root that GitHub Pages publishes
const PW = process.env.PLAYWRIGHT_CORE;
const skip = PW ? false : 'set PLAYWRIGHT_CORE to run the browser checks';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

let server, browser, base;

before(async () => {
  if (skip) return;
  server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    let file = normalize(join(SITE, decodeURIComponent(pathname)));
    if (!file.startsWith(SITE)) return void res.writeHead(403).end();
    if (pathname.endsWith('/')) file = join(file, 'index.html');
    let body;
    try {
      body = await readFile(file);
    } catch {
      return void res.writeHead(404).end();
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  });
  await new Promise(ready => server.listen(0, '127.0.0.1', ready));
  base = `http://127.0.0.1:${server.address().port}/nz-towns-game/`;
  const { chromium } = createRequire(import.meta.url)(PW);
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

async function openOnline() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 60000 });
  await page.waitForSelector('#random-btn', { timeout: 30000 });
  return { context, page, errors };
}

test('the game opens with the network off', { skip }, async () => {
  const { context, page, errors } = await openOnline();
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#random-btn', { timeout: 15000 });
  assert.deepEqual(errors, []);
  await context.close();
});

test('every precached file can be fetched with the network off', { skip }, async () => {
  const { context, page, errors } = await openOnline();
  const sw = await readFile(join(APP, 'sw.js'), 'utf8');
  const block = sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1];
  const urls = [...block.matchAll(/'([^']+)'/g)].map(([, u]) => u.replace(/^\.\//, ''));
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#random-btn', { timeout: 15000 });
  const statuses = await page.evaluate(async list => Promise.all(list.map(u => fetch(u).then(r => r.status, () => 0))), urls.map(u => `./${u}`));
  const missing = urls.filter((_, i) => statuses[i] !== 200);
  assert.deepEqual(missing, [], 'these precached files were not served offline');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a round can be played with the network off', { skip }, async () => {
  const { context, page, errors } = await openOnline();
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#random-btn', { timeout: 15000 });
  await page.click('#random-btn');
  await page.waitForSelector('#input-container input', { timeout: 15000 });
  await page.fill('#input-container input', 'Auckland');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#results-container')?.textContent.trim().length > 0, null, { timeout: 15000 });
  assert.deepEqual(errors, []);
  await context.close();
});
