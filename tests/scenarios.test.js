import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITUATIONS, ACTIONS, createSituation, gasForProfile, computeVitals, DEFAULT_NEUTRAL } from '../modules/respirator/scenarios.js';
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
    setLeak: (f) => vent.setLeak(f),
    setTriggerNoise: (n) => vent.setTriggerNoise(n),
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
        if (ACTIONS[id].kind === 'undersok') { if (['lytt', 'se', 'krets'].includes(id)) assert.ok(v.clues[id], `${def.id}/${v.id} mangler ledetråd ${id}`); }
        else if (id !== 'juster') assert.ok(v.fixes[id] || v.harmful[id] || v.neutral[id] || DEFAULT_NEUTRAL[id], `${def.id}/${v.id} mangler tekst for ${id}`);
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

test('beslutningsflyt: undersøkelser, så tiltak 1 av 5, riktig tiltak avslutter valgene', () => {
  const { vent, sit, run } = rig(SITUATIONS.find((s) => s.id === 'frakobling'));
  vent.run(30); sit.start(vent.time); run(5);
  assert.equal(sit.decision, null);
  for (let i = 0; i < 60 && !sit.decision; i++) run(1);
  assert.ok(sit.decision && sit.decision.kind === 'undersok', 'første valg er undersøkelse');
  assert.ok(vent.time - sit.state.tFired <= 8, 'frakoblingsalarmen gir første valg raskt');
  assert.equal(sit.decision.options.length, 5);
  const r0 = sit.choose('blodgass', vent.time);
  assert.equal(r0.kind, 'ledetrad');
  assert.equal(sit.decision, null);
  run(3);
  assert.equal(sit.decision, null, 'pause mellom valg');
  run(2);
  assert.ok(sit.decision && sit.decision.kind === 'undersok', 'blodgass avslørte ikke årsaken: ny undersøkelsesrunde');
  assert.ok(sit.decision.skippable, 'kan hoppe rett til tiltak etter første undersøkelse');
  const r1 = sit.choose('krets', vent.time);
  assert.equal(r1.kind, 'ledetrad');
  run(2);
  assert.equal(sit.decision, null, 'kort pause etter avslørende undersøkelse');
  run(2);
  assert.ok(sit.decision && sit.decision.kind === 'tiltak', 'avslørende undersøkelse (kretsen er frakoblet) går rett til tiltak');
  assert.ok(sit.decision.options.some((o) => o.id === 'koble'), 'riktig tiltak er med');
  assert.ok(sit.decision.options.some((o) => o.id === 'juster'), '«Juster respiratoren» er med');
  const wrong = sit.decision.options.find((o) => o.id !== 'koble' && o.id !== 'juster');
  sit.choose(wrong.id, vent.time);
  run(7);
  assert.ok(sit.decision && sit.decision.kind === 'tiltak', 'nytt tiltaksvalg etter feil');
  assert.ok(!sit.decision.options.some((o) => o.id === wrong.id), 'prøvd alternativ er borte');
  sit.choose('koble', vent.time);
  run(7);
  assert.equal(sit.decision, null, 'ingen flere valg etter riktig tiltak');
  assert.ok(sit.decisionDone);
  assert.ok(!vent.disconnected);
  run(12);
  assert.equal(sit.state.status, 'resolved', 'løst etter at kriteriet har holdt i resolveHold sekunder');
});

test('cuff-lekkasje: VTE faller under VTI, cuff løser', () => {
  const { vent, sit, run } = rig(SITUATIONS.find((s) => s.id === 'cuff-lekkasje'));
  vent.run(30); sit.start(vent.time); run(90);
  assert.ok(vent.measurements.vte < vent.measurements.vti * 0.7, `vte ${vent.measurements.vte} vti ${vent.measurements.vti}`);
  sit.skipToActions(vent.time); run(3);
  assert.equal(sit.choose('cuff', vent.time).kind, 'riktig');
  run(40);
  assert.equal(sit.state.status, 'resolved');
});

