/**
 * Voksencaser: obstruktiv lungesykdom (KOLS og astma) med hovedvekt på respiratorjustering.
 *
 * Kilder (se KILDER.md, «Voksencaser: obstruktiv lungesykdom»):
 *  - Metodebok i akutt indremedisin (HUS) «Respiratorbehandling» v1.0: DuoPAP ved oppstart, KOLS: mål PEEPi og sett
 *    PEEP ca. 50–80 % av PEEPi, I:E normalt 1:2, pCO2 høyere ved KOLS (mål på pH), APRV kontraindisert ved astma
 *    og alvorlig KOLS, PaO2 8–11 kPa.
 *  - Metodebok «Hamilton C6 – oversikt» (lokal): (S)CMV med firkantflow og inspiratorisk pause ved alvorlig
 *    obstruksjon; APVcmv har ingen pause; trigget pust forkorter ekspirasjonen: reduser TI eller slå av trigger.
 *  - BTS/ICS 2016 (Davidson, Thorax 2016;71 Suppl 2:ii1–35): PEEP over PEEPi kan være skadelig, derfor 50–80 % av PEEPi;
 *    permissiv hyperkapni med pH over 7,2.
 *  - Smith og Marini 1988 (J Appl Physiol 65:1488): ekstern PEEP ved PEEPi bedret ekspiratorisk motstand og
 *    triggerfølsomhet og reduserte pustearbeid og respirasjonsdrive.
 *  - Thille 2006 (Intensive Care Med 32:1515): ineffektiv trigging henger sammen med høy trykkstøtte og stort Vt.
 *  - Tassaux 2005 (AJRCCM 172:1283): høyere ETS ved obstruktiv sykdom reduserer forsinket syklus, PEEPi og
 *    ineffektive pusteforsøk.
 *  - Pepe og Marini 1982 (Am Rev Respir Dis 126:166): AutoPEEP kan gi sirkulasjonssvikt; måles med ekspiratorisk hold.
 *  - Tuxen og Lane 1987 (Am Rev Respir Dis 136:872): hyperinflasjonen øker med Vt og minuttventilasjon og ved kortere
 *    TE; Ppeak følger inspiratorisk flow, ikke lungevolumet; hypotensjon ved høye lungevolum.
 *  - Darioli og Perret 1984 (Am Rev Respir Dis 129:385): kontrollert hypoventilering ved status astmaticus.
 *  - Leatherman 2015 (Chest 147:1671): unngå komplikasjoner foran å korrigere hyperkapni; hyperinflasjon gir hypotensjon
 *    og barotraume. Tobin (red.), Principles and Practice of Mechanical Ventilation, kap. 30, tabell 30-2: Vt 7–9 ml/kg,
 *    frekvens 10–14, PEEP ≤ 5, mål Pplateau < 30 (≤ 25 ideelt) og pH ≥ 7,2.
 *  - Banga og Khilnani 2009 (COPD 6:437): posthyperkapnisk alkalose hos KOLS på respirator.
 *  - BTS 2017 (oksygen): SpO2 88–92 % ved risiko for hyperkapnisk svikt.
 * Effektstørrelsene (endringer i resistance, PEEP-effekt på ekspiratorisk motstand, blodtrykksfall per cmH2O AutoPEEP)
 * er pedagogiske valg, UVERIFISERT.
 */
import { phFromHco3Pco2 } from '../../../core/physiology/acidbase.js';
import { NEUTRAL_BASE, ventFix, vtOk, sat, pao2, paco2 } from './common.js';

/** pH pasienten er på vei mot, fra pasientens HCO3 og PaCO2 (Henderson–Hasselbalch). */
const ph = (hco3, gas) => phFromHco3Pco2(hco3, paco2(gas));
/** Blodtrykket faller med dynamisk hyperinflasjon (AutoPEEP over terskelen). Pedagogisk modell, UVERIFISERT. */
const autoPeepBT = (thr, k) => ({ m }) => { const x = Math.max(0, (m.autoPeep ?? 0) - thr); return { sys: -k * x, dia: -0.55 * k * x, hr: 0.6 * k * x }; };

const OBSTR_NEUTRAL = {
  ...NEUTRAL_BASE,
  bronkodilatator: 'Bronkodilaterende behandling gis allerede etter ordinasjon. Den virker over tid, men respiratoren må justeres nå.',
  rekruttering: 'Ikke indisert. En lunge med fanget luft trenger tid til å tømme seg, ikke mer trykk.',
};
const HARM_REKRUTTERING = 'Skadelig: en rekrutteringsmanøver øker hyperinflasjonen i en obstruktiv lunge og kan gi pneumothorax og blodtrykksfall.';

