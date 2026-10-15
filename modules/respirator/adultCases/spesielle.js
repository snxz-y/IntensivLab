import { NEUTRAL_BASE, ventFix, vtOk, sat, pao2, pf, paco2, ardsnetLowPeep, proneFix } from './common.js';

/*
 * Voksencaser: spesielle pasientgrupper der løsningen er respiratorjustering.
 *
 * Kilder (se KILDER.md, «Voksencaser: spesielle pasientgrupper»):
 *  - Overvekt: De Jong et al., Intensive Care Med 2020;46:2423–35 (Vt 6 ml/kg PBW, moderat til høy PEEP,
 *    anti-Trendelenburg / sittende stilling bedrer compliance og gassutveksling).
 *  - Intraabdominal hypertensjon: Regli, Pelosi, Malbrain, Ann Intensive Care 2019;9:52 (lavt Vt, ofte høyere PEEP,
 *    høyere platåtrykk kan aksepteres når drivtrykket holdes nede, ca. 50 % overføring av buktrykket til thorax);
 *    WSACS 2013 (Kirkpatrick et al.): ACS = vedvarende IAP > 20 mmHg med ny organsvikt.
 *  - Bronkopleural fistel: Grotberg et al., Crit Care Med 2021;49:292–301 (lavere topptrykk, Vt, PEEP, TI og frekvens,
 *    begrens negativt pleuratrykk). PROSEVA-protokollen: BPF med ett fremre thoraxdren var kontraindikasjon for mageleie.
 *  - Kardiogent lungeødem: Mahmood & Pinsky, Ann Transl Med 2018;6:349; Bello et al., Ann Transl Med 2018;6:355
 *    (positivt trykk senker venøs tilbakestrøm og venstre ventrikkels etterbelastning).
 *  - Høyre ventrikkelsvikt / lungeemboli: ESC 2019 (Konstantinides, Eur Heart J 2020;41:543–603): PEEP med forsiktighet,
 *    Vt ca. 6 ml/kg, Pplat < 30. Jardin & Vieillard-Baron, Intensive Care Med 2007;33:444–7 (Pplat < 27);
 *    Mekontso Dessap et al., Intensive Care Med 2016;42:862–70 (drivtrykk ≥ 18 og PaCO2 ≥ 48 mmHg gir akutt cor pulmonale).
 *  - Organdonor: Mascia et al., JAMA 2010;304:2620–7; Kotloff et al. (SCCM/ACCP/AOPO), Crit Care Med 2015;43:1291–325.
 *  - Graviditet: ELSO 2025 (O'Neil et al., ASAIO J 2025;71:875–87): PaCO2 i svangerskapet 28–32 mmHg (3,7–4,2 kPa),
 *    PaO2 ≥ 70 mmHg og SpO2 ≥ 95 % for fosterets oksygenering.
 *  - Guillain–Barré: Weiss et al., Ann Intensive Care 2025;15:67.
 *  - Hjertekirurgi: ERAS Cardiac (Engelman et al., JAMA Surg 2019;154:755–66); Metodebok (HUS) avvenningskriterier.
 *  - Transport: Metodebok (HUS): samme PEEP ved transport. Parmentier-Decrucq et al., Ann Intensive Care 2013;3:10.
 * Effektstørrelsene (compliance, shunt, lekkasje, blodtrykksfall) er pedagogiske valg, UVERIFISERT.
 */

// Lekkasje over bronkopleural fistel som følger middeltrykket i luftveiene (casen v-spesielle-fistel).
const lekkasjeFraTrykk = (pmean) => Math.round(Math.min(0.5, Math.max(0.06, ((pmean ?? 20) - 7) * 0.035)) * 50) / 50;

