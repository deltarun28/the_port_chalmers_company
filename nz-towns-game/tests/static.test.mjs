// Checks that need no browser: every file the game loads is precached, nothing
// reaches another origin, and the release values match the service worker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const text = name => readFile(join(APP, name), 'utf8');

async function precacheList() {
  const block = (await text('sw.js')).match(/const PRECACHE = \[([\s\S]*?)\];/)[1];
  return [...block.matchAll(/'([^']+)'/g)].map(([, entry]) => posix.normalize(entry));
}

// Files the page and its modules load, found by reading their source.
async function loadedFiles() {
  const files = new Set(['index.html', 'manifest.webmanifest']);
  const sources = ['index.html', ...(await readdir(join(APP, 'lib'))).filter(f => !f.endsWith('.test.js')).map(f => `lib/${f}`),
    ...(await readdir(join(APP, 'ui'))).map(f => `ui/${f}`)].filter(f => f.endsWith('.js') || f.endsWith('.html'));
  for (const file of sources) {
    const source = await text(file);
    for (const [, ref] of source.matchAll(/href="((?:vendor|icons)\/[^"]+)"/g)) files.add(ref);
    for (const [, ref] of source.matchAll(/from\s+'(\.[^']+)'/g)) files.add(posix.normalize(posix.join(posix.dirname(file), ref)));
    for (const [, ref] of source.matchAll(/fetch\(\s*'(\.\/[^']+)'/g)) files.add(posix.normalize(ref));
    for (const [, ref] of source.matchAll(/new URL\('(\.\.\/[^']+)', import\.meta\.url\)/g)) files.add(posix.normalize(posix.join(posix.dirname(file), ref)));
  }
  for (const icon of JSON.parse(await text('manifest.webmanifest')).icons) files.add(posix.normalize(icon.src));
  return files;
}

test('every file the game loads is precached, and every precached file exists', async () => {
  const precache = new Set(await precacheList());
  for (const file of await loadedFiles()) {
    assert.ok(precache.has(file), `${file} is loaded by the game but not precached`);
  }
  for (const file of precache) {
    if (file === '.' || file === './') continue;
    assert.ok(existsSync(join(APP, file)), `precache lists a missing file: ${file}`);
  }
});

test('nothing the game ships points at another origin', async () => {
  // The SVG namespace URI is an identifier, not a request, so it is allowed.
  for (const file of await loadedFiles()) {
    if (!/\.(js|html|webmanifest|css)$/.test(file) || !existsSync(join(APP, file))) continue;
    const urls = (await text(file)).match(/https?:\/\/[^\s"'`)]+/g) ?? [];
    assert.deepEqual(urls.filter(u => !u.startsWith('http://www.w3.org/2000/svg')), [], `${file} references another origin`);
  }
});

test('the release values match the service worker', async () => {
  const sw = await text('sw.js');
  const version = sw.match(/\$\{CACHE_PREFIX\}(v\d+)`/)[1];

  const hash = createHash('sha256');
  const files = [...new Set((await precacheList()).map(f => (f === './' ? 'index.html' : f)))].sort();
  for (const file of files) {
    hash.update(file);
    hash.update(await readFile(join(APP, file)));
  }

  const release = JSON.parse(await text('tests/release.json'));
  assert.deepEqual({ cacheVersion: version, precacheSha256: hash.digest('hex') }, release,
    'precached files or CACHE_VERSION changed. Bump CACHE_VERSION in sw.js, then record the new values in tests/release.json');
});
