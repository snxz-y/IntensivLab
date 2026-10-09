import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVentilator } from '../core/sim/ventilator.js';
import { PROFILES } from '../modules/respirator/profiles.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

test('(S)CMV kontroll: C=50, R=10, Vt=500, flow 60 L/min, PEEP 5 → Pplat 15, Ppeak 25', () => {
  const v = createVentilator({
    settings: { mode: 'SCMV', vt: 500, rate: 12, peep: 5, timingMode: 'ti', ti: 0.5, tip: 0, flowPattern: 'square' },
    patient: { compliance: 50, resistance: 10 },
  });
  v.run(20);
  const m = v.measurements;
  near(m.pplat, 15, 0.05);
  near(m.ppeak, 25, 0.05);
  near(m.vti, 500, 0.5);
  near(m.vte, 500, 1);
  near(m.cstat, 50, 0.2);
  near(m.rinsp, 10, 0.2);
  near(m.rcexp, 0.5, 0.02);
  near(m.drivingPressure, 10, 0.05);
  near(m.fTotal, 12, 0.05);
  near(m.expMinVol, 6, 0.05);
  near(m.autoPeep, 0, 0.05);
  assert.equal(m.breathType, 'mandatory');
});

test('(S)CMV: TIP-pause (% av syklustid) gir platå med Paw = Pplat, og middeltrykk er rimelig', () => {
  const v = createVentilator({
    settings: { mode: 'SCMV', vt: 500, rate: 15, peep: 5, timingMode: 'ti', ti: 1.0, tip: 10 }, // 10 % av 4 s = 0,4 s pause
    patient: { compliance: 50, resistance: 10 },
  });
  const samples = v.run(12);
  const pause = samples.filter((s) => s.phase === 'insp' && s.flow === 0);
  assert.ok(pause.length > 0, 'forventet pausefase');
  near(v.lastBreath.pauseTime, 0.4, 1e-9);
  near(pause[pause.length - 1].paw, 15, 0.1);
  const m = v.measurements;
  assert.ok(m.pmean > 5 && m.pmean < 15, `pmean ${m.pmean}`);
  near(m.ti, 1.0, 0.01);
  near(m.te, 3.0, 0.01);
});

test('PCV+: Pinsp = PEEP + Pcontrol, Vt bestemmes av compliance', () => {
  const v = createVentilator({
    settings: { mode: 'PCV', pcontrol: 15, rate: 15, peep: 5, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 0 },
    patient: { compliance: 50, resistance: 10 },
  });
  v.run(20);
  const m = v.measurements;
  near(m.ppeak, 20, 0.05);
  // Ti = 1,33 s, τ = 0,5 s → ca. 93 % av C·Pcontrol = 750 ml
  const expected = 50 * 15 * (1 - Math.exp(-(4 / 3) / 0.5));
  near(m.vti, expected, 3);
  near(m.pplat, 5 + m.vti / 50, 0.1);
});

test('auto-PEEP oppstår ved kort ekspirasjonstid og lang tidskonstant', () => {
  const v = createVentilator({
    settings: { mode: 'SCMV', vt: 500, rate: 24, peep: 5, timingMode: 'ie', ie: { i: 1, e: 1 } },
    patient: { compliance: 70, resistance: 20, resistanceExp: 30 }, // τexp 2,1 s, Te 1,25 s
  });
  v.run(60);
  const m = { ...v.measurements };
  assert.ok(m.autoPeep > 2, `autoPeep ${m.autoPeep}`);
  near(m.vte, 500, 5); // i steady state ekshaleres like mye som leveres
  assert.ok(m.peepTotal > m.peep);
  assert.ok(m.pplat > 5 + 500 / 70 + 2, 'platå løftes av auto-PEEP');

  // Lengre ekspirasjonstid fjerner auto-PEEP
  // Te = 6 s ≈ 2,9 τexp → < 6 % av Vt igjen → auto-PEEP ≈ 0,4
  v.setSettings({ rate: 8, ie: { i: 1, e: 4 } });
  v.run(60);
  assert.ok(v.measurements.autoPeep < 0.6, `autoPeep etter ${v.measurements.autoPeep}`);
  assert.ok(v.measurements.autoPeep < m.autoPeep / 4);
});

