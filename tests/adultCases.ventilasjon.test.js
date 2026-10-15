import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPlan } from './helpers/caseRig.js';
import { VENTILASJON_CASES } from '../modules/respirator/adultCases/ventilasjon.js';
import { phFromHco3Pco2 } from '../core/physiology/acidbase.js';

const co2 = (R) => R.gas.state.target.paco2;

/** Plan per case: avvik (check), vanlig feil justering (wrong) og riktig justering (right). */
const PLANS = {
  'v-ventilasjon-laktacidose': {
    wait: 60, check: (R) => { assert.ok(co2(R) > 6, 'PaCO2 på vei mot over 6 kPa med standardoppsett'); assert.ok(R.gas.state.paco2 > 4, 'PaCO2 stiger'); },
    wrong: [{ rate: 20 }], // «normal» PaCO2 er feil mål ved metabolsk acidose
    right: [{ vt: 440, rate: 28 }],
  },
  'v-ventilasjon-hodeskade': {
    wait: 30, check: (R) => assert.ok(co2(R) < 4.0, 'hypokapni'),
    wrong: [{ rate: 16 }], // for lite ned
    right: [{ rate: 14 }],
  },
  'v-ventilasjon-herniering': {
    wait: 60, check: (R) => { assert.ok(co2(R) > 4.8, 'normokapni før tiltak'); assert.equal(R.sit.state.status, 'active'); },
    wrong: [{ rate: 28 }], // for kraftig hyperventilering
    right: [{ rate: 18 }],
  },
  'v-ventilasjon-hjertestans': {
    wait: 30, check: (R) => { assert.ok(R.gas.state.target.pao2 > 40, 'hyperoksi'); assert.ok(co2(R) < 4, 'hypokapni'); assert.ok(R.vent.measurements.vtPerKg > 8.2, 'Vt over 8 ml/kg'); },
    wrong: [{ fio2: 40 }], // bare O2 ned, ventilasjonen står
    right: [{ pcontrol: 12, fio2: 35 }],
  },
  'v-ventilasjon-dodrom': {
    wait: 30, check: (R) => { assert.ok(co2(R) > 6.5, 'hyperkapni'); assert.ok(R.gas.petco2 < 4.5, 'PetCO2 ser normal ut'); },
    wrong: [{ vt: 480 }], // stort Vt i stedet for frekvens
    right: [{ rate: 22 }],
  },
  'v-ventilasjon-feber': {
    wait: 60, check: (R) => { assert.ok(co2(R) > 7.5, 'PaCO2 på vei opp'); assert.ok(R.gas.state.paco2 > 6.3, 'PaCO2 stiger'); },
    wrong: [{ peep: 10 }], // PEEP opp i DuoPAP gir mindre ΔP
    right: [{ rate: 21 }],
  },
  'v-ventilasjon-hypotermi': {
    wait: 30, check: (R) => assert.ok(co2(R) < 3.6, 'hypokapni'),
    wrong: [{ rate: 12 }], // for lite ned
    right: [{ rate: 10 }],
  },
  'v-ventilasjon-alkalose': {
    wait: 30, check: (R) => assert.ok(phFromHco3Pco2(20, co2(R)) > 7.5, 'alkalose'),
    wrong: [{ rate: 22 }], // for lite ned
    right: [{ rate: 18 }],
  },
  'v-ventilasjon-permissiv': {
    wait: 30, check: (R) => assert.ok(phFromHco3Pco2(25, co2(R)) < 7.2, 'pH under 7,20'),
    wrong: [{ pcontrol: 20 }], // større Vt og høyere trykk i stedet for frekvens
    right: [{ rate: 24 }],
  },
  'v-ventilasjon-utstyrsdodrom': {
    wait: 60, check: (R) => { assert.ok(co2(R) > 8, 'PaCO2 på vei opp'); assert.ok(R.vent.measurements.fTotal >= 28, 'rask, overfladisk pust'); assert.ok(R.vent.measurements.vtPerKg < 5, 'lite Vt'); },
    wrong: [{ psupport: 10 }], // for lite støtte
    right: [{ psupport: 12 }],
  },
};

test('ventilasjonscasene har hver sin testplan', () => { for (const d of VENTILASJON_CASES) assert.ok(PLANS[d.id], d.id); });
test('ti ventilasjonscaser med ulike moduser', () => {
  assert.equal(VENTILASJON_CASES.length, 10);
  const modes = new Set(VENTILASJON_CASES.map((d) => d.settings.mode));
  for (const m of ['APVCMV', 'PCV', 'SCMV', 'SPONT', 'DUOPAP']) assert.ok(modes.has(m), m);
});
for (const [id, plan] of Object.entries(PLANS)) test(`voksencase ${id}`, () => { runPlan(id, plan); });
