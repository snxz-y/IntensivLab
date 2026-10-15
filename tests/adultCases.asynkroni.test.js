import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPlan } from './helpers/caseRig.js';
import { ASYNKRONI_CASES } from '../modules/respirator/adultCases/asynkroni.js';

const m = (R) => R.vent.measurements;

/** Plan per case: avvik (check), vanlig feil justering (wrong) og riktig justering (right). */
const PLANS = {
  // ineffektiv trigging: respiratoren gir 14, hun prøver 26 ganger. Høyere frekvens løser ikke; følsom trigger gjør det
  'v-asynkroni-ufolsom-trigger': {
    wait: 60, check: (R) => { assert.ok(m(R).fTotal <= 15); assert.equal(m(R).breathType, 'mandatory'); },
    wrong: [{ rate: 20 }],
    right: [{ trigger: { type: 'flow', value: 2 } }],
  },
  // for tidlig syklus: små pust og høy frekvens. Mer trykkstøtte løser ikke; lavere ETS gjør det
  'v-asynkroni-ets-hoy': {
    wait: 60, check: (R) => { assert.ok(m(R).vtPerKg < 5.2); assert.ok(m(R).fTotal >= 26); assert.equal(m(R).cycleReason, 'ETS'); },
    wrong: [{ psupport: 14 }],
    right: [{ ets: 25 }],
  },
  // forsinket syklus ved KOLS: pustet varer til TI max og pusteforsøk går tapt. Mer følsom trigger løser ikke; høyere ETS gjør det
  'v-asynkroni-sen-syklus': {
    wait: 60, check: (R) => { assert.equal(m(R).cycleReason, 'TI max'); assert.ok(m(R).fTotal <= 18); },
    wrong: [{ trigger: { type: 'flow', value: 1 } }],
    right: [{ ets: 45 }],
  },
  // flowsult i (S)CMV: større Vt med samme TI løser ikke; trykkregulert modus gjør det
  'v-asynkroni-flowsult': {
    wait: 60, check: (R) => { assert.equal(R.vent.settings.mode, 'SCMV'); assert.ok(m(R).fTotal >= 22); },
    wrong: [{ vt: 550 }],
    right: [{ mode: 'APVCMV' }],
  },
  // lang P-ramp: høyere Pcontrol løser ikke (og gir for stort Vt); kort P-ramp gjør det
  'v-asynkroni-p-ramp': {
    wait: 60, check: (R) => assert.ok(m(R).fTotal > 28),
    wrong: [{ pcontrol: 18 }],
    right: [{ pramp: 50 }],
  },
  // dobbelttrigging: Vt 7 ml/kg med samme korte TI løser ikke; TI 1,0 s gjør det
  'v-asynkroni-dobbelttrigging': {
    wait: 60, check: (R) => assert.ok(m(R).fTotal > 36),
    wrong: [{ vt: 420 }],
    right: [{ ti: 1.0 }],
  },
  // sentrale apnéer under søvn: mer backup løser ikke; lavere trykkstøtte gjør det
  'v-asynkroni-sovn-apne': {
    wait: 50, check: (R) => { assert.ok(m(R).vtPerKg > 10); for (let i = 0; i < 90 && !R.vent.backupActive; i++) R.run(1); assert.ok(R.vent.backupActive, 'sentral apné med backup'); },
    wrong: [{ backup: { rate: 16 } }],
    right: [{ psupport: 9 }],
  },
  // nedtrapping: rett til CPAP 0 gir rask, overfladisk pust; trykkstøtte 6, PEEP 5 og O2 30 % gir ekstubasjonskriteriene
  'v-asynkroni-nedtrapping': {
    wait: 20, check: (R) => { assert.equal(R.vent.settings.psupport, 14); assert.ok(m(R).vtPerKg > 7.5); },
    wrong: [{ psupport: 0, peep: 5, fio2: 30 }],
    right: [{ psupport: 12 }, { run: 20 }, { psupport: 10 }, { run: 20 }, { psupport: 8 }, { run: 20 }, { psupport: 6, peep: 5, fio2: 30 }],
  },
  // DuoPAP: mer trykkstøtte alene løser ikke; lavere frekvens og P high med trykkstøtte 10 gjør det
  'v-asynkroni-duopap-oppstart': {
    wait: 80, check: (R) => assert.ok(m(R).fTotal > 28),
    wrong: [{ psupport: 12 }],
    right: [{ phigh: 21, rate: 12, psupport: 10 }],
  },
  // apné med feil backup: kortere apnétid alene løser ikke; apnétid 20 s, backup 14/min og Pinsp 13 gjør det
  'v-asynkroni-backup': {
    wait: 90, check: (R) => { assert.equal(m(R).breathType, 'backup'); assert.ok(m(R).expMinVol < 3); },
    wrong: [{ apneaTime: 20 }],
    right: [{ apneaTime: 20, backup: { rate: 14, pcontrol: 13 } }],
  },
};

test('casene har hver sin testplan', () => { for (const d of ASYNKRONI_CASES) assert.ok(PLANS[d.id], d.id); });
for (const [id, plan] of Object.entries(PLANS)) test(`voksencase ${id}`, () => { runPlan(id, plan); });
