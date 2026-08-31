import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { calculateRing } from './ring_calculator.js';
import { distanceKm } from './distance.js';
import { validate, fold } from './validator.js';

// Distances here are the real span of the game: ~5km between the closest pair
// of towns, ~1,360km between the furthest.

test('guess 1 at the full length of the country — thickness capped at 80km', () => {
  const r = calculateRing(1358, 1);
  assert.equal(r.thickness, 80);
  assert.equal(r.innerRadius, 1318);
  assert.equal(r.outerRadius, 1398);
});

test('guess 1 at 300km — 6% band, inside the clamps', () => {
  const r = calculateRing(300, 1);
  assert.ok(Math.abs(r.thickness - 18) < 0.01, `expected ~18, got ${r.thickness}`);
  assert.equal(r.innerRadius, 291);
  assert.equal(r.outerRadius, 309);
});

test('guess 5 narrows the band to a fifth of guess 1', () => {
  const a = calculateRing(500, 1);
  const b = calculateRing(500, 5);
  assert.ok(b.thickness < a.thickness, 'later guesses must narrow');
  assert.ok(Math.abs(b.thickness - a.thickness * 0.2) < 0.01);
});

test('a very close guess still draws a visible band', () => {
  const r = calculateRing(20, 1);
  assert.equal(r.thickness, 4, 'floors at 4km rather than collapsing to a line');
  assert.ok(r.innerRadius >= 0);
});

test('guess 6 multiplier is 0 — floors to 4km thick, never negative', () => {
  const r = calculateRing(1000, 6);
  assert.equal(r.thickness, 4);
  assert.ok(r.innerRadius >= 0);
});

// ── distance ────────────────────────────────────────────────────────────────

const AUCKLAND = { lat: -36.8485, lng: 174.7635 };
const WELLINGTON = { lat: -41.2866, lng: 174.7756 };
const INVERCARGILL = { lat: -46.4, lng: 168.35 };

test('Auckland to Wellington is ~494km', () => {
  const d = distanceKm(AUCKLAND, WELLINGTON);
  assert.ok(Math.abs(d - 494) < 5, `expected ~494, got ${d}`);
});

test('Auckland to Invercargill is ~1,187km', () => {
  const d = distanceKm(AUCKLAND, INVERCARGILL);
  assert.ok(Math.abs(d - 1187) < 5, `expected ~1187, got ${d}`);
});

test('distance is symmetric and zero to itself', () => {
  assert.equal(distanceKm(AUCKLAND, WELLINGTON), distanceKm(WELLINGTON, AUCKLAND));
  assert.equal(distanceKm(AUCKLAND, AUCKLAND), 0);
});

// ── validator: macrons ──────────────────────────────────────────────────────

const TOWNS = [
  { name: 'Taupō', region: 'Waikato', aliases: ['Waikato', 'Taupo'] },
  { name: 'Whangārei', region: 'Northland', aliases: ['Northland', 'Whangarei'] },
  { name: 'Gore', region: 'Southland', aliases: ['Southland'] },
  { name: 'Greymouth', region: 'West Coast', aliases: ['West Coast'] },
];

test('fold strips macrons and case', () => {
  assert.equal(fold('Taupō'), 'taupo');
  assert.equal(fold('WHANGĀREI'), 'whangarei');
});

test('a macronised town is reachable from a plain keyboard', () => {
  assert.equal(validate('taupo', TOWNS).name, 'Taupō');
  assert.equal(validate('Whangarei', TOWNS).name, 'Whangārei');
});

test('the correctly spelled name still matches', () => {
  assert.equal(validate('Taupō', TOWNS).name, 'Taupō');
});

test('region names resolve to a town in that region', () => {
  assert.equal(validate('southland', TOWNS).name, 'Gore');
});

test('prefixes and substrings resolve, junk does not', () => {
  assert.equal(validate('grey', TOWNS).name, 'Greymouth');
  assert.equal(validate('zzzz', TOWNS), null);
  assert.equal(validate('   ', TOWNS), null);
});
