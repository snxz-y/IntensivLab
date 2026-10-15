import { NEUTRAL_BASE, ventFix, vtOk, pao2, paco2 } from './common.js';

/**
 * Voksencaser: asynkroni, spontan pust og avvenning (AS1–AS10).
 *
 * Kilder (se KILDER.md, «Voksencaser: asynkroni, spontan pust og avvenning»):
 *  - Thille et al., Intensive Care Med 2006;32:1515–22: ineffektiv trigging og dobbelttrigging er de vanligste
 *    asynkroniene; ineffektiv trigging henger sammen med mindre følsom trigger, høy trykkstøtte, stort Vt og høy pH.
 *    Asynkroniindeks over 10 % henger sammen med lengre respiratortid. Blanch et al., ICM 2015;41:633–41: og høyere dødelighet.
 *  - Tassaux et al., AJRCCM 2005;172:1283–9: ved obstruktiv sykdom gir høyere ETS (70 mot 10 %) mindre forsinket syklus,
 *    mindre PEEPi og færre ineffektive pusteforsøk.
 *  - Chiumello et al., Crit Care Med 2003;31:2604–10: kortest stigetid gir minst inspiratorisk pustearbeid i trykkstøtte
 *    etter akutt lungeskade; lav syklusterskel gir større Vt og lavere frekvens ved trykkstøtte 15.
 *  - Marini et al., Am Rev Respir Dis 1986;134:902–9: pasientens innsats fortsetter etter at respiratoren har startet pusten.
 *  - Gilstrap og MacIntyre, AJRCCM 2013;188:1058–68: trigger, flow (trykkstyrt mot fast flow) og syklus.
 *  - Pohlman et al., Crit Care Med 2008;36:3019–23: dobbelttrigging (stablede pust) ved lavt Vt gir ca. 10 ml/kg.
 *    ARDSNet-protokollen: ved stablede pust eller asynkroni kan Vt økes til 7–8 ml/kg hvis Pplat ≤ 30.
 *  - Parthasarathy og Tobin, AJRCCM 2002;166:1423–9: trykkstøtte gir hypokapni og sentrale apnéer under søvn, særlig ved hjertesvikt.
 *  - Metodebok i akutt indremedisin (HUS) «Respiratorbehandling» v1.0: DuoPAP med trykkstøtte ved oppstart, SPONT ved egenpust,
 *    nedtrapping ca. 2 cmH2O av gangen mot CPAP, ekstubasjonskriterier FiO2 < 0,35, PEEP ≤ 5, trykkstøtte < 8.
 *  - Ouellette et al., Chest 2017;151:166–80 (ACCP/ATS): første spontanpustetest med litt trykkstøtte framfor uten.
 */

/** Triggeren er følsom nok for en svak pasient: flowtrigger ≤ 3 l/min (trykktrigger bare ved ≤ 1 cmH2O). */
const triggerOk = (s) => (s.trigger.type === 'flow' && s.trigger.value <= 3) || (s.trigger.type === 'pressure' && s.trigger.value <= 1);
/** Innstilt inspirasjonstid (s) i kontrollerte modi. */
const tiSet = (s) => (s.timingMode === 'ti' ? s.ti : (60 / s.rate) * s.ie.i / (s.ie.i + s.ie.e));
/** Toppflow (l/min) i (S)CMV: Vt levert i TI minus pause. */
function scmvFlow(s) {
  const ti = tiSet(s);
  const pause = Math.min(0.7 * ti, (60 / s.rate) * Math.min(70, Math.max(0, s.tip ?? 0)) / 100);
  const ft = Math.max(0.05, ti - pause);
  return ((s.vt / 1000) / (s.flowPattern === 'decel' ? 0.75 * ft : ft)) * 60;
}
/** Rapid shallow breathing index f/Vt (/min/l). */
const rsb = (m) => (m.vte > 0 ? m.fTotal / (m.vte / 1000) : Infinity);
const controlled = (s) => ['APVCMV', 'PCV', 'SCMV'].includes(s.mode);

