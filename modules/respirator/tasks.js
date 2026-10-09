/**
 * Oppgaver for respiratorsimulatoren. Ren logikk, ingen DOM.
 *
 * - TASKS: oppgavedefinisjoner, gruppert i kategorier (CATEGORIES).
 * - simulateSteady(): kjører en kopi av respiratoren til steady state (fasit for
 *   «hva skjer hvis …»-spørsmål).
 * - predictionFor(): lager et forutsigelsesspørsmål for en innstillingsendring.
 * - observedDirection(): klassifiserer en endring i en måleverdi som opp/ned/uendret.
 * - evaluateTask(): sjekker kriteriene og lager forklarende tilbakemelding.
 *
 * Mål brukt i kriterier (se KILDER.md): Vt 6 ml/kg PBW og Pplat ≤ 30 cmH2O (ARDS Network 2000),
 * drivtrykk ≤ 15 cmH2O (Amato 2015), RSBI < 105 (Yang & Tobin 1991), PetCO2/PaCO2-mål 4,7–6,0 kPa
 * (referanseområde), SpO2-mål 92–96 % (vanlig anbefaling for intensivpasienter; UVERIFISERT eksakt område).
 */
import { createVentilator } from '../../core/sim/ventilator.js';
import { getProfile } from './profiles.js';
import { gasForProfile } from './scenarios.js';
import { fmt } from '../../core/units.js';

export const MEASURES = {
  ppeak: { label: 'Ppeak', unit: 'cmH2O', threshold: 0.5, decimals: 1 },
  pplat: { label: 'Pplateau', unit: 'cmH2O', threshold: 0.5, decimals: 1 },
  pmean: { label: 'Pmean', unit: 'cmH2O', threshold: 0.3, decimals: 1 },
  pinsp: { label: 'ΔPinsp (APV)', unit: 'cmH2O', threshold: 0.5, decimals: 1 },
  drivingPressure: { label: 'Drivtrykk (Pplat − PEEPtot)', unit: 'cmH2O', threshold: 0.5, decimals: 1 },
  autoPeep: { label: 'AutoPEEP', unit: 'cmH2O', threshold: 0.4, decimals: 1 },
  vte: { label: 'VTE', unit: 'ml', threshold: 15, decimals: 0 },
  expMinVol: { label: 'ExpMinVol', unit: 'L/min', threshold: 0.3, decimals: 1 },
  fTotal: { label: 'fTotal', unit: '/min', threshold: 0.5, decimals: 0 },
  te: { label: 'TE', unit: 's', threshold: 0.1, decimals: 2 },
  ti: { label: 'TI', unit: 's', threshold: 0.08, decimals: 2 },
};

/** Forklaringer: hvorfor en innstilling påvirker en måleverdi. */
const WHY = {
  vt: {
    pplat: 'Pplat = PEEPtot + Vt/C. Med uendret compliance gir større Vt høyere platåtrykk, og mindre Vt lavere.',
    pinsp: 'I (S)CMV+ (APV) justerer respiratoren trykket til Vt nås: høyere Vt krever høyere ΔPinsp (≈ Vt/C).',
    ppeak: 'Ppeak følger platået (pluss R·flow). Større Vt gir høyere trykk.',
    drivingPressure: 'Drivtrykk = Vt/C (= Pplat − PEEPtot). Det endres i takt med Vt så lenge compliance er lik.',
    expMinVol: 'Minuttvolum = Vt · f. Endrer du Vt uten å endre frekvens, endres minuttvolumet tilsvarende.',
    autoPeep: 'Større Vt må tømmes på samme ekspirasjonstid. Hvis tiden allerede er knapp, blir mer igjen i lungen.',
  },
  rate: {
    expMinVol: 'Minuttvolum = Vt · f. Høyere frekvens gir høyere minuttvolum når Vt holdes.',
    autoPeep: 'Høyere frekvens forkorter syklustiden og dermed ekspirasjonstiden. Når TE blir kort i forhold til tidskonstanten (R·C), rekker ikke lungen å tømme seg, og auto-PEEP bygger seg opp.',
    te: 'TE = 60/f − TI. Frekvensen bestemmer syklustiden, og det som ikke går til inspirasjon, blir ekspirasjon.',
    pplat: 'Pplat påvirkes av frekvens bare indirekte: via auto-PEEP, som løfter PEEPtot og dermed platået.',
    ppeak: 'Ppeak påvirkes indirekte via auto-PEEP (høyere basis).',
    vte: 'I trykkontroll kan kortere TI (når I:E holdes) gi mindre Vt fordi lungen får færre tidskonstanter til å fylle seg.',
  },
  peep: {
    pplat: 'Pplat = PEEP + Vt/C. Når PEEP økes, løftes hele trykkurven; platået stiger like mye som PEEP (uten auto-PEEP og med lineær compliance).',
    ppeak: 'Hele trykkurven løftes med PEEP, så topptrykket stiger tilsvarende.',
    pinsp: 'ΔPinsp settes over PEEP og bestemmes av Vt/C, så den er omtrent uendret når PEEP endres (modellen har lineær compliance).',
    drivingPressure: 'Drivtrykk = Pplat − PEEPtot. Begge stiger like mye, så drivtrykket er uendret så lenge Vt og compliance er de samme. (I virkeligheten kan PEEP rekruttere og bedre compliance, men det er ikke med i trykkmodellen.)',
    pmean: 'Middeltrykket løftes omtrent like mye som PEEP.',
    vte: 'I (S)CMV+ er Vt målet og holdes. I PCV+ er ΔPcontrol satt over PEEP, så drivtrykket og dermed Vt er også uendret.',
  },
  ie: {
    te: 'I:E fordeler syklustiden mellom inspirasjon og ekspirasjon. Mer tid til E gir lengre TE.',
    ti: 'I:E bestemmer TI når frekvensen holdes: TI = Tsyklus · I/(I+E).',
    autoPeep: 'Lengre ekspirasjonstid gir flere tidskonstanter til å tømme lungen; kortere gir mindre tid og mer auto-PEEP.',
    ppeak: 'Kortere TI betyr at samme volum må leveres raskere; i APV og PCV+ stiger trykket.',
    vte: 'I trykkontroll bestemmer TI hvor mange tidskonstanter lungen får til å fylle seg. Kortere TI kan gi mindre Vt når τ er lang.',
    pinsp: 'Kortere TI gir mindre tid til fylling; APV må øke ΔPinsp for å nå Vt.',
  },
  ti: {
    te: 'TE = 60/f − TI. Kortere TI gir lengre TE ved samme frekvens.',
    autoPeep: 'Lengre ekspirasjonstid gir flere tidskonstanter til å tømme lungen; kortere gir mindre tid og mer auto-PEEP.',
    vte: 'I trykkontroll bestemmer TI hvor mange tidskonstanter lungen får til å fylle seg.',
    pinsp: 'Kortere TI gir mindre tid til fylling; APV må øke ΔPinsp for å nå Vt.',
  },
  pcontrol: {
    vte: 'I PCV+ er Vt = C · ΔPcontrol · (1 − e^(−TI/τ)). Høyere ΔPcontrol gir større Vt.',
    ppeak: 'Ppeak = PEEP + ΔPcontrol i trykkontroll.',
    pplat: 'Platået nærmer seg PEEP + ΔPcontrol når lungen rekker å fylles.',
    drivingPressure: 'I trykkontroll er drivtrykket ≈ ΔPcontrol (når flowen når null før TI er over).',
    expMinVol: 'Større Vt per pust gir høyere minuttvolum ved samme frekvens.',
  },
  psupport: {
    vte: 'Høyere trykkstøtte gir større Vt for samme pasientinnsats.',
    ppeak: 'Ppeak = PEEP + ΔPsupport.',
    expMinVol: 'Større Vt per pust gir høyere minuttvolum.',
    fTotal: 'Mer støtte gir større pust; pasienten trenger færre pust for samme minuttvolum, så frekvensen faller ofte noe.',
  },
  ets: {
    ti: 'ETS bestemmer når trykkstøtten slutter: høyere ETS (% av toppflow) avslutter tidligere og gir kortere TI.',
    vte: 'Kortere inspirasjon gir mindre Vt per pust.',
    te: 'Kortere TI gir lengre tid til ekspirasjon.',
  },
  pramp: {
    ppeak: 'P-ramp er stigetiden til innstilt trykk. Den endrer ikke trykknivået, bare hvor raskt det nås.',
    vte: 'Lang P-ramp bruker en del av TI på å nå trykket, så Vt kan bli litt mindre.',
  },
  fio2: {},
  pmax: {
    vte: 'Pmax − 10 = Plimit. I APV kan respiratoren ikke gå over Plimit; er grensen for lav, nås ikke Vt.',
    ppeak: 'Respiratoren begrenser trykket ved Plimit = Pmax − 10.',
  },
};

