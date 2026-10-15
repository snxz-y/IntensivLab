import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPlan } from './helpers/caseRig.js';
import { OBSTRUKTIV_CASES } from '../modules/respirator/adultCases/obstruktiv.js';
import { phFromHco3Pco2 } from '../core/physiology/acidbase.js';

const m = (R) => R.vent.measurements;

/** Plan per case: avvik (check), vanlig feil justering (wrong) og riktig justering (right). */
const PLANS = {
  // I:E 1:1 hos KOLS: AutoPEEP høy. Feil: høyere PEEP. Riktig: I:E 1:3.
  'v-obstruktiv-ie-kols': {
    wait: 60, check: (R) => assert.ok(m(R).autoPeep > 4.5, `AutoPEEP ${m(R).autoPeep}`),
    wrong: [{ peep: 10 }],
    right: [{ ie: { i: 1, e: 3 } }],
  },
  // PEEP 0 og PEEPi: halvparten av pusteforsøkene trigger ikke. Feil: mer trykkstøtte. Riktig: PEEP 5 og trykkstøtte 12.
  'v-obstruktiv-peepi-trigging': {
    wait: 60, check: (R) => assert.ok(m(R).fTotal <= 14, `fTotal ${m(R).fTotal}`),
    wrong: [{ psupport: 20 }],
    right: [{ peep: 5, psupport: 12 }],
  },
  // kronisk hyperkapni overventilert: pH 7,57. Feil: frekvensen bare litt ned. Riktig: frekvens 14.
  'v-obstruktiv-ph-kols': {
    wait: 60, check: (R) => assert.ok(phFromHco3Pco2(34, R.gas.state.target.paco2) > 7.5),
    wrong: [{ rate: 20 }],
    right: [{ rate: 14 }],
  },
  // astma i APVcmv: Plimit nås. Feil: (S)CMV uten å heve Pmax. Riktig: (S)CMV, firkant, pause, Pmax 55, frekvens 12.
  'v-obstruktiv-astma-scmv': {
    wait: 60, check: (R) => assert.ok(m(R).pressureLimited),
    wrong: [{ mode: 'SCMV', flowPattern: 'square', tip: 10 }],
    right: [{ mode: 'SCMV', flowPattern: 'square', tip: 10, pmax: 55, rate: 12 }],
  },
  // dypt sedert astmatiker trigger ca. 20/min. Feil: lavere innstilt frekvens. Riktig: trigger av.
  'v-obstruktiv-astma-trigger': {
    wait: 60, check: (R) => assert.ok(m(R).fTotal >= 17 && m(R).pplat > 19, `f ${m(R).fTotal} Pplat ${m(R).pplat}`),
    wrong: [{ rate: 8 }],
    right: [{ trigger: { type: 'off', value: 2 } }],
  },
  // ETS 5 %: TI over 2 s og ineffektive pusteforsøk. Feil: mer trykkstøtte. Riktig: ETS 40 %, TI max 1,5.
  'v-obstruktiv-ets-kols': {
    wait: 60, check: (R) => assert.ok(m(R).ti > 2 && m(R).fTotal <= 12, `TI ${m(R).ti} f ${m(R).fTotal}`),
    wrong: [{ psupport: 14 }],
    right: [{ ets: 40, psupport: 12, tiMax: 1.5 }],
  },
  // PCV+ med TI 1,8 s: AutoPEEP og fallende Vt. Feil: høyere Pcontrol. Riktig: TI 1,0.
  'v-obstruktiv-pcv-ti': {
    wait: 60, check: (R) => assert.ok(m(R).autoPeep > 4.5, `AutoPEEP ${m(R).autoPeep}`),
    wrong: [{ pcontrol: 18 }],
    right: [{ ti: 1.0 }],
  },
  // hypotensjon av AutoPEEP etter intubasjon. Feil: lavere Vt, høyere frekvens. Riktig: frekvens 12, Vt 420, I:E 1:3.
  'v-obstruktiv-hypotensjon': {
    wait: 60, check: (R) => { assert.ok(m(R).autoPeep > 8, `AutoPEEP ${m(R).autoPeep}`); assert.ok(R.sit.vitals(R.ctx()).sys < 95); },
    wrong: [{ vt: 380, rate: 28 }],
    right: [{ rate: 12, vt: 420, ie: { i: 1, e: 3 } }],
  },
  // DuoPAP med T low 1,5 s. Feil: bare lavere P high. Riktig: frekvens 12, T high 1,3, P high 20.
  'v-obstruktiv-duopap-kols': {
    wait: 60, check: (R) => assert.ok(m(R).autoPeep > 6, `AutoPEEP ${m(R).autoPeep}`),
    wrong: [{ phigh: 20 }],
    right: [{ rate: 12, ti: 1.3, phigh: 20 }],
  },
  // astma med frekvens 26: AutoPEEP, lav Vt, PaCO2 ikke lavere. Feil: frekvens 32. Riktig: frekvens 14.
  'v-obstruktiv-astma-co2': {
    wait: 60, check: (R) => assert.ok(m(R).autoPeep > 5 && m(R).vtPerKg < 5, `AutoPEEP ${m(R).autoPeep} Vt/kg ${m(R).vtPerKg}`),
    wrong: [{ rate: 32 }],
    right: [{ rate: 14 }],
    // paradokset: lavere frekvens gir ikke høyere PaCO2 enn frekvens 26
    after: (R) => assert.ok(R.gas.state.target.paco2 < 8.2, `PaCO2 ${R.gas.state.target.paco2}`),
  },
};

test('casene har hver sin testplan', () => { for (const d of OBSTRUKTIV_CASES) assert.ok(PLANS[d.id], d.id); });
for (const [id, plan] of Object.entries(PLANS)) test(`voksencase ${id}`, () => { runPlan(id, plan); });
