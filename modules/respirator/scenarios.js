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
  lege: { label: 'Tilkall lege', kind: 'tiltak' },
  reposisjon: { label: 'Reposisjoner pasienten', kind: 'tiltak' },
  cuff: { label: 'Sjekk og fyll cuffen', kind: 'tiltak' },
  vaeske: { label: 'Gi væskestøt (etter ordinasjon)', kind: 'tiltak' },
  sedasjonNed: { label: 'Reduser sedasjonen', kind: 'tiltak' },
  smertelindring: { label: 'Gi smertelindring', kind: 'tiltak' },
  blodgass: { label: 'Ta blodgass', kind: 'undersok' },
  hold: { label: 'Mål Pplateau (inspiratorisk hold)', kind: 'undersok' },
  juster: { label: 'Juster respiratoren', kind: 'tiltak' },
  kondens: { label: 'Tøm kondensvann fra slangen', kind: 'tiltak' },
};
export const EXAM_IDS = ['lytt', 'se', 'krets', 'hold', 'blodgass'];
/** Standardtekster for tiltak et scenario ikke nevner spesielt. */
export const DEFAULT_NEUTRAL = {
  cuff: 'Cuff-trykket er normalt. Ingen effekt.',
  vaeske: 'Væske er ikke problemet her.',
  sedasjonNed: 'Sedasjonsnivået er ikke årsaken.',
  smertelindring: 'Ingen tegn til smerte som årsak.',
  juster: 'Respiratorjustering alene løser ikke dette; årsaken ligger hos pasienten eller i kretsen.',
  kondens: 'Slangene er tørre. Ingen effekt.',
};
const DEFAULT_CLUES = {
  hold: 'Du måler Pplateau med inspiratorisk hold: se verdien på skjermen og sammenlign med Ppeak.',
  blodgass: 'Blodgassen er på vei; se på SpO2 og PetCO2 i mellomtiden.',
};

const GAS_BY_PROFILE = { normal: { shunt: 0.05, recruitability: 0.2 }, ards: { shunt: 0.3, recruitability: 0.5 }, obstruktiv: { shunt: 0.1, recruitability: 0.1 }, restriktiv: { shunt: 0.15, recruitability: 0.2 } };
export function gasForProfile(id) { return { ...(GAS_BY_PROFILE[id] ?? GAS_BY_PROFILE.normal) }; }

