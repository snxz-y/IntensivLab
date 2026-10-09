/**
 * Syre–base-fysiologi. Rene funksjoner, ingen DOM.
 *
 * Enheter: pH (enhetsløs), PaCO2/PaO2 i kPa (mmHg kun internt i kompensasjonsregler),
 * HCO3/BE/elektrolytter/laktat i mmol/L, albumin i g/L, FiO2 som brøk (0,21–1,0).
 *
 * Kildeoversikt (se KILDER.md):
 *  [B1] Henderson–Hasselbalch: pH = 6,1 + log10(HCO3 / (0,0307 · PaCO2[mmHg])).
 *       CO2-løselighet 0,0307 mmol/L/mmHg ved 37 °C = 0,2302 mmol/L/kPa. Standard i
 *       fysiologilærebøker, f.eks. Boron WF, Boulpaep EL. Medical Physiology, 3. utg. 2017.
 *  [B2] Forventet respiratorisk kompensasjon ved metabolsk acidose (Winters formel):
 *       PaCO2[mmHg] = 1,5 · HCO3 + 8 ± 2. Albert MS, Dell RB, Winters RW.
 *       Ann Intern Med 1967;66:312–22.
 *  [B3] Metabolsk alkalose: PaCO2[mmHg] = 0,7 · HCO3 + 21 ± 2. UVERIFISERT: flere varianter
 *       finnes (0,7·HCO3 + 20 ± 5; 0,9·HCO3 + 15); denne er den vanligste i lærebøker.
 *  [B4] Respiratorisk acidose: HCO3 stiger 1 mmol/L (akutt) / 3,5 mmol/L (kronisk) per
 *       10 mmHg økning i PaCO2. Respiratorisk alkalose: HCO3 faller 2 (akutt) / 4 (kronisk)
 *       per 10 mmHg fall i PaCO2. Berend K, de Vries APJ, Gans ROB. Physiological approach
 *       to assessment of acid–base disturbances. N Engl J Med 2014;371:1434–45.
 *  [B5] Anion gap = Na − (Cl + HCO3), uten kalium. Albuminkorrigert:
 *       AGkorr = AG + 2,5 · (4,0 − albumin[g/dL]) = AG + 0,25 · (40 − albumin[g/L]).
 *       Figge J, Jabor A, Kazda A, Fencl V. Crit Care Med 1998;26:1807–10.
 *  [B6] Delta ratio = (AG − 12)/(24 − HCO3). < 0,4: hyperkloremisk (normal AG) acidose;
 *       0,4–0,8: blandet høy-AG + normal-AG; 0,8–2,0: ren høy-AG; > 2: høy-AG + metabolsk
 *       alkalose (eller kronisk respiratorisk acidose). Rastegar A. J Am Soc Nephrol
 *       2007;18:2429–31.
 *  [B7] Base excess (ECF, «standard base excess»), Van Slyke-ligning:
 *       SBE = 0,93 · [(HCO3 − 24,4) + 14,8 · (pH − 7,4)]. Siggaard-Andersen O. Scand J Clin
 *       Lab Invest 1977;37 Suppl 146:15–20. UVERIFISERT: konstantene 24,4/14,8 vs 24,8/14,85
 *       varierer mellom analysatorer (CLSI C46).
 *  [B8] P/F-ratio = PaO2/FiO2. Berlin-definisjonen av ARDS: ≤ 300 mmHg (40 kPa) mild,
 *       ≤ 200 mmHg (26,7 kPa) moderat, ≤ 100 mmHg (13,3 kPa) alvorlig, ved PEEP ≥ 5.
 *       ARDS Definition Task Force. JAMA 2012;307:2526–33.
 *  [B9] Alveolær gassligning: PAO2 = FiO2 · (Pb − PH2O) − PaCO2/R, Pb 101,3 kPa,
 *       PH2O 6,3 kPa, R 0,8. West JB. Respiratory Physiology: The Essentials.
 *  [B10] Hypoksemisk respirasjonssvikt: PaO2 < 8 kPa (60 mmHg). Roussos C, Koutsoukou A.
 *       Eur Respir J 2003;22 Suppl 47:3s–14s.
 */
import { MMHG_PER_KPA, kPaToMmHg, mmHgToKPa } from '../units.js';

export const PKA = 6.1;
export const CO2_SOLUBILITY_MMHG = 0.0307; // mmol/L per mmHg [B1]
export const CO2_SOLUBILITY_KPA = CO2_SOLUBILITY_MMHG * MMHG_PER_KPA; // ≈ 0,2302 mmol/L per kPa

/** pH fra HCO3 (mmol/L) og PaCO2 (kPa) [B1]. */
export function phFromHco3Pco2(hco3, pco2kPa) {
  return PKA + Math.log10(hco3 / (CO2_SOLUBILITY_KPA * pco2kPa));
}

/** HCO3 (mmol/L) fra pH og PaCO2 (kPa) [B1]. Slik analysatorer beregner HCO3. */
export function hco3FromPhPco2(ph, pco2kPa) {
  return CO2_SOLUBILITY_KPA * pco2kPa * 10 ** (ph - PKA);
}

/** PaCO2 (kPa) fra pH og HCO3 [B1]. */
export function pco2FromPhHco3(ph, hco3) {
  return hco3 / (CO2_SOLUBILITY_KPA * 10 ** (ph - PKA));
}

