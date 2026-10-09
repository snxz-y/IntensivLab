import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alveolarVentilation, paco2FromVentilation, so2FromPo2, po2FromSo2, o2Content, arterialFromShunt, effectiveShunt, steadyStateGas } from '../core/physiology/gasExchange.js';
import { createGasModel } from '../core/sim/gasModel.js';
import { mmHgToKPa } from '../core/units.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

test('alveolær ventilasjonsligning gir PaCO2 ≈ 40 mmHg ved VA 4,3 L/min og VCO2 200', () => {
  near(alveolarVentilation(500, 12, 150), 4.2, 1e-9);
  near(paco2FromVentilation(4.3, 200), mmHgToKPa(40.1), 0.05);
  // halvert alveolær ventilasjon → dobbel PaCO2
  near(paco2FromVentilation(2.15, 200) / paco2FromVentilation(4.3, 200), 2, 1e-9);
});

test('Severinghaus: kjente punkter på dissosiasjonskurven', () => {
  near(so2FromPo2(mmHgToKPa(100)), 0.974, 0.005);
  near(so2FromPo2(mmHgToKPa(60)), 0.90, 0.01);
  near(so2FromPo2(mmHgToKPa(27)), 0.50, 0.02); // P50
  near(po2FromSo2(0.90), mmHgToKPa(60), 0.3);
});

test('shuntligning: 0 shunt gir PaO2 = PAO2, økende shunt senker PaO2 og SaO2', () => {
  const a0 = arterialFromShunt({ pao2Alv: 13.3, shunt: 0 });
  near(a0.pao2, 13.3, 0.05);
  const a10 = arterialFromShunt({ pao2Alv: 13.3, shunt: 0.10 });
  const a30 = arterialFromShunt({ pao2Alv: 13.3, shunt: 0.30 });
  assert.ok(a10.pao2 < a0.pao2 && a30.pao2 < a10.pao2);
  assert.ok(a30.sao2 < 0.9, `SaO2 ${a30.sao2}`);
  // høy FiO2 hjelper lite ved stor shunt (klassisk poeng)
  const hi = arterialFromShunt({ pao2Alv: 80, shunt: 0.40 });
  assert.ok(hi.sao2 < 0.95, `SaO2 ved shunt 40 % på 100 % O2: ${hi.sao2}`);
  near(o2Content(1, 13.3, 150), 1.34 * 15 + 0.0225 * 13.3, 1e-9);
});

test('PEEP reduserer effektiv shunt bare hos rekrutterbare pasienter', () => {
  near(effectiveShunt(0.3, 5, 0.5), 0.3, 1e-9);
  near(effectiveShunt(0.3, 15, 0.5), 0.15, 1e-9);
  near(effectiveShunt(0.3, 15, 0), 0.3, 1e-9);
});

test('steadyStateGas: normal lunge ~97 %, ARDS-lunge på luft hypoksisk, FiO2 hjelper', () => {
  const n = steadyStateGas({ vtMl: 500, rate: 14, fio2: 0.3, peep: 5, ibwKg: 70, shunt: 0.05 });
  assert.ok(n.sao2 > 0.96, `normal ${n.sao2}`);
  near(n.paco2, 5.3, 0.6);
  const ards = steadyStateGas({ vtMl: 400, rate: 20, fio2: 0.21, peep: 5, ibwKg: 65, shunt: 0.35 });
  assert.ok(ards.sao2 < 0.85, `ARDS ${ards.sao2}`);
  const ards60 = steadyStateGas({ vtMl: 400, rate: 20, fio2: 0.6, peep: 12, ibwKg: 65, shunt: 0.35, recruitability: 0.5 });
  assert.ok(ards60.sao2 > ards.sao2);
  // hypoventilasjon: lav frekvens → høy PaCO2
  const hypo = steadyStateGas({ vtMl: 300, rate: 8, fio2: 0.21, peep: 5, ibwKg: 70, shunt: 0.05 });
  assert.ok(hypo.paco2 > 8, `PaCO2 ${hypo.paco2}`);
});

test('gassmodellen beveger seg mot steady state med tidsforsinkelse', () => {
  const g = createGasModel({ shunt: 0.05 });
  g.setVentilation({ vtMl: 500, rate: 14, fio2: 0.3, peep: 5, ibwKg: 70 });
  g.settle();
  const spo2Before = g.state.spo2;
  g.setParams({ shunt: 0.35 });
  g.setVentilation({ vtMl: 500, rate: 14, fio2: 0.3, peep: 5, ibwKg: 70 });
  g.step(10);
  const after10 = g.state.spo2;
  for (let i = 0; i < 30; i++) g.step(10);
  const after300 = g.state.spo2;
  assert.ok(after10 < spo2Before && after300 < after10, `${spo2Before} ${after10} ${after300}`);
  near(after300, g.state.target.sao2, 0.002);
  assert.ok(g.petco2 < g.state.paco2);
});

test('apné: SpO2 holder seg i starten og faller gradvis, ikke momentant', () => {
  const g = createGasModel({ shunt: 0.05 });
  g.setVentilation({ vtMl: 500, rate: 14, fio2: 0.35, peep: 6, ibwKg: 70 });
  g.settle();
  g.setVentilation({ vtMl: 0, rate: 0, fio2: 0.35, peep: 0, ibwKg: 70 });
  for (let i = 0; i < 30; i++) g.step(1);
  assert.ok(g.state.spo2 > 0.90, `30 s: ${g.state.spo2}`);
  for (let i = 0; i < 150; i++) g.step(1);
  assert.ok(g.state.spo2 < 0.85, `180 s: ${g.state.spo2}`);
  // tilbake på respirator: metningen kommer opp igjen
  g.setVentilation({ vtMl: 500, rate: 14, fio2: 0.35, peep: 6, ibwKg: 70 });
  for (let i = 0; i < 180; i++) g.step(1);
  assert.ok(g.state.spo2 > 0.95, `etter tilkobling: ${g.state.spo2}`);
});
