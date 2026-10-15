import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPlan } from './helpers/caseRig.js';
import { ARDS_CASES } from '../modules/respirator/adultCases/ards.js';

/** Plan per case: avvik (check), vanlig feil justering (wrong) og riktig justering (right). */
const PLANS = {
  'v-ards-mageleie': {
    wait: 60, check: (R) => assert.ok(R.vent.measurements.pplat > 30),
    wrong: [{ fio2: 100 }],
    right: [{ vt: 450, rate: 28, peep: 14, fio2: 80 }, { choose: 'mageleie' }, { run: 70 }, { fio2: 50 }],
  },
  'v-ards-hodeskade-icp': {
    // permissiv hyperkapni (PaCO2 ca. 6,8) ved ICP over 30
    wait: 60, check: (R) => assert.ok(R.gas.state.target.paco2 > 6.2),
    wrong: [{ fio2: 100 }],
    right: [{ rate: 21, peep: 12, fio2: 70 }],
    after: (R) => {
      const t = R.gas.state.target;
      assert.ok(t.paco2 >= 4.6 && t.paco2 <= 5.4, `normokapni (${t.paco2.toFixed(1)})`);
      assert.ok(R.sit.act('mageleie', R.vent.time).kind === 'skadelig', 'mageleie er skadelig ved ICP over 30');
    },
  },
  'v-ards-moderat-ikke-mageleie': {
    wait: 60, check: (R) => assert.ok(R.gas.state.target.pao2 / 0.6 < 20),
    // PEEP opp uten å løfte P high: tidevolumet faller og CO2 stiger
    wrong: [{ peep: 10 }],
    right: [{ peep: 10, phigh: 22 }, { run: 20 }, { fio2: 45 }],
    after: (R) => assert.ok(R.gas.state.target.pao2 / 0.45 >= 20, 'P/F over 20 kPa: mageleie ikke indisert'),
  },
  'v-ards-tilbake-ryggleie': {
    wait: 60, check: (R) => assert.ok(R.gas.state.target.pao2 > 15),
    wrong: [{ fio2: 50 }],
    right: [{ fio2: 50 }, { run: 20 }, { peep: 10 }, { fio2: 45 }],
  },
  'v-ards-sternotomi-sirkulasjon': {
    wait: 60, check: (R) => assert.ok(R.vent.measurements.vtPerKg > 9 && R.vent.measurements.pplat > 30),
    wrong: [{ peep: 14, fio2: 100 }],
    right: [{ vt: 330, rate: 28, peep: 12, fio2: 90 }],
    after: (R) => {
      assert.ok(R.sit.vitals({ m: R.vent.measurements, gas: R.gas.state, settings: { ...R.vent.settings, peep: 16 } }).sys < R.sit.vitals({ m: R.vent.measurements, gas: R.gas.state, settings: R.vent.settings }).sys, 'blodtrykket faller med høy PEEP');
    },
  },
  'v-ards-overvekt-ibw': {
    // feil pasientdata: skjermen viser under 8 ml/kg, men Pplateau er 30
    wait: 60, check: (R) => assert.ok(R.vent.measurements.vtPerKg < 8.2 && R.vent.measurements.pplat >= 29.5),
    // Vt ned til «6,3 ml/kg» med feil høyde og kjønn løser ikke
    wrong: [{ vt: 450, rate: 20 }],
    right: [{ patient: { sex: 'K', height: 155 } }, { vt: 290, rate: 28 }],
  },
  'v-ards-peep-drivtrykk': {
    wait: 60, check: (R) => assert.ok(R.vent.measurements.drivingPressure > 18),
    // for høy PEEP overstrekker: drivtrykket stiger igjen
    wrong: [{ peep: 18 }],
    right: [{ peep: 8 }, { run: 15 }, { peep: 10 }, { run: 15 }, { peep: 12 }],
    after: (R) => assert.ok(R.vent.measurements.drivingPressure <= 15),
  },
  'v-ards-hyperoksi': {
    wait: 60, check: (R) => assert.ok(R.gas.state.target.pao2 > 18),
    wrong: [{ fio2: 60 }],
    right: [{ fio2: 35 }],
  },
  'v-ards-ie-mageleie': {
    wait: 60, check: (R) => assert.ok(R.gas.state.target.pao2 / 0.9 < 10),
    wrong: [{ fio2: 100 }],
    right: [{ ie: { i: 1, e: 1 } }, { choose: 'mageleie' }, { run: 70 }, { fio2: 70 }],
  },
  'v-ards-pcv-platatak': {
    wait: 90, check: (R) => assert.ok(R.vent.measurements.vtPerKg < 5 && R.gas.state.target.paco2 > 8),
    // mer trykk gir Vt tilbake, men Pplateau over 30
    wrong: [{ pcontrol: 21 }],
    right: [{ rate: 30 }],
  },
};

test('ARDS-casene har hver sin testplan', () => { for (const d of ARDS_CASES) assert.ok(PLANS[d.id], d.id); });
for (const [id, plan] of Object.entries(PLANS)) test(`voksencase ${id}`, () => { runPlan(id, plan); });
