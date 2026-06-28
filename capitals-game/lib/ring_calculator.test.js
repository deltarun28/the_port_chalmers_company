import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { calculateRing } from './ring_calculator.js';

test('guess 1 at max earth distance — thickness capped at 500km', () => {
  const r = calculateRing(20000, 1);
  assert.equal(r.thickness, 500);
  assert.equal(r.innerRadius, 19750);
  assert.equal(r.outerRadius, 20250);
});

test('guess 1 at 300km — thickness floored at 20km', () => {
  const r = calculateRing(300, 1);
  assert.equal(r.thickness, 20);
  assert.equal(r.innerRadius, 290);
  assert.equal(r.outerRadius, 310);
});

test('guess 5 at 20000km — thickness ≈ 100km', () => {
  const r = calculateRing(20000, 5);
  assert.ok(Math.abs(r.thickness - 100) < 0.01, `thickness should be ~100, got ${r.thickness}`);
  assert.ok(Math.abs(r.innerRadius - 19950) < 0.01);
  assert.ok(Math.abs(r.outerRadius - 20050) < 0.01);
});

test('guess 6+ — thickness never negative', () => {
  const r = calculateRing(1000, 6);
  assert.ok(r.thickness >= 20, `thickness should be >= 20, got ${r.thickness}`);
  assert.ok(r.innerRadius >= 0, `innerRadius should be >= 0, got ${r.innerRadius}`);
});

test('guess 6 multiplier is 0 — floors to 20km thick', () => {
  const r = calculateRing(5000, 6);
  assert.equal(r.thickness, 20);
});
