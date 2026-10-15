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
};

test('ARDS-casene har hver sin testplan', () => { for (const d of ARDS_CASES) assert.ok(PLANS[d.id], d.id); });
for (const [id, plan] of Object.entries(PLANS)) test(`voksencase ${id}`, () => { runPlan(id, plan); });
