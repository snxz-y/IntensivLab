import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  phFromHco3Pco2, hco3FromPhPco2, pco2FromPhHco3, baseExcess, anionGap, correctedAnionGap,
  deltaRatio, interpretDeltaRatio, expectedCompensation, pfRatio, gradePf, alveolarPo2, isHypoxemic, CO2_SOLUBILITY_KPA,
} from '../core/physiology/acidbase.js';
import { mmHgToKPa } from '../core/units.js';
import { step1, step2, step3, step4, step5, step6, interpret, acceptedPrimaries } from '../modules/blodgass/interpret.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

test('Henderson–Hasselbalch: normalverdier og rundtur', () => {
  near(CO2_SOLUBILITY_KPA, 0.2302, 0.0005);
  near(phFromHco3Pco2(24.5, mmHgToKPa(40)), 7.40, 0.005);
  near(phFromHco3Pco2(24, mmHgToKPa(40)), 7.39, 0.005);
  near(hco3FromPhPco2(7.40, mmHgToKPa(40)), 24.5, 0.1);
  near(pco2FromPhHco3(7.40, 24.5), mmHgToKPa(40), 0.03);
  near(phFromHco3Pco2(12, mmHgToKPa(26)), 7.28, 0.01); // metabolsk acidose
  near(phFromHco3Pco2(26, mmHgToKPa(80)), 7.13, 0.01); // akutt resp. acidose
});

test('base excess (Van Slyke, ECF)', () => {
  near(baseExcess(7.40, 24.4), 0, 0.01);
  near(baseExcess(7.25, 12), -13.6, 0.2);
  near(baseExcess(7.50, 36), 12.2, 0.3);
});

test('anion gap, albuminkorreksjon (Figge) og delta ratio', () => {
  assert.equal(anionGap(140, 104, 24), 12);
  near(correctedAnionGap(12, 40), 12, 1e-9);
  near(correctedAnionGap(12, 20), 17, 1e-9); // +2,5 per 1 g/dL (10 g/L) albumin under 4 g/dL
  near(deltaRatio(28, 12), 16 / 12, 1e-9);
  assert.equal(deltaRatio(28, 24), null);
  assert.equal(interpretDeltaRatio(0.3), 'normal-ag');
  assert.equal(interpretDeltaRatio(0.6), 'blandet-hoy-og-normal-ag');
  assert.equal(interpretDeltaRatio(1.2), 'ren-hoy-ag');
  assert.equal(interpretDeltaRatio(2.5), 'hoy-ag-pluss-met-alkalose');
  assert.equal(interpretDeltaRatio(null), 'ikke-aktuelt');
});

test('forventet kompensasjon: Winter og respiratoriske regler', () => {
  const w = expectedCompensation('met-acidose', { hco3: 12 });
  near(w.expected, mmHgToKPa(26), 0.01);
  near(w.low, mmHgToKPa(24), 0.01);
  near(w.high, mmHgToKPa(28), 0.01);
  const a = expectedCompensation('met-alkalose', { hco3: 40 });
  near(a.expected, mmHgToKPa(49), 0.01);
  const ra = expectedCompensation('resp-acidose-akutt', { pco2: mmHgToKPa(70) });
  near(ra.expected, 27, 0.01);
  const rc = expectedCompensation('resp-acidose-kronisk', { pco2: mmHgToKPa(70) });
  near(rc.expected, 34.5, 0.01);
  const la = expectedCompensation('resp-alkalose-akutt', { pco2: mmHgToKPa(20) });
  near(la.expected, 20, 0.01);
  const lc = expectedCompensation('resp-alkalose-kronisk', { pco2: mmHgToKPa(20) });
  near(lc.expected, 16, 0.01);
  assert.throws(() => expectedCompensation('tull', {}));
});

test('oksygenering: P/F i kPa, Berlin-grader, alveolær gassligning', () => {
  near(pfRatio(10, 0.21), 47.6, 0.1);
  assert.equal(gradePf(60), 'normal');
  assert.equal(gradePf(45), 'lett-nedsatt');
  assert.equal(gradePf(35), 'mild');
  assert.equal(gradePf(20), 'moderat');
  assert.equal(gradePf(12), 'alvorlig');
  near(alveolarPo2(0.21, 5.3), 0.21 * 95 - 5.3 / 0.8, 1e-9); // ≈ 13,3 kPa
  assert.equal(isHypoxemic(7.9), true);
  assert.equal(isHypoxemic(8.0), false);
});

