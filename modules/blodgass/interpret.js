/**
 * Trinnvis tolkning av en blodgass. Rene funksjoner, ingen DOM.
 * Bruker core/physiology/acidbase.js. Gir fasit for trinn 1–6; trinn 7 (årsaker) kommer
 * fra kasuset selv.
 *
 * Trinn:
 *  1 acidemi/alkalemi/normal pH
 *  2 primær forstyrrelse
 *  3 forventet kompensasjon og vurdering (adekvat / tilleggsforstyrrelse)
 *  4 anion gap, albuminkorrigert
 *  5 delta ratio (ved høy AG og metabolsk acidose)
 *  6 oksygenering: P/F-ratio (kPa) og gradering
 */
import {
  expectedCompensation, anionGap, correctedAnionGap, deltaRatio, interpretDeltaRatio,
  pfRatio, gradePf, isHypoxemic,
} from '../../core/physiology/acidbase.js';
import { REF } from '../../core/physiology/references.js';
import { round } from '../../core/units.js';

export const PRIMARY_LABELS = {
  'met-acidose': 'Metabolsk acidose',
  'met-alkalose': 'Metabolsk alkalose',
  'resp-acidose': 'Respiratorisk acidose',
  'resp-alkalose': 'Respiratorisk alkalose',
  'blandet-acidose': 'Blandet metabolsk og respiratorisk acidose',
  'blandet-alkalose': 'Blandet metabolsk og respiratorisk alkalose',
  'normal': 'Ingen syre–base-forstyrrelse',
};

export const COMP_LABELS = {
  'adekvat': 'Forventet (adekvat) kompensasjon',
  'tillegg-resp-acidose': 'PaCO2 høyere enn forventet: tilleggs respiratorisk acidose',
  'tillegg-resp-alkalose': 'PaCO2 lavere enn forventet: tilleggs respiratorisk alkalose',
  'tillegg-met-acidose': 'HCO3 lavere enn forventet: tilleggs metabolsk acidose',
  'tillegg-met-alkalose': 'HCO3 høyere enn forventet: tilleggs metabolsk alkalose',
  'akutt': 'HCO3 som ved akutt (ukompensert) forstyrrelse',
  'kronisk': 'HCO3 som ved kronisk (renalt kompensert) forstyrrelse',
  'delvis-kronisk': 'HCO3 mellom akutt og kronisk forventning (delvis kompensert)',
  'ikke-aktuelt': 'Ikke aktuelt',
};

/** Trinn 1. */
export function step1(v) {
  if (v.ph < REF.ph.low) return 'acidemi';
  if (v.ph > REF.ph.high) return 'alkalemi';
  return 'normal';
}

/** Trinn 2: primær forstyrrelse ut fra pH, PaCO2 og HCO3. */
export function step2(v) {
  const co2High = v.pco2 > REF.pco2.high;
  const co2Low = v.pco2 < REF.pco2.low;
  const hco3Low = v.hco3 < REF.hco3.low;
  const hco3High = v.hco3 > REF.hco3.high;
  const s1 = step1(v);
  if (s1 === 'acidemi') {
    if (co2High && hco3Low) return 'blandet-acidose';
    if (co2High) return 'resp-acidose';
    if (hco3Low) return 'met-acidose';
    return 'met-acidose';
  }
  if (s1 === 'alkalemi') {
    if (co2Low && hco3High) return 'blandet-alkalose';
    if (co2Low) return 'resp-alkalose';
    if (hco3High) return 'met-alkalose';
    return 'met-alkalose';
  }
  // normal pH: kompensert eller blandet. Siden pH sjelden overkompenseres, peker
  // siden av 7,40 mot den primære forstyrrelsen.
  if (!co2High && !co2Low && !hco3Low && !hco3High) return 'normal';
  if (v.ph <= 7.40) {
    if (co2High) return 'resp-acidose';
    if (hco3Low) return 'met-acidose';
  } else {
    if (co2Low) return 'resp-alkalose';
    if (hco3High) return 'met-alkalose';
  }
  // f.eks. pH 7,38 med lav PaCO2 og lav HCO3 → metabolsk acidose med kompensasjon
  if (hco3Low) return 'met-acidose';
  if (hco3High) return 'met-alkalose';
  if (co2High) return 'resp-acidose';
  return 'resp-alkalose';
}

