/**
 * Referanseområder (arterielt, voksne). Rene data.
 *
 * pH, PaCO2 og HCO3 er stabile lærebokverdier [B1-kilder, Berend 2014]. Øvrige områder
 * varierer mellom laboratorier og er merket UVERIFISERT; sjekk mot eget laboratorium
 * (f.eks. Nasjonal brukerhåndbok i medisinsk biokjemi, brukerhandboken.no).
 */
export const REF = {
  ph: { low: 7.35, high: 7.45, unit: '', decimals: 2, label: 'pH' },
  pco2: { low: 4.7, high: 6.0, unit: 'kPa', decimals: 1, label: 'PaCO2' },
  po2: { low: 10.0, high: 13.3, unit: 'kPa', decimals: 1, label: 'PaO2', note: 'UVERIFISERT; aldersavhengig' },
  hco3: { low: 22, high: 26, unit: 'mmol/L', decimals: 1, label: 'HCO3⁻' },
  be: { low: -3, high: 3, unit: 'mmol/L', decimals: 1, label: 'BE' },
  lactate: { low: 0.5, high: 2.0, unit: 'mmol/L', decimals: 1, label: 'Laktat', note: 'UVERIFISERT' },
  na: { low: 137, high: 145, unit: 'mmol/L', decimals: 0, label: 'Na⁺', note: 'UVERIFISERT' },
  k: { low: 3.5, high: 5.0, unit: 'mmol/L', decimals: 1, label: 'K⁺', note: 'UVERIFISERT' },
  cl: { low: 98, high: 108, unit: 'mmol/L', decimals: 0, label: 'Cl⁻', note: 'UVERIFISERT' },
  albumin: { low: 36, high: 48, unit: 'g/L', decimals: 0, label: 'Albumin', note: 'UVERIFISERT; aldersavhengig' },
  glucose: { low: 4.0, high: 7.8, unit: 'mmol/L', decimals: 1, label: 'Glukose', note: 'UVERIFISERT; ikke-fastende' },
  fio2: { low: 0.21, high: 1.0, unit: '', decimals: 2, label: 'FiO2' },
  ag: { low: 8, high: 12, unit: 'mmol/L', decimals: 0, label: 'Anion gap', note: 'uten K; UVERIFISERT (laboratorieavhengig)' },
};

/** 'lav' | 'normal' | 'høy' i forhold til referanseområdet. */
export function flag(key, value) {
  const r = REF[key];
  if (!r || value === null || value === undefined) return 'normal';
  if (value < r.low) return 'lav';
  if (value > r.high) return 'høy';
  return 'normal';
}
