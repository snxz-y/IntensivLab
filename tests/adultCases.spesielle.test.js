import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPlan } from './helpers/caseRig.js';
import { SPESIELLE_CASES } from '../modules/respirator/adultCases/spesielle.js';

/** Plan per case: avvik (check), vanlig feil justering (wrong) og riktig justering (right). */
const PLANS = {
  'v-spesielle-overvekt': {
    // Vt etter faktisk vekt og for lav PEEP; feil: senke Vt og gi mer O2 uten å øke PEEP
    wait: 90, check: (R) => { assert.ok(R.vent.measurements.vtPerKg > 11); assert.ok(R.gas.state.target.sao2 < 0.91); },
    wrong: [{ vt: 400, rate: 22, fio2: 90 }],
    right: [{ vt: 400, rate: 22, peep: 12 }, { choose: 'reposisjon' }, { run: 30 }, { fio2: 45 }],
  },
  'v-spesielle-buktrykk': {
    // stiv brystvegg: drivtrykk opp med uendret Vt; feil: senke Vt mye uten PEEP
    wait: 90, check: (R) => { assert.ok(R.vent.measurements.drivingPressure > 22); assert.ok(R.vent.measurements.pplat > 28); },
    wrong: [{ vt: 330, rate: 24 }],
    right: [{ vt: 440, peep: 12, rate: 20 }],
  },
  'v-spesielle-fistel': {
    // stor lekkasje (VTE ≪ VTI); feil: enda høyere PEEP for oksygeneringen
    wait: 60, check: (R) => { const m = R.vent.measurements; assert.ok(m.vte / m.vti < 0.65, `VTE/VTI ${m.vte}/${m.vti}`); },
    wrong: [{ peep: 14, fio2: 60 }],
    right: [{ pcontrol: 16, peep: 6, ti: 0.9, rate: 18, fio2: 70 }],
    after: (R) => { const m = R.vent.measurements; assert.ok(m.vte / m.vti > 0.85, `lekkasjen er mindre (${m.vte}/${m.vti})`); },
  },
  'v-spesielle-lungeodem': {
    // feil: bare mer oksygen
    wait: 100, check: (R) => { assert.ok(R.gas.state.target.sao2 < 0.91); assert.ok(R.vent.measurements.fTotal > 28); },
    wrong: [{ fio2: 100 }],
    right: [{ peep: 10 }, { run: 40 }, { fio2: 40 }],
  },
  'v-spesielle-hoyre-ventrikkel': {
    // feil: lavere Vt uten høyere frekvens (permissiv hyperkapni) og PEEP uendret
    wait: 60, check: (R) => { assert.ok(R.vent.measurements.pplat > 27); assert.ok(R.gas.state.paco2 > 6.4); },
    wrong: [{ vt: 360 }],
    right: [{ vt: 400, rate: 28, peep: 6, fio2: 70 }],
  },
  'v-spesielle-organdonor': {
    // feil: bare mer oksygen; Vt og hypokapni uendret
    wait: 60, check: (R) => { assert.ok(R.vent.measurements.vtPerKg > 9); assert.ok(R.gas.state.paco2 < 4); },
    wrong: [{ fio2: 80 }],
    right: [{ vt: 560, rate: 12, peep: 10 }, { choose: 'rekruttering' }, { run: 30 }, { fio2: 40 }],
  },
  'v-spesielle-gravid': {
    // «normal» PaCO2 for ikke-gravide; feil: bare mer O2
    wait: 60, check: (R) => { assert.ok(R.gas.state.paco2 > 5.2); assert.ok(R.gas.state.target.sao2 < 0.95); },
    wrong: [{ fio2: 60 }],
    right: [{ rate: 26, peep: 10, phigh: 24, fio2: 55 }],
  },
  'v-spesielle-gbs': {
    // rask, overfladisk pust; feil: litt mer trykkstøtte i SPONT
    wait: 100, check: (R) => { assert.ok(R.vent.measurements.fTotal > 30); assert.ok(R.vent.measurements.vtPerKg < 4); },
    wrong: [{ psupport: 12 }],
    right: [{ mode: 'APVCMV', vt: 560, rate: 14, peep: 6 }],
  },
  'v-spesielle-hjertekirurgi': {
    // trigger i APVcmv; feil: SPONT, men med for mye støtte, PEEP og O2 til ekstubasjonskriteriene
    wait: 80, check: (R) => { assert.ok(R.vent.measurements.fTotal > 17); },
    wrong: [{ mode: 'SPONT', psupport: 10, peep: 8, fio2: 50 }],
    right: [{ mode: 'SPONT', psupport: 6, peep: 5, fio2: 30 }],
  },
  'v-spesielle-transport': {
    // PEEP 5 og O2 100 % etter transport; feil: høyere Pcontrol for å få opp Vt
    wait: 90, check: (R) => { assert.ok(R.gas.state.target.sao2 < 0.93); assert.ok(R.vent.measurements.vtPerKg < 6); },
    wrong: [{ pcontrol: 20 }],
    right: [{ peep: 12 }, { run: 30 }, { fio2: 55 }],
  },
};

test('casene har hver sin testplan', () => { for (const d of SPESIELLE_CASES) assert.ok(PLANS[d.id], d.id); });
for (const [id, plan] of Object.entries(PLANS)) test(`voksencase ${id}`, () => { runPlan(id, plan); });