/**
 * Primære forstyrrelser som kan forsvares ut fra tallene alene. Ved normal pH der PaCO2 og
 * HCO3 avviker i samme syre–base-retning (begge lave eller begge høye) kan både den
 * respiratoriske og den metabolske lesningen være riktig; sykehistorien avgjør.
 * @param {object} v
 * @param {string|null} preferred  kasusets faktiske primærforstyrrelse (settes først i listen)
 */
export function acceptedPrimaries(v, preferred = null) {
  const numeric = step2(v);
  const out = [numeric];
  if (step1(v) === 'normal') {
    const co2High = v.pco2 > REF.pco2.high, co2Low = v.pco2 < REF.pco2.low;
    const hco3Low = v.hco3 < REF.hco3.low, hco3High = v.hco3 > REF.hco3.high;
    if (co2High && hco3High) out.push('resp-acidose', 'met-alkalose');
    if (co2Low && hco3Low) out.push('resp-alkalose', 'met-acidose');
  }
  const uniq = [...new Set(out)];
  if (preferred && uniq.includes(preferred)) return [preferred, ...uniq.filter((x) => x !== preferred)];
  return uniq;
}

/**
 * Trinn 3: forventet kompensasjon for den primære forstyrrelsen.
 * For respiratoriske forstyrrelser gis både akutt og kronisk forventning, og vurderingen
 * sier hvilken HCO3 passer med (akutt / delvis / kronisk) eller om det ligger utenfor begge.
 */
const RESP_BAND = 3;

/**
 * hint: { chronic: true|false } fra kasuset, brukes bare når tallene er tvetydige.
 */
export function step3(v, primary = step2(v), hint = null) {
  if (primary === 'normal') return { applicable: false, verdict: 'ikke-aktuelt', accepted: ['ikke-aktuelt'] };
  if (primary === 'blandet-acidose' || primary === 'blandet-alkalose') {
    // vurder ut fra den metabolske komponenten
    const metPrimary = primary === 'blandet-acidose' ? 'met-acidose' : 'met-alkalose';
    const exp = expectedCompensation(metPrimary, { hco3: v.hco3 });
    const verdict = primary === 'blandet-acidose' ? 'tillegg-resp-acidose' : 'tillegg-resp-alkalose';
    return { applicable: true, basis: metPrimary, ...exp, measured: v.pco2, verdict, accepted: [verdict] };
  }
  if (primary === 'met-acidose' || primary === 'met-alkalose') {
    const exp = expectedCompensation(primary, { hco3: v.hco3 });
    let verdict = 'adekvat';
    if (v.pco2 > exp.high + 0.05) verdict = 'tillegg-resp-acidose';
    else if (v.pco2 < exp.low - 0.05) verdict = 'tillegg-resp-alkalose';
    return { applicable: true, basis: primary, ...exp, measured: v.pco2, verdict, accepted: [verdict] };
  }
  const base = primary === 'resp-acidose' ? 'resp-acidose' : 'resp-alkalose';
  const acute = expectedCompensation(`${base}-akutt`, { pco2: v.pco2 });
  const chronic = expectedCompensation(`${base}-kronisk`, { pco2: v.pco2 });
  const h = v.hco3;
  const lo = Math.min(acute.expected, chronic.expected);
  const hi = Math.max(acute.expected, chronic.expected);
  // Regelvariantene (3,5 vs 4 per 10 mmHg osv.) gjør at vi bruker ±3 mmol/L som bånd her.
  const inAcute = Math.abs(h - acute.expected) <= RESP_BAND;
  const inChronic = Math.abs(h - chronic.expected) <= RESP_BAND;
  let verdict;
  let accepted;
  if (h < lo - RESP_BAND) { verdict = 'tillegg-met-acidose'; accepted = [verdict]; }
  else if (h > hi + RESP_BAND) { verdict = 'tillegg-met-alkalose'; accepted = [verdict]; }
  else if (inAcute && inChronic) {
    // akutt og kronisk forventning overlapper: tallene kan ikke skille dem, sykehistorien avgjør
    verdict = hint?.chronic === true ? 'kronisk' : hint?.chronic === false ? 'akutt' : 'akutt';
    accepted = ['akutt', 'kronisk', 'delvis-kronisk'];
  }
  else if (inAcute) { verdict = 'akutt'; accepted = [verdict]; }
  else if (inChronic) { verdict = 'kronisk'; accepted = [verdict]; }
  else { verdict = 'delvis-kronisk'; accepted = [verdict]; }
  return {
    applicable: true, basis: base, target: 'hco3', unit: 'mmol/L', acute, chronic, measured: h,
    expected: verdict === 'kronisk' ? chronic.expected : acute.expected, low: lo - RESP_BAND, high: hi + RESP_BAND,
    verdict, accepted, ambiguous: accepted.length > 1,
  };
}