test('tolkning: klassiske kasus', () => {
  // DKA: pH 7,20, PaCO2 2,9 kPa (≈ 22 mmHg), HCO3 8,3
  const dka = { ph: 7.20, pco2: 2.9, po2: 12, hco3: 8.3, na: 134, cl: 96, albumin: 40, fio2: 0.21 };
  assert.equal(step1(dka), 'acidemi');
  assert.equal(step2(dka), 'met-acidose');
  assert.equal(step3(dka).verdict, 'adekvat'); // Winter: 20,5 ± 2 mmHg → 2,5–3,0 kPa
  const s4 = step4(dka);
  near(s4.ag, 29.7, 0.06);
  assert.equal(s4.high, true);
  assert.equal(step5(dka).verdict, 'ren-hoy-ag'); // (29,7−12)/(24−8,3) = 1,13

  // Kronisk KOLS: pH 7,37, PaCO2 8,0 kPa (60 mmHg), HCO3 34
  const kols = { ph: 7.37, pco2: 8.0, po2: 7.5, hco3: 34, na: 140, cl: 96, albumin: 40, fio2: 0.24 };
  assert.equal(step1(kols), 'normal');
  assert.equal(step2(kols), 'resp-acidose');
  assert.equal(step3(kols).verdict, 'kronisk'); // akutt 26, kronisk 31 → 34 er innenfor ±3 av kronisk
  // mild kronisk resp. alkalose: akutt og kronisk forventning overlapper → begge godtas, hint avgjør
  const grav = { ph: 7.45, pco2: 4.2, po2: 12, hco3: 21.7, na: 138, cl: 110, albumin: 33, fio2: 0.21 };
  const g3 = step3(grav, 'resp-alkalose', { chronic: true });
  assert.equal(g3.verdict, 'kronisk');
  assert.ok(g3.ambiguous && g3.accepted.includes('akutt'));
  assert.equal(step6(kols).hypoxemic, true);

  // Oppkast: pH 7,52, PaCO2 6,4 kPa (48 mmHg), HCO3 38
  const kast = { ph: 7.52, pco2: 6.4, po2: 11, hco3: 38, na: 140, cl: 90, albumin: 40, fio2: 0.21 };
  assert.equal(step2(kast), 'met-alkalose');
  assert.equal(step3(kast).verdict, 'adekvat');
  assert.equal(step5(kast).applicable, false);

  // Salisylat: pH 7,42, PaCO2 2,7 kPa (20 mmHg), HCO3 13 → begge lesninger godtas, kasuset avgjør
  const sal = { ph: 7.42, pco2: 2.7, po2: 13, hco3: 13, na: 140, cl: 102, albumin: 40, fio2: 0.21 };
  assert.equal(step1(sal), 'normal');
  assert.equal(step2(sal), 'resp-alkalose'); // pH > 7,40 → alkalose-siden
  assert.deepEqual(acceptedPrimaries(sal, 'met-acidose'), ['met-acidose', 'resp-alkalose']);
  assert.equal(step3(sal, 'met-acidose').verdict, 'tillegg-resp-alkalose');
  assert.equal(step3(sal, 'resp-alkalose').verdict, 'tillegg-met-acidose');

  // Hjertestans: pH 7,02, PaCO2 9,3 kPa, HCO3 18 → blandet acidose
  const stans = { ph: 7.02, pco2: 9.3, po2: 9, hco3: 18, na: 140, cl: 98, albumin: 35, fio2: 1.0 };
  assert.equal(step2(stans), 'blandet-acidose');
  assert.equal(step3(stans).verdict, 'tillegg-resp-acidose');
  assert.equal(step6(stans).grade, 'alvorlig');

  const normal = { ph: 7.40, pco2: 5.3, po2: 12.5, hco3: 24.5, na: 140, cl: 104, albumin: 42, fio2: 0.21 };
  assert.equal(interpret(normal).step2, 'normal');
});
