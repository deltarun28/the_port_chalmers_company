// Checks that need no browser: the offline file list is complete, the manifest
// and icons agree, the game reaches nothing off the device, and a changed
// precached file always comes with a cache version bump.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const text = name => readFile(join(APP, name), 'utf8');

// Every JS module in the game, with the page itself first.
const MODULES = ['index.html', 'lib/board.js', 'lib/game.js', 'lib/stats.js', 'ui/grid.js'];

// The service worker's precache list, normalised to paths relative to the app.
async function precacheList() {
  const block = (await text('sw.js')).match(/const PRECACHE = \[([\s\S]*?)\];/)[1];
  const entries = [...block.matchAll(/'([^']+)'/g)].map(([, entry]) => entry);
  return new Set(entries.map(entry => (entry === './' ? 'index.html' : posix.normalize(entry))));
}

// Every local file the page, its modules and its manifest load.
async function referencedFiles() {
  const files = new Set(['index.html', 'manifest.webmanifest']);
  const html = await text('index.html');
  for (const [, ref] of html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)="([^"]+)"/g)) {
    files.add(posix.normalize(ref));
  }
  for (const file of MODULES) {
    for (const [, ref] of (await text(file)).matchAll(/from\s+'(\.[^']+)'/g)) {
      files.add(posix.normalize(posix.join(posix.dirname(file), ref)));
    }
  }
  for (const icon of JSON.parse(await text('manifest.webmanifest')).icons) {
    files.add(posix.normalize(icon.src));
  }
  return files;
}

test('the service worker precaches every file the app loads', async () => {
  const precache = await precacheList();
  for (const file of await referencedFiles()) {
    assert.ok(precache.has(file), `${file} is loaded by the app but not precached`);
  }
});

test('every precached file exists', async () => {
  for (const file of await precacheList()) {
    assert.ok(existsSync(join(APP, file)), `precache lists a missing file: ${file}`);
  }
});

test('the manifest has what Android needs to install the app', async () => {
  const manifest = JSON.parse(await text('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.name && manifest.short_name);
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');

  const sizes = manifest.icons.map(icon => icon.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'needs 192 and 512 icons');
  for (const icon of manifest.icons) {
    // PNG IHDR: width and height are big-endian u32 at offsets 16 and 20.
    const png = await readFile(join(APP, icon.src));
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes, `${icon.src} does not match its declared size`);
  }
});

test('nothing in the game reaches off the device', async () => {
  for (const file of [...MODULES, 'manifest.webmanifest', 'sw.js']) {
    assert.doesNotMatch(await text(file), /https?:\/\//, `${file} contains an absolute URL`);
  }
});

test('precached files and CACHE_VERSION change together', async () => {
  const version = (await text('sw.js')).match(/\$\{CACHE_PREFIX\}(v\d+)`/)[1];

  const hash = createHash('sha256');
  for (const file of [...await precacheList()].sort()) {
    hash.update(file);
    hash.update(await readFile(join(APP, file)));
  }

  const release = JSON.parse(await text('tests/release.json'));
  const actual = { cacheVersion: version, precacheSha256: hash.digest('hex') };
  assert.deepEqual(actual, release,
    'precached files or CACHE_VERSION changed. Bump CACHE_VERSION in sw.js, then ' +
    'record the new values in tests/release.json');
});

// WCAG 2.x contrast of hex colours.
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const luminance = h => hexRgb(h)
  .map(c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// :root holds the dark theme. html.light-theme overrides some of its tokens.
function themeTokens(html, selector) {
  const block = html.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\}`))[1];
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)]
    .map(([, name, value]) => [name, value]));
}

// Each pair is text on the background it sits on, as index.html applies them.
const TEXT_ON = [
  ['text-primary', 'bg-base'], ['text-secondary', 'bg-base'], ['text-muted', 'bg-base'], ['text-highlight', 'bg-base'],
  ['text-primary', 'bg-card'], ['text-muted', 'bg-card'], ['text-highlight', 'bg-card'],
  ['text-primary', 'bg-hover'], ['text-highlight', 'bg-hover'], ['text-primary', 'cell-hidden'],
  ['text-won', 'bg-won'], ['text-fail', 'bg-fail'],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => [`n${n}`, 'cell-revealed']),
];

test('text meets WCAG AA contrast (4.5:1) in both themes', async () => {
  const html = await text('index.html');
  const dark = themeTokens(html, ':root');
  const light = { ...dark, ...themeTokens(html, 'html\\.light-theme') };
  for (const [theme, tokens] of [['dark', dark], ['light', light]]) {
    for (const [fg, bg] of TEXT_ON) {
      const ratio = contrast(tokens[fg], tokens[bg]);
      assert.ok(ratio >= 4.5, `${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
  }
});

// Non-text contrast (WCAG 1.4.11): a covered cell must stand out from a revealed one.
test('covered and revealed cells differ by at least 3:1 in both themes', async () => {
  const html = await text('index.html');
  const dark = themeTokens(html, ':root');
  const light = { ...dark, ...themeTokens(html, 'html\\.light-theme') };
  for (const [theme, tokens] of [['dark', dark], ['light', light]]) {
    const ratio = contrast(tokens['cell-hidden'], tokens['cell-revealed']);
    assert.ok(ratio >= 3, `${theme}: covered and revealed cells are ${ratio.toFixed(2)}:1`);
  }
});
