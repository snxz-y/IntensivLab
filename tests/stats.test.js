import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStats, recordCase, accuracy, weakest, selectionWeights, suggestLevel, pickLevel } from '../modules/blodgass/stats.js';

const fakeCase = (over = {}) => ({ scenarioId: 'dka', level: 1, primary: 'met-acidose', secondary: null, ...over });
const res = (...arr) => arr.map((c) => ({ correct: c }));

test('recordCase teller per trinn, type, nivå og scenario; null hoppes over', () => {
  const s = emptyStats();
  recordCase(s, fakeCase(), res(true, true, false, true, null, true, false));
  assert.equal(s.cases, 1);
  assert.deepEqual(s.steps['1'], { n: 1, correct: 1 });
  assert.deepEqual(s.steps['3'], { n: 1, correct: 0 });
  assert.equal(s.steps['5'], undefined);
  assert.deepEqual(s.types['met-acidose'], { n: 6, correct: 4 });
  assert.deepEqual(s.levels['1'], { n: 6, correct: 4 });
  assert.deepEqual(s.scenarios['dka'], { n: 6, correct: 4 });
  assert.equal(s.history.length, 1);
  assert.deepEqual(s.history[0].perStep, [true, true, false, true, null, true, false]);
});

test('sekundær forstyrrelse telles som egen type', () => {
  const s = emptyStats();
  recordCase(s, fakeCase({ scenarioId: 'dka-nacl', level: 3, secondary: 'met-acidose-normal-ag' }), res(true));
  assert.deepEqual(s.types['met-acidose'], { n: 1, correct: 1 });
  recordCase(s, fakeCase({ scenarioId: 'salisylat', level: 3, secondary: 'resp-alkalose' }), res(false));
  assert.deepEqual(s.types['resp-alkalose'], { n: 1, correct: 0 });
});

test('weakest sorterer lavest treff først og krever minste antall', () => {
  const s = emptyStats();
  for (let i = 0; i < 4; i++) recordCase(s, fakeCase(), res(true, false, false));
  recordCase(s, fakeCase({ primary: 'met-alkalose', scenarioId: 'oppkast' }), res(false));
  const w = weakest(s.steps);
  assert.equal(w[0].key, '2');
  assert.equal(accuracy(s.steps['1']), 0.8);
  assert.equal(weakest(s.types).length, 1); // met-alkalose har bare 1 forsøk
});

test('selectionWeights vekter svake områder opp', () => {
  const s = emptyStats();
  for (let i = 0; i < 6; i++) recordCase(s, fakeCase({ primary: 'resp-acidose', scenarioId: 'opioid' }), res(true, true, true, true, true, true, true));
  for (let i = 0; i < 6; i++) recordCase(s, fakeCase(), res(false, false, false, false, false, false, false));
  const w = selectionWeights(s);
  assert.ok(w['met-acidose'] > w['resp-acidose'], JSON.stringify(w));
  assert.ok(w['met-acidose'] > w['met-alkalose']); // uøvd ligger mellom
  assert.ok(w['dka'] > w['opioid']);
  assert.ok(w['resp-acidose'] >= 1);
});

test('suggestLevel og pickLevel', () => {
  const s = emptyStats();
  assert.equal(suggestLevel(s).weights[1], 0.8);
  for (let i = 0; i < 3; i++) recordCase(s, fakeCase(), res(true, true, true, true, true, true, true));
  assert.equal(suggestLevel(s).weights[2], 0.6);
  const rng = (() => { let i = 0; return () => [0.1, 0.5, 0.95][i++ % 3]; })();
  const picks = [pickLevel({ 1: 0.2, 2: 0.3, 3: 0.5 }, rng), pickLevel({ 1: 0.2, 2: 0.3, 3: 0.5 }, rng), pickLevel({ 1: 0.2, 2: 0.3, 3: 0.5 }, rng)];
  assert.deepEqual(picks, [1, 2, 3]);
});