test('inspiratorisk hold måler Pplat, ekspiratorisk hold måler total PEEP', () => {
  const v = createVentilator({
    settings: { mode: 'SCMV', vt: 500, rate: 24, peep: 5, timingMode: 'ie', ie: { i: 1, e: 1 } },
    patient: { compliance: 70, resistance: 20, resistanceExp: 30 },
  });
  v.run(40);
  const autoBefore = v.measurements.autoPeep;
  const pplatBefore = v.measurements.pplat;

  v.requestHold('insp');
  const s1 = v.run(2);
  assert.ok(s1.some((s) => s.phase === 'hold-insp'), 'insp hold ble aktivert');
  v.releaseHold();
  v.run(5);
  assert.ok(v.holdResult?.type === 'insp');
  near(v.holdResult.pplat, pplatBefore, 0.5);
  near(v.measurements.pplatMeasured, pplatBefore, 0.5);
  v.run(30); // tilbake til steady state før neste manøver

  v.requestHold('exp');
  const s2 = v.run(3);
  assert.ok(s2.some((s) => s.phase === 'hold-exp'), 'exp hold ble aktivert');
  v.releaseHold();
  v.run(5);
  assert.equal(v.holdResult.type, 'exp');
  near(v.holdResult.autoPeep, autoBefore, 0.5);
  near(v.measurements.autoPeepMeasured, autoBefore, 0.5);
});

test('SPONT: pasientinnsats trigger trykkstøtte, syklus ved ETS, frekvens følger pasienten', () => {
  const v = createVentilator({
    settings: { mode: 'SPONT', psupport: 10, peep: 5, ets: 25, pramp: 50, trigger: { type: 'flow', value: 2 } },
    patient: { compliance: 50, resistance: 10, effort: { amplitude: 8, rate: 16, duration: 1.0 } },
  });
  v.run(30);
  const m = v.measurements;
  assert.equal(m.breathType, 'spont');
  assert.equal(m.cycleReason, 'ETS');
  near(m.fTotal, 16, 0.5);
  near(m.ppeak, 15, 0.2);
  assert.ok(m.vti > 300, `vti ${m.vti}`);
});

test('SPONT uten egenpust: backup-ventilasjon etter apnétid', () => {
  const v = createVentilator({
    settings: { mode: 'SPONT', psupport: 10, peep: 5, apneaTime: 10, backup: { rate: 12, pcontrol: 15 } },
    patient: { compliance: 50, resistance: 10, effort: { amplitude: 0 } },
  });
  const s = v.run(8);
  assert.ok(s.every((x) => x.breathType === null), 'ingen pust før apnétid');
  v.run(15);
  assert.equal(v.measurements.breathType, 'backup');
  assert.ok(v.backupActive);
  near(v.measurements.ppeak, 20, 0.1);
  // pasienten begynner å puste → tilbake til SPONT
  v.setPatient({ effort: { amplitude: 8, rate: 15 } });
  v.run(20);
  assert.equal(v.measurements.breathType, 'spont');
  assert.ok(!v.backupActive);
});

test('(S)CMV: pasienttrigger gir mandatorisk pust ved pasientens frekvens', () => {
  const v = createVentilator({
    settings: { mode: 'SCMV', vt: 450, rate: 10, peep: 5, trigger: { type: 'pressure', value: 2 } },
    patient: { compliance: 50, resistance: 10, effort: { amplitude: 6, rate: 18, duration: 1.0 } },
  });
  v.run(30);
  const m = v.measurements;
  assert.equal(m.breathType, 'triggered');
  near(m.fTotal, 18, 0.6);
  near(m.vti, 450, 1);
});

