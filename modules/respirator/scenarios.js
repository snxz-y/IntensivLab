/**
 * Situasjoner («falske pasienter»): hendelser som rammer pasienten mens du ser på, og som du
 * må oppdage og håndtere. Ren logikk, ingen DOM.
 *
 * En situasjon har et utgangspunkt (profil, innstillinger, gassutveksling) og én skjult
 * hendelse som slår inn etter en tilfeldig forsinkelse. Hendelsen endrer pasientmodellen
 * (resistance, compliance, shunt, egenpust, frakobling). Du kan undersøke (ledetråder uten
 * effekt) og sette inn tiltak. Riktig tiltak opphever hendelsen (umiddelbart eller gradvis);
 * situasjonen regnes som løst når løsningskriteriet har vært oppfylt sammenhengende i 15 s.
 *
 * Effektstørrelsene (f.eks. resistance × 6 ved biting) er pedagogiske valg, ikke målte verdier
 * (UVERIFISERT, se KILDER.md).
 */
import { getProfile } from './profiles.js';

export const ACTIONS = {
  lytt: { label: 'Lytt på lungene', kind: 'undersok' },
  se: { label: 'Se på pasient og tube', kind: 'undersok' },
  krets: { label: 'Sjekk kretsen', kind: 'undersok' },
  sug: { label: 'Sug i tuben', kind: 'tiltak' },
  bittblokk: { label: 'Sett inn bittblokk', kind: 'tiltak' },
  sedasjon: { label: 'Gi sedasjonsbolus', kind: 'tiltak' },
  koble: { label: 'Koble kretsen til igjen', kind: 'tiltak' },
  tube: { label: 'Juster tubedybde (trekk tilbake)', kind: 'tiltak' },
  bronkodilatator: { label: 'Gi bronkodilatator', kind: 'tiltak' },
  rekruttering: { label: 'Rekrutteringsmanøver', kind: 'tiltak' },
  lege: { label: 'Tilkall lege: mistenkt pneumothorax', kind: 'tiltak' },
  reposisjon: { label: 'Reposisjoner pasienten', kind: 'tiltak' },
};

const GAS_BY_PROFILE = { normal: { shunt: 0.05, recruitability: 0.2 }, ards: { shunt: 0.3, recruitability: 0.5 }, obstruktiv: { shunt: 0.1, recruitability: 0.1 }, restriktiv: { shunt: 0.15, recruitability: 0.2 } };
export function gasForProfile(id) { return { ...(GAS_BY_PROFILE[id] ?? GAS_BY_PROFILE.normal) }; }

const SETT = {
  ardsPcv: { mode: 'PCV', pcontrol: 14, rate: 20, peep: 10, fio2: 50, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 100 },
  normalScmv: { mode: 'SCMV', vt: 480, rate: 14, peep: 5, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 2 }, tip: 10 },
  kolsScmv: { mode: 'SCMV', vt: 450, rate: 14, peep: 5, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 3 }, tip: 0 },
  spont: { mode: 'SPONT', psupport: 10, peep: 6, fio2: 35, ets: 25, pramp: 50 },
};

/**
 * Hendelsesdefinisjon:
 *  effect: { resistance, resistanceExp, compliance: multiplikatorer; shuntAdd: tillegg; effort: {amplitude, rate}; disconnect: true; rampIn: s }
 *  clues: tekst per undersøkelse
 *  fixes: { actionId: { text, recover: s (0 = umiddelbart) } }
 *  harmful: { actionId: text }   – tiltak som forverrer eller er farlige
 *  neutral: { actionId: text }   – tiltak uten effekt
 *  resolve(ctx): bool, ctx = { m (målinger), gas (spo2 0–1, paco2), settings, fixed (bool) }
 */
