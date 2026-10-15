/**
 * Barnecaser (B1–B12). Hovedvekten ligger på respiratorjustering, med teori underveis.
 *
 * Kilder (se KILDER.md, «Barnecaser»):
 *  - PALICC-2 (Emeriaud et al. / Fernández et al., Pediatr Crit Care Med 2023): Vt 6–8 ml/kg (under 6 hvis
 *    platå-/drivtrykk ellers overskrides), Pplat ≤ 28 cmH2O (29–32 ved stiv brystvegg), drivtrykk ≤ 15 cmH2O,
 *    PEEP minst etter ARDSNet «lav PEEP/høy FiO2», SpO2 92–97 % ved mild/moderat PARDS, permissiv hyperkapni
 *    ned til pH 7,20, SBT med CPAP ≤ 5 etterligner best pustearbeidet etter ekstubasjon.
 *  - Pediatriske retningslinjer for alvorlig hodeskade (Brain Trauma Foundation / Kochanek 2019): unngå
 *    profylaktisk hyperventilering til PaCO2 < 30 mmHg (4,0 kPa) de første 48 timene.
 *  - Astma og obstruktiv bronkiolitt: lav frekvens, lang ekspirasjon, permissiv hyperkapni (pH > 7,20).
 *  - DKA: minuttvolumet etter intubasjon må matche pasientens kompensatoriske hyperventilering; aggressiv
 *    hyperventilering er forbundet med dårligere utfall ved hjerneødem (Marcin et al., J Pediatr 2002).
 *  - Frekvens etter alder: 2–6 år ca. 20–30, 6–12 år ca. 20–25 som utgangspunkt (pediatriske oppslagsverk).
 *  - IBW for barn: Traub–Kichen 1983 (se core/physiology/respiratory.js). Barn under 15 kg: kategori «Barn/nyfødt»
 *    med kroppsvekt (lokal metodebok «Hamilton C6 – oversikt»).
 *  - Metodebok «Barn med behov for LTMV» v1.2 (nasjonal, 21.09.2024; bygger på ERS statement 2022): BiPAP ved
 *    nevromuskulær sykdom, Vt 6–10 ml/kg, backup-frekvens 2–3 under egen, kort stigetid, hypoventilasjon PtcCO2 > 6,7 kPa.
 * Effektstørrelsene (endringer i compliance, resistance, shunt) er pedagogiske valg, UVERIFISERT.
 */

const NEUTRAL_BASE = {
  sug: 'Lite sekret i tuben.', bittblokk: 'Barnet biter ikke på tuben.', koble: 'Kretsen var tilkoblet.',
  tube: 'Tuben står riktig ved tannrekken.', bronkodilatator: 'Ingen pipelyder; ingen effekt.', rekruttering: 'Ikke indisert her.',
  reposisjon: 'Ingen effekt på problemet.', sedasjon: 'Barnet er rolig; sedasjon løser ikke problemet.',
};
const ventFix = { juster: { text: 'Du går til respiratoren for å justere innstillingene.', recover: -1, partial: {} } };
const vtOk = (m, lo = 6, hi = 8) => m.vtPerKg != null && m.vtPerKg >= lo && m.vtPerKg <= hi;
/** Metningen pasienten er på vei mot (SpO2 henger etter i noen titalls sekunder). */
const sat = (gas) => gas.target?.sao2 ?? gas.spo2;

