/**
 * Enheter og konvertering. Rene funksjoner, ingen DOM.
 *
 * Kilder:
 * - 1 kPa = 7,50062 mmHg (SI-definisjon: 1 mmHg = 133,322 Pa).
 * - 1 cmH2O = 98,0665 Pa (definisjon, 4 °C). Brukes ikke til konvertering i v1,
 *   alle luftveistrykk holdes i cmH2O.
 */

export const MMHG_PER_KPA = 7.50062;

/** kPa → mmHg */
export function kPaToMmHg(kPa) {
  return kPa * MMHG_PER_KPA;
}

/** mmHg → kPa */
export function mmHgToKPa(mmHg) {
  return mmHg / MMHG_PER_KPA;
}

/** ml → L */
export function mlToL(ml) {
  return ml / 1000;
}

/** L → ml */
export function lToMl(l) {
  return l * 1000;
}

/** L/min → L/s */
export function lPerMinToLPerS(lpm) {
  return lpm / 60;
}

/** L/s → L/min */
export function lPerSToLPerMin(lps) {
  return lps * 60;
}

/** Albumin g/L → g/dL */
export function gPerLToGPerDl(gL) {
  return gL / 10;
}

/** Albumin g/dL → g/L */
export function gPerDlToGPerL(gDl) {
  return gDl * 10;
}

/** Avrund til gitt antall desimaler (unngår 1.005-feil ved å bruke eksponentform). */
export function round(value, decimals = 0) {
  if (!Number.isFinite(value)) return value;
  const f = Number(`${value}e${decimals}`);
  return Number(`${Math.round(f)}e-${decimals}`);
}

/** Begrens verdi til [min, max]. */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Formater tall med norsk desimalkomma. */
export function fmt(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  if (!Number.isFinite(value)) return '–';
  return round(value, decimals).toFixed(decimals).replace('.', ',');
}
