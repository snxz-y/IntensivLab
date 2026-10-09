import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITUATIONS, ACTIONS, createSituation, gasForProfile, computeVitals } from '../modules/respirator/scenarios.js';
import { createVentilator } from '../core/sim/ventilator.js';
import { createGasModel } from '../core/sim/gasModel.js';
import { getProfile } from '../modules/respirator/profiles.js';

function rig(def, variantIndex = 0) {
  const profile = getProfile(def.profileId);
  const patient = { ...structuredClone(profile.patient), ...(def.patient ?? {}) };
  const vent = createVentilator({ settings: def.settings, patient });
  const gas = createGasModel(def.gas ?? gasForProfile(def.profileId));
  const hooks = {
    getPatient: () => vent.patient, setPatient: (p) => vent.setPatient(p),
    getGas: () => ({ ...gas.params }), setGas: (g) => gas.setParams(g),
    setDisconnected: (v) => vent.setDisconnected(v),
  };
  const rng = (() => { let i = 0; return () => (i++ === 0 ? variantIndex / def.variants.length + 1e-6 : 0.5); })();
  const sit = createSituation(def, { rng, hooks });
  const update = () => {
    const m = vent.measurements;
    gas.setVentilation({ vtMl: vent.disconnected ? 0 : (m.vte ?? 0), rate: m.fTotal ?? 0, fio2: vent.settings.fio2 / 100, peep: m.peepTotal ?? vent.settings.peep, ibwKg: m.ibw ?? 70 });
  };
  const run = (seconds) => { for (let i = 0; i < seconds; i++) { vent.run(1); update(); gas.step(1); sit.tick(vent.time, { m: vent.measurements, gas: gas.state, settings: vent.settings, pmax: 40, disconnected: vent.disconnected }); } };
  return { vent, gas, sit, run };
}

test('alle situasjoner har komplette handlingstabeller', () => {
  for (const def of SITUATIONS) {
    for (const v of def.variants) {
      for (const id of Object.keys(ACTIONS)) {
        if (ACTIONS[id].kind === 'undersok') assert.ok(v.clues[id], `${def.id}/${v.id} mangler ledetråd ${id}`);
        else assert.ok(v.fixes[id] || v.harmful[id] || v.neutral[id], `${def.id}/${v.id} mangler tekst for ${id}`);
      }
      assert.ok(v.explanation.length > 50);
    }
  }
});

test('biting: hendelsen slår inn, Ppeak stiger, bittblokk løser', () => {
  const { vent, sit, run } = rig(SITUATIONS.find((s) => s.id === 'biting'));
  vent.run(20); sit.start(vent.time);
  run(5);
  const before = vent.measurements.ppeak;
  assert.equal(sit.state.status, 'baseline');
  assert.equal(sit.act('bittblokk', vent.time).kind, 'for-tidlig');
  run(40);
  assert.equal(sit.state.status, 'active');
  assert.ok(vent.measurements.ppeak > before + 10, `Ppeak ${before} → ${vent.measurements.ppeak}`);
  assert.equal(sit.act('se', vent.time).kind, 'ledetrad');
  assert.equal(sit.act('sug', vent.time).kind, 'noytral');
  assert.equal(sit.act('bittblokk', vent.time).kind, 'riktig');
  run(30);
  assert.equal(sit.state.status, 'resolved');
  const sum = sit.summary();
  assert.ok(sum.solved && sum.timeToFix > 0 && sum.wrongActions === 2);
});

test('snuing/derekruttering: SpO2 faller, rekruttering løser; tubemigrasjon krever tubejustering', () => {
  const a = rig(SITUATIONS.find((s) => s.id === 'snuing'), 0);
  a.vent.run(30); a.sit.start(a.vent.time); a.run(10);
  a.gas.settle();
  const spo2Before = a.gas.state.spo2;
  a.run(90);
  assert.equal(a.sit.variant.id, 'derekruttering');
  assert.ok(a.gas.state.spo2 < spo2Before - 0.04, `SpO2 ${spo2Before} → ${a.gas.state.spo2}`);
  assert.equal(a.sit.act('rekruttering', a.vent.time).kind, 'riktig');
  a.run(90);
  assert.equal(a.sit.state.status, 'resolved');

  const b = rig(SITUATIONS.find((s) => s.id === 'snuing'), 1);
  b.vent.run(30); b.sit.start(b.vent.time); b.run(60);
  assert.equal(b.sit.variant.id, 'tubemigrasjon');
  assert.equal(b.sit.act('rekruttering', b.vent.time).kind, 'skadelig');
  assert.equal(b.sit.act('tube', b.vent.time).kind, 'riktig');
  b.run(60);
  assert.equal(b.sit.state.status, 'resolved');
});

