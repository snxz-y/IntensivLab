import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './helpers/caseRig.js';
import { ADULT_VENT_SITUATIONS } from '../modules/respirator/adultCases/index.js';
import { SITUATIONS } from '../modules/respirator/scenarios.js';

test('voksencaser med respiratorjustering: struktur, mål, teori og forklaring', () => {
  const ids = new Set(SITUATIONS.map((s) => s.id));
  assert.equal(ids.size, SITUATIONS.length, 'unike case-id-er');
  for (const def of ADULT_VENT_SITUATIONS) {
    assert.ok(!def.pediatric, def.id);
    assert.ok(def.group, `${def.id}: gruppe`);
    assert.ok(def.vignette.length > 40, `${def.id}: vignett`);
    for (const v of def.variants) {
      assert.ok(v.ventFix && v.fixes.juster, `${def.id}: løses med respiratorjustering`);
      assert.ok(v.target && v.target.length > 20, `${def.id}: mål`);
      assert.ok(v.teach?.some((r) => (r.kind ?? 'riktig') === 'riktig'), `${def.id}: «Riktig!»-teori`);
      assert.ok(v.teach.every((r) => r.text.length > 30), `${def.id}: teoritekster`);
      assert.ok(v.explanation.length > 100, `${def.id}: forklaring`);
      for (const id of v.followUp ?? []) assert.ok(v.fixes[id], `${def.id}: oppfølgingsvalget ${id} har en effekt`);
    }
  }
});

test('mageleie: kommer som oppfølgingsvalg etter justering, og bare da', () => {
  const R = rig('v-ards-mageleie');
  R.run(60);
  for (let i = 0; i < 120 && !R.sit.decision; i++) R.run(1);
  R.sit.skipToActions(R.vent.time); R.run(2);
  assert.ok(!R.sit.decision.options.some((o) => o.id === 'mageleie'), 'ikke i første tiltaksvalg');
  R.sit.choose('juster', R.vent.time);
  R.vent.setSettings({ vt: 450, rate: 28, peep: 14, fio2: 80 });
  const res = R.choose('mageleie');
  assert.equal(res.kind, 'riktig');
  const before = R.gas.state.target.pao2;
  R.run(70);
  assert.ok(R.sit.prone);
  assert.ok(R.gas.state.target.pao2 > before + 2, `PaO2 stiger i mageleie (${before.toFixed(1)} → ${R.gas.state.target.pao2.toFixed(1)})`);
});
