/**
 * Pasientens egen pusteinnsats (Pmus) som funksjon av tid siden innsatsen startet.
 * Ren funksjon, ingen DOM.
 *
 * Modell: halv sinus over varigheten `duration` (nevral inspirasjonstid):
 *   Pmus(t) = A · sin(π·t/duration)  for 0 ≤ t ≤ duration, ellers 0.
 * Dette er en vanlig forenkling i lungesimulatorer (f.eks. sinusprofil i
 * ASL 5000-testlunge). UVERIFISERT som klinisk modell; brukes kun for å drive
 * trigging og vise effekten av egenpust på kurvene.
 *
 * @param {number} t         s siden innsatsen startet
 * @param {object} effort
 * @param {number} effort.amplitude  cmH2O (0 = ingen egenpust)
 * @param {number} [effort.duration=1.0]  s
 */
export function pmusAt(t, effort) {
  if (!effort || effort.amplitude <= 0) return 0;
  const d = effort.duration ?? 1.0;
  if (t < 0 || t > d) return 0;
  return effort.amplitude * Math.sin((Math.PI * t) / d);
}
