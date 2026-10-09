/**
 * Scenariokatalog for blodgasstreneren. Rene data.
 *
 * Hvert scenario beskriver den underliggende forstyrrelsen og rammene generatoren
 * bygger verdiene fra. Teksten er en kort klinisk vignett; {alder}/{kjonn} fylles inn.
 *
 * Felt:
 *  level      1 enkel, 2 kompensert, 3 blandet
 *  primary    'met-acidose' | 'met-alkalose' | 'resp-acidose' | 'resp-alkalose'
 *  agType     'hoy' | 'normal' (metabolsk acidose)
 *  chronic    true for kronisk respiratorisk forstyrrelse
 *  secondary  tilleggsforstyrrelse (nivå 3): 'resp-acidose' | 'resp-alkalose' | 'met-alkalose' | 'met-acidose-normal-ag' | 'met-acidose-hoy-ag'
 *  severity   [min, max] for primærverdien: HCO3 (mmol/L) for metabolsk, PaCO2 (kPa) for respiratorisk
 *  lung       'normal' | 'lett' | 'moderat' | 'alvorlig' (A–a-gradient)
 *  fio2       mulige FiO2-verdier
 *  labs       overstyringer: lactate, glucose, k, albumin, na [min, max]
 *  causes     riktige årsaker (id-er fra CAUSES)
 *  distractors feil årsaker som vises som alternativer
 */
export const CAUSES = {
  sepsis: 'Sepsis / hypoperfusjon (laktacidose)',
  dka: 'Diabetisk ketoacidose',
  uremi: 'Nyresvikt (uremisk acidose)',
  intox: 'Forgiftning (metanol, etylenglykol)',
  salisylat: 'Salisylatforgiftning',
  hjertestans: 'Hjertestans / sirkulasjonsstans',
  diare: 'Diaré (tap av bikarbonat)',
  rta: 'Renal tubulær acidose',
  nacl: 'Store mengder NaCl 0,9 % (hyperkloremi)',
  oppkast: 'Oppkast / ventrikkelsonde-tap (tap av HCl)',
  diuretika: 'Slyngediuretika (klorid-/volumtap)',
  opioid: 'Opioid / sedasjon (hypoventilasjon)',
  kols: 'KOLS-eksaserbasjon',
  kolsKronisk: 'KOLS med kronisk hyperkapni',
  nevromusk: 'Nevromuskulær svakhet (f.eks. Guillain-Barré, myasteni)',
  astma: 'Alvorlig astma med utmattelse',
  angst: 'Angst / smerte (hyperventilasjon)',
  le: 'Lungeemboli',
  pneumoni: 'Pneumoni',
  ards: 'ARDS',
  graviditet: 'Graviditet (kronisk hyperventilasjon)',
  hoyde: 'Opphold i stor høyde',
  cirrhose: 'Levercirrhose (hyperventilasjon)',
  respirator: 'Hyperventilasjon på respirator',
  hypovolemi: 'Hypovolemi (kontraksjonsalkalose)',
  metformin: 'Metformin-assosiert laktacidose',
  co: 'Karbonmonoksidforgiftning',
  lungeodem: 'Kardialt lungeødem',
  gbs: 'Guillain-Barré (respirasjonsmuskelsvikt)',
  ohs: 'Obesitas-hypoventilasjonssyndrom',
  posthyperkapni: 'Posthyperkapnisk metabolsk alkalose',
  steroid: 'Steroider / mineralkortikoid-effekt',
  krampe: 'Generalisert krampeanfall (laktat)',
  blodning: 'Hemoragisk sjokk',
  feber: 'Feber / tidlig sepsis (hyperventilasjon)',
  normal: 'Ingen syre–base-forstyrrelse',
  sedasjon: 'Dyp sedasjon / anestesi (hypoventilasjon)',
};