export const SPESIELLE_CASES = [
  // ---------------------------------------------------------------- S1
  {
    id: 'v-spesielle-overvekt',
    title: 'Sykelig overvekt: Vt etter idealvekt og høyere PEEP',
    vignette: 'Kvinne, 52 år, 163 cm, 125 kg (KMI 47). Pneumoni, intubert i natt. Ventileres i APVcmv med Vt 650 ml (satt «etter vekten»), frekvens 14, PEEP 5, O2 60 %. Sedert, puster ikke selv. Hun ligger flatt i sengen etter et stell.',
    profileId: 'normal', patient: { height: 163, sex: 'K', compliance: 38, resistance: 14, resistanceExp: 14, effort: { amplitude: 0, rate: 14, duration: 1 } },
    settings: { mode: 'APVCMV', vt: 650, rate: 14, peep: 5, fio2: 60, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, pmax: 45 },
    gas: { shunt: 0.18, recruitability: 0.6, vco2: 270, deadspaceMl: 150 }, vitalsBase: { hr: 102, sys: 138, dia: 78, temp: 38.1 },
    variants: [{
      id: 'overvekt-atelektase', sounds: {}, vitals: { hr: 12 }, delay: [8, 15], effect: { compliance: 0.75, shuntAdd: 0.17, rampIn: 50 },
      cues: [{ at: 0, who: 'kollega', text: '«Hun har ligget flatt siden stellet. SpO2 var 95 % før det.»' }, { at: 30, who: 'monitor', text: 'SpO2 siger nedover mot 89 %.' }],
      clues: { lytt: 'Svært svake respirasjonslyder basalt på begge sider, ellers langt borte lyder.', se: 'Stor buk som presser opp mot brystkassen. Brystet hever seg lite. Tuben står på 22 cm.', krets: 'Kretsen er tett.', hold: 'Pplateau er 28 cmH2O ved PEEP 5: drivtrykket er ca. 23 cmH2O. Vt 650 ml er 11,7 ml/kg idealvekt (55 kg).', blodgass: 'pH 7,46, PaCO2 4,5 kPa, PaO2 7,6 kPa på 60 % O2 (PaO2/FiO2 ca. 13 kPa).' },
      fixes: { ...ventFix, reposisjon: { text: 'Dere hever hodeenden og senker fotenden (anti-Trendelenburg, «sittende i sengen»). Buken faller bort fra mellomgulvet. Etter en stund …', recover: -1, extra: { shuntAdd: -0.04, compliance: 1.1 }, extraRamp: 30 } },
      followUp: ['reposisjon'], followUpAfter: 30,
      followUpText: 'Respiratoren er justert. Hva annet kan bedre lungefunksjonen hos henne?',
      // atelektasene åpnes og holdes åpne med høyere PEEP: compliance stiger (De Jong 2020; Pirrone 2016)
      mechFn: ({ settings }) => ({ compliance: settings.peep >= 14 ? 1.3 : settings.peep >= 10 ? 1.2 : 1 }),
      harmful: {},
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Vt skal regnes etter idealvekt, ikke faktisk vekt: 6–8 ml/kg av 55 kg. Hun trenger mer PEEP for å holde lungene åpne.»', rekruttering: 'Legen vil først øke PEEP og se effekten. Uten høyere PEEP faller lungen sammen igjen etter en manøver.', mageleie: 'Ikke nå. Oksygeneringen bedres når Vt og PEEP blir riktige. Mageleie kan brukes ved alvorlig ARDS også hos overvektige, men først optimaliseres respiratoren.', vaeske: 'Blodtrykket er godt. Væske bedrer ikke atelektasene.' },
      ventFix: true,
      target: 'Vt 6–8 ml/kg idealvekt (ca. 330–440 ml, ikke etter faktisk vekt), PEEP opp til minst 10 (gjerne 12–15) mot atelektasene, frekvens opp så PaCO2 holdes under ca. 6,5 kPa, SpO2 ≥ 92 % med O2 ≤ 60 %.',
      resolve: ({ m, gas, settings }) => m.vtPerKg <= 8.2 && settings.peep >= 10 && settings.fio2 <= 60 && sat(gas) >= 0.92 && gas.spo2 >= 0.92 && paco2(gas) <= 6.7,
      teach: [
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 9, text: 'Obs: Vt 650 ml er nesten 12 ml/kg idealvekt. Lungene vokser ikke med kroppsvekten. Vt regnes alltid etter idealvekt fra høyde og kjønn.' },
        { when: ({ m }) => m.vtPerKg > 0 && m.vtPerKg <= 8, text: 'Riktig! Vt 6–8 ml/kg idealvekt gjelder også ved overvekt (De Jong 2020). For en kvinne på 163 cm er det ca. 330–440 ml, uansett om hun veier 60 eller 125 kg.' },
        { after: 'juster', when: ({ settings }) => settings.peep >= 10, text: 'Riktig! Fettvev og en stor buk presser mellomgulvet opp og gir atelektaser basalt. Moderat til høy PEEP (ofte 10–15) holder lungen åpen, bedrer compliance og senker shunten (De Jong 2020).' },
        { when: ({ settings, m }) => settings.rate >= 20 && m.vtPerKg <= 8, text: 'Riktig! Overvektige har høyere CO2-produksjon. Når Vt senkes, må frekvensen opp for å holde minuttvolumet.' },
        { kind: 'obs', when: ({ settings }) => settings.fio2 >= 90 && settings.peep < 10, text: 'Obs: Mer oksygen åpner ikke sammenfalte alveoler. Øk PEEP.' },
        { kind: 'info', after: 'juster', when: ({ m, settings }) => settings.peep >= 10 && m.pplat > 0 && m.pplat <= 30, text: 'Platåtrykket kan være noe høyere hos overvektige fordi en del av trykket går med til å strekke den tunge brystveggen. Følg drivtrykket (Pplateau − PEEP), helst ≤ 15 cmH2O.' },
      ],
      explanation: 'Sykelig overvekt gir lav funksjonell residualkapasitet: den tunge brystveggen og buken presser mellomgulvet opp, og lungene faller sammen basalt, særlig når pasienten ligger flatt. To vanlige feil er å regne Vt etter faktisk vekt (650 ml er 11,7 ml/kg idealvekt) og å bruke for lav PEEP. Riktig er Vt 6–8 ml/kg idealvekt, moderat til høy PEEP (ofte 10–15, hvis blodtrykket tåler det), høyere frekvens for CO2 og O2 slik at PaO2 er 8–11 kPa. Hev hodeenden (anti-Trendelenburg eller sittende i sengen): det bedrer compliance og gassutvekslingen (De Jong et al., Intensive Care Med 2020). Platåtrykket kan være litt høyere fordi en del av trykket strekker brystveggen; drivtrykket er et bedre mål.',
    }],
  },
  // ---------------------------------------------------------------- S2
  {
    id: 'v-spesielle-buktrykk',
    title: 'Høyt buktrykk: stiv brystvegg, lavt Vt og høyere PEEP',
    vignette: 'Mann, 61 år, 178 cm. Alvorlig akutt pankreatitt, dag 2, har fått mye væske. Ventileres i (S)CMV med Vt 480 ml, frekvens 18, PEEP 5, inspiratorisk pause 10 %, O2 40 %. Sedert, puster ikke selv.',
    profileId: 'normal', patient: { height: 178, sex: 'M', compliance: 42, resistance: 12, resistanceExp: 12, effort: { amplitude: 0, rate: 18, duration: 1 } },
    settings: { mode: 'SCMV', vt: 480, rate: 18, peep: 5, fio2: 40, timingMode: 'ie', ie: { i: 1, e: 2 }, tip: 10, flowPattern: 'square', pmax: 50 },
    gas: { shunt: 0.08, recruitability: 0.6, vco2: 230, deadspaceMl: 200 }, vitalsBase: { hr: 112, sys: 104, dia: 58, temp: 38.4 },
    variants: [{
      id: 'iah', sounds: {}, vitals: { hr: 12, sys: -10, dia: -6 }, delay: [8, 15], effect: { compliance: 0.45, shuntAdd: 0.2, rampIn: 60 },
      cues: [{ at: 0, who: 'obs', text: 'Buken er mer utspilt og stram enn i morges.' }, { at: 30, who: 'respirator', text: 'Ppeak og Pplateau stiger jevnt.' }, { at: 60, who: 'kollega', text: '«Urinproduksjonen har vært under 20 ml i timen de siste tre timene.»' }],
      clues: { lytt: 'Svekket respirasjonslyd basalt på begge sider. Ingen pipelyder.', se: 'Buken er stram og utspilt. Brystkassen hever seg lite. Tuben står på 24 cm. Blæretrykket ble målt til 22 mmHg for en time siden.', krets: 'Kretsen er tett.', hold: 'Pplateau 30 cmH2O ved PEEP 5: drivtrykket er ca. 25 cmH2O med Vt 480 ml (6,5 ml/kg). Compliance har falt fra ca. 40 til under 20 ml/cmH2O.', blodgass: 'pH 7,36, PaCO2 5,3 kPa, PaO2 8,0 kPa på 40 % O2 (PaO2/FiO2 ca. 20 kPa), laktat 2,8 mmol/l.' },
      fixes: { ...ventFix },
      // høyere PEEP motvirker kompresjonsatelektasene fra buken (Regli 2019): compliance stiger
      mechFn: ({ settings }) => ({ compliance: settings.peep >= 10 && settings.peep <= 16 ? 1.5 : settings.peep > 16 ? 1.3 : 1 }),
      harmful: { vaeske: 'Mer væske øker ødemet i tarmvegg og buk, og buktrykket stiger ytterligere.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Blæretrykket er 22 mmHg, og han har ny organsvikt. Det er abdominalt kompartmentsyndrom. Kirurgen kommer for å vurdere avlastning. Juster respiratoren i mellomtiden: lavt Vt og høyere PEEP.»', mageleie: 'Ikke indisert. Han har ikke moderat til alvorlig ARDS, og årsaken er trykket fra buken.', rekruttering: 'Legen vil heller øke PEEP trinnvis og se på blodtrykket. Ved høyt buktrykk trengs høye åpningstrykk, og blodtrykket kan falle.', reposisjon: 'Hodeenden er hevet 30°. Det endrer lite på trykket i buken.' },
      ventFix: true,
      target: 'Vt ≤ 6,5 ml/kg idealvekt (ca. 440–480 ml), PEEP opp til 10–15 mot kompresjonsatelektasene, drivtrykk ≤ 16 cmH2O, SpO2 ≥ 92 % og PaCO2 under 7 kPa. Pplateau kan bli litt over 30 når brystveggen er stiv, så lenge drivtrykket holdes nede.',
      resolve: ({ m, gas, settings }) => m.vtPerKg <= 6.7 && settings.peep >= 10 && m.drivingPressure <= 16.5 && sat(gas) >= 0.92 && gas.spo2 >= 0.92 && paco2(gas) <= 7 && !m.pressureLimited,
      teach: [
        { kind: 'obs', when: ({ m }) => m.drivingPressure > 20, text: 'Obs: Drivtrykket er over 20 cmH2O med uendret Vt. Compliance har falt brått. Buken presser mellomgulvet opp: brystveggen er blitt stiv.' },
        { when: ({ settings }) => settings.peep >= 10, text: 'Riktig! Ved høyt buktrykk overføres omtrent halvparten av trykket til brystkassen, og lungene faller sammen basalt. Høyere PEEP holder dem åpne, og compliance bedres (Regli, Pelosi og Malbrain 2019).' },
        { after: 'juster', when: ({ m, settings }) => settings.peep >= 10 && m.vtPerKg > 0 && m.vtPerKg <= 6.5, text: 'Riktig! Lavt Vt (ca. 6 ml/kg idealvekt) er like viktig ved høyt buktrykk. Ikke øk Vt for å «presse» luften inn.' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 0 && m.vtPerKg < 5 && m.peep < 10, text: 'Obs: Å senke Vt mye for å få ned platåtrykket løser ikke atelektasene. Lungen trenger mer PEEP.' },
        { kind: 'info', after: 'juster', when: ({ m }) => m.pplat > 28, text: 'Pplateau inkluderer trykket som trengs for å strekke en stiv brystvegg. Ved høyt buktrykk kan noe høyere platåtrykk aksepteres når drivtrykket holdes innenfor trygge grenser (Regli 2019). Sjekk at Pmax er minst 10 over Ppeak, så pustene ikke trykkbegrenses.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Respiratoren kjøper tid. Behandlingen er å få ned buktrykket: ventrikkelsonde, tømme tarm, unngå mer væske, og ved abdominalt kompartmentsyndrom (IAP over 20 mmHg med ny organsvikt) vurderer kirurgen avlastning (WSACS 2013).' },
      ],
      explanation: 'Høyt intraabdominalt trykk presser mellomgulvet opp. Omtrent halvparten av buktrykket overføres til brystkassen, brystveggen blir stiv, og lungene faller sammen basalt. Ppeak og Pplateau stiger selv om Vt er uendret, og oksygeneringen faller. Riktig er å holde Vt lavt (ca. 6 ml/kg idealvekt), øke PEEP for å motvirke kompresjonsatelektasene og følge drivtrykket. Noe høyere platåtrykk kan aksepteres når brystveggen er stiv, så lenge drivtrykket er lavt (Regli, Pelosi og Malbrain, Ann Intensive Care 2019). Husk at Pmax må stå minst 10 cmH2O over Ppeak, ellers trykkbegrenses pustene. Abdominalt kompartmentsyndrom er vedvarende IAP over 20 mmHg med ny organsvikt (WSACS 2013); det behandles ved å få ned buktrykket, ofte kirurgisk.',
    }],
  },
  // ---------------------------------------------------------------- S3
  {
    id: 'v-spesielle-fistel',
    title: 'Bronkopleural fistel: lavest mulig trykk',
    vignette: 'Mann, 44 år, 183 cm. Nekrotiserende pneumoni høyre side med pneumothorax; fremre thoraxdren (2. interkostalrom) med sug −20 cmH2O. Ventileres i PCV+: Pcontrol 22 over PEEP 12, frekvens 16, TI 1,3 s, O2 50 %. For to timer siden ble PEEP økt fra 8 og Pcontrol fra 16 fordi SpO2 falt. Sedert, puster ikke selv.',
    profileId: 'normal', patient: { height: 183, sex: 'M', compliance: 26, resistance: 12, resistanceExp: 12, effort: { amplitude: 0, rate: 16, duration: 1 } },
    settings: { mode: 'PCV', pcontrol: 22, rate: 16, peep: 12, fio2: 50, timingMode: 'ti', ti: 1.3, pramp: 50, pmax: 50 },
    gas: { shunt: 0.25, recruitability: 0.4, vco2: 240, deadspaceMl: 170 }, vitalsBase: { hr: 108, sys: 112, dia: 64, temp: 38.9 },
    variants: [{
      id: 'bpf', sounds: {}, vitals: { hr: 8 }, delay: [6, 12],
      // ingen rampIn: lekkasjen settes av mechFn ut fra middeltrykket med én gang
      effect: { shuntAdd: 0.05 },
      cues: [{ at: 0, who: 'obs', text: 'Det bobler kontinuerlig i vannlåsen på thoraxdrenet, både i inspirasjon og ekspirasjon.' }, { at: 25, who: 'respirator', text: 'Stor forskjell mellom VTI og VTE: mye av tidevolumet kommer ikke tilbake.' }, { at: 60, who: 'kollega', text: '«Lekkasjen har blitt mye større etter at trykkene ble økt.»' }],
      clues: { lytt: 'Svekket respirasjonslyd høyre side, knatrelyder bilateralt.', se: 'Kontinuerlig bobling i drenets vannlås. Lite subkutant emfysem på høyre brystvegg. Drenet er fremre, i 2. interkostalrom.', krets: 'Kretsen og cuffen er tette. Volumet som mangler, går ut gjennom thoraxdrenet: VTI er ca. 560 ml, men VTE bare ca. 320 ml.', hold: 'Pplateau kan ikke måles pålitelig: trykket faller under holdet fordi luften lekker ut gjennom fistelen.', blodgass: 'pH 7,43, PaCO2 4,4 kPa, PaO2 10,7 kPa på 50 % O2.' },
      fixes: { ...ventFix },
      mechFn: ({ m }) => ({ leak: lekkasjeFraTrykk(m.pmean) }),
      harmful: { mageleie: 'Kontraindisert her: bronkopleural fistel med ett fremre thoraxdren var en kontraindikasjon i PROSEVA. I mageleie ligger han på drenet, som kan knekkes eller gå tett.', rekruttering: 'Skadelig: høye trykk øker flowen gjennom fistelen og kan gjøre lekkasjen større.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Senk trykkene så langt det går: lavere Pcontrol og PEEP, kortere TI. Vi aksepterer høyere CO2 og litt mer O2. Jeg ber også om at suget på drenet reduseres til det laveste som holder lungen ute.»', cuff: 'Cufftrykket er 26 cmH2O. Lekkasjen går ikke rundt tuben, men ut gjennom thoraxdrenet.', sug: 'Litt purulent sekret. Lekkasjen i drenet er uendret.' },
      ventFix: true,
      target: 'Lavest mulig trykk: PEEP ned til 5–8, Pcontrol ned så Vt blir ca. 5–7 ml/kg idealvekt (ca. 390–550 ml), kortere TI (0,8–1,0 s) og ikke høyere frekvens enn nødvendig. Middeltrykket (Pmean) under ca. 12 cmH2O. Aksepter PaCO2 opp mot 8 kPa (pH ≥ 7,20) og øk O2 så PaO2 er ≥ 7,5 kPa.',
      resolve: ({ m, gas, settings }) => settings.peep <= 8 && m.pmean <= 12 && m.vtPerKg <= 7.2 && pao2(gas) >= 7.5 && sat(gas) >= 0.89 && paco2(gas) <= 8,
      teach: [
        { kind: 'obs', when: ({ m }) => m.vti > 0 && m.vte / m.vti < 0.7, text: 'Obs: VTE er mye lavere enn VTI. Volumet som mangler, lekker ut gjennom fistelen og thoraxdrenet. Jo høyere trykk i luftveiene, jo større lekkasje.' },
        { when: ({ settings }) => settings.peep <= 8, text: 'Riktig! Lavere PEEP gir lavere trykk i hele ekspirasjonen og mindre flow gjennom fistelen (Grotberg 2021).' },
        { when: ({ m }) => m.pmean > 0 && m.pmean <= 12, text: 'Riktig! Lekkasjen over fistelen følger trykket i luftveiene. Lavere Pcontrol, kortere TI og lavere PEEP senker middeltrykket, og VTE nærmer seg VTI.' },
        { kind: 'obs', when: ({ settings }) => settings.peep >= 14 || settings.pcontrol >= 26, text: 'Obs: Høyere trykk for å bedre oksygeneringen gjør fistelen større. Øk heller O2 og aksepter lavere PaO2 (8 kPa er nok).' },
        { kind: 'info', after: 'juster', when: ({ gas }) => paco2(gas) > 6, text: 'PaCO2 stiger når Vt og trykk senkes. Permissiv hyperkapni ned til pH ca. 7,20 aksepteres for å gi fistelen ro (Metodebok, Respiratorbehandling). Ikke øk frekvensen mer enn nødvendig: hver pust gir ny lekkasje.' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.fio2 >= 60, text: 'Lavere PEEP gir mer shunt. Høyere O2 er riktig avveining her, men FiO2 over 0,6 i mer enn 1–2 døgn bør unngås (Metodebok). Ved stor, vedvarende lekkasje vurderes bronkoskopisk lukking, separat lungeventilasjon eller ECMO.' },
      ],
      explanation: 'En bronkopleural fistel er en forbindelse mellom luftveiene og pleurahulen. Med overtrykksventilasjon lekker en del av tidevolumet ut gjennom thoraxdrenet, og lekkasjen øker med trykket i luftveiene. Å øke PEEP og Pcontrol for å bedre oksygeneringen gjorde lekkasjen større. Riktig er lavest mulig trykk: lavere Pcontrol (Vt 5–7 ml/kg), lavere PEEP, kortere inspirasjonstid og ikke høyere frekvens enn nødvendig. Aksepter høyere PaCO2 (pH ≥ 7,20) og øk heller O2. Begrens suget på drenet: negativt trykk i pleura øker flowen gjennom fistelen (Grotberg et al., Crit Care Med 2021). Mageleie er kontraindisert med ett fremre thoraxdren (PROSEVA-protokollen).',
    }],
  },
  // ---------------------------------------------------------------- S4
  {
    id: 'v-spesielle-lungeodem',
    title: 'Kardiogent lungeødem: PEEP avlaster hjertet',
    vignette: 'Kvinne, 74 år, 160 cm. Akutt hjerteinfarkt med lungeødem, PCI i natt. Intubert, lett sedert og puster selv i SPONT med trykkstøtte 10 over PEEP 5, O2 50 %. Furosemid og nitroglyserin er gitt.',
    profileId: 'normal', patient: { height: 160, sex: 'K', compliance: 35, resistance: 14, resistanceExp: 14, effort: { amplitude: 5, rate: 22, duration: 0.85 } },
    settings: { mode: 'SPONT', psupport: 10, peep: 5, fio2: 50, ets: 25, pramp: 50, trigger: { type: 'flow', value: 2 }, apneaTime: 20, pmax: 40 },
    gas: { shunt: 0.14, recruitability: 0.75, vco2: 190, deadspaceMl: 130 }, vitalsBase: { hr: 108, sys: 158, dia: 88, temp: 37.0 },
    variants: [{
      id: 'kardiogent', sounds: {}, vitals: { hr: 14, sys: 14, dia: 6 }, delay: [8, 15],
      effect: { compliance: 0.8, shuntAdd: 0.2, effort: { amplitude: 7, rate: 32, duration: 0.7 }, rampIn: 50 },
      cues: [{ at: 0, who: 'obs', text: 'Hun puster raskere, og du hører surkling i tuben.' }, { at: 30, who: 'monitor', text: 'SpO2 faller mot 89 %. Blodtrykket stiger.' }, { at: 60, who: 'kollega', text: '«Det kommer skummende, rosa sekret i sugekateteret.»' }],
      clues: { lytt: 'Fine knatrelyder over begge lunger, helt opp til midt på ryggen.', se: 'Hun er svett, bruker halsmusklene og puster over 30 ganger i minuttet. Rosa, skummende sekret i tuben.', krets: 'Kretsen er tett. Litt kondens i ekspirasjonsslangen.', blodgass: 'pH 7,42, PaCO2 4,2 kPa, PaO2 7,5 kPa på 50 % O2 (PaO2/FiO2 ca. 15 kPa), laktat 2,4 mmol/l.' },
      fixes: { ...ventFix },
      // med PEEP 8–10 åpnes væskefylte alveoler (compliance opp), og pustearbeidet faller
      mechFn: ({ settings }) => ({ compliance: settings.peep >= 8 ? 1.2 : 1 }),
      effortFn: ({ settings }) => (settings.peep >= 8 ? { amplitude: 5, rate: 22, duration: 0.85 } : null),
      vitalsFn: ({ settings }) => { const x = Math.min(6, Math.max(0, settings.peep - 5)); return { sys: -3 * x, dia: -1 * x, hr: -2 * x }; },
      harmful: { vaeske: 'Skadelig: mer væske forverrer lungeødemet når venstre ventrikkel svikter.', sedasjon: 'Sedasjon demper pustearbeidet en stund, men behandler ikke ødemet. Høyere PEEP gjør begge deler.' },
      neutral: { ...NEUTRAL_BASE, sug: 'Du suger rosa, skummende sekret. Det kommer nytt hele tiden: suging behandler ikke lungeødemet.', lege: 'Legen: «Øk PEEP til 8–10. Det bedrer oksygeneringen og avlaster venstre ventrikkel. Jeg gir mer diuretika og nitroglyserin.»', rekruttering: 'Legen vil heller øke PEEP og se effekten. Høyere PEEP holder de væskefylte alveolene åpne.', mageleie: 'Ikke indisert. Dette er kardiogent lungeødem, ikke ARDS, og det behandles med PEEP, diuretika og vasodilatasjon.' },
      ventFix: true,
      target: 'PEEP opp til 8–10 cmH2O, SpO2 ≥ 92 % med O2 ≤ 60 %, respirasjonsfrekvens under ca. 28 og Vt 6–8 ml/kg idealvekt.',
      resolve: ({ m, gas, settings }) => settings.peep >= 8 && settings.fio2 <= 60 && sat(gas) >= 0.92 && gas.spo2 >= 0.92 && m.fTotal <= 28 && m.vtPerKg >= 5.5,
      teach: [
        { kind: 'obs', when: ({ settings }) => settings.fio2 >= 80 && settings.peep < 8, text: 'Obs: Mer oksygen alene åpner ikke de væskefylte alveolene. PEEP er hovedbehandlingen på respiratoren ved kardiogent lungeødem.' },
        { when: ({ settings }) => settings.peep >= 8, text: 'Riktig! PEEP 8–10 holder væskefylte alveoler åpne og reduserer shunten. Positivt trykk i brystkassen senker også venøs tilbakestrøm og venstre ventrikkels etterbelastning, så hjertet avlastes (Mahmood og Pinsky 2018).' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.peep >= 8, text: 'Legg merke til at pulsen og blodtrykket faller litt og frekvensen roer seg. En sviktende venstre ventrikkel tåler PEEP godt. Ved hypovolemi eller høyre ventrikkelsvikt kan samme PEEP gi blodtrykksfall.' },
        { kind: 'obs', when: ({ settings }) => settings.peep > 12, text: 'Obs: Svært høy PEEP er sjelden nødvendig ved kardiogent ødem og kan redusere fyllingen av hjertet for mye. 8–10 cmH2O er vanligvis nok.' },
        { kind: 'info', after: 'juster', when: ({ gas, settings }) => settings.fio2 > 50 && pao2(gas) > 11, text: 'Oksygeneringen er bedre. Trapp ned O2 til PaO2 8–11 kPa (Metodebok, Respiratorbehandling).' },
      ],
      explanation: 'Ved kardiogent lungeødem fylles alveolene med væske fordi trykket i venstre forkammer og lungekapillærene er høyt. Det gir shunt, stive lunger og høyt pustearbeid. Positivt trykk i brystkassen hjelper på to måter: PEEP holder de væskefylte alveolene åpne, og det økte trykket rundt hjertet senker venøs tilbakestrøm og venstre ventrikkels etterbelastning (Mahmood og Pinsky 2018; Bello et al. 2018). PEEP 8–10 cmH2O er derfor riktig her, sammen med diuretika og nitroglyserin. Hos en pasient med høyt blodtrykk og venstresvikt faller ikke blodtrykket farlig; ved hypovolemi eller høyre ventrikkelsvikt må PEEP brukes mer forsiktig.',
    }],
  },
  // ---------------------------------------------------------------- S5
  {
    id: 'v-spesielle-hoyre-ventrikkel',
    title: 'Høyre ventrikkelsvikt etter lungeemboli: skån høyre hjerte',
    vignette: 'Kvinne, 58 år, 167 cm. Stor lungeemboli, trombolysert i går, intubert for hypoksi. Ekko viser dilatert høyre ventrikkel. Ventileres i APVcmv med Vt 560 ml, frekvens 12, PEEP 12, O2 60 %. Noradrenalin 0,15 µg/kg/min. Sedert, puster ikke selv.',
    profileId: 'normal', patient: { height: 167, sex: 'K', compliance: 34, resistance: 12, resistanceExp: 12, effort: { amplitude: 0, rate: 12, duration: 1 } },
    settings: { mode: 'APVCMV', vt: 560, rate: 12, peep: 12, fio2: 60, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, pmax: 45 },
    gas: { shunt: 0.27, recruitability: 0.3, vco2: 260, deadspaceMl: 190 }, vitalsBase: { hr: 112, sys: 96, dia: 60, temp: 37.4 },
    variants: [{
      id: 'rv-svikt', sounds: {}, vitals: { hr: 10, sys: -8, dia: -4 }, delay: [8, 15], effect: { shuntAdd: 0.03, petGap: 1.8, rampIn: 40 },
      cues: [{ at: 0, who: 'monitor', text: 'Blodtrykket faller, middeltrykket er under 60.' }, { at: 30, who: 'kollega', text: '«Jeg har økt noradrenalinen to ganger, men trykket holder seg ikke.»' }, { at: 60, who: 'obs', text: 'Halsvenene er stuvet.' }],
      clues: { lytt: 'Normale respirasjonslyder, litt svekket basalt.', se: 'Stuvede halsvener. Kald og marmorert på knærne. Tuben står som dokumentert.', krets: 'Kretsen er tett.', hold: 'Pplateau 28,5 cmH2O ved PEEP 12: drivtrykket er ca. 16,5 cmH2O. Vt 560 ml er 9,5 ml/kg idealvekt.', blodgass: 'pH 7,26, PaCO2 6,7 kPa, PaO2 10,6 kPa på 60 % O2, laktat 3,6 mmol/l. PetCO2 er bare 4,9: stor arteriell–endetidal gradient (dødrom).' },
      fixes: { ...ventFix },
      // høy PEEP, høyt platåtrykk og hyperkapni øker lungekarmotstanden og belaster høyre ventrikkel
      vitalsFn: ({ settings, m, gas }) => {
        const x = Math.min(32, 2.5 * Math.max(0, settings.peep - 8) + 2 * Math.max(0, (m.pplat ?? 0) - 27) + 8 * Math.max(0, (gas.paco2 ?? 5) - 6.4) + 60 * Math.max(0, 0.92 - (gas.spo2 ?? 1)));
        return { sys: -x, dia: -x / 2, hr: 0.6 * x };
      },
      harmful: { mageleie: 'Kontraindisert nå: lungeemboli behandlet siste 2 døgn og middelarterietrykk under 70 mmHg trass i vasopressor var kontraindikasjoner i PROSEVA. Hun har heller ikke ARDS.', rekruttering: 'Skadelig: høyt trykk i lungene øker motstanden i lungekarene og kan få høyre ventrikkel til å svikte helt.', vaeske: 'Forsiktig: en utspilt høyre ventrikkel tåler lite væske. Den presser skilleveggen mot venstre ventrikkel, og minuttvolumet kan falle.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Høyre ventrikkel må skånes: ned med PEEP, Vt ca. 6–7 ml/kg og platåtrykk under 27. Hun skal ikke ha høy CO2, så frekvensen må opp. Hold SpO2 over 92 %.»', reposisjon: 'Ingen effekt på blodtrykket.' },
      ventFix: true,
      target: 'PEEP ned til 5–8, Vt ca. 6–7 ml/kg idealvekt (ca. 360–410 ml), Pplateau ≤ 27 og drivtrykk under 18 cmH2O, frekvens opp (ofte 24–30) så PaCO2 blir under 6,4 kPa (48 mmHg), og O2 slik at SpO2 ≥ 92 %.',
      resolve: ({ m, gas, settings }) => settings.peep <= 8 && m.pplat <= 27 && m.drivingPressure < 18 && m.vtPerKg <= 8 && paco2(gas) <= 6.4 && sat(gas) >= 0.92 && gas.spo2 >= 0.92,
      teach: [
        { kind: 'obs', when: ({ settings }) => settings.peep >= 14, text: 'Obs: Høyere PEEP klemmer lungekarene og øker motstanden høyre ventrikkel må pumpe mot. Blodtrykket faller.' },
        { when: ({ settings }) => settings.peep <= 8, text: 'Riktig! PEEP skal brukes med forsiktighet ved høyrebelastning: positivt trykk i brystkassen reduserer venøs tilbakestrøm og kan forverre lavt minuttvolum (ESC 2019, lungeemboli).' },
        { when: ({ m }) => m.pplat > 0 && m.pplat <= 27, text: 'Riktig! Platåtrykk under 27 cmH2O skåner høyre ventrikkel. Akutt cor pulmonale var mye vanligere over denne grensen (Jardin og Vieillard-Baron 2007).' },
        { kind: 'obs', when: ({ gas, m, settings }) => settings.rate < 20 && m.vtPerKg <= 7.5 && paco2(gas) > 7, text: 'Obs: Permissiv hyperkapni passer ikke her. Høy CO2 og acidose trekker sammen lungekarene og belaster høyre ventrikkel. Øk frekvensen når Vt senkes.' },
        { after: 'juster', when: ({ gas }) => paco2(gas) <= 6.4, text: 'Riktig! PaCO2 under 6,4 kPa (48 mmHg) og drivtrykk under 18 cmH2O: begge var uavhengige risikofaktorer for akutt cor pulmonale (Mekontso Dessap 2016).' },
        { kind: 'obs', when: ({ gas }) => gas.spo2 < 0.9, text: 'Obs: Hypoksi trekker også sammen lungekarene. Øk O2 når PEEP senkes.' },
        { kind: 'info', after: 'juster', when: ({ m }) => m.pplat > 0 && m.pplat <= 27, text: 'Stort dødrom etter lungeemboli gjør at PetCO2 ligger langt under PaCO2. Styr ventilasjonen etter blodgass, ikke etter PetCO2.' },
      ],
      explanation: 'Etter en stor lungeemboli arbeider høyre ventrikkel mot høy motstand i lungekarene. Respiratoren kan gjøre dette verre: høy PEEP og høyt platåtrykk klemmer lungekarene og senker venøs tilbakestrøm, og både hyperkapni og hypoksi trekker karene sammen. ESC 2019 anbefaler forsiktighet med PEEP og Vt rundt 6 ml/kg ved høyrisiko lungeemboli. «Høyre ventrikkel-beskyttende» ventilasjon holder Pplateau under 27 cmH2O (Jardin og Vieillard-Baron 2007), drivtrykk under 18 cmH2O og PaCO2 under 48 mmHg (6,4 kPa), som var risikofaktorer for akutt cor pulmonale (Mekontso Dessap 2016). Senk derfor PEEP og Vt, øk frekvensen for å holde CO2 nede, og bruk O2 for å unngå hypoksi. Stort dødrom gjør PetCO2 upålitelig; bruk blodgass.',
    }],
  },
  // ---------------------------------------------------------------- S6
  {
    id: 'v-spesielle-organdonor',
    title: 'Organdonor: lungebeskyttende ventilasjon etter hjernedød',
    vignette: 'Mann, 34 år, 186 cm. Hjernedød etter subaraknoidalblødning; organdonasjon er besluttet. Ventileres fortsatt med innstillingene fra nevrofasen: (S)CMV med Vt 750 ml, frekvens 12, PEEP 5, pause 10 %, O2 50 %. Temperatur 35,4 °C. Apnétesten ble gjort med frakobling av respiratoren for en time siden.',
    profileId: 'normal', patient: { height: 186, sex: 'M', compliance: 45, resistance: 10, resistanceExp: 10, effort: { amplitude: 0, rate: 12, duration: 1 } },
    settings: { mode: 'SCMV', vt: 750, rate: 12, peep: 5, fio2: 50, timingMode: 'ie', ie: { i: 1, e: 2 }, tip: 10, flowPattern: 'square', pmax: 45 },
    gas: { shunt: 0.1, recruitability: 0.6, vco2: 190, deadspaceMl: 180 }, vitalsBase: { hr: 96, sys: 104, dia: 60, temp: 35.4 },
    variants: [{
      id: 'donor', sounds: {}, vitals: { hr: 8 }, delay: [8, 15], effect: { compliance: 0.85, shuntAdd: 0.16, rampIn: 40 },
      cues: [{ at: 0, who: 'kollega', text: 'Donorkoordinatoren: «Lungene vurderes for transplantasjon. Vi trenger best mulig blodgass og røntgen om noen timer.»' }, { at: 35, who: 'monitor', text: 'SpO2 har sunket fra 99 til 94 %.' }],
      clues: { lytt: 'Svekket respirasjonslyd basalt på begge sider.', se: 'Tuben står som dokumentert. Brystet hever seg mye ved hver pust.', krets: 'Kretsen er tett. Det ble suget med åpent system i sted.', hold: 'Pplateau 25 cmH2O ved PEEP 5. Vt 750 ml er 9,3 ml/kg idealvekt.', blodgass: 'pH 7,56, PaCO2 3,2 kPa, HCO3 21 mmol/l, PaO2 9,3 kPa på 50 % O2 (PaO2/FiO2 ca. 19 kPa).' },
      fixes: { ...ventFix, rekruttering: { text: 'Legen gjør en rekrutteringsmanøver etter frakoblingen ved apnétesten, og PEEP holdes. Etter en stund …', recover: -1, extra: { shuntAdd: -0.07, compliance: 1.1 }, extraRamp: 30 } },
      followUp: ['rekruttering'], followUpAfter: 30,
      followUpText: 'Respiratoren er justert. Lungene ble frakoblet ved apnétesten. Hva gjør du nå?',
      mechFn: ({ settings }) => ({ compliance: settings.peep >= 8 ? 1.15 : 1, shuntAdd: settings.peep >= 8 ? -0.03 : 0 }),
      harmful: { sedasjon: 'Ikke aktuelt hos en hjernedød pasient.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Nå er målet å bevare lungene: Vt 6–8 ml/kg, PEEP 8–10, normal CO2 og PaO2 rundt 10–13 kPa med lavest mulig O2. Han lager lite CO2 nå som han er kald og hjernedød, så frekvensen kan gå ned.»', mageleie: 'Ikke nå. Først lungebeskyttende innstillinger og rekruttering etter frakoblingen.', sedasjonNed: 'Ikke aktuelt hos en hjernedød pasient.', smertelindring: 'Ikke aktuelt hos en hjernedød pasient.', bittblokk: 'Han biter ikke.', vaeske: 'Legen styrer væsken mot sirkulasjonsmål. Det løser ikke atelektasene.' },
      ventFix: true,
      target: 'Vt 6–8 ml/kg idealvekt (ca. 490–650 ml), PEEP 8–10, PaCO2 4,7–6,0 kPa (35–45 mmHg) med lavere frekvens, PaO2 ≥ 10 kPa med O2 ≤ 50 %.',
      resolve: ({ m, gas, settings }) => m.vtPerKg >= 5.8 && m.vtPerKg <= 8.2 && settings.peep >= 8 && settings.fio2 <= 50 && pao2(gas) >= 10 && paco2(gas) >= 4.6 && paco2(gas) <= 6,
      teach: [
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 9, text: 'Obs: Vt over 9 ml/kg idealvekt og PEEP 5 var den «konvensjonelle» strategien i donorstudien til Mascia. Den ga færre brukbare lunger.' },
        { when: ({ m, settings }) => m.vtPerKg > 0 && m.vtPerKg <= 8 && settings.peep >= 8, text: 'Riktig! Lungebeskyttende ventilasjon av donoren (Vt 6–8 ml/kg, PEEP 8–10, CPAP under apnétesten og lukket sug) økte andelen lunger som kunne transplanteres fra 54 % til 95 % i Mascia-studien (JAMA 2010).' },
        { kind: 'obs', when: ({ gas }) => paco2(gas) < 4.3, text: 'Obs: PaCO2 er lav. Etter hjernedød og nedkjøling lager kroppen mindre CO2, og samme minuttvolum gir hypokapni. Senk frekvensen.' },
        { after: 'juster', when: ({ gas }) => paco2(gas) >= 4.7 && paco2(gas) <= 6, text: 'Riktig! Normal CO2 (PaCO2 35–45 mmHg, pH 7,35–7,45) er målet hos organdonoren (SCCM/ACCP/AOPO 2015).' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Neste apnétest, eller frakobling ved forflytning, bør gjøres med CPAP på respiratoren. Frakobling gir atelektaser som må rekrutteres etterpå (Mascia 2010; SCCM/ACCP/AOPO 2015).' },
      ],
      explanation: 'Etter hjernedød endres målet: organene skal bevares for transplantasjon. Lungene skades lett av store Vt, lav PEEP og frakobling. I Mascia-studien (JAMA 2010) ga en lungebeskyttende strategi (Vt 6–8 ml/kg idealvekt, PEEP 8–10, apnétest på CPAP og lukket sug) langt flere lunger som kunne transplanteres enn konvensjonell ventilasjon (Vt 10–12 ml/kg, PEEP 3–5, apnétest med frakobling). SCCM/ACCP/AOPO 2015 anbefaler i tillegg normal CO2 og pH, og rekruttering etter frakobling. En nedkjølt, hjernedød pasient lager lite CO2, så minuttvolumet fra nevrofasen gir hypokapni; frekvensen må ned.',
    }],
  },
  // ---------------------------------------------------------------- S7
  {
    id: 'v-spesielle-gravid',
    title: 'Gravid i uke 33: lavere CO2-mål og høyere O2-mål',
    vignette: 'Kvinne, 31 år, 168 cm, gravid i uke 33. Influensapneumoni, intubert i dag. Ventileres i DuoPAP med P high 22, PEEP 8, frekvens 18, T high 1,1 s, O2 45 %. Sedert, puster ikke selv. Hun ligger med kile under høyre hofte. Jordmor følger fosterlyden.',
    profileId: 'normal', patient: { height: 168, sex: 'K', compliance: 32, resistance: 12, resistanceExp: 12, effort: { amplitude: 0, rate: 18, duration: 1 } },
    settings: { mode: 'DUOPAP', phigh: 22, peep: 8, rate: 18, timingMode: 'ti', ti: 1.1, psupport: 8, fio2: 45, pramp: 50, pmax: 40 },
    gas: { shunt: 0.2, recruitability: 0.4, vco2: 250, deadspaceMl: 140 }, vitalsBase: { hr: 104, sys: 112, dia: 66, temp: 38.6 },
    variants: [{
      id: 'gravid', sounds: {}, vitals: { hr: 8 }, delay: [8, 15], effect: { shuntAdd: 0.08, rampIn: 40 },
      cues: [{ at: 0, who: 'kollega', text: 'Jordmor: «Fosterlyden er grei, men jeg vil gjerne at mors blodgass ligger innenfor det som er normalt i svangerskapet.»' }, { at: 35, who: 'monitor', text: 'SpO2 er 93 %.' }],
      clues: { lytt: 'Knatrelyder basalt bilateralt, mest høyre side.', se: 'Stor gravid buk. Hun ligger med kile under høyre hofte. Tuben står som dokumentert.', krets: 'Kretsen er tett.', hold: 'Pplateau er ca. 21 cmH2O, nesten lik P high. Drivtrykket er ca. 13 cmH2O, Vt ca. 7 ml/kg idealvekt (420 ml).', blodgass: 'pH 7,30, PaCO2 5,7 kPa, PaO2 9,1 kPa på 45 % O2, HCO3 21 mmol/l (lavt, som normalt i svangerskapet).' },
      fixes: { ...ventFix },
      harmful: { mageleie: 'Ikke indisert, og graviditet var en kontraindikasjon i PROSEVA. Hun har ikke alvorlig ARDS. I tredje trimester krever mageleie spesiell avlastning av buken og fosterovervåking.', sedasjon: 'Hun er allerede sedert; mer sedasjon løser ikke problemet og kan senke blodtrykket og dermed blodstrømmen til morkaken.' },
      neutral: { ...NEUTRAL_BASE, reposisjon: 'Hun ligger allerede med kile under høyre hofte, så livmoren ikke klemmer vena cava. Det er riktig, men løser ikke blodgassen.', lege: 'Legen: «I svangerskapet er normal PaCO2 rundt 4,0–4,3 kPa. 5,5 kPa er for høyt for henne: fosteret skal kvitte seg med CO2 over morkaken. Øk ventilasjonen, men ikke hyperventiler. Hold SpO2 ≥ 95 %.»', vaeske: 'Blodtrykket er greit. Væske endrer ikke blodgassen.' },
      ventFix: true,
      target: 'PaCO2 ca. 4,0–4,3 kPa (30–32 mmHg, svangerskapets normalområde), ikke under 3,7; SpO2 ≥ 95 % og PaO2 ≥ 9,3 kPa (70 mmHg); Vt 6–8 ml/kg idealvekt og P high ≤ 30.',
      resolve: ({ m, gas, settings }) => paco2(gas) >= 3.7 && paco2(gas) <= 4.4 && sat(gas) >= 0.95 && gas.spo2 >= 0.95 && pao2(gas) >= 9.3 && m.vtPerKg <= 8.5 && (settings.mode !== 'DUOPAP' || settings.phigh <= 30),
      teach: [
        { kind: 'obs', when: ({ gas }) => paco2(gas) > 5.2, text: 'Obs: PaCO2 over 5 kPa er normalt for en ikke-gravid, men høyt i svangerskapet. Normal PaCO2 i tredje trimester er ca. 3,7–4,2 kPa (28–32 mmHg), og fosteret er avhengig av en CO2-gradient over morkaken.' },
        { after: 'juster', when: ({ gas }) => paco2(gas) >= 3.7 && paco2(gas) <= 4.4, text: 'Riktig! PaCO2 er nå nær svangerskapets normalområde. Gravide har høyere CO2-produksjon og trenger større minuttvolum enn ellers.' },
        { kind: 'obs', when: ({ gas }) => paco2(gas) < 3.7, text: 'Obs: For mye ventilasjon. Uttalt respiratorisk alkalose kan redusere blodstrømmen i livmoren og forverre fosterets oksygenering. Senk frekvensen litt.' },
        { after: 'juster', when: ({ gas }) => sat(gas) >= 0.95 && gas.spo2 >= 0.95, text: 'Riktig! Hos gravide holdes SpO2 ≥ 95 % og PaO2 ≥ 70 mmHg (9,3 kPa) for å sikre fosterets oksygentilbud (ELSO 2025).' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 8.5, text: 'Obs: Vt over 8 ml/kg idealvekt. Lungebeskyttende Vt gjelder også i svangerskapet; øk heller frekvensen.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Venstre sideleie (kile under høyre hofte) hindrer at livmoren klemmer vena cava og senker blodtrykket. Mageleie var en kontraindikasjon i PROSEVA, men har vært brukt ved alvorlig ARDS i svangerskapet med spesiell avlastning.' },
      ],
      explanation: 'I svangerskapet øker minuttventilasjonen, og normal PaCO2 i tredje trimester er ca. 28–32 mmHg (3,7–4,2 kPa) med kompensatorisk lavere bikarbonat. Fosteret kvitter seg med CO2 over morkaken, så mors PaCO2 bør holdes nær dette nivået: 5,5 kPa er for høyt for henne. Samtidig gir uttalt hyperventilasjon og alkalose redusert blodstrøm i livmoren. Oksygenmålet er høyere enn ellers: SpO2 ≥ 95 % og PaO2 ≥ 70 mmHg (ELSO 2025). Lungebeskyttende Vt (6–8 ml/kg idealvekt) gjelder fortsatt; ventilasjonen økes med frekvensen. Hun skal ligge med venstre sidetilt for å avlaste vena cava. Graviditet var en kontraindikasjon for mageleie i PROSEVA.',
    }],
  },
  // ---------------------------------------------------------------- S8
  {
    id: 'v-spesielle-gbs',
    title: 'Guillain–Barré: full støtte mens svakheten øker',
    vignette: 'Mann, 47 år, 185 cm. Guillain–Barré syndrom, intubert i går da vitalkapasiteten falt til 12 ml/kg. Våken uten sedasjon. Natten gikk fint i APVcmv; i morges ble han lagt over i SPONT med trykkstøtte 8 over PEEP 5, O2 35 %, «for å trene pustemusklene».',
    profileId: 'normal', patient: { height: 185, sex: 'M', compliance: 45, resistance: 12, resistanceExp: 12, effort: { amplitude: 5, rate: 18, duration: 1 } },
    settings: { mode: 'SPONT', psupport: 8, peep: 5, fio2: 35, ets: 25, pramp: 50, trigger: { type: 'flow', value: 2 }, apneaTime: 20, backup: { rate: 12, pcontrol: 15 }, rate: 14, vt: 560, pmax: 40 },
    gas: { shunt: 0.08, recruitability: 0.3, vco2: 200, deadspaceMl: 150 }, vitalsBase: { hr: 92, sys: 134, dia: 76, temp: 37.2 },
    variants: [{
      id: 'gbs-svakhet', sounds: {}, vitals: { hr: 22, sys: 18, dia: 8 }, delay: [8, 15], effect: { effort: { amplitude: 1.5, rate: 34, duration: 0.5 }, shuntAdd: 0.04, rampIn: 60 },
      cues: [{ at: 0, who: 'obs', text: 'Pustene blir raske og små. Han ser engstelig på deg.' }, { at: 45, who: 'monitor', text: 'Respirasjonsfrekvensen er over 30, PetCO2 stiger.' }, { at: 90, who: 'kollega', text: '«Han klarer ikke å løfte armene fra dyna lenger. I går kunne han det.»' }],
      clues: { lytt: 'Svak luftinngang basalt på begge sider.', se: 'Rask, overfladisk pust. Magen trekkes inn når brystet hever seg (paradoks pust). Han er våken, svett, og blunker for å svare.', krets: 'Kretsen er tett.', blodgass: 'pH 7,30, PaCO2 7,0 kPa og stigende, PaO2 11,5 kPa på 35 % O2.' },
      fixes: { ...ventFix },
      // når respiratoren tar arbeidet, hviler han: lav egenfrekvens og svake forsøk
      effortFn: ({ settings }) => (settings.mode !== 'SPONT' ? { amplitude: 1.5, rate: 12, duration: 0.8 } : settings.psupport >= 14 ? { amplitude: 1.5, rate: 26, duration: 0.6 } : null),
      harmful: { sedasjon: 'Skadelig nå: sedasjon demper den lille pustedriven han har igjen, mens han får for lite støtte. Han er våken og redd: snakk med ham og forklar.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Han er fortsatt i progresjonsfasen. Tilbake på kontrollert modus med full støtte: Vt 6–8 ml/kg og nok frekvens. Avvenning starter først når kraften kommer tilbake.»', smertelindring: 'Han nikker: han har brennende smerter i beina, som er vanlig ved GBS. Smertelindring er riktig, men løser ikke pusteproblemet.', sedasjonNed: 'Han får ingen sedasjon.', sug: 'Litt sekret. Hosten er svak; han trenger hjelp med sekretet, men pusten blir ikke bedre av suging.' },
      ventFix: true,
      target: 'Kontrollert modus (APVcmv, PCV+ eller (S)CMV) med Vt 6–8 ml/kg idealvekt (ca. 480–640 ml), frekvens 12–16 så minuttvolumet blir minst 6 l/min og PaCO2 under 6 kPa. PEEP 5–8.',
      resolve: ({ m, gas, settings }) => settings.mode !== 'SPONT' && m.vtPerKg >= 5.8 && m.vtPerKg <= 8.5 && m.expMinVol >= 6 && m.fTotal <= 25 && paco2(gas) <= 6,
      teach: [
        { kind: 'obs', when: ({ m }) => m.fTotal > 30 && m.vtPerKg < 5, text: 'Obs: Rask, overfladisk pust og paradoks bukbevegelse betyr at pustemusklene svikter. Ved GBS kan svakheten øke fra time til time de første ukene.' },
        { when: ({ settings }) => settings.mode !== 'SPONT', text: 'Riktig! Mens svakheten fortsatt øker, skal respiratoren gjøre arbeidet. Kontrollert modus med full støtte hindrer utmattelse og hypoventilasjon.' },
        { kind: 'obs', when: ({ settings }) => settings.mode === 'SPONT' && settings.psupport >= 12, text: 'Obs: Mer trykkstøtte hjelper litt, men han må fortsatt starte hver pust selv med svake muskler. I progresjonsfasen gir kontrollert modus sikrere ventilasjon.' },
        { after: 'juster', when: ({ m }) => m.vtPerKg >= 6 && m.vtPerKg <= 8, text: 'Riktig! Lungene er friske, men lungebeskyttende Vt 6–8 ml/kg idealvekt gjelder fortsatt. Frekvensen settes så minuttvolumet holdes også om han slutter å trigge.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Avvenning ved GBS styres av kraften, ikke av kalenderen: spontanpustetest vurderes først når vitalkapasiteten er over ca. 15 ml/kg eller har steget tydelig, og han har effektiv hoste (Weiss et al. 2025).' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Han er våken, men kan nesten ikke bevege seg. Forklar hva du gjør, avtal tegn for ja og nei, og følg puls og blodtrykk tett: autonom ustabilitet (svingende puls og blodtrykk) rammer 10–20 % i akuttfasen.' },
      ],
      explanation: 'Ved Guillain–Barré syndrom svekkes pustemusklene, ofte over dager. Lungene kan være friske, men musklene klarer ikke å bære pustearbeidet. I SPONT med lav trykkstøtte blir pusten rask og overfladisk, med paradoks bukbevegelse og stigende CO2. «Trening» av musklene i progresjonsfasen fører til utmattelse. Riktig er kontrollert ventilasjon med full støtte: Vt 6–8 ml/kg idealvekt, frekvens som gir tilstrekkelig minuttvolum, og PEEP 5–8 mot atelektaser. Avvenningen starter når kraften er på vei tilbake, vurdert med vitalkapasitet og hoste (Weiss et al., Ann Intensive Care 2025). Sedasjon demper pustedriven og er ikke behandlingen; pasienten er våken og trenger informasjon og smertelindring.',
    }],
  },
  // ---------------------------------------------------------------- S9
  {
    id: 'v-spesielle-hjertekirurgi',
    title: 'Hjertekirurgi: rask avvenning til ekstubasjon',
    vignette: 'Mann, 64 år, 176 cm. Koronar bypass for 3 timer siden. Ventileres i APVcmv med Vt 520 ml, frekvens 12, PEEP 8, O2 50 %. Propofol er slått av. Han er varm (36,9 °C), blør lite (40 ml siste time), og sirkulasjonen er stabil på lav dose noradrenalin.',
    profileId: 'normal', patient: { height: 176, sex: 'M', compliance: 52, resistance: 10, resistanceExp: 10, effort: { amplitude: 0, rate: 12, duration: 1 } },
    settings: { mode: 'APVCMV', vt: 520, rate: 12, peep: 8, fio2: 50, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, trigger: { type: 'flow', value: 2 }, psupport: 10, ets: 25, apneaTime: 20, pmax: 40 },
    gas: { shunt: 0.09, recruitability: 0.3, vco2: 210, deadspaceMl: 160 }, vitalsBase: { hr: 84, sys: 118, dia: 66, temp: 36.9 },
    variants: [{
      id: 'fast-track', sounds: { cough: true }, vitals: { hr: 18, sys: 16, dia: 6 }, delay: [6, 12], effect: { effort: { amplitude: 5, rate: 20, duration: 0.9 }, rampIn: 30 },
      cues: [{ at: 0, who: 'obs', text: 'Han åpner øynene, hoster på tuben og prøver å puste selv.' }, { at: 30, who: 'monitor', text: 'Respirasjonsfrekvensen er 20. PetCO2 faller.' }, { at: 60, who: 'kollega', text: 'Legen: «Han følger oppfordringer. Start avvenning, så ekstuberer vi når kriteriene er oppfylt.»' }],
      clues: { lytt: 'Litt svekket respirasjonslyd venstre basalt, ellers fint.', se: 'Han er våken, følger oppfordringer, klemmer hånden din og løfter hodet. Han hoster godt. Brystet rykker når han trigger.', krets: 'Kretsen er tett.', hold: 'Pplateau 19 cmH2O ved PEEP 8. Compliance ca. 50 ml/cmH2O.', blodgass: 'pH 7,47, PaCO2 4,3 kPa og fallende, PaO2 25 kPa på 50 % O2: mer oksygen enn han trenger.' },
      fixes: { ...ventFix },
      // jo mindre støtte, jo mer jobber han selv (frisk pustedrive)
      effortFn: ({ settings }) => (settings.mode === 'SPONT' ? { amplitude: Math.max(4, 11 - 0.6 * settings.psupport), rate: 16, duration: 0.9 } : { amplitude: 5, rate: 20, duration: 0.9 }),
      harmful: { sedasjon: 'Feil: han er klar for avvenning. Sedasjon forsinker ekstubasjonen og gir flere respiratortimer.', mageleie: 'Kontraindisert: nylig sternotomi (thoraxkirurgi siste 15 dager var kontraindikasjon i PROSEVA), og det er ikke indisert.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Over i SPONT. Trapp ned trykkstøtten og PEEP til 5, og O2 under 35 %. Når han klarer det med god pust og blodgass, ekstuberer vi.»', smertelindring: 'Du gir smertelindring etter ordinasjon. Han blir roligere, men trenger fortsatt å avvennes.', sedasjonNed: 'Propofolen er allerede av.' },
      ventFix: true,
      target: 'SPONT, trykkstøtte trappet ned til under 8 cmH2O over PEEP 5, O2 under 35 %, med Vt ≥ 5,5 ml/kg idealvekt, frekvens ≤ 25 og SpO2 ≥ 94 %. Da er Metodebokens kriterier for ekstubasjon oppfylt.',
      resolve: ({ m, gas, settings }) => settings.mode === 'SPONT' && settings.psupport < 8 && settings.peep <= 5 && settings.fio2 < 35 && sat(gas) >= 0.94 && gas.spo2 >= 0.94 && m.vtPerKg >= 5.5 && m.fTotal <= 25 && paco2(gas) <= 6,
      teach: [
        { kind: 'obs', when: ({ settings, m }) => settings.mode !== 'SPONT' && m.fTotal >= 19, text: 'Obs: Han trigger 20 pust i minuttet i APVcmv, og hver pust gir full Vt. Det gir hyperventilasjon (PaCO2 og PetCO2 faller) og ubehag. Han er klar for spontan modus.' },
        { when: ({ settings }) => settings.mode === 'SPONT', text: 'Riktig! Våken, varm, lite blødning og stabil sirkulasjon: tidlig avvenning og ekstubasjon innen få timer etter hjertekirurgi anbefales (ERAS Cardiac 2019).' },
        { after: 'juster', when: ({ settings }) => settings.mode === 'SPONT' && settings.psupport < 8 && settings.peep <= 5, text: 'Riktig! Metodebokens kriterier før ekstubasjon: FiO2 under 0,35, PEEP ≤ 5, trykkstøtte under 8 over PEEP, han beskytter luftveiene, hoster godt og samarbeider.' },
        { kind: 'obs', when: ({ settings }) => settings.mode === 'SPONT' && settings.psupport === 0 && settings.peep < 5, text: 'Obs: Ikke ta bort PEEP helt. Etter hjertekirurgi er det ofte atelektaser basalt; PEEP 5 holder lungene åpne fram til ekstubasjon.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'I virkeligheten trappes trykkstøtten ned omtrent 2 cmH2O av gangen mens du følger frekvens, Vt, SpO2 og pustemønster (Metodebok, Respiratorbehandling). Her er tiden komprimert.' },
      ],
      explanation: 'Etter ukomplisert hjertekirurgi er målet tidlig ekstubasjon («fast track»), helst innen 6 timer (ERAS Cardiac Society 2019). Forutsetningene er at pasienten er våken og samarbeider, er varm, blør lite og har stabil sirkulasjon. Når han våkner og trigger mange pust i APVcmv, får han full Vt i hver pust og hyperventilerer. Riktig er å gå over til SPONT og trappe ned: trykkstøtte under 8 over PEEP 5 og O2 under 35 %, slik Metodeboken angir før ekstubasjon, mens du følger Vt, frekvens og SpO2. Sedasjon forsinker avvenningen. Mageleie er kontraindisert etter nylig sternotomi.',
    }],
  },
  // ---------------------------------------------------------------- S10
  {
    id: 'v-spesielle-transport',
    title: 'Tilbake fra CT: PEEP-tap og derekruttering',
    vignette: 'Kvinne, 56 år, 165 cm. ARDS etter pneumoni, dag 2. Før CT var innstillingene PCV+: Pcontrol 14 over PEEP 12, frekvens 22, O2 55 %, SpO2 94 %. Under transporten sto transportrespiratoren på PEEP 5 og O2 100 %, og kretsen ble koblet fra ved flytting til og fra CT-bordet. Ved retur ble de samme verdiene lagt inn på C6. Sedert, puster ikke selv.',
    profileId: 'ards', patient: { height: 165, sex: 'K', compliance: 30, resistance: 12, resistanceExp: 12, effort: { amplitude: 0, rate: 22, duration: 1 } },
    settings: { mode: 'PCV', pcontrol: 14, rate: 22, peep: 5, fio2: 100, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, pmax: 40 },
    gas: { shunt: 0.22, recruitability: 0.6, vco2: 210, deadspaceMl: 160 }, vitalsBase: { hr: 98, sys: 116, dia: 64, temp: 38.0 },
    variants: [{
      id: 'peep-tap', sounds: {}, vitals: { hr: 14 }, delay: [8, 15], effect: { compliance: 0.75, shuntAdd: 0.17, rampIn: 50 },
      cues: [{ at: 0, who: 'kollega', text: '«CT gikk greit. Hun desaturerte litt da vi flyttet henne over på bordet.»' }, { at: 30, who: 'monitor', text: 'SpO2 92 % på 100 % O2. Før CT var den 94 % på 55 %.' }, { at: 60, who: 'respirator', text: 'Vt har falt til rundt 300 ml.' }],
      clues: { lytt: 'Svekket respirasjonslyd basalt bilateralt, knatrelyder.', se: 'Tuben står på dokumentert dybde. Brystet beveger seg lite og symmetrisk.', krets: 'Kretsen er tett og riktig koblet. PEEP står på 5, ikke 12 som før CT.', hold: 'Pplateau 19 cmH2O ved PEEP 5. Compliance har falt fra ca. 30 til 22 ml/cmH2O.', blodgass: 'pH 7,29, PaCO2 6,4 kPa og stigende, PaO2 8,1 kPa på 100 % O2 (PaO2/FiO2 ca. 8 kPa).' },
      fixes: { ...ventFix },
      // når PEEP gjenopprettes, åpnes alveolene igjen: compliance opp, shunt ned
      mechFn: ({ settings }) => (settings.peep >= 10 ? { compliance: 1.3, shuntAdd: -0.05 } : { compliance: 1, shuntAdd: 0 }),
      harmful: {},
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «PEEP tilbake til 12 som før CT, så trapper vi ned O2. Samme PEEP skal brukes under transport. Hvis oksygeneringen ikke bedres, vurderer vi en rekrutteringsmanøver.»', rekruttering: 'Legen vil først gjenopprette PEEP 12 og se effekten. Uten PEEP faller alveolene sammen igjen etter en manøver.', mageleie: 'Ikke nå. Oksygeneringen var akseptabel før CT. Gjenopprett PEEP først; vurder mageleie hvis PaO2/FiO2 fortsatt er under 20 kPa etter optimalisering.', koble: 'Kretsen er koblet, men PEEP-en som gikk tapt under transporten er ikke gjenopprettet.' },
      ventFix: true,
      target: 'PEEP tilbake til 12 (nivået før transport, minst 10), O2 trappet ned til ≤ 60 % med SpO2 ≥ 92 %, Vt ≤ 8 ml/kg idealvekt (ca. 460 ml) og drivtrykk ≤ 15 cmH2O.',
      resolve: ({ m, gas, settings }) => settings.peep >= 10 && settings.fio2 <= 60 && sat(gas) >= 0.92 && gas.spo2 >= 0.92 && m.vtPerKg <= 8.2 && m.drivingPressure <= 15.5,
      teach: [
        { kind: 'obs', when: ({ settings }) => settings.peep < 8 && settings.fio2 >= 90, text: 'Obs: 100 % O2 skjuler problemet. PEEP-tap og frakobling gir sammenfalte alveoler, og shunten øker. Oksygen alene åpner dem ikke.' },
        { when: ({ settings }) => settings.peep >= 10, text: 'Riktig! PEEP tilbake på nivået før transporten. Metodeboken sier: samme PEEP ved transport. PEEP over 6 er en kjent risikofaktor for hendelser under transport (Parmentier-Decrucq 2013).' },
        { after: 'juster', when: ({ settings, gas }) => settings.fio2 <= 60 && sat(gas) >= 0.92, text: 'Riktig! Med PEEP gjenopprettet kan O2 trappes ned til PaO2 8–11 kPa. FiO2 over 0,6 i mer enn 1–2 døgn bør unngås (Metodebok, Respiratorbehandling).' },
        { kind: 'obs', when: ({ settings, m }) => settings.pcontrol >= 18 && m.drivingPressure > 15.5, text: 'Obs: Høyere Pcontrol gir større Vt, men drivtrykket blir for høyt. Vt falt fordi lungen ble stivere etter derekrutteringen; gjenopprett PEEP i stedet.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Før neste transport: still transportrespiratoren likt med C6 (PEEP, O2, modus), klem eller koble med lukket system ved flytting, og ta blodgass etter retur.' },
      ],
      explanation: 'En ARDS-lunge med PEEP 12 faller raskt sammen når PEEP tas bort eller kretsen kobles fra. Etter transporten ble PEEP 5 og O2 100 % liggende igjen. Shunten økte, compliance falt (Vt sank i PCV+), og O2 100 % skjulte hvor dårlig oksygeneringen egentlig var (PaO2/FiO2 ca. 8 kPa). Riktig er å gjenopprette PEEP 12 som før transport, så trappe ned O2 mot PaO2 8–11 kPa. Metodeboken (HUS) sier at samme PEEP skal brukes ved transport, og PEEP over 6 var en risikofaktor for hendelser under transport (Parmentier-Decrucq et al., Ann Intensive Care 2013).',
    }],
  },
];
