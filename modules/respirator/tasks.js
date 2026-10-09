/**
 * Oppgaver for respiratorsimulatoren. Ren logikk, ingen DOM.
 *
 * - TASKS: oppgavedefinisjoner med startoppsett, mål og kriterier.
 * - simulateSteady(): kjører en kopi av respiratoren til steady state (brukes til å finne
 *   fasit for «hva skjer hvis …»-spørsmål).
 * - predictionFor(): lager et forutsigelsesspørsmål for en innstillingsendring.
 * - observedDirection(): klassifiserer en endring i en måleverdi som opp/ned/uendret.
 * - evaluateTask(): sjekker kriteriene og lager forklarende tilbakemelding.
 *
 * Mål brukt i kriterier (se KILDER.md): Vt 6 ml/kg PBW og Pplat ≤ 30 cmH2O (ARDS Network 2000),
 * drivtrykk ≤ 15 cmH2O (Amato 2015).
 */
import { createVentilator } from '../../core/sim/ventilator.js';
import { getProfile } from './profiles.js';
import { fmt } from '../../core/units.js';

export const MEASURES = {
  ppeak: { label: 'Ppeak', unit: 'cmH2O', threshold: 0.5, decimals: 1 },
  pplat: { label: 'Pplat', unit: 'cmH2O', threshold: 0.5, decimals: 1 },
  pmean: { label: 'Pmean', unit: 'cmH2O', threshold: 0.3, decimals: 1 },
  drivingPressure: { label: 'Drivtrykk (Pplat − PEEPtot)', unit: 'cmH2O', threshold: 0.5, decimals: 1 },
  autoPeep: { label: 'AutoPEEP', unit: 'cmH2O', threshold: 0.4, decimals: 1 },
  vte: { label: 'VTE', unit: 'ml', threshold: 15, decimals: 0 },
  expMinVol: { label: 'ExpMinVol', unit: 'L/min', threshold: 0.3, decimals: 1 },
  fTotal: { label: 'fTotal', unit: '/min', threshold: 0.5, decimals: 0 },
  te: { label: 'TE', unit: 's', threshold: 0.1, decimals: 2 },
};