const DIRECTIONS = [
  { id: 'opp', label: 'Øker' },
  { id: 'ned', label: 'Synker' },
  { id: 'uendret', label: 'Omtrent uendret' },
];

/** Kjør en kopi av respiratoren til steady state og returner måleverdiene. */
export function simulateSteady(settings, patient, seconds = 45) {
  const v = createVentilator({ settings: structuredClone(settings), patient: structuredClone(patient) });
  v.run(seconds);
  return { ...v.measurements };
}

/** Klassifiser endring i en måleverdi. */
export function observedDirection(before, after, measure) {
  const th = MEASURES[measure]?.threshold ?? 0.5;
  if (before === null || after === null || before === undefined || after === undefined) return 'uendret';
  const d = after - before;
  if (Math.abs(d) < th) return 'uendret';
  return d > 0 ? 'opp' : 'ned';
}

export function settingLabel(key) {
  return {
    vt: 'Vt', rate: 'Rate', peep: 'PEEP/CPAP', ie: 'I:E', ti: 'TI', pcontrol: 'ΔPcontrol', psupport: 'ΔPsupport',
    tip: 'Pause', flowPattern: 'Flowmønster', pramp: 'P-ramp', ets: 'ETS', fio2: 'Oksygen', trigger: 'Trigger',
    triggerValue: 'Flowtrigger', pmax: 'Pmax', mode: 'Modus', tiMax: 'TI max', apneaTime: 'Apnétid', timingMode: 'Tidsinnstilling',
    backupRate: 'Backup rate', backupPcontrol: 'Backup ΔPinsp',
  }[key] ?? key;
}

export function formatSettingValue(key, value) {
  if (key === 'ie') return value.i === 1 ? `1:${value.e}` : `${value.i}:1`;
  if (key === 'flowPattern') return value === 'decel' ? 'deselererende' : 'firkant';
  if (key === 'trigger') return `${value.value} ${value.type === 'flow' ? 'L/min' : 'cmH2O'}`;
  return String(value);
}

/**
 * Lag et forutsigelsesspørsmål for en innstillingsendring. Returnerer null hvis ingen av
 * fokusmålene endres nevneverdig (f.eks. FiO2).
 */
export function predictionFor({ key, oldValue, newValue, settings, patient, focus, before }) {
  const base = before ?? simulateSteady(settings, patient);
  const changed = structuredClone(settings);
  changed[key] = newValue;
  if (key === 'ie') changed.timingMode = 'ie';
  if (key === 'ti') changed.timingMode = 'ti';
  const after = simulateSteady(changed, patient);

  let best = null;
  focus.forEach((m, i) => {
    const th = MEASURES[m].threshold;
    const score = Math.abs((after[m] ?? 0) - (base[m] ?? 0)) / th - i * 0.5;
    if (score >= 1 && (!best || score > best.score)) best = { m, score };
  });
  const measure = best?.m ?? focus[0];
  const expected = observedDirection(base[measure], after[measure], measure);
  if (!best && expected === 'uendret' && !WHY[key]?.[measure]) return null;

  const mm = MEASURES[measure];
  return {
    key, measure, oldValue, newValue,
    text: `Du endrer ${settingLabel(key)} fra ${formatSettingValue(key, oldValue)} til ${formatSettingValue(key, newValue)}. Hva tror du skjer med ${mm.label}?`,
    options: DIRECTIONS,
    expected,
    expectedValue: after[measure],
    baseValue: base[measure],
    why: WHY[key]?.[measure] ?? `Simulatoren viser at ${mm.label} går fra ${fmt(base[measure], mm.decimals)} til ${fmt(after[measure], mm.decimals)} ${mm.unit}.`,
  };
}

const ie = (i, e) => ({ i, e });
const noEffort = { effort: { amplitude: 0, rate: 14, duration: 1 } };
const crit = (label, ok, detail) => ({ label, ok: !!ok, detail });
const between = (v, lo, hi) => v !== null && v !== undefined && v >= lo && v <= hi;

export const CATEGORIES = [
  { id: 'lunge', name: 'Lungebeskyttende ventilasjon' },
  { id: 'feil', name: 'Feilsøking og alarmer' },
  { id: 'obstruktiv', name: 'Auto-PEEP og obstruksjon' },
  { id: 'modus', name: 'Modus og innstillinger' },
  { id: 'gass', name: 'Oksygenering og CO2' },
  { id: 'avvenning', name: 'Trigging, synkroni og avvenning' },
];