test('manuell pust leveres straks i ekspirasjonsfasen', () => {
  const v = createVentilator({ settings: { mode: 'SCMV', vt: 500, rate: 6, peep: 5 }, patient: { compliance: 50, resistance: 10 } });
  v.run(3.5); // midt i en lang ekspirasjon
  assert.equal(v.phase, 'exp');
  assert.ok(v.manualBreath());
  assert.equal(v.phase, 'insp');
});

test('trykkbegrensning: VC leverer mindre volum når Paw ville overstige Plimit, høytrykk avbryter', () => {
  // R=40 → Ppeak ville blitt 5 + 10 + 40 = 55 > Plimit 30
  const v = createVentilator({ settings: { mode: 'SCMV', vt: 500, rate: 12, peep: 5, timingMode: 'ti', ti: 0.5, pmax: 40 }, patient: { compliance: 50, resistance: 40 } });
  v.run(20);
  const m = v.measurements;
  assert.ok(m.pressureLimited, 'skal være trykkbegrenset');
  assert.ok(m.ppeak <= 30.5, `ppeak ${m.ppeak}`);
  assert.ok(m.vti < 450, `vti ${m.vti}`);
  // PCV: Pcontrol 40 over PEEP 5 begrenses til Plimit 30
  const p = createVentilator({ settings: { mode: 'PCV', pcontrol: 40, rate: 12, peep: 5, pmax: 40 }, patient: { compliance: 50, resistance: 10 } });
  p.run(20);
  assert.ok(p.measurements.ppeak <= 30.1 && p.measurements.pressureLimited);
  // Pasient som biter (R 60) i VC med Pmax 30: Paw når Pmax? Plimit holder den under, så ingen høytrykk
  const b = createVentilator({ settings: { mode: 'SCMV', vt: 500, rate: 12, peep: 5, pmax: 30 }, patient: { compliance: 50, resistance: 60 } });
  b.run(20);
  assert.ok(b.measurements.ppeak <= 20.5);
});

test('innstillingsendring virker fra neste pust', () => {
  const v = createVentilator({ settings: { mode: 'SCMV', vt: 500, rate: 15, peep: 5 }, patient: { compliance: 50, resistance: 10 } });
  v.run(10);
  v.setSettings({ vt: 300, peep: 10 });
  v.run(20);
  near(v.measurements.vti, 300, 1);
  near(v.measurements.pplat, 10 + 300 / 50, 0.2);
});

test('pasientprofiler: ARDS gir høyt drivtrykk ved 500 ml, obstruktiv gir auto-PEEP ved høy frekvens', () => {
  const ards = PROFILES.find((p) => p.id === 'ards');
  const v1 = createVentilator({ settings: { mode: 'SCMV', vt: 500, rate: 15, peep: 10 }, patient: ards.patient });
  v1.run(20);
  assert.ok(v1.measurements.drivingPressure > 15, `ΔP ${v1.measurements.drivingPressure}`);

  const obs = PROFILES.find((p) => p.id === 'obstruktiv');
  const v2 = createVentilator({ settings: { mode: 'SCMV', vt: 500, rate: 25, peep: 5, ie: { i: 1, e: 1 } }, patient: { ...obs.patient, effort: { amplitude: 0 } } });
  v2.run(60);
  assert.ok(v2.measurements.autoPeep > 3, `autoPEEP ${v2.measurements.autoPeep}`);
});

test('volum i prøver starter på 0 ved hver pust og VTE ≈ VTI i steady state', () => {
  const v = createVentilator({ settings: { mode: 'PCV', pcontrol: 12, rate: 14, peep: 6 }, patient: { compliance: 40, resistance: 12 } });
  v.run(10);
  const s = v.run(60 / 14);
  const minV = Math.min(...s.map((x) => x.volume));
  assert.ok(minV >= -1 && minV < 5, `min volum ${minV}`);
  near(v.measurements.vte, v.measurements.vti, 2);
});