export const OBSTRUKTIV_CASES = [
  // ---------------------------------------------------------------- O1
  {
    id: 'v-obstruktiv-ie-kols',
    title: 'KOLS i APVcmv: I:E 1:1 gir luftfangst',
    vignette: 'Mann, 72 år, 176 cm. KOLS-eksaserbasjon med pneumoni, intubert i natt. Ventileres i APVcmv: Vt 480 ml, frekvens 14, I:E 1:1, PEEP 5, O2 40 %. Nattevakten endret I:E fra 1:2 til 1:1 da SpO2 var 89 %. Sedert, puster ikke selv.',
    profileId: 'obstruktiv', patient: { height: 176, sex: 'M', compliance: 55, resistance: 16, resistanceExp: 32, effort: { amplitude: 0, rate: 14, duration: 1 } },
    settings: { mode: 'APVCMV', vt: 480, rate: 14, peep: 5, fio2: 40, timingMode: 'ie', ie: { i: 1, e: 1 }, pramp: 50, pmax: 45, trigger: { type: 'flow', value: 2 } },
    gas: { shunt: 0.2, recruitability: 0.1, vco2: 210, deadspaceMl: 230 }, gasStart: { paco2: 7.0 }, vitalsBase: { hr: 96, sys: 128, dia: 70, temp: 37.4 },
    variants: [{
      id: 'ie-kols', sounds: { wheeze: 0.7 }, vitals: {}, delay: [8, 15], effect: { resistanceExp: 1.35, rampIn: 40 },
      cues: [{ at: 0, who: 'obs', text: 'Brystkassen synker knapt mellom pustene.' }, { at: 30, who: 'kollega', text: '«Pplateau og AutoPEEP har steget den siste timen.»' }, { at: 60, who: 'monitor', text: 'Blodtrykket har falt litt.' }],
      clues: {
        lytt: 'Lange ekspiratoriske pipelyder over begge lunger. Ekspirasjonen er ikke ferdig før neste pust starter.',
        se: 'Tønneformet brystkasse. Flowkurven: ekspirasjonsflowen når ikke null før neste inspirasjon. TI og TE er like lange, ca. 2,1 s.',
        krets: 'Kretsen er tett.',
        hold: 'Ekspiratorisk hold: AutoPEEP ca. 6 cmH2O (total PEEP ca. 11). Inspiratorisk hold: Pplateau ca. 20 cmH2O.',
        blodgass: 'pH 7,36, PaCO2 7,0 kPa, PaO2 10,2 kPa på 40 % O2, HCO3 29 mmol/l. SpO2 95 %.',
      },
      fixes: { ...ventFix },
      harmful: { rekruttering: HARM_REKRUTTERING },
      neutral: { ...OBSTR_NEUTRAL, lege: 'Legen: «I:E 1:1 er et tiltak ved ARDS, ikke ved KOLS. Gi ham tid til å puste ut: I:E 1:3 eller lengre, og vurder lavere frekvens.»', vaeske: 'Blodtrykket er fortsatt akseptabelt. Årsaken er luftfangst, ikke væskemangel.' },
      ventFix: true,
      target: 'AutoPEEP ≤ 3,5 cmH2O med I:E 1:3 eller lengre (TE ≥ 3 s). Behold Vt 6–8 ml/kg IBW og frekvens 12–14. SpO2 88–92 % er nok ved KOLS: øk heller O2 litt enn å forlenge inspirasjonen.',
      vitalsFn: autoPeepBT(3, 2.5),
      resolve: ({ m, gas, settings }) => m.autoPeep <= 3.5 && m.te >= 2.5 * m.ti && settings.rate <= 16 && sat(gas) >= 0.88,
      teach: [
        { kind: 'obs', when: ({ m, settings }) => settings.timingMode === 'ie' && settings.ie.i >= settings.ie.e && m.autoPeep > 4, text: 'Obs: I:E 1:1 gir lang inspirasjon og kort ekspirasjon. Ved KOLS rekker ikke lungen å tømme seg, luft fanges og AutoPEEP stiger. I:E 1:1 er et oksygeneringstiltak ved ARDS (Metodebok), ikke ved obstruksjon.' },
        { after: 'juster', when: ({ m }) => m.te >= 3 && m.te >= 2.5 * m.ti, text: 'Riktig! Kortere inspirasjon (I:E 1:3–1:4) gir lengre ekspirasjon med samme Vt og frekvens. Lungen tømmer seg mer, og Pplateau og AutoPEEP faller.' },
        { after: 'juster', when: ({ m }) => m.autoPeep <= 3.5, text: 'Riktig! AutoPEEP er nede på ca. 3 cmH2O. Følg den med ekspiratorisk hold: trykket som står igjen i alveolene ved slutten av ekspirasjonen (Pepe og Marini 1982).' },
        { kind: 'info', after: 'juster', when: ({ m }) => m.te >= 3 && m.ppeak > m.pplat + 3, text: 'I APVcmv må respiratoren bruke litt høyere trykk for å levere samme Vt på kortere tid, så Ppeak stiger litt. Det er ventet. Pplateau og AutoPEEP viser hyperinflasjonen, ikke Ppeak.' },
        { kind: 'obs', when: ({ settings }) => settings.peep >= 8, text: 'Obs: Høyere PEEP tømmer ikke en lunge med fanget luft. Ved KOLS settes PEEP lavt, ca. 50–80 % av målt AutoPEEP (Metodebok; BTS/ICS 2016).' },
        { kind: 'obs', when: ({ settings }) => settings.rate > 16, text: 'Obs: Høyere frekvens forkorter ekspirasjonen enda mer og øker luftfangsten.' },
        { kind: 'info', after: 'juster', when: ({ gas }) => sat(gas) < 0.88, text: 'SpO2 er under 88 %. Øk O2 litt. Ved KOLS med fare for CO2-opphopning er SpO2 88–92 % et vanlig mål (BTS 2017).' },
      ],
      explanation: 'I:E 1:1 er et tiltak for oksygenering ved ARDS (Metodebok: I:E 1:1 når FiO2 må holdes høy), men hos en KOLS-pasient forkorter det ekspirasjonen. Ekspirasjonen ved KOLS er langsom fordi luftveiene er trange og lungen har lang tidskonstant. Starter neste pust før lungen er tømt, fanges luft (dynamisk hyperinflasjon): AutoPEEP og Pplateau stiger, og blodtrykket kan falle (Pepe og Marini 1982). Riktig er kort inspirasjon og lang ekspirasjon: I:E 1:3 eller lengre, og frekvens 12–14. Hyperinflasjonen øker med kortere TE og større minuttventilasjon (Tuxen og Lane 1987). Lav SpO2 behandles med litt mer O2; ved KOLS er SpO2 88–92 % ofte nok (BTS 2017). Mål AutoPEEP med ekspiratorisk hold etter endringen.',
    }],
  },
  // ---------------------------------------------------------------- O2
  {
    id: 'v-obstruktiv-peepi-trigging',
    title: 'KOLS i SPONT: pusteforsøk som ikke trigger',
    vignette: 'Mann, 64 år, 182 cm. KOLS, dag 4 på respirator etter en eksaserbasjon. Lett sedert og puster selv i SPONT: trykkstøtte 16 over PEEP 0, O2 30 %, ETS 25 %, flowtrigger 2 l/min. PEEP ble satt til 0 i går «fordi KOLS-pasienter ikke skal ha PEEP».',
    profileId: 'obstruktiv', patient: { height: 182, sex: 'M', compliance: 60, resistance: 10, resistanceExp: 34, effort: { amplitude: 5, rate: 24, duration: 0.9 } },
    settings: { mode: 'SPONT', psupport: 16, peep: 0, fio2: 30, ets: 25, pramp: 50, trigger: { type: 'flow', value: 2 }, apneaTime: 20, tiMax: 1.5 },
    gas: { shunt: 0.1, recruitability: 0.1, vco2: 210, deadspaceMl: 280 }, gasStart: { paco2: 5.8 }, vitalsBase: { hr: 104, sys: 142, dia: 78, temp: 37.2 },
    variants: [{
      id: 'peepi', sounds: { wheeze: 0.4 }, vitals: { hr: 8 }, delay: [8, 15], effect: { resistanceExp: 1.25, rampIn: 30 },
      cues: [{ at: 0, who: 'obs', text: 'Magen og halsmusklene trekker seg sammen oftere enn respiratoren gir pust.' }, { at: 30, who: 'obs', text: 'Du teller 24 pusteforsøk i minuttet. Respiratoren viser fTotal 12.' }, { at: 60, who: 'kollega', text: '«Han jobber tungt. Skal vi gi mer trykkstøtte?»' }],
      clues: {
        lytt: 'Svake respirasjonslyder med forlenget ekspirium og lette pipelyder.',
        se: 'Han bruker hjelpemuskler. Annenhver innåndingsbevegelse gir ingen pust fra respiratoren; på flowkurven ser du bare en liten knekk i ekspirasjonsflowen.',
        krets: 'Kretsen er tett. Ingen lekkasje, ingen kondens.',
        hold: 'Hold blir upålitelig når han puster aktivt. Kurvene viser at ekspirasjonsflowen ikke når null: når han starter neste innånding, er det fortsatt ca. 7 cmH2O overtrykk i alveolene (PEEPi). Det må han overvinne før respiratoren merker noe.',
        blodgass: 'pH 7,42, PaCO2 5,8 kPa, PaO2 12,4 kPa på 30 % O2, HCO3 28 mmol/l.',
      },
      fixes: { ...ventFix },
      harmful: { rekruttering: HARM_REKRUTTERING, sedasjon: 'Sedasjon demper pustedriven, men fjerner ikke årsaken. Han trenger ekstern PEEP, ikke mindre egenpust.' },
      neutral: { ...OBSTR_NEUTRAL, lege: 'Legen: «Han har AutoPEEP på ca. 7. Sett PEEP til 50–80 % av den, og senk trykkstøtten hvis Vt er over 8 ml/kg.»', sedasjonNed: 'Han er allerede lett sedert og våken nok til å puste selv.' },
      ventFix: true,
      target: 'Alle pusteforsøk trigger (fTotal lik frekvensen du teller på pasienten; den faller når pusten blir lettere). PEEP ca. 50–80 % av PEEPi: her 4–6 cmH2O, ikke over 8. Vt 6–8 ml/kg IBW (vurder lavere trykkstøtte).',
      // Ekstern PEEP under PEEPi «stenter» de trange luftveiene: ekspiratorisk motstand faller (Smith og Marini 1988).
      // PEEP over PEEPi øker lungevolumet (compliance faller). Størrelsene er pedagogiske valg, UVERIFISERT.
      mechFn: ({ settings }) => { const p = settings.peep; return p <= 1 ? {} : p < 4 ? { resistanceExp: 1 - 0.12 * (p - 1) } : p <= 8 ? { resistanceExp: 0.6 } : { resistanceExp: 0.75, compliance: 0.75 }; },
      // lettere trigging gir mindre pustearbeid og lavere drive (Smith og Marini 1988)
      effortFn: ({ settings }) => (settings.peep >= 4 ? { amplitude: 4, rate: 15, duration: 0.9 } : null),
      resolve: ({ m, settings }) => settings.peep >= 3 && settings.peep <= 8 && m.fSpont >= 14 && m.vtPerKg >= 5 && m.vtPerKg <= 8,
      teach: [
        { kind: 'obs', when: ({ settings }) => settings.psupport >= 18, text: 'Obs: Mer trykkstøtte gir større Vt og mer luft som må ut. AutoPEEP øker, og flere pusteforsøk blir ineffektive. Ineffektiv trigging henger sammen med høy trykkstøtte og stort Vt (Thille 2006).' },
        { kind: 'obs', when: ({ settings }) => settings.trigger.type === 'flow' && settings.trigger.value <= 1 && settings.peep < 3, text: 'Obs: Følsommere trigger hjelper lite. Pasienten må først overvinne PEEPi før respiratoren merker noe, uansett triggerinnstilling.' },
        { when: ({ settings, m }) => settings.peep >= 3 && settings.peep <= 8 && m.fSpont >= 14, text: 'Riktig! Med ekstern PEEP nær PEEPi trenger pasienten bare å trekke litt under PEEP for å trigge. Nå gir alle pusteforsøk en pust, og han roer seg: frekvensen faller fra 24 til ca. 15. Ekstern PEEP bedret triggerfølsomheten og reduserte pustearbeid og respirasjonsdrive hos pasienter med AutoPEEP (Smith og Marini 1988).' },
        { after: 'juster', when: ({ settings }) => settings.peep >= 4 && settings.peep <= 6, text: 'Riktig! PEEP 4–6 er ca. 50–80 % av PEEPi på 7. Metodeboka og BTS/ICS 2016 anbefaler dette nivået: PEEP over PEEPi kan øke hyperinflasjonen.' },
        { kind: 'obs', when: ({ settings }) => settings.peep > 8, text: 'Obs: PEEP over PEEPi (ca. 7) øker lungevolumet og trykket i brystkassen. Anbefalingen er 50–80 % av PEEPi (Metodebok; BTS/ICS 2016).' },
        { kind: 'info', after: 'juster', when: ({ m }) => m.vtPerKg > 8, text: 'Vt er over 8 ml/kg IBW. Senk trykkstøtten litt: mindre Vt gir mindre luft som må ut, og lavere trykkstøtte kan redusere ineffektiv trigging (Thille 2006).' },
      ],
      explanation: 'Ved KOLS rekker lungen ofte ikke å tømme seg før neste innånding. Det står igjen et overtrykk i alveolene (PEEPi, AutoPEEP). For å trigge må pasienten først trekke alveoletrykket ned fra PEEPi til under innstilt PEEP; først da kommer det flow som respiratoren merker. Med PEEP 0 og PEEPi 7 er mange pusteforsøk for svake: de blir ineffektive, fTotal på respiratoren blir lavere enn pasientens egen frekvens, og pustearbeidet øker. Ekstern PEEP opp mot PEEPi reduserer trykket pasienten må overvinne (Smith og Marini 1988). Metodeboka og BTS/ICS 2016 anbefaler PEEP ca. 50–80 % av PEEPi; PEEP over PEEPi kan øke hyperinflasjonen. Høy trykkstøtte og stort Vt øker også ineffektiv trigging (Thille 2006), så vurder lavere trykkstøtte når Vt er over 8 ml/kg IBW. En følsommere trigger løser ikke problemet.',
    }],
  },
  // ---------------------------------------------------------------- O3
  {
    id: 'v-obstruktiv-ph-kols',
    title: 'KOLS: overventilert til «normal» PaCO2',
    vignette: 'Kvinne, 66 år, 162 cm. KOLS med kronisk hyperkapni: ved stabil sykdom er PaCO2 ca. 7,5 kPa og HCO3 ca. 34 mmol/l. Intubert for to døgn siden. Ventileres i APVcmv: Vt 380 ml, frekvens 22, I:E 1:2, PEEP 5, O2 30 %. Frekvensen ble økt i natt for å få PaCO2 ned i normalområdet. Sedert, puster ikke selv.',
    profileId: 'obstruktiv', patient: { height: 162, sex: 'K', compliance: 45, resistance: 14, resistanceExp: 20, effort: { amplitude: 0, rate: 14, duration: 1 } },
    settings: { mode: 'APVCMV', vt: 380, rate: 22, peep: 5, fio2: 30, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, pmax: 45, trigger: { type: 'flow', value: 2 } },
    gas: { shunt: 0.1, recruitability: 0.1, vco2: 180, deadspaceMl: 190 }, vitalsBase: { hr: 88, sys: 124, dia: 66, temp: 36.9 },
    variants: [{
      id: 'ph-kols', sounds: {}, vitals: { hr: 6 }, delay: [5, 10], effect: {},
      cues: [{ at: 0, who: 'kollega', text: '«Se så fin blodgassen er blitt! PaCO2 er 5,0.»' }, { at: 20, who: 'monitor', text: 'Enkelte ventrikulære ekstrasystoler på EKG.' }, { at: 40, who: 'kollega', text: '«Kalium var 3,2 i morges.»' }],
      clues: {
        lytt: 'Lette ekspiratoriske pipelyder, ellers symmetriske respirasjonslyder.',
        se: 'Hun ligger rolig og sedert. Tuben står som dokumentert. Brystkassen beveger seg symmetrisk.',
        krets: 'Kretsen er tett.',
        hold: 'Pplateau ca. 15 cmH2O, AutoPEEP ca. 1 cmH2O. Lungemekanikken er grei.',
        blodgass: 'pH 7,57, PaCO2 5,0 kPa, HCO3 34 mmol/l, BE +11, PaO2 12,8 kPa på 30 % O2. Kalium 3,2 mmol/l. Metabolsk kompensert kronisk hyperkapni som nå er overventilert: alkalose.',
      },
      fixes: { ...ventFix },
      harmful: { rekruttering: HARM_REKRUTTERING },
      neutral: { ...OBSTR_NEUTRAL, bronkodilatator: 'Lite pipelyder. Bronkodilatator endrer ikke blodgassen.', lege: 'Legen: «Hun har HCO3 34. Vi sikter mot pH, ikke PaCO2: senk minuttventilasjonen til pH er 7,35–7,45. Kaliumtilskudd er ordinert.»', vaeske: 'Sirkulasjonen er stabil. Væske endrer ikke alkalosen.' },
      ventFix: true,
      target: 'pH 7,35–7,45: la PaCO2 stige mot hennes vanlige nivå (ca. 7–8,5 kPa). Senk frekvensen (ca. 12–16) og behold Vt 6–8 ml/kg IBW. PaO2 8–11 kPa.',
      resolve: ({ m, gas }) => { const p = ph(34, gas); return p >= 7.35 && p <= 7.45 && m.vtPerKg >= 5.5; },
      teach: [
        { kind: 'obs', after: 'juster', when: ({ gas, settings }) => ph(34, gas) > 7.5 && settings.rate >= 20 && settings.vt >= 360, text: 'Obs: pH er fortsatt over 7,50. HCO3 34 betyr at nyrene har kompensert for en kronisk høy PaCO2. «Normal» PaCO2 gir da alkalose. Mål på pH, ikke på PaCO2.' },
        { when: ({ gas }) => { const p = ph(34, gas); return p >= 7.35 && p <= 7.45; }, text: 'Riktig! pH er innenfor 7,35–7,45. Med HCO3 34 gir PaCO2 ca. 7–8,5 kPa normal pH for henne. Metodeboka: blodgassmålet er pH 7,35–7,45, og pCO2 kan være høyere ved KOLS.' },
        { when: ({ settings, m }) => settings.rate <= 16 && m.vtPerKg >= 5.5, text: 'Riktig! Lavere frekvens senker minuttventilasjonen og gir lengre ekspirasjon. Det er bedre enn å senke Vt under 6 ml/kg, som øker andelen dødrom.' },
        { kind: 'obs', when: ({ gas }) => ph(34, gas) < 7.3, text: 'Obs: Nå er PaCO2 over hennes vanlige nivå, og pH er på vei under 7,30. Øk minuttventilasjonen litt.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Vedvarende metabolsk alkalose etter at PaCO2 er senket (posthyperkapnisk alkalose) er vanlig hos KOLS-pasienter på respirator, og er forbundet med mer respiratoravhengighet og lengre intensivopphold (Banga og Khilnani 2009).' },
        { kind: 'info', after: 'juster', when: ({ gas, settings }) => pao2(gas) > 11 && settings.fio2 > 25, text: 'PaO2 er over 11 kPa. Trapp ned O2 mot PaO2 8–11 kPa (Metodebok).' },
      ],
      explanation: 'Pasienter med kronisk hyperkapni har kompensert med høy HCO3 (her 34 mmol/l). Ventileres PaCO2 ned til «normalt» nivå (5 kPa), blir pH høy (7,57): en metabolsk alkalose som ikke lenger er kompensert. Alkalose senker kalium og kan gi arytmier. HCO3 forsvinner langsomt, og vedvarende alkalose er forbundet med mer respiratoravhengighet og lengre intensivopphold (Banga og Khilnani 2009). Riktig mål er pH 7,35–7,45, ikke PaCO2: Metodeboka sier at pCO2 kan være høyere ved KOLS. Med HCO3 34 gir PaCO2 ca. 7–8,5 kPa normal pH (Henderson–Hasselbalch). Senk minuttventilasjonen helst med lavere frekvens, som også gir lengre ekspirasjon. Trapp O2 ned mot PaO2 8–11 kPa.',
    }],
  },
  // ---------------------------------------------------------------- O4
  {
    id: 'v-obstruktiv-astma-scmv',
    title: 'Alvorlig astma: fra APVcmv til (S)CMV med pause',
    vignette: 'Kvinne, 31 år, 168 cm. Alvorlig astmaanfall, intubert i akuttmottaket for to timer siden. Ventileres i APVcmv: Vt 420 ml, frekvens 14, I:E 1:2, PEEP 5, O2 35 %, Pmax 35 cmH2O. Dypt sedert, puster ikke selv. Får forstøvning og intravenøs behandling etter ordinasjon.',
    profileId: 'obstruktiv', patient: { height: 168, sex: 'K', compliance: 50, resistance: 20, resistanceExp: 40, effort: { amplitude: 0, rate: 14, duration: 1 } },
    settings: { mode: 'APVCMV', vt: 420, rate: 14, peep: 5, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, pmax: 35, trigger: { type: 'flow', value: 2 } },
    gas: { shunt: 0.14, recruitability: 0.1, vco2: 200, deadspaceMl: 170 }, vitalsBase: { hr: 118, sys: 132, dia: 74, temp: 37.0 },
    variants: [{
      id: 'astma-scmv', sounds: { wheeze: 1 }, vitals: { hr: 6 }, delay: [8, 15], effect: { resistance: 2.0, resistanceExp: 1.5, rampIn: 40 },
      cues: [{ at: 0, who: 'obs', text: 'Pipelydene blir kraftigere, og du hører dem uten stetoskop.' }, { at: 45, who: 'kollega', text: '«Vt faller, og trykket står i taket. Skal jeg bare skru ned volumet så alarmen slutter?»' }],
      clues: {
        lytt: 'Uttalte ekspiratoriske pipelyder over begge lunger og svært forlenget ekspirium.',
        se: 'Overoppblåst brystkasse. Trykkurven flater ut på Plimit (25 cmH2O), og flowkurven når ikke null før neste pust.',
        krets: 'Kretsen er tett.',
        hold: 'APVcmv har ingen pause, så platåtrykket vises ikke av seg selv. Inspiratorisk hold: Pplateau ca. 17 cmH2O. Ekspiratorisk hold: AutoPEEP ca. 5 cmH2O. Det meste av trykket går med til motstanden i luftveiene.',
        blodgass: 'pH 7,27, PaCO2 7,4 kPa og stigende, PaO2 11 kPa på 35 % O2, HCO3 25 mmol/l.',
      },
      fixes: { ...ventFix },
      harmful: { rekruttering: HARM_REKRUTTERING },
      neutral: { ...OBSTR_NEUTRAL, lege: 'Legen: «Bytt til (S)CMV med firkantflow og pause, så vi ser platåtrykket. Høy Ppeak er ventet; sett Pmax høyt nok. Lav frekvens, vi aksepterer CO2.»', sedasjon: 'Hun er allerede dypt sedert og puster ikke selv.' },
      ventFix: true,
      target: '(S)CMV med firkantflow og inspiratorisk pause (f.eks. 10 %). Pmax høyt nok til at hele Vt leveres (Plimit = Pmax − 10 må ligge godt over Ppeak, som blir ca. 32–40 i (S)CMV; her Pmax ca. 50). Vt 6–8 ml/kg IBW, frekvens 10–12, Pplateau under 30 og AutoPEEP under 5 cmH2O. Høy Ppeak er ventet. Aksepter høy PaCO2 (pH over ca. 7,20).',
      vitalsFn: autoPeepBT(4, 3),
      resolve: ({ m, settings }) => settings.mode === 'SCMV' && settings.flowPattern === 'square' && settings.tip > 0 && m.pplat < 30 && m.autoPeep < 5 && !m.pressureLimited && m.vtPerKg >= 5.5,
      teach: [
        { kind: 'obs', when: ({ m }) => m.pressureLimited, text: 'Obs: Respiratoren holder igjen ved Plimit (Pmax − 10), så hele Vt blir ikke levert. Ved astma er høyt topptrykk ventet fordi luftveiene er trange. Hev Pmax slik at Plimit ligger over Ppeak, og følg Pplateau.' },
        { when: ({ settings }) => settings.mode === 'SCMV' && settings.flowPattern === 'square' && settings.tip > 0, text: 'Riktig! (S)CMV med firkantflow og pause gir et platå du kan lese av ved hvert pust. Lokal metodebok (Hamilton C6) anbefaler dette ved alvorlig obstruksjon; APVcmv har ingen pause.' },
        { when: ({ settings, m }) => settings.mode === 'SCMV' && !m.pressureLimited && m.ppeak > m.pplat + 10, text: 'Riktig! Ppeak er høy, men Pplateau er lav. Forskjellen er trykket som trengs for å presse luft gjennom trange luftveier, ikke trykk i alveolene. Ppeak følger inspiratorisk flow og sier lite om hyperinflasjonen (Tuxen og Lane 1987).' },
        { when: ({ settings, m }) => settings.rate <= 12 && m.autoPeep < 5, text: 'Riktig! Lav frekvens (10–14) gir lang ekspirasjon og mindre luftfangst. Mål ved alvorlig astma: Pplateau under 30 (helst ≤ 25) og pH ≥ 7,20 (Tobin, kap. 30).' },
        { kind: 'obs', after: 'juster', when: ({ settings, m }) => settings.mode === 'SCMV' && m.pressureLimited && m.ppeak >= settings.pmax - 10.5, text: 'Obs: Også i (S)CMV begrenser Plimit (Pmax − 10) trykket: flowen kuttes, og hele Vt blir ikke levert. Hev Pmax så Plimit ligger godt over Ppeak.' },
        { kind: 'obs', when: ({ settings }) => settings.vt < 330, text: 'Obs: Å senke Vt for å stoppe trykkalarmen gir hypoventilasjon uten å løse problemet. Det er Plimit som er for lav.' },
        { kind: 'obs', when: ({ m }) => m.pplat >= 30, text: 'Obs: Pplateau er 30 cmH2O eller mer. Senk frekvens eller Vt, og forleng ekspirasjonen.' },
        { kind: 'info', after: 'juster', when: ({ gas }) => paco2(gas) > 7, text: 'PaCO2 er høy. Det aksepteres ved alvorlig astma så lenge pH er over ca. 7,20: kontrollert hypoventilering er tryggere enn høye trykk og hyperinflasjon (Darioli og Perret 1984).' },
      ],
      explanation: 'Ved alvorlig astma er luftveismotstanden svært høy, særlig i ekspirasjonen. I APVcmv justerer respiratoren trykket pust for pust for å nå Vt, men trykket stopper ved Plimit (Pmax − 10). Når motstanden øker, blir Vt ikke levert og respiratoren alarmerer. Topptrykket er høyt fordi luftveiene er trange; det sier lite om trykket i alveolene (Tuxen og Lane 1987). Lokal metodebok (Hamilton C6) anbefaler (S)CMV med firkantflow og inspiratorisk pause ved alvorlig obstruksjon: pausen viser platåtrykket ved hvert pust. Sett Pmax høyt nok til at Vt leveres, frekvens 10–14 og Vt 7–9 ml/kg som utgangspunkt, PEEP ≤ 5, og juster etter Pplateau under 30 (helst ≤ 25) og pH ≥ 7,20 (Tobin, kap. 30). Å unngå komplikasjoner prioriteres foran å korrigere hyperkapnien (Leatherman 2015). Høy PaCO2 aksepteres (Darioli og Perret 1984). Å senke Vt for å stoppe alarmen løser ikke problemet.',
    }],
  },
  // ---------------------------------------------------------------- O5
  {
    id: 'v-obstruktiv-astma-trigger',
    title: 'Astma i (S)CMV: triggede pust stjeler ekspirasjonstid',
    vignette: 'Mann, 24 år, 185 cm. Alvorlig astma, dag 1 på respirator. Ventileres i (S)CMV med firkantflow: Vt 520 ml, frekvens 12, I:E 1:3, pause 10 %, PEEP 3, O2 35 %, flowtrigger 2 l/min, Pmax 60. Dypt sedert (RASS −4) med propofol og fentanyl.',
    profileId: 'obstruktiv', patient: { height: 185, sex: 'M', compliance: 55, resistance: 28, resistanceExp: 38, effort: { amplitude: 0, rate: 20, duration: 0.8 } },
    settings: { mode: 'SCMV', vt: 520, rate: 12, peep: 3, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 3 }, tip: 10, flowPattern: 'square', pmax: 60, trigger: { type: 'flow', value: 2 } },
    gas: { shunt: 0.12, recruitability: 0.1, vco2: 240, deadspaceMl: 220 }, vitalsBase: { hr: 112, sys: 126, dia: 70, temp: 37.2 },
    variants: [{
      id: 'astma-trigger', sounds: { wheeze: 0.8 }, vitals: {}, delay: [8, 15], effect: { effort: { amplitude: 10, rate: 20, duration: 0.8 } },
      cues: [{ at: 0, who: 'obs', text: 'Du ser små, raske rykk i magen.' }, { at: 20, who: 'respirator', text: 'fTotal har steget til 20. Pustene er merket som pasienttrigget.' }, { at: 50, who: 'monitor', text: 'Blodtrykket faller.' }],
      clues: {
        lytt: 'Ekspiratoriske pipelyder. Ekspirasjonen avbrytes av neste pust.',
        se: 'Han ligger med lukkede øyne og reagerer ikke på tiltale (RASS −4), men mellomgulvet trekker seg sammen ca. 20 ganger i minuttet. Hver gang starter respiratoren et nytt pust, før ekspirasjonen er ferdig.',
        krets: 'Kretsen er tett og tørr. Ingen kondens eller lekkasje: triggingen kommer fra pasienten.',
        hold: 'Pplateau ca. 21 cmH2O, mot 15 for en time siden. Lungene blir fullere for hvert pust.',
        blodgass: 'pH 7,29, PaCO2 7,0 kPa og fallende, PaO2 13 kPa på 35 % O2, HCO3 25 mmol/l.',
      },
      fixes: { ...ventFix },
      harmful: { rekruttering: HARM_REKRUTTERING, sedasjon: 'Han er allerede dypt sedert, og blodtrykket faller. Mer sedasjon gir mer blodtrykksfall. Juster respiratoren.' },
      neutral: { ...OBSTR_NEUTRAL, lege: 'Legen: «Han er dypt sedert. Slå av triggeren så alle pust kommer på innstilt frekvens, og hold øye med blodtrykket.»', vaeske: 'Blodtrykket bedres litt, men årsaken er at lungene ikke rekker å tømme seg.', smertelindring: 'Han får fentanyl og har ingen tegn til smerte.' },
      ventFix: true,
      target: 'Pustene kommer på innstilt frekvens (fTotal ca. 12, ingen triggede pust) og Pplateau under 18 cmH2O. Metodeboka: trigget pust forkorter ekspirasjonen; hos dypt sederte i kontrollert modus slås triggeren av (Kontroller › Trigger «Av»).',
      // blodtrykket følger Pplateau (lungevolumet) her, fordi AutoPEEP ikke kan leses i triggede pust
      vitalsFn: ({ m }) => { const x = Math.max(0, (m.pplat ?? 0) - 16); return { sys: -3.5 * x, dia: -2 * x, hr: 2 * x }; },
      resolve: ({ m }) => m.fTotal <= 14 && m.breathType === 'mandatory' && m.pplat < 18,
      teach: [
        { kind: 'obs', when: ({ settings, m }) => settings.rate < 12 && m.breathType === 'triggered', text: 'Obs: Lavere innstilt frekvens hjelper ikke når pasienten trigger: da bestemmer han frekvensen selv. Hvert trigget pust forkorter ekspirasjonen.' },
        { kind: 'obs', when: ({ settings, m }) => settings.ie.e >= 4 && m.breathType === 'triggered', text: 'Obs: Kortere TI gir litt lengre ekspirasjon, men så lenge han trigger ca. 20 pust i minuttet, blir ekspirasjonen for kort.' },
        { when: ({ settings }) => settings.trigger.type === 'off', text: 'Riktig! Med triggeren av kommer alle pust på innstilt frekvens, og ekspirasjonen får den tiden du har satt. Lokal metodebok (Hamilton C6): trigget pust forkorter ekspirasjonen, så reduser TI eller slå av triggeren hos dypt sederte.' },
        { after: 'juster', when: ({ m }) => m.pplat < 18 && m.fTotal <= 14 && m.breathType === 'mandatory', text: 'Riktig! Pplateau faller når lungen får tømme seg mellom pustene, og blodtrykket bedres.' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.trigger.type === 'off', text: 'Trigger av passer bare så lenge pasienten er dypt sedert. Når sedasjonen lettes, må triggeren slås på igjen, ellers får han ingen hjelp når han prøver å puste.' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.trigger.type !== 'off' && settings.trigger.value >= 6, text: 'En svært ufølsom trigger virker nesten som trigger av. Metodeboka beskriver trigger av hos dypt sederte. Husk å gjøre triggeren følsom igjen når sedasjonen lettes.' },
      ],
      explanation: 'Selv dypt sederte pasienter med alvorlig astma kan ha sterk pustedrive. I (S)CMV med trigger på starter hvert pusteforsøk et fullt maskinpust med innstilt Vt. Frekvensen blir pasientens (ca. 20), ekspirasjonen blir kort, og luft fanges: Pplateau stiger og blodtrykket faller. Å senke innstilt frekvens eller TI hjelper lite, fordi pasienten bestemmer frekvensen. Lokal metodebok (Hamilton C6): trigget pust forkorter ekspirasjonen, så reduser TI eller slå av triggeren hos dypt sederte i kontrollert modus. Da kommer alle pust på innstilt frekvens. Hyperinflasjonen bestemmes av minuttventilasjonen og ekspirasjonstiden (Tuxen og Lane 1987). Trigger av krever at pasienten er dypt sedert; triggeren må på igjen når sedasjonen lettes.',
    }],
  },
  // ---------------------------------------------------------------- O6
  {
    id: 'v-obstruktiv-ets-kols',
    title: 'KOLS i SPONT: for lav ETS gir forsinket syklus',
    vignette: 'Kvinne, 74 år, 158 cm. KOLS, dag 6 på respirator, under avvenning. Lett sedert og puster selv i SPONT: trykkstøtte 10 over PEEP 5, O2 35 %, ETS 5 %, TI max 2,5 s. ETS og TI max ble endret i natt for å gi henne «lengre og dypere» pust.',
    profileId: 'obstruktiv', patient: { height: 158, sex: 'K', compliance: 50, resistance: 22, resistanceExp: 30, effort: { amplitude: 6, rate: 20, duration: 0.8 } },
    settings: { mode: 'SPONT', psupport: 10, peep: 5, fio2: 35, ets: 5, pramp: 50, trigger: { type: 'flow', value: 2 }, apneaTime: 20, tiMax: 2.5 },
    gas: { shunt: 0.1, recruitability: 0.1, vco2: 160, deadspaceMl: 130 }, vitalsBase: { hr: 98, sys: 136, dia: 72, temp: 37.3 },
    variants: [{
      id: 'ets', sounds: { wheeze: 0.4 }, vitals: { hr: 8, sys: 6 }, delay: [8, 15], effect: { resistanceExp: 1.2, rampIn: 30 },
      cues: [{ at: 0, who: 'obs', text: 'Hun strammer magemusklene mot slutten av hver inspirasjon, som om hun vil puste ut.' }, { at: 30, who: 'obs', text: 'Du teller 20 pusteforsøk i minuttet. Respiratoren viser fTotal 10 og TI over 2 s.' }, { at: 60, who: 'kollega', text: '«Hun ser sliten ut. Skal vi øke trykkstøtten?»' }],
      clues: {
        lytt: 'Forlenget ekspirium med pipelyder.',
        se: 'Hun puster aktivt ut med magemusklene før respiratoren slipper. Annenhver innåndingsbevegelse gir ingen pust.',
        krets: 'Kretsen er tett. Ingen lekkasje.',
        hold: 'Hold er upålitelig fordi hun puster aktivt. På flowkurven faller inspirasjonsflowen sakte og er nesten null før respiratoren går over til ekspirasjon. Inspirasjonen varer ca. 2,3 s, mens hennes egen innånding varer under 1 s.',
        blodgass: 'pH 7,36, PaCO2 7,0 kPa, PaO2 13 kPa på 35 % O2, HCO3 29 mmol/l.',
      },
      fixes: { ...ventFix },
      harmful: { rekruttering: HARM_REKRUTTERING, sedasjon: 'Sedasjon demper pustedriven midt i avvenningen og løser ikke asynkronien.' },
      neutral: { ...OBSTR_NEUTRAL, lege: 'Legen: «Respiratoren slipper for sent. Sett ETS opp til 30–50 % og TI max tilbake til ca. 1,5 s.»', sedasjonNed: 'Hun er allerede lett sedert.' },
      ventFix: true,
      target: 'ETS 30–50 %, TI under ca. 1,2 s, alle pusteforsøk trigger (fTotal ca. 20) og Vt minst 5 ml/kg IBW. Sett gjerne TI max tilbake til ca. 1,5 s.',
      resolve: ({ m, settings }) => settings.ets >= 30 && m.ti <= 1.2 && m.fSpont >= 17 && m.vtPerKg >= 5,
      teach: [
        { kind: 'obs', when: ({ settings }) => settings.psupport >= 13 && settings.ets < 30, text: 'Obs: Mer trykkstøtte med lav ETS forlenger inspirasjonen enda mer, gir større Vt og flere ineffektive pusteforsøk.' },
        { when: ({ settings }) => settings.ets >= 30, text: 'Riktig! Med høyere ETS slipper respiratoren når flowen har falt til 30–50 % av toppflow, ikke 5 %. Ved KOLS faller inspirasjonsflowen sakte, så lav ETS gir forsinket syklus. ETS 70 % mot 10 % ga mindre forsinkelse, lavere PEEPi og færre ineffektive pusteforsøk hos pasienter med obstruktiv sykdom (Tassaux 2005).' },
        { when: ({ m }) => m.fSpont >= 17 && m.ti <= 1.2, text: 'Riktig! Inspirasjonen slutter nå omtrent når hun slutter å puste inn. Hun rekker å puste ut, og alle pusteforsøk trigger.' },
        { kind: 'info', after: 'juster', when: ({ m }) => m.vtPerKg < 5.5, text: 'Vt er litt lavt etter kortere inspirasjon. Øk trykkstøtten 1–2 cmH2O hvis hun virker sliten.' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.tiMax > 2, text: 'TI max står på 2,5 s. Sett den tilbake til ca. 1,5 s, så har du en sikkerhetsgrense hvis ETS ikke nås.' },
      ],
      explanation: 'I SPONT går respiratoren over til ekspirasjon når inspirasjonsflowen har falt til en innstilt andel av toppflow (ETS). Ved KOLS faller flowen sakte fordi motstanden er høy. Med ETS 5 % fortsetter respiratoren å blåse inn lenge etter at pasienten har sluttet å puste inn (forsinket syklus). Pasienten begynner å puste aktivt ut mot respiratoren, ekspirasjonstiden blir kort, PEEPi øker, og neste pusteforsøk blir ineffektivt. Høyere ETS (30–50 % er vanlig ved KOLS) gir kortere inspirasjon, lavere PEEPi og færre ineffektive pusteforsøk (Tassaux 2005). Mer trykkstøtte forverrer forsinket syklus. TI max bør stå på ca. 1,5 s som sikkerhetsgrense.',
    }],
  },
  // ---------------------------------------------------------------- O7
  {
    id: 'v-obstruktiv-pcv-ti',
    title: 'KOLS i PCV+: for lang TI',
    vignette: 'Mann, 69 år, 172 cm. KOLS-eksaserbasjon, intubert i går. Ventileres i PCV+: Pcontrol 14 over PEEP 5, frekvens 16, TI 1,8 s, O2 30 %. Sedert, puster ikke selv. Vt var ca. 490 ml (7 ml/kg) i morges.',
    profileId: 'obstruktiv', patient: { height: 172, sex: 'M', compliance: 50, resistance: 12, resistanceExp: 30, effort: { amplitude: 0, rate: 14, duration: 1 } },
    settings: { mode: 'PCV', pcontrol: 14, rate: 16, peep: 5, fio2: 30, timingMode: 'ti', ti: 1.8, pramp: 50, pmax: 45, trigger: { type: 'flow', value: 2 } },
    gas: { shunt: 0.1, recruitability: 0.1, vco2: 220, deadspaceMl: 220 }, gasStart: { paco2: 7.6 }, vitalsBase: { hr: 92, sys: 130, dia: 72, temp: 37.0 },
    variants: [{
      id: 'pcv-ti', sounds: { wheeze: 0.6 }, vitals: { hr: 6 }, delay: [8, 15], effect: { resistanceExp: 1.4, rampIn: 40 },
      cues: [{ at: 0, who: 'obs', text: 'Pipelydene har tiltatt.' }, { at: 40, who: 'kollega', text: '«Vt har falt til rundt 410. Skal vi øke Pcontrol?»' }],
      clues: {
        lytt: 'Ekspiratoriske pipelyder og forlenget ekspirium over begge lunger.',
        se: 'Inspirasjonsflowen er nesten null etter ca. 1,2 s, men trykket holdes til TI er over (1,8 s). Ekspirasjonsflowen når ikke null før neste pust. TE er bare ca. 1,9 s.',
        krets: 'Kretsen er tett.',
        hold: 'Ekspiratorisk hold: AutoPEEP ca. 5 cmH2O. Inspiratorisk hold: Pplateau ca. 18 cmH2O.',
        blodgass: 'pH 7,37, PaCO2 7,5 kPa og stigende, PaO2 12 kPa på 30 % O2, HCO3 32 mmol/l.',
      },
      fixes: { ...ventFix },
      harmful: { rekruttering: HARM_REKRUTTERING },
      neutral: { ...OBSTR_NEUTRAL, lege: 'Legen: «Ikke øk trykket. Se på flowkurven: kort ned TI så han får lengre tid til å puste ut.»' },
      ventFix: true,
      target: 'TI ca. 1,0–1,2 s (TE minst 2 × TI), AutoPEEP under 3,5 cmH2O og Vt minst 5,5 ml/kg IBW, uten å øke Pcontrol.',
      vitalsFn: autoPeepBT(4, 2),
      resolve: ({ m }) => m.autoPeep < 3.5 && m.vtPerKg >= 5.5 && m.te >= 2 * m.ti,
      teach: [
        { kind: 'obs', when: ({ settings, m }) => settings.pcontrol >= 17 && m.autoPeep > 4, text: 'Obs: Høyere Pcontrol gir større Vt nå, men mer luft må ut på like kort tid. AutoPEEP og Pplateau stiger.' },
        { when: ({ settings }) => settings.timingMode === 'ti' && settings.ti <= 1.2, text: 'Riktig! Inspirasjonsflowen var nesten null den siste delen av TI. Den tiden ga lite volum, men tok tid fra ekspirasjonen. Kortere TI koster lite Vt og gir mye lengre TE.' },
        { after: 'juster', when: ({ m }) => m.autoPeep < 3.5 && m.vtPerKg >= 5.5, text: 'Riktig! I PCV+ spiser AutoPEEP av trykkforskjellen som driver luften inn. Når AutoPEEP faller, øker Vt uten at du har økt trykket.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Se på flowkurven i PCV+: inspirasjonsflowen bør så vidt nå null ved slutten av TI, og ekspirasjonsflowen bør nå null før neste pust.' },
        { kind: 'obs', when: ({ settings }) => settings.rate > 16, text: 'Obs: Høyere frekvens gir kortere ekspirasjon og mer luftfangst.' },
      ],
      explanation: 'I PCV+ holdes trykket i hele TI. Ved KOLS fyller lungen seg raskere enn den tømmer seg, fordi motstanden er høyest i ekspirasjonen. Med TI 1,8 s er inspirasjonsflowen nesten null lenge før TI er over: tiden gir lite volum, men stjeler tid fra ekspirasjonen. Luft fanges, og AutoPEEP stiger. I trykkontroll reduserer AutoPEEP trykkforskjellen som driver luft inn, så Vt faller. Riktig tiltak er kortere TI (I:E 1:2 eller lengre), slik at inspirasjonsflowen så vidt når null og ekspirasjonen blir lengre. Hyperinflasjonen avtar når TE øker (Tuxen og Lane 1987), og Vt stiger igjen. Høyere Pcontrol gir mer luftfangst.',
    }],
  },
  // ---------------------------------------------------------------- O8
  {
    id: 'v-obstruktiv-hypotensjon',
    title: 'KOLS etter intubasjon: hypotensjon av luftfangst',
    vignette: 'Kvinne, 58 år, 165 cm. KOLS-eksaserbasjon, nettopp intubert og overflyttet fra akuttmottaket, der hun ble ventilert med bag. Respiratoren står i APVcmv: Vt 500 ml, frekvens 22, I:E 1:2, PEEP 5, O2 50 %. Sedert etter intubasjonen, puster ikke selv.',
    profileId: 'obstruktiv', patient: { height: 165, sex: 'K', compliance: 55, resistance: 16, resistanceExp: 30, effort: { amplitude: 0, rate: 14, duration: 1 } },
    settings: { mode: 'APVCMV', vt: 500, rate: 22, peep: 5, fio2: 50, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, pmax: 50, trigger: { type: 'flow', value: 2 } },
    gas: { shunt: 0.2, recruitability: 0.1, vco2: 200, deadspaceMl: 200 }, gasStart: { paco2: 9.0 }, vitalsBase: { hr: 112, sys: 112, dia: 64, temp: 37.1 },
    variants: [{
      id: 'hypotensjon', sounds: { wheeze: 0.8 }, vitals: {}, delay: [5, 10], effect: { resistanceExp: 1.8, rampIn: 40 },
      cues: [{ at: 0, who: 'monitor', text: 'Blodtrykket faller.' }, { at: 25, who: 'obs', text: 'Halsvenene er fylte. Brystkassen er tønneformet og beveger seg lite.' }, { at: 50, who: 'kollega', text: '«Skal jeg henge opp en væskebolus?»' }],
      clues: {
        lytt: 'Svært svake respirasjonslyder med lange pipelyder, likt på begge sider.',
        se: 'Overoppblåst brystkasse og fylte halsvener. Ekspirasjonsflowen når ikke null før neste pust. Trachea står midt.',
        krets: 'Kretsen er tett.',
        hold: 'Ekspiratorisk hold: AutoPEEP ca. 10 cmH2O (total PEEP ca. 15). Inspiratorisk hold: Pplateau ca. 24 cmH2O.',
        blodgass: 'Gass fra mottaket for 20 minutter siden: pH 7,24, PaCO2 9,0 kPa, HCO3 29 mmol/l. Minuttvolumet nå er ca. 11 l/min, så PaCO2 er på vei ned.',
      },
      fixes: { ...ventFix },
      harmful: { rekruttering: HARM_REKRUTTERING, sedasjon: 'Mer sedasjon senker blodtrykket ytterligere og endrer ikke luftfangsten.' },
      neutral: { ...OBSTR_NEUTRAL, lege: 'Legen: «Dette er luftfangst. Senk frekvensen og Vt, og gi henne lang ekspirasjon. Blir trykket kritisk lavt, kobler vi henne kort fra.»', vaeske: 'Væske hever blodtrykket litt en stund, men årsaken er trykket i brystkassen, som hindrer blodet i å komme tilbake til hjertet.' },
      ventFix: true,
      target: 'AutoPEEP under 4 cmH2O og blodtrykket tilbake: frekvens 10–14, Vt ca. 7–8 ml/kg IBW (ca. 400–450 ml) og I:E 1:3 eller lengre. Aksepter høyere PaCO2 (pH over ca. 7,20).',
      vitalsFn: autoPeepBT(3, 3.5),
      resolve: ({ m, settings }) => m.autoPeep < 4 && settings.rate <= 14 && m.vtPerKg <= 8.5,
      teach: [
        { kind: 'obs', when: ({ m }) => m.autoPeep > 8, text: 'Obs: AutoPEEP er over 8 cmH2O. Trykket i brystkassen hindrer venøs tilbakestrømning, og blodtrykket faller. AutoPEEP kan gi alvorlig sirkulasjonssvikt og må måles med ekspiratorisk hold (Pepe og Marini 1982).' },
        { kind: 'info', when: ({ m }) => m.autoPeep > 9, text: 'Er blodtrykket kritisk lavt, kan legen koble pasienten kort fra respiratoren (apné i 30–60 s) så lungen tømmer seg. Bedres blodtrykket, er luftfangst årsaken.' },
        { when: ({ settings }) => settings.rate <= 14, text: 'Riktig! Lavere frekvens gir lengre ekspirasjon. Minuttventilasjonen er det som betyr mest for hyperinflasjonen (Tuxen og Lane 1987).' },
        { after: 'juster', when: ({ m, settings }) => m.vtPerKg <= 8 && m.vtPerKg >= 6 && settings.rate <= 16, text: 'Riktig! Vt ca. 7–8 ml/kg IBW gir mindre volum som skal ut for hvert pust.' },
        { after: 'juster', when: ({ m }) => m.autoPeep < 4, text: 'Riktig! AutoPEEP faller, og blodtrykket kommer tilbake i samme takt.' },
        { kind: 'obs', when: ({ settings, m }) => settings.rate > 22 && m.vtPerKg < 8, text: 'Obs: Lavere Vt med høyere frekvens gir samme minuttvolum og enda kortere ekspirasjon. AutoPEEP faller ikke.' },
        { kind: 'info', after: 'juster', when: ({ gas, settings }) => paco2(gas) > 7 && settings.rate <= 14, text: 'PaCO2 stiger igjen når minuttventilasjonen senkes. Det aksepteres så lenge pH er over ca. 7,20 (BTS/ICS 2016). Sirkulasjonen er viktigst nå.' },
      ],
      explanation: 'Etter intubasjon blir obstruktive pasienter ofte ventilert med for høy frekvens og for stort Vt, både med bag og på respiratoren. Lungen rekker ikke å tømme seg, og luft fanges. AutoPEEP øker trykket i brystkassen, reduserer venøs tilbakestrømning og kan gi alvorlig hypotensjon (Pepe og Marini 1982). Funnene er fylte halsvener, overoppblåst brystkasse og ekspirasjonsflow som ikke når null. Pneumothorax er en differensialdiagnose: lytt etter ensidighet. Tiltaket er lavere minuttventilasjon: frekvens 10–14, Vt ca. 7–8 ml/kg IBW og lang ekspirasjon. Hyperinflasjon og hypotensjon øker med minuttventilasjonen (Tuxen og Lane 1987). Ved truende sirkulasjonssvikt kan legen koble pasienten kort fra (apné i 30–60 s). Høyere PaCO2 aksepteres (pH over ca. 7,20). Væske hjelper bare kortvarig.',
    }],
  },
  // ---------------------------------------------------------------- O9
  {
    id: 'v-obstruktiv-duopap-kols',
    title: 'KOLS i DuoPAP: for kort tid på PEEP-nivå',
    vignette: 'Mann, 61 år, 180 cm. KOLS-eksaserbasjon, intubert i dag. Startet i DuoPAP: P high 24, PEEP 5, frekvens 20, T high 1,5 s, trykkstøtte 10, O2 40 %. Sedert etter intubasjonen og puster ikke selv ennå.',
    profileId: 'obstruktiv', patient: { height: 180, sex: 'M', compliance: 55, resistance: 14, resistanceExp: 28, effort: { amplitude: 0, rate: 14, duration: 1 } },
    settings: { mode: 'DUOPAP', phigh: 24, rate: 20, peep: 5, psupport: 10, fio2: 40, timingMode: 'ti', ti: 1.5, pramp: 50, ets: 35, pmax: 45, trigger: { type: 'flow', value: 2 } },
    gas: { shunt: 0.18, recruitability: 0.1, vco2: 220, deadspaceMl: 320 }, gasStart: { paco2: 6.0 }, vitalsBase: { hr: 100, sys: 130, dia: 72, temp: 37.5 },
    variants: [{
      id: 'duopap', sounds: { wheeze: 0.6 }, vitals: {}, delay: [8, 15], effect: { resistanceExp: 1.2, rampIn: 30 },
      cues: [{ at: 0, who: 'obs', text: 'Brystkassen rekker ikke å synke før trykket går opp igjen.' }, { at: 40, who: 'monitor', text: 'Blodtrykket har falt litt.' }],
      clues: {
        lytt: 'Ekspiratoriske pipelyder. Ekspirasjonen avbrytes av neste trykkøkning.',
        se: 'Flowkurven: ekspirasjonsflowen er fortsatt høy når trykket går opp til P high igjen. Tiden på PEEP-nivå (T low) er bare 1,5 s.',
        krets: 'Kretsen er tett.',
        hold: 'Ekspiratorisk hold: AutoPEEP ca. 7–8 cmH2O. Inspiratorisk hold: Pplateau ca. 22 cmH2O.',
        blodgass: 'pH 7,44, PaCO2 5,8 kPa, PaO2 11 kPa på 40 % O2, HCO3 30 mmol/l.',
      },
      fixes: { ...ventFix },
      harmful: { rekruttering: HARM_REKRUTTERING },
      neutral: { ...OBSTR_NEUTRAL, lege: 'Legen: «DuoPAP er greit, men han trenger lengre tid på PEEP-nivå. Senk frekvensen, og juster P high etter Vt.»' },
      ventFix: true,
      target: 'T low (60/frekvens − T high) minst 3 s og AutoPEEP under 3 cmH2O: frekvens ca. 12, T high ca. 1,2–1,5 s. Når AutoPEEP faller, øker Vt: juster P high så Vt blir 6–8 ml/kg IBW (ca. 450–600 ml).',
      vitalsFn: autoPeepBT(3, 2),
      resolve: ({ m, settings }) => m.autoPeep < 3 && vtOk(m, 5.5, 8.5) && 60 / settings.rate - settings.ti >= 3,
      teach: [
        { when: ({ settings }) => 60 / settings.rate - settings.ti >= 3, text: 'Riktig! I DuoPAP er ekspirasjonstiden tiden på PEEP-nivå: T low = 60/frekvens − T high. Ved KOLS må den være lang nok til at lungen tømmer seg.' },
        { kind: 'obs', after: 'juster', when: ({ m, settings }) => m.autoPeep > 5 && 60 / settings.rate - settings.ti < 3, text: 'Obs: AutoPEEP er fortsatt høy. Lavere P high gir mindre Vt, men tiden på PEEP-nivå er fortsatt for kort. Senk frekvensen.' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 9, text: 'Obs: Vt er over 9 ml/kg IBW. Når luftfangsten minker, gir samme P high større Vt. Senk P high.' },
        { after: 'juster', when: ({ m }) => m.autoPeep < 3 && vtOk(m), text: 'Riktig! AutoPEEP er lav og Vt er 6–8 ml/kg IBW. Trykkforskjellen mellom P high og alveoletrykket ved slutten av ekspirasjonen bestemmer Vt.' },
        { kind: 'obs', when: ({ settings }) => settings.ti >= 2.5 && 60 / settings.rate - settings.ti < 2, text: 'Obs: Lang T high med kort tid på PEEP-nivå ligner APRV. APRV er kontraindisert ved astma og alvorlig KOLS (Metodebok).' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Metodeboka bruker DuoPAP ved oppstart. Ved KOLS gjelder samme regel som i andre moduser: gi tid til ekspirasjon, og sett PEEP lavt (ca. 50–80 % av PEEPi).' },
      ],
      explanation: 'DuoPAP veksler mellom to trykknivåer: P high i T high, og PEEP i resten av syklusen (T low). Uten egenpust virker det som trykkontroll, og T low er ekspirasjonstiden. Med frekvens 20 og T high 1,5 s blir T low bare 1,5 s. Ved KOLS rekker ikke lungen å tømme seg, luft fanges og AutoPEEP stiger. Senk frekvensen (ca. 12) så T low blir minst 3 s. Når AutoPEEP faller, øker trykkforskjellen og Vt stiger: senk P high så Vt blir 6–8 ml/kg IBW. DuoPAP er Metodebokas oppstartsmodus, men innstillingene må tilpasses obstruksjonen. Lang T high med kort T low ligner APRV, som er kontraindisert ved astma og alvorlig KOLS (Metodebok).',
    }],
  },
  // ---------------------------------------------------------------- O10
  {
    id: 'v-obstruktiv-astma-co2',
    title: 'Astma i PCV+: høyere frekvens gir ikke lavere CO2',
    vignette: 'Kvinne, 45 år, 172 cm. Alvorlig astma, dag 2 på respirator. Ventileres i PCV+: Pcontrol 20 over PEEP 5, TI 1,0 s, O2 35 %. I natt ble frekvensen økt fra 14 til 26 for å få ned PaCO2, som var 7,6 kPa. Dypt sedert, puster ikke selv.',
    profileId: 'obstruktiv', patient: { height: 172, sex: 'K', compliance: 42, resistance: 30, resistanceExp: 45, effort: { amplitude: 0, rate: 14, duration: 1 } },
    settings: { mode: 'PCV', pcontrol: 20, rate: 26, peep: 5, fio2: 35, timingMode: 'ti', ti: 1.0, pramp: 50, pmax: 45, trigger: { type: 'flow', value: 2 } },
    gas: { shunt: 0.12, recruitability: 0.1, vco2: 210, deadspaceMl: 180 }, vitalsBase: { hr: 116, sys: 128, dia: 72, temp: 37.1 },
    variants: [{
      id: 'astma-co2', sounds: { wheeze: 0.8 }, vitals: {}, delay: [5, 10], effect: {},
      cues: [{ at: 0, who: 'kollega', text: '«Ny blodgass: PaCO2 er ikke lavere enn i natt, 8,2. Skal vi skru frekvensen enda høyere?»' }, { at: 30, who: 'obs', text: 'Vt på skjermen er bare ca. 290 ml.' }],
      clues: {
        lytt: 'Ekspiratoriske pipelyder over begge lunger. Ekspirasjonen avbrytes av neste pust.',
        se: 'Ekspirasjonsflowen er langt fra null når neste pust starter. TE er bare 1,3 s. Brystkassen er overoppblåst.',
        krets: 'Kretsen er tett.',
        hold: 'Ekspiratorisk hold: AutoPEEP ca. 7 cmH2O. Inspiratorisk hold: Pplateau ca. 19 cmH2O.',
        blodgass: 'pH 7,19, PaCO2 8,2 kPa, PaO2 12 kPa på 35 % O2, HCO3 23 mmol/l.',
      },
      fixes: { ...ventFix },
      harmful: { rekruttering: HARM_REKRUTTERING },
      neutral: { ...OBSTR_NEUTRAL, lege: 'Legen: «Frekvensen tilbake til ca. 14. Vi aksepterer PaCO2 rundt 7–8 så lenge pH er over 7,20.»', sedasjon: 'Hun er dypt sedert og puster ikke selv.' },
      ventFix: true,
      target: 'Frekvens tilbake til ca. 12–16, AutoPEEP under 3 cmH2O og Vt minst 5,5 ml/kg IBW (helst 6–8). Aksepter PaCO2 rundt 7–8 kPa så lenge pH er over ca. 7,20.',
      vitalsFn: autoPeepBT(3, 2.5),
      resolve: ({ m, settings }) => settings.rate <= 16 && m.autoPeep < 3 && m.vtPerKg >= 5.5,
      teach: [
        { kind: 'obs', when: ({ settings }) => settings.rate > 26, text: 'Obs: Enda høyere frekvens gir enda kortere ekspirasjon. Vt faller mer, en større del av hvert pust blir dødrom, og PaCO2 stiger.' },
        { kind: 'obs', when: ({ settings }) => settings.pcontrol >= 24 && settings.rate > 16, text: 'Obs: Høyere trykk ved høy frekvens presser inn mer luft enn lungen rekker å tømme. CO2 faller, men luftfangsten øker.' },
        { when: ({ settings }) => settings.rate <= 16, text: 'Riktig! Lavere frekvens gir lengre ekspirasjon. AutoPEEP faller, og i PCV+ øker Vt når AutoPEEP faller.' },
        { after: 'juster', when: ({ m }) => m.autoPeep < 3 && m.vtPerKg >= 6, text: 'Riktig! Vt er tilbake over 6 ml/kg. PaCO2 blir omtrent som før frekvensøkningen, men uten luftfangst.' },
        { kind: 'info', after: 'juster', when: ({ gas }) => paco2(gas) > 7, text: 'PaCO2 7–8 kPa aksepteres ved alvorlig astma (permissiv hyperkapni). Målene er Pplateau under 30 og pH over ca. 7,20. Hyperinflasjon er farligere enn hyperkapni (Darioli og Perret 1984; Leatherman 2015).' },
      ],
      explanation: 'Ved alvorlig astma er ekspirasjonen svært langsom. Når frekvensen økes, blir ekspirasjonen kortere, luft fanges og AutoPEEP stiger. I PCV+ reduserer AutoPEEP trykkforskjellen som driver luft inn, så Vt faller. Med mindre Vt blir en større del av hvert pust dødrom, og den alveolære ventilasjonen øker lite eller faller: PaCO2 går ikke ned, men risikoen for hyperinflasjon, hypotensjon og pneumothorax øker. Hyperinflasjonen bestemmes særlig av minuttventilasjonen (Tuxen og Lane 1987). Strategien ved alvorlig astma er kontrollert hypoventilering: frekvens ca. 10–14, lav PEEP, Pplateau under 30 og pH over ca. 7,20 (Tobin, kap. 30), og høy PaCO2 aksepteres (Darioli og Perret 1984; Leatherman 2015).',
    }],
  },
];