export const SITUATIONS = [
  {
    id: 'snuing',
    title: 'Snuing av pasient med ARDS',
    vignette: 'Kvinne, 58 år, moderat ARDS, dag 3. Ventileres i PCV+ med PEEP 10 og FiO2 50 %, SpO2 har ligget på 93–95 %. Dere har nettopp snudd henne fra ryggleie til sideleie.',
    profileId: 'ards', settings: SETT.ardsPcv,
    variants: [
      {
        id: 'derekruttering',
        delay: [20, 40],
        effect: { shuntAdd: 0.22 },
        clues: { lytt: 'Svekket respirasjonslyd basalt på begge sider, ingen pipelyder.', se: 'Tuben står på 22 cm ved tannrekken, som før. Pasienten er rolig og sedert. Brystet beveger seg symmetrisk.', krets: 'Kretsen er tett, ingen lekkasje, filteret er tørt.' },
        fixes: { rekruttering: { text: 'Legen gjør en rekrutteringsmanøver. Atelektasene åpnes og metningen stiger.', recover: 0 }, reposisjon: { text: 'Du legger henne tilbake i ryggleie. Det hjelper noe, men de lukkede alveolene åpner seg ikke av seg selv.', recover: -1, partial: { shuntAdd: 0.12 } } },
        harmful: {},
        neutral: { sug: 'Lite sekret. Ingen bedring.', bittblokk: 'Hun biter ikke.', sedasjon: 'Hun er allerede godt sedert. Ingen effekt.', koble: 'Kretsen var allerede tilkoblet.', tube: 'Tuben lå riktig. Du har nå trukket den 1 cm, uten effekt.', bronkodilatator: 'Ingen bronkospasme. Ingen effekt.', lege: 'Legen finner ikke tegn til pneumothorax.' },
        resolve: ({ gas }) => gas.spo2 >= 0.92,
        explanation: 'Ved snuing av en pasient med ARDS lukker dependente alveoler seg (derekruttering), shunten øker og SpO2 faller. Det er ikke tubeproblem eller lekkasje: trykkene er uendret og brystet beveger seg symmetrisk. Løsning: åpne lungen igjen (rekrutteringsmanøver og/eller høyere PEEP), eventuelt forbigående økt FiO2 mens du finner årsaken.',
      },
      {
        id: 'tubemigrasjon',
        delay: [15, 35],
        effect: { compliance: 0.55, shuntAdd: 0.18 },
        clues: { lytt: 'Ingen respirasjonslyd over venstre lunge. Normal lyd på høyre side.', se: 'Tuben står på 26 cm ved tannrekken. I rapporten står det 22 cm. Høyre thorax beveger seg mer enn venstre.', krets: 'Kretsen er tett, ingen lekkasje.' },
        fixes: { tube: { text: 'Du trekker tuben tilbake til 22 cm. Lyden kommer tilbake over venstre lunge.', recover: 0 } },
        harmful: { rekruttering: 'Rekruttering med bare én lunge ventilert gir dobbelt så høyt trykk i den lungen. Risiko for barotraume, ingen bedring.', sedasjon: 'Mer sedasjon løser ikke et mekanisk problem og tar bort egenpust som kunne hjulpet.' },
        neutral: { sug: 'Lite sekret. Ingen bedring.', bittblokk: 'Hun biter ikke.', koble: 'Kretsen var allerede tilkoblet.', bronkodilatator: 'Ingen bronkospasme.', lege: 'Legen hører også ensidig lyd og ber deg sjekke tubedybden.', reposisjon: 'Ingen bedring i ryggleie.' },
        resolve: ({ gas, fixed }) => fixed && gas.spo2 >= 0.92,
        explanation: 'Under snuing gled tuben ned i høyre hovedbronkus. Bare én lunge ventileres: compliance halveres (Pplat og Ppeak stiger i volumkontroll, Vt faller i trykkontroll), og shunt gjennom den uventilerte lungen senker SpO2. Nøkkelfunn: ensidig respirasjonslyd og tube dypere enn dokumentert. Løsning: trekk tuben tilbake til dokumentert dybde.',
      },
    ],
  },
  {
    id: 'biting',
    title: 'Høytrykksalarm hos pasient som våkner',
    vignette: 'Mann, 45 år, intubert etter hodeskade, ventileres i (S)CMV. Sedasjonen er trappet ned siste time. Du er inne på rommet for å sjekke infusjonene.',
    profileId: 'normal', settings: SETT.normalScmv,
    variants: [{
      id: 'biting', delay: [15, 30],
      effect: { resistance: 6, resistanceExp: 6, shuntAdd: 0.04, effort: { amplitude: 6, rate: 24, duration: 0.8 } },
      clues: { lytt: 'Respirasjonslyder til stede, men svake, bilateralt.', se: 'Pasienten er urolig, har åpne øyne og biter hardt på tuben. Hoster.', krets: 'Kretsen er tett.' },
      fixes: { bittblokk: { text: 'Bittblokken får tuben fri. Trykket faller umiddelbart.', recover: 0 }, sedasjon: { text: 'Han slapper av etter bolusen og slipper tuben.', recover: 20 } },
      harmful: {},
      neutral: { sug: 'Sugekateteret kommer ikke forbi bittet.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Ingen bronkospasme; biting på tuben er en mekanisk obstruksjon.', rekruttering: 'Ikke aktuelt; problemet sitter i tuben.', lege: 'Legen finner ikke pneumothorax.', reposisjon: 'Ingen effekt.' },
      resolve: ({ m, fixed }) => fixed && m.ppeak < 35,
      explanation: 'Når pasienten biter på tuben, stiger resistance kraftig: Ppeak går i taket mens Pplat (målt ved hold) er normal. I volumkontroll pressurerer respiratoren til Pmax; i trykkontroll faller Vt. Løsning: bittblokk, eventuelt sedasjonsbolus. Å heve Pmax-grensen løser ingenting.',
    }],
  },
  {
    id: 'sekret',
    title: 'Gradvis stigende topptrykk',
    vignette: 'Kvinne, 70 år, pneumoni, intubert døgn 2, ventileres i (S)CMV. Hun har mye sekret og ble sist sugd for fire timer siden.',
    profileId: 'normal', settings: SETT.normalScmv,
    variants: [{
      id: 'sekret', delay: [10, 25],
      effect: { resistance: 3.5, resistanceExp: 3.5, shuntAdd: 0.08, rampIn: 60 },
      clues: { lytt: 'Grove, sekretpregede respirasjonslyder (rhonchi) over begge lunger, som endrer seg ved hoste.', se: 'Hun hoster av og til. Synlig sekret i tuben.', krets: 'Kretsen er tett. Kondens i slangene, ikke lekkasje.' },
      fixes: { sug: { text: 'Du suger opp rikelig seigt sekret. Trykket faller.', recover: 0 } },
      harmful: {},
      neutral: { bittblokk: 'Hun biter ikke.', sedasjon: 'Hun er allerede rolig. Ingen effekt på trykket.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Litt effekt på pipelyder, men sekretet ligger der fortsatt.', rekruttering: 'Ikke aktuelt.', lege: 'Legen finner ikke pneumothorax.', reposisjon: 'Ingen effekt.' },
      resolve: ({ m, fixed }) => fixed && m.ppeak < 30,
      explanation: 'Sekret i tube og sentrale luftveier øker resistance gradvis: Ppeak stiger mens Pplat er uendret (stor Ppeak–Pplat-forskjell ved inspiratorisk hold). Rhonchi som endrer seg ved hoste er typisk. Løsning: sug i tuben.',
    }],
  },
  {
    id: 'frakobling',
    title: 'Frakobling under stell',
    vignette: 'Mann, 62 år, sepsis, ventileres i trykkstøtte (SPONT) med PEEP 6 og lett sedasjon. Dere er to som steller ham, og du har snudd deg for å hente utstyr.',
    profileId: 'normal', patient: { effort: { amplitude: 6, rate: 16, duration: 1 } }, settings: SETT.spont,
    variants: [{
      id: 'frakobling', delay: [10, 25],
      effect: { disconnect: true },
      clues: { lytt: 'Svake, overfladiske respirasjonslyder. Han puster selv, men lite.', se: 'Brystet hever seg lite. Han blir gradvis mer urolig.', krets: 'Y-stykket ligger løst på madrassen. Tuben er på plass.' },
      fixes: { koble: { text: 'Du kobler kretsen til tuben igjen. Trykkurven kommer tilbake.', recover: 0 } },
      harmful: { sedasjon: 'Sedasjon til en pasient uten respiratorstøtte tar bort den egenpusten som holder ham i live.' },
      neutral: { sug: 'Sugekateteret går lett ned. Ingen sekret, ingen bedring.', bittblokk: 'Han biter ikke.', tube: 'Tuben lå riktig.', bronkodilatator: 'Ingen effekt.', rekruttering: 'Umulig uten tilkoblet krets.', lege: 'Legen peker på kretsen.', reposisjon: 'Ingen effekt.' },
      resolve: ({ gas, fixed }) => fixed && gas.spo2 >= 0.92,
      explanation: 'Ved frakobling faller Paw til null, VTE og minuttvolum går mot null, og respiratoren varsler lavt trykk/frakobling. Pasienten mister PEEP og trykkstøtte, alveoler kollapser og SpO2 faller. Løsning: koble til igjen med én gang; sjekk alltid kretsen først ved lavtrykksalarm.',
    }],
  },
  {
    id: 'pneumothorax',
    title: 'Plutselig fall i SpO2 hos traumepasient',
    vignette: 'Mann, 34 år, traume med ribbeinsbrudd høyre side, intubert, ventileres i (S)CMV. Har vært stabil i to timer.',
    profileId: 'normal', settings: { ...SETT.normalScmv, vt: 520, peep: 6 },
    variants: [{
      id: 'pneumothorax', delay: [15, 30],
      effect: { compliance: 0.4, shuntAdd: 0.22, rampIn: 30 },
      clues: { lytt: 'Opphevet respirasjonslyd over høyre lunge. Hypersonor perkusjonslyd på høyre side.', se: 'Høyre thorax beveger seg mindre enn venstre. Halsvenestuvning. Trachea trukket mot venstre. Blodtrykket faller.', krets: 'Kretsen er tett.' },
      fixes: { lege: { text: 'Legen bekrefter trykkpneumothorax og legger inn dren. Lungen folder seg ut.', recover: 45 } },
      harmful: { rekruttering: 'Mer trykk inn i en trykkpneumothorax øker trykket i pleura. Farlig.', sedasjon: 'Løser ingenting, og hypotensjonen forverres.' },
      neutral: { sug: 'Lite sekret.', bittblokk: 'Han biter ikke.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben står riktig; lyden mangler likevel på høyre side.', bronkodilatator: 'Ingen bronkospasme.', reposisjon: 'Ingen effekt.' },
      resolve: ({ gas, fixed }) => fixed && gas.spo2 >= 0.92,
      explanation: 'Trykkpneumothorax: compliance faller raskt, så både Ppeak og Pplat stiger (liten Ppeak–Pplat-forskjell), SpO2 faller og sirkulasjonen påvirkes. Ensidig opphevet respirasjonslyd, hypersonor perkusjon og halsvenestuvning er nøkkelfunn. Løsning: lege og dren umiddelbart. Ikke øk PEEP eller gjør rekruttering.',
    }],
  },
  {
    id: 'bronkospasme',
    title: 'Pasient med KOLS blir tettere',
    vignette: 'Mann, 68 år, KOLS-eksaserbasjon, intubert i går, ventileres i (S)CMV med I:E 1:3. Auto-PEEP har vært under 2 cmH2O.',
    profileId: 'obstruktiv', patient: { effort: { amplitude: 0, rate: 14, duration: 1 } }, settings: SETT.kolsScmv,
    variants: [{
      id: 'bronkospasme', delay: [15, 30],
      effect: { resistance: 2.2, resistanceExp: 2.6, shuntAdd: 0.08, rampIn: 45 },
      clues: { lytt: 'Uttalte ekspiratoriske pipelyder over begge lunger, forlenget ekspirium.', se: 'Han bruker hjelpemuskler. Ekspirasjonsflowen på skjermen når ikke null før neste pust.', krets: 'Kretsen er tett.' },
      fixes: { bronkodilatator: { text: 'Du gir forstøvet bronkodilatator. Pipelydene avtar gradvis over et par minutter.', recover: 90 } },
      harmful: {},
      neutral: { sug: 'Lite sekret. Pipelydene er der fortsatt.', bittblokk: 'Han biter ikke.', sedasjon: 'Han er rolig. Ingen effekt.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', rekruttering: 'Ikke aktuelt ved obstruksjon; kan forverre hyperinflasjon.', lege: 'Legen finner ikke pneumothorax, men bestiller bronkodilatator.', reposisjon: 'Ingen effekt.' },
      resolve: ({ m, fixed }) => fixed && m.autoPeep < 3 && m.ppeak < 35,
      explanation: 'Bronkospasme øker særlig den ekspiratoriske resistance. Tidskonstanten blir lang, ekspirasjonsflowen når ikke null, og auto-PEEP bygger seg opp: Ppeak og Pplat stiger, drivtrykket øker. Løsning: bronkodilatator, og gi lungen tid til å tømme seg (lavere frekvens, kortere TI, lengre TE) til effekten kommer.',
    }],
  },
  {
    id: 'asynkroni',
    title: 'Pasienten puster mot respiratoren',
    vignette: 'Kvinne, 52 år, ARDS i bedringsfase, ventileres i (S)CMV med frekvens 14. Sedasjonen er trappet ned i natt.',
    profileId: 'ards', patient: { compliance: 35, resistance: 10, resistanceExp: 10 }, settings: { ...SETT.normalScmv, vt: 380, rate: 14, peep: 8, fio2: 40 },
    gas: { shunt: 0.15, recruitability: 0.4 },
    variants: [{
      id: 'asynkroni', delay: [15, 30],
      effect: { effort: { amplitude: 11, rate: 26, duration: 0.7 }, shuntAdd: 0.03 },
      clues: { lytt: 'Normale respirasjonslyder bilateralt.', se: 'Hun er våken, ser på deg, og gjør egne pusteforsøk mellom og under maskinpustene. Bruker hjelpemuskler.', krets: 'Kretsen er tett.' },
      fixes: { sedasjon: { text: 'Hun roer seg og lar maskinen puste for seg. Det løser symptomet, men ikke årsaken: hun er klar for mer egenpust.', recover: 15, partial: { effort: { amplitude: 0, rate: 14, duration: 1 } } } },
      harmful: {},
      neutral: { sug: 'Lite sekret.', bittblokk: 'Hun biter ikke.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Ingen pipelyder.', rekruttering: 'Ikke aktuelt.', lege: 'Legen foreslår å la henne puste mer selv.', reposisjon: 'Ingen effekt.' },
      resolve: ({ m, settings, fixed }) => (settings.mode === 'SPONT' && m.breathType === 'spont' && m.ppeak < 30) || fixed,
      explanation: 'En våken pasient med høy egen respirasjonsdrive i volumkontroll får asynkroni: Paw-kurven dupper under inspirasjon (flowsult), pasienten trigger flere pust enn innstilt, og egenpusten kan gi dobbelttrigging. Beste løsning er ofte å møte pasienten: bytt til trykkstøtte (SPONT) med passende Psupport og følsom trigger. Sedasjon er en nødløsning som tar bort fremgangen.',
    }],
  },
];

