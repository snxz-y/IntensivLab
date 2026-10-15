import { NEUTRAL_BASE, ventFix, vtOk, sat, pao2, pf, paco2, ardsnetLowPeep, proneFix } from './common.js';

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
];
