/**
 * Statistikk og adaptiv utvelgelse for blodgasstreneren. Ren logikk, ingen DOM.
 *
 * Teller treff per trinn (1–7), per forstyrrelsestype (primær), per nivå og per scenario.
 * selectionWeights() gir vekter til generatorens pickScenario(): områder med lav treffprosent
 * (eller få forsøk) vektes opp, med litt tilfeldighet igjen i generatoren.
 */
import { SCENARIOS } from './vignettes.js';

export const STEP_NAMES = {
  1: 'Acidemi / alkalemi',
  2: 'Primær forstyrrelse',
  3: 'Kompensasjon',
  4: 'Anion gap',
  5: 'Oksygenering',
  6: 'Årsaker',
};

export const STATS_VERSION = 2;

export function emptyStats() {
  return { version: STATS_VERSION, cases: 0, steps: {}, types: {}, levels: {}, scenarios: {}, history: [] };
}

function bump(map, key, correct) {
  const e = map[key] ?? { n: 0, correct: 0 };
  e.n += 1;
  if (correct) e.correct += 1;
  map[key] = e;
}

/**
 * Registrer et gjennomført kasus.
 * @param {object} stats
 * @param {object} c        kasuset fra generateCase
 * @param {Array<{correct: boolean|null}>} results  ett element per trinn (null = ikke aktuelt)
 */
export function recordCase(stats, c, results) {
  const s = stats ?? emptyStats();
  s.cases += 1;
  const types = [c.primary];
  if (c.secondary) types.push(c.secondary.replace(/-normal-ag|-hoy-ag/, ''));
  results.forEach((r, i) => {
    if (!r || r.correct === null || r.correct === undefined) return;
    bump(s.steps, String(i + 1), r.correct);
    for (const t of new Set(types)) bump(s.types, t, r.correct);
    bump(s.levels, String(c.level), r.correct);
    bump(s.scenarios, c.scenarioId, r.correct);
  });
  s.history.push({
    scenarioId: c.scenarioId, level: c.level, primary: c.primary, date: Date.now(),
    perStep: results.map((r) => (r && r.correct !== null && r.correct !== undefined ? r.correct : null)),
  });
  if (s.history.length > 100) s.history.splice(0, s.history.length - 100);
  return s;
}

/** Treffprosent 0–1, eller null uten forsøk. */
export function accuracy(entry) {
  if (!entry || entry.n === 0) return null;
  return entry.correct / entry.n;
}

/** Sorterte svakheter: [{key, n, acc}] med lavest treff først (kun med ≥ minN forsøk). */
export function weakest(map, minN = 3) {
  return Object.entries(map)
    .map(([key, e]) => ({ key, n: e.n, acc: accuracy(e) }))
    .filter((x) => x.n >= minN)
    .sort((a, b) => a.acc - b.acc);
}

/**
 * Vekter til pickScenario(): 1 for ukjent, opp mot 4 ved lav treffprosent, 1,5 for lite øvde.
 * Vekter gis både per primærtype og per scenario (generatoren multipliserer dem).
 */
export function selectionWeights(stats) {
  const w = {};
  const weightFor = (e) => {
    if (!e || e.n === 0) return 1.5;
    const acc = accuracy(e);
    const confidence = Math.min(1, e.n / 6);
    return 1 + 3 * (1 - acc) * confidence + (1 - confidence) * 0.5;
  };
  for (const t of ['met-acidose', 'met-alkalose', 'resp-acidose', 'resp-alkalose']) w[t] = weightFor(stats?.types?.[t]);
  for (const sc of SCENARIOS) w[sc.id] = weightFor(stats?.scenarios?.[sc.id]);
  return w;
}

/** Adaptivt nivåvalg: start enkelt, gå opp når treffprosenten på nivået er god. */
export function suggestLevel(stats) {
  const a1 = accuracy(stats?.levels?.['1']);
  const n1 = stats?.levels?.['1']?.n ?? 0;
  const a2 = accuracy(stats?.levels?.['2']);
  const n2 = stats?.levels?.['2']?.n ?? 0;
  const a3 = accuracy(stats?.levels?.['3']);
  const n3 = stats?.levels?.['3']?.n ?? 0;
  // vekt mellom nivåene: svake nivåer oftere, men alltid litt av alt når grunnlaget er på plass
  if (n1 < 12 || (a1 ?? 0) < 0.7) return { weights: { 1: 0.8, 2: 0.15, 3: 0.05 }, reason: 'Bygger grunnlag på enkle forstyrrelser' };
  if (n2 < 12 || (a2 ?? 0) < 0.7) return { weights: { 1: 0.25, 2: 0.6, 3: 0.15 }, reason: 'Øver kompenserte forstyrrelser' };
  if (n3 < 12 || (a3 ?? 0) < 0.7) return { weights: { 1: 0.15, 2: 0.25, 3: 0.6 }, reason: 'Øver blandede forstyrrelser' };
  return { weights: { 1: 0.2, 2: 0.3, 3: 0.5 }, reason: 'Blandet trening, vektet mot svakeste områder' };
}

/** Velg nivå ut fra vekter. */
export function pickLevel(weights, rng = Math.random) {
  const entries = Object.entries(weights);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  let r = rng() * total;
  for (const [k, v] of entries) { r -= v; if (r <= 0) return Number(k); }
  return Number(entries[entries.length - 1][0]);
}
