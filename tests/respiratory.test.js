import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  airwayPressure, timeConstant, exhaledFraction, drivingPressure, staticCompliance,
  inspiratoryResistance, minuteVolume, meanPressure, autoPeep, predictedBodyWeightArdsNet,
  idealBodyWeightHamilton, vtPerKg, cycleTime, tiFromIE, ieFromTi, peakFlowForVolume, flowAtFraction,
} from '../core/physiology/respiratory.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

test('bevegelsesligningen: kontrolleksempel gir Pplat 15 og Ppeak 25', () => {
  // C=50 ml/cmH2O, R=10 cmH2O/(L/s), Vt=500 ml, flow 60 L/min = 1 L/s, PEEP 5
  const pplat = airwayPressure({ volume: 500, flow: 0, compliance: 50, resistance: 10, peep: 5 });
  const ppeak = airwayPressure({ volume: 500, flow: 1, compliance: 50, resistance: 10, peep: 5 });
  near(pplat, 15);
  near(ppeak, 25);
});

test('pasientinnsats senker luftveistrykket', () => {
  const uten = airwayPressure({ volume: 500, flow: 1, compliance: 50, resistance: 10, peep: 5 });
  const med = airwayPressure({ volume: 500, flow: 1, compliance: 50, resistance: 10, peep: 5, pmus: 8 });
  near(uten - med, 8);
});

test('tidskonstant og ekshalert andel', () => {
  near(timeConstant(10, 50), 0.5);
  near(timeConstant(30, 70), 2.1);
  near(exhaledFraction(0.5, 0.5), 1 - Math.exp(-1));
  near(exhaledFraction(1.5, 0.5), 0.95, 0.001);
  near(exhaledFraction(1, 0), 1);
});

test('drivtrykk, Cstat, Rinsp', () => {
  near(drivingPressure(15, 5), 10);
  near(staticCompliance(500, 15, 5), 50);
  assert.equal(staticCompliance(500, 5, 5), null);
  near(inspiratoryResistance(25, 15, 1), 10);
  assert.equal(inspiratoryResistance(25, 15, 0), null);
});

test('minuttvolum, middeltrykk, auto-PEEP', () => {
  near(minuteVolume(500, 12), 6);
  near(meanPressure([{ p: 20, dt: 1 }, { p: 5, dt: 3 }]), 8.75);
  near(autoPeep(8, 5), 3);
  near(autoPeep(4, 5), 0);
});

test('predikert kroppsvekt (ARDSNet) og IBW (Hamilton)', () => {
  near(predictedBodyWeightArdsNet(175, 'M'), 50 + 0.91 * (175 - 152.4));
  near(predictedBodyWeightArdsNet(165, 'K'), 45.5 + 0.91 * (165 - 152.4));
  const ibwM = idealBodyWeightHamilton(175, 'M');
  const ibwK = idealBodyWeightHamilton(165, 'K');
  // Hamilton-formelen skal ligge nær ARDSNet-PBW (< 1,5 kg avvik i voksent område)
  assert.ok(Math.abs(ibwM - predictedBodyWeightArdsNet(175, 'M')) < 1.5);
  assert.ok(Math.abs(ibwK - predictedBodyWeightArdsNet(165, 'K')) < 1.5);
  near(vtPerKg(420, 70), 6);
  assert.equal(vtPerKg(420, 0), null);
});

test('timing: syklustid, Ti fra I:E og tilbake', () => {
  near(cycleTime(15), 4);
  near(tiFromIE(15, { i: 1, e: 2 }), 4 / 3);
  const ie = ieFromTi(15, 4 / 3);
  near(ie.i, 1); near(ie.e, 2);
  const inv = ieFromTi(15, 3);
  near(inv.i, 3); near(inv.e, 1);
});

test('flowmønster: firkant og deselererende gir samme volum', () => {
  const ti = 1;
  const square = peakFlowForVolume(500, ti, 'square');
  const decel = peakFlowForVolume(500, ti, 'decel');
  near(square, 0.5);
  near(decel, 0.5 / 0.75);
  // numerisk integrasjon av det deselererende mønsteret
  let v = 0; const n = 1000;
  for (let i = 0; i < n; i++) v += flowAtFraction(decel, (i + 0.5) / n, 'decel') * (ti / n);
  near(v * 1000, 500, 0.01);
});
