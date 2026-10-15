import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPlan } from './helpers/caseRig.js';
import { ASYNKRONI_CASES } from '../modules/respirator/adultCases/asynkroni.js';

/** Plan per case: avvik (check), vanlig feil justering (wrong) og riktig justering (right). */
const PLANS = {
};

test('casene har hver sin testplan', () => { for (const d of ASYNKRONI_CASES) assert.ok(PLANS[d.id], d.id); });
for (const [id, plan] of Object.entries(PLANS)) test(`voksencase ${id}`, () => { runPlan(id, plan); });
