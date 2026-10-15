import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITUATIONS, createSituation, gasForProfile } from '../modules/respirator/scenarios.js';
import { CHILD_SITUATIONS } from '../modules/respirator/childCases.js';
import { createVentilator } from '../core/sim/ventilator.js';
import { createGasModel } from '../core/sim/gasModel.js';
import { getProfile } from '../modules/respirator/profiles.js';
import { idealBodyWeightHamilton, idealBodyWeightChild } from '../core/physiology/respiratory.js';

/** Samme oppsett som i UI-et: VTI til gassmodellen, startgass, pasient i ctx. */
function rig(id) {
  const def = SITUATIONS.find((s) => s.id === id);
  const patient = { ...structuredClone(getProfile(def.profileId).patient), ...structuredClone(def.patient ?? {}) };
  const vent = createVentilator({ settings: structuredClone(def.settings), patient });
  const gas = createGasModel({ petGap: 0.5, ...(def.gas ?? gasForProfile(def.profileId)) });
  const hooks = {
    getPatient: () => vent.patient, setPatient: (p) => vent.setPatient(p), getGas: () => ({ ...gas.params }), setGas: (g) => gas.setParams(g),
    setDisconnected: (v) => vent.setDisconnected(v), setLeak: (f) => vent.setLeak(f), setTriggerNoise: (n, md) => vent.setTriggerNoise(n, md),
    setArtifacts: (a) => vent.setArtifacts(a), cough: () => vent.cough(),
  };
  const upd = () => { const m = vent.measurements; gas.setVentilation({ vtMl: vent.disconnected ? 0 : (m.vti ?? m.vte ?? 0), rate: m.fTotal ?? 0, fio2: vent.settings.fio2 / 100, peep: m.peepTotal ?? vent.settings.peep, ibwKg: m.ibw }); };
  vent.run(20); upd(); gas.settle();
  if (def.gasStart) Object.assign(gas.state, def.gasStart);
  const sit = createSituation(def, { rng: () => 0.5, hooks });
  const msgs = [];
  sit.start(vent.time);
  const ctx = () => ({ m: vent.measurements, gas: gas.state, settings: vent.settings, pmax: vent.settings.pmax, disconnected: vent.disconnected, patient: vent.patient });
  const run = (sec) => { for (let i = 0; i < sec; i++) { vent.run(1); upd(); gas.step(1); sit.tick(vent.time, ctx()); msgs.push(...sit.drain()); } };
  const toJuster = () => {
    for (let i = 0; i < 120 && !sit.decision; i++) run(1);
    sit.skipToActions(vent.time); run(2);
    assert.ok(sit.decision && sit.decision.kind === 'tiltak', `${id}: tiltaksvalg`);
    assert.ok(sit.decision.options.some((o) => o.id === 'juster'), `${id}: «Juster respiratoren» er et valg`);
    sit.choose('juster', vent.time);
  };
  const until = (n) => { for (let i = 0; i < n && sit.state.status !== 'resolved'; i++) run(1); return sit.state.status === 'resolved'; };
  const theory = (kind) => msgs.filter((x) => x.who === 'teori' && (!kind || x.kind === kind));
  return { def, vent, gas, sit, run, toJuster, until, theory, ctx };
}

/** For hver case: hva som skjer, en feil justering som ikke skal løse, og riktig justering. */
const PLANS = {
  'barn-voksenoppsett': { wait: 30, wrong: [{ vt: 150, rate: 22 }], right: [{ patient: { height: 116 } }, { vt: 150, rate: 22 }], check: (R) => assert.ok(R.vent.measurements.pplat > 28) },
  'barn-pards-oksygenering': { wait: 90, wrong: [{ fio2: 100 }], right: [{ fio2: 60, peep: 12 }], check: (R) => assert.ok(R.gas.state.spo2 < 0.91) },
  'barn-pards-vt': { wait: 90, wrong: [{ rate: 30 }], right: [{ vt: 165, rate: 30 }], check: (R) => assert.ok(R.vent.measurements.pplat > 28 && R.vent.measurements.drivingPressure > 15) },
  'barn-astma': { wait: 90, wrong: [{ rate: 30 }], right: [{ rate: 12, ie: { i: 1, e: 4 } }], check: (R) => assert.ok(R.vent.measurements.autoPeep > 6) },
  'barn-bronkiolitt': { wait: 90, wrong: [{ pcontrol: 22 }], right: [{ pcontrol: 16, rate: 25 }], check: (R) => assert.ok(R.vent.measurements.autoPeep > 3) },
  'barn-dka': { wait: 20, wrong: [{ vt: 290, rate: 18 }], right: [{ rate: 30, vt: 310 }], check: (R) => assert.ok(R.gas.state.target.paco2 > 4.5) },
  'barn-hodeskade': { wait: 20, wrong: [{ rate: 30 }], right: [{ rate: 15 }], check: (R) => assert.ok(R.gas.state.paco2 < 3.5) },
  'barn-lekkasje-autotrigging': { wait: 40, wrong: [{ pcontrol: 10 }], right: [{ pcontrol: 12, trigger: { type: 'flow', value: 3 } }], check: (R) => assert.ok(R.vent.measurements.fTotal > 36) },
  'barn-nevromuskulaer': { wait: 120, wrong: [{ psupport: 9 }], right: [{ psupport: 13 }], check: (R) => assert.ok(R.vent.measurements.fTotal >= 32 && R.vent.measurements.vtPerKg < 5.5) },
  'barn-ekstubasjonstest': { wait: 20, wrong: [{ mode: 'PCV', pcontrol: 12, rate: 22 }], right: [{ mode: 'SPONT', psupport: 0, peep: 5 }], check: () => {} },
  'barn-pcv-bedring': { wait: 120, wrong: [{ peep: 6 }], right: [{ peep: 8, pcontrol: 9 }], check: (R) => assert.ok(R.vent.measurements.vtPerKg > 9.5) },
  'barn-hyperoksi': { wait: 20, wrong: [{ fio2: 21 }], right: [{ fio2: 35 }], check: (R) => assert.ok(R.gas.state.spo2 > 0.985) },
};