/** Forklaringer: hvorfor en innstilling påvirker en måleverdi. */
const WHY = {
  vt: {
    pplat: 'Pplat = PEEPtot + Vt/C. Med uendret compliance gir større Vt høyere platåtrykk, og mindre Vt lavere.',
    ppeak: 'Ppeak = Pplat + R·flow. Større Vt på samme Ti gir både høyere platå og høyere flow, så topptrykket stiger.',
    drivingPressure: 'Drivtrykk = Vt/C (= Pplat − PEEPtot). Det endres i takt med Vt så lenge compliance er lik.',
    expMinVol: 'Minuttvolum = Vt · f. Endrer du Vt uten å endre frekvens, endres minuttvolumet tilsvarende.',
    autoPeep: 'Større Vt må tømmes på samme ekspirasjonstid. Hvis tiden allerede er knapp, blir mer igjen i lungen.',
  },
  rate: {
    expMinVol: 'Minuttvolum = Vt · f. Høyere frekvens gir høyere minuttvolum når Vt holdes.',
    autoPeep: 'Høyere frekvens forkorter syklustiden og dermed ekspirasjonstiden. Når TE blir kort i forhold til tidskonstanten (R·C), rekker ikke lungen å tømme seg, og auto-PEEP bygger seg opp.',
    te: 'TE = 60/f − TI. Frekvensen bestemmer syklustiden, og det som ikke går til inspirasjon, blir ekspirasjon.',
    pplat: 'Pplat påvirkes av frekvens bare indirekte: via auto-PEEP, som løfter PEEPtot og dermed platået.',
    ppeak: 'Ppeak påvirkes indirekte via auto-PEEP (høyere basis) og i (S)CMV via kortere TI og høyere flow når I:E holdes.',
  },
  peep: {
    pplat: 'Pplat = PEEP + Vt/C. Når PEEP økes, løftes hele trykkurven; platået stiger like mye som PEEP (uten auto-PEEP og med lineær compliance).',
    ppeak: 'Hele trykkurven løftes med PEEP, så topptrykket stiger tilsvarende.',
    drivingPressure: 'Drivtrykk = Pplat − PEEPtot. Begge stiger like mye, så drivtrykket er uendret så lenge Vt og compliance er de samme. (I virkeligheten kan PEEP rekruttere og bedre compliance, men det er ikke med i modellen.)',
    pmean: 'Middeltrykket løftes omtrent like mye som PEEP.',
    vte: 'I volumkontroll er Vt fast og uavhengig av PEEP. I trykkontroll er Pcontrol satt over PEEP, så drivtrykket og dermed Vt er også uendret.',
  },
  ie: {
    te: 'I:E fordeler syklustiden mellom inspirasjon og ekspirasjon. Mer tid til E gir lengre TE.',
    autoPeep: 'Lengre ekspirasjonstid gir flere tidskonstanter til å tømme lungen; kortere gir mindre tid og mer auto-PEEP.',
    ppeak: 'I (S)CMV leveres Vt på en kortere eller lengre TI. Kortere TI krever høyere flow, og Ppeak stiger med R·flow.',
    vte: 'I trykkontroll bestemmer TI hvor mange tidskonstanter lungen får til å fylle seg. Kortere TI kan gi mindre Vt når τ er lang.',
  },
  ti: {
    te: 'TE = 60/f − TI. Kortere TI gir lengre TE ved samme frekvens.',
    autoPeep: 'Lengre ekspirasjonstid gir flere tidskonstanter til å tømme lungen; kortere gir mindre tid og mer auto-PEEP.',
    ppeak: 'I (S)CMV leveres Vt på TI. Kortere TI krever høyere flow, og Ppeak stiger med R·flow.',
    vte: 'I trykkontroll bestemmer TI hvor mange tidskonstanter lungen får til å fylle seg.',
  },
  pcontrol: {
    vte: 'I PCV+ er Vt = C · Pcontrol · (1 − e^(−TI/τ)). Høyere Pcontrol gir større Vt.',
    ppeak: 'Ppeak = PEEP + Pcontrol i trykkontroll (hvis TI er lang nok til at flowen nærmer seg null, er Pplat ≈ Ppeak).',
    pplat: 'Platået nærmer seg PEEP + Pcontrol når lungen rekker å fylles; høyere Pcontrol gir høyere platå.',
    drivingPressure: 'I trykkontroll er drivtrykket ≈ Pcontrol (når flowen når null før TI er over).',
    expMinVol: 'Større Vt per pust gir høyere minuttvolum ved samme frekvens.',
  },
  psupport: {
    vte: 'Høyere trykkstøtte gir større Vt for samme pasientinnsats.',
    ppeak: 'Ppeak = PEEP + Psupport.',
    expMinVol: 'Større Vt per pust gir høyere minuttvolum.',
  },
  tip: {
    ppeak: 'Pausen flytter en del av TI fra flow til null-flow. Samme Vt på kortere flowtid krever høyere flow, så Ppeak stiger.',
    te: 'Pausen ligger inne i TI, så TE endres ikke.',
    pplat: 'Platået avhenger av Vt og C, ikke av pausen. Pausen gjør bare at platået blir synlig på kurven.',
  },
  flowPattern: {
    ppeak: 'Deselererende flow leverer samme Vt med høyere toppflow i starten (lav volumbelastning) og lav flow på slutten. Ppeak nær slutten er ofte lavere fordi R·flow er lavt når volumet er høyt.',
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
    vt: 'Vt', rate: 'Frekvens', peep: 'PEEP/CPAP', ie: 'I:E', ti: 'TI', pcontrol: 'Pcontrol', psupport: 'Psupport',
    tip: 'TIP (pause)', flowPattern: 'Flowmønster', pramp: 'Pramp', ets: 'ETS', fio2: 'Oksygen', trigger: 'Trigger',
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
 * @param {object} p
 * @param {string} p.key           innstillingsnøkkel (vt, rate, peep, ie, ti, pcontrol, …)
 * @param {*} p.oldValue
 * @param {*} p.newValue
 * @param {object} p.settings      gjeldende innstillinger (før endring)
 * @param {object} p.patient
 * @param {string[]} p.focus       måleverdier som er relevante for oppgaven, i prioritert rekkefølge
 * @param {object} [p.before]      målinger før (ellers simuleres de)
 */
export function predictionFor({ key, oldValue, newValue, settings, patient, focus, before }) {
  const base = before ?? simulateSteady(settings, patient);
  const changed = structuredClone(settings);
  changed[key] = newValue;
  if (key === 'ie') changed.timingMode = 'ie';
  if (key === 'ti') changed.timingMode = 'ti';
  const after = simulateSteady(changed, patient);

  // velg målet som endres mest (relativt til terskel), prioritert etter fokuslisten
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

function ieSetting(i, e) { return { i, e }; }

/** Oppgavedefinisjoner. */
export const TASKS = [
  {
    id: 'lungebeskyttende',
    title: 'Still inn lungebeskyttende ventilasjon',
    profileId: 'ards',
    vignette: 'Kvinne, 170 cm, intubert for moderat ARDS etter pneumoni. Hun er dypt sedert og puster ikke selv. Respiratoren står i (S)CMV med Vt 600 ml, frekvens 14 og PEEP 5.',
    goal: 'Still inn lungebeskyttende ventilasjon: Vt 6 ml/kg IBW, Pplat ≤ 30 cmH2O og drivtrykk ≤ 15 cmH2O, uten at minuttvolumet faller under 6 L/min. Bruk inspiratorisk hold for å måle Pplat.',
    settings: { mode: 'SCMV', vt: 600, rate: 14, peep: 5, timingMode: 'ie', ie: ieSetting(1, 2), tip: 0, flowPattern: 'square', fio2: 60 },
    focus: ['pplat', 'drivingPressure', 'vte', 'expMinVol', 'autoPeep'],
    requireHold: 'insp',
    criteria(ctx) {
      const { m } = ctx;
      const vtkg = m.vtPerKg;
      return [
        {
          label: 'Vt 5,5–7 ml/kg IBW',
          ok: vtkg !== null && vtkg >= 5.5 && vtkg <= 7,
          detail: `VTE ${fmt(m.vte, 0)} ml = ${fmt(vtkg, 1)} ml/kg (IBW ${fmt(m.ibw, 1)} kg). Mål: ca. ${fmt(6 * m.ibw, 0)} ml.`,
        },
        { label: 'Pplat ≤ 30 cmH2O', ok: m.pplat <= 30, detail: `Pplat ${fmt(m.pplat, 1)} cmH2O. Pplat = PEEPtot + Vt/C, så lavere Vt er veien dit når compliance er lav.` },
        { label: 'Drivtrykk ≤ 15 cmH2O', ok: m.drivingPressure <= 15, detail: `Drivtrykk ${fmt(m.drivingPressure, 1)} cmH2O = Vt/C. PEEP flytter ikke drivtrykket, bare Vt (eller bedre compliance) gjør det.` },
        { label: 'ExpMinVol ≥ 6 L/min', ok: m.expMinVol >= 6, detail: `ExpMinVol ${fmt(m.expMinVol, 1)} L/min. Når Vt reduseres, må frekvensen opp for å holde minuttvolumet (og CO2).` },
        { label: 'AutoPEEP < 1 cmH2O', ok: m.autoPeep < 1, detail: `AutoPEEP ${fmt(m.autoPeep, 1)} cmH2O. Høy frekvens forkorter TE; sjekk at ekspirasjonsflowen når null.` },
      ];
    },
  },
  {
    id: 'topptrykk',
    title: 'Finn årsaken til høyt topptrykk',
    profileId: 'normal',
    vignette: 'Mann, 178 cm, intubert etter hodeskade. Respiratoren står i (S)CMV. Høytrykksalarmen har begynt å gå. Pasienten er sedert.',
    goal: 'Finn ut om det høye topptrykket skyldes økt resistance (sekret, bronkospasme, knekk på tuben) eller redusert compliance (pneumothorax, atelektase, væske). Bruk inspiratorisk hold og se på forskjellen mellom Ppeak og Pplat.',
    settings: { mode: 'SCMV', vt: 500, rate: 14, peep: 5, timingMode: 'ie', ie: ieSetting(1, 2), tip: 0, flowPattern: 'square', fio2: 40 },
    focus: ['ppeak', 'pplat', 'drivingPressure'],
    requireHold: 'insp',
    /** Trekker en skjult årsak når oppgaven startes. */
    setup(rng = Math.random) {
      const cause = rng() < 0.5 ? 'resistance' : 'compliance';
      const patient = cause === 'resistance'
        ? { compliance: 50, resistance: 32, resistanceExp: 36, effort: { amplitude: 0, rate: 14, duration: 1 }, height: 178, sex: 'M' }
        : { compliance: 18, resistance: 10, resistanceExp: 10, effort: { amplitude: 0, rate: 14, duration: 1 }, height: 178, sex: 'M' };
      return { hidden: { cause }, patient };
    },
    question: {
      text: 'Hva er mest sannsynlig årsak til det høye topptrykket?',
      options: [
        { id: 'resistance', label: 'Økt resistance (sekret, bronkospasme, knekk/bitt på tuben)' },
        { id: 'compliance', label: 'Redusert compliance (pneumothorax, atelektase, lungeødem, abdominalt trykk)' },
        { id: 'autopeep', label: 'Auto-PEEP (for kort ekspirasjonstid)' },
        { id: 'asynkroni', label: 'Pasient–respirator-asynkroni (pasienten puster mot respiratoren)' },
      ],
    },
    criteria(ctx) {
      const { m, hidden, answer, holdDone } = ctx;
      const gap = m.ppeak - m.pplat;
      const explain = hidden.cause === 'resistance'
        ? `Ppeak ${fmt(m.ppeak, 1)} og Pplat ${fmt(m.pplat, 1)}: stor forskjell (${fmt(gap, 1)} cmH2O = R·flow) med normalt platå. Trykket går med på å drive flow gjennom en trang luftvei, ikke på å utvide lungen. Rinsp måles til ${fmt(m.rinsp, 0)} cmH2O/(L/s).`
        : `Ppeak ${fmt(m.ppeak, 1)} og Pplat ${fmt(m.pplat, 1)}: liten forskjell (${fmt(gap, 1)} cmH2O) men høyt platå. Trykket går med på å utvide en stiv lunge/thorax. Cstat måles til ${fmt(m.cstat, 0)} ml/cmH2O.`;
      return [
        { label: 'Inspiratorisk hold utført', ok: !!holdDone, detail: holdDone ? 'Du målte Pplat med hold.' : 'Uten hold kan du ikke skille resistance fra compliance. Hold inne «Insp. hold» i Verktøy.' },
        { label: 'Riktig årsak', ok: answer === hidden.cause, detail: explain },
      ];
    },
  },
  {
    id: 'autopeep',
    title: 'Fjern auto-PEEP',
    profileId: 'obstruktiv',
    vignette: 'Mann, 178 cm, med KOLS-eksaserbasjon, intubert og sedert. Respiratoren står i (S)CMV med frekvens 24 og I:E 1:1. Ekspirasjonsflowen når ikke null før neste pust.',
    goal: 'Mål auto-PEEP med ekspiratorisk hold, og endre innstillingene så AutoPEEP blir under 1 cmH2O. Hold ExpMinVol over 5 L/min og Pplat under 30 cmH2O.',
    settings: { mode: 'SCMV', vt: 500, rate: 24, peep: 5, timingMode: 'ie', ie: ieSetting(1, 1), tip: 0, flowPattern: 'square', fio2: 40 },
    patientOverride: { effort: { amplitude: 0, rate: 14, duration: 1 } },
    focus: ['autoPeep', 'te', 'expMinVol', 'pplat', 'ppeak'],
    requireHold: 'exp',
    criteria(ctx) {
      const { m, holdDone } = ctx;
      return [
        { label: 'Ekspiratorisk hold utført', ok: !!holdDone, detail: holdDone ? 'Du målte total PEEP med hold.' : 'Auto-PEEP måles ved å lukke ekspirasjonsventilen: hold inne «Eksp. hold» i Verktøy.' },
        { label: 'AutoPEEP < 1 cmH2O', ok: m.autoPeep < 1, detail: `AutoPEEP ${fmt(m.autoPeep, 1)} cmH2O ved TE ${fmt(m.te, 2)} s og RCexp ${fmt(m.rcexp, 2)} s. Lungen trenger 3–4 tidskonstanter (${fmt(3 * (m.rcexp ?? 0), 1)}–${fmt(4 * (m.rcexp ?? 0), 1)} s) for å tømme seg.` },
        { label: 'ExpMinVol ≥ 5 L/min', ok: m.expMinVol >= 5, detail: `ExpMinVol ${fmt(m.expMinVol, 1)} L/min. Lavere frekvens krever gjerne litt større Vt for å holde minuttvolumet. Lett hyperkapni aksepteres ofte hos KOLS-pasienter.` },
        { label: 'Pplat ≤ 30 cmH2O', ok: m.pplat <= 30, detail: `Pplat ${fmt(m.pplat, 1)} cmH2O.` },
      ];
    },
  },
];

export function getTask(id) {
  return TASKS.find((t) => t.id === id) ?? null;
}

/** Start-oppsett for en oppgave: innstillinger og pasient. */
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
  return { settings: structuredClone(task.settings), patient, hidden };
}

/** Evaluer oppgaven. ctx: { m (målinger), hidden, answer, holdDone } */
export function evaluateTask(task, ctx) {
  const items = task.criteria(ctx);
  return { ok: items.every((i) => i.ok), items };
}
