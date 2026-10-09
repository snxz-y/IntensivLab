/**
 * Kasusgenerator for blodgasstreneren. Ren logikk, ingen DOM.
 *
 * Bygger verdiene FREMOVER fra den underliggende forstyrrelsen:
 *   1. velg scenario (nivå, evt. vekting mot svake områder)
 *   2. sett primærverdi (HCO3 for metabolsk, PaCO2 for respiratorisk) innenfor scenarioets område
 *   3. beregn kompensasjon etter regel (Winter m.fl.) med tilfeldig avvik innenfor ±1,5 mmHg /
 *      ±1 mmol/L; legg på tilleggsforstyrrelse for blandede kasus
 *   4. pH fra Henderson–Hasselbalch; rund pH (2 des.) og PaCO2 (0,1 kPa); beregn HCO3 fra de
 *      avrundede verdiene slik analysatoren gjør (→ innbyrdes konsistent per konstruksjon)
 *   5. BE fra pH og HCO3 (Van Slyke)
 *   6. Na og albumin velges; anion gap settes etter forstyrrelsen; Cl regnes ut fra AG
 *   7. oksygenering: P/F-mål etter lungestatus, begrenset av alveolær gassligning
 * Fasiten (trinn 1–6) utledes fra de ferdige tallene med interpret.js, slik at det alltid er
 * samsvar mellom det studenten ser og det som regnes som riktig.
 */
import { phFromHco3Pco2, hco3FromPhPco2, pco2FromPhHco3, baseExcess, alveolarPo2 } from '../../core/physiology/acidbase.js';
import { kPaToMmHg, mmHgToKPa, round } from '../../core/units.js';
import { SCENARIOS, CAUSES } from './vignettes.js';
import { interpret } from './interpret.js';

const uni = (rng, a, b) => a + rng() * (b - a);
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const PF_BY_LUNG = { normal: [55, 66], lett: [42, 55], moderat: [22, 40], alvorlig: [10, 22] };