/** Standardkriterier som flere oppgaver deler. */
const common = {
  vtKg: (m, lo = 5.5, hi = 7) => crit(`Vt ${lo.toString().replace('.', ',')}–${hi} ml/kg IBW`, between(m.vtPerKg, lo, hi), `VTE ${fmt(m.vte, 0)} ml = ${fmt(m.vtPerKg, 1)} ml/kg (IBW ${fmt(m.ibw, 1)} kg). Mål: ca. ${fmt(6 * m.ibw, 0)} ml.`),
  pplat: (m, max = 30) => crit(`Pplateau ≤ ${max} cmH2O`, m.pplat <= max, `Pplateau ${fmt(m.pplat, 1)} cmH2O. Pplat = PEEPtot + Vt/C.`),
  dp: (m, max = 15) => crit(`Drivtrykk ≤ ${max} cmH2O`, m.drivingPressure <= max, `Drivtrykk ${fmt(m.drivingPressure, 1)} cmH2O = Vt/C. PEEP flytter ikke drivtrykket, bare Vt (eller bedre compliance) gjør det.`),
  mv: (m, min = 6) => crit(`ExpMinVol ≥ ${min} L/min`, m.expMinVol >= min, `ExpMinVol ${fmt(m.expMinVol, 1)} L/min. Når Vt reduseres, må frekvensen opp for å holde minuttvolumet (og CO2).`),
  autoPeep: (m, max = 1) => crit(`AutoPEEP < ${max} cmH2O`, m.autoPeep < max, `AutoPEEP ${fmt(m.autoPeep, 1)} cmH2O. Sjekk at ekspirasjonsflowen når null før neste pust.`),
  spo2: (g, lo = 92, hi = 96) => crit(`SpO2 ${lo}–${hi} %`, between(g.spo2 * 100, lo, hi), `SpO2 ${fmt(g.spo2 * 100, 0)} %. Målet er nok oksygen uten unødvendig høy FiO2.`),
  co2: (g, lo = 4.7, hi = 6.0) => crit(`PaCO2 ${lo}–${hi} kPa (modell)`, between(g.paco2, lo, hi), `PaCO2 ${fmt(g.paco2, 1)} kPa (PetCO2 ${fmt(g.paco2 - 0.5, 1)}). PaCO2 styres av alveolær ventilasjon = (Vt − dødrom) · f.`),
};