const SETT = {
  ardsPcv: { mode: 'PCV', pcontrol: 14, rate: 20, peep: 10, fio2: 50, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 100 },
  normalScmv: { mode: 'APVCMV', vt: 480, rate: 14, peep: 5, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 2 } },
  kolsScmv: { mode: 'APVCMV', vt: 450, rate: 14, peep: 5, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 3 } },
  spont: { mode: 'SPONT', psupport: 10, peep: 6, fio2: 35, ets: 25, pramp: 50 },
  // Lett sedert pasient som trigger selv: trykkstøtte 8 over PEEP 5, O2 30 %, ETS 25 %, flowtrigger 2 l/min, apnétid 20 s (se KILDER.md)
  spontLett: { mode: 'SPONT', psupport: 8, peep: 5, fio2: 30, ets: 25, pramp: 50, trigger: { type: 'flow', value: 2 }, apneaTime: 20 },
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
        id: 'derekruttering', sounds: {}, vitals: { hr: 20 }, cues: [{ at: 0, who: 'kollega', text: '«Sånn, da ligger hun på siden. Jeg fikser putene.»' }, { at: 30, who: 'monitor', text: 'Pulsoksymeteret piper med lavere tone enn før.' }, { at: 70, who: 'kollega', text: '«SpO2 er på vei nedover, ser du det?»' }],
        delay: [20, 40],
        effect: { shuntAdd: 0.22 },
        clues: { lytt: 'Svekket respirasjonslyd basalt på begge sider, ingen pipelyder.', se: 'Tuben står på 22 cm ved tannrekken, som før. Pasienten er rolig og sedert. Brystet beveger seg symmetrisk.', krets: 'Kretsen er tett, ingen lekkasje, filteret er tørt.' },
        ventFix: true,
        fixes: { juster: { text: 'Du øker PEEP (og FiO2 midlertidig) for å åpne lungen igjen.', recover: -1, partial: { shuntAdd: 0.22 } }, rekruttering: { text: 'Legen gjør en rekrutteringsmanøver. Atelektasene åpnes og metningen stiger.', recover: 0 }, reposisjon: { text: 'Du legger henne tilbake i ryggleie. Det hjelper noe, men de lukkede alveolene åpner seg ikke av seg selv.', recover: -1, partial: { shuntAdd: 0.12 } } },
        harmful: {},
        neutral: { sug: 'Lite sekret. Ingen bedring.', bittblokk: 'Hun biter ikke.', sedasjon: 'Hun er allerede godt sedert. Ingen effekt.', koble: 'Kretsen var allerede tilkoblet.', tube: 'Tuben lå riktig. Du har nå trukket den 1 cm, uten effekt.', bronkodilatator: 'Ingen bronkospasme. Ingen effekt.', lege: 'Legen finner ikke tegn til pneumothorax.' },
        resolve: ({ gas }) => gas.spo2 >= 0.92,
        explanation: 'Ved snuing av en pasient med ARDS lukker dependente alveoler seg (derekruttering), shunten øker og SpO2 faller. Det er ikke tubeproblem eller lekkasje: trykkene er uendret og brystet beveger seg symmetrisk. Løsning: åpne lungen igjen (rekrutteringsmanøver og/eller høyere PEEP), eventuelt forbigående økt FiO2 mens du finner årsaken.',
      },
      {
        id: 'tubemigrasjon', sounds: {}, vitals: { hr: 25 }, cues: [{ at: 0, who: 'kollega', text: '«Sånn, da ligger hun på siden. Tuben ble litt dratt i under snuingen.»' }, { at: 25, who: 'obs', text: 'Du legger merke til at høyre side av brystet hever seg mer enn venstre.' }, { at: 60, who: 'monitor', text: 'Pulsoksymeteret piper med lavere tone.' }],
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
    vignette: 'Mann, 45 år, intubert etter hodeskade, ventileres i (S)CMV+. Sedasjonen er trappet ned siste time. Du er inne på rommet for å sjekke infusjonene.',
    profileId: 'normal', settings: SETT.normalScmv,
    variants: [{
      id: 'biting', sounds: { cough: true }, vitals: { hr: 35, sys: 25 }, cues: [{ at: 0, who: 'obs', text: 'Pasienten hoster kraftig og vrir på hodet.' }, { at: 20, who: 'obs', text: 'Han har åpnet øynene og ser urolig ut. Kjevene er knepet sammen.' }, { at: 60, who: 'kollega', text: '«Skal jeg hente noe til sedasjon?»' }], delay: [15, 30],
      effect: { resistance: 6, resistanceExp: 6, shuntAdd: 0.04, effort: { amplitude: 6, rate: 24, duration: 0.8 } },
      clues: { lytt: 'Respirasjonslyder til stede, men svake, bilateralt.', se: 'Pasienten er urolig, har åpne øyne og biter hardt på tuben. Hoster.', krets: 'Kretsen er tett.' },
      fixes: { bittblokk: { text: 'Bittblokken får tuben fri. Trykket faller umiddelbart.', recover: 0 }, sedasjon: { text: 'Han slapper av etter bolusen og slipper tuben.', recover: 20 } },
      harmful: {},
      neutral: { sug: 'Sugekateteret kommer ikke forbi bittet.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Ingen bronkospasme; biting på tuben er en mekanisk obstruksjon.', rekruttering: 'Ikke aktuelt; problemet sitter i tuben.', lege: 'Legen finner ikke pneumothorax.', reposisjon: 'Ingen effekt.' },
      resolve: ({ m, fixed }) => fixed && m.ppeak < 35,
      explanation: 'Når pasienten biter på tuben, stiger resistance kraftig: Ppeak går i taket mens Pplat (målt ved hold) er normal. I (S)CMV+ øker respiratoren ΔPinsp til Plimit (Pmax − 10) uten å nå Vt, så alarmene «Trykkbegrensning» og «Lavt tidevolum» kommer; i PCV+ faller Vt direkte. Løsning: bittblokk, eventuelt sedasjonsbolus. Å heve Pmax-grensen løser ingenting.',
    }],
  },
  {
    id: 'sekret',
    title: 'Gradvis stigende topptrykk',
    vignette: 'Kvinne, 70 år, pneumoni, intubert døgn 2, ventileres i (S)CMV+. Hun har mye sekret og ble sist sugd for fire timer siden.',
    profileId: 'normal', settings: SETT.normalScmv,
    variants: [{
      id: 'sekret', sounds: { secretions: 1, cough: true }, vitals: { hr: 10 }, cues: [{ at: 0, who: 'obs', text: 'Du hører en rasling i tuben når hun puster ut.' }, { at: 45, who: 'obs', text: 'Hun hoster et par ganger uten at det ser ut til å hjelpe.' }, { at: 100, who: 'kollega', text: '«Trykkene har krøpet oppover den siste halvtimen.»' }], delay: [10, 25],
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
      id: 'frakobling', sounds: {}, vitals: { hr: 30, sys: 10 }, cues: [{ at: 0, who: 'obs', text: 'Du hører et sus fra respiratoren bak deg.' }, { at: 30, who: 'obs', text: 'Pasienten begynner å bevege seg urolig i sengen.' }, { at: 60, who: 'kollega', text: '«Hva er det som alarmerer?»' }], delay: [10, 25],
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
    vignette: 'Mann, 34 år, traume med ribbeinsbrudd høyre side, intubert, ventileres i (S)CMV+. Har vært stabil i to timer.',
    profileId: 'normal', settings: { ...SETT.normalScmv, vt: 520, peep: 6 },
    variants: [{
      id: 'pneumothorax', sounds: {}, vitals: { hr: 40, sys: -40, dia: -20 }, cues: [{ at: 0, who: 'obs', text: 'Pasienten blir plutselig urolig og tar seg mot høyre side av brystet.' }, { at: 25, who: 'monitor', text: 'Blodtrykket på monitoren faller.' }, { at: 50, who: 'kollega', text: '«Han ser dårlig ut. Halsvenene er stuvet.»' }], delay: [15, 30],
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
    vignette: 'Mann, 68 år, KOLS-eksaserbasjon, intubert i går, ventileres i (S)CMV+ med I:E 1:3. Auto-PEEP har vært under 2 cmH2O.',
    profileId: 'obstruktiv', patient: { effort: { amplitude: 0, rate: 14, duration: 1 } }, settings: SETT.kolsScmv,
    variants: [{
      id: 'bronkospasme', sounds: { wheeze: 1 }, vitals: { hr: 20 }, cues: [{ at: 0, who: 'obs', text: 'Du hører pipelyder fra sengen, uten stetoskop.' }, { at: 50, who: 'obs', text: 'Han bruker halsmusklene for å puste, og ekspirasjonen tar lang tid.' }, { at: 100, who: 'kollega', text: '«AutoPEEP-verdien stiger.»' }], delay: [15, 30],
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
    vignette: 'Kvinne, 52 år, ARDS i bedringsfase, ventileres i (S)CMV+ med rate 14. Sedasjonen er trappet ned i natt.',
    profileId: 'ards', patient: { compliance: 35, resistance: 10, resistanceExp: 10 }, settings: { ...SETT.normalScmv, vt: 380, rate: 14, peep: 8, fio2: 40 },
    gas: { shunt: 0.15, recruitability: 0.4 },
    variants: [{
      id: 'asynkroni', sounds: { cough: true }, vitals: { hr: 25, sys: 20 }, cues: [{ at: 0, who: 'obs', text: 'Pasienten åpner øynene og rynker pannen.' }, { at: 20, who: 'obs', text: 'Du ser at hun trekker pusten selv midt i maskinpustene; brystet rykker til.' }, { at: 55, who: 'kollega', text: '«Hun kjemper mot maskinen.»' }], delay: [15, 30],
      effect: { effort: { amplitude: 11, rate: 26, duration: 0.7 }, shuntAdd: 0.03 },
      clues: { lytt: 'Normale respirasjonslyder bilateralt.', se: 'Hun er våken, ser på deg, og gjør egne pusteforsøk mellom og under maskinpustene. Bruker hjelpemuskler.', krets: 'Kretsen er tett.' },
      fixes: { sedasjon: { text: 'Hun roer seg og lar maskinen puste for seg. Det løser symptomet, men ikke årsaken: hun er klar for mer egenpust.', recover: 15, partial: { effort: { amplitude: 0, rate: 14, duration: 1 } } } },
      harmful: {},
      neutral: { sug: 'Lite sekret.', bittblokk: 'Hun biter ikke.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Ingen pipelyder.', rekruttering: 'Ikke aktuelt.', lege: 'Legen foreslår å la henne puste mer selv.', reposisjon: 'Ingen effekt.' },
      ventFix: true,
      resolve: ({ m, settings, fixed }) => (settings.mode === 'SPONT' && m.breathType === 'spont' && m.ppeak < 30) || fixed,
      explanation: 'En våken pasient med høy egen respirasjonsdrive i (S)CMV+ får asynkroni: pasienten trigger flere pust enn innstilt, trekker mer enn respiratoren gir, og egenpusten kan gi dobbelttrigging. Beste løsning er ofte å møte pasienten: bytt til trykkstøtte (SPONT) med passende ΔPsupport og følsom trigger. Sedasjon er en nødløsning som tar bort fremgangen.',
    }],
  },
  {
    id: 'cuff-lekkasje',
    title: 'Cuff-lekkasje',
    vignette: 'Kvinne, 66 år, intubert for pneumoni, ventileres i (S)CMV+ med Vt 420. Har vært stabil hele vakten. Du er inne for å gi medisiner.',
    profileId: 'normal', settings: { mode: 'APVCMV', vt: 420, rate: 16, peep: 6, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 2 } },
    variants: [{
      id: 'cuff', sounds: { leak: 1 }, vitals: { hr: 10 }, delay: [15, 30],
      effect: { leak: 0.45, shuntAdd: 0.06, rampIn: 40 },
      cues: [{ at: 0, who: 'obs', text: 'Du hører en svak gurglende lyd fra munnen ved hver inspirasjon.' }, { at: 30, who: 'respirator', text: 'VTE er lavere enn VTI.' }, { at: 70, who: 'kollega', text: '«Hun har begynt å kunne lage lyd med stemmen.»' }],
      clues: { lytt: 'Normale respirasjonslyder, men en blåselyd over larynx ved inspirasjon.', se: 'Luft siver ut ved munnen under inspirasjon. Cuff-trykket måles til 8 cmH2O (normalt 20–30).', krets: 'Kretsen er tett fram til tuben. Ingen lekkasje i koblingene.', hold: 'Platået faller gradvis under holdet: volumet lekker ut.', blodgass: 'Blodgass: PaCO2 6,4 kPa, PaO2 9,8 kPa. Lett underventilert.' },
      fixes: { cuff: { text: 'Du fyller cuffen til 25 cmH2O. Lekkasjen forsvinner, VTE nærmer seg VTI.', recover: 0 } },
      harmful: {},
      neutral: { sug: 'Lite sekret.', bittblokk: 'Hun biter ikke.', sedasjon: 'Ingen effekt på lekkasjen.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig; luften lekker rundt den.', bronkodilatator: 'Ingen effekt.', rekruttering: 'Volumet lekker ut rundt cuffen; manøveren hjelper ikke.', lege: 'Legen ber deg sjekke cuffen først.', reposisjon: 'Ingen effekt.', vaeske: 'Ikke aktuelt.', sedasjonNed: 'Ikke aktuelt.', smertelindring: 'Ikke aktuelt.', juster: 'Å øke Vt kompenserer bare delvis og øker trykket i luftveien. Lekkasjen må tettes.' },
      resolve: ({ m, fixed }) => fixed && m.vte > 350,
      explanation: 'Lekkasje rundt cuffen gir VTE < VTI og alarmen «Lavt tidevolum». Lyd fra munnen og lavt cuff-trykk er nøkkelfunn. Løsning: fyll cuffen til 20–30 cmH2O; ved vedvarende lekkasje kan tuben være feilplassert eller cuffen ødelagt.',
    }],
  },
  {
    id: 'tubeplugg',
    title: 'Tett tube',
    vignette: 'Mann, 71 år, KOLS, intubert døgn 3, seigt sekret. Ventileres i (S)CMV+. Han ble sugd for en time siden.',
    profileId: 'normal', settings: { mode: 'APVCMV', vt: 450, rate: 14, peep: 5, fio2: 40, timingMode: 'ie', ie: { i: 1, e: 2.5 } },
    variants: [{
      id: 'plugg', sounds: { secretions: 0.6 }, vitals: { hr: 35, sys: 15 }, delay: [15, 30],
      effect: { resistance: 14, resistanceExp: 16, shuntAdd: 0.15, rampIn: 50 },
      cues: [{ at: 0, who: 'obs', text: 'Du hører en knirkende lyd fra tuben, og brystet hever seg mindre enn før.' }, { at: 40, who: 'obs', text: 'Pasienten blir urolig og bruker halsmusklene.' }, { at: 80, who: 'kollega', text: '«Trykket er i taket og han får nesten ikke volum.»' }],
      clues: { lytt: 'Svært svake respirasjonslyder over begge lunger. Ingen pipelyder.', se: 'Tuben står på 23 cm, som dokumentert. Han hoster uten at noe kommer. Brystet beveger seg lite.', krets: 'Kretsen er tett.', hold: 'Ppeak ligger på Plimit, men Pplateau er lavt: trykket går med på motstand, ikke på lungen.', blodgass: 'Blodgass: PaCO2 8,9 kPa, PaO2 7,1 kPa. Akutt respiratorisk acidose.' },
      fixes: { sug: { text: 'Sugekateteret stopper 2 cm forbi tubeenden. Du skyller med saltvann og suger igjen: en stor seig propp løsner.', recover: 0 } },
      harmful: { sedasjon: 'Sedasjon fjerner hostekraften han trenger for å få opp proppen.', bronkodilatator: 'Forstøvet medikament kommer ikke forbi proppen. Ingen effekt, tiden går.' },
      neutral: { bittblokk: 'Han biter ikke.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', rekruttering: 'Ikke aktuelt; luften kommer ikke inn.', lege: 'Legen ber deg suge og vurdere tubeskifte om det ikke løsner.', reposisjon: 'Ingen effekt.', cuff: 'Cuffen er fin.', vaeske: 'Ikke aktuelt.', sedasjonNed: 'Ikke aktuelt nå.', smertelindring: 'Ikke aktuelt nå.', juster: 'Å heve Pmax presser mer trykk mot en propp uten at luft kommer forbi. Proppen må bort.' },
      resolve: ({ m, fixed }) => fixed && m.ppeak < 32 && m.vte > 350,
      explanation: 'Delvis okkludert tube av seigt sekret: Ppeak når Plimit mens Pplateau er lavt (stor resistiv komponent), Vt faller, SpO2 faller og CO2 stiger. Løsning: sug med skylling; ved total okklusjon må tuben byttes. Sedasjon tar bort hostekraften.',
    }],
  },
  {
    id: 'lungeemboli',
    title: 'Lungeemboli',
    vignette: 'Kvinne, 59 år, intubert etter stor bukkirurgi, dag 4, lett sedert i (S)CMV+. Har ligget lenge i ro.',
    profileId: 'normal', settings: { mode: 'APVCMV', vt: 450, rate: 14, peep: 5, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 2 } },
    gas: { shunt: 0.06, recruitability: 0.2 },
    variants: [{
      id: 'le', sounds: {}, vitals: { hr: 40, sys: -25, dia: -10 }, delay: [15, 30],
      effect: { shuntAdd: 0.22, petGap: 2.2, effort: { amplitude: 6, rate: 28, duration: 0.7 } },
      cues: [{ at: 0, who: 'monitor', text: 'Pulsen stiger plutselig til 120.' }, { at: 25, who: 'obs', text: 'Pasienten er svett og urolig, og begynner å trigge mange egne pust.' }, { at: 60, who: 'respirator', text: 'PetCO2 har falt selv om minuttvolumet er uendret.' }],
      clues: { lytt: 'Normale, symmetriske respirasjonslyder.', se: 'Tuben som dokumentert. Symmetrisk thorax. Høyre legg er hoven og øm.', krets: 'Kretsen er tett.', hold: 'Pplateau er normalt; mekanikken er uendret.', blodgass: 'Blodgass: PaO2 7,0 kPa på FiO2 35 %, PaCO2 5,0 kPa. PetCO2 bare 2,9: stor arteriell–endetidal gradient (dødrom).' },
      fixes: { lege: { text: 'Legen mistenker lungeemboli: CT-angiografi bekrefter, og antikoagulasjon startes. Du øker FiO2 i mellomtiden.', recover: 240 } },
      harmful: { sedasjon: 'Sedasjon demper uroen, men skjuler et alvorlig problem.' },
      neutral: { sug: 'Lite sekret.', bittblokk: 'Hun biter ikke.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Ingen pipelyder, ingen effekt.', rekruttering: 'Lungen er åpen; problemet er perfusjonen.', reposisjon: 'Ingen effekt.', cuff: 'Cuffen er fin.', vaeske: 'Litt bedre blodtrykk, men ikke årsaken.', sedasjonNed: 'Ikke aktuelt.', smertelindring: 'Ikke aktuelt.', juster: 'Høyere FiO2 holder metningen oppe en stund, men dette krever lege.' },
      resolve: ({ fixed, gas }) => fixed && gas.spo2 >= 0.92,
      explanation: 'Lungeemboli: plutselig fall i SpO2 og PetCO2 med uendret lungemekanikk og normale lungelyder, takykardi og hypotensjon. Fallende PetCO2 ved uendret ventilasjon betyr økt dødrom. Lege, CT og antikoagulasjon. Øk FiO2 mens du venter.',
    }],
  },
  {
    id: 'peep-hypotensjon',
    title: 'Hypotensjon etter PEEP-økning',
    vignette: 'Mann, 48 år, ARDS, hypovolem etter sepsis. Legen økte PEEP fra 8 til 16 for en halvtime siden for å bedre oksygeneringen. Du er inne for å dokumentere.',
    profileId: 'ards', settings: { mode: 'APVCMV', vt: 400, rate: 20, peep: 16, fio2: 50, timingMode: 'ie', ie: { i: 1, e: 2 } },
    gas: { shunt: 0.25, recruitability: 0.5 },
    variants: [{
      id: 'peephypo', sounds: {}, vitals: { hr: 30, sys: -40, dia: -22 }, delay: [10, 25],
      effect: { shuntAdd: 0 },
      cues: [{ at: 0, who: 'monitor', text: 'Blodtrykket faller: 84/46.' }, { at: 20, who: 'obs', text: 'Pasienten er blek og perifert kald. Urinproduksjonen har stoppet opp siste time.' }, { at: 50, who: 'kollega', text: '«Blodtrykket har falt jevnt siden PEEP ble økt.»' }],
      clues: { lytt: 'Normale respirasjonslyder.', se: 'Symmetrisk thorax, tuben som dokumentert. Halsvenene er flate.', krets: 'Kretsen er tett.', hold: 'Pplateau 26, drivtrykk 10. Mekanikken er uendret.', blodgass: 'Blodgass: PaO2 11 kPa, laktat 3,1 og stigende.' },
      fixes: { juster: { text: 'Du senker PEEP til et nivå sirkulasjonen tåler. Blodtrykket kommer opp. Legen vurderer væske.', recover: 0 }, vaeske: { text: 'Væskestøtet hever blodtrykket noe, men høy PEEP reduserer fortsatt venøs tilbakestrøm.', recover: -1, partial: { shuntAdd: 0 } } },
      harmful: { sedasjon: 'Mer sedasjon senker blodtrykket ytterligere.' },
      neutral: { sug: 'Lite sekret.', bittblokk: 'Han biter ikke.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Ingen effekt.', rekruttering: 'Mer intratorakalt trykk gir enda lavere blodtrykk.', lege: 'Legen ber deg senke PEEP og vurdere væske.', reposisjon: 'Ingen effekt.', cuff: 'Cuffen er fin.', sedasjonNed: 'Litt bedre, men ikke nok.', smertelindring: 'Ikke aktuelt.' },
      ventFix: true,
      resolve: ({ settings }) => settings.peep <= 10,
      explanation: 'Høy PEEP øker intratorakalt trykk, reduserer venøs tilbakestrøm og dermed minuttvolumet, særlig hos en hypovolem pasient. Flate halsvener, kald periferi og stigende laktat passer. Løsning: senk PEEP til det sirkulasjonen tåler, og gi væske etter ordinasjon.',
    }],
  },
  {
    id: 'opioid-apne',
    title: 'Apné etter opioidbolus',
    vignette: 'Kvinne, 74 år, i SPONT med ΔPsupport 8, våken og puster selv. Hun fikk nettopp en bolus morfin før sårstell.',
    profileId: 'normal', patient: { effort: { amplitude: 7, rate: 16, duration: 1 } }, settings: { mode: 'SPONT', psupport: 8, peep: 5, fio2: 30, ets: 25, apneaTime: 20, backup: { rate: 12, pcontrol: 12 } },
    variants: [{
      id: 'apne', sounds: {}, vitals: { hr: -10, sys: -10 }, delay: [15, 30],
      effect: { effort: { amplitude: 0, rate: 16, duration: 1 } },
      cues: [{ at: 0, who: 'obs', text: 'Hun blir stille og slutter å svare på tiltale.' }, { at: 25, who: 'respirator', text: 'Apné-alarm: backup-ventilasjon er startet.' }, { at: 60, who: 'kollega', text: '«Hun puster ikke selv lenger.»' }],
      clues: { lytt: 'Normale respirasjonslyder ved backup-pustene.', se: 'Små pupiller, respirasjonsfrekvens kun det respiratoren gir. Ingen egne pusteforsøk.', krets: 'Kretsen er tett.', hold: 'Pplateau normalt.', blodgass: 'Blodgass: PaCO2 7,4 kPa og stigende.' },
      fixes: { juster: { text: 'Du bytter til en kontrollert modus (PCV+ eller (S)CMV+) med passende innstillinger til effekten av opioidet avtar.', recover: 0 }, sedasjonNed: { text: 'Du stopper videre opioid og følger henne tett. Egenpusten kommer gradvis tilbake.', recover: 150 } },
      harmful: { sedasjon: 'Mer sedasjon forlenger apnéen.' },
      neutral: { sug: 'Lite sekret.', bittblokk: 'Hun biter ikke.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Ingen effekt.', rekruttering: 'Ikke aktuelt.', lege: 'Legen ber deg sikre ventilasjonen og vurdere nalokson.', reposisjon: 'Ingen effekt.', cuff: 'Cuffen er fin.', vaeske: 'Ikke aktuelt.', smertelindring: 'Ikke aktuelt.' },
      ventFix: true,
      resolve: ({ settings, m, fixed }) => (settings.mode !== 'SPONT' && m.expMinVol >= 5) || (fixed && m.breathType === 'spont'),
      explanation: 'Opioider demper respirasjonssenteret: i SPONT faller frekvensen til null, og apné-backup tar over med innstilt backup-rate og -trykk. Backup er en nødløsning; sikre ventilasjonen med en kontrollert modus (eller tilstrekkelig backup), stopp opioidet og vurder nalokson etter ordinasjon.',
    }],
  },
  {
    id: 'smerte',
    title: 'Smerte og agitasjon',
    vignette: 'Mann, 55 år, intubert etter thoraxkirurgi, i (S)CMV+. Smertepumpen er avsluttet i morges. Dere skal mobilisere ham til sengekanten.',
    profileId: 'normal', settings: { mode: 'APVCMV', vt: 480, rate: 14, peep: 5, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 2 } },
    variants: [{
      id: 'smerte', sounds: { cough: true }, vitals: { hr: 35, sys: 35, dia: 15 }, delay: [15, 30],
      effect: { effort: { amplitude: 12, rate: 32, duration: 0.6 }, shuntAdd: 0.03 },
      cues: [{ at: 0, who: 'obs', text: 'Han grimaserer, knytter hendene og puster raskt og overfladisk.' }, { at: 20, who: 'monitor', text: 'Puls 115, blodtrykk 165/95.' }, { at: 50, who: 'kollega', text: '«Han kjemper mot respiratoren. Skal vi gi noe beroligende?»' }],
      clues: { lytt: 'Normale respirasjonslyder, forkortede pust.', se: 'Smertescore (CPOT) høy: anspent ansikt, stive muskler, holder seg mot operasjonssåret ved hvert pust.', krets: 'Kretsen er tett.', hold: 'Vanskelig å måle: han trigger kontinuerlig.', blodgass: 'Blodgass: PaCO2 4,1 kPa (hyperventilerer).' },
      fixes: { smertelindring: { text: 'Du gir smertelindring etter ordinasjon. Etter noen minutter slapper han av, og pustene synkroniserer seg.', recover: 90 } },
      harmful: { sedasjon: 'Sedasjon uten analgesi demper uttrykket, men ikke smerten. Han blir rolig og lider i stillhet.' },
      neutral: { sug: 'Lite sekret.', bittblokk: 'Han biter ikke.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Ingen effekt.', rekruttering: 'Ikke aktuelt.', lege: 'Legen ordinerer smertelindring.', reposisjon: 'Ingen effekt.', cuff: 'Cuffen er fin.', vaeske: 'Ikke aktuelt.', sedasjonNed: 'Han får ingen sedasjon nå.', juster: 'Å endre modus hjelper lite når årsaken er smerte.' },
      resolve: ({ m, fixed }) => fixed && m.fTotal <= 24,
      explanation: 'Smerte gir takypné, høy drive og asynkroni, med takykardi og hypertensjon. Vurder smerte (CPOT/BPS) før sedasjon: analgesi først. Sedasjon uten smertelindring skjuler problemet.',
    }],
  },
  {
    id: 'avvenning-utmattelse',
    title: 'Avvenning: utmattelse under trykkstøtte',
    vignette: 'Mann, 66 år, 178 cm, pneumoni, dag 6 på respirator. Lett sedert (RASS −1) og puster selv i SPONT med trykkstøtte 8 over PEEP 5, O2 30 %, etter at sedasjonen ble trappet ned i morges.',
    profileId: 'normal', patient: { height: 178, sex: 'M', compliance: 50, effort: { amplitude: 5, rate: 16, duration: 1.0 } }, settings: { ...SETT.spontLett },
    gas: { shunt: 0.08, recruitability: 0.2 },
    variants: [{
      id: 'utmattelse', sounds: {}, vitals: { hr: 25, sys: 15 }, cues: [{ at: 0, who: 'obs', text: 'Han har begynt å puste raskere. Du ser at halsmusklene strammes ved hvert pust.' }, { at: 45, who: 'monitor', text: 'Respirasjonsfrekvensen på monitoren viser 30.' }, { at: 90, who: 'kollega', text: '«Han ser sliten ut. Svetter i pannen.»' }], delay: [10, 25],
      effect: { effort: { amplitude: 3, rate: 32, duration: 0.6 }, shuntAdd: 0.04, rampIn: 90 },
      clues: { lytt: 'Svake respirasjonslyder basalt bilateralt, ellers normalt. Ingen pipelyder.', se: 'Rask, overfladisk pust med bruk av hjelpemuskler i halsen. Han er svett, svarer på tiltale, men virker utmattet.', krets: 'Kretsen er tett og tørr.', blodgass: 'pH 7,31, PaCO2 7,2 kPa, PaO2 9,0 kPa: begynnende respiratorisk acidose.' },
      fixes: { juster: { text: 'Du øker trykkstøtten (eller hviler ham på kontrollert modus). Pustene blir dypere, og frekvensen faller gradvis.', recover: 60 } },
      harmful: { sedasjon: 'Sedasjonsbolus demper pustedriven: han puster enda mindre, SpO2 faller og PaCO2 stiger. Utmattelse behandles med mer støtte, ikke mindre drive.' },
      neutral: { sug: 'Lite sekret.', bittblokk: 'Han biter ikke.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Ingen pipelyder, ingen effekt.', rekruttering: 'Ikke indisert.', lege: 'Legen er enig: øk trykkstøtten til Vt 6–8 ml/kg og frekvens under 30, eller hvil ham på kontrollert modus til i morgen.', reposisjon: 'Ingen effekt.', smertelindring: 'Han angir ikke smerte.', sedasjonNed: 'Han er allerede våken nok.' },
      ventFix: true,
      resolve: ({ m, settings, fixed }) => fixed && (settings.mode !== 'SPONT' || settings.psupport >= 12) && m.vtPerKg >= 6 && m.fTotal <= 30 && m.vte > 0 && m.fTotal / (m.vte / 1000) <= 105,
      explanation: 'Trykkstøtte 8 var nok mens han var uthvilt, men når respirasjonsmuskulaturen trettes, blir pusten rask og overfladisk (RSB = f/Vt over 105 /min/l) og PaCO2 stiger. Riktig tiltak er å øke støtten til Vt 6–8 ml/kg IBW og frekvens under 30, eller hvile pasienten på kontrollert modus og prøve igjen neste dag. Sedasjon tar bort pustedriven og forverrer hypoventilasjonen.',
    }],
  },
  {
    id: 'autotrigging',
    title: 'Autotrigging av kondensvann i slangen',
    vignette: 'Kvinne, 58 år, 168 cm, operert for aortaaneurisme i går. Lett sedert og i ferd med å våkne. Puster selv i SPONT med trykkstøtte 8 over PEEP 5, O2 30 %, flowtrigger 2 l/min. Aktiv fukter på kretsen.',
    profileId: 'normal', patient: { height: 168, sex: 'K', effort: { amplitude: 5, rate: 15, duration: 1.0 } }, settings: { ...SETT.spontLett },
    gas: { shunt: 0.06, recruitability: 0.2 },
    variants: [{
      id: 'kondens', sounds: {}, vitals: { hr: 5 }, cues: [{ at: 0, who: 'obs', text: 'Du hører at det skvulper i inspirasjonsslangen.' }, { at: 25, who: 'obs', text: 'Respiratoren leverer pust tett i tett, men pasienten ligger helt rolig og ser ikke ut til å anstrenge seg.' }, { at: 60, who: 'monitor', text: 'PetCO2 på monitoren faller.' }], delay: [10, 25],
      effect: { triggerNoise: 4 },
      clues: { lytt: 'Normale respirasjonslyder. Klukkingen kommer fra slangen, ikke fra lungene.', se: 'Pasienten ligger rolig med lukkede øyne. Brystet hever seg hver gang respiratoren leverer et pust, men du ser ingen egen inspirasjonsbevegelse i hals eller mage før pustene. Slangen rykker.', krets: 'Det står vann i inspirasjonsslangen som skvulper fram og tilbake. Vannfellen er full.', blodgass: 'pH 7,50, PaCO2 3,9 kPa: respiratorisk alkalose av hyperventilasjon.' },
      fixes: { kondens: { text: 'Du tømmer vannet fra slangen og vannfellen. Pustene følger igjen pasientens egne pusteforsøk, og frekvensen faller til 15.', recover: 0 }, juster: { text: 'Du gjør triggeren mindre følsom (høyere flowtrigger eller trykktrigger). Autotriggingen stopper, men vannet ligger der fortsatt og bør tømmes.', recover: -1, partial: {} } },
      harmful: { sedasjon: 'Hun er allerede rolig. Sedasjon hjelper ikke mot autotrigging, men demper hennes egen pust.' },
      neutral: { sug: 'Ingen sekret i tuben.', bittblokk: 'Hun biter ikke.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Ingen pipelyder.', rekruttering: 'Ikke indisert.', lege: 'Legen ber deg sjekke kretsen for vann og lekkasje før du endrer innstillinger.', reposisjon: 'Ingen effekt.', cuff: 'Cuff-trykket er 25 cmH2O, ingen lekkasje.', sedasjonNed: 'Hun er allerede lett sedert.', smertelindring: 'Ingen tegn til smerte.' },
      ventFix: true,
      resolve: ({ m, settings, fixed }) => (fixed || settings.trigger.value >= 4.5 || settings.trigger.type === 'pressure') && m.fTotal <= 20,
      explanation: 'Autotrigging: respiratoren tolker trykk- og flowsvingninger fra vann i slangen som pasientens pusteforsøk og leverer pust hun ikke har bedt om. Tegnene er høy frekvens uten synlig egeninnsats, fallende PetCO2 og respiratorisk alkalose. Andre vanlige årsaker er lekkasje i krets eller cuff og hjerteoscillasjoner. Tøm kondens og tett lekkasjer, og gjør om nødvendig triggeren mindre følsom (høyere flowtrigger eller trykktrigger).',
    }],
  },
  {
    id: 'overassistanse',
    title: 'Overassistanse: for høy trykkstøtte',
    vignette: 'Kvinne, 45 år, 165 cm, pneumoni i bedring. Lett sedert og puster selv i SPONT med trykkstøtte 10 over PEEP 6, O2 30 %, siden i går da hun trengte mye støtte.',
    profileId: 'normal', patient: { height: 165, sex: 'K', compliance: 32, effort: { amplitude: 5, rate: 16, duration: 1.0 } }, settings: { ...SETT.spontLett, psupport: 10, peep: 6 },
    gas: { shunt: 0.08, recruitability: 0.2 },
    variants: [{
      id: 'overassistanse', sounds: {}, vitals: { hr: -5 }, cues: [{ at: 0, who: 'obs', text: 'Pustene hennes er blitt store og dype, med lange pauser imellom.' }, { at: 45, who: 'monitor', text: 'PetCO2 har falt til 3,8 kPa.' }, { at: 90, who: 'kollega', text: '«Hun puster bare 10–11 ganger i minuttet. Er støtten for høy?»' }], delay: [10, 25],
      effect: { compliance: 1.6, effort: { amplitude: 4, rate: 11, duration: 1.0 }, rampIn: 120 },
      clues: { lytt: 'Normale respirasjonslyder, bedre luftinngang basalt enn i går.', se: 'Dype pust med stor brystbevegelse og lange ekspirasjonspauser. Innimellom ser du en liten inspirasjonsbevegelse i halsen uten at respiratoren leverer pust.', krets: 'Kretsen er tett og tørr.', blodgass: 'pH 7,49, PaCO2 4,0 kPa, PaO2 13 kPa: respiratorisk alkalose.' },
      fixes: { juster: { text: 'Du senker trykkstøtten til Vt havner på 6–8 ml/kg IBW. Da får hun jobbe litt selv, og PetCO2 normaliseres.', recover: -1, partial: {} } },
      harmful: { sedasjon: 'Mer sedasjon demper driven ytterligere; hun puster enda sjeldnere og dypere.' },
      neutral: { sug: 'Lite sekret.', bittblokk: 'Hun biter ikke.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Ingen pipelyder.', rekruttering: 'Ikke indisert.', lege: 'Legen: «Lungene er bedre. Senk støtten til Vt 6–8 ml/kg, så får hun jobbe litt selv.»', reposisjon: 'Ingen effekt.', sedasjonNed: 'Hun er allerede lett sedert.', smertelindring: 'Ingen smerter.' },
      ventFix: true,
      resolve: ({ m, settings }) => settings.psupport <= 8 && m.vtPerKg >= 5.5 && m.vtPerKg <= 8.5,
      explanation: 'Når lungene bedres, gir samme trykkstøtte større tidevolum. Overassistanse gir store Vt (over 8 ml/kg IBW), lav frekvens, hypokapni og ineffektive pusteforsøk, fordi pustedriven dempes. Senk trykkstøtten til Vt 6–8 ml/kg IBW; det reduserer også ineffektiv trigging (Thille 2008).',
    }],
  },
  {
    id: 'scmv-slutter-trigge',
    title: '(S)CMV+: pasienten slutter å trigge etter mer sedasjon',
    vignette: 'Mann, 70 år, 176 cm, urosepsis, dag 3. Lett sedert med propofol og puster i (S)CMV+ der han trigger alle pustene: innstilt rate 12, Vt 480 ml (6,5 ml/kg), PEEP 5, O2 35 %. I kveld har han selv ligget på 18 pust i minuttet.',
    profileId: 'normal', patient: { height: 176, sex: 'M', effort: { amplitude: 6, rate: 18, duration: 1.0 } }, settings: { mode: 'APVCMV', vt: 480, rate: 12, peep: 5, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 2 }, trigger: { type: 'flow', value: 2 } },
    gas: { shunt: 0.07, recruitability: 0.2 },
    variants: [{
      id: 'dyp-sedasjon', sounds: {}, vitals: { hr: -8, sys: -10 }, cues: [{ at: 0, who: 'kollega', text: '«Jeg satte opp propofolen litt for en time siden, han var urolig.»' }, { at: 35, who: 'monitor', text: 'Respirasjonsfrekvensen har falt fra 18 til 12.' }, { at: 90, who: 'monitor', text: 'PetCO2 stiger, nå 6,5 kPa.' }], delay: [10, 25],
      effect: { effort: { amplitude: 0, rate: 18, duration: 1.0 }, rampIn: 60 },
      clues: { lytt: 'Normale respirasjonslyder.', se: 'Han sover dypt og reagerer ikke på tiltale (RASS −4). Ingen egne pusteforsøk; alle pustene er maskinpust.', krets: 'Kretsen er tett.', blodgass: 'pH 7,30, PaCO2 7,0 kPa: respiratorisk acidose av hypoventilasjon.' },
      fixes: { sedasjonNed: { text: 'Du reduserer propofolen etter ordinasjon. Etter en stund begynner han å trigge igjen, og minuttvolumet stiger.', recover: 90 }, juster: { text: 'Du øker innstilt rate så minuttvolumet blir tilstrekkelig mens han er dypt sedert, og tar opp sedasjonsnivået med legen.', recover: -1, partial: {} } },
      harmful: { sedasjon: 'Enda mer sedasjon: han hypoventilerer videre og PaCO2 stiger.' },
      neutral: { sug: 'Lite sekret.', bittblokk: 'Han biter ikke.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Ingen pipelyder.', rekruttering: 'Ikke indisert.', lege: 'Legen: «Enten mindre sedasjon eller høyere backup-rate. Innstilt rate skal gi nok minuttvolum alene.»', reposisjon: 'Ingen effekt.', smertelindring: 'Han er dypt sedert.', vaeske: 'Blodtrykket er akseptabelt.' },
      ventFix: true,
      resolve: ({ m }) => m.expMinVol >= 6.5,
      explanation: 'I (S)CMV+ bestemmer pasienten frekvensen så lenge han trigger; innstilt rate er bare et gulv. Når sedasjonen økes og egenpusten forsvinner, faller frekvensen til gulvet, og minuttvolumet blir for lavt. Sett alltid innstilt rate slik at den gir et akseptabelt minuttvolum alene, og vurder sedasjonsnivået (RASS-mål) før du øker.',
    }],
  },
  {
    id: 'pcv-ards-vt-faller',
    title: 'PCV+ ved ARDS: tidevolumet faller',
    vignette: 'Kvinne, 49 år, 170 cm, ARDS etter pankreatitt, dag 4. Lett sedert og trigger pustene selv i PCV+: Pcontrol 14 over PEEP 10, rate 20, O2 50 %. Vt har ligget på rundt 360 ml (6 ml/kg).',
    profileId: 'ards', patient: { height: 170, sex: 'K', compliance: 32, resistance: 10, resistanceExp: 10, effort: { amplitude: 4, rate: 22, duration: 0.8 } }, settings: { ...SETT.ardsPcv, pcontrol: 14, rate: 20, peep: 10, fio2: 50 },
    gas: { shunt: 0.28, recruitability: 0.5 },
    variants: [{
      id: 'stivere-lunge', sounds: {}, vitals: { hr: 15, sys: -5 }, cues: [{ at: 0, who: 'obs', text: 'Hun virker litt mer anstrengt enn i sted.' }, { at: 45, who: 'monitor', text: 'SpO2 kryper nedover.' }, { at: 90, who: 'kollega', text: '«Tidevolumet har falt. Det var 360 for en time siden.»' }], delay: [10, 25],
      effect: { compliance: 0.55, shuntAdd: 0.15, rampIn: 120 },
      clues: { lytt: 'Svekket respirasjonslyd basalt bilateralt, fine knatrelyder.', se: 'Tuben står som før. Brystet beveger seg mindre enn tidligere. Hun bruker hjelpemuskler lett.', krets: 'Kretsen er tett, ingen lekkasje.', blodgass: 'pH 7,28, PaCO2 7,4 kPa, PaO2 8,2 kPa på 50 % O2.' },
      fixes: { juster: { text: 'Du holder drivtrykket ≤ 15, øker frekvensen for minuttvolumet, og bedrer oksygeneringen med PEEP/O2. Legen varsles.', recover: -1, partial: {} }, rekruttering: { text: 'Legen gjør en rekrutteringsmanøver og øker PEEP. Oksygeneringen bedres, men tidevolum og minuttvolum må fortsatt justeres.', recover: -1, partial: { shuntAdd: 0 } } },
      harmful: { vaeske: 'Mer væske forverrer lungeødemet ved ARDS.' },
      neutral: { sug: 'Lite sekret.', bittblokk: 'Hun biter ikke.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Ingen pipelyder.', lege: 'Legen ber deg justere innstillingene nå og bestiller røntgen thorax.', reposisjon: 'Ingen umiddelbar effekt; bukleie vurderes av legen.', sedasjon: 'Dypere sedasjon endrer ikke lungemekanikken.', sedasjonNed: 'Ikke aktuelt nå.', smertelindring: 'Ingen smerter.' },
      ventFix: true,
      resolve: ({ m, gas }) => m.vtPerKg >= 4 && m.drivingPressure <= 15.5 && m.expMinVol >= 7 && gas.spo2 >= 0.90,
      explanation: 'I PCV+ er trykket konstant og tidevolumet avhenger av compliance: når lungen blir stivere, faller Vt og minuttvolumet, og CO2 stiger. Ikke jag tidevolumet med høyere trykk; hold drivtrykket (Pplat − PEEP) ≤ 15 cmH2O, øk heller frekvensen (opp mot 30–35), godta moderat hyperkapni (permissiv hyperkapni), og bedre oksygeneringen med PEEP og O2. Varsle lege: forverringen kan være atelektase, væske eller progresjon av ARDS.',
    }],
  },
  {
    id: 'spont-sekret-kols',
    title: 'Sekret hos KOLS-pasient i trykkstøtte',
    vignette: 'Mann, 61 år, 178 cm, KOLS, pneumoni i bedring. Lett sedert og puster selv i SPONT med trykkstøtte 12 over PEEP 5, O2 35 %, ETS 35 %. Siste suging var for 6 timer siden.',
    profileId: 'obstruktiv', patient: { height: 178, sex: 'M', effort: { amplitude: 8, rate: 18, duration: 0.9 } }, settings: { mode: 'SPONT', psupport: 12, peep: 5, fio2: 35, ets: 35, pramp: 50, trigger: { type: 'flow', value: 2 }, apneaTime: 20 },
    gas: { shunt: 0.1, recruitability: 0.1 },
    variants: [{
      id: 'sekret-spont', sounds: { secretions: 1, cough: true }, vitals: { hr: 15, sys: 5 }, cues: [{ at: 0, who: 'obs', text: 'Du hører rasling i tuben når han puster ut.' }, { at: 35, who: 'obs', text: 'Han hoster, uten at det ser ut til å hjelpe.' }, { at: 70, who: 'monitor', text: 'Frekvensen er 26, SpO2 92 %.' }], delay: [10, 25],
      effect: { resistance: 1.7, resistanceExp: 1.5, shuntAdd: 0.05, effort: { amplitude: 9, rate: 26, duration: 0.8 }, rampIn: 90 },
      clues: { lytt: 'Grove rhonchi over begge lunger som endrer seg når han hoster.', se: 'Synlig sekret i tuben. Han hoster og er lett urolig.', krets: 'Kretsen er tett. Litt sekret i filteret.', blodgass: 'pH 7,33, PaCO2 6,8 kPa, PaO2 8,5 kPa.' },
      fixes: { sug: { text: 'Du suger opp seigt, gulgrønt sekret. Pusten roer seg og tidevolumet øker.', recover: 20 } },
      harmful: { sedasjon: 'Sedasjon demper hosten og egenpusten; sekretet blir liggende.' },
      neutral: { bittblokk: 'Han biter ikke.', koble: 'Kretsen var tilkoblet.', tube: 'Tuben lå riktig.', bronkodilatator: 'Litt mindre pipelyder, men hovedproblemet er sekret.', rekruttering: 'Ikke indisert.', lege: 'Legen: «Sug ham først, så ser vi.»', reposisjon: 'Ingen effekt.', juster: 'Mer trykkstøtte gir litt større pust, men sekretet må fjernes.', sedasjonNed: 'Han er våken nok til å hoste.', smertelindring: 'Ingen smerter.' },
      resolve: ({ m, fixed }) => fixed && m.vtPerKg >= 5 && m.fTotal <= 24,
      explanation: 'Sekret øker luftveismotstanden. I trykkstøtte er trykket begrenset, så flow og tidevolum faller mens frekvensen stiger; i volumkontroll ville topptrykket steget i stedet. Suging er tiltaket. Hos KOLS-pasienter settes ETS gjerne høyere (30–40 %) for kortere inspirasjon og mindre auto-PEEP. Sedasjon demper hoste og egenpust og forverrer.',
    }],
  },
];

export function getSituation(id) { return SITUATIONS.find((s) => s.id === id) ?? null; }

const RESOLVE_HOLD = 10; // s sammenhengende oppfylt løsningskriterium
const SETTLE_AFTER_EFFECT = 20; // s etter at hendelsen er fullt utviklet før løsningskriteriet teller (glidende gjennomsnitt må rekke å falle)
const VITALS_BASE = { hr: 78, sys: 122, dia: 68, temp: 37.1 };

/** Vitale tegn (puls, blodtrykk) fra baseline, hendelsens effekt og hypoksi. Ren funksjon. */
export function computeVitals(base, effect, factor, spo2) {
  const hyp = spo2 < 0.92 ? (0.92 - spo2) * 300 : 0;
  return {
    hr: Math.round(base.hr + (effect?.hr ?? 0) * factor + hyp),
    sys: Math.round(base.sys + (effect?.sys ?? 0) * factor),
    dia: Math.round(base.dia + (effect?.dia ?? 0) * factor),
    temp: base.temp,
  };
}

/**
 * Lag en kjørbar situasjon. Kaller `hooks` for å påvirke simulatoren:
 *   hooks.getPatient() / hooks.setPatient(p) / hooks.getGas() / hooks.setGas({shunt}) / hooks.setDisconnected(bool)
 */
export function createSituation(def, { rng = Math.random, hooks } = {}) {
  const variant = def.variants[Math.floor(rng() * def.variants.length)];
  const [d0, d1] = variant.delay;
  const st = {
    id: def.id, variantId: variant.id, status: 'baseline', tStart: null, tEvent: null, tFired: null, tFixed: null, tResolved: null,
    log: [], wrongActions: 0, examined: new Set(), baseline: null, fixed: false, ramp: null, resolveSince: null, tFull: null,
    messages: [], pending: [], cueIndex: 0, flags: {}, factor: 0,
  };
  const vitalsBase = { ...VITALS_BASE, ...(def.vitalsBase ?? {}) };
  const decision = { pending: null, availableAt: Infinity, examsDone: 0, tried: new Set(), done: false };
  const DECISION_GAP = 4;   // s pause mellom valg så brukeren rekker å observere
  const CLUE_GAP = 3;       // s fra en avslørende undersøkelse til tiltaksvalget
  const FIRST_DECISION = 6; // s etter hendelsen før første valg (kortere hvis respiratoren alarmerer)
  const ALARM_LEAD = 2;     // s fra første alarm/monitorvarsel til første valg

  function pickN(arr, n) { return shuffle(rng, arr).slice(0, n); }
  function buildDecision() {
    if (decision.examsDone < 2) {
      const ids = EXAM_IDS.filter((id) => !decision.tried.has(id));
      return { kind: 'undersok', text: decision.examsDone === 0 ? 'Noe skjer med pasienten. Hva undersøker du først?' : 'Hva undersøker du videre?', options: pickN(ids, 5).map((id) => ({ id, label: ACTIONS[id].label })), skippable: true };
    }
    const fixes = Object.keys(variant.fixes).filter((id) => id !== 'juster' && !decision.tried.has(id));
    const others = Object.keys(ACTIONS).filter((id) => ACTIONS[id].kind === 'tiltak' && !variant.fixes[id] && !decision.tried.has(id) && id !== 'juster');
    const opts = [...fixes.slice(0, 2), ...pickN(others, 5 - Math.min(2, fixes.length) - 1)];
    if (!decision.tried.has('juster')) opts.push('juster');
    return { kind: 'tiltak', text: 'Hva gjør du?', options: shuffle(rng, opts).slice(0, 5).map((id) => ({ id, label: ACTIONS[id].label })) };
  }
  function shuffle(r, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function say(t, who, text) {
    const m = { t, who, text };
    st.messages.push(m);
    st.pending.push(m);
  }

  function applyEffect(e, scale = 1) {
    const b = st.baseline;
    const p = {
      compliance: b.patient.compliance * (1 + ((e.compliance ?? 1) - 1) * scale),
      resistance: b.patient.resistance * (1 + ((e.resistance ?? 1) - 1) * scale),
      resistanceExp: (b.patient.resistanceExp ?? b.patient.resistance) * (1 + ((e.resistanceExp ?? 1) - 1) * scale),
      effort: e.effort && scale >= 1 ? { ...b.patient.effort, ...e.effort } : { ...b.patient.effort },
    };
    hooks.setPatient(p);
    hooks.setGas({ shunt: b.gas.shunt + (e.shuntAdd ?? 0) * scale, petGap: 0.5 + ((e.petGap ?? 0.5) - 0.5) * scale });
    hooks.setDisconnected(!!e.disconnect && scale >= 1);
    hooks.setLeak?.((e.leak ?? 0) * scale);
    hooks.setTriggerNoise?.((e.triggerNoise ?? 0) * scale);
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
        else { applyEffect(variant.effect, 1); st.factor = 1; st.tFull = t; }
      }
      if (st.ramp) {
        const x = Math.min(1, (t - st.ramp.start) / st.ramp.duration);
        st.factor = st.ramp.from + (st.ramp.to - st.ramp.from) * x;
        applyEffect(variant.effect, st.factor);
        if (x >= 1) { if (st.ramp.to >= 1) st.tFull = t; st.ramp = null; }
      }
      // skriptede meldinger (relativt til hendelsen)
      if (st.tFired !== null) {
        const cues = variant.cues ?? [];
        while (st.cueIndex < cues.length && t - st.tFired >= cues[st.cueIndex].at) {
          if (!st.fixed) say(t, cues[st.cueIndex].who, cues[st.cueIndex].text);
          st.cueIndex++;
        }
      }
      // automatiske meldinger fra monitor og respirator
      const m = ctx.m ?? {};
      const spo2 = ctx.gas?.spo2 ?? 1;
      if (spo2 < 0.90 && !st.flags.spo2) { st.flags.spo2 = true; say(t, 'monitor', `Pulsoksymeteret alarmerer: SpO2 ${Math.round(spo2 * 100)} %.`); }
      if (spo2 >= 0.93 && st.flags.spo2 && !st.flags.spo2ok && st.fixed) { st.flags.spo2ok = true; say(t, 'monitor', `SpO2 er oppe i ${Math.round(spo2 * 100)} % igjen.`); }
      if (ctx.pmax && m.ppeak > ctx.pmax && !st.flags.ppeak) { st.flags.ppeak = true; say(t, 'respirator', `Høytrykksalarm: Ppeak ${Math.round(m.ppeak)} cmH2O over grensen ${ctx.pmax}.`); }
      if (m.pressureLimited && !st.flags.plimit) { st.flags.plimit = true; say(t, 'respirator', 'Trykkbegrensning: respiratoren holder igjen ved Plimit, og levert Vt faller.'); }
      if (ctx.disconnected && !st.flags.disc) { st.flags.disc = true; say(t, 'respirator', 'Alarm: lavt trykk / frakobling. ExpMinVol 0.'); }
      if (m.fTotal > 30 && !st.flags.ftot) { st.flags.ftot = true; say(t, 'respirator', `Alarm: høy frekvens, fTotal ${Math.round(m.fTotal)}.`); }
      if (m.expMinVol != null && m.expMinVol < 4 && !ctx.disconnected && !st.flags.mvlow) { st.flags.mvlow = true; say(t, 'respirator', `Alarm: lavt minuttvolum, ExpMinVol ${m.expMinVol.toFixed(1)} l/min.`); }
      if (m.autoPeep > 4 && !st.flags.autopeep) { st.flags.autopeep = true; say(t, 'respirator', `AutoPEEP ${m.autoPeep.toFixed(0)} cmH2O: ekspirasjonsflowen når ikke null.`); }

      if (st.status === 'active' && !decision.done && !decision.pending) {
        if (decision.availableAt === Infinity) decision.availableAt = st.tFired + FIRST_DECISION;
        // har monitor eller respirator allerede varslet, er det noe å reagere på: ikke la brukeren vente
        if (decision.examsDone === 0 && (st.flags.disc || st.flags.ppeak || st.flags.plimit || st.flags.spo2 || st.flags.autopeep)) decision.availableAt = Math.min(decision.availableAt, t + ALARM_LEAD);
        if (t >= decision.availableAt) decision.pending = buildDecision();
      }
      if (st.status === 'active') {
        // løsningskriteriet teller først når hendelsen er fullt utviklet, eller brukeren har gjort tiltak/valgt å justere
        const gate = st.fixed || decision.done || (st.tFull !== null && t - st.tFull >= SETTLE_AFTER_EFFECT);
        const ok = gate && variant.resolve({ ...ctx, fixed: st.fixed });
        if (ok) {
          if (st.resolveSince === null) st.resolveSince = t;
          if (t - st.resolveSince >= RESOLVE_HOLD) {
            st.status = 'resolved'; st.tResolved = t;
            say(t, 'obs', 'Pasienten ligger rolig igjen. Verdiene er stabile.');
          }
        } else st.resolveSince = null;
      }
      return st.status;
    },
    /** Ventende valg (1 av 5) eller null. */
    get decision() { return decision.pending; },
    /** Sekunder til neste valg (for nedtelling i UI). */
    nextDecisionIn(t) { return decision.pending || decision.done ? 0 : Math.max(0, decision.availableAt - t); },
    /** Brukeren velger et alternativ. Returnerer act()-resultatet. */
    choose(id, t) {
      if (!decision.pending) return null;
      const kind = decision.pending.kind;
      decision.pending = null;
      decision.tried.add(id);
      if (kind === 'undersok') decision.examsDone += 1;
      let res;
      if (id === 'juster' && variant.ventFix && variant.fixes.juster) {
        res = this.act('juster', t);
        decision.done = true;
        say(t, 'kollega', 'Juster respiratoren. Situasjonen regnes som løst når verdiene er innenfor målet.');
      } else if (id === 'juster') {
        res = { kind: 'noytral', text: variant.neutral.juster ?? 'Respiratorjustering løser ikke dette alene.' };
        st.wrongActions += 1;
        st.log.push({ t, actionId: 'juster', ...res });
      } else {
        res = this.act(id, t);
        if (res.kind === 'riktig' && (!variant.fixes[id]?.partial || variant.fixes[id]?.recover >= 0)) decision.done = Object.keys(variant.fixes).length <= 1 || res.kind === 'riktig';
      }
      decision.availableAt = t + DECISION_GAP;
      // fant undersøkelsen årsaken (casen har en egen ledetråd for den), går vi rett til tiltak etter en kort pause
      if (kind === 'undersok' && variant.clues[id]) { decision.examsDone = 2; decision.availableAt = t + CLUE_GAP; }
      return res;
    },
    /** Sekunder løsningskriteriet har vært oppfylt sammenhengende (null = ikke oppfylt nå), og kravet. */
    stableFor(t) { return st.resolveSince === null ? null : t - st.resolveSince; },
    get resolveHold() { return RESOLVE_HOLD; },
    get decisionDone() { return decision.done; },
    /** Hopp over videre undersøkelser og gå til tiltak. */
    skipToActions(t) { decision.examsDone = 2; decision.pending = null; decision.availableAt = t + 1; },
    /** Hopp over ventepausen før neste valg. */
    skipWait(t) { if (!decision.pending && !decision.done && st.status === 'active') decision.availableAt = t; },
    /** Hent nye meldinger siden sist. */
    drain() { const out = st.pending; st.pending = []; return out; },
    /** Vitale tegn nå. */
    vitals(ctx) { return computeVitals(vitalsBase, variant.vitals, st.fixed ? Math.min(st.factor, 0.3) : st.factor, ctx.gas?.spo2 ?? 1); },
    /** Utfør handling. Returnerer { kind, text }. kind: 'ledetrad' | 'riktig' | 'delvis' | 'skadelig' | 'noytral' | 'for-tidlig' */
    act(actionId, t) {
      const a = ACTIONS[actionId];
      let res;
      if (a.kind === 'undersok') {
        st.examined.add(actionId);
        const txt = st.status === 'baseline' ? (BASELINE_CLUES[actionId] ?? DEFAULT_CLUES[actionId]) : (variant.clues[actionId] ?? DEFAULT_CLUES[actionId]);
        res = { kind: 'ledetrad', text: txt, hold: actionId === 'hold' };
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
          if (f.recover > 0) st.ramp = { from: st.factor, to: 0, start: t, duration: f.recover };
          else { applyEffect(variant.effect, 0); st.factor = 0; st.ramp = null; }
          res = { kind: 'riktig', text: f.text };
        }
      } else if (variant.harmful[actionId]) {
        st.wrongActions += 1;
        res = { kind: 'skadelig', text: variant.harmful[actionId] };
      } else {
        st.wrongActions += 1;
        res = { kind: 'noytral', text: variant.neutral[actionId] ?? DEFAULT_NEUTRAL[actionId] ?? 'Ingen effekt.' };
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
      if (st.baseline) { hooks.setPatient(structuredClone(st.baseline.patient)); hooks.setGas(structuredClone(st.baseline.gas)); hooks.setDisconnected(false); hooks.setLeak?.(0); hooks.setTriggerNoise?.(0); }
    },
  };
}

const BASELINE_CLUES = {
  lytt: 'Normale, symmetriske respirasjonslyder.',
  se: 'Pasienten ligger rolig. Tuben står som dokumentert. Brystet beveger seg symmetrisk.',
  krets: 'Kretsen er tett og riktig koblet.',
  hold: 'Pplateau er som forventet.',
  blodgass: 'Blodgassen er innenfor normalområdet.',
};
