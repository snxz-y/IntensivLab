/**
 * Dynamisk gassutveksling: alveolærgass, SpO2 og PaCO2 beveger seg mot steady state med
 * tidsforsinkelse. Ren logikk, ingen DOM.
 *
 * Modellvalg (UVERIFISERT, se KILDER.md):
 *  - PaCO2 følger steady state med tidskonstant 180 s (kroppens CO2-lagre).
 *  - Alveolært PO2 følger alveolær gassligning (med det forsinkede PaCO2) med tidskonstant 20 s
 *    ved ventilasjon; uten ventilasjon (apné/frakobling) faller det mot 0 med tidskonstant 90 s
 *    (oksygenlageret i FRC brukes opp).
 *  - SpO2 følger SaO2 med tidskonstant 30 s (sirkulasjonstid + pulsoksymeterets midling).
 *  - PetCO2 vises som PaCO2 − 0,5 kPa (normal arteriell–endetidal gradient ca. 2–5 mmHg, West).
 */
import { steadyStateGas, arterialFromShunt, effectiveShunt } from '../physiology/gasExchange.js';
import { alveolarPo2 } from '../physiology/acidbase.js';

export function createGasModel({ shunt = 0.05, recruitability = 0, vco2 = 200, hbGL = 120, tauSpo2 = 30, tauCo2 = 180, tauAlv = 20, tauApnea = 90 } = {}) {
  const p = { shunt, recruitability, vco2, hbGL };
  const state = { spo2: 0.97, sao2: 0.97, paco2: 5.3, pao2: 12, pao2Alv: 13, va: 4, target: null };
  let vent = null;

  function setVentilation(v) {
    vent = { ...v };
    const g = steadyStateGas({ ...v, ...p });
    state.target = g;
    state.va = g.va;
  }

  function step(dt) {
    const t = state.target;
    if (!t || !vent) return state;
    state.paco2 += (t.paco2 - state.paco2) * (1 - Math.exp(-dt / tauCo2));
    if (state.va > 0.3) {
      const alvTarget = Math.max(0.5, alveolarPo2(vent.fio2, state.paco2));
      state.pao2Alv += (alvTarget - state.pao2Alv) * (1 - Math.exp(-dt / tauAlv));
    } else {
      state.pao2Alv += (0.5 - state.pao2Alv) * (1 - Math.exp(-dt / tauApnea));
    }
    const sh = effectiveShunt(p.shunt, vent.peep ?? 0, p.recruitability);
    const art = arterialFromShunt({ pao2Alv: state.pao2Alv, shunt: sh, hbGL: p.hbGL });
    state.sao2 = art.sao2;
    state.pao2 = art.pao2;
    state.spo2 += (state.sao2 - state.spo2) * (1 - Math.exp(-dt / tauSpo2));
    return state;
  }

  return {
    get state() { return state; },
    get params() { return p; },
    setParams(partial) { Object.assign(p, partial); if (vent) setVentilation(vent); },
    setVentilation,
    step,
    /** Sett tilstanden direkte til steady state (ved start av scenario). */
    settle() {
      if (!state.target) return;
      state.paco2 = state.target.paco2;
      state.pao2Alv = state.target.pao2Alv;
      state.sao2 = state.target.sao2;
      state.pao2 = state.target.pao2;
      state.spo2 = state.target.sao2;
    },
    get petco2() { return Math.max(0, state.paco2 - 0.5); },
  };
}
