/**
 * Pasientprofiler for respiratorsimulatoren. Rene data, ingen DOM.
 *
 * Tallene er typiske læreboksverdier for intuberte voksne, men jeg kan ikke
 * belegge hvert enkelt tall med en sikker kilde. Alle profilverdier er derfor
 * merket UVERIFISERT i KILDER.md og bør sjekkes mot pensum. Retningen er
 * veletablert: ARDS = lav compliance; obstruktiv = høy resistance (særlig
 * ekspiratorisk) og lang tidskonstant; restriktiv = lav compliance, normal resistance.
 */
export const PROFILES = [
  {
    id: 'normal',
    name: 'Normal lunge',
    description: 'Intubert, sedert voksen med friske lunger.',
    patient: { compliance: 50, resistance: 10, resistanceExp: 10, effort: { amplitude: 0, rate: 14, duration: 1.0 }, height: 175, sex: 'M' },
    notes: 'C 50 ml/cmH2O, R 10 cmH2O/(L/s), τ = 0,5 s. Sedert, ingen egenpust.',
  },
  {
    id: 'ards',
    name: 'ARDS',
    description: 'Stive lunger («baby lung»), moderat ARDS.',
    patient: { compliance: 25, resistance: 12, resistanceExp: 12, effort: { amplitude: 0, rate: 14, duration: 1.0 }, height: 170, sex: 'K' },
    notes: 'C 25 ml/cmH2O gir høyt platåtrykk og drivtrykk ved normale tidalvolum. τ = 0,3 s.',
  },
  {
    id: 'obstruktiv',
    name: 'Obstruktiv (KOLS/astma)',
    description: 'Høy luftveismotstand, spesielt ved ekspirasjon. Fare for auto-PEEP.',
    patient: { compliance: 70, resistance: 20, resistanceExp: 30, effort: { amplitude: 6, rate: 22, duration: 0.9 }, height: 178, sex: 'M' },
    notes: 'Rinsp 20, Rexp 30 cmH2O/(L/s), C 70 → τexp = 2,1 s. Trenger lang ekspirasjonstid. Egenpust 22/min.',
  },
  {
    id: 'restriktiv',
    name: 'Restriktiv',
    description: 'Lav compliance (f.eks. fibrose, kyfoskoliose, stor abdomen), normal resistance.',
    patient: { compliance: 20, resistance: 8, resistanceExp: 8, effort: { amplitude: 0, rate: 14, duration: 1.0 }, height: 165, sex: 'K' },
    notes: 'C 20 ml/cmH2O, R 8. τ = 0,16 s: fyller og tømmer seg raskt, men krever høyt trykk per ml.',
  },
];

export function getProfile(id) {
  return PROFILES.find((p) => p.id === id) ?? PROFILES[0];
}