/** Trinn 4: anion gap med albuminkorreksjon. */
export function step4(v) {
  const ag = round(anionGap(v.na, v.cl, v.hco3), 1);
  const agCorr = round(correctedAnionGap(ag, v.albumin), 1);
  return { ag, agCorr, high: agCorr > REF.ag.high, correctionApplied: Math.abs(agCorr - ag) >= 0.5 };
}

/** Trinn 5: delta ratio, kun ved høy korrigert AG. */
export function step5(v, s4 = step4(v)) {
  if (!s4.high) return { applicable: false, ratio: null, verdict: 'ikke-aktuelt' };
  const ratio = deltaRatio(s4.agCorr, v.hco3);
  return { applicable: ratio !== null, ratio: ratio === null ? null : round(ratio, 2), verdict: interpretDeltaRatio(ratio) };
}

/** Trinn 6: oksygenering. */
export function step6(v) {
  const pf = round(pfRatio(v.po2, v.fio2), 1);
  return { pf, grade: gradePf(pf), hypoxemic: isHypoxemic(v.po2) };
}

export const DELTA_LABELS = {
  'normal-ag': '< 0,4: hyperkloremisk (normal-AG) acidose dominerer',
  'blandet-hoy-og-normal-ag': '0,4–0,8: blandet høy-AG og normal-AG metabolsk acidose',
  'ren-hoy-ag': '0,8–2,0: ren høy-AG metabolsk acidose',
  'hoy-ag-pluss-met-alkalose': '> 2: høy-AG acidose + samtidig metabolsk alkalose (eller kronisk respiratorisk acidose)',
  'ikke-aktuelt': 'Ikke aktuelt (normal AG)',
};

export const PF_LABELS = {
  normal: '≥ 53 kPa: normal',
  'lett-nedsatt': '40–53 kPa: lett nedsatt oksygenering',
  mild: '≤ 40 kPa: mild (ARDS-grense ved PEEP ≥ 5)',
  moderat: '≤ 26,7 kPa: moderat',
  alvorlig: '≤ 13,3 kPa: alvorlig',
};

/**
 * Full fasit for et kasus.
 * hint: { primary, chronic } fra kasuset – brukes bare der tallene alene er tvetydige.
 */
export function interpret(v, hint = null) {
  const s1 = step1(v);
  const step2Accepted = acceptedPrimaries(v, hint?.primary ?? null);
  const s2 = step2Accepted[0];
  const s3 = step3(v, s2, hint);
  const s4 = step4(v);
  const s5 = step5(v, s4);
  const s6 = step6(v);
  return { step1: s1, step2: s2, step2Accepted, step3: s3, step4: s4, step5: s5, step6: s6 };
}