const apply = (R, step) => { if (step.patient) R.vent.setPatient(step.patient); else R.vent.setSettings(step); };

test('barnecaser: minst 10, alle merket som barn og med mål og teori', () => {
  assert.ok(CHILD_SITUATIONS.length >= 10);
  for (const def of CHILD_SITUATIONS) {
    assert.ok(def.pediatric, def.id);
    assert.ok(def.patient.height < 152 || def.id === 'barn-voksenoppsett', `${def.id}: barnehøyde`);
    for (const v of def.variants) {
      assert.ok(v.ventFix && v.fixes.juster, `${def.id}: løses med respiratorjustering`);
      assert.ok(v.target && v.target.length > 20, `${def.id}: mål`);
      assert.ok(v.teach && v.teach.some((r) => (r.kind ?? 'riktig') === 'riktig'), `${def.id}: «Riktig!»-teori`);
      assert.ok(v.teach.every((r) => r.text.length > 30), `${def.id}: teoritekster`);
    }
  }
  assert.ok(Object.keys(PLANS).length === CHILD_SITUATIONS.length, 'alle barnecaser er testet');
});

for (const [id, plan] of Object.entries(PLANS)) {
  test(`barnecase ${id}: hendelsen gir avvik, feil justering løser ikke, riktig justering løser og gir teori`, () => {
    // feil vei
    let R = rig(id);
    R.run(plan.wait);
    plan.check(R);
    assert.notEqual(R.sit.state.status, 'resolved', 'ikke løst før tiltak');
    R.toJuster();
    for (const st of plan.wrong) apply(R, st);
    R.run(60);
    assert.notEqual(R.sit.state.status, 'resolved', `feil justering ${JSON.stringify(plan.wrong)} skal ikke løse`);
    // riktig vei
    R = rig(id);
    R.run(plan.wait);
    R.toJuster();
    for (const st of plan.right) apply(R, st);
    assert.ok(R.until(300), `riktig justering ${JSON.stringify(plan.right)} løser`);
    assert.ok(R.theory('riktig').length >= 1, 'minst én «Riktig!»-melding');
    assert.ok(R.theory().every((m) => m.text.length > 20));
  });
}

test('barne-IBW: Traub–Kichen under 152 cm, voksenformel over', () => {
  assert.ok(Math.abs(idealBodyWeightChild(116) - 20.8) < 0.2);
  assert.ok(Math.abs(idealBodyWeightHamilton(76, 'M') - 9.9) < 0.2);
  assert.equal(idealBodyWeightHamilton(102, 'M'), idealBodyWeightHamilton(102, 'K'), 'kjønnsuavhengig for barn');
  assert.ok(Math.abs(idealBodyWeightHamilton(175, 'M') - 70.9) < 0.2, 'voksne uendret');
});

test('DKA: PaCO2 starter lavt og stiger mot steady state når minuttvolumet er for lavt', () => {
  const R = rig('barn-dka');
  assert.ok(R.gas.state.paco2 < 2.6);
  const before = R.gas.state.paco2;
  R.run(60);
  assert.ok(R.gas.state.paco2 > before + 0.5, 'PaCO2 stiger etter intubasjon');
});

test('effortFn: nevromuskulær pasient roer pusten når støtten er nok', () => {
  const R = rig('barn-nevromuskulaer');
  R.run(120); R.toJuster();
  const fBefore = R.vent.measurements.fTotal;
  R.vent.setSettings({ psupport: 13 }); R.run(60);
  assert.ok(R.vent.measurements.fTotal < fBefore - 8, `frekvensen faller (${fBefore} → ${R.vent.measurements.fTotal})`);
});
