/**
 * Felles hjelpere for voksencasene med respiratorjustering (A-casene).
 *
 * Kilder (se KILDER.md, «Voksencaser: respiratorjustering»):
 *  - Metodebok i akutt indremedisin (HUS) «Respiratorbehandling» v1.0 (29.05.2023): FiO2 slik at PaO2 8–11 kPa,
 *    Vt 6–8 ml/kg IBW, frekvens 12–20, PEEP vanligvis 5–10, PEEP ca. 50–80 % av PEEPi ved KOLS, I:E 1:2,
 *    blodgassmål pH 7,35–7,45 / PaCO2 5–6 kPa (høyere ved KOLS), forsiktig med inspirasjonstrykk over 30–35,
 *    FiO2 > 0,6 utover 1–2 døgn unngås (tiltak: PEEP, rekruttering, I:E 1:1, permissiv hyperkapni pH 7,20–7,35,
 *    bukleie), ekstubasjonskriterier FiO2 < 0,35, PEEP ≤ 5, trykkstøtte < 8.
 *  - ARDSNet (NEJM 2000): Vt 6 ml/kg PBW, Pplat ≤ 30, PEEP/FiO2-tabell. Amato 2015: drivtrykk.
 *  - ATS/ESICM/SCCM 2017 og ESICM 2023: lavt Vt (4–8 ml/kg), Pplat < 30, mageleie ved moderat–alvorlig ARDS.
 *  - Mageleie: ESICM 2023 anbefaling 7.1–7.2 og PROSEVA (Guérin, NEJM 2013; protokoll NCT00527813).
 */

export const NEUTRAL_BASE = {
  sug: 'Lite sekret i tuben. Ingen endring.', bittblokk: 'Pasienten biter ikke på tuben.', koble: 'Kretsen var tilkoblet.',
  tube: 'Tuben står på dokumentert dybde ved tannrekken.', bronkodilatator: 'Ingen pipelyder; ingen effekt.', rekruttering: 'Ikke indisert her.',
  reposisjon: 'Ingen effekt på problemet.', sedasjon: 'Pasienten er rolig; sedasjon løser ikke problemet.', kondens: 'Slangene er tørre.',
  cuff: 'Cufftrykket er 25 cmH2O. Ingen lekkasje.', vaeske: 'Væske løser ikke problemet her.', sedasjonNed: 'Sedasjonsnivået er ikke årsaken.',
  smertelindring: 'Ingen tegn til smerte som årsak.', lege: 'Legen: «Juster respiratoren etter målene vi har satt.»',
};

/** «Juster respiratoren»: pasienten endres ikke, brukeren justerer selv på skjermen. */
export const ventFix = { juster: { text: 'Du går til respiratoren for å justere innstillingene.', recover: -1, partial: {} } };

export const vtOk = (m, lo = 6, hi = 8) => m.vtPerKg != null && m.vtPerKg >= lo && m.vtPerKg <= hi;
/** Metningen pasienten er på vei mot (SpO2 henger etter i noen titalls sekunder). */
export const sat = (gas) => gas.target?.sao2 ?? gas.spo2;
/** PaO2 pasienten er på vei mot, kPa. */
export const pao2 = (gas) => gas.target?.pao2 ?? gas.pao2;
/** PaO2/FiO2 i kPa (steady state). */
export const pf = (gas, settings) => pao2(gas) / (settings.fio2 / 100);
/** PaCO2 pasienten er på vei mot, kPa. */
export const paco2 = (gas) => gas.target?.paco2 ?? gas.paco2;

/** ARDSNet «lav PEEP/høy FiO2»-tabellen: laveste PEEP for gitt FiO2 (%). */
export function ardsnetLowPeep(fio2) {
  if (fio2 <= 30) return 5;
  if (fio2 <= 40) return 5;
  if (fio2 <= 50) return 8;
  if (fio2 <= 60) return 10;
  if (fio2 <= 70) return 10;
  if (fio2 <= 80) return 14;
  if (fio2 <= 90) return 14;
  return 18;
}

/**
 * Mageleie som tiltak. Tiden komprimeres: effekten (mindre shunt, jevnere lungebelastning) kommer
 * gradvis over `ramp` sekunder i simulatoren, som står for omtrent én time i virkeligheten.
 */
export function proneFix({ shuntAdd = -0.15, compliance = 1.1, ramp = 60, text } = {}) {
  return {
    text: text ?? 'Dere legger pasienten i mageleie (fem personer; tube, sentrale linjer og dren sikres, øyne og trykkpunkter beskyttes, EKG-elektroder flyttes til ryggen). Tiden spoles fram: etter omtrent en time i mageleie …',
    recover: -1, extra: { shuntAdd, compliance }, extraRamp: ramp, prone: true,
  };
}