test('frakobling: Paw ≈ 0 og VTE ≈ 0, SpO2 faller, tilkobling løser', () => {
  const { vent, gas, sit, run } = rig(SITUATIONS.find((s) => s.id === 'frakobling'));
  vent.run(30); sit.start(vent.time); run(5); gas.settle();
  run(180);
  assert.ok(vent.disconnected);
  assert.ok(vent.measurements.ppeak < 3, `ppeak ${vent.measurements.ppeak}`);
  assert.ok(vent.measurements.vte < 30, `vte ${vent.measurements.vte}`);
  assert.ok(gas.state.spo2 < 0.92, `spo2 ${gas.state.spo2}`);
  assert.equal(sit.act('sedasjon', vent.time).kind, 'skadelig');
  assert.equal(sit.act('koble', vent.time).kind, 'riktig');
  assert.ok(!vent.disconnected);
  run(120);
  assert.equal(sit.state.status, 'resolved');
});

test('bronkospasme: gradvis auto-PEEP, bronkodilatator med gradvis effekt', () => {
  const { vent, sit, run } = rig(SITUATIONS.find((s) => s.id === 'bronkospasme'));
  vent.run(30); sit.start(vent.time); run(100);
  assert.ok(vent.measurements.autoPeep > 3, `autoPEEP ${vent.measurements.autoPeep}`);
  assert.equal(sit.act('bronkodilatator', vent.time).kind, 'riktig');
  run(30);
  assert.ok(vent.patient.resistanceExp > getProfile('obstruktiv').patient.resistanceExp, 'effekten kommer gradvis');
  run(150);
  assert.equal(sit.state.status, 'resolved');
});

test('asynkroni løses ved bytte til SPONT', () => {
  const { vent, sit, run } = rig(SITUATIONS.find((s) => s.id === 'asynkroni'));
  vent.run(30); sit.start(vent.time); run(60);
  assert.equal(sit.state.status, 'active');
  assert.ok(vent.measurements.fTotal > 20, `fTotal ${vent.measurements.fTotal}`);
  vent.setSettings({ mode: 'SPONT', psupport: 12, peep: 8 });
  run(60);
  assert.equal(sit.state.status, 'resolved');
  assert.equal(sit.summary().timeToFix, null); // løst uten «tiltak»
});

test('meldinger: skriptede ledetråder kommer i rekkefølge, automatiske alarmer én gang', () => {
  const { vent, gas, sit, run } = rig(SITUATIONS.find((s) => s.id === 'pneumothorax'));
  vent.run(30); sit.start(vent.time); run(5); gas.settle();
  assert.equal(sit.drain().length, 0);
  run(120);
  const msgs = sit.drain();
  assert.ok(msgs.length >= 3, `fikk ${msgs.length} meldinger`);
  assert.equal(msgs[0].who, 'obs');
  assert.ok(msgs.some((m) => m.who === 'kollega'));
  assert.ok(msgs.every((m) => typeof m.t === 'number' && m.text.length > 5));
  const v = sit.vitals({ gas: gas.state });
  assert.ok(v.hr > 100 && v.sys < 100, JSON.stringify(v));
  assert.equal(sit.drain().length, 0);
});

test('computeVitals: hypoksi gir takykardi, fiks demper effekten', () => {
  const base = { hr: 78, sys: 122, dia: 68, temp: 37 };
  assert.equal(computeVitals(base, { hr: 30 }, 1, 0.97).hr, 108);
  assert.ok(computeVitals(base, { hr: 30 }, 1, 0.85).hr > 108);
  assert.equal(computeVitals(base, { hr: 30 }, 0, 0.97).hr, 78);
});

test('end() setter pasienten tilbake', () => {
  const { vent, gas, sit, run } = rig(SITUATIONS.find((s) => s.id === 'pneumothorax'));
  const c0 = vent.patient.compliance;
  vent.run(30); sit.start(vent.time); run(80);
  assert.ok(vent.patient.compliance < c0 * 0.6);
  sit.end();
  assert.equal(vent.patient.compliance, c0);
  assert.equal(gas.params.shunt, gasForProfile('normal').shunt);
});