/** Velg scenario. weights: { [scenarioId eller primary]: vekt ≥ 0 } – høyere = oftere. */
export function pickScenario({ level = null, scenarioId = null, weights = null, rng = Math.random } = {}) {
  if (scenarioId) return SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const pool = SCENARIOS.filter((s) => level === null || s.level === level);
  if (!weights) return pick(rng, pool);
  const w = pool.map((s) => Math.max(0.05, (weights[s.id] ?? 1) * (weights[s.primary] ?? 1)));
  const total = w.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

/** Lag ett kasus. */
export function generateCase({ level = null, scenarioId = null, weights = null, rng = Math.random } = {}) {
  const sc = pickScenario({ level, scenarioId, weights, rng });
  const labs = sc.labs ?? {};
  const sex = sc.sex ?? (rng() < 0.5 ? 'K' : 'M');
  const age = Math.round(uni(rng, ...(sc.age ?? [19, 84])));

  // ---- primær forstyrrelse og kompensasjon (internt i mmHg/mmol/L) ----
  let hco3, pco2mmHg, agCorr;
  const agNormal = () => uni(rng, 6.5, 10.5); // holder seg ≤ 12 også etter avrunding

  if (sc.primary === 'normal') {
    hco3 = uni(rng, 23, 25.5);
    pco2mmHg = uni(rng, 37, 43);
    agCorr = agNormal();
  } else if (sc.primary === 'met-acidose') {
    hco3 = uni(rng, ...sc.severity);
    if (sc.secondary === 'met-alkalose') {
      agCorr = uni(rng, 24, 32);
      const ratio = uni(rng, 2.3, 4);
      hco3 = 24 - (agCorr - 12) / ratio;
    } else if (sc.secondary === 'met-acidose-normal-ag') {
      const ratio = uni(rng, 0.45, 0.75);
      agCorr = 12 + ratio * (24 - hco3);
    } else if (sc.agType === 'hoy') {
      const ratio = uni(rng, 0.95, 1.8);
      agCorr = 12 + ratio * (24 - hco3);
    } else {
      agCorr = agNormal();
    }
    pco2mmHg = 1.5 * hco3 + 8 + uni(rng, -1.5, 1.5);
    if (sc.secondary === 'resp-acidose') pco2mmHg += uni(rng, 6, 15);
    if (sc.secondary === 'resp-alkalose') {
      pco2mmHg -= uni(rng, 5, 10);
      // hold pH ≤ 7,44 så den metabolske acidosen forblir den primære lesningen
      pco2mmHg = Math.max(pco2mmHg, kPaToMmHg(pco2FromPhHco3(7.44, hco3)));
    }
    pco2mmHg = Math.max(12, pco2mmHg);
  } else if (sc.primary === 'met-alkalose') {
    hco3 = uni(rng, ...sc.severity);
    pco2mmHg = Math.min(58, 0.7 * hco3 + 21 + uni(rng, -1.5, 1.5));
    agCorr = agNormal();
  } else if (sc.primary === 'resp-acidose') {
    pco2mmHg = kPaToMmHg(uni(rng, ...sc.severity));
    const d = (pco2mmHg - 40) / 10;
    const acute = 24 + 1 * d;
    const chronic = 24 + 3.5 * d;
    hco3 = sc.chronic ? chronic + uni(rng, -1, 1) : acute + uni(rng, -0.8, 0.8);
    agCorr = agNormal();
    if (sc.secondary === 'met-acidose-hoy-ag') {
      hco3 = acute - uni(rng, 3.5, 7);
      agCorr = 12 + uni(rng, 1.0, 1.6) * (24 - hco3);
    }
  } else {
    pco2mmHg = kPaToMmHg(uni(rng, ...sc.severity));
    const d = (40 - pco2mmHg) / 10;
    const acute = 24 - 2 * d;
    const chronic = Math.max(12, 24 - 4 * d);
    hco3 = sc.chronic ? chronic + uni(rng, -1, 1) : acute + uni(rng, -0.8, 0.8);
    agCorr = agNormal();
    if (sc.secondary === 'met-alkalose') hco3 = acute + uni(rng, 4.5, 8);
  }

  // ---- pH og avrunding som på analysatoren ----
  let pco2 = mmHgToKPa(pco2mmHg);
  const phExact = phFromHco3Pco2(hco3, pco2);
  const ph = round(phExact, 2);
  pco2 = round(pco2, 1);
  const hco3Disp = round(hco3FromPhPco2(ph, pco2), 1);
  const be = round(baseExcess(ph, hco3Disp), 1);

  // ---- elektrolytter ----
  const na = Math.round(uni(rng, ...(labs.na ?? [136, 144])));
  const albumin = Math.round(uni(rng, ...(labs.albumin ?? [34, 44])));
  const agMeasuredTarget = agCorr - 0.25 * (40 - albumin); // inverter Figge-korreksjonen
  const cl = Math.round(na - hco3Disp - agMeasuredTarget);
  const k = round(uni(rng, ...(labs.k ?? [3.6, 4.6])), 1);
  const lactate = round(uni(rng, ...(labs.lactate ?? [0.6, 1.6])), 1);
  const glucose = round(uni(rng, ...(labs.glucose ?? [4.5, 8.0])), 1);

  // ---- oksygenering ----
  const fio2 = pick(rng, sc.fio2);
  const pao2Alv = alveolarPo2(fio2, pco2);
  const pfTarget = uni(rng, ...PF_BY_LUNG[sc.lung]);
  let po2 = pfTarget * fio2;
  po2 = Math.min(po2, pao2Alv - uni(rng, 0.7, 1.5));
  po2 = round(Math.max(3.5, po2), 1);

  const values = { ph, pco2, po2, hco3: hco3Disp, be, lactate, na, k, cl, albumin, glucose, fio2 };
  const key = { ...interpret(values, { primary: sc.primary, chronic: sc.chronic ?? null }), causes: sc.causes, agCorrTarget: agCorr };
  const causeOptions = shuffle(rng, [...sc.causes, ...sc.distractors]).map((id) => ({ id, label: CAUSES[id] }));
  const kjonn = sex === 'K' ? 'kvinne' : 'mann';
  const vignette = sc.text.replace('{Kjonn}', kjonn[0].toUpperCase() + kjonn.slice(1)).replace('{kjonn}', kjonn).replace('{alder}', String(age));

  return {
    id: `${sc.id}-${Math.floor(rng() * 1e9).toString(36)}`,
    scenarioId: sc.id,
    level: sc.level,
    primary: sc.primary,
    secondary: sc.secondary ?? null,
    chronic: !!sc.chronic,
    agType: sc.agType ?? null,
    patient: { age, sex },
    vignette,
    values,
    key,
    causeOptions,
  };
}
