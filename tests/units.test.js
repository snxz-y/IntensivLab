import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kPaToMmHg, mmHgToKPa, mlToL, lPerMinToLPerS, gPerLToGPerDl, round, clamp, fmt } from '../core/units.js';

test('kPa ↔ mmHg', () => {
  assert.ok(Math.abs(kPaToMmHg(1) - 7.50062) < 1e-6);
  assert.ok(Math.abs(mmHgToKPa(40) - 5.3329) < 1e-3);
  assert.ok(Math.abs(mmHgToKPa(kPaToMmHg(12.3)) - 12.3) < 1e-9);
});

test('volum og flow', () => {
  assert.equal(mlToL(500), 0.5);
  assert.equal(lPerMinToLPerS(60), 1);
  assert.equal(gPerLToGPerDl(40), 4);
});

test('round, clamp, fmt', () => {
  assert.equal(round(1.005, 2), 1.01);
  assert.equal(round(7.3456, 2), 7.35);
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(-2, 0, 10), 0);
  assert.equal(fmt(7.35, 2), '7,35');
  assert.equal(fmt(null), '–');
  assert.equal(fmt(NaN), '–');
});
