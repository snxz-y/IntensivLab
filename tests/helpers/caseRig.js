/**
 * Testrigg for caser: samme oppsett som i UI-et (VTI til gassmodellen, startgass, pasient i ctx).
 * Brukes av barnecase- og voksencasetestene.
 */
import assert from 'node:assert/strict';
import { SITUATIONS, createSituation, gasForProfile } from '../../modules/respirator/scenarios.js';
import { createVentilator } from '../../core/sim/ventilator.js';
import { createGasModel } from '../../core/sim/gasModel.js';
import { getProfile } from '../../modules/respirator/profiles.js';

export function rig(id) {
  const def = SITUATIONS.find((s) => s.id === id);
  assert.ok(def, `fant ikke case ${id}`);
  const patient = { group: 'adult', weightKg: null, ...structuredClone(getProfile(def.profileId).patient), ...structuredClone(def.patient ?? {}) };
  const vent = createVentilator({ settings: { trigger: { type: 'flow', value: 2 }, ...structuredClone(def.settings) }, patient });
  const gas = createGasModel({ petGap: 0.5, vco2: 200, hbGL: 120, deadspaceMl: null, ...(def.gas ?? gasForProfile(def.profileId)) });
  const hooks = {
    getPatient: () => vent.patient, setPatient: (p) => vent.setPatient(p), getGas: () => ({ ...gas.params }), setGas: (g) => gas.setParams(g),
    setDisconnected: (v) => vent.setDisconnected(v), setLeak: (f) => vent.setLeak(f), setTriggerNoise: (n, md) => vent.setTriggerNoise(n, md),
    setArtifacts: (a) => vent.setArtifacts(a), cough: () => vent.cough(),
  };
  const upd = () => { const m = vent.measurements; gas.setVentilation({ vtMl: vent.disconnected ? 0 : (m.vti ?? m.vte ?? 0), rate: m.fTotal ?? 0, breaths: vent.disconnected ? null : m.recentBreaths, fio2: vent.settings.fio2 / 100, peep: m.peepTotal ?? vent.settings.peep, ibwKg: m.ibw }); };
  vent.run(60); upd(); gas.settle();
  if (def.gasStart) Object.assign(gas.state, def.gasStart);
  const sit = createSituation(def, { rng: () => 0.5, hooks });
  const msgs = [];
  sit.start(vent.time);
  const ctx = () => ({ m: vent.measurements, gas: gas.state, settings: vent.settings, pmax: vent.settings.pmax, disconnected: vent.disconnected, patient: vent.patient });
  const run = (sec) => { for (let i = 0; i < sec; i++) { vent.run(1); upd(); gas.step(1); sit.tick(vent.time, ctx()); msgs.push(...sit.drain()); } };
  /** Gå til tiltaksvalget og velg «Juster respiratoren». */
  const toJuster = () => {
    for (let i = 0; i < 120 && !sit.decision; i++) run(1);
    sit.skipToActions(vent.time); run(2);
    assert.ok(sit.decision && sit.decision.kind === 'tiltak', `${id}: tiltaksvalg`);
    assert.ok(sit.decision.options.some((o) => o.id === 'juster'), `${id}: «Juster respiratoren» er et valg`);
    sit.choose('juster', vent.time);
  };
  /** Vent på neste valg (hopper over ventetiden) og velg `actionId`; returnerer resultatet. */
  const choose = (actionId) => {
    sit.skipWait(vent.time); run(1);
    for (let i = 0; i < 60 && !sit.decision; i++) { sit.skipWait(vent.time); run(1); }
    assert.ok(sit.decision, `${id}: et nytt valg kommer`);
    assert.ok(sit.decision.options.some((o) => o.id === actionId), `${id}: «${actionId}» er blant valgene (${sit.decision.options.map((o) => o.id).join(', ')})`);
    return sit.choose(actionId, vent.time);
  };
  const until = (n) => { for (let i = 0; i < n && sit.state.status !== 'resolved'; i++) run(1); return sit.state.status === 'resolved'; };
  const theory = (kind) => msgs.filter((x) => x.who === 'teori' && (!kind || x.kind === kind));
  const apply = (step) => { if (step.patient) vent.setPatient(step.patient); else if (step.choose) choose(step.choose); else if (step.run) run(step.run); else vent.setSettings(step); };
  return { def, vent, gas, sit, run, toJuster, choose, until, theory, ctx, msgs, apply };
}

/**
 * Standardtest for en case med respiratorjustering:
 *  wait: s før kontroll av avvik; check(R): avviket er der;
 *  wrong: steg som ikke skal løse casen; right: steg som skal løse den (innstillinger, {patient}, {choose: id}, {run: s}).
 */
export function runPlan(id, plan) {
  let R = rig(id);
  R.run(plan.wait);
  plan.check?.(R);
  assert.notEqual(R.sit.state.status, 'resolved', `${id}: ikke løst før tiltak`);
  R.toJuster();
  for (const st of plan.wrong) R.apply(st);
  R.run(plan.wrongRun ?? 60);
  assert.notEqual(R.sit.state.status, 'resolved', `${id}: feil justering ${JSON.stringify(plan.wrong)} skal ikke løse`);
  R = rig(id);
  R.run(plan.wait);
  R.toJuster();
  for (const st of plan.right) R.apply(st);
  assert.ok(R.until(plan.rightWithin ?? 300), `${id}: riktig justering ${JSON.stringify(plan.right)} løser`);
  assert.ok(R.theory('riktig').length >= 1, `${id}: minst én «Riktig!»-melding`);
  plan.after?.(R);
  return R;
}