/** Standard base excess (mmol/L) [B7]. */
export function baseExcess(ph, hco3) {
  return 0.93 * ((hco3 - 24.4) + 14.8 * (ph - 7.4));
}

/** Anion gap uten kalium [B5]. */
export function anionGap(na, cl, hco3) {
  return na - (cl + hco3);
}

/** Albuminkorrigert anion gap, albumin i g/L [B5]. */
export function correctedAnionGap(ag, albuminGL) {
  return ag + 0.25 * (40 - albuminGL);
}

/** Delta ratio [B6]. Returnerer null hvis HCO3 ≥ 24 (nevner ≤ 0). */
export function deltaRatio(agCorr, hco3) {
  const denom = 24 - hco3;
  if (denom <= 0) return null;
  return (agCorr - 12) / denom;
}

/** Tolkning av delta ratio [B6]. */
export function interpretDeltaRatio(ratio) {
  if (ratio === null) return 'ikke-aktuelt';
  if (ratio < 0.4) return 'normal-ag';          // hyperkloremisk dominerer
  if (ratio < 0.8) return 'blandet-hoy-og-normal-ag';
  if (ratio <= 2.0) return 'ren-hoy-ag';
  return 'hoy-ag-pluss-met-alkalose';
}

/**
 * Forventet kompensasjon for en primær forstyrrelse [B2–B4]. Alle inn/ut i kPa og mmol/L.
 * @param {'met-acidose'|'met-alkalose'|'resp-acidose-akutt'|'resp-acidose-kronisk'|'resp-alkalose-akutt'|'resp-alkalose-kronisk'} primary
 * @param {{hco3?: number, pco2?: number}} v  hco3 (mmol/L) for metabolske, pco2 (kPa) for respiratoriske
 * @returns {{target: 'pco2'|'hco3', expected: number, low: number, high: number, unit: string, rule: string}}
 */
export function expectedCompensation(primary, v) {
  switch (primary) {
    case 'met-acidose': {
      const mmHg = 1.5 * v.hco3 + 8;
      return { target: 'pco2', expected: mmHgToKPa(mmHg), low: mmHgToKPa(mmHg - 2), high: mmHgToKPa(mmHg + 2), unit: 'kPa', rule: 'PaCO2 (mmHg) = 1,5 · HCO3 + 8 ± 2 (Winters formel)' };
    }
    case 'met-alkalose': {
      const mmHg = 0.7 * v.hco3 + 21;
      return { target: 'pco2', expected: mmHgToKPa(mmHg), low: mmHgToKPa(mmHg - 2), high: mmHgToKPa(mmHg + 2), unit: 'kPa', rule: 'PaCO2 (mmHg) = 0,7 · HCO3 + 21 ± 2' };
    }
    case 'resp-acidose-akutt': {
      const d = (kPaToMmHg(v.pco2) - 40) / 10;
      const e = 24 + 1 * d;
      return { target: 'hco3', expected: e, low: e - 2, high: e + 2, unit: 'mmol/L', rule: 'HCO3 stiger 1 mmol/L per 10 mmHg (1,33 kPa) økning i PaCO2 (akutt)' };
    }
    case 'resp-acidose-kronisk': {
      const d = (kPaToMmHg(v.pco2) - 40) / 10;
      const e = 24 + 3.5 * d;
      return { target: 'hco3', expected: e, low: e - 2, high: e + 2, unit: 'mmol/L', rule: 'HCO3 stiger 3,5 mmol/L per 10 mmHg (1,33 kPa) økning i PaCO2 (kronisk)' };
    }
    case 'resp-alkalose-akutt': {
      const d = (40 - kPaToMmHg(v.pco2)) / 10;
      const e = 24 - 2 * d;
      return { target: 'hco3', expected: e, low: e - 2, high: e + 2, unit: 'mmol/L', rule: 'HCO3 faller 2 mmol/L per 10 mmHg (1,33 kPa) fall i PaCO2 (akutt)' };
    }
    case 'resp-alkalose-kronisk': {
      const d = (40 - kPaToMmHg(v.pco2)) / 10;
      const e = 24 - 4 * d;
      return { target: 'hco3', expected: e, low: e - 2, high: e + 2, unit: 'mmol/L', rule: 'HCO3 faller 4 mmol/L per 10 mmHg (1,33 kPa) fall i PaCO2 (kronisk)' };
    }
    default:
      throw new Error(`Ukjent primær forstyrrelse: ${primary}`);
  }
}

/** P/F-ratio i kPa [B8]. FiO2 som brøk. */
export function pfRatio(pao2kPa, fio2) {
  return pao2kPa / fio2;
}

/** Gradering av P/F-ratio (kPa) etter Berlin-grensene [B8]. */
export function gradePf(pf) {
  if (pf <= 13.3) return 'alvorlig';
  if (pf <= 26.7) return 'moderat';
  if (pf <= 40) return 'mild';
  if (pf < 53) return 'lett-nedsatt';
  return 'normal';
}

/** Alveolært PO2 (kPa) [B9]. */
export function alveolarPo2(fio2, paco2kPa, { pb = 101.3, ph2o = 6.3, rq = 0.8 } = {}) {
  return fio2 * (pb - ph2o) - paco2kPa / rq;
}

/** Hypoksemi: PaO2 < 8 kPa [B10]. */
export function isHypoxemic(pao2kPa) {
  return pao2kPa < 8;
}
