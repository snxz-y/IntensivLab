/**
 * Respirasjonsfysiologi. Rene funksjoner, ingen DOM.
 *
 * Enheter i hele filen:
 *   volum       ml
 *   flow        L/s
 *   trykk       cmH2O
 *   compliance  ml/cmH2O
 *   resistance  cmH2O/(L/s)
 *   tid         s
 *
 * Kildeoversikt (se også KILDER.md):
 *  [K1] Bevegelsesligningen for respirasjonssystemet (enkompartment):
 *       Paw + Pmus = V/C + R·V̇ + PEEPtot. Standard i lærebøker om mekanisk
 *       ventilasjon, f.eks. Tobin MJ (red.), Principles and Practice of Mechanical
 *       Ventilation, 3. utg., 2013 (kap. om respirasjonsmekanikk).
 *  [K2] Tidskonstant τ = R·C; etter 1τ er 63 %, 2τ 86 %, 3τ 95 % av volumet
 *       ekshalert (passiv ekspirasjon i enkompartmentmodell). Samme kilde som K1.
 *  [K3] Predikert kroppsvekt (PBW), ARDS Network: menn 50 + 0,91·(høyde cm − 152,4),
 *       kvinner 45,5 + 0,91·(høyde cm − 152,4). NEJM 2000;342:1301-8 (ARMA-studien).
 *  [K4] Hamilton IBW (ideal body weight) fra høyde og kjønn:
 *       menn 0,9079·høyde − 88,022; kvinner 0,9049·høyde − 92,006.
 *       UVERIFISERT: jeg mener dette står i Hamilton Medicals brukerhåndbøker
 *       (f.eks. HAMILTON-C6, avsnitt om IBW), men kan ikke bekrefte tallene.
 *       Avviker < 1 kg fra K3 i voksent høydeområde.
 *  [K5] Drivtrykk ΔP = Pplat − PEEP (totalt). Amato MBP et al., NEJM 2015;372:747-55.
 *  [K6] Statisk compliance Cstat = Vt/(Pplat − PEEPtot); inspiratorisk resistance
 *       Rinsp = (Ppeak − Pplat)/flow ved konstant flow. Samme kilde som K1.
 */

/**
 * Luftveistrykk fra bevegelsesligningen [K1].
 * Paw = V/C + R·flow − Pmus   (V er volum over volumet ved Paw = 0, dvs. PEEP ligger i V/C)
 * Alternativt med volum relativt til PEEP-nivå: Paw = V/C + R·flow + PEEP − Pmus.
 * @param {object} p
 * @param {number} p.volume      ml (over referansevolum)
 * @param {number} p.flow        L/s (positiv = inspirasjon)
 * @param {number} p.compliance  ml/cmH2O
 * @param {number} p.resistance  cmH2O/(L/s)
 * @param {number} [p.peep=0]    cmH2O, legges til hvis volume er relativt til PEEP-nivå
 * @param {number} [p.pmus=0]    cmH2O, pasientens inspiratoriske muskeltrykk (≥ 0 ved innsats)
 */
export function airwayPressure({ volume, flow, compliance, resistance, peep = 0, pmus = 0 }) {
  return volume / compliance + resistance * flow + peep - pmus;
}

/** Tidskonstant τ = R·C i sekunder [K2]. R i cmH2O/(L/s), C i ml/cmH2O → ml·s/L = s/1000. */
export function timeConstant(resistance, compliance) {
  return (resistance * compliance) / 1000;
}

/** Andel av volumet som er ekshalert etter tiden t ved passiv ekspirasjon [K2]. */
export function exhaledFraction(t, tau) {
  if (tau <= 0) return 1;
  return 1 - Math.exp(-t / tau);
}

/** Drivtrykk = Pplat − PEEPtot [K5]. */
export function drivingPressure(pplat, peepTotal) {
  return pplat - peepTotal;
}

