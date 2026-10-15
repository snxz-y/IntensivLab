import { NEUTRAL_BASE, ventFix, vtOk, sat, pao2, pf, paco2, ardsnetLowPeep, proneFix } from './common.js';

/**
 * Kilder for A2–A10 (se KILDER.md, «Voksencaser: oksygenering, ARDS og mageleie»):
 *  - PROSEVA (Guérin, NEJM 2013;368:2159–68) med tilleggsmateriale og protokoll NCT00527813: kontraindikasjoner
 *    (ICP > 30 mmHg eller CPP < 60, trakealkirurgi eller sternotomi siste 15 dager, middelarterietrykk < 70 mmHg trass
 *    vasopressor m.fl.) og stoppkriterier (PaO2/FiO2 ≥ 150 mmHg med PEEP ≤ 10 og FiO2 ≤ 0,6 i ryggleie minst 4 t etter økten).
 *  - ESICM 2023 (Grasselli, Intensive Care Med 2023;49:727–59): 6.1 og 6.2 ingen anbefaling for høy/lav PEEP-tabell eller
 *    mekanikkstyrt PEEP; mot langvarige høytrykks rekrutteringsmanøvre (≥ 35 cmH2O i ≥ 1 min); 7.1–7.2 mageleie; 9.1 VV-ECMO.
 *  - ATS 2024-oppdatering (Qadir, AJRCCM 2024;209:24–36): høyere PEEP uten rekrutteringsmanøvre ved moderat–alvorlig ARDS.
 *  - ESICM-konsensus hjerneskade (Robba, Intensive Care Med 2020;46:2397–410): PaO2 80–120 mmHg, PaCO2 35–45 mmHg,
 *    ingen anbefaling om mageleie ved betydelig forhøyet ICP. Brain Trauma Foundation 4. utg. (2016): ikke profylaktisk hyperventilering.
 *  - ART (Cavalcanti, JAMA 2017;318:1335–45). Amato (NEJM 2015;372:747–55). HOT-ICU (Schjørring, NEJM 2021;384:1301–11).
 *  - Marcy og Marini (Chest 1991;100:494–504): invers ratio-ventilasjon, ingen utfallsdata, fare for luftfanging og blodtrykksfall.
 *  - ICS/FICM «Guidance for prone positioning in adult critical care» (2019): hode og armer («svømmerstilling») skiftes hver 2.–4. time,
 *    ingen direkte trykk på øynene, tube ikke mot munnvik/lepper, trykkpunkter kontrolleres.
 *  Effektstørrelsene (compliance, shunt, PEEP- og I:E-avhengighet) er pedagogiske valg, UVERIFISERT.
 */

/** Andel av syklustiden som er inspirasjon (0,33 ved I:E 1:2, 0,5 ved 1:1). */
const tiFrac = (s) => (s.timingMode === 'ie' ? s.ie.i / (s.ie.i + s.ie.e) : Math.min(0.9, s.ti / (60 / s.rate)));
/** Lungen åpnes av PEEP opp til et visst nivå, og overstrekkes over det: compliance-faktor med topp ved `best`. */
const peepCompliance = (peep, best = 12) => (peep <= best ? 1 - 0.0075 * (peep - best) ** 2 : 1 - 0.009 * (peep - best) ** 2);