export function getSituation(id) { return SITUATIONS.find((s) => s.id === id) ?? null; }

const RESOLVE_HOLD = 15; // s sammenhengende oppfylt løsningskriterium

/**
 * Lag en kjørbar situasjon. Kaller `hooks` for å påvirke simulatoren:
 *   hooks.getPatient() / hooks.setPatient(p) / hooks.getGas() / hooks.setGas({shunt}) / hooks.setDisconnected(bool)
 */
export function createSituation(def, { rng = Math.random, hooks } = {}) {
  const variant = def.variants[Math.floor(rng() * def.variants.length)];
  const [d0, d1] = variant.delay;
  const st = {
    id: def.id, variantId: variant.id, status: 'baseline', tStart: null, tEvent: null, tFired: null, tFixed: null, tResolved: null,
    log: [], wrongActions: 0, examined: new Set(), baseline: null, fixed: false, ramp: null, resolveSince: null,
  };

  function applyEffect(e, scale = 1) {
    const b = st.baseline;
    const p = {
      compliance: b.patient.compliance * (1 + ((e.compliance ?? 1) - 1) * scale),
      resistance: b.patient.resistance * (1 + ((e.resistance ?? 1) - 1) * scale),
      resistanceExp: (b.patient.resistanceExp ?? b.patient.resistance) * (1 + ((e.resistanceExp ?? 1) - 1) * scale),
      effort: e.effort && scale >= 1 ? { ...b.patient.effort, ...e.effort } : { ...b.patient.effort },
    };
    hooks.setPatient(p);
    hooks.setGas({ shunt: b.gas.shunt + (e.shuntAdd ?? 0) * scale });
    hooks.setDisconnected(!!e.disconnect && scale >= 1);
  }

  return {
    def, variant,
    get state() { return st; },
    start(t) {
      st.baseline = { patient: structuredClone(hooks.getPatient()), gas: structuredClone(hooks.getGas()) };
      st.tStart = t;
      st.tEvent = t + d0 + rng() * (d1 - d0);
      st.status = 'baseline';
    },
    /** Kall hvert sekund (eller oftere). ctx: { m, gas, settings } */
    tick(t, ctx) {
      if (st.status === 'baseline' && t >= st.tEvent) {
        st.status = 'active';
        st.tFired = t;
        if (variant.effect.rampIn) st.ramp = { from: 0, to: 1, start: t, duration: variant.effect.rampIn };
        else applyEffect(variant.effect, 1);
      }
      if (st.ramp) {
        const x = Math.min(1, (t - st.ramp.start) / st.ramp.duration);
        applyEffect(variant.effect, st.ramp.from + (st.ramp.to - st.ramp.from) * x);
        if (x >= 1) st.ramp = null;
      }
      if (st.status === 'active') {
        const ok = variant.resolve({ ...ctx, fixed: st.fixed });
        if (ok) {
          if (st.resolveSince === null) st.resolveSince = t;
          if (t - st.resolveSince >= RESOLVE_HOLD) { st.status = 'resolved'; st.tResolved = t; }
        } else st.resolveSince = null;
      }
      return st.status;
    },
    /** Utfør handling. Returnerer { kind, text }. kind: 'ledetrad' | 'riktig' | 'delvis' | 'skadelig' | 'noytral' | 'for-tidlig' */
    act(actionId, t) {
      const a = ACTIONS[actionId];
      let res;
      if (a.kind === 'undersok') {
        st.examined.add(actionId);
        const txt = st.status === 'baseline' ? BASELINE_CLUES[actionId] : variant.clues[actionId];
        res = { kind: 'ledetrad', text: txt };
      } else if (st.status === 'baseline') {
        res = { kind: 'for-tidlig', text: 'Ingenting å rette på ennå. Pasienten er stabil.' };
        st.wrongActions += 1;
      } else if (variant.fixes[actionId]) {
        const f = variant.fixes[actionId];
        if (f.partial) {
          applyEffect({ ...variant.effect, ...f.partial }, 1);
          if (f.partial.effort) hooks.setPatient({ effort: f.partial.effort });
          res = { kind: 'delvis', text: f.text };
          if (f.recover >= 0) st.fixed = true;
        } else {
          st.fixed = true;
          st.tFixed = st.tFixed ?? t;
          if (f.recover > 0) st.ramp = { from: 1, to: 0, start: t, duration: f.recover };
          else { applyEffect(variant.effect, 0); st.ramp = null; }
          res = { kind: 'riktig', text: f.text };
        }
      } else if (variant.harmful[actionId]) {
        st.wrongActions += 1;
        res = { kind: 'skadelig', text: variant.harmful[actionId] };
      } else {
        st.wrongActions += 1;
        res = { kind: 'noytral', text: variant.neutral[actionId] ?? 'Ingen effekt.' };
      }
      st.log.push({ t, actionId, ...res });
      return res;
    },
    summary() {
      const timeToFix = st.tFixed !== null && st.tFired !== null ? st.tFixed - st.tFired : null;
      return {
        solved: st.status === 'resolved', timeToFix, wrongActions: st.wrongActions,
        examined: [...st.examined], explanation: variant.explanation, log: st.log,
      };
    },
    /** Avslutt: sett pasienten tilbake. */
    end() {
      if (st.baseline) { hooks.setPatient(structuredClone(st.baseline.patient)); hooks.setGas(structuredClone(st.baseline.gas)); hooks.setDisconnected(false); }
    },
  };
}

const BASELINE_CLUES = {
  lytt: 'Normale, symmetriske respirasjonslyder.',
  se: 'Pasienten ligger rolig. Tuben står som dokumentert. Brystet beveger seg symmetrisk.',
  krets: 'Kretsen er tett og riktig koblet.',
};