export const SCENARIOS = [
  // ---------- Nivå 1: enkle ----------
  {
    id: 'normal', age: [20, 70], level: 1, primary: 'normal', lung: 'normal', fio2: [0.21],
    labs: { lactate: [0.6, 1.4] },
    text: '{Kjonn}, {alder} år, tatt arteriell blodgass preoperativt før en elektiv operasjon. Frisk, ingen faste medisiner.',
    causes: ['normal'], distractors: ['angst', 'dka', 'kols', 'oppkast'],
  },
  {
    id: 'metformin', age: [55, 85], level: 1, primary: 'met-acidose', agType: 'hoy', severity: [6, 13], lung: 'lett', fio2: [0.21, 0.28],
    labs: { lactate: [9, 16], k: [4.8, 5.8], glucose: [6, 12], albumin: [30, 38] },
    text: '{Kjonn}, {alder} år, diabetes type 2 på metformin. Gastroenteritt i tre dager, drukket lite. Nå somnolent med lavt blodtrykk og kreatinin tre ganger normalverdi.',
    causes: ['metformin', 'uremi'], distractors: ['dka', 'oppkast', 'opioid', 'angst'],
  },
  {
    id: 'blodning', age: [18, 75], level: 1, primary: 'met-acidose', agType: 'hoy', severity: [10, 16], lung: 'lett', fio2: [0.21, 0.35, 0.5],
    labs: { lactate: [5, 10], k: [3.6, 4.4], glucose: [7, 12] },
    text: '{Kjonn}, {alder} år, traume med bekkenbrudd. Blodtrykk 75/40, puls 135, kald perifert. Har fått 1 liter krystalloid.',
    causes: ['blodning', 'sepsis'], distractors: ['dka', 'opioid', 'diare', 'angst'],
  },
  {
    id: 'krampe', age: [18, 60], level: 1, primary: 'met-acidose', agType: 'hoy', severity: [10, 16], lung: 'normal', fio2: [0.21],
    labs: { lactate: [6, 12], k: [4.2, 5.2], glucose: [6, 10] },
    text: '{Kjonn}, {alder} år, kjent epilepsi, hadde et generalisert krampeanfall for ti minutter siden. Nå postiktal, blodgassen er tatt rett etter anfallet.',
    causes: ['krampe'], distractors: ['dka', 'sepsis', 'opioid', 'salisylat'],
  },
  {
    id: 'co', age: [20, 70], level: 1, primary: 'met-acidose', agType: 'hoy', severity: [11, 17], lung: 'normal', fio2: [1.0],
    labs: { lactate: [4, 8], k: [3.8, 4.6] },
    text: '{Kjonn}, {alder} år, funnet bevisstløs i en garasje med bilmotoren i gang. Får 100 % oksygen på maske. SpO2 viser 99 %, men huden er påfallende rosa.',
    causes: ['co', 'sepsis'], distractors: ['dka', 'opioid', 'angst', 'diare'],
  },
  {
    id: 'gbs', age: [20, 70], level: 1, primary: 'resp-acidose', chronic: false, severity: [7.5, 9.5], lung: 'lett', fio2: [0.21, 0.28],
    labs: { lactate: [0.8, 1.6] },
    text: '{Kjonn}, {alder} år, innlagt med stigende lammelser i beina etter en mageinfeksjon. Nå svak hoste, snakker i korte setninger. Vitalkapasitet målt til 12 ml/kg.',
    causes: ['gbs', 'nevromusk'], distractors: ['opioid', 'kolsKronisk', 'angst', 'astma'],
  },
  {
    id: 'sedasjon', age: [25, 85], level: 1, primary: 'resp-acidose', chronic: false, severity: [7.5, 10], lung: 'normal', fio2: [0.21, 0.28],
    labs: { lactate: [0.8, 1.6] },
    text: '{Kjonn}, {alder} år, fikk midazolam og morfin før en prosedyre på intensiv. Nå dypt sedert, respirasjonsfrekvens 7, SpO2 91 % på nesekateter.',
    causes: ['sedasjon', 'opioid'], distractors: ['kolsKronisk', 'angst', 'le', 'dka'],
  },
  {
    id: 'lungeodem', age: [55, 90], level: 1, primary: 'resp-alkalose', chronic: false, severity: [3.2, 4.2], lung: 'alvorlig', fio2: [0.35, 0.6, 0.8],
    labs: { lactate: [1.5, 3.5], k: [3.6, 4.6] },
    text: '{Kjonn}, {alder} år, kjent hjertesvikt. Våknet med akutt tungpust, sitter oppreist, rosa skummende ekspektorat, fuktige knatrelyder over begge lunger. CPAP er startet.',
    causes: ['lungeodem'], distractors: ['le', 'angst', 'astma', 'opioid'],
  },
  {
    id: 'feber', age: [18, 85], level: 1, primary: 'resp-alkalose', chronic: false, severity: [3.4, 4.3], lung: 'lett', fio2: [0.21],
    labs: { lactate: [1.2, 2.4], k: [3.5, 4.3] },
    text: '{Kjonn}, {alder} år, feber 39,8, frostanfall og respirasjonsfrekvens 28. Blodtrykket er normalt. Mistenkt pneumoni, blodgass tatt i mottak.',
    causes: ['feber', 'pneumoni'], distractors: ['angst', 'dka', 'opioid', 'oppkast'],
  },
  {
    id: 'astma-tidlig', age: [16, 50], level: 1, primary: 'resp-alkalose', chronic: false, severity: [3.4, 4.2], lung: 'moderat', fio2: [0.21, 0.28],
    labs: { lactate: [1.0, 2.5] },
    text: '{Kjonn}, {alder} år, astmaanfall som startet for en time siden. Pipelyder, respirasjonsfrekvens 30, snakker i setninger. Dette er den første blodgassen.',
    causes: ['astma'], distractors: ['angst', 'le', 'opioid', 'kolsKronisk'],
  },
  {
    id: 'sepsis-laktat', age: [35, 88], level: 1, primary: 'met-acidose', agType: 'hoy', severity: [10, 17], lung: 'lett', fio2: [0.21, 0.28, 0.35],
    labs: { lactate: [4, 9], albumin: [26, 34], k: [3.8, 4.8] },
    text: '{Kjonn}, {alder} år, innlagt med feber, frostanfall og flankesmerter. Blodtrykk 85/45, puls 120, kald og klam perifert. Urinstiks viser leukocytter og nitritt.',
    causes: ['sepsis'], distractors: ['dka', 'opioid', 'oppkast', 'diare'],
  },
  {
    id: 'dka', age: [16, 45], level: 1, primary: 'met-acidose', agType: 'hoy', severity: [6, 14], lung: 'normal', fio2: [0.21],
    labs: { glucose: [22, 38], k: [4.8, 5.8], lactate: [1.5, 3], na: [130, 137] },
    text: '{Kjonn}, {alder} år, kjent diabetes type 1. Kommer inn med magesmerter, kvalme og tørste. Puster dypt og raskt (Kussmaul), lukter aceton.',
    causes: ['dka'], distractors: ['sepsis', 'uremi', 'angst', 'diare'],
  },
  {
    id: 'uremi', age: [45, 85], level: 1, primary: 'met-acidose', agType: 'hoy', severity: [12, 18], lung: 'normal', fio2: [0.21],
    labs: { k: [5.6, 6.6], lactate: [0.8, 1.8], albumin: [30, 38] },
    text: '{Kjonn}, {alder} år, kjent kronisk nyresykdom. Har gått ned i urinproduksjon siste uke, nå slapp og kvalm. Kreatinin er kraftig forhøyet.',
    causes: ['uremi'], distractors: ['dka', 'sepsis', 'rta', 'diare'],
  },
  {
    id: 'diare', age: [18, 80], level: 1, primary: 'met-acidose', agType: 'normal', severity: [12, 18], lung: 'normal', fio2: [0.21],
    labs: { k: [2.9, 3.5], lactate: [0.8, 1.8] },
    text: '{Kjonn}, {alder} år, tre dager med rikelig vandig diaré etter utenlandsreise. Tørr i munnen, ortostatisk svimmel.',
    causes: ['diare'], distractors: ['dka', 'sepsis', 'oppkast', 'opioid'],
  },
  {
    id: 'oppkast', age: [30, 80], level: 1, primary: 'met-alkalose', severity: [34, 42], lung: 'normal', fio2: [0.21],
    labs: { k: [2.6, 3.2], lactate: [0.8, 1.6] },
    text: '{Kjonn}, {alder} år, har kastet opp gjentatte ganger i fire dager på grunn av pylorusstenose. Klarer ikke holde på væske.',
    causes: ['oppkast'], distractors: ['diuretika', 'diare', 'angst', 'kols'],
  },
  {
    id: 'diuretika', age: [60, 90], level: 1, primary: 'met-alkalose', severity: [31, 38], lung: 'lett', fio2: [0.21, 0.28],
    labs: { k: [2.8, 3.3], lactate: [0.8, 1.6], albumin: [30, 38] },
    text: '{Kjonn}, {alder} år, hjertesvikt, har fått høye doser furosemid intravenøst i en uke for ødemer. Nå tørr, lavt blodtrykk og slapp.',
    causes: ['diuretika', 'hypovolemi'], distractors: ['oppkast', 'diare', 'sepsis', 'respirator'],
  },
  {
    id: 'opioid', age: [30, 85], level: 1, primary: 'resp-acidose', chronic: false, severity: [8.5, 11.5], lung: 'normal', fio2: [0.21],
    labs: { lactate: [0.8, 2.0] },
    text: '{Kjonn}, {alder} år, funnet somnolent etter operasjon med pasientstyrt morfinpumpe. Respirasjonsfrekvens 6, små pupiller.',
    causes: ['opioid'], distractors: ['kolsKronisk', 'angst', 'le', 'sepsis'],
  },
  {
    id: 'astma', age: [16, 50], level: 1, primary: 'resp-acidose', chronic: false, severity: [7.5, 10], lung: 'moderat', fio2: [0.35, 0.5],
    labs: { lactate: [1.5, 3.5] },
    text: '{Kjonn}, {alder} år, alvorlig astmaanfall i flere timer. Nå sliten, snakker i enkeltord, stille lunger ved auskultasjon.',
    causes: ['astma'], distractors: ['angst', 'opioid', 'le', 'kolsKronisk'],
  },
  {
    id: 'angst', age: [18, 45], level: 1, primary: 'resp-alkalose', chronic: false, severity: [2.8, 3.8], lung: 'normal', fio2: [0.21],
    labs: { lactate: [0.8, 2.0], k: [3.3, 3.9] },
    text: '{Kjonn}, {alder} år, kommer til akuttmottaket med brystsmerter, prikking i fingrene og rundt munnen etter en krangel. Respirasjonsfrekvens 32. EKG normalt.',
    causes: ['angst'], distractors: ['le', 'sepsis', 'opioid', 'dka'],
  },
  {
    id: 'le', age: [40, 80], level: 1, primary: 'resp-alkalose', chronic: false, severity: [3.2, 4.2], lung: 'moderat', fio2: [0.21, 0.28],
    labs: { lactate: [1.0, 2.5] },
    text: '{Kjonn}, {alder} år, plutselig tungpust og stikkende brystsmerte en uke etter kneprotese. Puls 115, respirasjonsfrekvens 28, SpO2 89 % på luft.',
    causes: ['le'], distractors: ['angst', 'pneumoni', 'astma', 'opioid'],
  },
  // ---------- Nivå 2: kompenserte ----------
  {
    id: 'kols-kronisk', age: [55, 85], level: 2, primary: 'resp-acidose', chronic: true, severity: [7.3, 9.0], lung: 'moderat', fio2: [0.24, 0.28],
    labs: { lactate: [0.8, 1.6], k: [3.8, 4.6] },
    text: '{Kjonn}, {alder} år, alvorlig KOLS med hjemmeoksygen. Kommer til kontroll, er i vanlig form. Blodgassen er tatt i hvile.',
    causes: ['kolsKronisk'], distractors: ['opioid', 'oppkast', 'nevromusk', 'diuretika'],
  },
  {
    id: 'graviditet', level: 2, primary: 'resp-alkalose', chronic: true, severity: [3.6, 4.3], lung: 'normal', fio2: [0.21],
    labs: { lactate: [0.6, 1.4], albumin: [28, 34] },
    text: '{Kjonn}, {alder} år, gravid i uke 34, tatt blodgass i forbindelse med utredning av lett tungpust. Klinisk upåfallende.',
    causes: ['graviditet'], distractors: ['angst', 'le', 'sepsis', 'dka'], sex: 'K', age: [22, 38],
  },
  {
    id: 'hoyde', age: [25, 55], level: 2, primary: 'resp-alkalose', chronic: true, severity: [3.3, 4.0], lung: 'normal', fio2: [0.21],
    labs: { lactate: [0.8, 1.8] },
    text: '{Kjonn}, {alder} år, forsker som har oppholdt seg på 4 500 meters høyde i to uker. Blodgassen er tatt på stasjonen (verdiene er oppgitt som om trykket var normalt).',
    causes: ['hoyde'], distractors: ['angst', 'le', 'cirrhose', 'graviditet'],
  },
  {
    id: 'ckd-kompensert', age: [45, 85], level: 2, primary: 'met-acidose', agType: 'hoy', severity: [15, 19], lung: 'normal', fio2: [0.21],
    labs: { k: [5.0, 5.8], lactate: [0.8, 1.6], albumin: [32, 40] },
    text: '{Kjonn}, {alder} år, kronisk nyresykdom stadium 4, til poliklinisk kontroll. Føler seg som vanlig.',
    causes: ['uremi'], distractors: ['dka', 'sepsis', 'diare', 'rta'],
  },
  {
    id: 'oppkast-kompensert', age: [16, 35], level: 2, primary: 'met-alkalose', severity: [33, 40], lung: 'normal', fio2: [0.21],
    labs: { k: [2.7, 3.3], lactate: [0.8, 1.6] },
    text: '{Kjonn}, {alder} år, spiseforstyrrelse med daglig selvfremkalt oppkast gjennom flere måneder. Innlagt for dehydrering.',
    causes: ['oppkast', 'hypovolemi'], distractors: ['diuretika', 'diare', 'kolsKronisk', 'respirator'],
  },
  {
    id: 'rta', age: [18, 50], level: 2, primary: 'met-acidose', agType: 'normal', severity: [14, 19], lung: 'normal', fio2: [0.21],
    labs: { k: [2.8, 3.4], lactate: [0.8, 1.6] },
    text: '{Kjonn}, {alder} år, utredes for nyrestein og muskelsvakhet. Ingen diaré. Urin-pH 6,5.',
    causes: ['rta'], distractors: ['diare', 'dka', 'uremi', 'sepsis'],
  },
  {
    id: 'ohs', age: [40, 75], level: 2, primary: 'resp-acidose', chronic: true, severity: [7.0, 8.5], lung: 'lett', fio2: [0.21, 0.24],
    labs: { lactate: [0.8, 1.6], k: [3.8, 4.6] },
    text: '{Kjonn}, {alder} år, BMI 48, søvnapné og dagtretthet. Blodgass tatt på dagtid på poliklinikken, pasienten er våken og i vanlig form.',
    causes: ['ohs'], distractors: ['opioid', 'oppkast', 'kolsKronisk', 'nevromusk'],
  },
  {
    id: 'steroid', age: [30, 75], level: 2, primary: 'met-alkalose', severity: [32, 38], lung: 'normal', fio2: [0.21],
    labs: { k: [2.6, 3.2], lactate: [0.8, 1.6], glucose: [7, 12] },
    text: '{Kjonn}, {alder} år, står på høydose prednisolon og furosemid for en inflammatorisk sykdom. Innlagt for muskelsvakhet. Ikke kastet opp.',
    causes: ['steroid', 'diuretika'], distractors: ['oppkast', 'diare', 'kols', 'respirator'],
  },
  {
    id: 'diare-kronisk', age: [25, 70], level: 2, primary: 'met-acidose', agType: 'normal', severity: [15, 19], lung: 'normal', fio2: [0.21],
    labs: { k: [2.8, 3.4], lactate: [0.8, 1.6], albumin: [28, 36] },
    text: '{Kjonn}, {alder} år, ulcerøs kolitt med 8–10 avføringer daglig i flere uker. Til poliklinisk kontroll, lett dehydrert.',
    causes: ['diare'], distractors: ['rta', 'dka', 'uremi', 'sepsis'],
  },
  // ---------- Nivå 3: blandede ----------
  {
    id: 'salisylat', age: [16, 70], level: 3, primary: 'met-acidose', agType: 'hoy', secondary: 'resp-alkalose', severity: [12, 18], lung: 'normal', fio2: [0.21],
    labs: { lactate: [2, 4], glucose: [4, 7] },
    text: '{Kjonn}, {alder} år, tatt mange tabletter acetylsalisylsyre for seks timer siden. Øresus, kvalme og hyperventilasjon.',
    causes: ['salisylat'], distractors: ['dka', 'sepsis', 'angst', 'opioid'],
  },
  {
    id: 'hjertestans', age: [45, 85], level: 3, primary: 'met-acidose', agType: 'hoy', secondary: 'resp-acidose', severity: [8, 15], lung: 'moderat', fio2: [0.6, 1.0],
    labs: { lactate: [8, 15], k: [4.5, 5.5], glucose: [9, 15] },
    text: '{Kjonn}, {alder} år, hjertestans utenfor sykehus med 20 minutter HLR før ROSC. Intubert, blodgass tatt rett etter ankomst.',
    causes: ['hjertestans', 'sepsis'], distractors: ['dka', 'salisylat', 'oppkast', 'diare'],
  },
  {
    id: 'dka-oppkast', age: [16, 45], level: 3, primary: 'met-acidose', agType: 'hoy', secondary: 'met-alkalose', severity: [12, 18], lung: 'normal', fio2: [0.21],
    labs: { glucose: [22, 35], k: [3.2, 4.2], lactate: [1.5, 3], na: [130, 138] },
    text: '{Kjonn}, {alder} år, diabetes type 1, har kastet opp i to døgn og sluttet med insulin. Tørr, takykard, Kussmaul-respirasjon.',
    causes: ['dka', 'oppkast'], distractors: ['sepsis', 'uremi', 'diuretika', 'opioid'],
  },
  {
    id: 'dka-nacl', age: [16, 45], level: 3, primary: 'met-acidose', agType: 'hoy', secondary: 'met-acidose-normal-ag', severity: [10, 16], lung: 'normal', fio2: [0.21],
    labs: { glucose: [12, 20], k: [3.4, 4.2], lactate: [1.0, 2.5] },
    text: '{Kjonn}, {alder} år, under behandling for diabetisk ketoacidose. Har fått 6 liter NaCl 0,9 % og insulininfusjon siste 12 timer. Glukosen er på vei ned.',
    causes: ['dka', 'nacl'], distractors: ['sepsis', 'uremi', 'diare', 'oppkast'],
  },
  {
    id: 'kols-sepsis', age: [58, 85], level: 3, primary: 'resp-acidose', chronic: true, secondary: 'met-acidose-hoy-ag', severity: [8.0, 10.0], lung: 'alvorlig', fio2: [0.28, 0.4],
    labs: { lactate: [3.5, 7], albumin: [26, 34] },
    text: '{Kjonn}, {alder} år, kjent KOLS med kronisk hyperkapni. Nå pneumoni, feber og blodtrykk 80/40. Somnolent.',
    causes: ['kolsKronisk', 'sepsis', 'pneumoni'], distractors: ['opioid', 'dka', 'oppkast', 'angst'],
  },
  {
    id: 'resp-ng', age: [40, 80], level: 3, primary: 'resp-alkalose', chronic: false, secondary: 'met-alkalose', severity: [3.2, 4.0], lung: 'moderat', fio2: [0.4, 0.6],
    labs: { k: [2.8, 3.4], lactate: [0.8, 1.8], albumin: [24, 32] },
    text: '{Kjonn}, {alder} år, intubert etter bukkirurgi, ventileres med frekvens 22 og Vt 8 ml/kg. Ventrikkelsonden har gitt 2 liter aspirat i døgnet.',
    causes: ['respirator', 'oppkast'], distractors: ['sepsis', 'diare', 'opioid', 'dka'],
  },
  {
    id: 'posthyperkapni', age: [55, 85], level: 3, primary: 'met-alkalose', severity: [34, 42], lung: 'moderat', fio2: [0.3, 0.4],
    labs: { k: [2.9, 3.5], lactate: [0.8, 1.6] },
    text: '{Kjonn}, {alder} år, KOLS med kronisk hyperkapni, intubert for to døgn siden for pneumoni. Respiratoren har ventilert henne ned til normal PaCO2 i natt. Blodgass tatt om morgenen.',
    causes: ['posthyperkapni', 'respirator'], distractors: ['oppkast', 'diuretika', 'dka', 'sepsis'],
  },
  {
    id: 'kols-akutt-pa-kronisk', age: [58, 88], level: 3, primary: 'resp-acidose', chronic: true, severity: [9.0, 11.5], lung: 'moderat', fio2: [0.28, 0.35],
    labs: { lactate: [1.0, 2.5] },
    text: '{Kjonn}, {alder} år, KOLS med hjemmeoksygen og kjent kronisk hyperkapni (vanlig PaCO2 rundt 7,5). Nå eksaserbasjon, somnolent, respirasjonsfrekvens 32. Blodgassen viser høyere PaCO2 enn vanlig.',
    causes: ['kols', 'kolsKronisk'], distractors: ['opioid', 'dka', 'angst', 'oppkast'],
  },
  {
    id: 'cirrhose-sepsis', age: [45, 75], level: 3, primary: 'met-acidose', agType: 'hoy', secondary: 'resp-alkalose', severity: [13, 19], lung: 'lett', fio2: [0.21, 0.28],
    labs: { lactate: [4, 8], albumin: [20, 28], glucose: [4, 7] },
    text: '{Kjonn}, {alder} år, levercirrhose med ascites. Innlagt med feber, forvirring og hypotensjon. Spontan bakteriell peritonitt mistenkes.',
    causes: ['sepsis', 'cirrhose'], distractors: ['dka', 'opioid', 'oppkast', 'uremi'],
  },
];

export const LEVELS = [
  { id: 1, name: 'Enkle forstyrrelser' },
  { id: 2, name: 'Kompenserte' },
  { id: 3, name: 'Blandede' },
];

export const DISORDER_TYPES = [
  { id: 'met-acidose', name: 'Metabolsk acidose' },
  { id: 'met-alkalose', name: 'Metabolsk alkalose' },
  { id: 'resp-acidose', name: 'Respiratorisk acidose' },
  { id: 'resp-alkalose', name: 'Respiratorisk alkalose' },
];