export const ARDS_CASES = [
  // ---------------------------------------------------------------- A1
  {
    id: 'v-ards-mageleie',
    title: 'Alvorlig ARDS: lungebeskyttende ventilasjon, så mageleie',
    vignette: 'Mann, 62 år, 180 cm. Influensapneumoni, intubert for 14 timer siden. Ventileres i APVcmv med Vt 600 ml, frekvens 18, PEEP 8, O2 70 %. Sedert, puster ikke selv.',
    profileId: 'ards', patient: { height: 180, sex: 'M', compliance: 30, resistance: 12, resistanceExp: 12, effort: { amplitude: 0, rate: 16, duration: 1 } },
    settings: { mode: 'APVCMV', vt: 600, rate: 18, peep: 8, fio2: 70, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, pmax: 45 },
    gas: { shunt: 0.38, recruitability: 0.4, vco2: 220, deadspaceMl: 310 }, vitalsBase: { hr: 104, sys: 112, dia: 62, temp: 38.6 },
    variants: [{
      id: 'ards-alvorlig', sounds: {}, vitals: { hr: 12 }, delay: [8, 15], effect: { compliance: 0.8, shuntAdd: 0.08, rampIn: 40 },
      cues: [{ at: 0, who: 'kollega', text: '«Røntgen thorax fra i morges viser bilaterale fortetninger, verre enn i går.»' }, { at: 30, who: 'monitor', text: 'SpO2 siger nedover.' }],
      clues: { lytt: 'Knatrelyder over begge lunger, svekket basalt.', se: 'Pasienten er sedert og rolig. Tuben står på 23 cm. Symmetriske bevegelser.', krets: 'Kretsen er tett.', hold: 'Pplateau er 32 cmH2O ved PEEP 8: drivtrykket er rundt 24 cmH2O.', blodgass: 'pH 7,31, PaCO2 6,1 kPa, PaO2 7,9 kPa på 70 % O2 (PaO2/FiO2 ca. 11 kPa).' },
      fixes: { ...ventFix, mageleie: proneFix({ shuntAdd: -0.2, compliance: 1.1 }) },
      followUp: ['mageleie'], followUpAfter: 40,
      followUpText: 'Respiratoren er lungebeskyttende. PaO2/FiO2 er fortsatt lav. Hva gjør du nå?',
      // moderat PEEP rekrutterer litt (compliance opp); svært høy PEEP overstrekker (compliance ned)
      mechFn: ({ settings }) => ({ compliance: settings.peep >= 12 && settings.peep <= 16 ? 1.12 : settings.peep > 16 ? 0.92 : 1 }),
      harmful: { rekruttering: 'Rekrutteringsmanøver med høyt trykk på Vt 8 ml/kg gir høy risiko for barotraume. ESICM 2023 fraråder langvarige høytrykksmanøvre. Senk Vt og juster PEEP først.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Lungebeskyttende ventilasjon: Vt 6 ml/kg, PEEP etter tabellen, frekvensen opp. Så vurderer vi mageleie.»', vaeske: 'Blodtrykket er greit. Væske bedrer ikke oksygeneringen ved ARDS.' },
      ventFix: true,
      target: 'Vt ca. 6 ml/kg IBW (ca. 450 ml), Pplateau ≤ 30 og drivtrykk helst ≤ 15 cmH2O, PEEP etter ARDSNet-tabellen (O2 70–80 % → PEEP 10–14) og frekvens opp mot 26–30 (pH ≥ 7,20). Er PaO2/FiO2 fortsatt under 20 kPa: mageleie. Trapp deretter O2 ned til ≤ 60 % med PaO2 8–11 kPa.',
      resolve: ({ m, gas, settings, prone }) => prone && m.vtPerKg <= 6.8 && m.pplat <= 30 && settings.fio2 <= 60 && pao2(gas) >= 8 && paco2(gas) <= 9,
      teach: [
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 7 && m.pplat > 28, text: 'Obs: Vt 8 ml/kg i en stiv ARDS-lunge gir høyt platåtrykk og drivtrykk. ARDS ventileres med Vt rundt 6 ml/kg IBW.' },
        { when: ({ m }) => m.vtPerKg > 0 && m.vtPerKg <= 6.5, text: 'Riktig! Vt 6 ml/kg IBW (ARDSNet; ATS/ESICM 2017: 4–8 ml/kg) og Pplateau under 30 cmH2O reduserer volumskade og dødelighet ved ARDS.' },
        { after: 'juster', when: ({ settings }) => settings.peep >= ardsnetLowPeep(settings.fio2), text: 'Riktig! PEEP følger ARDSNet-tabellen: jo høyere FiO2, jo høyere PEEP (FiO2 0,7 → PEEP 10–14, 0,8 → 14).' },
        { when: ({ settings, m }) => settings.rate >= 24 && m.vtPerKg <= 6.5, text: 'Riktig! Høyere frekvens holder minuttvolumet når Vt senkes. PaCO2 kan stige; det aksepteres så lenge pH er over ca. 7,20 (permissiv hyperkapni).' },
        { kind: 'obs', when: ({ m }) => m.pplat > 30, text: 'Obs: Pplateau over 30 cmH2O. Senk Vt (ned mot 4–5 ml/kg om nødvendig) og øk frekvensen.' },
        { kind: 'info', after: 'juster', when: ({ gas, settings, m }) => m.vtPerKg <= 6.8 && settings.fio2 >= 60 && pf(gas, settings) < 20, text: 'PaO2/FiO2 er under 20 kPa (150 mmHg) med FiO2 ≥ 0,6 og PEEP ≥ 5 etter at respiratoren er optimalisert. Det er kriteriet for mageleie (PROSEVA; ESICM 2023, sterk anbefaling).' },
        { after: 'mageleie', when: () => true, text: 'Riktig! Mageleie ved moderat til alvorlig ARDS reduserer dødeligheten (PROSEVA: 28-dagers dødelighet 16 % mot 33 %). Lungen belastes jevnere, ryggsidens alveoler åpnes, og shunten minker. Øktene skal vare minst 16 timer.' },
        { kind: 'info', after: 'mageleie', when: ({ gas, settings }) => settings.fio2 > 60 && pao2(gas) > 10, text: 'Oksygeneringen er bedre. Trapp ned O2 til PaO2 8–11 kPa: høyere PaO2 bedrer ikke vevsoksygeneringen, og FiO2 over 0,6 i mer enn 1–2 døgn bør unngås (Metodebok, Respiratorbehandling).' },
        { kind: 'info', after: 'mageleie', when: () => true, text: 'I mageleie: sjekk tubedybde og kurver etter snuing, beskytt øyne, ansikt og trykkpunkter, og skift armstilling («svømmerstilling») jevnlig. Avbryt ved utilsiktet ekstubasjon, tubeobstruksjon eller alvorlig hemodynamisk ustabilitet (PROSEVA).' },
      ],
      explanation: 'Pasienten har alvorlig ARDS. Vt 600 ml er 8 ml/kg IBW og gir høyt platå- og drivtrykk i en stiv lunge. Første steg er lungebeskyttende ventilasjon: Vt 6 ml/kg IBW, Pplateau ≤ 30, PEEP etter ARDSNet-tabellen og høyere frekvens, med permissiv hyperkapni (pH ≥ 7,20). Når PaO2/FiO2 fortsatt er under 20 kPa (150 mmHg) med FiO2 ≥ 0,6 etter en stabiliseringsperiode, anbefales mageleie i økter på minst 16 timer (ESICM 2023 anbefaling 7.1–7.2; PROSEVA). Mageleie gjør lungebelastningen jevnere og bedrer ventilasjon–perfusjonsforholdet. Kontraindikasjoner i PROSEVA var blant annet ICP over 30 mmHg, massiv hemoptyse, ustabile frakturer i rygg, bekken eller brystkasse, ansikts- eller thoraxkirurgi siste 15 dager og MAP under 70 mmHg trass i vasopressor. Når oksygeneringen bedres, trappes O2 ned til PaO2 8–11 kPa.',
    }],
  },
  // ---------------------------------------------------------------- A2
  {
    id: 'v-ards-hodeskade-icp',
    title: 'ARDS og hodeskade: ICP over 30, ingen permissiv hyperkapni',
    vignette: 'Mann, 28 år, 183 cm. Alvorlig hodeskade etter fall, ICP-måler. Aspirasjonspneumoni og ARDS siden i går. Ventileres i APVcmv med Vt 470 ml (6 ml/kg), frekvens 16, PEEP 8, O2 60 %. I natt fikk PaCO2 stige for å skåne lungene. Dypt sedert, puster ikke selv. ICP har ligget på 18–22 mmHg.',
    profileId: 'ards', patient: { height: 183, sex: 'M', compliance: 32, resistance: 11, resistanceExp: 11, effort: { amplitude: 0, rate: 16, duration: 1 } },
    settings: { mode: 'APVCMV', vt: 470, rate: 16, peep: 8, fio2: 60, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, pmax: 45 },
    gas: { shunt: 0.26, recruitability: 0.4, vco2: 255, deadspaceMl: 200 }, vitalsBase: { hr: 84, sys: 138, dia: 74, temp: 38.2 },
    variants: [{
      id: 'icp-hyperkapni', sounds: {}, vitals: { hr: 6, sys: 14, dia: 6 }, delay: [8, 15], effect: { compliance: 0.85, shuntAdd: 0.08, rampIn: 40 },
      cues: [{ at: 0, who: 'monitor', text: 'ICP stiger: 26 … 29 … 32 mmHg.' }, { at: 20, who: 'kollega', text: '«ICP har ligget over 30 i fem minutter. Pupillene er like og reagerer.»' }, { at: 45, who: 'monitor', text: 'SpO2 siger nedover.' }],
      // moderat PEEP åpner litt lunge (compliance opp)
      mechFn: ({ settings }) => ({ compliance: settings.peep >= 10 && settings.peep <= 14 ? 1.08 : 1 }),
      clues: { lytt: 'Knatrelyder over begge lunger, svekket basalt.', se: 'Hodeenden er hevet 30 grader, hodet ligger i midtstilling og tubebåndet strammer ikke rundt halsen. Tuben står på 24 cm. Symmetriske bevegelser.', krets: 'Kretsen er tett.', hold: 'Pplateau er 25 cmH2O ved PEEP 8: drivtrykket er rundt 17 cmH2O.', blodgass: 'pH 7,27, PaCO2 6,8 kPa, PaO2 8,6 kPa på 60 % O2 (PaO2/FiO2 ca. 14 kPa).' },
      fixes: { ...ventFix },
      harmful: {
        mageleie: 'Skadelig nå: ICP over 30 mmHg var kontraindikasjon for mageleie i PROSEVA, og ESICM-konsensus for hjerneskade (2020) gir ingen anbefaling om mageleie ved betydelig forhøyet ICP. Snuingen og bukleie kan øke ICP ytterligere. Optimaliser respiratoren: normokapni, PEEP og O2.',
        rekruttering: 'Rekrutteringsmanøver med høyt trykk øker trykket i brystet, kan hemme venøst tilbakeløp fra hodet og øke ICP. ESICM-konsensus (2020) gir ingen anbefaling om rekruttering ved forhøyet ICP.',
      },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Ingen permissiv hyperkapni med ICP over 30. PaCO2 ned i nedre del av normalområdet, PaO2 over 10,7 kPa. Vt fortsatt rundt 6 ml/kg og Pplateau ≤ 30. Mageleie er kontraindisert nå.»', sedasjon: 'Han er dypt sedert allerede. Mer sedasjon senker ikke PaCO2.', reposisjon: 'Hodet ligger allerede hevet og i midtstilling. Det er PaCO2 som driver ICP nå.' },
      ventFix: true,
      target: 'PaCO2 4,7–5,3 kPa (normokapni i nedre del, ikke under 4,5), PaO2 ≥ 10,7 kPa (80 mmHg), Vt 6–8 ml/kg IBW og Pplateau ≤ 30. Øk frekvensen (ca. 20–24), og PEEP/O2 etter tabellen (O2 60–70 % → PEEP 10–14) mens du følger ICP og blodtrykk.',
      resolve: ({ m, gas }) => m.vtPerKg <= 8 && m.pplat <= 30 && paco2(gas) >= 4.6 && paco2(gas) <= 5.4 && pao2(gas) >= 10.7,
      teach: [
        { kind: 'obs', when: ({ gas }) => paco2(gas) > 6, text: 'Obs: PaCO2 over 6 kPa utvider hjernens blodkar, øker blodvolumet i hodet og dermed ICP. Permissiv hyperkapni er ikke akseptabelt ved forhøyet ICP. Øk minuttvolumet med frekvensen.' },
        { when: ({ gas, settings, m }) => paco2(gas) >= 4.6 && paco2(gas) <= 5.4 && settings.rate >= 18 && m.vtPerKg <= 8, text: 'Riktig! Normokapni (PaCO2 35–45 mmHg, ca. 4,7–6,0 kPa, ESICM-konsensus 2020) holder blodvolumet i hjernen stabilt. Med ICP over 30 sikter vi mot nedre del av området. Frekvensen er økt, og Vt er fortsatt rundt 6 ml/kg.' },
        { kind: 'obs', when: ({ gas }) => paco2(gas) < 4.5, text: 'Obs: PaCO2 under 4,5 kPa er hyperventilering. Det trekker sammen hjernens blodkar og kan gi iskemi. Profylaktisk hyperventilering anbefales ikke (Brain Trauma Foundation 2016); kortvarig hyperventilering er et nødtiltak etter legens ordinasjon.' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 8.5, text: 'Obs: Vt over 8 ml/kg IBW. Øk heller frekvensen enn tidevolumet for å senke PaCO2, så lungen ikke overstrekkes.' },
        { after: 'juster', when: ({ gas, settings }) => pao2(gas) >= 10.7 && settings.peep >= 10, text: 'Riktig! PaO2 80–120 mmHg (10,7–16 kPa) anbefales ved hjerneskade (ESICM 2020). PEEP økes trinnvis mens du følger ICP og middelarterietrykk: så lenge ICP ikke stiger med PEEP, brukes samme PEEP som hos andre pasienter.' },
        { kind: 'info', after: 'juster', when: ({ gas, settings }) => pf(gas, settings) < 20, text: 'PaO2/FiO2 er under 20 kPa, men mageleie er kontraindisert så lenge ICP er over 30 mmHg (PROSEVA). Når ICP er under kontroll, kan mageleie vurderes (ESICM 2020).' },
      ],
      explanation: 'Hos en pasient med ARDS og alvorlig hodeskade krasjer to mål. Lungebeskyttende ventilasjon med lav Vt gir ofte høyere PaCO2, men CO2 utvider hjernens blodkar og øker ICP. Ved ICP over 30 mmHg er permissiv hyperkapni ikke akseptabelt: hold Vt rundt 6 ml/kg og Pplateau ≤ 30, men øk frekvensen til normokapni i nedre del av området (ESICM-konsensus 2020: PaCO2 35–45 mmHg, PaO2 80–120 mmHg). Unngå hyperventilering under 4,5 kPa uten ordinasjon (Brain Trauma Foundation 2016). PEEP økes trinnvis med ICP og blodtrykk under oppsikt. Mageleie er kontraindisert ved ICP over 30 mmHg eller CPP under 60 mmHg (PROSEVA), og ESICM 2020 gir ingen anbefaling om mageleie ved betydelig forhøyet ICP. Sykepleie: hodeende 30 grader, hodet i midtstilling og tubebånd som ikke strammer rundt halsen.',
    }],
  },
  // ---------------------------------------------------------------- A3
  {
    id: 'v-ards-moderat-ikke-mageleie',
    title: 'Moderat ARDS i DuoPAP: optimaliser før du vurderer mageleie',
    vignette: 'Kvinne, 57 år, 168 cm. Pneumoni, intubert i natt, moderat ARDS. Lett sedert og puster litt selv i DuoPAP: P high 17, PEEP 5, frekvens 14, T high 1,4 s, trykkstøtte 8, O2 60 %. Kollegaen din spør om dere skal legge henne i mageleie.',
    profileId: 'ards', patient: { height: 168, sex: 'K', compliance: 34, resistance: 10, resistanceExp: 10, effort: { amplitude: 3, rate: 16, duration: 0.9 } },
    settings: { mode: 'DUOPAP', phigh: 17, peep: 5, rate: 14, timingMode: 'ti', ti: 1.4, psupport: 8, pramp: 50, ets: 25, fio2: 60, trigger: { type: 'flow', value: 2 }, pmax: 40 },
    gas: { shunt: 0.24, recruitability: 0.65, vco2: 200, deadspaceMl: 150 }, vitalsBase: { hr: 96, sys: 124, dia: 68, temp: 38.3 },
    variants: [{
      id: 'pf-over-20', sounds: {}, vitals: { hr: 8 }, delay: [8, 15], effect: { shuntAdd: 0.05, rampIn: 30 },
      cues: [{ at: 0, who: 'kollega', text: '«PaO2/FiO2 er 15 kPa. Skal vi snu henne til mageleie?»' }, { at: 30, who: 'monitor', text: 'SpO2 ligger på 93–94 %.' }],
      clues: { lytt: 'Knatrelyder basalt på begge sider.', se: 'Hun ligger rolig, puster litt selv mellom de mekaniske pustene. Tuben står på 22 cm.', krets: 'Kretsen er tett.', hold: 'Drivtrykket (P high − PEEP) er 12 cmH2O. Lungen er stiv, men ikke ekstrem.', blodgass: 'pH 7,37, PaCO2 5,5 kPa, PaO2 8,9 kPa på 60 % O2 (PaO2/FiO2 ca. 15 kPa) med PEEP 5.' },
      fixes: { ...ventFix },
      harmful: {},
      neutral: {
        ...NEUTRAL_BASE,
        mageleie: 'Ikke ennå. Mageleie anbefales når PaO2/FiO2 er under 20 kPa (150 mmHg) etter at respiratoren er optimalisert, med lavt Vt og justert PEEP, og etter en stabiliseringsperiode (ESICM 2023 anbefaling 7.1–7.2; PROSEVA bekreftet kriteriet etter 12–24 timer). Hun står på PEEP 5 med O2 60 %. Optimaliser PEEP først og ta ny blodgass.',
        lege: 'Legen: «PEEP 5 er for lavt for O2 60 %. Øk PEEP etter tabellen og løft P high like mye, så drivtrykket blir det samme. Så tar vi ny blodgass før vi bestemmer oss for mageleie.»',
      },
      ventFix: true,
      target: 'PEEP etter tabellen (O2 60 % → PEEP 10), P high løftet tilsvarende (P high − PEEP ca. 12, Vt 6–8 ml/kg IBW), deretter O2 ned til ≤ 50 % med PaO2 8–11 kPa. Er PaO2/FiO2 da over 20 kPa, er mageleie ikke indisert.',
      resolve: ({ m, gas, settings }) => settings.peep >= 10 && settings.phigh - settings.peep >= 10 && settings.phigh <= 30 && settings.fio2 <= 50 && pao2(gas) >= 8 && pao2(gas) <= 11.5 && pf(gas, settings) >= 20 && paco2(gas) <= 6.5 && m.vtPerKg <= 8.5,
      teach: [
        { when: ({ settings }) => settings.peep >= ardsnetLowPeep(settings.fio2) && settings.peep >= 8, text: 'Riktig! PEEP følger ARDSNet-tabellen: O2 60 % → PEEP 10. Høyere PEEP åpner sammenfalte alveoler og minsker shunten, så samme O2 gir høyere PaO2.' },
        { kind: 'obs', when: ({ settings }) => settings.phigh - settings.peep < 9, text: 'Obs: I DuoPAP er P high et absolutt trykk. Øker du PEEP uten å løfte P high, krymper trykkforskjellen, og tidevolumet faller. Løft P high like mye som PEEP.' },
        { when: ({ settings }) => settings.peep >= 10 && settings.phigh - settings.peep >= 10, text: 'Riktig! P high er løftet like mye som PEEP, så trykkforskjellen og tidevolumet er det samme som før.' },
        { kind: 'info', after: 'juster', when: ({ gas, settings }) => settings.peep >= 10 && pf(gas, settings) >= 20, text: 'PaO2/FiO2 er nå over 20 kPa (150 mmHg) med optimalisert PEEP. Da er kriteriet for mageleie ikke oppfylt (ESICM 2023 anbefaling 7.1). Trapp ned O2 og ta ny blodgass. Faller PaO2/FiO2 under 20 kPa igjen etter en stabiliseringsperiode, vurderes mageleie på nytt.' },
        { when: ({ gas, settings }) => settings.fio2 <= 50 && pao2(gas) >= 8 && pao2(gas) <= 11.5, text: 'Riktig! O2 er trappet ned til PaO2 8–11 kPa (Metodebok, Respiratorbehandling). Mindre O2 gir mindre risiko for oksygenskade.' },
        { kind: 'obs', when: ({ gas }) => pao2(gas) < 7.5, text: 'Obs: PaO2 under 7,5 kPa. Øk O2 litt igjen, eller sjekk at PEEP er høy nok.' },
      ],
      explanation: 'PaO2/FiO2 på 14 kPa med PEEP 5 og O2 60 % er ikke et mageleiekriterium i seg selv. ESICM 2023 (anbefaling 7.1–7.2) anbefaler mageleie ved PaO2/FiO2 under 150 mmHg (20 kPa) med PEEP ≥ 5 tross optimaliserte innstillinger, etter en stabiliseringsperiode med lavt Vt og justert PEEP. I PROSEVA ble kriteriet bekreftet etter 12–24 timer. Her var PEEP for lav for O2-nivået: etter ARDSNet-tabellen gir O2 60 % PEEP 10. I DuoPAP er P high et absolutt trykk, så P high må løftes like mye som PEEP for å holde tidevolumet. Med PEEP 10 åpnes lungen, PaO2/FiO2 stiger over 20 kPa, og O2 kan trappes ned til PaO2 8–11 kPa. Da er mageleie ikke indisert nå, men følg blodgassene.',
    }],
  },
  // ---------------------------------------------------------------- A4
  {
    id: 'v-ards-tilbake-ryggleie',
    title: 'Tilbake i ryggleie etter mageleie: trapp ned O2 og PEEP',
    vignette: 'Mann, 66 år, 175 cm. ARDS etter aspirasjon, dag 4. Han lå 17 timer i mageleie og ble snudd tilbake til ryggleie for fire timer siden. Ventileres i PCV+ med samme innstillinger som i mageleie: Pcontrol 14 over PEEP 14, frekvens 24, O2 70 %. Sedert, puster ikke selv. SpO2 100 %.',
    profileId: 'ards', patient: { height: 175, sex: 'M', compliance: 32, resistance: 11, resistanceExp: 11, effort: { amplitude: 0, rate: 16, duration: 1 } },
    settings: { mode: 'PCV', pcontrol: 14, peep: 14, rate: 24, fio2: 70, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 75, pmax: 40 },
    gas: { shunt: 0.29, recruitability: 0.4, vco2: 240, deadspaceMl: 190 }, vitalsBase: { hr: 82, sys: 128, dia: 66, temp: 37.4 },
    variants: [{
      id: 'stoppkriterier', sounds: {}, vitals: {}, delay: [8, 15], effect: { shuntAdd: -0.02, rampIn: 20 },
      cues: [{ at: 0, who: 'kollega', text: '«Blodgassen fire timer etter snuingen er klar. Han har det fint, SpO2 100 %.»' }, { at: 30, who: 'kollega', text: '«Skal vi snu ham tilbake på magen i kveld, som planlagt?»' }],
      clues: { lytt: 'Bedre luftinngang basalt enn i går. Litt knatrelyder bak.', se: 'Han ligger i ryggleie med hodeenden hevet. Du ser trykkmerker i pannen og over kinnbeina etter mageleiet, men ingen åpne sår. Øynene er lukket og fuktet, og hornhinnene er klare. Tuben står på 23 cm, som før snuingen. EKG-elektrodene er flyttet tilbake til brystet.', krets: 'Kretsen er tett.', hold: 'Pplateau 27 cmH2O ved PEEP 14, drivtrykk 13.', blodgass: 'pH 7,39, PaCO2 5,5 kPa, PaO2 19 kPa på 70 % O2 (PaO2/FiO2 ca. 27 kPa).' },
      fixes: { ...ventFix },
      harmful: {},
      neutral: {
        ...NEUTRAL_BASE,
        mageleie: 'Ikke nå. PaO2 er 19 kPa på 70 % O2. Trapp ned O2 og PEEP først. Holder PaO2/FiO2 seg ≥ 20 kPa (150 mmHg) med PEEP ≤ 10 og FiO2 ≤ 0,6 i ryggleie minst fire timer etter økten, avsluttes mageleiebehandlingen (PROSEVA).',
        lege: 'Legen: «Han er mye bedre. Trapp ned O2 til PaO2 8–11 kPa og PEEP etter tabellen. Holder P/F seg over 20 kPa med PEEP ≤ 10 og O2 ≤ 60 %, er det ikke flere mageleieøkter.»',
        rekruttering: 'Ikke indisert: lungen er åpen nå og oksygeneringen er god.',
      },
      ventFix: true,
      target: 'O2 ned til PaO2 8–11 kPa (ca. 40–50 %), PEEP trinnvis ned etter tabellen (O2 40–50 % → PEEP 5–10), PEEP ≤ 10. Sjekk at PaO2/FiO2 er ≥ 20 kPa med PEEP ≤ 10 og FiO2 ≤ 0,6: da er PROSEVA-kriteriet for å avslutte mageleie oppfylt.',
      resolve: ({ m, gas, settings }) => settings.fio2 <= 50 && settings.peep <= 10 && settings.peep >= ardsnetLowPeep(settings.fio2) && pao2(gas) >= 8 && pao2(gas) <= 11.5 && pf(gas, settings) >= 20 && m.vtPerKg <= 8.2,
      teach: [
        { kind: 'obs', when: ({ gas, settings }) => settings.fio2 >= 60 && pao2(gas) > 14, text: 'Obs: PaO2 over 14 kPa på høy O2. Høyere PaO2 gir nesten ikke mer oksygen i blodet. Trapp ned O2 til PaO2 8–11 kPa (Metodebok, Respiratorbehandling).' },
        { when: ({ gas, settings }) => settings.fio2 <= 50 && pao2(gas) >= 8 && pao2(gas) <= 11.5, text: 'Riktig! O2 er trappet ned til PaO2 8–11 kPa. FiO2 over 0,6 i mer enn 1–2 døgn bør unngås (Metodebok, Respiratorbehandling).' },
        { when: ({ settings }) => settings.peep <= 10 && settings.peep >= ardsnetLowPeep(settings.fio2), text: 'Riktig! PEEP er trappet ned etter tabellen (O2 40 % → PEEP 5–8, 50 % → 8–10). Trapp ned trinnvis og følg SpO2: faller metningen, går du tilbake til forrige nivå.' },
        { kind: 'obs', when: ({ settings }) => settings.peep < ardsnetLowPeep(settings.fio2), text: 'Obs: PEEP er lavere enn tabellen for denne O2-en. Trapp ned O2 først, deretter PEEP.' },
        { kind: 'info', after: 'juster', when: ({ gas, settings }) => settings.peep <= 10 && settings.fio2 <= 60 && pf(gas, settings) >= 20, text: 'PaO2/FiO2 er ≥ 20 kPa (150 mmHg) med PEEP ≤ 10 og FiO2 ≤ 0,6, målt i ryggleie minst fire timer etter økten. Det er PROSEVA-kriteriet for å avslutte mageleie. Ny økt er ikke indisert, men følg blodgassene: faller P/F igjen, kan mageleie vurderes på nytt.' },
        { kind: 'obs', when: ({ gas }) => pao2(gas) < 7.5, text: 'Obs: PaO2 under 7,5 kPa. Du har trappet ned for raskt. Gå et steg tilbake på O2 eller PEEP.' },
      ],
      explanation: 'Etter en mageleieøkt vurderes pasienten i ryggleie. I PROSEVA ble mageleie avsluttet når PaO2/FiO2 var ≥ 150 mmHg (20 kPa) med PEEP ≤ 10 og FiO2 ≤ 0,6, målt i ryggleie minst fire timer etter siste økt. Med PEEP 14 og O2 70 % kan du ikke vite om kriteriet er oppfylt: trapp først ned O2 til PaO2 8–11 kPa, deretter PEEP trinnvis etter ARDSNet-tabellen. Holder P/F seg over 20 kPa, er det ikke indikasjon for ny økt. Andre grunner til å stoppe i PROSEVA var P/F-fall over 20 % mot ryggleie før to påfølgende økter, og komplikasjoner som utilsiktet ekstubasjon, tubeobstruksjon, hemoptyse og alvorlig hypoksemi, bradykardi eller hypotensjon. Etter mageleie: se etter trykksår i ansikt, på bryst, knær og hofter, sjekk øyne og hornhinner, tubedybde og at EKG-elektrodene er tilbake på brystet.',
    }],
  },
  // ---------------------------------------------------------------- A5
  {
    id: 'v-ards-sternotomi-sirkulasjon',
    title: 'Alvorlig ARDS etter hjertekirurgi: mageleie er kontraindisert',
    vignette: 'Kvinne, 71 år, 162 cm. Aortaklaffoperasjon med sternotomi for fire dager siden, nå pneumoni og alvorlig ARDS. Ventileres i APVcmv med Vt 520 ml, frekvens 16, PEEP 6, O2 80 %. Noradrenalin 0,25 µg/kg/min, middelarterietrykk rundt 62 mmHg. Sedert, puster ikke selv.',
    profileId: 'ards', patient: { height: 162, sex: 'K', compliance: 24, resistance: 12, resistanceExp: 12, effort: { amplitude: 0, rate: 16, duration: 1 } },
    settings: { mode: 'APVCMV', vt: 520, rate: 16, peep: 6, fio2: 80, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, pmax: 45 },
    gas: { shunt: 0.34, recruitability: 0.4, vco2: 265, deadspaceMl: 170 }, vitalsBase: { hr: 112, sys: 86, dia: 50, temp: 38.4 },
    variants: [{
      id: 'sternotomi-map', sounds: {}, vitals: { hr: 8, sys: -2 }, delay: [8, 15], effect: { compliance: 0.85, shuntAdd: 0.06, rampIn: 40 },
      cues: [{ at: 0, who: 'monitor', text: 'SpO2 faller mot 90 %.' }, { at: 25, who: 'kollega', text: '«PaO2/FiO2 er rundt 9,5 kPa. Bør vi snu henne til mageleie?»' }],
      // blodtrykket faller når PEEP økes over 12 (redusert venøst tilbakeløp hos en pasient på vasopressor)
      vitalsFn: ({ settings }) => { const x = Math.max(0, settings.peep - 12); return { sys: -4 * x, dia: -2 * x, hr: 2 * x }; },
      clues: { lytt: 'Knatrelyder over begge lunger.', se: 'Sternotomisåret er tørt og dekket. To mediastinaldren. Hun er blek og perifert kald. Tuben står på 21 cm.', krets: 'Kretsen er tett.', hold: 'Pplateau 31 cmH2O ved PEEP 6: drivtrykket er rundt 25 cmH2O.', blodgass: 'pH 7,32, PaCO2 5,5 kPa, PaO2 7,6 kPa på 80 % O2 (PaO2/FiO2 ca. 9,5 kPa). Laktat 3,2.' },
      fixes: { ...ventFix },
      harmful: {
        mageleie: 'Kontraindisert nå. Sternotomi siste 15 dager og middelarterietrykk under 70 mmHg trass vasopressor var begge kontraindikasjoner for mageleie i PROSEVA. Snuingen kan gi blødning, sårruptur og sirkulasjonskollaps. Optimaliser respiratoren og drøft andre tiltak med legen.',
        rekruttering: 'Rekrutteringsmanøver med høyt trykk hos en pasient med middelarterietrykk 62 på noradrenalin kan gi alvorlig blodtrykksfall. ESICM 2023 fraråder langvarige høytrykksmanøvre.',
      },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Mageleie er kontraindisert. Lungebeskyttende ventilasjon: Vt 6 ml/kg, frekvensen opp, PEEP forsiktig opp mens vi følger blodtrykket. Holder PaO2/FiO2 seg svært lav, drøfter vi VV-ECMO med ECMO-senteret.»', vaeske: 'Legen gir et lite væskestøt, men vil ikke gi mer: væske forverrer lungeødemet. Respiratoren må justeres.' },
      ventFix: true,
      target: 'Vt ca. 6 ml/kg IBW (ca. 330 ml), Pplateau ≤ 30, frekvens 24–30 (PaCO2 under ca. 8 kPa), PEEP trinnvis opp til 10–12 med blodtrykket under oppsikt, O2 slik at PaO2 er minst 7,5 kPa (SpO2 88–95 %).',
      resolve: ({ m, gas, settings }) => m.vtPerKg <= 6.8 && m.pplat <= 30 && settings.rate >= 24 && settings.peep >= 10 && settings.peep <= 14 && pao2(gas) >= 7.5 && paco2(gas) <= 8,
      teach: [
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 8 && m.pplat > 28, text: 'Obs: Vt 520 ml er over 9 ml/kg IBW for en kvinne på 162 cm (IBW ca. 55 kg). Det gir høyt platå- og drivtrykk.' },
        { when: ({ m }) => m.vtPerKg > 0 && m.vtPerKg <= 6.5, text: 'Riktig! Vt 6 ml/kg IBW (ca. 330 ml) og Pplateau ≤ 30 er grunnmuren ved ARDS (ARDSNet; ATS/ESICM).' },
        { when: ({ settings, m }) => settings.rate >= 24 && m.vtPerKg <= 6.8, text: 'Riktig! Frekvensen er økt så minuttvolumet holdes når Vt senkes. Moderat hyperkapni aksepteres så lenge pH er over ca. 7,20.' },
        { after: 'juster', when: ({ settings }) => settings.peep >= 10 && settings.peep <= 12, text: 'Riktig! PEEP er økt trinnvis til 10–12. Tabellen sier mer ved O2 80 %, men hos en pasient med lavt blodtrykk på vasopressor må PEEP avveies mot sirkulasjonen: høyere trykk i brystet reduserer venøst tilbakeløp.' },
        { kind: 'obs', when: ({ settings }) => settings.peep > 12, text: 'Obs: Blodtrykket faller når PEEP går over 12. Høyt trykk i brystet hemmer venøst tilbakeløp. Gå tilbake til PEEP 10–12 og drøft sirkulasjonen med legen.' },
        { kind: 'info', after: 'juster', when: ({ gas, settings }) => pf(gas, settings) < 13.3, text: 'PaO2/FiO2 er fortsatt svært lav. Mageleie er kontraindisert her (sternotomi siste 15 dager og middelarterietrykk under 70 trass vasopressor, PROSEVA). Ved vedvarende alvorlig hypoksemi anbefaler ESICM 2023 VV-ECMO i et ECMO-senter etter EOLIA-kriteriene (anbefaling 9.1). Det er legens vurdering.' },
      ],
      explanation: 'Pasienten har alvorlig ARDS og trenger lungebeskyttende ventilasjon: Vt 6 ml/kg IBW, Pplateau ≤ 30 og høyere frekvens. Mageleie ville vært neste steg, men hun har to kontraindikasjoner fra PROSEVA: sternotomi siste 15 dager og middelarterietrykk under 70 mmHg trass vasopressor. PEEP økes forsiktig: høyere trykk i brystet bedrer oksygeneringen, men reduserer venøst tilbakeløp og blodtrykk hos en sirkulatorisk ustabil pasient. Godta SpO2 88–95 % (ARDSNet) og moderat hyperkapni. Rekrutteringsmanøver med høyt trykk frarådes (ESICM 2023). Ved vedvarende alvorlig hypoksemi vurderer legen VV-ECMO i et ECMO-senter (ESICM 2023 anbefaling 9.1).',
    }],
  },
  // ---------------------------------------------------------------- A6
  {
    id: 'v-ards-overvekt-ibw',
    title: 'Kort og overvektig: Vt etter idealvekt, ikke faktisk vekt',
    vignette: 'Kvinne, 48 år, 155 cm, 118 kg. Pneumoni og ARDS, intubert i akuttmottaket. Ventileres i (S)CMV med Vt 560 ml («hun er stor»), frekvens 16, PEEP 8, pause 10 %, O2 50 %. Pasientdataene på respiratoren ble ikke endret ved oppstart. Sedert, puster ikke selv.',
    profileId: 'ards', patient: { height: 175, sex: 'M', compliance: 30, resistance: 12, resistanceExp: 12, effort: { amplitude: 0, rate: 16, duration: 1 } },
    settings: { mode: 'SCMV', vt: 560, rate: 16, peep: 8, tip: 10, flowPattern: 'square', fio2: 50, timingMode: 'ie', ie: { i: 1, e: 2 }, pmax: 50 },
    gas: { shunt: 0.22, recruitability: 0.5, vco2: 300, deadspaceMl: 120 }, vitalsBase: { hr: 98, sys: 146, dia: 84, temp: 38.1 },
    variants: [{
      id: 'feil-ibw', sounds: {}, vitals: { hr: 6 }, delay: [8, 15], effect: { compliance: 0.85, shuntAdd: 0.05, rampIn: 40 },
      cues: [{ at: 0, who: 'respirator', text: 'Pplateau kryper oppover mot 30.' }, { at: 30, who: 'kollega', text: '«Det står 7,9 ml/kg på skjermen. Det er vel greit?»' }],
      clues: { lytt: 'Svake respirasjonslyder basalt, knatrelyder.', se: 'Hun er kort og har stor buk. Under Dynamic Lung står det «Mann, 175 cm, IBW 71 kg». Tuben står på 21 cm.', krets: 'Kretsen er tett.', hold: 'Pplateau 30 cmH2O ved PEEP 8: drivtrykket er 22 cmH2O.', blodgass: 'pH 7,41, PaCO2 4,9 kPa, PaO2 10,1 kPa på 50 % O2.' },
      fixes: { ...ventFix },
      harmful: { rekruttering: 'Rekrutteringsmanøver på toppen av Vt 11–12 ml/kg IBW gir enda høyere trykk i en overstrukket lunge.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Legg inn riktig kjønn og høyde først. Vt settes etter idealvekt, ikke etter faktisk vekt: 6 ml/kg IBW.»', reposisjon: 'Hun ligger allerede med hevet hodeende. Det endrer ikke tidevolumet.' },
      ventFix: true,
      target: 'Riktig pasientdata (kvinne, 155 cm, IBW ca. 48 kg), Vt ca. 6 ml/kg IBW (ca. 290 ml), frekvens opp til 26–30 og Pplateau ≤ 30 cmH2O. Moderat hyperkapni aksepteres (pH ≥ 7,20).',
      resolve: ({ m, gas, settings, patient }) => patient && patient.sex === 'K' && patient.height >= 150 && patient.height <= 160 && m.vtPerKg >= 5.5 && m.vtPerKg <= 7 && m.pplat <= 30 && settings.rate >= 22 && paco2(gas) <= 8.5,
      teach: [
        { kind: 'obs', after: 'juster', when: ({ patient, settings }) => patient && patient.sex === 'M' && settings.vt <= 480, text: 'Obs: Respiratoren regner ml/kg ut fra kjønn og høyde. Står det fortsatt «Mann, 175 cm», er Vt/kg på skjermen feil. Sjekk pasientdataene mot pasienten i sengen før du stoler på tallet.' },
        { when: ({ patient }) => patient && patient.sex === 'K' && patient.height >= 150 && patient.height <= 160, text: 'Riktig! Kvinne, 155 cm gir IBW ca. 48 kg. Vt 560 ml er da over 11 ml/kg IBW, ikke 7,9 som skjermen viste. Alt som regnes per kilo bygger på disse dataene.' },
        { when: ({ patient, m }) => patient && patient.sex === 'K' && m.vtPerKg >= 5.5 && m.vtPerKg <= 6.8, text: 'Riktig! Vt settes etter idealvekt (predikert kroppsvekt) fra kjønn og høyde, ikke etter faktisk vekt. Lungene vokser ikke med kroppsvekten. 6 ml/kg IBW er ca. 290 ml.' },
        { when: ({ settings, m, patient }) => patient && patient.sex === 'K' && settings.rate >= 24 && m.vtPerKg <= 7, text: 'Riktig! Frekvensen er økt så minuttvolumet holdes. PaCO2 stiger litt; det aksepteres så lenge pH er over ca. 7,20.' },
        { kind: 'info', when: ({ patient, m }) => patient && patient.sex === 'K' && m.vtPerKg <= 7, text: 'Ved alvorlig fedme bidrar en tung brystvegg og buk til platåtrykket, og basale atelektaser er vanlige. Vt settes likevel etter IBW. Hodeende hevet og PEEP etter tabellen hjelper; legen kan vurdere mer.' },
      ],
      explanation: 'Pasientdataene på respiratoren sto på «mann, 175 cm» (IBW 71 kg), så Vt 560 ml så ut som 7,9 ml/kg. For en kvinne på 155 cm er IBW ca. 48 kg, og Vt 560 ml er over 11 ml/kg. Tidevolum ved ARDS settes etter predikert kroppsvekt fra kjønn og høyde (ARDSNet 2000; ATS/ESICM 2017: 4–8 ml/kg PBW, Pplateau < 30), aldri etter faktisk vekt: lungene er like store som hos en slank kvinne på samme høyde. Legg inn riktig kjønn og høyde (Kontroller › Pasient), sett Vt ca. 6 ml/kg IBW og øk frekvensen. Den lokale metodeboka for Hamilton C6 sier at voksne legges inn med kjønn og høyde, som gir IBW.',
    }],
  },
  // ---------------------------------------------------------------- A7
  {
    id: 'v-ards-peep-drivtrykk',
    title: 'PEEP-titrering etter drivtrykket',
    vignette: 'Mann, 55 år, 178 cm. Moderat ARDS etter pankreatitt, dag 2. Ventileres i (S)CMV med Vt 440 ml (6 ml/kg), frekvens 24, PEEP 6, pause 10 %, O2 60 %. Sedert, puster ikke selv. Legen ber deg finne PEEP-nivået med lavest drivtrykk.',
    profileId: 'ards', patient: { height: 178, sex: 'M', compliance: 34, resistance: 10, resistanceExp: 10, effort: { amplitude: 0, rate: 16, duration: 1 } },
    settings: { mode: 'SCMV', vt: 440, rate: 24, peep: 6, tip: 10, flowPattern: 'square', fio2: 60, timingMode: 'ie', ie: { i: 1, e: 2 }, pmax: 50 },
    gas: { shunt: 0.28, recruitability: 0.5, vco2: 280, deadspaceMl: 190 }, vitalsBase: { hr: 98, sys: 122, dia: 66, temp: 38.0 },
    variants: [{
      id: 'drivtrykk', sounds: {}, vitals: { hr: 8 }, delay: [8, 15], effect: { compliance: 0.92, shuntAdd: 0.05, rampIn: 30 },
      cues: [{ at: 0, who: 'kollega', text: '«Jeg måtte koble fra for å suge. Det kom mye sekret.»' }, { at: 25, who: 'monitor', text: 'SpO2 faller til 93 %.' }],
      // compliance er best rundt PEEP 12: lavere PEEP gir sammenfall, høyere gir overstrekking
      mechFn: ({ settings }) => ({ compliance: peepCompliance(settings.peep, 12) }),
      vitalsFn: ({ settings }) => { const x = Math.max(0, settings.peep - 14); return { sys: -3 * x, dia: -1 * x, hr: 2 * x }; },
      clues: { lytt: 'Svekket respirasjonslyd basalt bilateralt.', se: 'Han ligger rolig. Tuben står på 23 cm. Brystet beveger seg symmetrisk.', krets: 'Kretsen er tett. Den lukkede sugen var ikke i bruk.', hold: 'Pplateau 25 cmH2O ved PEEP 6: drivtrykket er 19 cmH2O. Compliance ca. 23 ml/cmH2O.', blodgass: 'pH 7,36, PaCO2 5,4 kPa, PaO2 8,4 kPa på 60 % O2.' },
      fixes: { ...ventFix },
      harmful: { rekruttering: 'Langvarig rekrutteringsmanøver med høyt trykk (≥ 35 cmH2O i minst ett minutt) frarådes (ESICM 2023, ATS 2024). I ART-studien (2017) økte dødeligheten med rekrutteringsmanøver og compliance-titrert PEEP. Titrer heller PEEP trinnvis med samme Vt.' },
      neutral: { ...NEUTRAL_BASE, mageleie: 'Ikke nå. PEEP er ikke optimalisert ennå. Mageleie vurderes når PaO2/FiO2 fortsatt er under 20 kPa etter at PEEP og Vt er justert (ESICM 2023 anbefaling 7.1).', lege: 'Legen: «Øk PEEP 2 cmH2O om gangen med samme Vt. Les av Pplateau og regn drivtrykket for hvert nivå. Velg PEEP der drivtrykket er lavest, og pass på at Pplateau holder seg ≤ 30.»', sug: 'Du suger med lukket sug. Litt sekret, men lungen har klappet sammen og må åpnes med PEEP.' },
      ventFix: true,
      target: 'Samme Vt (6 ml/kg). Øk PEEP trinnvis og finn nivået med lavest drivtrykk (Pplateau − PEEP), helst ≤ 15 cmH2O, med Pplateau ≤ 30 og SpO2 ≥ 90 %. Unngå PEEP så høy at drivtrykket stiger igjen.',
      resolve: ({ m, gas, settings }) => settings.peep >= 10 && settings.peep <= 14 && m.vtPerKg <= 6.8 && m.drivingPressure <= 15 && m.pplat <= 30 && sat(gas) >= 0.9,
      teach: [
        { kind: 'obs', when: ({ m }) => m.drivingPressure > 18, text: 'Obs: Drivtrykket er over 18 cmH2O med Vt 6 ml/kg. Det betyr at den luftfylte delen av lungen er liten. Drivtrykk over ca. 15 er forbundet med høyere dødelighet ved ARDS (Amato 2015).' },
        { when: ({ m, settings }) => settings.peep >= 10 && settings.peep <= 14 && m.drivingPressure <= 15.5, text: 'Riktig! Med samme Vt betyr lavest drivtrykk (Pplateau − PEEP) best compliance: mer lunge er åpen, uten at den friske delen overstrekkes. For ham ligger det lavest mellom PEEP 10 og 14.' },
        { kind: 'obs', when: ({ settings, m }) => settings.peep >= 16 && m.drivingPressure > 15, text: 'Obs: Drivtrykket stiger igjen når PEEP blir for høy: lungen overstrekkes, compliance faller og Pplateau nærmer seg 30. Blodtrykket kan også falle. Gå tilbake til PEEP med lavest drivtrykk.' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.peep >= 8, text: 'ESICM 2023 kan verken anbefale eller fraråde PEEP valgt etter respirasjonsmekanikk framfor PEEP/FiO2-tabell (anbefaling 6.2). ATS 2024 foreslår høyere PEEP uten rekrutteringsmanøvre ved moderat til alvorlig ARDS. Drivtrykket viser deg hvordan akkurat denne lungen svarer.' },
        { when: ({ gas, settings }) => settings.peep >= 10 && sat(gas) >= 0.92, text: 'Riktig! SpO2 stiger når sammenfalte alveoler åpnes. Nå kan O2 trappes ned etter tabellen.' },
      ],
      explanation: 'Etter åpen suging har deler av lungen klappet sammen: compliance faller, og med samme Vt stiger drivtrykket (Pplateau − PEEP). I (S)CMV med inspiratorisk pause kan du lese Pplateau direkte. Øk PEEP trinnvis med samme Vt: så lenge PEEP åpner lunge, faller drivtrykket. Når PEEP blir for høy, overstrekkes de friske delene, og drivtrykket stiger igjen. Lavest drivtrykk gir best compliance; drivtrykk over ca. 15 cmH2O er assosiert med høyere dødelighet (Amato 2015). ESICM 2023 gir ingen anbefaling for eller mot mekanikkstyrt PEEP (6.2), og ART-studien (2017) viste økt dødelighet når compliance-titrert PEEP ble kombinert med langvarige rekrutteringsmanøvre. ATS 2024 foreslår høyere PEEP uten rekrutteringsmanøvre. Følg blodtrykket når PEEP økes.',
    }],
  },
  // ---------------------------------------------------------------- A8
  {
    id: 'v-ards-hyperoksi',
    title: 'Hyperoksi: PaO2 21 kPa på 70 % O2',
    vignette: 'Mann, 44 år, 186 cm. ARDS etter pneumokokkpneumoni, dag 7 og i bedring. Lett sedert og puster selv i SPONT med trykkstøtte 10 over PEEP 10, O2 70 %. O2 ble skrudd opp i natt da SpO2 falt under suging, og er ikke trappet ned igjen. SpO2 100 %.',
    profileId: 'ards', patient: { height: 186, sex: 'M', compliance: 42, resistance: 10, resistanceExp: 10, effort: { amplitude: 5, rate: 18, duration: 1 } },
    settings: { mode: 'SPONT', psupport: 10, peep: 10, fio2: 70, ets: 25, pramp: 50, trigger: { type: 'flow', value: 2 }, apneaTime: 20 },
    gas: { shunt: 0.22, recruitability: 0.4, vco2: 250, deadspaceMl: 180 }, vitalsBase: { hr: 84, sys: 132, dia: 72, temp: 37.4 },
    variants: [{
      id: 'hyperoksi', sounds: {}, vitals: {}, delay: [8, 15], effect: { shuntAdd: -0.02, rampIn: 20 },
      cues: [{ at: 0, who: 'kollega', text: '«Blodgassen er klar: PaO2 21 kPa. Fin metning, eller hva?»' }, { at: 30, who: 'monitor', text: 'SpO2 100 %.' }],
      clues: { lytt: 'God luftinngang, litt knatrelyder basalt.', se: 'Han ligger rolig, puster jevnt og synkront med respiratoren. Tuben står på 24 cm.', krets: 'Kretsen er tett.', hold: 'Ikke aktuelt: han puster selv i trykkstøtte.', blodgass: 'pH 7,39, PaCO2 5,5 kPa, PaO2 21 kPa på 70 % O2 (PaO2/FiO2 ca. 30 kPa).' },
      fixes: { ...ventFix },
      harmful: {},
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Han trenger ikke 70 %. Trapp ned O2 til PaO2 8–11 kPa, og ta ny blodgass om en halvtime.»', rekruttering: 'Ikke indisert: oksygeneringen er god.', sedasjon: 'Han er rolig og synkron. Sedasjon er ikke problemet.' },
      ventFix: true,
      target: 'O2 ned til PaO2 8–11 kPa (ca. 30–40 %), SpO2 92–96 %. Behold PEEP inntil videre, og trapp den ned trinnvis etter tabellen senere.',
      resolve: ({ gas, settings }) => settings.fio2 <= 50 && settings.peep >= 5 && pao2(gas) >= 8 && pao2(gas) <= 11.5,
      teach: [
        { kind: 'obs', when: ({ gas, settings }) => settings.fio2 >= 60 && pao2(gas) > 15, text: 'Obs: PaO2 over 15 kPa er hyperoksi. Hemoglobinet er allerede mettet, så det ekstra oksygenet gir nesten ikke mer O2 til vevet.' },
        { when: ({ gas, settings }) => settings.fio2 <= 50 && pao2(gas) >= 8 && pao2(gas) <= 11.5, text: 'Riktig! PaO2 8–11 kPa er målet (Metodebok, Respiratorbehandling). HOT-ICU (2021) fant ingen forskjell i dødelighet mellom PaO2-mål på 8 og 12 kPa hos voksne med akutt hypoksemisk respirasjonssvikt.' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.fio2 <= 60, text: 'FiO2 over 0,6 i mer enn 1–2 døgn bør unngås (Metodebok, Respiratorbehandling). Høy O2 over tid kan gi absorpsjonsatelektaser og oksygenskade i lungen.' },
        { kind: 'obs', when: ({ gas, settings }) => settings.fio2 <= 50 && pao2(gas) > 12, text: 'Obs: PaO2 er fortsatt over 12 kPa. Du kan trappe ned O2 mer.' },
        { kind: 'obs', when: ({ gas }) => pao2(gas) < 7.8, text: 'Obs: PaO2 under 8 kPa. Du har trappet ned for mye; øk O2 litt.' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.fio2 <= 40 && settings.peep >= 10, text: 'Med O2 40 % gir ARDSNet-tabellen PEEP 5–8. PEEP kan trappes ned i neste omgang, trinnvis og med SpO2 under oppsikt.' },
      ],
      explanation: 'O2 ble skrudd opp under en kortvarig desaturasjon og ble stående. PaO2 21 kPa på 70 % O2 er hyperoksi: hemoglobinet er nesten fullt mettet ved PaO2 rundt 10–11 kPa, og mer O2 gir nesten ikke mer oksygen til vevet. Høy FiO2 over tid kan gi absorpsjonsatelektaser og oksygenskade i lungen. Metodeboka (Respiratorbehandling, HUS) sier PaO2 8–11 kPa og at FiO2 over 0,6 i mer enn 1–2 døgn bør unngås. HOT-ICU (2021) fant ingen forskjell i dødelighet mellom PaO2-mål på 8 og 12 kPa. Trapp ned O2 i steg mens du følger SpO2, og trapp PEEP ned etter tabellen senere.',
    }],
  },
  // ---------------------------------------------------------------- A9
  {
    id: 'v-ards-ie-mageleie',
    title: 'Refraktær hypoksemi: lengre inspirasjonstid og mageleie',
    vignette: 'Kvinne, 38 år, 172 cm. Influensa A og alvorlig ARDS, intubert for 18 timer siden. Ventileres i PCV+ med Pcontrol 14 over PEEP 16, frekvens 28, I:E 1:2, O2 90 %. Vt er rundt 360 ml (5,7 ml/kg). Dypt sedert, puster ikke selv.',
    profileId: 'ards', patient: { height: 172, sex: 'K', compliance: 31, resistance: 12, resistanceExp: 12, effort: { amplitude: 0, rate: 16, duration: 1 } },
    settings: { mode: 'PCV', pcontrol: 14, peep: 16, rate: 28, fio2: 90, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 75, pmax: 45 },
    gas: { shunt: 0.55, recruitability: 0.35, vco2: 250, deadspaceMl: 170 }, vitalsBase: { hr: 108, sys: 118, dia: 64, temp: 38.9 },
    variants: [{
      id: 'refraktaer', sounds: {}, vitals: { hr: 10 }, delay: [8, 15], effect: { shuntAdd: 0.05, rampIn: 30 },
      cues: [{ at: 0, who: 'monitor', text: 'SpO2 faller mot 90 %.' }, { at: 30, who: 'kollega', text: '«Vi står på O2 90 % og PEEP 16 allerede. Hva mer kan vi gjøre på respiratoren?»' }],
      // lengre inspirasjonstid øker middeltrykket og åpner mer lunge (inntil I:E 1:1); AutoPEEP og blodtrykk følges
      mechFn: ({ settings }) => ({ shuntAdd: -0.1 * Math.min(1, Math.max(0, (tiFrac(settings) - 0.34) / 0.16)) }),
      vitalsFn: ({ m, settings }) => { const a = Math.max(0, (m.autoPeep ?? 0) - 2); const inv = tiFrac(settings) > 0.55 ? 8 : 0; return { sys: -4 * a - inv, dia: -2 * a - inv / 2, hr: 2 * a }; },
      clues: { lytt: 'Knatrelyder over begge lunger, svekket bak.', se: 'Hun ligger rolig og dypt sedert. Tuben står på 22 cm. Symmetriske bevegelser.', krets: 'Kretsen er tett.', hold: 'Pplateau 28 cmH2O ved PEEP 16, drivtrykk 12. Ekspirasjonsflowen når null før neste pust.', blodgass: 'pH 7,34, PaCO2 5,5 kPa, PaO2 7,8 kPa på 90 % O2 (PaO2/FiO2 ca. 9 kPa).' },
      fixes: { ...ventFix, mageleie: proneFix({ shuntAdd: -0.15, compliance: 1.05, text: 'Dere legger henne i mageleie: fem personer, én styrer hodet og tuben. Tubedybden noteres før og kontrolleres etter snuingen, linjer og dren sikres, EKG-elektrodene flyttes til ryggen. Hodet ligger på en hodepute uten trykk på øynene, armene i svømmerstilling. Tiden spoles fram: etter omtrent en time i mageleie …' }) },
      followUp: ['mageleie'], followUpAfter: 40,
      followUpText: 'Inspirasjonstiden er forlenget. PaO2/FiO2 er fortsatt under 20 kPa. Hva gjør du nå?',
      harmful: { rekruttering: 'Langvarige rekrutteringsmanøvre med høyt trykk frarådes (ESICM 2023, ATS 2024). Pplateau er allerede 30 cmH2O.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Forleng inspirasjonstiden mot I:E 1:1 og følg AutoPEEP og blodtrykk. Hun fyller kriteriene for mageleie, så vi snur henne så snart respiratoren er justert.»', vaeske: 'Blodtrykket er greit. Væske bedrer ikke oksygeneringen ved ARDS.' },
      ventFix: true,
      target: 'Forleng inspirasjonstiden mot I:E 1:1 (ikke omvendt), AutoPEEP ≤ 2–3 cmH2O, Vt ca. 6 ml/kg og Pplateau ≤ 30. Deretter mageleie (PaO2/FiO2 < 20 kPa med FiO2 ≥ 0,6). Trapp så O2 ned til ≤ 70 % med PaO2 ≥ 8 kPa.',
      resolve: ({ m, gas, settings, prone }) => prone && tiFrac(settings) >= 0.45 && tiFrac(settings) <= 0.55 && m.autoPeep <= 3 && m.pplat <= 30.5 && m.vtPerKg <= 7 && settings.fio2 <= 70 && pao2(gas) >= 8,
      teach: [
        { when: ({ settings, m }) => tiFrac(settings) >= 0.45 && tiFrac(settings) <= 0.55 && m.autoPeep <= 3, text: 'Riktig! Lengre inspirasjonstid (I:E mot 1:1) øker middeltrykket i luftveiene uten å øke topptrykket. Mer lunge holdes åpen, og PaO2 stiger. Metodeboka (Respiratorbehandling) nevner I:E 1:1 blant tiltakene ved høyt O2-behov.' },
        { kind: 'obs', when: ({ settings, m }) => tiFrac(settings) > 0.55 || m.autoPeep > 3, text: 'Obs: Omvendt I:E (lengre inspirasjon enn ekspirasjon) gir for kort ekspirasjonstid. Lungen tømmes ikke, AutoPEEP bygger seg opp og blodtrykket faller. Sjekk at ekspirasjonsflowen når null, og gå tilbake mot 1:1.' },
        { kind: 'info', after: 'juster', when: ({ settings }) => tiFrac(settings) >= 0.45, text: 'Forlenget inspirasjonstid kan bedre oksygeneringen, men ingen studier viser bedre overlevelse (Marcy og Marini, Chest 1991). Mageleie har vist lavere dødelighet og skal ikke utsettes når kriteriene er oppfylt.' },
        { after: 'mageleie', when: () => true, text: 'Riktig! PaO2/FiO2 var under 20 kPa med FiO2 ≥ 0,6, PEEP ≥ 5 og Vt 6 ml/kg: kriteriet for mageleie (ESICM 2023 anbefaling 7.1; PROSEVA). Øktene skal vare minst 16 timer.' },
        { kind: 'info', after: 'mageleie', when: () => true, text: 'Sykepleie i mageleie: skift hodets stilling og armene i svømmerstilling hver 2.–4. time (ICS/FICM 2019). Ingen trykk mot øynene, tuben skal ikke presse mot munnvik eller lepper, og ører, bryst, hofter og knær sjekkes for trykk.' },
        { kind: 'info', after: 'mageleie', when: ({ gas, settings }) => settings.fio2 > 70 && pao2(gas) > 10, text: 'Oksygeneringen bedres i mageleie. Trapp ned O2 mot PaO2 8–11 kPa.' },
      ],
      explanation: 'Hun har alvorlig ARDS med PaO2/FiO2 rundt 8 kPa tross Vt 6 ml/kg, PEEP 16 og O2 90 %. På respiratoren kan inspirasjonstiden forlenges mot I:E 1:1 (Metodebok, Respiratorbehandling): middeltrykket i luftveiene stiger uten at topptrykket øker, og mer lunge holdes åpen. Ekspirasjonstiden blir kortere, så sjekk at ekspirasjonsflowen når null (AutoPEEP) og følg blodtrykket. Omvendt I:E gir luftfanging og blodtrykksfall, og ingen studier har vist bedre overlevelse med det (Marcy og Marini 1991). Mageleie har dokumentert effekt på dødeligheten (PROSEVA; ESICM 2023 anbefaling 7.1–7.2) og er neste steg. I mageleie: tubedybde før og etter snuing, hodet og armene i svømmerstilling skiftes hver 2.–4. time, ingen trykk mot øynene, og trykkpunkter i ansikt, på bryst, hofter og knær kontrolleres (ICS/FICM 2019).',
    }],
  },
  // ---------------------------------------------------------------- A10
  {
    id: 'v-ards-pcv-platatak',
    title: 'PCV+ ved platåtaket: lungen blir stivere',
    vignette: 'Mann, 60 år, 170 cm. Influensa og alvorlig ARDS, dag 3. Ventileres i PCV+ med Pcontrol 16 over PEEP 14, frekvens 22, I:E 1:2, O2 70 %. Vt har ligget rundt 400 ml (6 ml/kg), og Pplateau er 30. Dypt sedert, puster ikke selv.',
    profileId: 'ards', patient: { height: 170, sex: 'M', compliance: 25, resistance: 11, resistanceExp: 11, effort: { amplitude: 0, rate: 16, duration: 1 } },
    settings: { mode: 'PCV', pcontrol: 16, peep: 14, rate: 22, fio2: 70, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 75, pmax: 45 },
    gas: { shunt: 0.4, recruitability: 0.35, vco2: 300, deadspaceMl: 130 }, vitalsBase: { hr: 96, sys: 118, dia: 64, temp: 38.5 },
    variants: [{
      id: 'stivere-platatak', sounds: {}, vitals: { hr: 12, sys: 6 }, delay: [8, 15], effect: { compliance: 0.78, shuntAdd: 0.04, rampIn: 60 },
      cues: [{ at: 0, who: 'respirator', text: 'VTE faller pust for pust.' }, { at: 40, who: 'monitor', text: 'PetCO2 stiger.' }, { at: 80, who: 'kollega', text: '«Skal vi bare skru opp Pcontrol til Vt er 400 igjen?»' }],
      clues: { lytt: 'Knatrelyder over begge lunger, svekket basalt.', se: 'Han ligger rolig og dypt sedert. Tuben står på 23 cm, som dokumentert. Brystet beveger seg mindre enn før.', krets: 'Kretsen er tett.', hold: 'Pplateau er 30 cmH2O ved PEEP 14: drivtrykket er 16, men Vt er bare ca. 300 ml (4,6 ml/kg).', blodgass: 'pH 7,20, PaCO2 8,9 kPa, PaO2 9,0 kPa på 70 % O2 (PaO2/FiO2 ca. 13 kPa).' },
      fixes: { ...ventFix },
      harmful: { rekruttering: 'Pplateau er allerede 30 cmH2O. Rekrutteringsmanøver med høyt trykk øker risikoen for barotraume, og ESICM 2023 fraråder langvarige høytrykksmanøvre.', vaeske: 'Mer væske forverrer lungeødemet ved ARDS.' },
      neutral: { ...NEUTRAL_BASE, mageleie: 'Mageleie kan bli aktuelt (PaO2/FiO2 er under 20 kPa på O2 70 %), men snuingen krever fem personer og forberedelse. Først må minuttvolumet tas igjen på respiratoren.', lege: 'Legen: «Ikke mer trykk: Pplateau er 30. Øk frekvensen opp mot 30–35 og sjekk at ekspirasjonen rekker å bli ferdig. Vi godtar PaCO2 litt høyt så lenge pH er over 7,20.»', sedasjon: 'Han er dypt sedert og puster ikke selv. Sedasjon endrer ikke lungemekanikken.' },
      ventFix: true,
      target: 'Ikke øk Pcontrol (Pplateau ≤ 30, drivtrykk ≤ 15–16). Øk frekvensen til 28–34 så minuttvolumet tas igjen, med AutoPEEP ≤ 2 og PaCO2 under ca. 8 kPa (pH ≥ 7,20).',
      resolve: ({ m, gas, settings }) => settings.rate >= 28 && m.pplat <= 30.5 && m.drivingPressure <= 16.5 && m.autoPeep <= 2.5 && paco2(gas) <= 7.8 && sat(gas) >= 0.88,
      teach: [
        { kind: 'obs', when: ({ m }) => m.pplat > 31, text: 'Obs: Pplateau over 30 cmH2O. Mer trykk gir større Vt, men overstrekker den lille luftfylte lungen. Hold Pplateau ≤ 30 og drivtrykket ≤ 15–16.' },
        { when: ({ settings, m }) => settings.rate >= 28 && m.pplat <= 30.5, text: 'Riktig! Når trykket står fast ved taket, tas minuttvolumet igjen med frekvensen. ARDSNet-protokollen tillot frekvens opp til 35.' },
        { kind: 'info', when: ({ settings }) => settings.rate >= 28, text: 'Høyere frekvens gir kortere ekspirasjon. Sjekk at ekspirasjonsflowen når null før neste pust, og følg AutoPEEP. Ved ARDS er tidskonstanten kort, så det går som regel bra opp mot 30–35.' },
        { kind: 'obs', when: ({ m }) => m.autoPeep > 2.5, text: 'Obs: AutoPEEP over 2,5 cmH2O. Ekspirasjonen rekker ikke å bli ferdig. Senk frekvensen litt eller kort ned inspirasjonstiden.' },
        { when: ({ gas, settings }) => settings.rate >= 28 && paco2(gas) <= 7.8, text: 'Riktig! PaCO2 faller igjen. Moderat hyperkapni med pH over 7,20 aksepteres (permissiv hyperkapni).' },
        { kind: 'info', after: 'juster', when: ({ gas, settings }) => settings.fio2 >= 60 && pf(gas, settings) < 20, text: 'PaO2/FiO2 er under 20 kPa med O2 70 %, PEEP 14 og lavt Vt. Han fyller kriteriet for mageleie (ESICM 2023 anbefaling 7.1). Ta det opp med legen når ventilasjonen er stabil.' },
      ],
      explanation: 'I PCV+ er trykket fast og tidevolumet følger lungen. Når compliance faller, faller Vt og minuttvolumet, og PaCO2 stiger. Her står Pcontrol 16 over PEEP 14, så Pplateau er allerede 30 cmH2O: du kan ikke øke trykket uten å bryte grensen for Pplateau (ARDSNet; ATS/ESICM 2017: < 30) og drivtrykket (Amato 2015). Øk frekvensen i stedet, opp mot 30–35, og sjekk at ekspirasjonen rekker å bli ferdig (AutoPEEP). Godta moderat hyperkapni med pH over 7,20. Varsle lege: forverringen kan være sekret, atelektase, væske eller pneumothorax.',
    }],
  },
];