export const CHILD_SITUATIONS = [
  // ---------------------------------------------------------------- B1
  {
    id: 'barn-voksenoppsett', pediatric: true,
    title: 'Barn på voksenoppsett',
    vignette: 'Gutt, 6 år, 116 cm, 21 kg. Operert for perforert blindtarm og kommer intubert (tube 5,5 med cuff). Han kobles til respiratoren på intensiv. Lett sedert, puster ikke selv ennå.',
    profileId: 'normal', patient: { height: 175, sex: 'M', compliance: 22, resistance: 18, resistanceExp: 20, effort: { amplitude: 0, rate: 22, duration: 0.8 } },
    settings: { mode: 'APVCMV', vt: 570, rate: 15, peep: 5, fio2: 40, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, trigger: { type: 'flow', value: 2 }, pmax: 40 },
    gas: { shunt: 0.05, recruitability: 0.2, vco2: 85, hbGL: 115 }, vitalsBase: { hr: 98, sys: 100, dia: 58, temp: 37.6 },
    variants: [{
      id: 'voksenoppsett', sounds: {}, vitals: {}, delay: [4, 8], effect: {},
      cues: [{ at: 0, who: 'respirator', text: 'Alarm: trykkbegrensning. Ppeak 30 cmH2O.' }, { at: 12, who: 'monitor', text: 'PetCO2 er under 3 kPa.' }, { at: 30, who: 'kollega', text: '«Står det ikke 175 cm på respiratoren? Var det ikke en voksen som lå her før?»' }],
      clues: { lytt: 'Gode respirasjonslyder bilateralt. Brystkassen hever seg uvanlig mye ved hvert pust.', se: 'Tuben står på 15 cm ved tannrekken, som dokumentert. Brystet løftes kraftig. Under Dynamic Lung står det «175 cm».', krets: 'Kretsen er tett og riktig koblet.', blodgass: 'pH 7,58, PaCO2 3,0 kPa: respiratorisk alkalose av hyperventilering.' },
      fixes: ventFix,
      harmful: { rekruttering: 'Skadelig: en rekrutteringsmanøver gir enda høyere trykk i en lunge som allerede er overstrukket.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Legg inn riktig høyde, still Vt til 6–8 ml/kg IBW og frekvens etter alder.»' },
      ventFix: true,
      target: 'riktig høyde (116 cm, under Kontroller › Pasient), Vt 6–8 ml/kg IBW, frekvens 18–26, Pplateau ≤ 28 cmH2O.',
      resolve: ({ m, patient }) => patient && patient.height >= 110 && patient.height <= 122 && vtOk(m, 5.8, 8.2) && m.fTotal >= 16 && m.fTotal <= 30 && m.pplat <= 28,
      teach: [
        { kind: 'obs', when: ({ m }) => m.pplat > 28, text: 'Obs: Pplateau er over 28 cmH2O. PALICC-2 anbefaler Pplateau ≤ 28 og drivtrykk ≤ 15 cmH2O hos barn.' },
        { when: ({ patient }) => patient && patient.height >= 110 && patient.height <= 122, text: 'Riktig! På Hamilton styrer høyden IBW. 116 cm gir IBW ≈ 21 kg, og Vt/IBW, alarmgrenser og startverdier bygger på den. Feil høyde gir feil Vt.' },
        { kind: 'info', when: ({ patient }) => patient && patient.height >= 110 && patient.height <= 122, text: 'Over 15 kg brukes kategorien «Voksen/barn» med kjønn og høyde, som her. Under 15 kg brukes «Barn/nyfødt», der du legger inn kroppsvekt (lokal metodebok, Hamilton C6).' },
        { when: ({ m, patient }) => patient && patient.height <= 122 && vtOk(m), text: 'Riktig! Barn ventileres med Vt 6–8 ml/kg IBW (PALICC-2). For ham er det ca. 125–165 ml.' },
        { when: ({ m, settings }) => settings.rate >= 18 && settings.rate <= 26 && m.vtPerKg > 0 && m.vtPerKg <= 8.5, text: 'Riktig! Barn trenger høyere frekvens enn voksne. For en seksåring er 20–25 per minutt et vanlig utgangspunkt.' },
        { kind: 'info', when: ({ m, patient }) => patient && patient.height <= 122 && vtOk(m), text: 'Husk alarmgrensene: de ble satt etter voksenvolumene, så «Lavt tidevolum» kan gå selv om Vt nå er riktig. Åpne Alarmer og trykk «Auto», eller sett grensene for et barn på 21 kg.' },
      ],
      explanation: 'Respiratoren sto med voksenoppsett: høyde 175 cm gir IBW 71 kg og Vt 570 ml, nesten 28 ml/kg for en gutt med IBW 21 kg. Det gir overstrekking, høyt platåtrykk og hyperventilering. Legg alltid inn riktig høyde og kjønn først, sett Vt 6–8 ml/kg IBW og frekvens etter alder, og kontroller Pplateau ≤ 28 og drivtrykk ≤ 15 cmH2O (PALICC-2).',
    }],
  },
  // ---------------------------------------------------------------- B2
  {
    id: 'barn-pards-oksygenering', pediatric: true,
    title: 'PARDS: oksygeneringen svikter',
    vignette: 'Jente, 4 år, 102 cm. Pneumoni med PARDS, dag 2. Ventileres i PCV+: Pcontrol 14 over PEEP 6, frekvens 26, TI 0,8 s, O2 50 %. Sedert, puster ikke selv.',
    profileId: 'normal', patient: { height: 102, sex: 'K', compliance: 7.5, resistance: 22, resistanceExp: 24, effort: { amplitude: 0, rate: 26, duration: 0.7 } },
    settings: { mode: 'PCV', pcontrol: 14, rate: 26, peep: 6, fio2: 50, timingMode: 'ti', ti: 0.8, pramp: 75, trigger: { type: 'flow', value: 1 }, pmax: 40 },
    gas: { shunt: 0.2, recruitability: 0.7, vco2: 75, hbGL: 110, deadspaceMl: 55 }, vitalsBase: { hr: 118, sys: 98, dia: 56, temp: 38.6 },
    variants: [{
      id: 'pards-o2', sounds: {}, vitals: { hr: 20 }, delay: [10, 20], effect: { shuntAdd: 0.2, rampIn: 60 },
      cues: [{ at: 0, who: 'obs', text: 'Hun blir blekere, og SpO2-tonen synker.' }, { at: 40, who: 'kollega', text: '«Røntgen fra i morges viste mer fortetning på begge sider.»' }],
      clues: { lytt: 'Svekket respirasjonslyd og fine knatrelyder basalt på begge sider.', se: 'Tuben står som dokumentert. Hun er blek. Brystet beveger seg symmetrisk, men lite.', krets: 'Kretsen er tett.', blodgass: 'pH 7,31, PaCO2 6,4 kPa, PaO2 7,4 kPa på 50 % O2.' },
      fixes: { ...ventFix, rekruttering: { text: 'Legen gjør en rekrutteringsmanøver. SpO2 bedres en stund, men uten høyere PEEP lukker alveolene seg igjen. Juster PEEP.', recover: -1, partial: {} } },
      harmful: {},
      neutral: { ...NEUTRAL_BASE, sug: 'Litt sekret, ingen effekt på oksygeneringen.', lege: 'Legen: «Titrer PEEP opp mot SpO2 92–97 %, men hold Pplateau ≤ 28 og drivtrykk ≤ 15.»', reposisjon: 'Bukleie kan vurderes av legen senere; nå må respiratoren justeres.' },
      ventFix: true,
      target: 'SpO2 92–97 % med PEEP opp (minst 8–10 ved O2 50 %), Pplateau ≤ 28 og drivtrykk ≤ 15 cmH2O.',
      vitalsFn: ({ settings }) => { const x = Math.max(0, settings.peep - 13); return { sys: -4 * x, dia: -2 * x, hr: 3 * x }; },
      resolve: ({ m, gas, settings }) => gas.spo2 >= 0.92 && sat(gas) >= 0.92 && settings.peep >= 9 && m.pplat <= 28.5 && m.drivingPressure <= 15.5,
      teach: [
        { when: ({ settings }) => settings.peep >= 8, text: 'Riktig! Ved PARDS titreres PEEP mot oksygenering, blodtrykk og compliance. PALICC-2: minst like høy PEEP som ARDSNet-tabellen «lav PEEP/høy FiO2», for eksempel FiO2 50 % → PEEP 8–10, FiO2 70 % → PEEP 10–14.' },
        { after: 'juster', when: ({ gas }) => gas.spo2 >= 0.92 && gas.spo2 <= 0.97, text: 'Riktig! Målet ved mild til moderat PARDS er SpO2 92–97 % (PALICC-2).' },
        { kind: 'obs', when: ({ settings }) => settings.fio2 >= 80 && settings.peep < 8, text: 'Obs: Bare mer oksygen behandler ikke sammenfalte alveoler. Øk PEEP for å holde lungen åpen.' },
        { kind: 'obs', when: ({ m }) => m.pplat > 28.5 || m.drivingPressure > 15.5, text: 'Obs: Hold Pplateau ≤ 28 og drivtrykk ≤ 15 cmH2O når du øker trykkene (PALICC-2). I PCV+ er drivtrykket omtrent lik Pcontrol.' },
        { kind: 'obs', when: ({ settings }) => settings.peep >= 15, text: 'Obs: Blodtrykket faller. Høy PEEP kan redusere venøs tilbakestrømning; titrer PEEP også mot sirkulasjonen.' },
      ],
      explanation: 'Mer fortetning gir mer shunt: blodet passerer alveoler som ikke er ventilert, og SpO2 faller selv med mye oksygen. Høyere PEEP holder alveolene åpne og reduserer shunten. PALICC-2 anbefaler å titrere PEEP mot oksygenering, hemodynamikk og compliance, minst etter ARDSNet «lav PEEP/høy FiO2», med SpO2-mål 92–97 % ved mild til moderat PARDS og innenfor Pplateau ≤ 28 og drivtrykk ≤ 15 cmH2O.',
    }],
  },
  // ---------------------------------------------------------------- B3
  {
    id: 'barn-pards-vt', pediatric: true,
    title: 'PARDS: for høyt tidevolum og platåtrykk',
    vignette: 'Gutt, 9 år, 133 cm. Influensapneumoni med PARDS. Ventileres i APVcmv med Vt 260 ml, frekvens 20, PEEP 8, O2 45 %. Sedert.',
    profileId: 'normal', patient: { height: 133, sex: 'M', compliance: 22, resistance: 15, resistanceExp: 16, effort: { amplitude: 0, rate: 20, duration: 0.9 } },
    settings: { mode: 'APVCMV', vt: 260, rate: 20, peep: 8, fio2: 45, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, trigger: { type: 'flow', value: 2 }, pmax: 40 },
    gas: { shunt: 0.12, recruitability: 0.4, vco2: 115, hbGL: 120, deadspaceMl: 100 }, vitalsBase: { hr: 98, sys: 104, dia: 62, temp: 38.4 },
    variants: [{
      id: 'pards-vt', sounds: {}, vitals: { hr: 10 }, delay: [10, 20], effect: { compliance: 0.55, shuntAdd: 0.05, rampIn: 60 },
      cues: [{ at: 0, who: 'obs', text: 'Topptrykket på respiratoren kryper oppover.' }, { at: 45, who: 'kollega', text: '«Hva er egentlig Vt per kilo på ham?»' }],
      clues: { lytt: 'Knatrelyder over begge lunger.', se: 'Brystet hever seg mindre enn før. Tuben står riktig.', krets: 'Kretsen er tett.', blodgass: 'pH 7,34, PaCO2 6,1 kPa, PaO2 9,1 kPa.' },
      fixes: ventFix,
      harmful: { rekruttering: 'Rekrutteringsmanøver med Vt 9 ml/kg og Pplateau rundt 30 øker risikoen for barotraume. Senk Vt først.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Senk Vt til drivtrykket er ≤ 15, og øk frekvensen for å holde minuttvolumet.»' },
      ventFix: true,
      target: 'drivtrykk ≤ 15 og Pplateau ≤ 28 cmH2O ved å senke Vt (ca. 6 ml/kg eller lavere), frekvensen opp så minuttvolumet holdes (≥ 4,5 l/min).',
      resolve: ({ m }) => m.drivingPressure <= 15.5 && m.pplat <= 28 && m.vtPerKg <= 6.6 && m.expMinVol >= 4.5,
      teach: [
        { kind: 'obs', when: ({ m }) => m.pplat > 28, text: 'Obs: Pplateau er over 28 cmH2O og drivtrykket over 15. Lungen har blitt stivere, og Vt 9 ml/kg overstrekker den.' },
        { when: ({ m }) => m.vtPerKg > 0 && m.vtPerKg <= 6.6, text: 'Riktig! PALICC-2: Vt 6–8 ml/kg, men under 6 ml/kg når det trengs for å holde Pplateau ≤ 28 og drivtrykk ≤ 15 cmH2O.' },
        { when: ({ settings }) => settings.rate >= 26, text: 'Riktig! Når Vt senkes, økes frekvensen for å holde minuttvolumet.' },
        { after: 'juster', when: ({ m }) => m.drivingPressure > 0 && m.drivingPressure <= 15, text: 'Riktig! Drivtrykket (Pplateau − PEEP) er nå ≤ 15 cmH2O.' },
        { kind: 'info', after: 'juster', when: ({ gas }) => gas.paco2 > 6.2, text: 'Litt høyere PaCO2 er akseptert: permissiv hyperkapni ned til pH 7,20 kan tillates for å holde seg innenfor trykk- og volumgrensene (PALICC-2).' },
      ],
      explanation: 'Når compliance faller, gir samme Vt høyere platå- og drivtrykk. Vt 9 ml/kg i en stiv lunge gir Pplateau rundt 30 og drivtrykk over 20 cmH2O, som øker risikoen for lungeskade. PALICC-2 anbefaler Vt 6–8 ml/kg, og lavere når trykkgrensene ellers overskrides (Pplateau ≤ 28, drivtrykk ≤ 15). Øk frekvensen for minuttvolumet, og aksepter moderat hyperkapni (pH ≥ 7,20).',
    }],
  },
  // ---------------------------------------------------------------- B4
  {
    id: 'barn-astma', pediatric: true,
    title: 'Alvorlig astma: dynamisk hyperinflasjon',
    vignette: 'Jente, 8 år, 128 cm. Alvorlig astmaanfall, intubert i akuttmottaket. Ventileres i APVcmv med Vt 190 ml, frekvens 24, I:E 1:2, PEEP 5, O2 40 %. Sedert og relaksert.',
    profileId: 'normal', patient: { height: 128, sex: 'K', compliance: 25, resistance: 30, resistanceExp: 45, effort: { amplitude: 0, rate: 24, duration: 0.8 } },
    settings: { mode: 'APVCMV', vt: 190, rate: 24, peep: 5, fio2: 40, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, trigger: { type: 'flow', value: 2 }, pmax: 45 },
    gas: { shunt: 0.08, recruitability: 0.1, vco2: 105, hbGL: 125, deadspaceMl: 80 }, vitalsBase: { hr: 112, sys: 108, dia: 62, temp: 37.3 },
    variants: [{
      id: 'astma', sounds: { wheeze: 1 }, vitals: {}, delay: [10, 20], effect: { resistance: 2, resistanceExp: 2.2, shuntAdd: 0.03, rampIn: 60 },
      cues: [{ at: 0, who: 'obs', text: 'Du hører pipelyder helt fra sengekanten.' }, { at: 35, who: 'obs', text: 'Brystkassen blir mer og mer tønneformet, og halsvenene er fylte.' }, { at: 70, who: 'monitor', text: 'Blodtrykket faller.' }],
      clues: { lytt: 'Kraftige ekspiratoriske pipelyder, svært forlenget ekspirium. Ekspirasjonen er ikke ferdig før neste pust starter.', se: 'Overoppblåst brystkasse. Flowkurven når ikke null før neste inspirasjon.', krets: 'Kretsen er tett.', blodgass: 'pH 7,22, PaCO2 8,4 kPa, PaO2 11 kPa.' },
      fixes: { ...ventFix, bronkodilatator: { text: 'Riktig tilleggsbehandling: inhalert og intravenøs bronkodilatator etter ordinasjon reduserer motstanden noe. Ventilasjonsstrategien må likevel endres.', recover: -1, partial: { resistance: 1.6, resistanceExp: 1.7 } } },
      harmful: { rekruttering: 'Skadelig: en rekrutteringsmanøver øker hyperinflasjonen og kan gi pneumothorax og sirkulasjonssvikt.' },
      neutral: { ...NEUTRAL_BASE, bronkodilatator: undefined, lege: 'Legen: «Senk frekvensen og forleng ekspirasjonen. Vi aksepterer høy CO2.»', vaeske: 'Væske kan heve blodtrykket litt, men årsaken er trykket i brystkassen.' },
      ventFix: true,
      target: 'AutoPEEP under 3 cmH2O med lav frekvens (ca. 10–16) og lang ekspirasjon (I:E 1:3–1:5). Aksepter høy PaCO2. Vurder (S)CMV med firkantflow og pause for å kunne følge platåtrykket.',
      vitalsFn: ({ m }) => { const x = Math.max(0, (m.autoPeep ?? 0) - 2); return { sys: -4 * x, dia: -2 * x, hr: 3 * x }; },
      resolve: ({ m, settings }) => m.autoPeep < 3 && settings.rate <= 18,
      teach: [
        { kind: 'obs', when: ({ m }) => m.autoPeep > 6, text: 'Obs: AutoPEEP er høy. Luft blir fanget i lungene, trykket i brystkassen stiger og blodtrykket faller. Senk frekvensen og forleng ekspirasjonen.' },
        { when: ({ settings }) => settings.rate <= 16, text: 'Riktig! Ved astma settes frekvensen lavt, gjerne under normalt for alderen, så lungene rekker å tømme seg.' },
        { when: ({ m }) => m.te >= 3, text: 'Riktig! Lang ekspirasjonstid (I:E 1:3–1:5) gir mindre dynamisk hyperinflasjon.' },
        { after: 'juster', when: ({ m }) => m.autoPeep < 3, text: 'Riktig! AutoPEEP faller. Når trykket i brystkassen synker, øker venøs tilbakestrømning og blodtrykket bedres.' },
        { kind: 'info', after: 'juster', when: ({ gas }) => gas.paco2 > 7, text: 'Høy PaCO2 aksepteres ved astma (permissiv hyperkapni, pH over ca. 7,20). Ikke øk frekvensen for å «jage» CO2: det øker luftfangsten.' },
        { kind: 'obs', when: ({ settings }) => settings.rate > 26, text: 'Obs: Høyere frekvens forkorter ekspirasjonen og øker AutoPEEP.' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.mode !== 'SCMV', text: 'Lokal metodebok (Hamilton C6): ved alvorlig obstruksjon anbefales (S)CMV med firkantflow og inspiratorisk pause, fordi pausen viser platåtrykket. APVcmv har ingen pause. Senk TI eller frekvens slik at ekspirasjonen blir lang nok.' },
        { when: ({ settings }) => settings.mode === 'SCMV' && settings.tip > 0 && settings.flowPattern === 'square', text: 'Riktig! (S)CMV med firkantflow og pause gir et målbart platåtrykk. Ved astma er Ppeak høy fordi luftveiene er trange; det er Pplateau (helst under 30 cmH2O) og AutoPEEP som sier noe om hyperinflasjonen.' },
        { kind: 'obs', when: ({ settings, m }) => settings.mode === 'SCMV' && m.pplat > 30, text: 'Obs: Pplateau er over 30 cmH2O. Lungene er overfylte: senk frekvens eller Vt, og forleng ekspirasjonen.' },
        { kind: 'info', after: 'juster', when: ({ m }) => m.breathType === 'triggered', text: 'Trigget pust forkorter ekspirasjonen. Metodeboka: reduser TI, eller slå av triggeren i kontrollert modus (Kontroller › Trigger «Av») hvis pasienten er dypt sedert.' },
      ],
      explanation: 'Ved alvorlig astma tar ekspirasjonen lang tid fordi luftveiene er trange. Med frekvens 24 og I:E 1:2 starter neste pust før lungen er tømt, så luft fanges (dynamisk hyperinflasjon). AutoPEEP øker trykket i brystkassen, reduserer venøs tilbakestrømning og kan gi sirkulasjonssvikt og pneumothorax. Strategien er lav frekvens, lang ekspirasjon (I:E 1:3–1:5), lav PEEP og permissiv hyperkapni (pH over ca. 7,20), i tillegg til bronkodilaterende behandling. Lokal metodebok for Hamilton C6 anbefaler (S)CMV med firkantflow og inspiratorisk pause ved alvorlig obstruksjon, slik at platåtrykket kan følges.',
    }],
  },
  // ---------------------------------------------------------------- B5
  {
    id: 'barn-bronkiolitt', pediatric: true,
    title: 'Bronkiolitt: luftfangst hos småbarn',
    vignette: 'Gutt, 14 måneder, 76 cm, 10 kg (pasientkategori Barn/nyfødt, vekt 10 kg). RS-virusbronkiolitt, intubert for apné og utmattelse. Ventileres i PCV+: Pcontrol 16 over PEEP 5, frekvens 40, TI 0,6 s, O2 45 %. Sedert.',
    profileId: 'normal', patient: { height: 76, sex: 'M', group: 'neo', weightKg: 10, compliance: 6, resistance: 45, resistanceExp: 60, effort: { amplitude: 0, rate: 35, duration: 0.5 } },
    settings: { mode: 'PCV', pcontrol: 16, rate: 40, peep: 5, fio2: 45, timingMode: 'ti', ti: 0.6, pramp: 50, trigger: { type: 'flow', value: 1 }, pmax: 40 },
    gas: { shunt: 0.1, recruitability: 0.2, vco2: 60, hbGL: 110, deadspaceMl: 35 }, vitalsBase: { hr: 140, sys: 92, dia: 52, temp: 38.0 },
    variants: [{
      id: 'bronkiolitt', sounds: { wheeze: 0.7, secretions: 0.4 }, vitals: { hr: 10 }, delay: [10, 20], effect: { resistance: 1.4, resistanceExp: 2.1, rampIn: 60 },
      cues: [{ at: 0, who: 'obs', text: 'Du hører pipelyder og rasling ved hver utånding.' }, { at: 40, who: 'kollega', text: '«Tidevolumet har sunket, og CO2 stiger.»' }],
      clues: { lytt: 'Ekspiratoriske pipelyder og knatrelyder over begge lunger. Forlenget ekspirium.', se: 'Brystkassen er overoppblåst. Flowkurven når ikke null før neste pust.', krets: 'Kretsen er tett.', blodgass: 'pH 7,24, PaCO2 8,0 kPa, PaO2 9,5 kPa.' },
      fixes: ventFix,
      harmful: { rekruttering: 'Skadelig: høyt trykk i en obstruktiv lunge øker luftfangsten og risikoen for pneumothorax.' },
      neutral: { ...NEUTRAL_BASE, sug: 'Du suger litt seigt sekret. Det hjelper litt, men luftfangsten skyldes trange småluftveier.', bronkodilatator: 'Bronkodilatator har usikker effekt ved bronkiolitt og løser ikke luftfangsten.', lege: 'Legen: «Senk frekvensen så han får puste ut. Vi aksepterer CO2.»' },
      ventFix: true,
      target: 'AutoPEEP under 2 cmH2O og Vt minst 5,5 ml/kg, ved lavere frekvens (ca. 20–30) og lengre ekspirasjon.',
      resolve: ({ m, settings }) => m.autoPeep < 2 && m.vtPerKg >= 5.5 && settings.rate <= 32,
      teach: [
        { kind: 'info', when: () => true, text: 'Pasientkategori: barn under 15 kg legges inn som «Barn/nyfødt» med kroppsvekt, ikke høyde og kjønn (lokal metodebok, Hamilton C6). Vt/kg regnes da per kg kroppsvekt. Se Kontroller › Pasient.' },
        { kind: 'obs', when: ({ m }) => m.autoPeep > 3, text: 'Obs: AutoPEEP stiger. I trykkontroll spiser AutoPEEP av drivtrykket, så Vt faller.' },
        { when: ({ settings }) => settings.rate <= 30, text: 'Riktig! Ved obstruktiv bronkiolitt gir lavere frekvens og lengre ekspirasjon mindre luftfangst. Trykkontrollert ventilasjon og permissiv hyperkapni er vanlig strategi.' },
        { after: 'juster', when: ({ m }) => m.autoPeep < 2 && m.vtPerKg >= 5.5, text: 'Riktig! Vt steg da AutoPEEP falt, selv om du ikke økte trykket. Lungen fikk tømme seg.' },
        { kind: 'obs', when: ({ settings }) => settings.pcontrol >= 24, text: 'Obs: Høyere trykk gir mer luftfangst og risiko for pneumothorax i en obstruktiv lunge. Gi heller mer tid til ekspirasjon.' },
      ],
      explanation: 'Ved bronkiolitt med obstruktivt mønster er de små luftveiene trange og ekspirasjonen langsom. Høy frekvens gir for kort ekspirasjon, luft fanges, og i trykkontroll faller Vt fordi AutoPEEP reduserer trykkforskjellen. Lavere frekvens og lengre ekspirasjon reduserer luftfangsten. Gjennomgangsartikler anbefaler trykkontrollert ventilasjon og permissiv hyperkapni, og å følge med på luftfangst ved obstruktivt mønster.',
    }],
  },
  // ---------------------------------------------------------------- B6
  {
    id: 'barn-dka', pediatric: true,
    title: 'Diabetisk ketoacidose: for lavt minuttvolum etter intubasjon',
    vignette: 'Jente, 12 år, 150 cm. Alvorlig diabetisk ketoacidose med fallende bevissthet, intubert for 5 minutter siden. Før intubasjon pustet hun dypt og raskt. Respiratoren er satt opp med APVcmv, Vt 280 ml, frekvens 16, PEEP 5, O2 35 %.',
    profileId: 'normal', patient: { height: 150, sex: 'K', compliance: 40, resistance: 12, resistanceExp: 13, effort: { amplitude: 0, rate: 30, duration: 0.8 } },
    settings: { mode: 'APVCMV', vt: 280, rate: 16, peep: 5, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, trigger: { type: 'flow', value: 2 }, pmax: 40 },
    gas: { shunt: 0.05, recruitability: 0.2, vco2: 140, hbGL: 135 }, gasStart: { paco2: 2.4 }, vitalsBase: { hr: 135, sys: 98, dia: 54, temp: 36.8 },
    variants: [{
      id: 'dka', sounds: {}, vitals: {}, delay: [4, 8], effect: {},
      cues: [{ at: 0, who: 'monitor', text: 'PetCO2 stiger.' }, { at: 15, who: 'kollega', text: '«Før intubasjon pustet hun rundt 40 ganger i minuttet med dype pust. Blodgass da: pH 7,02, PaCO2 2,4 kPa, HCO3 4,6.»' }, { at: 60, who: 'monitor', text: 'Pulsen stiger, blodtrykket faller.' }],
      clues: { lytt: 'Normale respirasjonslyder.', se: 'Hun er sedert. Brystet beveger seg rolig, langt roligere enn før intubasjon.', krets: 'Kretsen er tett.', blodgass: 'pH 6,88, PaCO2 3,9 kPa, HCO3 5,3: PaCO2 har steget etter intubasjon, og pH har falt.' },
      fixes: ventFix,
      harmful: { sedasjon: 'Mer sedasjon løser ikke ventilasjonsproblemet; hun puster ikke selv uansett.' },
      neutral: { ...NEUTRAL_BASE, vaeske: 'Væske og insulin gis etter DKA-protokollen, men løser ikke at minuttvolumet er for lavt nå.', lege: 'Legen: «Minuttvolumet må opp til det hun klarte selv. Øk frekvensen.»' },
      ventFix: true,
      target: 'minuttvolum som matcher hennes egen kompensasjon: frekvens ca. 28–35, Vt ≤ 8 ml/kg, forventet PaCO2 ned mot 2,4–3,0 kPa, ikke lavere enn før intubasjon.',
      vitalsFn: ({ gas }) => { const x = Math.max(0, gas.paco2 - 3); return { hr: 8 * x, sys: -6 * x, dia: -3 * x }; },
      resolve: ({ m, gas }) => gas.target && gas.target.paco2 <= 3.0 && gas.target.paco2 >= 1.9 && m.vtPerKg <= 8.6 && m.pplat <= 28,
      teach: [
        { kind: 'obs', when: ({ gas }) => gas.paco2 > 3.2, text: 'Obs: PaCO2 stiger. Ved alvorlig metabolsk acidose kompenserte hun med stort minuttvolum. Når respiratoren gir mindre, stiger PaCO2 og pH faller livstruende.' },
        { when: ({ m }) => m.expMinVol >= 8, text: 'Riktig! Etter intubasjon må minuttvolumet minst matche det pasienten klarte selv (Kussmaul-pust).' },
        { when: ({ settings, m }) => settings.rate >= 26 && m.vtPerKg <= 8.6, text: 'Riktig! Øk frekvensen, gjerne til 28–35, heller enn å øke Vt over 8 ml/kg.' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 8.6, text: 'Obs: Vt er over 8 ml/kg IBW. Øk heller frekvensen.' },
        { kind: 'obs', when: ({ gas }) => gas.target && gas.target.paco2 < 1.9, text: 'Obs: Ikke hyperventiler lavere enn hun selv klarte. Aggressiv hyperventilering er forbundet med dårligere utfall ved hjerneødem ved DKA hos barn.' },
      ],
      explanation: 'Ved alvorlig diabetisk ketoacidose kompenserer pasienten for den metabolske acidosen ved å puste ut CO2 (Kussmaul-pust). Etter intubasjon overtar respiratoren, og settes den med vanlig frekvens, stiger PaCO2 og pH faller ytterligere, med risiko for arytmi og sirkulasjonssvikt. Minuttvolumet må minst matche pasientens egen kompensasjon, i praksis med høy frekvens. Samtidig skal man ikke hyperventilere lavere enn før intubasjon: aggressiv hyperventilering er forbundet med dårligere utfall ved hjerneødem (Marcin et al. 2002). Intubasjon av barn med DKA unngås derfor helst.',
    }],
  },
  // ---------------------------------------------------------------- B7
  {
    id: 'barn-hodeskade', pediatric: true,
    title: 'Alvorlig hodeskade: hyperventilering',
    vignette: 'Gutt, 10 år, 140 cm. Påkjørt på sykkel, alvorlig hodeskade, intubert ute. Ventileres i APVcmv med Vt 260 ml, frekvens 26, PEEP 5, O2 40 %. Trykkmåler for intrakranielt trykk er lagt inn. Sedert.',
    profileId: 'normal', patient: { height: 140, sex: 'M', compliance: 32, resistance: 12, resistanceExp: 13, effort: { amplitude: 0, rate: 20, duration: 0.9 } },
    settings: { mode: 'APVCMV', vt: 260, rate: 26, peep: 5, fio2: 40, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, trigger: { type: 'flow', value: 2 }, pmax: 40 },
    gas: { shunt: 0.05, recruitability: 0.2, vco2: 120, hbGL: 115 }, vitalsBase: { hr: 88, sys: 118, dia: 70, temp: 36.9 },
    variants: [{
      id: 'hodeskade', sounds: {}, vitals: {}, delay: [4, 8], effect: {},
      cues: [{ at: 0, who: 'monitor', text: 'PetCO2 viser 2,3 kPa.' }, { at: 15, who: 'kollega', text: 'Nevrokirurgen ringer: «Han skal ligge normokapnisk, PaCO2 rundt 4,7–5,3 kPa. Ingen profylaktisk hyperventilering.»' }],
      clues: { lytt: 'Normale respirasjonslyder.', se: 'Han er sedert, pupillene er like store og reagerer på lys. Brystet beveger seg jevnt.', krets: 'Kretsen er tett.', blodgass: 'pH 7,56, PaCO2 2,9 kPa, PaO2 14 kPa.' },
      fixes: ventFix,
      harmful: {},
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Senk minuttvolumet til PaCO2 er normal. Følg PetCO2 og ta ny blodgass.»' },
      ventFix: true,
      target: 'normokapni: forventet PaCO2 ca. 4,5–5,5 kPa (senk frekvensen til ca. 14–18), Vt 6–8 ml/kg, SpO2 ≥ 94 %.',
      resolve: ({ m, gas }) => gas.target && gas.target.paco2 >= 4.4 && gas.target.paco2 <= 5.6 && vtOk(m, 5.8, 8.5) && gas.spo2 >= 0.94,
      teach: [
        { kind: 'obs', when: ({ gas }) => gas.paco2 < 3.5, text: 'Obs: PaCO2 er svært lav. Hypokapni trekker sammen hjernens blodårer og kan gi iskemi i et allerede skadet område.' },
        { when: ({ gas }) => gas.target && gas.target.paco2 >= 4.4 && gas.target.paco2 <= 5.6, text: 'Riktig! Ved alvorlig hodeskade skal barnet være normokapnisk. Profylaktisk hyperventilering til PaCO2 under 4,0 kPa (30 mmHg) de første 48 timene frarådes (pediatriske hodeskaderetningslinjer 2019).' },
        { kind: 'obs', when: ({ gas }) => gas.target && gas.target.paco2 > 5.8, text: 'Obs: Hyperkapni utvider hjernens blodårer og øker det intrakranielle trykket. Hold PaCO2 normal.' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.rate <= 20, text: 'PaCO2 endrer seg over noen minutter etter en innstillingsendring. Følg PetCO2, og kontroller med blodgass.' },
      ],
      explanation: 'Frekvens 26 med Vt 8 ml/kg ga et minuttvolum langt over behovet, og PaCO2 falt til rundt 3 kPa. Hypokapni gir vasokonstriksjon i hjernen og kan forverre iskemi. Pediatriske retningslinjer for alvorlig hodeskade fraråder profylaktisk hyperventilering til PaCO2 under 30 mmHg (4,0 kPa) de første 48 timene, og hyperventilering er forbeholdt truende innklemming. Målet er normokapni, ofte PaCO2 ca. 4,7–5,3 kPa, og god oksygenering.',
    }],
  },
  // ---------------------------------------------------------------- B8
  {
    id: 'barn-lekkasje-autotrigging', pediatric: true,
    title: 'Ucuffet tube: lekkasje og autotrigging',
    vignette: 'Jente, 2 år, 86 cm, 12 kg (Barn/nyfødt). Pneumoni, intubert med ucuffet tube 4,5. Lett sedert og trigger pustene selv i PCV+: Pcontrol 12 over PEEP 5, frekvens 24, TI 0,7 s, flowtrigger 1 l/min, O2 35 %.',
    profileId: 'normal', patient: { height: 86, sex: 'K', group: 'neo', weightKg: 12, compliance: 7, resistance: 30, resistanceExp: 32, effort: { amplitude: 3, rate: 26, duration: 0.6 } },
    settings: { mode: 'PCV', pcontrol: 12, rate: 24, peep: 5, fio2: 35, timingMode: 'ti', ti: 0.7, pramp: 50, trigger: { type: 'flow', value: 1 }, pmax: 35 },
    gas: { shunt: 0.07, recruitability: 0.2, vco2: 60, hbGL: 112, deadspaceMl: 36 }, vitalsBase: { hr: 120, sys: 95, dia: 55, temp: 37.4 },
    variants: [{
      id: 'lekkasje', sounds: {}, vitals: { hr: 5 }, delay: [10, 20], effect: { leak: 0.3, triggerNoise: 2, noiseMode: 'leak' },
      cues: [{ at: 0, who: 'obs', text: 'Hun har vridd hodet til siden. Du hører en blåselyd fra munnen ved hver inspirasjon.' }, { at: 25, who: 'obs', text: 'Respiratoren gir pust tett i tett, men hun ligger rolig og ser ikke ut til å trekke pusten så ofte.' }],
      clues: { lytt: 'Normale respirasjonslyder. Blåselyd over halsen: luft lekker rundt tuben.', se: 'Hun ligger rolig. Respiratoren gir pust oftere enn hun selv puster. Hodet er vridd til siden; tuben er ucuffet.', krets: 'Kretsen er tett fram til tuben. Lekkasjen er rundt tuben.', blodgass: 'pH 7,48, PaCO2 4,2 kPa.' },
      fixes: ventFix,
      harmful: { sedasjon: 'Hun er rolig; sedasjon demper bare hennes egen pust.' },
      neutral: { ...NEUTRAL_BASE, cuff: 'Tuben er ucuffet; det finnes ingen cuff å fylle.', reposisjon: 'Du legger hodet i midtstilling. Lekkasjen avtar litt, men autotriggingen fortsetter.', lege: 'Legen: «Gjør triggeren mindre følsom. Vi vurderer cuffet tube hvis lekkasjen øker.»', kondens: 'Slangene er tørre.' },
      ventFix: true,
      target: 'frekvens tilbake til hennes egen (≤ 32) ved mindre følsom trigger: flowtrigger ca. 3 l/min eller trykktrigger.',
      resolve: ({ m, settings }) => m.fTotal <= 32 && (settings.trigger.type === 'pressure' || settings.trigger.value >= 2.5),
      teach: [
        { kind: 'obs', when: ({ m }) => m.fTotal > 36, text: 'Obs: Frekvensen er mye høyere enn hun selv puster. Lekkasjeflow tolkes som pusteforsøk: autotrigging.' },
        { when: ({ settings }) => settings.trigger.type === 'pressure' || settings.trigger.value >= 2.5, text: 'Riktig! En mindre følsom trigger (høyere flowtrigger eller trykktrigger) stopper autotrigging ved lekkasje.' },
        { kind: 'obs', when: ({ settings }) => settings.trigger.type === 'flow' && settings.trigger.value >= 6, text: 'Obs: En svært ufølsom trigger gjør at barnet må jobbe hardt for å få pust. Bruk laveste trigger som ikke autotrigger.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Lekkasje rundt tuben er vanligere hos barn fordi ucuffede tuber fortsatt brukes. Ved lekkasje viser VTE mindre enn VTI, og i trykkontroll kompenserer respiratoren delvis for tapet.' },
      ],
      explanation: 'Lekkasje rundt en ucuffet tube gir flow i kretsen som respiratoren kan tolke som et pusteforsøk. Med følsom flowtrigger (1 l/min) leverer den pust barnet ikke har bedt om, med høy frekvens og hypokapni som følge. Gjør triggeren mindre følsom (høyere flowtrigger eller trykktrigger), legg hodet i midtstilling, og vurder tube med cuff ved stor lekkasje. Andre årsaker til autotrigging er kondensvann og hjerteoscillasjoner.',
    }],
  },
  // ---------------------------------------------------------------- B9
  {
    id: 'barn-nevromuskulaer', pediatric: true,
    title: 'Nevromuskulær sykdom: for lite støtte',
    vignette: 'Gutt, 7 år, 118 cm, spinal muskelatrofi. Intubert for pneumoni, dag 3. Puster selv i SPONT med trykkstøtte 8 over PEEP 5, O2 35 %, flowtrigger 1 l/min.',
    profileId: 'normal', patient: { height: 118, sex: 'M', compliance: 14, resistance: 18, resistanceExp: 18, effort: { amplitude: 4, rate: 24, duration: 0.8 } },
    settings: { mode: 'SPONT', psupport: 8, peep: 5, fio2: 35, ets: 25, pramp: 50, trigger: { type: 'flow', value: 1 }, apneaTime: 15, backup: { rate: 20, pcontrol: 15 }, pmax: 35 },
    gas: { shunt: 0.07, recruitability: 0.2, vco2: 85, hbGL: 120, deadspaceMl: 65 }, vitalsBase: { hr: 100, sys: 100, dia: 60, temp: 37.8 },
    variants: [{
      id: 'nmd', sounds: {}, vitals: { hr: 20 }, delay: [10, 20], effect: { effort: { amplitude: 2, rate: 36, duration: 0.55 }, rampIn: 90 },
      cues: [{ at: 0, who: 'obs', text: 'Han puster raskere og mer overfladisk.' }, { at: 50, who: 'monitor', text: 'Respirasjonsfrekvensen er over 30, PetCO2 stiger.' }, { at: 90, who: 'kollega', text: '«Han ser sliten ut.»' }],
      clues: { lytt: 'Svak luftinngang basalt på begge sider.', se: 'Rask, overfladisk pust med paradoksale bukbevegelser. Han er svett.', krets: 'Kretsen er tett.', blodgass: 'pH 7,28, PaCO2 7,4 kPa, PaO2 10 kPa.' },
      fixes: ventFix,
      // med nok støtte hviler han: lavere frekvens, roligere pust
      effortFn: ({ settings }) => (settings.mode !== 'SPONT' || settings.psupport >= 12 ? { amplitude: 3, rate: 22, duration: 0.8 } : null),
      harmful: { sedasjon: 'Skadelig: sedasjon svekker pustedriven hos et barn som allerede har svake pustemuskler.' },
      neutral: { ...NEUTRAL_BASE, sug: 'Litt sekret; han hoster svakt. Det hjelper lite.', lege: 'Legen: «Gi ham mer støtte: høyere trykkstøtte eller kontrollert modus til han har hvilt.»' },
      ventFix: true,
      target: 'Vt 6–9 ml/kg og frekvens ≤ 30: høyere trykkstøtte (ca. 12–14) eller kontrollert modus (PCV+ / APVcmv).',
      resolve: ({ m, settings }) => (settings.mode !== 'SPONT' || settings.psupport >= 12) && m.vtPerKg >= 6 && m.vtPerKg <= 9.5 && m.fTotal <= 30,
      teach: [
        { kind: 'obs', when: ({ m }) => m.fTotal > 32 && m.vtPerKg < 5, text: 'Obs: Rask, overfladisk pust er tegn på utmattelse. Svake pustemuskler klarer ikke å holde Vt med lav trykkstøtte.' },
        { when: ({ settings }) => settings.mode !== 'SPONT' || settings.psupport >= 12, text: 'Riktig! Barn med nevromuskulær sykdom har svake pustemuskler. De trenger ofte mer trykkstøtte, og kontrollert ventilasjon når de er utmattet.' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 10, text: 'Obs: Vt over 10 ml/kg er for mye. Nok støtte betyr Vt 6–8 ml/kg og rolig frekvens, ikke maksimal støtte.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Ved nevromuskulær sykdom kan lungene være friske mens musklene svikter. Vt, frekvens og PaCO2 sier mer om støtten er nok enn SpO2. Hypoventilasjon defineres hos barn som TcpCO2/PaCO2 over 6,7 kPa (Metodebok, Barn med behov for LTMV).' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.mode !== 'SPONT' || settings.psupport >= 12, text: 'Ved nevromuskulær sykdom anbefales BiPAP (to trykknivåer med trykkstøtte), ikke CPAP alene, også etter ekstubasjon. Målet er Vt 6–10 ml/kg og normal CO2, og backup-frekvensen settes 2–3 under barnets egen frekvens (Metodebok, Barn med behov for LTMV).' },
        { kind: 'obs', when: ({ settings }) => settings.pramp > 100, text: 'Obs: Lang P-ramp (stigetid) gir for lite volum når barnet puster raskt. Hos barn, særlig de minste, skal stigetiden være kort nok til at pusten blir synkron og volumet tilstrekkelig.' },
        { kind: 'obs', when: ({ settings }) => settings.mode === 'SPONT' && settings.psupport <= 2, text: 'Obs: Bare CPAP gir ingen trykkstøtte. Svake pustemuskler trenger støtte i inspirasjonen (BiPAP / trykkstøtte), ikke bare PEEP.' },
      ],
      explanation: 'Barn med spinal muskelatrofi og andre nevromuskulære sykdommer har svake pustemuskler. Under en pneumoni trettes de raskt: pusten blir rask og overfladisk, og PaCO2 stiger. Trykkstøtte 8 holder ikke. Øk støtten til Vt 6–8 ml/kg og frekvens under 30, eller gå over til kontrollert modus for å hvile musklene. Sedasjon svekker pusten ytterligere. Den nasjonale metodeboka for barn med LTMV anbefaler BiPAP framfor CPAP ved nevromuskulær sykdom, Vt 6–10 ml/kg, backup-frekvens 2–3 under egen frekvens og kort stigetid hos små barn. Planlegg NIV med BiPAP etter ekstubasjon.',
    }],
  },
  // ---------------------------------------------------------------- B10
  {
    id: 'barn-ekstubasjonstest', pediatric: true,
    title: 'Ekstubasjonstest hos treåring',
    vignette: 'Gutt, 3 år, 95 cm, 14 kg (Barn/nyfødt). Intubert for bronkopneumoni, dag 4. Våken og rolig, god hoste, lite sekret. Puster selv i SPONT med trykkstøtte 10 over PEEP 6, O2 30 %.',
    profileId: 'normal', patient: { height: 95, sex: 'M', group: 'neo', weightKg: 14, compliance: 14, resistance: 25, resistanceExp: 25, effort: { amplitude: 3, rate: 24, duration: 0.85 } },
    settings: { mode: 'SPONT', psupport: 10, peep: 6, fio2: 30, ets: 25, pramp: 50, trigger: { type: 'flow', value: 1 }, apneaTime: 15, backup: { rate: 22, pcontrol: 14 }, pmax: 35 },
    gas: { shunt: 0.05, recruitability: 0.2, vco2: 65, hbGL: 115, deadspaceMl: 40 }, vitalsBase: { hr: 108, sys: 98, dia: 58, temp: 37.0 },
    variants: [{
      id: 'sbt', sounds: {}, vitals: {}, delay: [4, 8], effect: {},
      // jo mindre støtte, jo mer jobber han selv (frisk pustedrive)
      effortFn: ({ settings }) => ({ amplitude: Math.max(3, 10 - 0.7 * (settings.mode === 'SPONT' ? settings.psupport : 15)), rate: 24, duration: 0.85 }),
      cues: [{ at: 0, who: 'kollega', text: 'Legen: «Han er klar for ekstubasjonstest. Sett ham på CPAP 5 uten trykkstøtte, så vurderer vi etter testen.»' }],
      clues: { lytt: 'Normale respirasjonslyder, ingen pipelyder.', se: 'Han er våken, rolig og samarbeider. Ingen inndragninger.', krets: 'Kretsen er tett.', blodgass: 'pH 7,40, PaCO2 5,3 kPa, PaO2 11 kPa på 30 % O2.' },
      fixes: ventFix,
      harmful: { sedasjon: 'Feil: sedasjon før ekstubasjonstest gir et falskt dårlig resultat og forsinker ekstubasjonen.' },
      neutral: { ...NEUTRAL_BASE, sug: 'Du suger litt sekret før testen. Fint, men testen må startes på respiratoren.', lege: 'Legen: «SPONT med Psupport 0 og PEEP 5 er CPAP 5.»' },
      ventFix: true,
      target: 'CPAP 5: SPONT med trykkstøtte 0 og PEEP 5, O2 ≤ 40 %. Barnet skal holde SpO2 ≥ 94 %, Vt ≥ 5 ml/kg og frekvens ≤ 40.',
      resolve: ({ m, gas, settings }) => settings.mode === 'SPONT' && settings.psupport <= 1 && settings.peep >= 4 && settings.peep <= 5.5 && settings.fio2 <= 40 && gas.spo2 >= 0.94 && m.vtPerKg >= 5 && m.fTotal <= 40,
      teach: [
        { when: ({ settings }) => settings.mode === 'SPONT' && settings.psupport <= 1 && settings.peep <= 5.5, text: 'Riktig! En spontanpustetest med bare CPAP (≤ 5 cmH2O, uten trykkstøtte) etterligner best pustearbeidet etter ekstubasjon (PALICC-2). Barn med høy risiko for mislykket ekstubasjon bør testes på CPAP alene.' },
        { kind: 'obs', when: ({ settings }) => settings.mode !== 'SPONT', text: 'Obs: En ekstubasjonstest gjøres i spontan modus. Kontrollert ventilasjon tester ikke barnets egen pust.' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.psupport <= 1, text: 'Under testen: følg frekvens, Vt, SpO2, puls og tegn på økt pustearbeid (inndragninger, neseflaring, svette).' },
      ],
      explanation: 'En ekstubasjonstest (spontanpustetest) vurderer om barnet klarer pustearbeidet uten respiratorstøtte. PALICC-2 påpeker at en test med bare CPAP ≤ 5 cmH2O best etterligner situasjonen etter ekstubasjon, og internasjonale retningslinjer (PALISI 2023) anbefaler CPAP alene hos barn med høy risiko. På Hamilton gjøres dette i SPONT med Psupport 0 og PEEP 5. Følg frekvens, Vt, SpO2, puls og pustearbeid under testen.',
    }],
  },
  // ---------------------------------------------------------------- B11
  {
    id: 'barn-pcv-bedring', pediatric: true,
    title: 'PCV+: lungen bedres og tidevolumet stiger',
    vignette: 'Jente, 5 år, 108 cm. Pneumoni i bedring, dag 5. Ventileres i PCV+: Pcontrol 14 over PEEP 8, frekvens 22, TI 0,8 s, O2 35 %. Sedert.',
    profileId: 'normal', patient: { height: 108, sex: 'K', compliance: 9, resistance: 22, resistanceExp: 24, effort: { amplitude: 0, rate: 22, duration: 0.8 } },
    settings: { mode: 'PCV', pcontrol: 14, rate: 22, peep: 8, fio2: 35, timingMode: 'ti', ti: 0.8, pramp: 75, trigger: { type: 'flow', value: 1 }, pmax: 35 },
    gas: { shunt: 0.08, recruitability: 0.3, vco2: 70, hbGL: 112 }, vitalsBase: { hr: 104, sys: 100, dia: 60, temp: 37.5 },
    variants: [{
      id: 'bedring', sounds: {}, vitals: {}, delay: [10, 20], effect: { compliance: 1.6, rampIn: 90 },
      cues: [{ at: 0, who: 'obs', text: 'Brystet hever seg mer ved hvert pust enn i morges.' }, { at: 60, who: 'monitor', text: 'PetCO2 faller.' }, { at: 90, who: 'kollega', text: '«VTE har steget mye. Hva er det per kilo nå?»' }],
      clues: { lytt: 'Bedre luftinngang basalt enn i går.', se: 'Store brystbevegelser. Hun ligger rolig.', krets: 'Kretsen er tett.', blodgass: 'pH 7,49, PaCO2 4,1 kPa, PaO2 14 kPa.' },
      fixes: ventFix,
      harmful: {},
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Lungen er bedre. Senk Pcontrol til Vt er 6–8 ml/kg.»' },
      ventFix: true,
      target: 'Vt 6–8 ml/kg IBW ved lavere Pcontrol (ca. 8–10 cmH2O).',
      resolve: ({ m, settings }) => vtOk(m, 6, 8.2) && settings.pcontrol <= 11,
      teach: [
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 10, text: 'Obs: Vt er over 10 ml/kg IBW. Pediatrisk konsensus anbefaler å unngå Vt over 10 ml/kg; PALICC-2 sikter mot 6–8.' },
        { when: ({ settings }) => settings.pcontrol <= 11, text: 'Riktig! I trykkontrollert ventilasjon bestemmer compliance tidevolumet. Når lungen bedres, må trykket ned for å holde Vt på 6–8 ml/kg.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'I PCV+ stiller du trykket, og volumet blir et resultat. Følg VTE etter hver endring, særlig når lungen endrer seg.' },
      ],
      explanation: 'I PCV+ er trykket fast, og tidevolumet avhenger av lungens compliance. Når pneumonien går tilbake og compliance øker, gir samme Pcontrol mye større Vt, her over 10 ml/kg, med risiko for volumskade og hypokapni. Senk Pcontrol til Vt 6–8 ml/kg IBW. Etter hvert kan også PEEP og O2 trappes ned.',
    }],
  },
  // ---------------------------------------------------------------- B12
  {
    id: 'barn-hyperoksi', pediatric: true,
    title: 'Hyperoksi: for mye oksygen',
    vignette: 'Gutt, 18 måneder, 82 cm, 11 kg (Barn/nyfødt). Bronkopneumoni, dag 3, i bedring. Ventileres i APVcmv med Vt 80 ml, frekvens 26, PEEP 6. Oksygen ble skrudt opp til 80 % i natt og står der fortsatt. SpO2 100 %.',
    profileId: 'normal', patient: { height: 82, sex: 'M', group: 'neo', weightKg: 11, compliance: 10, resistance: 30, resistanceExp: 32, effort: { amplitude: 0, rate: 30, duration: 0.6 } },
    settings: { mode: 'APVCMV', vt: 80, rate: 26, peep: 6, fio2: 80, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, trigger: { type: 'flow', value: 1 }, pmax: 35 },
    gas: { shunt: 0.2, recruitability: 0.2, vco2: 55, hbGL: 110, deadspaceMl: 30 }, vitalsBase: { hr: 118, sys: 94, dia: 54, temp: 37.4 },
    variants: [{
      id: 'hyperoksi', sounds: {}, vitals: {}, delay: [4, 8], effect: {},
      cues: [{ at: 0, who: 'kollega', text: '«Blodgassen kom nå: PaO2 20 kPa på 80 % oksygen.»' }],
      clues: { lytt: 'Normale respirasjonslyder, litt knatrelyder høyre basalt.', se: 'Han ligger rolig, er rosa og varm.', krets: 'Kretsen er tett.', blodgass: 'pH 7,38, PaCO2 5,0 kPa, PaO2 20 kPa på 80 % O2.' },
      fixes: ventFix,
      harmful: {},
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Trapp ned oksygenet til SpO2 92–97 %.»' },
      ventFix: true,
      target: 'laveste O2 som gir SpO2 92–97 % (O2 ≤ 45 %).',
      resolve: ({ gas, settings }) => settings.fio2 <= 45 && sat(gas) >= 0.92 && sat(gas) <= 0.975,
      teach: [
        { kind: 'info', when: () => true, text: 'SpO2 99–100 % kan bety alt fra PaO2 13 til over 60 kPa. Derfor sier en så høy SpO2 lite om hvor mye oksygen barnet får for mye.' },
        { when: ({ settings, gas }) => settings.fio2 <= 45 && sat(gas) >= 0.92 && sat(gas) <= 0.975, text: 'Riktig! Hyperoksi kan skade lunger og andre organer. Bruk laveste O2 som gir SpO2 92–97 % (PALICC-2).' },
        { kind: 'obs', when: ({ gas }) => sat(gas) < 0.915, text: 'Obs: SpO2 er på vei under 92 %. Gå litt opp igjen; målet er 92–97 %.' },
      ],
      explanation: 'Oksygen er et legemiddel. Hyperoksi gir oksidativt stress og kan skade lunger og andre organer, og SpO2 100 % skjuler hvor høy PaO2 egentlig er. PALICC-2 anbefaler SpO2 92–97 % ved mild til moderat PARDS, og laveste FiO2 som når målet. Trapp ned oksygenet i trinn og følg SpO2.',
    }],
  },
];