export const ASYNKRONI_CASES = [
  // ---------------------------------------------------------------- AS1
  {
    id: 'v-asynkroni-ufolsom-trigger',
    title: 'APVcmv: pusteforsøk som ikke gir pust (ufølsom trigger)',
    vignette: 'Kvinne, 63 år, 164 cm. Peritonitt og sepsis, dag 4 på respirator. Ventileres i APVcmv med Vt 380 ml, frekvens 14, PEEP 6, O2 35 %. I natt autotrigget respiratoren av kondensvann; vannet ble tømt, og flowtriggeren ble satt opp fra 2 til 15 l/min. Sedasjonen trappes ned nå, og hun begynner å puste selv.',
    profileId: 'normal', patient: { height: 164, sex: 'K', compliance: 42, resistance: 10, resistanceExp: 10, effort: { amplitude: 0, rate: 14, duration: 0.9 } },
    settings: { mode: 'APVCMV', vt: 380, rate: 14, peep: 6, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, trigger: { type: 'flow', value: 15 }, pmax: 40 },
    gas: { shunt: 0.15, recruitability: 0.2, vco2: 200 }, vitalsBase: { hr: 92, sys: 118, dia: 64, temp: 37.9 },
    variants: [{
      id: 'ufolsom', sounds: {}, vitals: {}, delay: [8, 15], effect: { effort: { amplitude: 2, rate: 26, duration: 0.9 }, rampIn: 30 },
      cues: [{ at: 0, who: 'obs', text: 'Hun åpner øynene og rynker pannen.' }, { at: 30, who: 'obs', text: 'Du ser at magen og halsen trekker seg inn mellom maskinpustene, uten at respiratoren gir pust.' }, { at: 70, who: 'kollega', text: '«Respiratoren viser frekvens 14, men hun puster jo mye raskere enn det?»' }],
      clues: {
        lytt: 'Normale respirasjonslyder bilateralt.',
        se: 'Hun er våken og urolig. Du teller 26 pusteforsøk i minuttet, men respiratoren leverer bare 14 pust. Pusteforsøkene er svake. Mellom pustene ser du små flowstøt og trykkfall på kurvene uten at et pust starter.',
        krets: 'Kretsen er tett og tørr. Vannfellen er tømt. Flowtriggeren står på 15 l/min.',
        hold: 'Pplateau er 15 cmH2O, drivtrykket ca. 9. Lungemekanikken er grei.',
        blodgass: 'pH 7,31, PaCO2 6,4 kPa, PaO2 11 kPa på 35 % O2.',
      },
      fixes: { ...ventFix },
      // når triggeren er følsom, får hun pust når hun ber om det og roer seg; ellers sliter hun
      effortFn: ({ settings }) => (triggerOk(settings) ? { amplitude: 2, rate: 18, duration: 0.9 } : { amplitude: 2, rate: 26, duration: 0.9 }),
      vitalsFn: ({ settings }) => (triggerOk(settings) ? {} : { hr: 18, sys: 16, dia: 6 }),
      harmful: { sedasjon: 'Hun kjemper ikke mot respiratoren; respiratoren svarer ikke på henne. Mer sedasjon skjuler problemet og forsinker avvenningen.' },
      neutral: { ...NEUTRAL_BASE, kondens: 'Slangene er tørre; vannet ble tømt i natt.', lege: 'Legen: «Vannet er borte. Da skal triggeren tilbake til en følsom innstilling, så hun får pust når hun prøver.»' },
      ventFix: true,
      target: 'Følsom trigger igjen: flowtrigger ca. 2 l/min. Hvert pusteforsøk skal gi et pust: fTotal lik pasientens egen frekvens, ca. 18.',
      resolve: ({ m, settings }) => triggerOk(settings) && m.fTotal >= 16 && m.breathType === 'triggered',
      teach: [
        { kind: 'obs', when: ({ m, settings }) => !triggerOk(settings) && m.fTotal < 16, text: 'Obs: Pasienten gjør flere pusteforsøk enn respiratoren leverer. Ineffektiv trigging henger sammen med ufølsom trigger, og asynkroni hos mer enn 10 % av pustene henger sammen med lengre respiratortid (Thille 2006).' },
        { when: ({ settings }) => triggerOk(settings), text: 'Riktig! Med flowtrigger ca. 2 l/min utløser hvert pusteforsøk et pust. Hun får pust når hun ber om det, frekvensen faller fra 26 til 18 pusteforsøk, og pustearbeidet går ned.' },
        { kind: 'obs', after: 'juster', when: ({ settings }) => settings.rate >= 18 && !triggerOk(settings), text: 'Obs: Høyere innstilt frekvens gir flere maskinpust, men de kommer når respiratoren vil, ikke når hun prøver. Problemet er triggeren.' },
        { kind: 'obs', after: 'juster', when: ({ settings }) => settings.trigger.type === 'pressure' && settings.trigger.value > 1, text: 'Obs: Trykktrigger krever at hun senker trykket i kretsen under PEEP før pustet starter. Pusteforsøkene hennes er så svake at hun ikke klarer det. Prøv flowtrigger ca. 2 l/min.' },
        { kind: 'obs', when: ({ settings }) => settings.trigger.type === 'flow' && settings.trigger.value < 1, text: 'Obs: Svært følsom trigger kan gi autotrigging igjen (vann, lekkasje, hjerteslag). Flowtrigger rundt 2 l/min er et godt utgangspunkt.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Autotrigging løses ved å fjerne årsaken (vann, lekkasje). Gjør du triggeren mindre følsom, må den tilbake når årsaken er borte, ellers får pasienten ineffektive pusteforsøk.' },
      ],
      explanation: 'Flowtrigger 15 l/min krever at pasienten trekker 15 l/min inn fra kretsen før respiratoren svarer. En svekket pasient som våkner etter flere døgn med sedasjon og sepsis klarer ikke det: hun gjør pusteforsøk som ikke gir pust (ineffektiv trigging). Tegnene er flere pusteforsøk enn fTotal, små flowstøt og trykkfall uten pust, uro, takykardi og lett forhøyet PaCO2. Ineffektiv trigging er den vanligste asynkronien og henger sammen med ufølsom trigger og lengre respiratortid (Thille 2006; Blanch 2015). Riktig tiltak er å sette triggeren tilbake til en følsom innstilling når årsaken til autotriggingen (vannet) er fjernet: flowtrigger ca. 2 l/min. Høyere innstilt frekvens eller mer sedasjon løser ikke asynkronien.',
    }],
  },
  // ---------------------------------------------------------------- AS2
  {
    id: 'v-asynkroni-ets-hoy',
    title: 'SPONT: for høy ETS ved stive lunger (for tidlig syklus)',
    vignette: 'Kvinne, 61 år, 158 cm. Lett KOLS fra før. Innlagt med bilateral pneumoni og lungeødem, dag 5 på respirator. Puster selv i SPONT med trykkstøtte 10 over PEEP 8, O2 40 %, TI max 1,5 s. ETS ble satt til 60 % ved innleggelse fordi hun har KOLS. Sedasjonen er redusert i dag.',
    profileId: 'restriktiv', patient: { height: 158, sex: 'K', compliance: 26, resistance: 9, resistanceExp: 10, effort: { amplitude: 8, rate: 18, duration: 0.8 } },
    settings: { mode: 'SPONT', psupport: 10, peep: 8, fio2: 40, ets: 60, pramp: 50, tiMax: 1.5, trigger: { type: 'flow', value: 2 }, apneaTime: 20 },
    gas: { shunt: 0.22, recruitability: 0.3, vco2: 190 }, vitalsBase: { hr: 92, sys: 132, dia: 74, temp: 37.6 },
    variants: [{
      id: 'ets-hoy', sounds: {}, vitals: {}, delay: [8, 15], effect: { effort: { amplitude: 6, rate: 30, duration: 0.8 }, rampIn: 30 },
      cues: [{ at: 0, who: 'obs', text: 'Hun er våknere og puster raskere.' }, { at: 30, who: 'obs', text: 'Pustene er korte. Du ser at hun fortsetter å trekke etter at respiratoren har sluttet å blåse.' }, { at: 70, who: 'kollega', text: '«Frekvensen er 30 og tidevolumet er lite. Trenger hun mer trykkstøtte?»' }],
      clues: {
        lytt: 'Knatrelyder bilateralt basalt, ingen pipelyder, normalt ekspirium.',
        se: 'Rask, overfladisk pust, ca. 30 i minuttet. Inspirasjonene er korte (ca. 0,3 s); hun trekker videre etter at pustet er avsluttet. Lette inndragninger i halsgropen.',
        krets: 'Kretsen er tett. Syklusårsak «ETS»: flowen faller raskt til 60 % av toppflow, og pustet avsluttes tidlig. RCexp er kort, ca. 0,3 s (stiv lunge, ikke obstruktiv).',
        hold: 'Cstat ca. 26 ml/cmH2O. Ekspirasjonsflowen når null i god tid før neste pust, uten AutoPEEP.',
        blodgass: 'pH 7,32, PaCO2 6,7 kPa, PaO2 10 kPa på 40 % O2.',
      },
      fixes: { ...ventFix },
      // når pustet varer like lenge som hennes egen inspirasjon, får hun større Vt og puster roligere
      effortFn: ({ settings }) => (settings.mode === 'SPONT' && settings.ets <= 30 ? { amplitude: 6, rate: 20, duration: 0.8 } : { amplitude: 6, rate: 30, duration: 0.8 }),
      vitalsFn: ({ settings }) => (settings.mode === 'SPONT' && settings.ets <= 30 ? {} : { hr: 14, sys: 10, dia: 4 }),
      harmful: { sedasjon: 'Sedasjon demper frekvensen, men pustene kuttes fortsatt for tidlig og blir små.' },
      neutral: { ...NEUTRAL_BASE, bronkodilatator: 'Ingen pipelyder og normalt ekspirium. Ingen effekt.', lege: 'Legen: «Lungene er stive nå, ikke obstruktive. ETS må passe til lungemekanikken hun har i dag.»' },
      ventFix: true,
      target: 'ETS ned til ca. 25 % (standard) eller lavere, så pustet varer like lenge som hennes egen inspirasjon. Vt 6–8 ml/kg IBW og frekvens ≤ 25.',
      resolve: ({ m, settings }) => settings.mode === 'SPONT' && settings.ets <= 30 && vtOk(m, 5.8, 8.5) && m.fTotal <= 25,
      teach: [
        { kind: 'obs', when: ({ m }) => m.vtPerKg < 5.2 && m.fTotal >= 28, text: 'Obs: For tidlig syklus. I stive lunger faller flowen raskt (kort tidskonstant), så med ETS 60 % avsluttes pustet etter ca. 0,3 s mens hun fortsatt trekker pusten. Pustene blir små og frekvensen høy.' },
        { when: ({ settings }) => settings.mode === 'SPONT' && settings.ets <= 30, text: 'Riktig! Lavere ETS lar pustet vare til hun selv er ferdig. Hos pasienter etter akutt lungeskade ga lav syklusterskel større Vt og lavere frekvens (Chiumello 2003). Høy ETS hører hjemme ved obstruksjon (Tassaux 2005).' },
        { kind: 'obs', after: 'juster', when: ({ settings }) => settings.ets > 30 && settings.psupport >= 14, text: 'Obs: Mer trykkstøtte gir litt større pust, men de kuttes fortsatt tidlig, og pasienten får mer trykk enn hun trenger. Finn årsaken: ETS passer ikke til lungene.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Se på RCexp (ekspiratorisk tidskonstant) på skjermen: kort RCexp (stiv lunge) tåler lav ETS, lang RCexp (obstruksjon) trenger høyere ETS. Er dobbelttrigging tegnet, sjekk også at TI max ikke kutter pustet.' },
      ],
      explanation: 'ETS (ekspiratorisk triggersensitivitet) bestemmer når trykkstøttepustet avsluttes: når flowen har falt til en gitt prosent av toppflow. Ved KOLS faller flowen langsomt, og høy ETS hindrer for sen syklus (Tassaux 2005). Hos denne pasienten dominerer nå stive lunger (pneumoni og lungeødem, kort tidskonstant): flowen faller raskt, og med ETS 60 % avsluttes pustet lenge før hun er ferdig med å puste inn (for tidlig syklus). Pustene blir små, frekvensen stiger, og hun fortsetter å trekke etter at respiratoren har sluttet å blåse. Ved kraftig pustedrive kan det gi dobbelttrigging. Riktig tiltak er å senke ETS til ca. 25 % eller lavere; ved stive lunger ga lav syklusterskel større Vt og lavere frekvens (Chiumello 2003). Innstillinger valgt for én tilstand må vurderes på nytt når lungemekanikken endrer seg.',
    }],
  },
  // ---------------------------------------------------------------- AS3
  {
    id: 'v-asynkroni-sen-syklus',
    title: 'KOLS i trykkstøtte: for sen syklus (ETS for lav)',
    vignette: 'Mann, 71 år, 172 cm. KOLS-forverring med pneumoni, dag 4 på respirator. Lett sedert, puster selv i SPONT med trykkstøtte 14 over PEEP 5, O2 30 %, TI max 1,5 s. I natt ble ETS satt ned fra 40 til 5 % for at han skulle få større tidevolum.',
    profileId: 'obstruktiv', patient: { height: 172, sex: 'M', compliance: 65, resistance: 18, resistanceExp: 28, effort: { amplitude: 6, rate: 18, duration: 0.8 } },
    settings: { mode: 'SPONT', psupport: 14, peep: 5, fio2: 30, ets: 5, pramp: 50, tiMax: 1.5, trigger: { type: 'flow', value: 2 }, apneaTime: 20 },
    gas: { shunt: 0.2, recruitability: 0.1, vco2: 210, deadspaceMl: 220 }, vitalsBase: { hr: 96, sys: 142, dia: 78, temp: 37.4 },
    variants: [{
      id: 'sen-syklus', sounds: { wheeze: 0.3 }, vitals: {}, delay: [8, 15], effect: { effort: { amplitude: 7, rate: 24, duration: 0.8 }, rampIn: 30 },
      cues: [{ at: 0, who: 'obs', text: 'Han er urolig og spenner magen i slutten av hvert pust.' }, { at: 30, who: 'obs', text: 'Du ser at han gjør pusteforsøk som respiratoren ikke svarer på.' }, { at: 70, who: 'kollega', text: '«Han puster fortere enn respiratoren viser, og pustene er lange.»' }],
      clues: {
        lytt: 'Lett forlenget ekspirium med svake pipelyder. Ingen sekretlyder.',
        se: 'Du teller 24 pusteforsøk i minuttet, men respiratoren gir bare 12–15. Inspirasjonene varer 1,5 s; han spenner bukmusklene for å puste ut før respiratoren slipper. Flowkurven når ikke null før neste pust.',
        krets: 'Kretsen er tett. Syklusårsaken på skjermen er «TI max»: flowen faller aldri til 5 % av toppflow innen 1,5 s.',
        hold: 'Hold lar seg knapt gjennomføre; han presser mot ventilen. Cstat ca. 65 ml/cmH2O, høy ekspiratorisk motstand.',
        blodgass: 'pH 7,39, PaCO2 5,5 kPa, BE +3, PaO2 9,2 kPa på 30 % O2.',
      },
      fixes: { ...ventFix },
      // når pusten avsluttes tidsnok, rekker han å puste ut og roer seg
      effortFn: ({ settings }) => (settings.mode === 'SPONT' && settings.ets >= 35 ? { amplitude: 6, rate: 20, duration: 0.8 } : { amplitude: 7, rate: 24, duration: 0.8 }),
      vitalsFn: ({ settings }) => (settings.mode === 'SPONT' && settings.ets >= 35 ? {} : { hr: 14, sys: 12, dia: 4 }),
      harmful: { sedasjon: 'Sedasjon demper symptomene, men pustene er fortsatt for lange og han får ikke pustet ut. Det forsinker avvenningen.' },
      neutral: { ...NEUTRAL_BASE, bronkodilatator: 'Han får allerede inhalasjoner etter plan. Litt mindre pipelyder, men pustene er fortsatt for lange.', lege: 'Legen: «Ved KOLS skal ETS være høy, ikke lav. Se på syklusårsaken.»' },
      ventFix: true,
      target: 'ETS opp til ca. 40–50 % så pusten avsluttes på ETS etter 0,6–0,8 s og han rekker å puste ut. Alle pusteforsøk skal gi pust: fTotal ca. 20, TI under 1 s.',
      resolve: ({ m, settings }) => settings.mode === 'SPONT' && settings.ets >= 35 && m.ti <= 1.0 && m.fTotal >= 18 && m.cycleReason === 'ETS',
      teach: [
        { kind: 'obs', when: ({ m }) => m.cycleReason === 'TI max' && m.ti >= 1.4, text: 'Obs: Pusten avsluttes på TI max, ikke ETS. Ved KOLS faller flowen langsomt (lang tidskonstant), så med lav ETS varer inspirasjonen lenger enn pasientens egen. Han presser mot respiratoren og rekker ikke å puste ut.' },
        { when: ({ settings }) => settings.mode === 'SPONT' && settings.ets >= 35, text: 'Riktig! Høyere ETS avslutter pusten tidligere. Hos KOLS-pasienter i trykkstøtte ga ETS 70 % mot 10 % mindre forsinket syklus, lavere PEEPi og færre ineffektive pusteforsøk (fra 9 til 2 per minutt) (Tassaux 2005).' },
        { kind: 'obs', after: 'juster', when: ({ settings }) => settings.ets < 35 && settings.trigger.type === 'flow' && settings.trigger.value < 2, text: 'Obs: Mer følsom trigger hjelper ikke. Pusteforsøkene som ikke gir pust, kommer mens respiratoren fortsatt blåser inn eller før lungen er tømt.' },
        { kind: 'obs', after: 'juster', when: ({ settings }) => settings.ets < 35 && settings.psupport >= 16, text: 'Obs: Mer trykkstøtte gir enda lengre og større pust ved KOLS, og flere ineffektive pusteforsøk. Høy trykkstøtte og stort Vt henger sammen med ineffektiv trigging (Thille 2006).' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.ets >= 35, text: 'Kortere TI max stopper også de lange pustene, men da avsluttes de på tid og ikke når flowen faller. Juster ETS først; TI max er en sikkerhetsgrense.' },
      ],
      explanation: 'I trykkstøtte avsluttes pusten når flowen har falt til ETS-prosenten av toppflow. Ved KOLS stiger og faller flowen langsomt fordi tidskonstanten er lang. Med ETS 5 % når flowen aldri terskelen, og pusten varer til TI max 1,5 s, mens pasientens egen inspirasjon er ferdig etter ca. 0,8 s (forsinket syklus). Han presser mot respiratoren for å puste ut, ekspirasjonstiden blir kort, lungen tømmes ikke, og en del av pusteforsøkene utløser ikke pust. Tassaux et al. (2005) viste at høy ETS hos KOLS-pasienter ga mindre forsinket syklus, lavere PEEPi og færre ineffektive pusteforsøk. Riktig tiltak er å øke ETS til ca. 40–50 % og følge syklusårsaken og flowkurven. Mer trykkstøtte eller mer følsom trigger løser ikke problemet.',
    }],
  },
  // ---------------------------------------------------------------- AS4
  {
    id: 'v-asynkroni-flowsult',
    title: '(S)CMV: flowsult hos pasient med høy pustedrive',
    vignette: 'Mann, 52 år, 178 cm. Urosepsis, dag 2 på respirator. Ventileres i (S)CMV med Vt 480 ml, frekvens 14, I:E 1:2, firkantflow, PEEP 6, O2 35 %. Han har vært lett sedert og har trigget rolig på ca. 18. Nå har han fått feber 39,2 og laktat 3,4, er urolig og puster mye raskere.',
    profileId: 'normal', patient: { height: 178, sex: 'M', compliance: 45, resistance: 10, resistanceExp: 10, effort: { amplitude: 5, rate: 18, duration: 0.8 } },
    settings: { mode: 'SCMV', vt: 480, rate: 14, peep: 6, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 2 }, tip: 0, flowPattern: 'square', trigger: { type: 'flow', value: 2 }, pmax: 40 },
    gas: { shunt: 0.17, recruitability: 0.2, vco2: 270 }, vitalsBase: { hr: 104, sys: 112, dia: 60, temp: 39.2 },
    variants: [{
      id: 'flowsult', sounds: {}, vitals: {}, delay: [8, 15], effect: { effort: { amplitude: 12, rate: 26, duration: 0.8 }, rampIn: 30 },
      cues: [{ at: 0, who: 'obs', text: 'Han våkner og ser stresset ut.' }, { at: 30, who: 'obs', text: 'Han suger luft inn med hele brystkassen i starten av hvert pust, og halsmusklene spennes.' }, { at: 70, who: 'kollega', text: '«Trykkurven ser rar ut. Den synker ned i starten av hvert pust.»' }],
      clues: {
        lytt: 'Normale respirasjonslyder, litt grovere basalt.',
        se: 'Han er svett og urolig og trigger alle pustene, ca. 26 i minuttet. Trykkurven er innsunket (konkav) i første del av inspirasjonen: han trekker mer luft enn respiratoren gir. Flowen er flat på ca. 20 l/min hele inspirasjonen.',
        krets: 'Kretsen er tett. Med Vt 480 ml fordelt på TI 1,43 s (I:E 1:2 ved innstilt frekvens 14) blir flowen bare ca. 20 l/min.',
        hold: 'Pplateau ca. 18 cmH2O, drivtrykk ca. 12. Lungemekanikken er grei.',
        blodgass: 'pH 7,25, PaCO2 5,2 kPa, HCO3 17 mmol/l, BE −8, laktat 3,4. PaO2 11 kPa på 35 % O2. Metabolsk acidose der PaCO2 ikke er så lav som forventet.',
      },
      fixes: { ...ventFix },
      // får han flow etter behov (trykkstyrt pust) eller høy nok flow, trekker han mindre og roer seg noe
      effortFn: ({ settings }) => (controlled(settings) && settings.mode !== 'SCMV' || (settings.mode === 'SCMV' && scmvFlow(settings) >= 50) ? { amplitude: 7, rate: 22, duration: 0.8 } : { amplitude: 12, rate: 26, duration: 0.8 }),
      vitalsFn: ({ settings }) => (settings.mode === 'SCMV' && scmvFlow(settings) < 50 ? { hr: 16, sys: 14, dia: 6 } : {}),
      harmful: { sedasjon: 'Mer sedasjon tar bort symptomene, men han får fortsatt for lite flow når han puster. Det løser ikke asynkronien.' },
      neutral: { ...NEUTRAL_BASE, vaeske: 'Blodtrykket er akseptabelt. Væske endrer ikke flowsulten.', smertelindring: 'Han har ikke tegn til smerte. Uroen kommer av at han ikke får luft fort nok.', lege: 'Legen: «Han trenger mer flow enn (S)CMV gir med så lang TI. Bytt til trykkregulert modus, eller kort ned TI.»' },
      ventFix: true,
      target: 'Flow etter pasientens behov: bytt til APVcmv (eller PCV+) med Vt ca. 6–7 ml/kg, eller kort ned TI i (S)CMV så toppflow blir minst ca. 50 l/min. Frekvens ≤ 24, Vt 6–8 ml/kg.',
      resolve: ({ m, settings }) => ((controlled(settings) && settings.mode !== 'SCMV') || (settings.mode === 'SCMV' && scmvFlow(settings) >= 50)) && vtOk(m, 5.5, 8.5) && m.fTotal <= 24,
      teach: [
        { kind: 'obs', when: ({ settings }) => settings.mode === 'SCMV' && scmvFlow(settings) < 30, text: 'Obs: Flowsult. I (S)CMV er flowen fast: Vt delt på inspirasjonstiden. Han vil ha mer luft enn respiratoren gir, og trykkurven synker inn mens han trekker. Pasientens innsats stopper ikke når respiratoren starter pusten (Marini 1986).' },
        { when: ({ settings }) => settings.mode === 'APVCMV' || settings.mode === 'PCV', text: 'Riktig! I APVcmv og PCV+ er trykket bestemt og flowen fri: trekker pasienten mer, får han mer flow. Det gir bedre samspill enn fast flow ved høy pustedrive (Gilstrap og MacIntyre 2013).' },
        { when: ({ settings }) => settings.mode === 'SCMV' && scmvFlow(settings) >= 50, text: 'Riktig! Kortere TI gir høyere flow i (S)CMV. Følg med på dobbelttrigging: blir TI kortere enn hans egen inspirasjon, kan han utløse et nytt pust med en gang.' },
        { kind: 'obs', after: 'juster', when: ({ settings }) => settings.mode === 'SCMV' && settings.vt >= 540 && scmvFlow(settings) < 50, text: 'Obs: Større Vt med samme TI gir bare litt mer flow, og høyere platåtrykk. Det er flowen i starten av pustet han mangler.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Høy pustedrive ved sepsis kommer også av feber og metabolsk acidose. Behandle årsakene, og vurder smerte og ubehag før du øker sedasjonen.' },
      ],
      explanation: 'I (S)CMV leverer respiratoren innstilt Vt med fast flow: Vt 480 ml over TI 1,43 s gir bare ca. 20 l/min. En septisk pasient med feber og metabolsk acidose har høy pustedrive og vil ha mye mer flow i starten av inspirasjonen. Han trekker mot en fast flow (flowsult): trykkurven synker inn, pustearbeidet blir stort, og han blir urolig. Pasientens innsats fortsetter etter at pustet er utløst (Marini 1986). Trykkregulerte pust (APVcmv, PCV+) lar flowen følge pasientens behov og gir bedre samspill (Gilstrap og MacIntyre 2013). I (S)CMV kan flowen bare økes ved å korte ned TI, med risiko for dobbelttrigging. Større Vt eller mer sedasjon løser ikke flowsulten.',
    }],
  },
  // ---------------------------------------------------------------- AS5
  {
    id: 'v-asynkroni-p-ramp',
    title: 'PCV+: for langsom P-ramp hos pasient med høy pustedrive',
    vignette: 'Kvinne, 39 år, 166 cm. Pneumokokkpneumoni og sepsis, dag 3. Lett sedert og trigger pustene selv i PCV+: Pcontrol 12 over PEEP 8, frekvens 16, TI 0,9 s, O2 40 %. I natt ble P-ramp økt fra 50 til 400 ms fordi trykkurven hadde en liten topp i starten av pustet.',
    profileId: 'normal', patient: { height: 166, sex: 'K', compliance: 35, resistance: 10, resistanceExp: 10, effort: { amplitude: 5, rate: 22, duration: 0.8 } },
    settings: { mode: 'PCV', pcontrol: 12, rate: 16, peep: 8, fio2: 40, timingMode: 'ti', ti: 0.9, pramp: 400, trigger: { type: 'flow', value: 2 }, pmax: 40 },
    gas: { shunt: 0.22, recruitability: 0.3, vco2: 280 }, vitalsBase: { hr: 98, sys: 116, dia: 64, temp: 38.4 },
    variants: [{
      id: 'p-ramp', sounds: {}, vitals: {}, delay: [8, 15], effect: { effort: { amplitude: 9, rate: 32, duration: 0.7 }, rampIn: 30 },
      cues: [{ at: 0, who: 'obs', text: 'Hun puster raskere og ser anstrengt ut.' }, { at: 30, who: 'obs', text: 'Du ser at hun drar kraftig i starten av hvert pust; halsmusklene spennes.' }, { at: 70, who: 'monitor', text: 'Respirasjonsfrekvensen er over 30.' }],
      clues: {
        lytt: 'Knatrelyder basalt bilateralt, uendret fra i morges.',
        se: 'Hun trigger alle pustene, over 30 i minuttet, og drar hardt i starten av hvert pust. Trykkurven stiger sakte og når ikke Pcontrol før langt ut i inspirasjonen; flowkurven har en lav, avrundet topp.',
        krets: 'Kretsen er tett. P-ramp står på 400 ms, nesten halvparten av TI 0,9 s.',
        hold: 'Pplateau ca. 21 cmH2O, drivtrykk ca. 13. Vt ca. 420 ml (7 ml/kg).',
        blodgass: 'pH 7,40, PaCO2 4,8 kPa, PaO2 10 kPa på 40 % O2.',
      },
      fixes: { ...ventFix },
      // når trykket kommer raskt nok, får hun flow når hun trenger den og roer seg
      effortFn: ({ settings }) => (settings.pramp <= 100 ? { amplitude: 5, rate: 22, duration: 0.8 } : { amplitude: 9, rate: 32, duration: 0.7 }),
      vitalsFn: ({ settings }) => (settings.pramp <= 100 ? {} : { hr: 16, sys: 12, dia: 4 }),
      harmful: { sedasjon: 'Sedasjon demper pustedriven, men trykket kommer fortsatt for sakte. Det skjuler problemet.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «En liten topp i trykkurven er ikke farlig. Hun trenger trykket raskt når hun trekker pusten. Sett P-ramp ned igjen.»' },
      ventFix: true,
      target: 'P-ramp tilbake til ca. 50 ms (høyst ca. 100 ms), så trykket bygges raskt opp når hun trigger. Frekvens ≤ 26, Vt 6–8 ml/kg.',
      resolve: ({ m, settings }) => settings.pramp <= 100 && m.fTotal <= 26 && vtOk(m, 5.5, 8.5),
      teach: [
        { kind: 'obs', when: ({ m, settings }) => settings.pramp >= 200 && m.fTotal > 28, text: 'Obs: Lang P-ramp betyr at trykket stiger sakte. En pasient med høy pustedrive vil ha mest flow i starten av pustet, og må dra luften inn selv mens trykket bygges opp.' },
        { when: ({ settings }) => settings.pramp <= 100, text: 'Riktig! Kort stigetid gir flow når pasienten trenger den. Hos pasienter etter akutt lungeskade ga kortest stigetid minst inspiratorisk pustearbeid i trykkstøtte (Chiumello 2003). Frekvensen faller fra 32 til 22.' },
        { kind: 'obs', after: 'juster', when: ({ settings }) => settings.pramp > 100 && settings.pcontrol >= 16, text: 'Obs: Høyere Pcontrol gir større Vt, men trykket kommer fortsatt for sakte i starten. Hold Vt på 6–8 ml/kg og senk heller P-ramp.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'En liten topp (oversving) i trykkurven ved svært kort P-ramp er vanlig og ufarlig. Øk P-ramp bare litt om nødvendig (f.eks. 75–100 ms), aldri så mye at pasienten må trekke luften inn selv.' },
      ],
      explanation: 'P-ramp er tiden respiratoren bruker på å bygge opp trykket fra PEEP til innstilt nivå. Med 400 ms og TI 0,9 s kommer fullt trykk først midt i inspirasjonen. En pasient med høy pustedrive vil ha mest flow i starten, så hun drar luften inn selv mens trykket bygges opp: pustearbeidet øker, hun puster raskere og blir urolig. Kortere stigetid reduserer inspiratorisk pustearbeid (Chiumello 2003). Sett P-ramp tilbake til ca. 50 ms. En liten trykktopp i starten av pustet er ikke farlig, og er ikke grunn til lang P-ramp hos en pasient som puster selv.',
    }],
  },
  // ---------------------------------------------------------------- AS6
  {
    id: 'v-asynkroni-dobbelttrigging',
    title: '(S)CMV: dobbelttrigging fordi TI er for kort',
    vignette: 'Kvinne, 46 år, 168 cm. Innlagt med alvorlig astmaanfall for fem dager siden; hun ble satt på (S)CMV med firkantflow og TI 0,5 s for lang ekspirasjonstid. Bronkospasmen har gitt seg, men hun har fått aspirasjonspneumoni med lett ARDS. Ventileres fortsatt i (S)CMV med Vt 360 ml (6 ml/kg), frekvens 18, TI 0,5 s, PEEP 10, O2 45 %. Sedasjonen er redusert i dag.',
    profileId: 'ards', patient: { height: 168, sex: 'K', compliance: 32, resistance: 15, resistanceExp: 15, effort: { amplitude: 0, rate: 18, duration: 1.0 } },
    settings: { mode: 'SCMV', vt: 360, rate: 18, peep: 10, fio2: 45, timingMode: 'ti', ti: 0.5, tip: 0, flowPattern: 'square', trigger: { type: 'flow', value: 2 }, pmax: 45 },
    gas: { shunt: 0.27, recruitability: 0.4, vco2: 200 }, vitalsBase: { hr: 96, sys: 124, dia: 70, temp: 37.8 },
    variants: [{
      id: 'dobbel', sounds: {}, vitals: {}, delay: [8, 15], effect: { effort: { amplitude: 18, rate: 24, duration: 1.05 }, rampIn: 30 },
      cues: [{ at: 0, who: 'obs', text: 'Hun våkner og puster dypt og kraftig.' }, { at: 30, who: 'obs', text: 'Respiratoren gir to pust rett etter hverandre hver gang hun trekker pusten.' }, { at: 60, who: 'respirator', text: 'Alarm: høy frekvens. VTE veksler mellom nesten null og over 600 ml.' }],
      clues: {
        lytt: 'Knatrelyder bilateralt, ingen pipelyder.',
        se: 'Du teller 24 pusteforsøk i minuttet. Hvert pusteforsøk gir to maskinpust uten pause imellom: det første pustet er ferdig etter 0,5 s mens hun fortsatt trekker pusten, og hun utløser det neste med en gang. Brystet hever seg dobbelt.',
        krets: 'Kretsen er tett. TI står på 0,5 s. VTE er nesten null etter det første pustet og stor etter det andre: volumene stables.',
        hold: 'Hold lar seg ikke gjennomføre; hun trigger med en gang. Etter litt sedasjon i morges var Pplateau 22 cmH2O ved Vt 360 ml.',
        blodgass: 'pH 7,40, PaCO2 5,4 kPa (på vei ned), PaO2 10 kPa på 45 % O2.',
      },
      fixes: { ...ventFix },
      // når TI er like lang som hennes egen inspirasjon, får hun pustet ferdig og roer seg
      effortFn: ({ settings }) => (controlled(settings) && tiSet(settings) >= 0.9 ? { amplitude: 10, rate: 22, duration: 1.0 } : { amplitude: 18, rate: 24, duration: 1.05 }),
      vitalsFn: ({ m }) => (m.fTotal > 32 ? { hr: 16, sys: 12, dia: 4 } : {}),
      harmful: {},
      neutral: { ...NEUTRAL_BASE, bronkodilatator: 'Ingen pipelyder. Bronkospasmen har gitt seg.', sedasjon: 'Hun blir litt roligere, men dobbelttriggingen fortsetter: TI er fortsatt kortere enn hennes egen inspirasjon.', lege: 'Legen: «Astmaen er over. TI 0,5 s passer ikke lenger. Gi henne en TI som passer hennes egen inspirasjon.»' },
      ventFix: true,
      target: 'TI som passer hennes egen inspirasjonstid: ca. 0,9–1,2 s (i (S)CMV eller APVcmv), Vt 6 ml/kg (opptil 7–8 ved stablede pust hvis Pplateau ≤ 30). Ingen doble pust: fTotal ≤ 28, Vt ≤ 8 ml/kg, Pplateau ≤ 30.',
      resolve: ({ m, settings }) => controlled(settings) && tiSet(settings) >= 0.9 && m.fTotal <= 28 && m.vtPerKg >= 5 && m.vtPerKg <= 8.2 && m.pplat <= 30,
      teach: [
        { kind: 'obs', when: ({ m }) => m.fTotal > 36, text: 'Obs: Dobbelttrigging. Innstilt TI (0,5 s) er kortere enn hennes egen inspirasjon (ca. 1 s). Hun trekker fortsatt pusten når pustet slutter, og utløser et nytt pust uten utånding imellom. To Vt stables til over 10 ml/kg.' },
        { when: ({ settings }) => controlled(settings) && tiSet(settings) >= 0.9, text: 'Riktig! Når TI er omtrent like lang som pasientens egen inspirasjon, rekker hun å bli ferdig før respiratoren slipper. Dobbelttriggingen forsvinner, og Vt blir det du har stilt inn.' },
        { kind: 'obs', after: 'juster', when: ({ settings }) => tiSet(settings) < 0.9 && settings.vt >= 400, text: 'Obs: ARDSNet tillater Vt 7–8 ml/kg ved stablede pust (Pplateau ≤ 30), og stablede pust er sjeldnere ved høyere Vt (Pohlman 2008). Men her er årsaken at TI er for kort. Uten lengre TI fortsetter dobbelttriggingen.' },
        { kind: 'obs', when: ({ m }) => m.pplat > 30, text: 'Obs: Pplateau over 30 cmH2O. Hold Vt nede ved ARDS.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Innstillinger som var riktige i én fase (kort TI ved astma for lang ekspirasjon), kan bli feil i neste. Gå gjennom alle innstillingene når tilstanden endrer seg.' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.mode === 'SCMV' && tiSet(settings) >= 0.9 && scmvFlow(settings) < 40, text: 'I (S)CMV gir lengre TI lavere flow. Ser du tegn til flowsult (innsunket trykkurve, uro), er APVcmv med TI ca. 1 s et godt alternativ: der følger flowen pasientens behov.' },
      ],
      explanation: 'Ved alvorlig astma gir kort TI lang ekspirasjonstid og mindre luftfangst, og den lokale metodeboka for Hamilton C6 anbefaler (S)CMV med firkantflow ved alvorlig obstruksjon. Når bronkospasmen er over og pasienten våkner med høy pustedrive, blir TI 0,5 s for kort: hennes egen inspirasjon varer ca. 1 s. Hun trekker fortsatt pusten når maskinpustet slutter, og utløser et nytt pust uten utånding imellom (dobbelttrigging). Volumene stables, og lungen får to ganger innstilt Vt. Pohlman et al. (2008) fant at stablede pust ved lungebeskyttende ventilasjon ga ca. 10 ml/kg, og at de var sjeldnere med høyere innstilt Vt. ARDSNet-protokollen tillater derfor Vt 7–8 ml/kg ved stablede pust så lenge Pplateau er ≤ 30. Her er årsaken først og fremst for kort TI: øk TI til omtrent pasientens egen inspirasjonstid (0,9–1,2 s). Dobbelttrigging er vanligere i volum- og frekvensstyrte modi enn i trykkstøtte (Thille 2006).',
    }],
  },
  // ---------------------------------------------------------------- AS7
  {
    id: 'v-asynkroni-sovn-apne',
    title: 'SPONT om natten: overstøtte og sentrale apnéer',
    vignette: 'Mann, 74 år, 175 cm. Hjertesvikt og pneumoni, dag 6 på respirator. Puster selv i SPONT med trykkstøtte 16 over PEEP 6, O2 30 %, apnétid 20 s, backup frekvens 10 og Pinsp 10. Trykkstøtten ble satt opp i går ettermiddag da han var slapp og pustet raskt. Nå er det natt, og han sovner.',
    profileId: 'normal', patient: { height: 175, sex: 'M', compliance: 55, resistance: 10, resistanceExp: 10, effort: { amplitude: 5, rate: 10, duration: 1.0 } },
    settings: { mode: 'SPONT', psupport: 16, peep: 6, fio2: 30, ets: 25, pramp: 50, tiMax: 1.5, trigger: { type: 'flow', value: 2 }, apneaTime: 20, backup: { rate: 10, pcontrol: 10 } },
    gas: { shunt: 0.08, recruitability: 0.2, vco2: 250 }, vitalsBase: { hr: 78, sys: 108, dia: 62, temp: 37.2 },
    variants: [{
      id: 'sovn', sounds: {}, vitals: {}, delay: [8, 15], effect: { effort: { amplitude: 3, rate: 14, duration: 1.1 }, rampIn: 30 },
      cues: [{ at: 0, who: 'obs', text: 'Han har sovnet. Pustene er store og kommer sjeldent.' }, { at: 65, who: 'respirator', text: 'Apné-alarm: backup-ventilasjon startet. Etter noen pust begynner han å puste selv igjen.' }, { at: 150, who: 'kollega', text: '«Apné-alarmen har gått mange ganger i natt. Han våkner hver gang.»' }],
      clues: {
        lytt: 'Normale respirasjonslyder, bedre luftinngang basalt enn i går.',
        se: 'Han sover. Pusten går i perioder: noen store, sjeldne pust, så en pause uten pusteforsøk der apné-alarmen går og backup tar over, så våkner han litt og puster igjen.',
        krets: 'Kretsen er tett. Når han puster selv, er Vt rundt 800 ml (ca. 11 ml/kg IBW) og frekvensen 10–14.',
        hold: 'Pplateau ca. 18 cmH2O på de store pustene.',
        blodgass: 'pH 7,45, PaCO2 4,5 kPa (svinger med pustemønsteret), PaO2 14 kPa på 30 % O2.',
      },
      fixes: { ...ventFix },
      // søvn: lav pustedrive. Under apnéterskelen (PaCO2 ca. 4,35) stopper pusten; den kommer igjen når CO2 har steget (ca. 4,6)
      effortFn: ({ settings, gas, patient }) => {
        if (controlled(settings) || (settings.mode === 'SPONT' && settings.psupport <= 10)) return { amplitude: 4, rate: 18, duration: 1.0 };
        const apne = patient?.effort?.amplitude === 0;
        if (gas.paco2 < 4.35 || (apne && gas.paco2 < 4.6)) return { amplitude: 0, rate: 14, duration: 1.1 };
        return { amplitude: 3, rate: 14, duration: 1.1 };
      },
      vitalsFn: ({ settings }) => (settings.mode === 'SPONT' && settings.psupport > 10 ? { hr: 10, sys: 8 } : {}),
      harmful: { sedasjon: 'Sedasjon demper pustedriven ytterligere: apnéene blir lengre og hyppigere.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Han får for mye støtte nå som lungene er bedre. Senk trykkstøtten til Vt 6–8 ml/kg, eller gi ham kontrollert modus i natt.»' },
      ventFix: true,
      target: 'Trykkstøtte ned til Vt 6–8 ml/kg IBW (ca. 8–10 cmH2O), eller kontrollert modus (APVcmv) for natten. Ingen apnéer: han puster selv, PaCO2 ≥ 4,6 kPa.',
      resolve: ({ m, settings, gas }) => ((settings.mode === 'SPONT' && settings.psupport <= 10 && m.breathType === 'spont') || controlled(settings)) && vtOk(m, 5.5, 8.5) && paco2(gas) >= 4.6,
      teach: [
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 10, text: 'Obs: Vt over 10 ml/kg IBW. Når lungene bedres, gir samme trykkstøtte mye større pust. Det driver PaCO2 ned.' },
        { kind: 'obs', when: ({ m }) => m.breathType === 'backup', text: 'Obs: Sentral apné. Under søvn faller pustedriven, og med lav PaCO2 stopper pusten helt. Trykkstøtte gir hypokapni og sentrale apnéer under søvn, særlig ved hjertesvikt (Parthasarathy og Tobin 2002).' },
        { when: ({ settings }) => settings.mode === 'SPONT' && settings.psupport <= 10, text: 'Riktig! Lavere trykkstøtte gir Vt 6–8 ml/kg og normal PaCO2. Da holder pustedriven seg over apnéterskelen også når han sover.' },
        { when: ({ settings }) => controlled(settings), text: 'Riktig! En kontrollert modus med fast frekvens gir færre apnéer og mindre oppvåkning om natten enn trykkstøtte (Parthasarathy og Tobin 2002). Hold Vt på 6–8 ml/kg.' },
        { kind: 'obs', after: 'juster', when: ({ settings }) => settings.mode === 'SPONT' && settings.psupport > 10 && (settings.backup.rate >= 14 || settings.apneaTime > 20), text: 'Obs: Backup-innstillingene behandler apnéene, ikke årsaken. Mer backup senker PaCO2 enda mer, og lengre apnétid gir bare lengre pauser. Årsaken er for mye trykkstøtte.' },
      ],
      explanation: 'Trykkstøtte 16 ble satt da han var slapp. Når lungene bedres og han sovner, gir samme støtte pust på ca. 11 ml/kg, og PaCO2 faller. Under søvn styres pusten nesten bare av CO2: faller PaCO2 under apnéterskelen, stopper pusten. Backup tar over etter apnétiden, CO2 stiger, han puster igjen med for store pust, og syklusen gjentar seg (periodisk pust med sentrale apnéer). Parthasarathy og Tobin (2002) viste at trykkstøtte gir hypokapni og sentrale apnéer under søvn, særlig hos pasienter med hjertesvikt, og mer oppvåkning enn kontrollert ventilasjon med backup-frekvens. Riktig tiltak er å senke trykkstøtten til Vt 6–8 ml/kg, eller bruke en kontrollert modus om natten. Å endre backup-frekvens eller apnétid behandler ikke årsaken.',
    }],
  },
  // ---------------------------------------------------------------- AS8
  {
    id: 'v-asynkroni-nedtrapping',
    title: 'Nedtrapping i SPONT mot ekstubasjon (Metodebok HUS)',
    vignette: 'Kvinne, 58 år, 170 cm. Pneumoni, dag 7 på respirator, i klar bedring. Våken, samarbeider, god hoste og lite sekret. Puster selv i SPONT med trykkstøtte 14 over PEEP 8, O2 40 %. Legen har bedt deg starte nedtrappingen mot ekstubasjon etter metodeboka.',
    profileId: 'normal', patient: { height: 170, sex: 'K', compliance: 35, resistance: 10, resistanceExp: 10, effort: { amplitude: 4, rate: 14, duration: 1.0 } },
    settings: { mode: 'SPONT', psupport: 14, peep: 8, fio2: 40, ets: 25, pramp: 50, tiMax: 1.5, trigger: { type: 'flow', value: 2 }, apneaTime: 20 },
    gas: { shunt: 0.12, recruitability: 0.3, vco2: 190 }, vitalsBase: { hr: 84, sys: 124, dia: 70, temp: 37.1 },
    variants: [{
      id: 'nedtrapping', sounds: {}, vitals: {}, delay: [4, 8], effect: {},
      cues: [{ at: 0, who: 'kollega', text: 'Legen: «Hun er klar for nedtrapping. Trapp ned etter metodeboka mot ekstubasjonskriteriene, og si fra når hun er der.»' }],
      clues: {
        lytt: 'Gode respirasjonslyder, litt knatrelyder høyre basalt.',
        se: 'Hun er våken, rolig og samarbeider. Rolige pust på ca. 14 i minuttet.',
        krets: 'Kretsen er tett. Vt er ca. 500 ml, 8 ml/kg IBW, på trykkstøtte 14.',
        hold: 'Pplateau ca. 19 cmH2O, Cstat ca. 35 ml/cmH2O.',
        blodgass: 'pH 7,45, PaCO2 4,5 kPa, PaO2 15 kPa på 40 % O2.',
      },
      fixes: { ...ventFix },
      // jo mindre støtte, jo mer jobber hun selv. Helt uten støtte blir pusten rask og overfladisk (tuben øker pustearbeidet)
      effortFn: ({ settings }) => {
        const ps = settings.mode === 'SPONT' ? settings.psupport : 15;
        if (ps < 3) return { amplitude: 11, rate: 30, duration: 0.8 };
        if (ps < 5) return { amplitude: 8, rate: 26, duration: 0.8 };
        return { amplitude: Math.min(8, Math.max(4, 11 - 0.5 * ps)), rate: Math.round(14 + Math.max(0, 10 - ps)), duration: 0.9 };
      },
      vitalsFn: ({ settings }) => (settings.mode === 'SPONT' && settings.psupport < 5 ? { hr: 16, sys: 14, dia: 6 } : {}),
      harmful: { sedasjon: 'Sedasjon før ekstubasjon demper pust og hoste og forsinker hele avvenningen.' },
      neutral: { ...NEUTRAL_BASE, sug: 'Du suger litt tynt sekret. Fint før ekstubasjon, men nedtrappingen gjøres på respiratoren.', lege: 'Legen: «Kriteriene er O2 under 35 %, PEEP 5 eller lavere og trykkstøtte under 8. Trapp ned trykkstøtten ca. 2 cmH2O av gangen.»' },
      ventFix: true,
      target: 'Ekstubasjonskriteriene (Metodebok HUS): O2 < 35 %, PEEP ≤ 5, trykkstøtte < 8 (ca. 5–7). Trapp ned trykkstøtten ca. 2 cmH2O av gangen. Hun skal holde PaO2 ≥ 8 kPa, Vt ≥ 5 ml/kg, frekvens ≤ 25 og RSB (f/Vt) ≤ 105.',
      resolve: ({ m, gas, settings }) => settings.mode === 'SPONT' && settings.psupport >= 5 && settings.psupport < 8 && settings.peep <= 5 && settings.fio2 < 35 && pao2(gas) >= 8 && m.vtPerKg >= 5 && m.fTotal <= 25 && rsb(m) <= 105,
      teach: [
        { kind: 'info', when: ({ m, settings }) => m.vtPerKg > 7.5 && settings.psupport >= 12, text: 'Vt er 8 ml/kg, frekvensen er rolig og PaO2 er høy. Hun har bedret seg og får mer støtte enn hun trenger. Det er et tegn på at nedtrappingen kan begynne.' },
        { when: ({ settings }) => settings.mode === 'SPONT' && settings.psupport <= 10 && settings.psupport >= 5, text: 'Riktig! Metodeboka (HUS) trapper ned trykkstøtten ca. 2 cmH2O av gangen. Følg frekvens, Vt, SpO2, puls og pustearbeid etter hvert trinn; i praksis tar det timer, her går tiden fort.' },
        { when: ({ settings, gas }) => settings.peep <= 5 && settings.fio2 < 35 && pao2(gas) >= 8, text: 'Riktig! PEEP 5 og O2 under 35 % med PaO2 over 8 kPa: oksygeneringskriteriene for ekstubasjon er oppfylt.' },
        { kind: 'obs', when: ({ settings, m }) => settings.mode === 'SPONT' && settings.psupport < 5 && m.fTotal > 25, text: 'Obs: Uten trykkstøtte puster hun raskt og overfladisk (RSB over 105). Tuben gir ekstra motstand. Første spontanpustetest anbefales med litt trykkstøtte (ca. 5–8) framfor uten (ACCP/ATS 2017). Gå tilbake ett trinn.' },
        { kind: 'obs', when: ({ gas }) => pao2(gas) < 8, text: 'Obs: PaO2 er på vei under 8 kPa. Trapp ned O2 og PEEP i mindre trinn.' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.psupport < 8 && settings.peep <= 5 && settings.fio2 < 35, text: 'Respiratorkriteriene er nådd. Før ekstubasjon må hun også kunne beskytte luftveiene, ha god hoste og samarbeide (Metodebok HUS). Klarer hun ikke nedtrappingen, kan intervalltrening brukes, f.eks. 4 cmH2O lavere trykkstøtte i 15 min per time.' },
      ],
      explanation: 'Når pasienten bedres, skal støtten trappes ned. Metodeboka «Respiratorbehandling» (HUS) beskriver nedtrapping i SPONT med ca. 2 cmH2O lavere trykkstøtte av gangen mot CPAP, og intervalltrening ved behov (f.eks. 4 cmH2O lavere i 15 min per time). Ekstubasjonskriteriene er FiO2 under 0,35, PEEP 5 eller lavere og trykkstøtte under 8 over PEEP, i tillegg til at pasienten kan beskytte luftveiene, hoster godt og samarbeider. Følg frekvens, Vt og RSB (f/Vt under 105, Yang og Tobin 1991) etter hvert trinn. Å fjerne all støtte på én gang gir rask, overfladisk pust; første spontanpustetest anbefales med litt trykkstøtte framfor uten (ACCP/ATS 2017).',
    }],
  },
  // ---------------------------------------------------------------- AS9
  {
    id: 'v-asynkroni-duopap-oppstart',
    title: 'DuoPAP: pasienten begynner å puste selv på oppstartsinnstillingene',
    vignette: 'Mann, 57 år, 183 cm. Pneumoni, intubert i natt og startet i DuoPAP etter metodeboka: P high 26, PEEP 8, frekvens 16, T high 1,5 s, trykkstøtte 8, O2 45 %. Han var dypt sedert og pustet ikke selv. Nå er sedasjonen redusert, og han begynner å puste.',
    profileId: 'normal', patient: { height: 183, sex: 'M', compliance: 34, resistance: 12, resistanceExp: 12, effort: { amplitude: 0, rate: 16, duration: 0.9 } },
    settings: { mode: 'DUOPAP', phigh: 26, peep: 8, rate: 16, timingMode: 'ti', ti: 1.5, psupport: 8, fio2: 45, ets: 25, pramp: 50, tiMax: 1.5, trigger: { type: 'flow', value: 2 }, pmax: 40 },
    gas: { shunt: 0.25, recruitability: 0.3, vco2: 220 }, vitalsBase: { hr: 94, sys: 128, dia: 72, temp: 38.2 },
    variants: [{
      id: 'duopap', sounds: {}, vitals: {}, delay: [8, 15], effect: { effort: { amplitude: 8, rate: 24, duration: 0.9 }, rampIn: 30 },
      cues: [{ at: 0, who: 'obs', text: 'Han begynner å puste selv, også midt i maskinpustene.' }, { at: 30, who: 'obs', text: 'Han puster raskt: egne små pust på PEEP-nivå og store maskinpust innimellom. Han ser urolig ut.' }, { at: 70, who: 'kollega', text: '«fTotal er over 30, og PetCO2 er lav. Passer oppstartsinnstillingene fortsatt?»' }],
      clues: {
        lytt: 'Knatrelyder høyre basalt.',
        se: 'Han er halvvåken og puster ca. 24 ganger i minuttet selv. Respiratoren gir i tillegg 16 overganger til P high. Han trekker pusten oppå P high, og pustene han tar på PEEP-nivå er små.',
        krets: 'Kretsen er tett. fTotal over 30. Maskinpustene til P high gir ca. 550 ml (7 ml/kg); egne pust på PEEP-nivå med trykkstøtte 8 gir bare 3–4 ml/kg.',
        hold: 'Pplateau ca. 25 cmH2O på maskinpustene, drivtrykk ca. 17.',
        blodgass: 'pH 7,50, PaCO2 3,9 kPa, PaO2 10 kPa på 45 % O2.',
      },
      fixes: { ...ventFix },
      // med færre og mindre maskinpust og nok trykkstøtte puster han roligere selv
      effortFn: ({ settings }) => (settings.mode === 'DUOPAP' && settings.phigh - settings.peep <= 14 && settings.rate <= 12 ? { amplitude: 6, rate: 16, duration: 0.9 } : { amplitude: 8, rate: 24, duration: 0.9 }),
      vitalsFn: ({ m }) => (m.fTotal > 28 ? { hr: 14, sys: 10, dia: 4 } : {}),
      harmful: { sedasjon: 'Tilbake til dyp sedasjon tar bort egenpusten han nå klarer. Juster heller respiratoren etter ham.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Han puster selv nå. Senk frekvensen og P high, og la trykkstøtten ta mer av jobben.»' },
      ventFix: true,
      target: 'Tilpass DuoPAP til egenpusten: frekvens ned til ca. 10–12, P high ned til ca. 20–22 (drivtrykk ≤ 14) og trykkstøtte ca. 10 så egne pust blir 5–8 ml/kg. fTotal ≤ 26, ingen pust over 9 ml/kg, PaCO2 mot normalt.',
      resolve: ({ m, gas, settings }) => settings.mode === 'DUOPAP' && settings.rate <= 12 && settings.phigh - settings.peep <= 14 && settings.psupport >= 8 && settings.psupport <= 14 && m.vtPerKg >= 4.8 && m.vtPerKg <= 9 && m.fTotal <= 26 && paco2(gas) >= 4.5,
      teach: [
        { kind: 'obs', when: ({ m, settings }) => settings.mode === 'DUOPAP' && m.fTotal > 30, text: 'Obs: Han puster selv i tillegg til 16 maskinpust. Med P high og frekvens fra oppstarten får han mer maskinventilasjon enn han trenger, PaCO2 faller, og samspillet blir dårlig.' },
        { when: ({ settings }) => settings.mode === 'DUOPAP' && settings.rate <= 12 && settings.phigh - settings.peep <= 14, text: 'Riktig! Når pasienten puster selv, trappes maskindelen av DuoPAP ned: lavere frekvens og P high. Egne pust tar over mer av ventilasjonen.' },
        { when: ({ settings }) => settings.mode === 'DUOPAP' && settings.psupport >= 10, text: 'Riktig! Pust på PEEP-nivå får trykkstøtte (Psupport over PEEP, ETS som i SPONT). Metodeboka (HUS) bruker DuoPAP med trykkstøtte ved oppstart, nettopp for at pasienten skal kunne puste selv med støtte.' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 10, text: 'Obs: Pust over 10 ml/kg. Når han trekker pusten oppå P high, blir maskinpustene større enn trykkforskjellen alene skulle tilsi.' },
        { kind: 'obs', after: 'juster', when: ({ settings }) => settings.mode === 'DUOPAP' && settings.psupport < 6, text: 'Obs: Uten trykkstøtte blir pustene på PEEP-nivå små og pustearbeidet stort.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Når han puster stabilt selv, kan maskinfrekvensen trappes videre ned og han kan gå over til SPONT (Metodebok HUS: SPONT ved egenpust, nedtrapping mot CPAP).' },
      ],
      explanation: 'DuoPAP veksler mellom P high og PEEP med innstilt frekvens og T high, og pasienten kan puste selv på begge nivåene. Pust på PEEP-nivå får trykkstøtte (Psupport over PEEP). Metodeboka «Respiratorbehandling» (HUS) anbefaler DuoPAP med trykkstøtte ved oppstart, med starttrykk 20–30 og PEEP vanligvis 5–10. Oppstartsinnstillingene er laget for en sedert pasient. Når han begynner å puste selv, kommer egne pust i tillegg til maskinpustene: fTotal blir over 30, han puster oppå P high, PaCO2 faller, og samspillet blir dårlig. Riktig tiltak er å trappe ned maskindelen (frekvens 10–12, P high med drivtrykk ≤ 14) og la trykkstøtten (ca. 10) bære egne pust på 5–8 ml/kg. Etter hvert går han over til SPONT.',
    }],
  },
  // ---------------------------------------------------------------- AS10
  {
    id: 'v-asynkroni-backup',
    title: 'SPONT: apné etter propofolbolus og feil backup-innstillinger',
    vignette: 'Kvinne, 67 år, 160 cm. Respirasjonssvikt etter laparotomi, dag 5. Puster selv i SPONT med trykkstøtte 8 over PEEP 5, O2 30 %. I natt ble apnétiden satt til 60 s og backup-frekvensen til 8 (backup Pinsp 10) for å unngå alarmer når hun sov. Nå får hun en propofolbolus før bronkoskopi.',
    profileId: 'normal', patient: { height: 160, sex: 'K', compliance: 30, resistance: 12, resistanceExp: 12, effort: { amplitude: 6, rate: 18, duration: 1.0 } },
    settings: { mode: 'SPONT', psupport: 8, peep: 5, fio2: 30, ets: 25, pramp: 50, tiMax: 1.5, trigger: { type: 'flow', value: 2 }, apneaTime: 60, backup: { rate: 8, pcontrol: 10 } },
    gas: { shunt: 0.1, recruitability: 0.2, vco2: 180 }, vitalsBase: { hr: 86, sys: 128, dia: 70, temp: 37.3 },
    variants: [{
      id: 'propofol', sounds: {}, vitals: { hr: -6, sys: -18, dia: -8 }, delay: [8, 15], effect: { effort: { amplitude: 0, rate: 18, duration: 1.0 } },
      cues: [{ at: 0, who: 'kollega', text: 'Legen: «Propofolen er gitt. Vi starter bronkoskopien om et par minutter.»' }, { at: 25, who: 'obs', text: 'Hun har sluttet å puste. Respiratoren er stille.' }, { at: 60, who: 'respirator', text: 'Apné-alarm etter 60 s: backup-ventilasjon startet med frekvens 8.' }],
      clues: {
        lytt: 'Respirasjonslyder bare ved de få backup-pustene.',
        se: 'Hun puster ikke selv. Ingen pusteforsøk. Backup-pustene kommer sjelden og er små.',
        krets: 'Kretsen er tett. Apnétid 60 s, backup frekvens 8 og Pinsp 10: Vt ca. 280 ml (5,3 ml/kg IBW), minuttvolum ca. 2 l/min.',
        hold: 'Pplateau ca. 15 cmH2O på backup-pustene.',
        blodgass: 'Blodgassen er sendt. I mellomtiden stiger PetCO2 for hvert minutt.',
      },
      fixes: { ...ventFix },
      harmful: { sedasjon: 'Mer sedasjon forlenger apnéen.' },
      neutral: { ...NEUTRAL_BASE, sedasjonNed: 'Propofolinfusjonen er ikke startet; det var en bolus. Effekten varer noen minutter, og hun må ventileres til den går over.', lege: 'Legen: «Hun puster ikke under prosedyren. Sørg for at backup faktisk ventilerer henne, eller gå over til kontrollert modus.»' },
      ventFix: true,
      target: 'Sikker ventilasjon under apnéen: apnétid ≤ 20 s, backup frekvens ca. 12–16 og backup Pinsp som gir Vt 6–8 ml/kg (ca. 12–14 cmH2O), eller kontrollert modus (APVcmv/PCV+). Minuttvolum ≥ 5 l/min.',
      resolve: ({ m, settings }) => ((settings.mode === 'SPONT' && settings.apneaTime <= 20 && settings.backup.rate >= 12) || controlled(settings) || settings.mode === 'DUOPAP') && vtOk(m, 5.8, 8.5) && m.expMinVol >= 5,
      teach: [
        { kind: 'obs', when: ({ m }) => m.breathType === 'backup' && m.expMinVol < 4, text: 'Obs: Backup ventilerer for lite. Frekvens 8 med Vt under 6 ml/kg gir minuttvolum rundt 2 l/min. Backup skal kunne ventilere pasienten alene.' },
        { when: ({ settings }) => settings.mode === 'SPONT' && settings.apneaTime <= 20, text: 'Riktig! Apnétid 15–20 s gjør at backup starter før metningen faller. Med 60 s ligger pasienten et helt minutt uten ventilasjon før respiratoren reagerer.' },
        { when: ({ settings, m }) => (settings.mode === 'SPONT' && settings.backup.rate >= 12 && vtOk(m, 5.8, 8.5)) || (controlled(settings) && vtOk(m, 5.8, 8.5)), text: 'Riktig! Backup (eller kontrollert modus) med frekvens 12–16 og Vt 6–8 ml/kg gir et minuttvolum som holder PaCO2 og metningen stabil til propofolen går ut.' },
        { kind: 'obs', after: 'juster', when: ({ settings }) => settings.mode === 'SPONT' && settings.apneaTime <= 20 && settings.backup.rate < 12, text: 'Obs: Kortere apnétid alene er ikke nok. Backup-frekvens og -trykk må også gi nok ventilasjon.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Før prosedyrer med sedasjon: sjekk apnétid og backup-innstillinger, eller bytt til kontrollert modus mens pasienten er sedert. Alarmer skal ikke stilles slik at de ikke varsler en reell apné.' },
      ],
      explanation: 'I SPONT puster respiratoren bare når pasienten trigger. Apné-backup er sikkerhetsnettet: når pasienten ikke har pustet innen apnétiden, starter respiratoren trykkontrollert ventilasjon med backup-frekvens og -trykk. Her ble apnétiden satt til 60 s og backup til frekvens 8 og Pinsp 10 for å unngå alarmer om natten. Etter propofolbolusen puster hun ikke: det går ett minutt før backup starter, og backup gir bare ca. 2 l/min. PaCO2 stiger og metningen faller. Riktig tiltak er apnétid ca. 20 s eller kortere, backup-frekvens nær pasientens normale frekvens (12–16) og backup-trykk som gir Vt 6–8 ml/kg, eller å bytte til kontrollert modus under sedasjonen. Alarmer og backup skal ikke stilles slik at de ikke varsler en reell apné.',
    }],
  },
];