test('PEEP-hypotensjon løses ved å senke PEEP (juster respiratoren)', () => {
  const { vent, sit, run } = rig(SITUATIONS.find((s) => s.id === 'peep-hypotensjon'));
  vent.run(30); sit.start(vent.time); run(40);
  sit.skipToActions(vent.time); run(3);
  assert.equal(sit.choose('juster', vent.time).kind, 'riktig');
  vent.setSettings({ peep: 8 });
  run(30);
  assert.equal(sit.state.status, 'resolved');
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

function toActions(R) { for (let i = 0; i < 90 && !R.sit.decision; i++) R.run(1); R.sit.skipToActions(R.vent.time); R.run(2); assert.ok(R.sit.decision && R.sit.decision.kind === 'tiltak', 'tiltaksvalg'); }
function untilResolved(R, maxSec) { for (let i = 0; i < maxSec && R.sit.state.status !== 'resolved'; i++) R.run(1); return R.sit.state.status === 'resolved'; }

test('avvenning: utmattelse gir RSB > 105, mer trykkstøtte løser', () => {
  const R = rig(SITUATIONS.find((s) => s.id === 'avvenning-utmattelse'));
  R.vent.run(30); R.sit.start(R.vent.time); R.run(160);
  const m = R.vent.measurements;
  assert.ok(m.fTotal >= 28 && m.vte < 320, `rask overfladisk pust: f ${m.fTotal}, VTE ${m.vte}`);
  assert.ok(m.fTotal / (m.vte / 1000) > 105, 'RSB over 105');
  assert.notEqual(R.sit.state.status, 'resolved');
  toActions(R);
  assert.equal(R.sit.choose('juster', R.vent.time).kind, 'riktig');
  R.run(20); assert.notEqual(R.sit.state.status, 'resolved', 'ikke løst før trykkstøtten faktisk økes');
  R.vent.setSettings({ psupport: 14 });
  assert.ok(untilResolved(R, 120), 'løst med Ps 14');
});

test('autotrigging: kondens gir høy frekvens uten egeninnsats; tømming eller mindre følsom trigger løser', () => {
  let R = rig(SITUATIONS.find((s) => s.id === 'autotrigging'));
  R.vent.run(30); R.sit.start(R.vent.time); R.run(90);
  assert.ok(R.vent.measurements.fTotal >= 24, `autotrigget frekvens ${R.vent.measurements.fTotal}`);
  toActions(R);
  assert.ok(R.sit.decision.options.some((o) => o.id === 'kondens'));
  assert.equal(R.sit.choose('kondens', R.vent.time).kind, 'riktig');
  assert.ok(untilResolved(R, 60));
  assert.ok(R.vent.measurements.fTotal <= 17);
  R = rig(SITUATIONS.find((s) => s.id === 'autotrigging'));
  R.vent.run(30); R.sit.start(R.vent.time); R.run(90); toActions(R);
  assert.equal(R.sit.choose('juster', R.vent.time).kind, 'delvis');
  R.run(15); assert.notEqual(R.sit.state.status, 'resolved');
  R.vent.setSettings({ trigger: { type: 'flow', value: 5 } });
  assert.ok(untilResolved(R, 60), 'løst med flowtrigger 5');
});

test('overassistanse: Vt over 8 ml/kg og lav frekvens; lavere trykkstøtte løser', () => {
  const R = rig(SITUATIONS.find((s) => s.id === 'overassistanse'));
  R.vent.run(30); R.sit.start(R.vent.time); R.run(200);
  assert.ok(R.vent.measurements.vtPerKg > 8.5, `Vt/IBW ${R.vent.measurements.vtPerKg}`);
  assert.ok(R.vent.measurements.fTotal <= 12);
  toActions(R); R.sit.choose('juster', R.vent.time);
  R.run(20); assert.notEqual(R.sit.state.status, 'resolved');
  R.vent.setSettings({ psupport: 6 });
  assert.ok(untilResolved(R, 60));
});

test('(S)CMV+: når pasienten slutter å trigge, faller frekvensen til innstilt rate; rate opp eller sedasjon ned løser', () => {
  let R = rig(SITUATIONS.find((s) => s.id === 'scmv-slutter-trigge'));
  R.vent.run(30); R.sit.start(R.vent.time); R.run(60);
  assert.equal(Math.round(R.vent.measurements.fTotal), 18);
  R.run(120);
  assert.equal(Math.round(R.vent.measurements.fTotal), 12, 'faller til gulvet');
  assert.ok(R.vent.measurements.expMinVol < 6.5);
  assert.notEqual(R.sit.state.status, 'resolved');
  toActions(R); R.sit.choose('juster', R.vent.time); R.vent.setSettings({ rate: 16 });
  assert.ok(untilResolved(R, 60), 'løst med rate 16');
  R = rig(SITUATIONS.find((s) => s.id === 'scmv-slutter-trigge'));
  R.vent.run(30); R.sit.start(R.vent.time); R.run(180); toActions(R);
  assert.equal(R.sit.choose('sedasjonNed', R.vent.time).kind, 'riktig');
  assert.ok(untilResolved(R, 150), 'løst når han trigger igjen');
  R.run(30);
  assert.ok(R.vent.measurements.fTotal >= 16, `trigger igjen: f ${R.vent.measurements.fTotal}`);
});

test('PCV+ ved ARDS: stivere lunge gir lavt Vt og SpO2; høyere rate, PEEP og O2 med drivtrykk ≤ 15 løser', () => {
  const R = rig(SITUATIONS.find((s) => s.id === 'pcv-ards-vt-faller'));
  R.vent.run(30); R.sit.start(R.vent.time); R.run(200);
  const m = R.vent.measurements;
  assert.ok(m.vtPerKg < 4.6 && m.expMinVol < 6.5, `Vt/IBW ${m.vtPerKg}, MV ${m.expMinVol}`);
  assert.notEqual(R.sit.state.status, 'resolved');
  toActions(R); R.sit.choose('juster', R.vent.time);
  R.vent.setSettings({ pcontrol: 22, rate: 28, peep: 12, fio2: 70 }); R.run(40);
  assert.notEqual(R.sit.state.status, 'resolved', 'drivtrykk over 15 løser ikke');
  R.vent.setSettings({ pcontrol: 15 });
  assert.ok(untilResolved(R, 90), 'løst med ΔP 15, rate 28, PEEP 12, O2 70');
});

test('KOLS i SPONT: sekret gir lavt Vt og høy frekvens; suging løser', () => {
  const R = rig(SITUATIONS.find((s) => s.id === 'spont-sekret-kols'));
  R.vent.run(30); R.sit.start(R.vent.time); R.run(160);
  assert.ok(R.vent.measurements.vtPerKg < 4 && R.vent.measurements.fTotal >= 24);
  toActions(R);
  assert.equal(R.sit.choose('sug', R.vent.time).kind, 'riktig');
  assert.ok(untilResolved(R, 90));
});

test('valgflyt: «Juster respiratoren» vises bare én gang, og ventepausen kan hoppes over', () => {
  const R = rig(SITUATIONS.find((s) => s.id === 'avvenning-utmattelse'));
  R.vent.run(30); R.sit.start(R.vent.time); R.run(160); toActions(R);
  const ids = R.sit.decision.options.map((o) => o.id);
  assert.equal(ids.filter((id) => id === 'juster').length, 1);
  assert.equal(ids.length, 5);
  R.sit.choose(ids.find((id) => id !== 'juster'), R.vent.time);
  assert.ok(R.sit.nextDecisionIn(R.vent.time) > 2, 'pause før neste valg');
  R.sit.skipWait(R.vent.time); R.run(1);
  assert.ok(R.sit.decision, 'valg tilgjengelig straks etter «Gå videre nå»');
});
