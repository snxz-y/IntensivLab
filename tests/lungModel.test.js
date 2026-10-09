import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLung } from '../core/sim/lungModel.js';
import { pmusAt } from '../core/sim/patientEffort.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

test('flowstyrt inspirasjon følger bevegelsesligningen', () => {
  const lung = createLung({ compliance: 50, resistance: 10, initialVolume: 250 }); // volum ved PEEP 5
  const dt = 0.005;
  let last;
  for (let i = 0; i < 100; i++) last = lung.stepFlow(dt, 1, 0); // 0,5 s á 1 L/s = 500 ml
  near(last.volume, 750, 1e-6);
  near(last.paw, 750 / 50 + 10 * 1, 1e-6); // 25
  near(last.palv, 15, 1e-6);
});

test('trykkstyrt steg følger analytisk eksponentiell løsning', () => {
  const lung = createLung({ compliance: 50, resistance: 10, initialVolume: 250 });
  const tau = 0.5;
  const paw = 20; // PEEP 5 + Pcontrol 15
  const dt = 0.005;
  let t = 0;
  for (let i = 0; i < 200; i++) { lung.stepPressure(dt, paw, 0); t += dt; }
  const vEq = 50 * 20; // 1000 ml
  const expected = vEq + (250 - vEq) * Math.exp(-t / tau);
  near(lung.state.volume, expected, 1e-6);
  near(lung.state.flow, (paw - lung.state.volume / 50) / 10, 1e-9);
});

test('passiv ekspirasjon: 63 % etter én tidskonstant, ulik Rexp brukes ved utpust', () => {
  const lung = createLung({ compliance: 50, resistance: 10, resistanceExp: 20, initialVolume: 750 });
  const tauExp = (20 * 50) / 1000; // 1,0 s
  const dt = 0.005;
  for (let i = 0; i < Math.round(tauExp / dt); i++) lung.stepPressure(dt, 5, 0);
  const remaining = lung.state.volume - 250;
  near(remaining / 500, Math.exp(-1), 1e-6);
});

test('stabil også ved svært kort tidskonstant', () => {
  const lung = createLung({ compliance: 10, resistance: 2, initialVolume: 50 }); // τ = 0,02 s
  for (let i = 0; i < 400; i++) lung.stepPressure(0.005, 25, 0);
  near(lung.state.volume, 250, 1e-6);
  assert.ok(Number.isFinite(lung.state.flow));
});

test('okklusjon: ingen flow, Paw = Palv', () => {
  const lung = createLung({ compliance: 50, resistance: 10, initialVolume: 750 });
  const s = lung.stepOccluded(0.005, 0);
  near(s.flow, 0);
  near(s.paw, 15);
});

test('pasientinnsats (Pmus) er halv sinus', () => {
  const effort = { amplitude: 10, duration: 1 };
  near(pmusAt(0, effort), 0);
  near(pmusAt(0.5, effort), 10);
  near(pmusAt(1, effort), 0, 1e-9);
  near(pmusAt(1.5, effort), 0);
  near(pmusAt(0.5, { amplitude: 0 }), 0);
});
