/**
 * Forenklet gassutveksling. Rene funksjoner, ingen DOM.
 *
 * Enheter: trykk i kPa, volum i ml, ventilasjon i L/min, Hb i g/L, O2-innhold i ml/dL,
 * metning som brøk (0–1).
 *
 * Kildeoversikt (se KILDER.md):
 *  [G1] Alveolær ventilasjonsligning: PaCO2[mmHg] = 0,863 · VCO2[ml/min STPD] / VA[L/min BTPS].
 *       VA = (Vt − Vd) · f. West JB. Respiratory Physiology: The Essentials.
 *  [G2] Oksygen–hemoglobin-dissosiasjonskurve, Severinghaus' ligning:
 *       SO2 = 1 / (23400 / (PO2³ + 150·PO2) + 1), PO2 i mmHg.
 *       Severinghaus JW. J Appl Physiol 1979;46:599–602.
 *  [G3] Shuntligningen (venøs innblanding): Qs/Qt = (CcO2 − CaO2)/(CcO2 − CvO2).
 *       O2-innhold: CO2 = 1,34 · Hb[g/dL] · SO2 + 0,003 · PO2[mmHg] (= 0,0225 · PO2[kPa]).
 *       Nunn's Applied Respiratory Physiology, 8. utg. (Lumb AB), kap. om shunt; West JB.
 *  [G4] Alveolær gassligning: PAO2 = FiO2 · (Pb − PH2O) − PaCO2/R (core/physiology/acidbase.js, B9).
 *  Modellvalg (UVERIFISERT, ikke kliniske fakta):
 *  - Anatomisk dødrom 2,2 ml/kg IBW (lærebokverdi ≈ 150 ml hos voksen; eksakt tall varierer).
 *  - Arteriovenøs O2-innholdsdifferanse 5 ml/dL (normalverdi i hvile, West).
 *  - PEEP reduserer shunt lineært med en pasientspesifikk «rekrutterbarhet» (0–1) opp til PEEP 15.
 */
import { kPaToMmHg, mmHgToKPa } from '../units.js';
import { alveolarPo2 } from './acidbase.js';

/** Alveolær ventilasjon (L/min) fra Vt (ml), frekvens og dødrom (ml). */
export function alveolarVentilation(vtMl, rate, deadspaceMl) {
  return Math.max(0, (vtMl - deadspaceMl) * rate) / 1000;
}

/** Anatomisk dødrom (ml) fra IBW (kg). Modellvalg: 2,2 ml/kg. */
export function anatomicDeadspace(ibwKg) {
  return 2.2 * ibwKg;
}

/** Steady-state PaCO2 (kPa) fra alveolær ventilasjon (L/min) og CO2-produksjon (ml/min) [G1]. */
export function paco2FromVentilation(vaLmin, vco2 = 200) {
  if (vaLmin <= 0.1) return mmHgToKPa(0.863 * vco2 / 0.1);
  return mmHgToKPa((0.863 * vco2) / vaLmin);
}

/** O2-metning (0–1) fra PO2 (kPa), Severinghaus 1979 [G2]. */
export function so2FromPo2(po2kPa) {
  const p = Math.max(0.01, kPaToMmHg(po2kPa));
  return 1 / (23400 / (p ** 3 + 150 * p) + 1);
}

/** PO2 (kPa) fra metning (0–1), numerisk invers av [G2]. */
export function po2FromSo2(so2) {
  const s = Math.min(0.9999, Math.max(0.001, so2));
  let lo = 0.1, hi = 100;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (so2FromPo2(mid) < s) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** O2-innhold (ml/dL) [G3]. Hb i g/L. */
export function o2Content(so2, po2kPa, hbGL) {
  return 1.34 * (hbGL / 10) * so2 + 0.0225 * po2kPa;
}

/**
 * Arterielt PO2 (kPa) og SaO2 gitt alveolært PO2 og shuntfraksjon, løst fra shuntligningen [G3]
 * med antatt a–v-differanse. Endekapillært blod antas i likevekt med alveolærgass.
 */
export function arterialFromShunt({ pao2Alv, shunt, hbGL = 120, avDiff = 5 }) {
  const s = Math.min(0.95, Math.max(0, shunt));
  const ccO2 = o2Content(so2FromPo2(pao2Alv), pao2Alv, hbGL);
  const caO2 = Math.max(0.5, ccO2 - (s * avDiff) / (1 - s));
  // finn PaO2 slik at o2Content(SO2(PaO2), PaO2) = caO2 (monotont stigende)
  let lo = 0.1, hi = pao2Alv;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (o2Content(so2FromPo2(mid), mid, hbGL) < caO2) lo = mid; else hi = mid;
  }
  const pao2 = (lo + hi) / 2;
  return { pao2, sao2: so2FromPo2(pao2), caO2, ccO2 };
}

/** Effektiv shunt etter PEEP-rekruttering (modellvalg). recruitability 0–1. */
export function effectiveShunt(baseShunt, peep, recruitability = 0) {
  const x = Math.min(1, Math.max(0, (peep - 5) / 10));
  return baseShunt * (1 - recruitability * x);
}

/**
 * Steady-state gassutveksling for gitt ventilasjon.
 * @returns {{paco2, pao2Alv, pao2, sao2, va}}
 */
export function steadyStateGas({ vtMl, rate, fio2, peep, ibwKg, shunt, recruitability = 0, vco2 = 200, hbGL = 120, deadspaceMl = null }) {
  const vd = deadspaceMl ?? anatomicDeadspace(ibwKg);
  const va = alveolarVentilation(vtMl, rate, vd);
  const paco2 = Math.min(30, paco2FromVentilation(va, vco2));
  const pao2Alv = Math.max(0.5, alveolarPo2(fio2, paco2));
  const sh = effectiveShunt(shunt, peep, recruitability);
  const art = arterialFromShunt({ pao2Alv, shunt: sh, hbGL });
  return { va, paco2, pao2Alv, pao2: art.pao2, sao2: art.sao2, shuntEffective: sh };
}