/** Statisk compliance = Vt/(Pplat − PEEPtot) [K6]. Returnerer null hvis nevneren er ≤ 0. */
export function staticCompliance(vt, pplat, peepTotal) {
  const dp = pplat - peepTotal;
  return dp > 0 ? vt / dp : null;
}

/** Inspiratorisk resistance = (Ppeak − Pplat)/flow ved konstant flow [K6]. flow i L/s. */
export function inspiratoryResistance(ppeak, pplat, flow) {
  return flow > 0 ? (ppeak - pplat) / flow : null;
}

/** Minuttvolum i L/min fra tidalvolum (ml) og frekvens (/min). */
export function minuteVolume(vt, rate) {
  return (vt * rate) / 1000;
}

/** Middeltrykk som tidsvektet gjennomsnitt av trykkprøver. samples: [{p, dt}] */
export function meanPressure(samples) {
  let sum = 0;
  let time = 0;
  for (const s of samples) {
    sum += s.p * s.dt;
    time += s.dt;
  }
  return time > 0 ? sum / time : 0;
}

/** Auto-PEEP = alveolært trykk ved slutten av ekspirasjonen − innstilt PEEP. */
export function autoPeep(endExpiratoryAlveolarPressure, setPeep) {
  return Math.max(0, endExpiratoryAlveolarPressure - setPeep);
}

/**
 * Predikert kroppsvekt (PBW), ARDS Network [K3].
 * @param {number} heightCm
 * @param {'M'|'K'} sex  M = mann, K = kvinne
 */
export function predictedBodyWeightArdsNet(heightCm, sex) {
  const base = sex === 'M' ? 50 : 45.5;
  return Math.max(0, base + 0.91 * (heightCm - 152.4));
}

/**
 * Ideal body weight slik Hamilton-respiratorer regner den [K4] (UVERIFISERT).
 * @param {number} heightCm
 * @param {'M'|'K'} sex
 */
export function idealBodyWeightHamilton(heightCm, sex) {
  const ibw = sex === 'M' ? 0.9079 * heightCm - 88.022 : 0.9049 * heightCm - 92.006;
  return Math.max(0, ibw);
}

/** Vt per kg IBW (ml/kg). */
export function vtPerKg(vtMl, ibwKg) {
  return ibwKg > 0 ? vtMl / ibwKg : null;
}

/** Syklustid i sekunder fra frekvens (/min). */
export function cycleTime(rate) {
  return 60 / rate;
}

/** Ti fra I:E. ie = {i, e}, f.eks. {i: 1, e: 2}. */
export function tiFromIE(rate, ie) {
  const tc = cycleTime(rate);
  return (tc * ie.i) / (ie.i + ie.e);
}

/** I:E som tall (E/I når I = 1) fra Ti og frekvens. Returnerer {i: 1, e: x} eller {i: x, e: 1} ved invers. */
export function ieFromTi(rate, ti) {
  const te = cycleTime(rate) - ti;
  if (te <= 0) return { i: 1, e: 0 };
  if (te >= ti) return { i: 1, e: te / ti };
  return { i: ti / te, e: 1 };
}

/**
 * Toppflow (L/s) som trengs for å levere Vt (ml) i løpet av flowtiden (s) med gitt mønster.
 * 'square': konstant flow. 'decel': lineært fallende til 50 % av toppflow (areal = 0,75·peak·t).
 */
export function peakFlowForVolume(vtMl, flowTime, pattern = 'square') {
  if (flowTime <= 0) return 0;
  const vtL = vtMl / 1000;
  return pattern === 'decel' ? vtL / (0.75 * flowTime) : vtL / flowTime;
}

/** Øyeblikksflow (L/s) i et VC-flowmønster ved brøkdel x ∈ [0,1] av flowtiden. */
export function flowAtFraction(peakFlow, x, pattern = 'square') {
  if (pattern === 'decel') return peakFlow * (1 - 0.5 * x);
  return peakFlow;
}
