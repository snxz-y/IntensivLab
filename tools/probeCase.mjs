/**
 * Utviklerverktøy: kjør en case og skriv ut nøkkelverdier etter hvert steg.
 *   node tools/probeCase.mjs <case-id> '[{"vt":450,"rate":28},{"choose":"mageleie"},{"run":60}]'
 * Steg: innstillinger, {patient}, {choose: tiltak} (oppfølgingsvalg) eller {run: sekunder}.
 */
import { rig } from '../tests/helpers/caseRig.js';
const id = process.argv[2];
const steps = JSON.parse(process.argv[3] ?? '[]');
const R = rig(id);
const show = (lbl) => { const m = R.vent.measurements, g = R.gas.state, s = R.vent.settings; console.log(lbl.padEnd(10), `vt/kg ${m.vtPerKg?.toFixed(1)} vte ${m.vte?.toFixed(0)} pplat ${m.pplat?.toFixed(1)} dP ${m.drivingPressure?.toFixed(1)} ppeak ${m.ppeak?.toFixed(1)} autoPEEP ${m.autoPeep?.toFixed(1)} f ${m.fTotal?.toFixed(0)} MV ${m.expMinVol?.toFixed(1)} | PaO2 ${g.target.pao2.toFixed(1)} PaCO2 ${g.target.paco2.toFixed(1)} (nå ${g.paco2.toFixed(1)}) SpO2 ${(g.spo2*100).toFixed(0)} P/F ${(g.target.pao2/(s.fio2/100)).toFixed(1)} | ${R.sit.state.status}${R.sit.prone ? ' PRONE' : ''}`); };
show('start'); R.run(60); show('t60');
R.toJuster();
for (const st of steps) { R.apply(st); R.run(30); show(JSON.stringify(st).slice(0, 10)); }
R.until(200); show('slutt');
for (const m of R.msgs.filter((x) => x.who === 'teori')) console.log(' -', m.kind, m.text.slice(0, 80));