export const TASKS = [
  // ---------------- Lungebeskyttende ----------------
  {
    id: 'lungebeskyttende', cat: 'lunge',
    title: 'Still inn lungebeskyttende ventilasjon',
    profileId: 'ards',
    vignette: 'Kvinne, 170 cm, intubert for moderat ARDS etter pneumoni. Hun er dypt sedert og puster ikke selv. Respiratoren står i (S)CMV+ med Vt 600 ml, rate 14 og PEEP 5.',
    goal: 'Vt 6 ml/kg IBW, Pplateau ≤ 30 cmH2O og drivtrykk ≤ 15 cmH2O, uten at minuttvolumet faller under 6 L/min. Bruk inspiratorisk hold for å måle Pplateau.',
    settings: { mode: 'APVCMV', vt: 600, rate: 14, peep: 5, timingMode: 'ie', ie: ie(1, 2), fio2: 60 },
    focus: ['pplat', 'drivingPressure', 'vte', 'expMinVol', 'autoPeep'],
    requireHold: 'insp',
    criteria: ({ m }) => [common.vtKg(m), common.pplat(m), common.dp(m), common.mv(m), common.autoPeep(m)],
  },
  {
    id: 'drivtrykk', cat: 'lunge',
    title: 'Få ned drivtrykket',
    profileId: 'ards',
    vignette: 'Mann, 180 cm, ARDS dag 2. Ventileres i (S)CMV+ med Vt 520 ml og PEEP 8. Legen ber deg få drivtrykket under 15 uten at minuttvolumet faller under 7 L/min.',
    goal: 'Drivtrykk ≤ 15 cmH2O og ExpMinVol ≥ 7 L/min. Pplateau ≤ 30.',
    settings: { mode: 'APVCMV', vt: 520, rate: 14, peep: 8, timingMode: 'ie', ie: ie(1, 2), fio2: 50 },
    patientOverride: { compliance: 22, height: 180, sex: 'M' },
    focus: ['drivingPressure', 'pplat', 'expMinVol', 'vte'],
    requireHold: 'insp',
    criteria: ({ m }) => [common.dp(m), common.mv(m, 7), common.pplat(m), crit('Vt ≤ 8 ml/kg IBW', m.vtPerKg <= 8, `${fmt(m.vtPerKg, 1)} ml/kg.`)],
  },
  {
    id: 'peep-titrering', cat: 'lunge',
    title: 'PEEP-titrering ved hypoksemi',
    profileId: 'ards',
    vignette: 'Kvinne, 165 cm, ARDS. SpO2 88 % på FiO2 60 % og PEEP 5. Lungene er rekrutterbare. Pplateau er foreløpig 24.',
    goal: 'SpO2 92–96 % med FiO2 ≤ 60 %, Pplateau ≤ 30 og drivtrykk ≤ 15. Hint: PEEP rekrutterer, og rekruttering senker shunten. Gi det 1–2 minutter etter hver endring.',
    settings: { mode: 'APVCMV', vt: 380, rate: 20, peep: 5, timingMode: 'ie', ie: ie(1, 2), fio2: 60 },
    patientOverride: { compliance: 28, height: 165, sex: 'K' },
    gas: { shunt: 0.32, recruitability: 0.7 },
    focus: ['pplat', 'drivingPressure', 'pmean', 'vte'],
    criteria: ({ m, gas, settings }) => [common.spo2(gas), crit('FiO2 ≤ 60 %', settings.fio2 <= 60, `FiO2 ${settings.fio2} %. Høy FiO2 over tid gir resorpsjonsatelektaser og oksygentoksisitet.`), common.pplat(m), common.dp(m)],
  },
  {
    id: 'permissiv', cat: 'lunge',
    title: 'Permissiv hyperkapni',
    profileId: 'ards',
    vignette: 'Mann, 175 cm, alvorlig ARDS med compliance 18 ml/cmH2O. Med Vt 6 ml/kg og rate 30 er Pplateau 33. Legen aksepterer PaCO2 opp til 8 kPa så lenge pH holdes over 7,25.',
    goal: 'Pplateau ≤ 30 og drivtrykk ≤ 15. PaCO2 (modell) ≤ 8,0 kPa. AutoPEEP < 2.',
    settings: { mode: 'APVCMV', vt: 430, rate: 30, peep: 12, timingMode: 'ie', ie: ie(1, 1.5), fio2: 70 },
    patientOverride: { compliance: 18, resistance: 12, resistanceExp: 12, height: 175, sex: 'M' },
    gas: { shunt: 0.3, recruitability: 0.3 },
    focus: ['pplat', 'drivingPressure', 'autoPeep', 'expMinVol'],
    criteria: ({ m, gas }) => [common.pplat(m), common.dp(m), crit('PaCO2 ≤ 8,0 kPa (modell)', gas.paco2 <= 8.0, `PaCO2 ${fmt(gas.paco2, 1)} kPa. Lavere Vt må kompenseres med frekvens, men høy frekvens gir kort TE.`), common.autoPeep(m, 2)],
  },
  // ---------------- Feilsøking ----------------
  {
    id: 'topptrykk', cat: 'feil',
    title: 'Finn årsaken til høyt trykk',
    profileId: 'normal',
    vignette: 'Mann, 178 cm, intubert etter hodeskade. Respiratoren står i (S)CMV+. ΔPinsp har steget, og høytrykksalarmen har begynt å gå. Pasienten er sedert.',
    goal: 'Finn ut om det høye trykket skyldes økt resistance (sekret, bronkospasme, knekk på tuben) eller redusert compliance (pneumothorax, atelektase, væske). Bruk inspiratorisk hold og se på forskjellen mellom Ppeak og Pplateau.',
    settings: { mode: 'APVCMV', vt: 500, rate: 14, peep: 5, timingMode: 'ie', ie: ie(1, 2), fio2: 40, pmax: 45 },
    focus: ['ppeak', 'pplat', 'drivingPressure', 'pinsp'],
    requireHold: 'insp',
    setup(rng = Math.random) {
      const cause = rng() < 0.5 ? 'resistance' : 'compliance';
      const patient = cause === 'resistance'
        ? { compliance: 50, resistance: 32, resistanceExp: 36, ...noEffort, height: 178, sex: 'M' }
        : { compliance: 18, resistance: 10, resistanceExp: 10, ...noEffort, height: 178, sex: 'M' };
      return { hidden: { cause }, patient };
    },
    question: {
      text: 'Hva er mest sannsynlig årsak til det høye trykket?',
      options: [
        { id: 'resistance', label: 'Økt resistance (sekret, bronkospasme, knekk/bitt på tuben)' },
        { id: 'compliance', label: 'Redusert compliance (pneumothorax, atelektase, lungeødem, abdominalt trykk)' },
        { id: 'autopeep', label: 'Auto-PEEP (for kort ekspirasjonstid)' },
        { id: 'asynkroni', label: 'Pasient–respirator-asynkroni' },
      ],
    },
    criteria({ m, hidden, answer, holdDone }) {
      const gap = m.ppeak - m.pplat;
      const explain = hidden.cause === 'resistance'
        ? `Ppeak ${fmt(m.ppeak, 1)} og Pplateau ${fmt(m.pplat, 1)}: stor forskjell (${fmt(gap, 1)} cmH2O = R·flow) med normalt platå. Trykket går med på å drive flow gjennom en trang luftvei. Rinsp måles til ${fmt(m.rinsp, 0)} cmH2O/(L/s).`
        : `Ppeak ${fmt(m.ppeak, 1)} og Pplateau ${fmt(m.pplat, 1)}: liten forskjell (${fmt(gap, 1)} cmH2O) men høyt platå. Trykket går med på å utvide en stiv lunge/thorax. Cstat måles til ${fmt(m.cstat, 0)} ml/cmH2O.`;
      return [
        crit('Inspiratorisk hold utført', holdDone, holdDone ? 'Du målte Pplateau med hold.' : 'Uten hold kan du ikke skille resistance fra compliance. Hold inne «Insp. hold» i Tools.'),
        crit('Riktig årsak', answer === hidden.cause, explain),
      ];
    },
  },
  {
    id: 'vt-lav', cat: 'feil',
    title: 'Alarm: Vt lav i (S)CMV+',
    profileId: 'normal',
    vignette: 'Kvinne, 168 cm, i (S)CMV+ med Vt 450. Alarmen «Lavt tidevolum» og «Trykkbegrensning» går, og VTE ligger på 280 ml. Pmax står på 30.',
    goal: 'Forstå hvorfor Vt ikke nås, og få VTE opp til innstilt Vt (±10 %) uten å overskride Pplateau 30. Sjekk alarmgrensene.',
    settings: { mode: 'APVCMV', vt: 450, rate: 15, peep: 8, timingMode: 'ie', ie: ie(1, 2), fio2: 40, pmax: 30 },
    patientOverride: { compliance: 28, resistance: 14, resistanceExp: 14, height: 168, sex: 'K' },
    focus: ['vte', 'ppeak', 'pinsp', 'pplat'],
    question: {
      text: 'Hvorfor når ikke respiratoren innstilt Vt?',
      options: [
        { id: 'plimit', label: 'Trykkbegrensning: Plimit (Pmax − 10) stopper APV før Vt er nådd' },
        { id: 'lekkasje', label: 'Lekkasje i kretsen' },
        { id: 'trigger', label: 'Pasienten trigger for ofte' },
        { id: 'ti', label: 'TI er for lang' },
      ],
    },
    criteria: ({ m, answer, settings }) => [
      crit('Riktig årsak', answer === 'plimit', 'I APV økes ΔPinsp bare opp til Plimit = Pmax − 10. Med Pmax 30, PEEP 8 og lav compliance er 12 cmH2O over PEEP for lite til 450 ml. Løsningen er en realistisk Pmax (typisk Ppeak + 10) – ikke å heve den blindt.'),
      crit('VTE innenfor ±10 % av innstilt Vt', between(m.vte, settings.vt * 0.9, settings.vt * 1.1), `VTE ${fmt(m.vte, 0)} ml av innstilt ${settings.vt}.`),
      common.pplat(m),
      crit('Pmax ≤ Ppeak + 15', settings.pmax <= m.ppeak + 15, `Pmax ${settings.pmax}, Ppeak ${fmt(m.ppeak, 0)}. En altfor høy grense tar bort beskyttelsen.`),
    ],
  },
  {
    id: 'autotrigging', cat: 'feil',
    title: 'Autotrigging',
    profileId: 'normal',
    vignette: 'Mann, 182 cm, sedert i (S)CMV+ rate 12. fTotal viser 26 og trykkurven har små dupp før hver pust. Flowtriggeren står på 0,5 l/min.',
    goal: 'Få fTotal ned til innstilt rate (12 ± 1) uten å endre sedasjon. Hint: små svingninger (hjerteslag, kondens) kan trigge en for følsom trigger.',
    settings: { mode: 'APVCMV', vt: 520, rate: 12, peep: 5, timingMode: 'ie', ie: ie(1, 2), fio2: 35, trigger: { type: 'flow', value: 0.5 } },
    patientOverride: { effort: { amplitude: 1.2, rate: 26, duration: 0.5 }, height: 182, sex: 'M' },
    focus: ['fTotal', 'expMinVol', 'te', 'autoPeep'],
    criteria: ({ m, settings }) => [
      crit('fTotal 11–13', between(m.fTotal, 11, 13), `fTotal ${fmt(m.fTotal, 0)}. Hver autotrigget pust er en ekstra fullverdig pust.`),
      crit('Flowtrigger ≥ 2 l/min', settings.trigger.value >= 2, `Trigger ${settings.trigger.value} l/min. En for følsom trigger reagerer på støy; 2 l/min er et vanlig utgangspunkt.`),
      crit('Flowtrigger ≤ 5 l/min', settings.trigger.value <= 5, 'En for ufølsom trigger gir ineffektive forsøk når pasienten våkner.'),
    ],
  },
  {
    id: 'alarmgrenser', cat: 'feil',
    title: 'Sett alarmgrenser',
    profileId: 'normal',
    vignette: 'Kvinne, 172 cm, nettopp intubert. Respiratoren står med fabrikkens alarmgrenser. Du skal tilpasse dem til pasienten.',
    goal: 'Pmax = Ppeak + 10 (±3). ExpMinVol lav ≈ 70 % og høy ≈ 150 % av dagens (±20 %). Vt lav ≈ 60 % og høy ≈ 150 % av Vt (±20 %). Finn verdiene i Alarmer-vinduet.',
    settings: { mode: 'APVCMV', vt: 480, rate: 14, peep: 6, timingMode: 'ie', ie: ie(1, 2), fio2: 40, pmax: 60 },
    patientOverride: { height: 172, sex: 'K' },
    focus: ['ppeak', 'expMinVol', 'vte'],
    criteria: ({ m, settings, alarms }) => [
      crit('Pmax = Ppeak + 10 (±3)', between(settings.pmax, m.ppeak + 7, m.ppeak + 13), `Pmax ${settings.pmax}, Ppeak ${fmt(m.ppeak, 0)}. Plimit (Pmax − 10) må ligge over Ppeak, ellers begrenses pustene.`),
      crit('ExpMinVol lav ≈ 70 % av MV', between(alarms.mvLow, 0.5 * m.expMinVol, 0.9 * m.expMinVol), `Grense ${alarms.mvLow}, MV ${fmt(m.expMinVol, 1)}.`),
      crit('ExpMinVol høy ≈ 150 % av MV', between(alarms.mvHigh, 1.3 * m.expMinVol, 1.7 * m.expMinVol), `Grense ${alarms.mvHigh}, MV ${fmt(m.expMinVol, 1)}.`),
      crit('Vt lav ≈ 60 % av Vt', between(alarms.vtLow, 0.4 * settings.vt, 0.8 * settings.vt), `Grense ${alarms.vtLow}, Vt ${settings.vt}.`),
      crit('Vt høy ≈ 150 % av Vt', between(alarms.vtHigh, 1.3 * settings.vt, 1.7 * settings.vt), `Grense ${alarms.vtHigh}, Vt ${settings.vt}.`),
    ],
  },
  // ---------------- Auto-PEEP ----------------
  {
    id: 'autopeep', cat: 'obstruktiv',
    title: 'Fjern auto-PEEP',
    profileId: 'obstruktiv',
    vignette: 'Mann, 178 cm, KOLS-eksaserbasjon, intubert og sedert. (S)CMV+ med rate 24 og I:E 1:1. Ekspirasjonsflowen når ikke null før neste pust.',
    goal: 'Mål auto-PEEP med ekspiratorisk hold, og endre innstillingene så AutoPEEP blir under 1 cmH2O. Hold ExpMinVol over 5 L/min og Pplateau under 30.',
    settings: { mode: 'APVCMV', vt: 500, rate: 24, peep: 5, timingMode: 'ie', ie: ie(1, 1), fio2: 40 },
    patientOverride: noEffort,
    focus: ['autoPeep', 'te', 'expMinVol', 'pplat', 'ppeak'],
    requireHold: 'exp',
    criteria: ({ m, holdDone }) => [
      crit('Ekspiratorisk hold utført', holdDone, holdDone ? 'Du målte total PEEP med hold.' : 'Auto-PEEP måles ved å lukke ekspirasjonsventilen: hold inne «Eksp. hold» i Tools.'),
      crit('AutoPEEP < 1 cmH2O', m.autoPeep < 1, `AutoPEEP ${fmt(m.autoPeep, 1)} cmH2O ved TE ${fmt(m.te, 2)} s og RCexp ${fmt(m.rcexp, 2)} s. Lungen trenger 3–4 tidskonstanter (${fmt(3 * (m.rcexp ?? 0), 1)}–${fmt(4 * (m.rcexp ?? 0), 1)} s).`),
      common.mv(m, 5), common.pplat(m),
    ],
  },
  {
    id: 'kols-pcv', cat: 'obstruktiv',
    title: 'Auto-PEEP i PCV+',
    profileId: 'obstruktiv',
    vignette: 'Kvinne, 160 cm, KOLS, ventileres i PCV+ med ΔPcontrol 15, rate 20 og I:E 1:1,5. VTE har falt gradvis og AutoPEEP viser 6.',
    goal: 'AutoPEEP < 2 og VTE ≥ 300 ml i PCV+. Hint: i trykkontroll «spiser» auto-PEEP av drivtrykket, så Vt faller når lungen ikke tømmes.',
    settings: { mode: 'PCV', pcontrol: 15, rate: 20, peep: 5, timingMode: 'ie', ie: ie(1, 1.5), fio2: 35, pramp: 100 },
    patientOverride: { ...noEffort, height: 160, sex: 'K' },
    focus: ['autoPeep', 'vte', 'te', 'expMinVol'],
    criteria: ({ m }) => [common.autoPeep(m, 2), crit('VTE ≥ 300 ml', m.vte >= 300, `VTE ${fmt(m.vte, 0)} ml. Effektivt drivtrykk = ΔPcontrol − autoPEEP.`), common.mv(m, 4.5), crit('Modus PCV+', m.mode === 'PCV', 'Oppgaven skal løses i PCV+.')],
  },
  {
    id: 'astma', cat: 'obstruktiv',
    title: 'Alvorlig astma: beskytt mot hyperinflasjon',
    profileId: 'obstruktiv',
    vignette: 'Mann, 185 cm, status asthmaticus, nettopp intubert. Rinsp 25, Rexp 45. Respiratoren står med rate 18 og I:E 1:2. Pplateau 32, AutoPEEP 9.',
    goal: 'Pplateau ≤ 28 og AutoPEEP ≤ 4. Aksepter lavt minuttvolum (≥ 4 L/min) og høy PaCO2. Hint: lav frekvens, kort TI, lang TE.',
    settings: { mode: 'APVCMV', vt: 520, rate: 18, peep: 5, timingMode: 'ie', ie: ie(1, 2), fio2: 50 },
    patientOverride: { compliance: 60, resistance: 25, resistanceExp: 45, ...noEffort, height: 185, sex: 'M' },
    focus: ['autoPeep', 'pplat', 'te', 'expMinVol'],
    criteria: ({ m }) => [common.pplat(m, 28), common.autoPeep(m, 4), common.mv(m, 4), crit('Vt ≤ 8 ml/kg IBW', m.vtPerKg <= 8, `${fmt(m.vtPerKg, 1)} ml/kg.`)],
  },
  // ---------------- Modus og innstillinger ----------------
  {
    id: 'pcv-vt', cat: 'modus',
    title: 'PCV+: finn ΔPcontrol som gir 6 ml/kg',
    profileId: 'normal',
    vignette: 'Kvinne, 165 cm, pneumoni, legen vil ha trykkontroll. Still inn ΔPcontrol så VTE blir 6 ml/kg IBW (±10 %) med rate 16 og I:E 1:2.',
    goal: 'Modus PCV+, VTE = 6 ml/kg IBW ± 10 %, Pplateau ≤ 30.',
    settings: { mode: 'PCV', pcontrol: 8, rate: 16, peep: 6, timingMode: 'ie', ie: ie(1, 2), fio2: 40, pramp: 100 },
    patientOverride: { compliance: 38, ...noEffort, height: 165, sex: 'K' },
    focus: ['vte', 'ppeak', 'expMinVol'],
    criteria: ({ m }) => [crit('Modus PCV+', m.mode === 'PCV', 'Bytt til PCV+ med modusknappen.'), common.vtKg(m, 5.4, 6.6), common.pplat(m)],
  },
  {
    id: 'spont-ps', cat: 'modus',
    title: 'SPONT: tilpass trykkstøtten',
    profileId: 'normal',
    vignette: 'Mann, 175 cm, våken og puster selv (egen drive ca. 7 cmH2O, 18/min). Respiratoren står i SPONT med ΔPsupport 4. Han puster raskt og overfladisk.',
    goal: 'Vt 6–8 ml/kg IBW og fTotal ≤ 25 i SPONT. Ikke over 10 ml/kg.',
    settings: { mode: 'SPONT', psupport: 4, peep: 5, fio2: 35, ets: 25, pramp: 50 },
    patientOverride: { effort: { amplitude: 7, rate: 22, duration: 0.9 }, height: 175, sex: 'M' },
    focus: ['vte', 'fTotal', 'expMinVol', 'ppeak'],
    criteria: ({ m }) => [crit('Modus SPONT', m.mode === 'SPONT', ''), common.vtKg(m, 6, 8), crit('fTotal ≤ 25', m.fTotal <= 25, `fTotal ${fmt(m.fTotal, 0)}. Med mer støtte blir hvert pust større og pasienten trenger færre.`), crit('Vt ≤ 10 ml/kg', m.vtPerKg <= 10, 'For mye støtte gir store pust og lav drive.')],
  },
  {
    id: 'bytt-til-spont', cat: 'modus',
    title: 'Pasienten våkner: bytt modus',
    profileId: 'ards',
    vignette: 'Kvinne, 170 cm, ARDS i bedring, nå våken med god egen drive. Hun ligger i (S)CMV+ rate 14 og trigger langt flere pust enn innstilt; trykkurven dupper.',
    goal: 'Bytt til SPONT med passende ΔPsupport: Vt 6–8 ml/kg IBW, fTotal ≤ 28, Ppeak ≤ 30.',
    settings: { mode: 'APVCMV', vt: 400, rate: 14, peep: 8, timingMode: 'ie', ie: ie(1, 2), fio2: 40 },
    patientOverride: { compliance: 38, resistance: 10, resistanceExp: 10, effort: { amplitude: 9, rate: 24, duration: 0.8 } },
    focus: ['fTotal', 'vte', 'ppeak', 'expMinVol'],
    criteria: ({ m }) => [crit('Modus SPONT', m.mode === 'SPONT', 'En våken pasient med egen drive bør få styre selv: SPONT med trykkstøtte.'), common.vtKg(m, 6, 8), crit('fTotal ≤ 28', m.fTotal <= 28, `fTotal ${fmt(m.fTotal, 0)}.`), crit('Ppeak ≤ 30', m.ppeak <= 30, `Ppeak ${fmt(m.ppeak, 0)}.`)],
  },
  {
    id: 'ti-ie', cat: 'modus',
    title: 'Tidsinnstilling: TI, I:E og rate',
    profileId: 'normal',
    vignette: 'Mann, 180 cm, (S)CMV+ rate 15 med I:E 1:2. Legen ønsker TI på 0,9 s og TE på minst 3 s.',
    goal: 'TI 0,85–0,95 s og TE ≥ 3,0 s, med ExpMinVol ≥ 6 L/min. Du kan bruke TI direkte eller I:E og rate.',
    settings: { mode: 'APVCMV', vt: 500, rate: 15, peep: 5, timingMode: 'ie', ie: ie(1, 2), fio2: 35 },
    patientOverride: { ...noEffort, height: 180, sex: 'M' },
    focus: ['ti', 'te', 'expMinVol', 'pinsp'],
    criteria: ({ m }) => [crit('TI 0,85–0,95 s', between(m.ti, 0.85, 0.95), `TI ${fmt(m.ti, 2)} s.`), crit('TE ≥ 3,0 s', m.te >= 3.0, `TE ${fmt(m.te, 2)} s = 60/rate − TI.`), common.mv(m, 6)],
  },
  {
    id: 'ets', cat: 'modus',
    title: 'ETS: tilpass syklusen til pasienten',
    profileId: 'obstruktiv',
    vignette: 'Kvinne, 162 cm, KOLS i SPONT. Hun bruker hjelpemuskler på slutten av hver pust: respiratoren fortsetter å blåse etter at hun vil puste ut (TI 1,4 s mot hennes nevrale 0,8 s).',
    goal: 'Målt TI 0,7–1,0 s i SPONT ved å justere ETS. Vt ≥ 5 ml/kg.',
    settings: { mode: 'SPONT', psupport: 12, peep: 5, fio2: 30, ets: 10, pramp: 50, tiMax: 2.0 },
    patientOverride: { effort: { amplitude: 6, rate: 18, duration: 0.8 }, height: 162, sex: 'K' },
    focus: ['ti', 'vte', 'te', 'fTotal'],
    criteria: ({ m, settings }) => [crit('TI 0,7–1,0 s', between(m.ti, 0.7, 1.0), `TI ${fmt(m.ti, 2)} s. Ved obstruksjon faller flowen sakte, så respiratoren trenger høyere ETS for å avslutte i tide.`), crit('ETS ≥ 30 %', settings.ets >= 30, `ETS ${settings.ets} %.`), crit('Vt ≥ 5 ml/kg', m.vtPerKg >= 5, `${fmt(m.vtPerKg, 1)} ml/kg.`)],
  },
  {
    id: 'apne-backup', cat: 'modus',
    title: 'Apné-backup i SPONT',
    profileId: 'normal',
    vignette: 'Mann, 170 cm, i SPONT. Han får mer sedasjon til natten, og du skal sikre at backup-ventilasjonen er fornuftig hvis han slutter å puste.',
    goal: 'Apnétid 15–20 s, backup rate 12–16 og backup ΔPinsp som ville gitt ca. 6 ml/kg (compliance ≈ 45 → 10–14 cmH2O). Sjekk under Parametere › Apné.',
    settings: { mode: 'SPONT', psupport: 8, peep: 5, fio2: 30, ets: 25, apneaTime: 40, backup: { rate: 8, pcontrol: 25 } },
    patientOverride: { compliance: 45, effort: { amplitude: 6, rate: 15, duration: 1 }, height: 170, sex: 'M' },
    focus: ['vte', 'fTotal'],
    criteria: ({ settings }) => [crit('Apnétid 15–20 s', between(settings.apneaTime, 15, 20), `Apnétid ${settings.apneaTime} s.`), crit('Backup rate 12–16', between(settings.backup.rate, 12, 16), `Backup rate ${settings.backup.rate}.`), crit('Backup ΔPinsp 10–14 cmH2O', between(settings.backup.pcontrol, 10, 14), `Backup ΔPinsp ${settings.backup.pcontrol}. Med compliance 45 gir 12 cmH2O ≈ 500 ml.`)],
  },
  {
    id: 'apv-forsta', cat: 'modus',
    title: 'Forstå (S)CMV+: hva skjer når lungen endrer seg?',
    profileId: 'normal',
    vignette: 'Kvinne, 168 cm, i (S)CMV+ Vt 420. Se på ΔPinsp i Monitorering. Compliance faller (atelektase) i løpet av oppgaven. Observer hvordan respiratoren reagerer, og svar på spørsmålet.',
    goal: 'Svar riktig på spørsmålet, og sørg for at VTE holdes på 6 ml/kg ± 10 % og Pplateau ≤ 30 etter endringen.',
    settings: { mode: 'APVCMV', vt: 420, rate: 16, peep: 6, timingMode: 'ie', ie: ie(1, 2), fio2: 40 },
    patientOverride: { compliance: 22, resistance: 10, resistanceExp: 10, ...noEffort, height: 168, sex: 'K' },
    focus: ['pinsp', 'pplat', 'vte', 'drivingPressure'],
    question: {
      text: 'Hva gjør (S)CMV+ (APVcmv) når compliance faller?',
      options: [
        { id: 'oker', label: 'Øker ΔPinsp pust for pust til Vt nås igjen (til Plimit)' },
        { id: 'holder', label: 'Holder trykket og lar Vt falle' },
        { id: 'oker-rate', label: 'Øker frekvensen' },
        { id: 'alarm', label: 'Stopper og alarmerer' },
      ],
    },
    criteria: ({ m, answer }) => [crit('Riktig svar', answer === 'oker', 'APV er trykkontroll med volummål: respiratoren justerer ΔPinsp mellom pustene til innstilt Vt nås, opp til Plimit. Derfor stiger Ppeak når lungen blir stivere, og det er drivtrykket du må følge med på.'), common.vtKg(m, 5.4, 6.6), common.pplat(m)],
  },
  // ---------------- Oksygenering og CO2 ----------------
  {
    id: 'fio2-titrering', cat: 'gass',
    title: 'Titrer ned FiO2',
    profileId: 'normal',
    vignette: 'Mann, 176 cm, intubert etter operasjon, står på FiO2 100 % siden intubasjonen. SpO2 100 %. Lungene er friske.',
    goal: 'Laveste FiO2 som gir SpO2 94–98 %. FiO2 ≤ 40 %. Gi gassmodellen et minutt etter hver endring.',
    settings: { mode: 'APVCMV', vt: 500, rate: 14, peep: 5, timingMode: 'ie', ie: ie(1, 2), fio2: 100 },
    patientOverride: { ...noEffort, height: 176, sex: 'M' },
    gas: { shunt: 0.06, recruitability: 0.2 },
    focus: ['vte', 'expMinVol'],
    criteria: ({ gas, settings }) => [common.spo2(gas, 94, 98), crit('FiO2 ≤ 40 %', settings.fio2 <= 40, `FiO2 ${settings.fio2} %. Unødvendig høy FiO2 gir resorpsjonsatelektaser og hyperoksi.`), crit('FiO2 ≥ 25 %', settings.fio2 >= 25, 'Ikke gå under det pasienten trenger.')],
  },
  {
    id: 'co2-hoy', cat: 'gass',
    title: 'Høy PetCO2: øk ventilasjonen riktig',
    profileId: 'normal',
    vignette: 'Kvinne, 170 cm, sedert i (S)CMV+. PetCO2 har krøpet opp til 7,5 kPa (PaCO2 ca. 8). Respiratoren står med Vt 350 og rate 10.',
    goal: 'PaCO2 (modell) 4,7–6,0 kPa med Vt ≤ 8 ml/kg IBW, Pplateau ≤ 30 og AutoPEEP < 1. Gi gassmodellen 3–4 minutter (bruk hastighet 4×).',
    settings: { mode: 'APVCMV', vt: 350, rate: 10, peep: 5, timingMode: 'ie', ie: ie(1, 2), fio2: 35 },
    patientOverride: { ...noEffort, height: 170, sex: 'K' },
    focus: ['expMinVol', 'vte', 'autoPeep', 'pplat'],
    criteria: ({ m, gas }) => [common.co2(gas), crit('Vt ≤ 8 ml/kg IBW', m.vtPerKg <= 8, `${fmt(m.vtPerKg, 1)} ml/kg. Alveolær ventilasjon = (Vt − dødrom) · f: å øke Vt gir mer per pust enn å øke frekvens, fordi dødrommet er fast.`), common.pplat(m), common.autoPeep(m)],
  },
  {
    id: 'co2-lav', cat: 'gass',
    title: 'Lav PetCO2: hyperventilert pasient',
    profileId: 'normal',
    vignette: 'Mann, 180 cm, hodeskade, sedert. PetCO2 3,2 kPa; legen vil ha PaCO2 4,5–5,0 (ikke lavere, av hensyn til hjerneperfusjonen).',
    goal: 'PaCO2 (modell) 4,5–5,0 kPa med Vt 6–8 ml/kg. Gi gassmodellen 3–4 minutter.',
    settings: { mode: 'APVCMV', vt: 650, rate: 18, peep: 5, timingMode: 'ie', ie: ie(1, 2), fio2: 35 },
    patientOverride: { ...noEffort, height: 180, sex: 'M' },
    focus: ['expMinVol', 'vte', 'pplat'],
    criteria: ({ m, gas }) => [common.co2(gas, 4.5, 5.0), common.vtKg(m, 6, 8)],
  },
  // ---------------- Trigging, synkroni og avvenning ----------------
  {
    id: 'ineffektiv-trigging', cat: 'avvenning',
    title: 'Pasienten får ikke trigget',
    profileId: 'normal',
    vignette: 'Kvinne, 165 cm, våken i (S)CMV+ rate 10. Du ser små dupp i trykkurven mellom pustene, men fTotal er fortsatt 10. Flowtriggeren står på 12 l/min.',
    goal: 'La pasienten trigge: fTotal 15–22 (hennes egen drive er ca. 18/min), uten autotrigging.',
    settings: { mode: 'APVCMV', vt: 420, rate: 10, peep: 5, timingMode: 'ie', ie: ie(1, 2), fio2: 35, trigger: { type: 'flow', value: 12 } },
    patientOverride: { effort: { amplitude: 4, rate: 18, duration: 0.9 }, height: 165, sex: 'K' },
    focus: ['fTotal', 'expMinVol', 'vte'],
    criteria: ({ m, settings }) => [crit('fTotal 15–22', between(m.fTotal, 15, 22), `fTotal ${fmt(m.fTotal, 0)}. Hvert ineffektivt forsøk er pustearbeid uten pust.`), crit('Flowtrigger 1–5 l/min', between(settings.trigger.value, 1, 5), `Trigger ${settings.trigger.value} l/min.`)],
  },
  {
    id: 'sbt', cat: 'avvenning',
    title: 'Spontan pusteprøve (SBT)',
    profileId: 'normal',
    vignette: 'Mann, 178 cm, dag 4, våken og samarbeider, FiO2 30 %. Legen ber om spontan pusteprøve med minimal støtte.',
    goal: 'SPONT med ΔPsupport ≤ 7, PEEP ≤ 5, og pasienten klarer seg: fTotal ≤ 30, Vt ≥ 5 ml/kg, RSBI (f/Vt i L) < 105.',
    settings: { mode: 'APVCMV', vt: 500, rate: 12, peep: 8, timingMode: 'ie', ie: ie(1, 2), fio2: 30 },
    patientOverride: { effort: { amplitude: 8, rate: 20, duration: 1.0 }, height: 178, sex: 'M' },
    focus: ['fTotal', 'vte', 'expMinVol'],
    criteria: ({ m, settings }) => {
      const rsbi = m.vte > 0 ? m.fTotal / (m.vte / 1000) : null;
      return [
        crit('SPONT med ΔPsupport ≤ 7', m.mode === 'SPONT' && settings.psupport <= 7, `Modus ${m.mode}, ΔPsupport ${settings.psupport}.`),
        crit('PEEP ≤ 5', settings.peep <= 5, `PEEP ${settings.peep}.`),
        crit('fTotal ≤ 30', m.fTotal <= 30, `fTotal ${fmt(m.fTotal, 0)}.`),
        crit('Vt ≥ 5 ml/kg', m.vtPerKg >= 5, `${fmt(m.vtPerKg, 1)} ml/kg.`),
        crit('RSBI < 105', rsbi !== null && rsbi < 105, `RSBI = f/Vt(L) = ${fmt(rsbi, 0)}. Over 105 predikerer mislykket ekstubasjon (Yang & Tobin 1991).`),
      ];
    },
  },
  {
    id: 'reduser-stotte', cat: 'avvenning',
    title: 'Trapp ned trykkstøtten trygt',
    profileId: 'normal',
    vignette: 'Kvinne, 160 cm, i SPONT med ΔPsupport 16 og PEEP 8. Hun puster rolig med Vt 9 ml/kg. Planen er nedtrapping.',
    goal: 'ΔPsupport ≤ 10 og PEEP ≤ 6 mens fTotal ≤ 28 og Vt ≥ 6 ml/kg.',
    settings: { mode: 'SPONT', psupport: 16, peep: 8, fio2: 30, ets: 25 },
    patientOverride: { compliance: 45, effort: { amplitude: 6, rate: 17, duration: 1.0 }, height: 160, sex: 'K' },
    focus: ['vte', 'fTotal', 'expMinVol'],
    criteria: ({ m, settings }) => [crit('ΔPsupport ≤ 10', settings.psupport <= 10, `ΔPsupport ${settings.psupport}.`), crit('PEEP ≤ 6', settings.peep <= 6, `PEEP ${settings.peep}.`), crit('fTotal ≤ 28', m.fTotal <= 28, `fTotal ${fmt(m.fTotal, 0)}.`), crit('Vt ≥ 6 ml/kg', m.vtPerKg >= 6, `${fmt(m.vtPerKg, 1)} ml/kg.`)],
  },
];

export function getTask(id) {
  return TASKS.find((t) => t.id === id) ?? null;
}

/** Start-oppsett for en oppgave: innstillinger, pasient, gass. */
export function taskSetup(task, rng = Math.random) {
  const profile = getProfile(task.profileId);
  let patient = structuredClone(profile.patient);
  let hidden = {};
  if (task.patientOverride) Object.assign(patient, structuredClone(task.patientOverride));
  if (task.setup) {
    const s = task.setup(rng);
    if (s.patient) patient = s.patient;
    hidden = s.hidden ?? {};
  }
  const gas = task.gas ?? gasForProfile(task.profileId);
  return { settings: structuredClone(task.settings), patient, hidden, gas };
}

/** Evaluer oppgaven. ctx: { m, gas, settings, alarms, hidden, answer, holdDone } */
export function evaluateTask(task, ctx) {
  const items = task.criteria({ gas: { spo2: 0.97, paco2: 5.3 }, settings: {}, alarms: {}, hidden: {}, ...ctx });
  return { ok: items.every((i) => i.ok), items };
}
