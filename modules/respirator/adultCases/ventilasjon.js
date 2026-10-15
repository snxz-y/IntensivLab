/**
 * Voksencaser: ventilasjon, CO2 og syre–base. Løsningen er å justere minuttventilasjonen
 * (Vt og/eller frekvens; i DuoPAP P high og frekvens; i SPONT trykkstøtten) mot et begrunnet mål for PaCO2 eller pH.
 *
 * Kilder (se KILDER.md, «Voksencaser: ventilasjon, CO2 og syre–base»):
 *  - Metodebok akutt indremedisin (HUS) «Respiratorbehandling» v1.0: Vt 6–8 ml/kg IBW, frekvens 12–20,
 *    blodgassmål pH 7,35–7,45 og pCO2 5–6 kPa, permissiv hyperkapni pH 7,20–7,35.
 *  - Winters formel (Albert, Dell, Winters, Ann Intern Med 1967): forventet PaCO2 = 1,5 · HCO3 + 8 ± 2 mmHg.
 *  - Mosier et al. «The physiologically difficult airway» (West J Emerg Med 2015): minuttvolumet etter
 *    intubasjon ved alvorlig metabolsk acidose må matche pasientens egen kompensasjon.
 *  - Brain Trauma Foundation 4. utg. (Carney, Neurosurgery 2017): langvarig profylaktisk hyperventilering til
 *    PaCO2 ≤ 25 mmHg anbefales ikke; hyperventilering som midlertidig tiltak, unngås første 24 t, SjO2/PbtO2.
 *  - SIBICC (Hawryluk, Intensive Care Med 2019): ikke rutinemessig PaCO2 under 30 mmHg (4,0 kPa).
 *  - ENLS «Intracranial hypertension and herniation»: kortvarig (< 2 t) hyperventilering til PaCO2 30–35 mmHg.
 *  - ERC/ESICM post-resuscitation care 2021 og 2025 (Nolan): SpO2 94–98 %, normokapni 35–45 mmHg,
 *    Vt 6–8 ml/kg IBW, hyppig PaCO2-kontroll ved hypotermi.
 *  - ESC 2019 lungeemboli (Konstantinides): PEEP med forsiktighet, Vt ca. 6 ml/kg, Pplat < 30.
 *  - Manthous 1995 (feber og VCO2), Hinkson 2006 og Pelosi 1996 (utstyrsdødrom/HME), ARDSNet-protokollen (pH-mål),
 *    Nuckton 2002 (dødrom ved ARDS).
 * Tall for VCO2, dødrom, compliance og shunt er pedagogiske valg (UVERIFISERT), tilpasset så PaCO2 og pH blir realistiske.
 */
import { NEUTRAL_BASE, ventFix, vtOk, sat, pao2, paco2 } from './common.js';
import { phFromHco3Pco2 } from '../../../core/physiology/acidbase.js';

/** pH pasienten er på vei mot, gitt HCO3 (mmol/l) og steady-state PaCO2 (Henderson–Hasselbalch). */
const phMot = (hco3, gas) => phFromHco3Pco2(hco3, paco2(gas));
/** pH nå (PaCO2 henger etter innstillingene med noen minutter). */
const phNa = (hco3, gas) => phFromHco3Pco2(hco3, gas.paco2);
/**
 * Innstillingene har slått igjennom: frekvensen (glidende snitt) og Vt (volummodi) er der de er stilt.
 * Brukes så teorimeldinger om PaCO2-målet ikke utløses mens målet passerer under en endring.
 */
const rolig = ({ m, settings }) => (settings.mode === 'SPONT' || Math.abs((m.fTotal ?? 0) - settings.rate) < 0.6)
  && (!['APVCMV', 'SCMV'].includes(settings.mode) || Math.abs((m.vti ?? 0) - settings.vt) < 20);

export const VENTILASJON_CASES = [
  // ---------------------------------------------------------------- septisk laktacidose
  {
    id: 'v-ventilasjon-laktacidose',
    title: 'Septisk laktacidose: minuttvolumet etter intubasjon',
    vignette: 'Kvinne, 64 år, 166 cm. Septisk sjokk etter perforert divertikulitt, laktat 9 mmol/l. Hun pustet 34 ganger i minuttet og ble intubert for 5 minutter siden fordi hun ble utmattet. Respiratoren står på standardoppsett: APVcmv, Vt 400 ml, frekvens 14, PEEP 5, O2 40 %. Sedert og relaksert, puster ikke selv.',
    profileId: 'normal', patient: { height: 166, sex: 'K', compliance: 42, resistance: 11, resistanceExp: 12, effort: { amplitude: 0, rate: 34, duration: 0.8 } },
    settings: { mode: 'APVCMV', vt: 400, rate: 14, peep: 5, fio2: 40, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, pmax: 40 },
    gas: { shunt: 0.08, recruitability: 0.2, vco2: 220, hbGL: 105 }, gasStart: { paco2: 3.4 }, vitalsBase: { hr: 118, sys: 94, dia: 50, temp: 38.9 },
    variants: [{
      id: 'laktacidose', sounds: {}, vitals: {}, delay: [4, 8], effect: {},
      cues: [{ at: 0, who: 'monitor', text: 'PetCO2 stiger.' }, { at: 15, who: 'kollega', text: '«Blodgass rett før intubasjon: pH 7,21, PaCO2 3,4 kPa, HCO3 10, laktat 9. Hun pustet 34 ganger i minuttet.»' }, { at: 60, who: 'monitor', text: 'Blodtrykket faller, pulsen stiger.' }],
      clues: {
        lytt: 'Normale, symmetriske respirasjonslyder.',
        se: 'Hun er sedert og relaksert. Brystet hever seg rolig og sjelden, langt roligere enn før intubasjon.',
        krets: 'Kretsen er tett.',
        hold: 'Pplateau 15 cmH2O, drivtrykk 10 cmH2O. Lungene er ikke stive.',
        blodgass: 'pH 7,15, PaCO2 3,9 kPa, HCO3 10, laktat 9, PaO2 17 kPa. PetCO2 stiger fortsatt.',
      },
      fixes: { ...ventFix },
      harmful: {},
      neutral: { ...NEUTRAL_BASE, vaeske: 'Væske og noradrenalin gis etter sepsisbehandlingen, men løser ikke at minuttvolumet er for lavt nå.', lege: 'Legen: «Minuttvolumet må opp til det hun klarte selv. PaCO2 skal ned mot det Winters formel forventer, rundt 3 kPa.»' },
      ventFix: true,
      target: 'minuttvolum som matcher hennes egen kompensasjon: Vt 7–8 ml/kg IBW (ca. 410–460 ml) og frekvens ca. 26–30, så PaCO2 går ned mot 2,8–3,4 kPa (Winters formel: 1,5 × HCO3 + 8 ± 2 mmHg). Pplateau ≤ 30 og ingen AutoPEEP.',
      vitalsFn: ({ gas }) => { const x = Math.max(0, gas.paco2 - 3.6); return { hr: 6 * x, sys: -6 * x, dia: -3 * x }; },
      resolve: ({ m, gas }) => paco2(gas) >= 2.7 && paco2(gas) <= 3.5 && m.vtPerKg <= 8.5 && m.pplat <= 30 && (m.autoPeep ?? 0) < 3,
      teach: [
        { kind: 'obs', when: ({ gas }) => gas.paco2 > 4.2, text: 'Obs: PaCO2 stiger. Før intubasjon kompenserte hun den metabolske acidosen med stort minuttvolum. Med vanlig frekvens stiger PaCO2, og pH faller farlig: med HCO3 10 gir PaCO2 5 kPa pH rundt 7,04.' },
        { when: (c) => rolig(c) && c.settings.rate >= 24 && c.m.vtPerKg <= 8.5, text: 'Riktig! Høy frekvens (26–30) gir et minuttvolum nær det hun klarte selv. Mål PaCO2 etter Winters formel: 1,5 × HCO3 + 8 ± 2 mmHg. Med HCO3 10 blir det 23 ± 2 mmHg, altså 2,8–3,3 kPa.' },
        { kind: 'obs', after: 'juster', when: (c) => rolig(c) && c.settings.rate >= 16 && c.settings.rate < 24 && paco2(c.gas) > 4.2, text: 'Obs: «Normal» PaCO2 er feil mål her. Med HCO3 10 gir PaCO2 4,7 kPa pH rundt 7,07. Målet er den kompensasjonen hun hadde selv.' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 8.6, text: 'Obs: Vt over 8 ml/kg IBW. Metodeboka anbefaler Vt 6–8 ml/kg. Øk heller frekvensen.' },
        { kind: 'obs', when: ({ m }) => m.autoPeep > 2.5, text: 'Obs: AutoPEEP. Ved høy frekvens blir ekspirasjonstiden kort. Se at ekspirasjonsflowen når null før neste pust.' },
        { kind: 'info', after: 'juster', when: (c) => rolig(c) && paco2(c.gas) <= 3.5, text: 'Ta ny blodgass etter 20–30 minutter og følg PetCO2. Når laktaten faller og HCO3 stiger, må frekvensen trappes ned igjen, ellers får hun respiratorisk alkalose.' },
      ],
      explanation: 'Ved alvorlig metabolsk acidose, her septisk laktacidose med HCO3 10, kompenserer pasienten med stort minuttvolum, og PaCO2 blir lav. Etter intubasjon overtar respiratoren. Settes den på et vanlig minuttvolum (Vt 400, frekvens 14), stiger PaCO2 mot 6–7 kPa, og pH faller under 7,0, med fare for sirkulasjonssvikt og hjertestans. Still respiratoren slik at PaCO2 holdes der pasienten selv lå, eller der Winters formel forventer (1,5 × HCO3 + 8 ± 2 mmHg). I praksis betyr det høy frekvens (26–30) og Vt 7–8 ml/kg IBW, med kontroll av AutoPEEP og platåtrykk (Mosier et al., «The physiologically difficult airway», 2015). «Normal» PaCO2 er feil mål: med HCO3 10 gir PaCO2 4,7 kPa pH rundt 7,07. Ta blodgass etter 20–30 minutter, og trapp ned minuttvolumet når acidosen bedres. Intubasjon ved alvorlig metabolsk acidose er høyrisiko, fordi respiratoren ikke alltid klarer å gi så stort minuttvolum som pasienten selv.',
    }],
  },
  // ---------------------------------------------------------------- hodeskade: normokapni
  {
    id: 'v-ventilasjon-hodeskade',
    title: 'Alvorlig hodeskade: utilsiktet hyperventilering',
    vignette: 'Mann, 28 år, 183 cm. Alvorlig hodeskade etter motorsykkelulykke for 10 timer siden, ICP-måler lagt inn. Kom nettopp fra CT med respiratoren innstilt i APVcmv: Vt 560 ml, frekvens 18, PEEP 5, O2 35 %. Sedert, puster ikke selv. ICP 14 mmHg.',
    profileId: 'normal', patient: { height: 183, sex: 'M', compliance: 55, resistance: 10, resistanceExp: 11, effort: { amplitude: 0, rate: 14, duration: 1 } },
    settings: { mode: 'APVCMV', vt: 560, rate: 18, peep: 5, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, pmax: 40 },
    gas: { shunt: 0.1, recruitability: 0.2, vco2: 230, hbGL: 128 }, vitalsBase: { hr: 72, sys: 132, dia: 74, temp: 37.4 },
    variants: [{
      id: 'hyperventilert', sounds: {}, vitals: {}, delay: [4, 8], effect: {},
      cues: [{ at: 0, who: 'monitor', text: 'PetCO2 viser 3,3 kPa.' }, { at: 15, who: 'kollega', text: '«Han ble hyperventilert under transporten for å beskytte hjernen. Skal vi la det stå sånn?»' }, { at: 40, who: 'monitor', text: 'ICP 14 mmHg, CPP 78 mmHg.' }],
      clues: {
        lytt: 'Normale, symmetriske respirasjonslyder.',
        se: 'Han er sedert. Pupillene er like store, 3 mm, og reagerer på lys. Brystet beveger seg jevnt.',
        krets: 'Kretsen er tett.',
        hold: 'Pplateau 16 cmH2O, drivtrykk 10 cmH2O. Lungemekanikken er normal.',
        blodgass: 'pH 7,52, PaCO2 3,8 kPa, HCO3 23, PaO2 15 kPa.',
      },
      fixes: { ...ventFix },
      harmful: {},
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Han skal være normokapnisk, PaCO2 4,5–5,3 kPa. Ingen profylaktisk hyperventilering.»', sedasjon: 'Han er godt sedert. Sedasjon endrer ikke PaCO2 når respiratoren bestemmer minuttvolumet.' },
      ventFix: true,
      target: 'normokapni: PaCO2 4,5–5,3 kPa. Senk frekvensen til ca. 13–15 med Vt 6–8 ml/kg IBW, og hold SpO2 ≥ 94 %.',
      resolve: ({ m, gas }) => paco2(gas) >= 4.5 && paco2(gas) <= 5.3 && vtOk(m, 5.8, 8.3) && sat(gas) >= 0.94,
      teach: [
        { kind: 'obs', when: ({ gas }) => gas.paco2 < 4.0, text: 'Obs: PaCO2 under 4 kPa. Hypokapni trekker sammen hjernens blodårer og reduserer blodstrømmen, med fare for iskemi i skadet hjernevev. Det første døgnet er blodstrømmen ofte allerede kritisk lav.' },
        { when: (c) => rolig(c) && paco2(c.gas) >= 4.5 && paco2(c.gas) <= 5.3, text: 'Riktig! Ved alvorlig hodeskade er målet normokapni. Brain Trauma Foundation (2016) fraråder langvarig profylaktisk hyperventilering til PaCO2 ≤ 25 mmHg (3,3 kPa) og vil unngå hyperventilering de første 24 timene. SIBICC (2019) fraråder rutinemessig PaCO2 under 4,0 kPa.' },
        { kind: 'obs', when: (c) => rolig(c) && paco2(c.gas) > 5.6, text: 'Obs: Hyperkapni utvider hjernens blodårer og øker ICP. Ikke senk minuttvolumet for mye.' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg < 5.5, text: 'Obs: Vt under 6 ml/kg gir lite alveolær ventilasjon per pust. Juster minuttvolumet med frekvensen og behold Vt 6–8 ml/kg.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'PaCO2 endrer seg over noen minutter etter en justering. PetCO2 ligger normalt litt under PaCO2; sammenlign dem i en blodgass før du styrer etter PetCO2 alene.' },
      ],
      explanation: 'Under transporten ble pasienten hyperventilert: Vt 560 og frekvens 18 ga et minuttvolum på rundt 10 l/min og PaCO2 3,8 kPa. Hypokapni gir vasokonstriksjon i hjernen og reduserer blodstrømmen, og etter alvorlig hodeskade kan det gi iskemi. Brain Trauma Foundation (4. utgave, 2016) fraråder langvarig profylaktisk hyperventilering til PaCO2 ≤ 25 mmHg og anbefaler å unngå hyperventilering de første 24 timene, når blodstrømmen ofte er kritisk lav. SIBICC (2019) fraråder rutinemessig PaCO2 under 30 mmHg (4,0 kPa). Målet er normokapni, i praksis PaCO2 rundt 4,5–5,3 kPa, med Vt 6–8 ml/kg og god oksygenering. Senk frekvensen, ikke Vt. Hyperventilering er forbeholdt truende innklemming, og da bare kortvarig.',
    }],
  },
  // ---------------------------------------------------------------- truende innklemming
  {
    id: 'v-ventilasjon-herniering',
    title: 'Truende innklemming: kortvarig hyperventilering',
    vignette: 'Kvinne, 47 år, 170 cm. Alvorlig hodeskade med kontusjoner, dag 3. ICP-måler. Ventileres i (S)CMV: Vt 440 ml, frekvens 15, PEEP 5, O2 35 %, pause 10 %. Sedert, puster ikke selv. PaCO2 har ligget rundt 5,0 kPa og ICP 15–18 mmHg.',
    profileId: 'normal', patient: { height: 170, sex: 'K', compliance: 48, resistance: 10, resistanceExp: 11, effort: { amplitude: 0, rate: 14, duration: 1 } },
    settings: { mode: 'SCMV', vt: 440, rate: 15, peep: 5, fio2: 35, timingMode: 'ie', ie: { i: 1, e: 2 }, tip: 10, flowPattern: 'square', pmax: 40 },
    gas: { shunt: 0.06, recruitability: 0.2, vco2: 200, hbGL: 118 }, vitalsBase: { hr: 76, sys: 128, dia: 70, temp: 37.6 },
    variants: [{
      id: 'herniering', sounds: {}, vitals: { hr: -22, sys: 38, dia: 12 }, delay: [8, 15], effect: { rampIn: 30 },
      cues: [{ at: 0, who: 'monitor', text: 'ICP stiger: 28 mmHg.' }, { at: 10, who: 'obs', text: 'Høyre pupill er 6 mm og lysstiv. Venstre er 3 mm og reagerer.' }, { at: 25, who: 'monitor', text: 'ICP 38 mmHg. Blodtrykket stiger, pulsen faller.' }, { at: 40, who: 'kollega', text: 'Nevrokirurgen ringer: «Hypertont saltvann nå, CT er bestilt. Hyperventiler henne kortvarig til PaCO2 4,0–4,5 kPa til vi har en plan.»' }],
      clues: {
        lytt: 'Normale, symmetriske respirasjonslyder.',
        se: 'Høyre pupill er stor og lysstiv. Hun reagerer ikke. Tuben står fast.',
        krets: 'Kretsen er tett.',
        hold: 'Pplateau 14 cmH2O, Ppeak 19 cmH2O. Lungemekanikken er normal.',
        blodgass: 'pH 7,40, PaCO2 5,0 kPa, HCO3 23, PaO2 18 kPa. Blodgassen er normal; problemet er ICP.',
      },
      fixes: { ...ventFix },
      harmful: { sedasjonNed: 'Skadelig: våkning, hoste og motstand mot respiratoren øker ICP. Ved truende innklemming trengs tilstrekkelig sedasjon.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Hypertont saltvann går nå. Hyperventiler kortvarig til PaCO2 4,0–4,5 kPa, ikke lavere, og bare til CT og videre behandling er avklart.»', sedasjon: 'Hun er dypt sedert allerede. Sedasjon alene stopper ikke innklemmingen.', vaeske: 'Hypertont saltvann er ordinert og går. Det virker over minutter; ventilasjonen kan gi en raskere, kortvarig effekt.' },
      ventFix: true,
      target: 'kortvarig hyperventilering som bro til behandling (under 2 timer): PaCO2 4,0–4,5 kPa (30–34 mmHg), ikke under 4,0. Øk frekvensen til ca. 17–19 med Vt 6–8 ml/kg IBW.',
      vitalsFn: ({ gas }) => { const x = Math.min(1, Math.max(0, (5.0 - gas.paco2) / 0.8)); return { hr: 12 * x, sys: -20 * x, dia: -6 * x }; },
      resolve: ({ m, gas }) => paco2(gas) >= 4.0 && paco2(gas) <= 4.6 && vtOk(m, 5.8, 8.3),
      teach: [
        { when: (c) => rolig(c) && paco2(c.gas) >= 4.0 && paco2(c.gas) <= 4.6, text: 'Riktig! Ved tegn på innklemming kan kortvarig hyperventilering til PaCO2 30–35 mmHg (4,0–4,7 kPa) senke ICP mens hypertont saltvann og CT eller kirurgi kommer i gang (ENLS). Brain Trauma Foundation anbefaler hyperventilering bare som midlertidig tiltak.' },
        { kind: 'obs', when: (c) => rolig(c) && paco2(c.gas) < 3.9, text: 'Obs: PaCO2 under 4,0 kPa. Kraftig hyperventilering gir så mye vasokonstriksjon at hjernen kan bli iskemisk. SIBICC fraråder rutinemessig PaCO2 under 4,0 kPa.' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 8.5, text: 'Obs: Vt over 8 ml/kg IBW. Øk heller frekvensen.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Hyperventilering virker i løpet av minutter, men effekten avtar etter hvert, og langvarig bruk kan gi iskemi. Begrens tiden (ENLS: under 2 timer) og gå gradvis tilbake til normokapni. Brain Trauma Foundation anbefaler å overvåke hjernens oksygenering (SjO2 eller PbtO2) hvis hyperventilering brukes.' },
      ],
      explanation: 'Plutselig ICP-stigning, ensidig stor og lysstiv pupill, høyt blodtrykk og fallende puls (Cushing-respons) er tegn på truende innklemming. Hyperventilering senker PaCO2, trekker sammen hjernens blodårer og reduserer blodvolumet i hodet, så ICP faller i løpet av minutter. Det er et midlertidig tiltak mens definitiv behandling startes: hyperosmolar behandling, CT og eventuelt kirurgi. ENLS anbefaler kortvarig (under 2 timer) hyperventilering til PaCO2 30–35 mmHg (4,0–4,7 kPa). Brain Trauma Foundation (2016) beholder hyperventilering som midlertidig tiltak, vil unngå det de første 24 timene og anbefaler overvåking av hjernens oksygenering når det brukes. SIBICC (2019) fraråder rutinemessig PaCO2 under 4,0 kPa. Her økes frekvensen fra 15 til ca. 18, ikke til 30: for kraftig hyperventilering kan gi iskemi.',
    }],
  },
  // ---------------------------------------------------------------- etter hjertestans
  {
    id: 'v-ventilasjon-hjertestans',
    title: 'Etter hjertestans: for mye oksygen og for lav CO2',
    vignette: 'Mann, 58 år, 178 cm. Hjertestans utenfor sykehus med ventrikkelflimmer, egen sirkulasjon etter 18 minutter. Intubert, PCI gjort, nå på intensiv. Ventileres i PCV+: Pcontrol 16 over PEEP 5, frekvens 16, O2 100 % siden gjenopplivingen. Sedert, puster ikke selv. Temperaturkontroll med mål ≤ 37,5 °C.',
    profileId: 'normal', patient: { height: 178, sex: 'M', compliance: 40, resistance: 10, resistanceExp: 11, effort: { amplitude: 0, rate: 14, duration: 1 } },
    settings: { mode: 'PCV', pcontrol: 16, rate: 16, peep: 5, fio2: 100, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, pmax: 40 },
    gas: { shunt: 0.15, recruitability: 0.3, vco2: 200, hbGL: 128 }, vitalsBase: { hr: 92, sys: 108, dia: 62, temp: 36.4 },
    variants: [{
      id: 'rosc', sounds: {}, vitals: {}, delay: [4, 8], effect: {},
      cues: [{ at: 0, who: 'monitor', text: 'SpO2 100 %. PetCO2 2,7 kPa.' }, { at: 15, who: 'kollega', text: '«Han har stått på 100 % O2 helt siden ambulansen. Blodgassen er klar.»' }],
      clues: {
        lytt: 'Normale, symmetriske respirasjonslyder.',
        se: 'Han er sedert. Tuben står på 23 cm. Brystet hever seg godt.',
        krets: 'Kretsen er tett.',
        hold: 'Pplateau 20 cmH2O, drivtrykk 15 cmH2O. Vt rundt 610 ml (8,3 ml/kg).',
        blodgass: 'pH 7,55, PaCO2 3,2 kPa, HCO3 21, laktat 3, PaO2 52 kPa på 100 % O2.',
      },
      fixes: { ...ventFix },
      harmful: {},
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Titrer O2 til SpO2 94–98 % og still ventilasjonen til normokapni. Lungebeskyttende Vt 6–8 ml/kg.»' },
      ventFix: true,
      target: 'SpO2 94–98 % (O2 ned til laveste nivå som holder målet), normokapni PaCO2 4,7–6,0 kPa og Vt 6–8 ml/kg IBW: senk Pcontrol til ca. 11–13 og vurder frekvensen.',
      resolve: ({ m, gas }) => sat(gas) >= 0.94 && sat(gas) <= 0.98 && paco2(gas) >= 4.7 && paco2(gas) <= 6.0 && vtOk(m, 5.8, 8.2),
      teach: [
        { kind: 'obs', when: ({ gas, settings }) => settings.fio2 >= 80 && pao2(gas) > 20, text: 'Obs: PaO2 er langt over normalt. ERC/ESICM fraråder hyperoksi etter hjertestans. Titrer O2 ned så snart SpO2 kan måles pålitelig.' },
        { when: ({ gas, settings }) => settings.fio2 <= 50 && sat(gas) >= 0.94 && sat(gas) <= 0.98, text: 'Riktig! Etter gjenoppliving titreres O2 til SpO2 94–98 % eller PaO2 10–13 kPa (ERC/ESICM 2021 og 2025). Både hypoksemi og hyperoksi unngås.' },
        { when: (c) => rolig(c) && paco2(c.gas) >= 4.7 && paco2(c.gas) <= 6.0, text: 'Riktig! Målet etter hjertestans er normokapni, PaCO2 4,7–6,0 kPa (35–45 mmHg) (ERC/ESICM 2025). Hypokapni gir vasokonstriksjon i hjernen og kan forverre hjerneskaden etter stansen.' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 8.3, text: 'Obs: Vt over 8 ml/kg IBW. ERC/ESICM 2025 anbefaler lungebeskyttende ventilasjon med Vt 6–8 ml/kg IBW etter hjertestans. Senk Pcontrol.' },
        { kind: 'obs', after: 'juster', when: ({ gas }) => sat(gas) < 0.93, text: 'Obs: SpO2 under 94 %. Unngå hypoksemi (PaO2 under 8 kPa). Gå litt opp med O2.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Lav HCO3 og forhøyet laktat etter hjertestans er vanlig og bedres når sirkulasjonen er god. Målet er likevel normokapni, ikke å hyperventilere bort acidosen.' },
      ],
      explanation: 'Etter hjertestans kan både hypoksi, hyperoksi og hypokapni skade den sårbare hjernen. O2 100 % ga PaO2 over 50 kPa, og Pcontrol 16 ga Vt over 8 ml/kg, som med frekvens 16 senket PaCO2 til 3,2 kPa. ERC/ESICM (2021, gjentatt i 2025) anbefaler å titrere O2 til SpO2 94–98 % eller PaO2 10–13 kPa så snart metningen kan måles pålitelig, og å unngå både hypoksemi og hyperoksemi. Ventilasjonen stilles til normokapni, PaCO2 35–45 mmHg (ERC/ESICM 2025: 4,7–6,0 kPa), med lungebeskyttende Vt 6–8 ml/kg IBW. Lav HCO3 etter stansen er ikke en grunn til å hyperventilere. Følg blodgass og PetCO2, særlig hvis temperaturen endrer seg.',
    }],
  },
  // ---------------------------------------------------------------- lungeemboli: dødrom
  {
    id: 'v-ventilasjon-dodrom',
    title: 'Lungeemboli: PetCO2 lurer deg',
    vignette: 'Kvinne, 71 år, 160 cm. Stor lungeemboli med høyre ventrikkelsvikt, trombolysert for 3 timer siden og intubert fordi hun ble utmattet. Noradrenalin går. Ventileres i APVcmv: Vt 340 ml, frekvens 16, PEEP 8, O2 50 %. Sedert, puster ikke selv. Ventilasjonen er styrt etter PetCO2, som ligger rundt 4,2 kPa.',
    profileId: 'normal', patient: { height: 160, sex: 'K', compliance: 38, resistance: 12, resistanceExp: 13, effort: { amplitude: 0, rate: 14, duration: 1 } },
    settings: { mode: 'APVCMV', vt: 340, rate: 16, peep: 8, fio2: 50, timingMode: 'ie', ie: { i: 1, e: 2 }, pramp: 50, pmax: 40 },
    gas: { shunt: 0.2, recruitability: 0.1, vco2: 165, deadspaceMl: 170, petGap: 2.8, hbGL: 110 }, vitalsBase: { hr: 112, sys: 98, dia: 58, temp: 37.2 },
    variants: [{
      id: 'dodrom', sounds: {}, vitals: {}, delay: [4, 8], effect: { petGap: 2.8 },
      cues: [{ at: 0, who: 'monitor', text: 'PetCO2 4,2 kPa.' }, { at: 15, who: 'kollega', text: '«PetCO2 er jo fin. Skal vi ikke la respiratoren stå?»' }, { at: 40, who: 'monitor', text: 'Blodtrykket siger nedover.' }],
      clues: {
        lytt: 'Normale, symmetriske respirasjonslyder.',
        se: 'Hun er sedert. Halsvenene er fylte. Tuben står som dokumentert.',
        krets: 'Kretsen er tett.',
        hold: 'Pplateau 17 cmH2O ved PEEP 8: drivtrykk 9 cmH2O. Lungemekanikken er grei.',
        blodgass: 'pH 7,24, PaCO2 7,0 kPa, HCO3 22, PaO2 11 kPa på 50 % O2. PetCO2 er samtidig 4,2 kPa: forskjellen er 2,8 kPa (normalt under ca. 0,7).',
      },
      fixes: { ...ventFix },
      harmful: { rekruttering: 'Skadelig: en rekrutteringsmanøver med høyt trykk øker belastningen på høyre ventrikkel og kan gi blodtrykksfall. Lungene er ikke problemet; det er perfusjonen.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Det store dødrommet gjør PetCO2 ubrukelig som mål. Styr etter blodgass: øk frekvensen, hold Vt rundt 6–7 ml/kg og ikke mer PEEP.»', vaeske: 'Forsiktig med væske ved høyre ventrikkelsvikt. Det løser ikke ventilasjonsproblemet.' },
      ventFix: true,
      target: 'PaCO2 4,8–6,0 kPa styrt etter blodgass, ikke PetCO2: frekvens ca. 20–23, Vt rundt 6–7 ml/kg IBW (ikke over 8), Pplateau under 30 og PEEP ikke over 8.',
      vitalsFn: ({ gas, settings }) => { const x = Math.max(0, gas.paco2 - 5.5), y = Math.max(0, settings.peep - 8); return { sys: -6 * x - 3 * y, dia: -3 * x - 1.5 * y, hr: 4 * x + 2 * y }; },
      resolve: ({ m, gas, settings }) => paco2(gas) >= 4.8 && paco2(gas) <= 6.0 && m.vtPerKg <= 8 && settings.peep <= 8 && m.pplat < 30 && (m.autoPeep ?? 0) < 2,
      teach: [
        { kind: 'obs', when: ({ gas }) => gas.paco2 > 6.3, text: 'Obs: PetCO2 ser normal ut, men PaCO2 er høy. Ved lungeemboli ventileres mange alveoler som ikke får blod (alveolært dødrom). Gassen derfra inneholder nesten ikke CO2 og fortynner den utåndede luften, så PetCO2 blir mye lavere enn PaCO2.' },
        { when: (c) => rolig(c) && paco2(c.gas) <= 6.0 && c.settings.rate >= 19 && c.m.vtPerKg <= 8, text: 'Riktig! Høyere frekvens øker den alveolære ventilasjonen uten å øke Vt og trykk. ESC 2019: ved respiratorbehandling av lungeemboli skal Vt være ca. 6 ml/kg og Pplateau under 30 cmH2O, og PEEP brukes med forsiktighet fordi positivt trykk i thorax reduserer venøst tilbakeløp og kan forverre høyre ventrikkelsvikt.' },
        { kind: 'obs', when: ({ settings }) => settings.peep > 8, text: 'Obs: Høyere PEEP øker trykket i thorax, reduserer venøst tilbakeløp og kan forverre høyre ventrikkelsvikt. ESC 2019: PEEP med forsiktighet ved lungeemboli.' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 8.3, text: 'Obs: Stort Vt gir høyere trykk i thorax og belaster høyre ventrikkel. Øk heller frekvensen.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'PetCO2 faller når du øker ventilasjonen, men forskjellen mot PaCO2 består så lenge dødrommet er stort. Bruk blodgass til å sette målet, og PetCO2 til å følge trenden. Hyperkapni og acidose øker motstanden i lungekarene og belaster høyre ventrikkel ytterligere.' },
      ],
      explanation: 'Ved stor lungeemboli får deler av lungen ventilasjon uten perfusjon. Dødrommet øker, og en større del av hvert pust går til spille. PetCO2 måler CO2 i utåndingsluften, som blir fortynnet av gass fra de uperfunderte alveolene, så forskjellen mellom PaCO2 og PetCO2 (normalt under ca. 0,7 kPa) blir stor. Her var den 2,8 kPa: PetCO2 4,2 «så fin ut», mens PaCO2 var 7,0 kPa og pH 7,24. Hyperkapni og acidose øker motstanden i lungekarene og belaster en høyre ventrikkel som allerede svikter. Løsningen er å styre etter blodgass og øke frekvensen. ESC 2019 anbefaler Vt ca. 6 ml/kg og Pplateau under 30 cmH2O ved respiratorbehandling av lungeemboli, og PEEP med forsiktighet, fordi positivt trykk i thorax reduserer venøst tilbakeløp. Rekrutteringsmanøvrer og høy PEEP hører ikke hjemme her.',
    }],
  },
  // ---------------------------------------------------------------- feber og frysninger
  {
    id: 'v-ventilasjon-feber',
    title: 'Feber og frysninger: CO2-produksjonen øker',
    vignette: 'Mann, 52 år, 175 cm. Pneumokokkpneumoni, dag 2. Ventileres i DuoPAP: P high 20, PEEP 8, frekvens 14, T high 1,4 s, trykkstøtte 8, O2 40 %. Sedert, puster ikke selv. PaCO2 var 5,3 kPa i morges. For et kvarter siden fikk han frysninger, og temperaturen stiger.',
    profileId: 'normal', patient: { height: 175, sex: 'M', compliance: 40, resistance: 11, resistanceExp: 12, effort: { amplitude: 0, rate: 14, duration: 1 } },
    settings: { mode: 'DUOPAP', phigh: 20, peep: 8, rate: 14, timingMode: 'ti', ti: 1.4, psupport: 8, fio2: 40, pramp: 50, pmax: 40 },
    gas: { shunt: 0.12, recruitability: 0.3, vco2: 290, hbGL: 125 }, gasStart: { paco2: 6.0 }, vitalsBase: { hr: 104, sys: 116, dia: 62, temp: 39.6 },
    variants: [{
      id: 'frysninger', sounds: {}, vitals: { hr: 14, sys: 10, dia: 4 }, delay: [4, 8], effect: {},
      cues: [{ at: 0, who: 'obs', text: 'Han skjelver fortsatt i hele kroppen.' }, { at: 10, who: 'monitor', text: 'Temperaturen er 39,6 °C.' }, { at: 45, who: 'monitor', text: 'PetCO2 stiger: nå 5,9 kPa.' }],
      clues: {
        lytt: 'Bronkial respirasjonslyd og knatrelyder basalt på høyre side, som før.',
        se: 'Han skjelver med hele kroppen. Huden er varm. Brystet beveger seg likt på begge sider.',
        krets: 'Kretsen er tett.',
        hold: 'Pplateau 20 cmH2O (P high), drivtrykk 12 cmH2O. Vt rundt 460 ml (6,5 ml/kg).',
        blodgass: 'pH 7,30, PaCO2 6,6 kPa, HCO3 24, PaO2 14 kPa. PaCO2 var 5,3 i morges.',
      },
      fixes: { ...ventFix },
      harmful: {},
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Feber og frysninger øker CO2-produksjonen. Gi paracetamol og demp frysningene, men minuttvolumet må opp nå. Mål PaCO2 5–6 kPa.»', sedasjon: 'Mer sedasjon og opioid kan dempe frysningene og CO2-produksjonen noe, men PaCO2 er høy nå. Minuttvolumet må opp.', smertelindring: 'Opioid kan dempe frysningene noe, men PaCO2 er høy nå. Minuttvolumet må opp.' },
      ventFix: true,
      target: 'PaCO2 4,7–6,0 kPa: øk frekvensen til ca. 20–22, eventuelt P high så Vt blir 7–8 ml/kg IBW. Vt ikke over 8 ml/kg og P high ikke over 30.',
      resolve: ({ m, gas }) => paco2(gas) >= 4.7 && paco2(gas) <= 6.0 && m.vtPerKg <= 8.3 && m.pplat <= 30,
      teach: [
        { kind: 'obs', when: ({ gas }) => gas.paco2 > 6.2, text: 'Obs: PaCO2 stiger selv om respiratoren står likt. Feber og frysninger øker CO2-produksjonen. Hos febrile respiratorpasienter falt VCO2 fra ca. 300 til 240 ml/min da temperaturen ble senket fra 39,4 til 37 °C (Manthous 1995), og skjelving øker den mer.' },
        { after: 'juster', when: (c) => rolig(c) && paco2(c.gas) <= 6.0, text: 'Riktig! Større CO2-produksjon krever større alveolær ventilasjon for samme PaCO2. Frekvensen er det enkleste å øke når Vt allerede er 6–8 ml/kg.' },
        { kind: 'obs', when: ({ settings }) => settings.mode === 'DUOPAP' && settings.peep > 8, text: 'Obs: I DuoPAP er P high et absolutt trykk. Øker du PEEP uten å øke P high, blir trykkforskjellen og dermed Vt mindre.' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 8.5, text: 'Obs: Vt over 8 ml/kg IBW. Øk heller frekvensen enn P high.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Behandle årsaken også: feberbehandling og demping av frysningene reduserer CO2-produksjonen og oksygenforbruket. Følg PetCO2, og trapp ned minuttvolumet når temperaturen faller.' },
      ],
      explanation: 'CO2-produksjonen (VCO2) følger stoffskiftet. Feber øker den, og frysninger (skjelving) øker den enda mer. Manthous et al. (1995) målte VCO2 hos febrile respiratorpasienter: den falt fra ca. 300 til 240 ml/min da temperaturen ble senket fra 39,4 til 37 °C. Med samme minuttvolum stiger da PaCO2, her fra 5,3 mot nesten 8 kPa, og pH faller. Alveolær ventilasjon må økes i takt med CO2-produksjonen. I DuoPAP økes minuttvolumet med frekvensen eller med P high. P high er et absolutt trykk, så PEEP-økning alene gir mindre Vt. Behandle samtidig feberen og frysningene, og trapp ned ventilasjonen igjen når temperaturen og CO2-produksjonen faller.',
    }],
  },
  // ---------------------------------------------------------------- hypotermi
  {
    id: 'v-ventilasjon-hypotermi',
    title: 'Hypotermi: for stort minuttvolum når CO2-produksjonen faller',
    vignette: 'Mann, 61 år, 185 cm. Funnet ute en kald natt, alkoholpåvirket og bevisstløs, kjernetemperatur 31,8 °C. Intubert i akuttmottaket og ventileres i (S)CMV: Vt 560 ml, frekvens 14, PEEP 5, O2 40 %, pause 10 %. Sedert, puster ikke selv. Han varmes forsiktig med varmeteppe.',
    profileId: 'normal', patient: { height: 185, sex: 'M', compliance: 50, resistance: 10, resistanceExp: 11, effort: { amplitude: 0, rate: 12, duration: 1 } },
    settings: { mode: 'SCMV', vt: 560, rate: 14, peep: 5, fio2: 40, timingMode: 'ie', ie: { i: 1, e: 2 }, tip: 10, flowPattern: 'square', pmax: 40 },
    gas: { shunt: 0.1, recruitability: 0.2, vco2: 160, hbGL: 140 }, vitalsBase: { hr: 52, sys: 104, dia: 60, temp: 31.8 },
    variants: [{
      id: 'kald', sounds: {}, vitals: {}, delay: [4, 8], effect: {},
      cues: [{ at: 0, who: 'monitor', text: 'PetCO2 2,9 kPa.' }, { at: 15, who: 'kollega', text: '«Blodgassen er analysert ved 37 °C, ikke korrigert for temperatur. Er ikke PaCO2 veldig lav?»' }],
      clues: {
        lytt: 'Normale, symmetriske respirasjonslyder.',
        se: 'Han er kald og blek, sedert. Ingen skjelving. Brystet hever seg jevnt.',
        krets: 'Kretsen er tett.',
        hold: 'Pplateau 16 cmH2O, Ppeak 22 cmH2O. Lungemekanikken er normal.',
        blodgass: 'Analysert ved 37 °C, ikke temperaturkorrigert: pH 7,52, PaCO2 3,4 kPa, HCO3 21, PaO2 17 kPa.',
      },
      fixes: { ...ventFix },
      harmful: {},
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «CO2-produksjonen er lav når han er så kald. Senk minuttvolumet til normokapni, og følg PaCO2 tett mens han varmes opp.»', vaeske: 'Han får varm væske etter ordinasjon. Det løser ikke at minuttvolumet er for stort.' },
      ventFix: true,
      target: 'normokapni i blodgass analysert ved 37 °C: PaCO2 4,7–6,0 kPa. Senk frekvensen (til ca. 9–10), eventuelt Vt mot 6–7 ml/kg IBW, men ikke under 6.',
      resolve: ({ m, gas, settings }) => paco2(gas) >= 4.7 && paco2(gas) <= 6.0 && vtOk(m, 5.8, 8.3) && settings.rate >= 8,
      teach: [
        { kind: 'obs', when: ({ gas }) => gas.paco2 < 4.0, text: 'Obs: PaCO2 er lav. Ved hypotermi faller stoffskiftet, omtrent 7 % per grad, og CO2-produksjonen faller med det. Samme minuttvolum som hos en normoterm pasient gir da hypokapni.' },
        { when: (c) => rolig(c) && paco2(c.gas) >= 4.7 && paco2(c.gas) <= 6.0, text: 'Riktig! ERC/ESICM 2025: ved utilsiktet eller behandlet hypotermi skal PaCO2 følges ofte, fordi hypokapni kan oppstå. Målet er normokapni, 4,7–6,0 kPa.' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg < 5.6, text: 'Obs: Vt under 6 ml/kg gir lite alveolær ventilasjon per pust og fare for atelektaser. Senk heller frekvensen.' },
        { kind: 'obs', when: (c) => rolig(c) && paco2(c.gas) > 6.2, text: 'Obs: Nå er minuttvolumet for lavt. Sikt mot PaCO2 4,7–6,0 kPa.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Når han varmes opp, øker CO2-produksjonen igjen, særlig hvis han begynner å skjelve. Da må minuttvolumet opp. Følg PetCO2 og ta blodgass jevnlig under oppvarmingen.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Bruk konsekvent enten temperaturkorrigerte eller ikke-korrigerte blodgassverdier (ERC/ESICM 2025). Ved utilsiktet hypotermi brukes vanligvis verdier analysert ved 37 °C uten korreksjon (alfa-stat).' },
      ],
      explanation: 'Ved hypotermi faller stoffskiftet, omtrent 7 % per grad, og dermed også CO2-produksjonen. Ved 31,8 °C produserer han kanskje en tredel mindre CO2 enn normalt. Respiratoren var satt opp for en normoterm voksen (Vt 560, frekvens 14), og PaCO2 falt til 3,4 kPa (målt ved 37 °C). Hypokapni gir vasokonstriksjon i hjernen. ERC/ESICM 2025 anbefaler normokapni og hyppig kontroll av PaCO2 ved utilsiktet eller behandlet hypotermi, og at man bruker enten temperaturkorrigerte eller ikke-korrigerte blodgassverdier konsekvent. Ved utilsiktet hypotermi er ikke-korrigerte verdier (alfa-stat) vanligst. Senk minuttvolumet, helst med frekvensen. Under oppvarmingen øker CO2-produksjonen igjen, og minuttvolumet må følge etter.',
    }],
  },
  // ---------------------------------------------------------------- respiratorisk alkalose
  {
    id: 'v-ventilasjon-alkalose',
    title: 'Respiratorisk alkalose: frekvensen ble stående',
    vignette: 'Kvinne, 38 år, 163 cm. Diabetisk ketoacidose med aspirasjonspneumoni, intubert i går kveld. Da var pH 6,98 og HCO3 4, og frekvensen ble satt høyt. Ketoacidosen er nå behandlet. Ventileres fortsatt i DuoPAP: P high 18, PEEP 6, frekvens 26, T high 0,9 s, trykkstøtte 8, O2 35 %. Sedert, puster ikke selv.',
    profileId: 'normal', patient: { height: 163, sex: 'K', compliance: 38, resistance: 10, resistanceExp: 11, effort: { amplitude: 0, rate: 16, duration: 1 } },
    settings: { mode: 'DUOPAP', phigh: 18, peep: 6, rate: 26, timingMode: 'ti', ti: 0.9, psupport: 8, fio2: 35, pramp: 50, pmax: 40 },
    gas: { shunt: 0.12, recruitability: 0.2, vco2: 190, hbGL: 118 }, vitalsBase: { hr: 96, sys: 118, dia: 66, temp: 37.3 },
    variants: [{
      id: 'alkalose', sounds: {}, vitals: {}, delay: [4, 8], effect: {},
      cues: [{ at: 0, who: 'monitor', text: 'PetCO2 2,6 kPa.' }, { at: 15, who: 'kollega', text: '«Morgenblodgassen er klar. Kalium er 3,3, så de har økt kaliumtilskuddet.»' }],
      clues: {
        lytt: 'Lett knatring basalt på høyre side.',
        se: 'Hun er sedert og rolig. Brystet hever seg jevnt.',
        krets: 'Kretsen er tett.',
        hold: 'Pplateau 17 cmH2O (P high 18), drivtrykk 11 cmH2O. Vt rundt 400 ml (7,2 ml/kg).',
        blodgass: 'pH 7,55, PaCO2 3,1 kPa, HCO3 20, PaO2 14 kPa, kalium 3,3. Ketonene er nesten borte.',
      },
      fixes: { ...ventFix },
      harmful: {},
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Ketoacidosen er over. Nå er det respiratorisk alkalose. Senk frekvensen så pH blir 7,35–7,45.»' },
      ventFix: true,
      target: 'pH 7,35–7,45: med HCO3 20 tilsvarer det PaCO2 ca. 3,9–4,9 kPa. Senk frekvensen til ca. 16–19 og behold Vt 6–8 ml/kg IBW.',
      resolve: ({ m, gas }) => phMot(20, gas) >= 7.35 && phMot(20, gas) <= 7.45 && vtOk(m, 5.8, 8.3),
      teach: [
        { kind: 'obs', when: ({ gas }) => phNa(20, gas) > 7.5, text: 'Obs: pH over 7,5. Alkalose flytter kalium inn i cellene, senker ionisert kalsium og kan gi arytmier. Hypokapnien trekker også sammen hjernens blodårer.' },
        { when: (c) => rolig(c) && phMot(20, c.gas) >= 7.35 && phMot(20, c.gas) <= 7.45, text: 'Riktig! Minuttvolumet som trengtes under ketoacidosen, er for stort nå som HCO3 nesten er normal. Senk frekvensen til pH 7,35–7,45 (Metodebok; ARDSNet-protokollen: ved pH over 7,45 senkes frekvensen).' },
        { kind: 'obs', when: (c) => rolig(c) && phMot(20, c.gas) < 7.33, text: 'Obs: Nå har du gått for langt ned. HCO3 er fortsatt litt lav (20), så PaCO2 må ligge litt under 5 kPa for å holde pH over 7,35.' },
        { kind: 'info', after: 'juster', when: ({ settings }) => settings.mode === 'DUOPAP', text: 'I DuoPAP bestemmer frekvensen og T high syklusen. Når frekvensen senkes med samme T high, blir tiden på PEEP-nivå (T low) lengre, og I:E endres.' },
      ],
      explanation: 'Under alvorlig ketoacidose trenger pasienten et stort minuttvolum for å kompensere (lav PaCO2). Når insulin og væske har rettet acidosen, er HCO3 nesten normal, men frekvensen står fortsatt på 26. Da blir det respiratorisk alkalose: PaCO2 3,1 kPa og pH 7,55 med HCO3 20. Alkalose flytter kalium inn i cellene, senker ionisert kalsium og øker risikoen for arytmier, og hypokapni gir vasokonstriksjon i hjernen. Senk frekvensen til pH 7,35–7,45 (Metodebok, Respiratorbehandling). Med HCO3 20 betyr det PaCO2 rundt 4–5 kPa, ikke nødvendigvis over 5: målet er pH, og PaCO2-målet regnes ut fra HCO3 med Henderson–Hasselbalch. Ta ny blodgass, for HCO3 endrer seg videre.',
    }],
  },
  // ---------------------------------------------------------------- permissiv hyperkapni for langt
  {
    id: 'v-ventilasjon-permissiv',
    title: 'ARDS: permissiv hyperkapni som har gått for langt',
    vignette: 'Mann, 44 år, 188 cm. ARDS etter aspirasjon, dag 2. Ventileres lungebeskyttende i PCV+: Pcontrol 14 over PEEP 12, frekvens 14, TI 1,0 s, O2 50 %. Vt rundt 470 ml (5,7 ml/kg). Sedert, puster ikke selv. Frekvensen har stått på 14 siden innleggelsen, mens lungene er blitt stivere.',
    profileId: 'ards', patient: { height: 188, sex: 'M', compliance: 36, resistance: 10, resistanceExp: 11, effort: { amplitude: 0, rate: 14, duration: 1 } },
    settings: { mode: 'PCV', pcontrol: 14, rate: 14, peep: 12, fio2: 50, timingMode: 'ti', ti: 1.0, pramp: 50, pmax: 40 },
    gas: { shunt: 0.22, recruitability: 0.4, vco2: 250, deadspaceMl: 260, petGap: 1.5, hbGL: 112 }, vitalsBase: { hr: 104, sys: 112, dia: 60, temp: 38.1 },
    variants: [{
      id: 'acidose', sounds: {}, vitals: {}, delay: [4, 8], effect: { petGap: 1.5 },
      cues: [{ at: 0, who: 'monitor', text: 'PetCO2 8,3 kPa.' }, { at: 15, who: 'kollega', text: '«Blodgassen er klar. pH er lavere enn i går.»' }],
      clues: {
        lytt: 'Knatrelyder over begge lunger.',
        se: 'Han er sedert og rolig. Symmetriske bevegelser. Tuben står på 24 cm.',
        krets: 'Kretsen er tett.',
        hold: 'Pplateau 25 cmH2O ved PEEP 12: drivtrykk 13 cmH2O. Vt rundt 470 ml (5,7 ml/kg).',
        blodgass: 'pH 7,14, PaCO2 9,8 kPa, HCO3 25, PaO2 12 kPa på 50 % O2.',
      },
      fixes: { ...ventFix },
      harmful: { rekruttering: 'Rekrutteringsmanøver løser ikke hyperkapnien, og høyt trykk øker risikoen for barotraume. Øk frekvensen.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «pH under 7,20 er for lavt, selv med permissiv hyperkapni. Øk frekvensen, ikke trykket.»' },
      ventFix: true,
      target: 'pH ≥ 7,30 (ARDSNet-mål 7,30–7,45; Metodeboka godtar ned mot 7,20): øk frekvensen til ca. 22–28 uten å øke Pcontrol. Pplateau ≤ 30, drivtrykk ≤ 15, Vt rundt 6 ml/kg og ingen AutoPEEP.',
      resolve: ({ m, gas }) => phMot(25, gas) >= 7.30 && m.pplat <= 30 && m.vtPerKg <= 6.8 && (m.autoPeep ?? 0) < 2.5,
      teach: [
        { kind: 'obs', when: ({ gas }) => phNa(25, gas) < 7.2, text: 'Obs: pH under 7,20. Permissiv hyperkapni betyr at vi godtar høy PaCO2 for å skåne lungene, men ikke ubegrenset: Metodeboka godtar pH ned mot 7,20, og ARDSNet-protokollen sikter mot 7,30–7,45.' },
        { when: (c) => rolig(c) && c.settings.rate >= 20 && c.m.pplat <= 30 && c.m.vtPerKg <= 6.8, text: 'Riktig! ARDSNet: ved pH 7,15–7,30 økes frekvensen (høyst 35) til pH er over 7,30. Frekvensen øker minuttvolumet uten å øke platå- eller drivtrykket.' },
        { kind: 'obs', when: ({ m }) => m.pplat > 30 || m.vtPerKg > 7, text: 'Obs: Høyere Pcontrol gir større Vt og høyere platåtrykk. Ved ARDS holdes Vt rundt 6 ml/kg og Pplateau ≤ 30; øk heller frekvensen. Først når pH er under 7,15 med frekvens 35, kan Vt økes (ARDSNet).' },
        { kind: 'obs', when: ({ m }) => m.autoPeep > 2, text: 'Obs: AutoPEEP. Ekspirasjonstiden blir for kort ved høy frekvens. Se at flowen når null før neste pust.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Ved ARDS er dødrommet stort (Vd/Vt ofte over 0,5), så hver ekstra pust fjerner mindre CO2 enn i en frisk lunge, og PetCO2 ligger langt under PaCO2. Frekvensen er likevel det tryggeste virkemiddelet. Aktiv fukter i stedet for HME-filter og så lite utstyrsdødrom som mulig hjelper også.' },
      ],
      explanation: 'Lungebeskyttende ventilasjon med Vt rundt 6 ml/kg og Pplateau ≤ 30 krever ofte høyere frekvens for å holde minuttvolumet. Ved ARDS er dødrommet stort (Nuckton 2002: gjennomsnittlig Vd/Vt rundt 0,58), og med frekvens 14 ble den alveolære ventilasjonen for liten: PaCO2 9,8 kPa og pH 7,14. Permissiv hyperkapni er akseptert, men har en grense: Metodeboka godtar pH ned mot 7,20, og ARDSNet-protokollen sikter mot pH 7,30–7,45. Ved pH 7,15–7,30 økes frekvensen (høyst 35) til pH er over 7,30; Vt økes først når pH er under 7,15 med frekvens 35. Å øke Pcontrol gir større Vt og høyere platå- og drivtrykk, og bryter med lungebeskyttelsen. Følg AutoPEEP når frekvensen økes. Med fast TI på 1,0 s blir ekspirasjonstiden kortere når frekvensen øker.',
    }],
  },
  // ---------------------------------------------------------------- utstyrsdødrom
  {
    id: 'v-ventilasjon-utstyrsdodrom',
    title: 'Utstyrsdødrom: HME-filter og ekstra slangestykke',
    vignette: 'Kvinne, 79 år, 158 cm. Hoftebrudd og pneumoni, intubert dag 5, i avvenning. Lett sedert (RASS −1) og puster selv i SPONT med trykkstøtte 8 over PEEP 5, O2 30 %. I morges var PaCO2 5,4 kPa. For en halvtime siden sviktet den aktive fukteren. Den ble byttet med et HME-filter, og et ekstra fleksibelt slangestykke ble satt inn mellom filteret og tuben.',
    profileId: 'normal', patient: { height: 158, sex: 'K', compliance: 36, resistance: 12, resistanceExp: 13, effort: { amplitude: 3.5, rate: 22, duration: 0.9 } },
    settings: { mode: 'SPONT', psupport: 8, peep: 5, fio2: 30, ets: 25, pramp: 50, trigger: { type: 'flow', value: 2 }, apneaTime: 20, pmax: 35 },
    gas: { shunt: 0.08, recruitability: 0.2, vco2: 165, deadspaceMl: 157, hbGL: 105 }, gasStart: { paco2: 6.2 }, vitalsBase: { hr: 98, sys: 134, dia: 72, temp: 37.4 },
    variants: [{
      id: 'hme', sounds: {}, vitals: { hr: 14, sys: 12 }, delay: [6, 12], effect: { effort: { amplitude: 2.4, rate: 30, duration: 0.6 } },
      cues: [{ at: 0, who: 'obs', text: 'Hun puster raskere og mer overfladisk.' }, { at: 30, who: 'monitor', text: 'PetCO2 stiger.' }, { at: 70, who: 'kollega', text: '«Hun ser sliten ut. Det gikk så fint i morges, før fukteren ble byttet.»' }],
      clues: {
        lytt: 'Lett knatring basalt, som i morges.',
        se: 'Hun puster raskt og overfladisk og bruker halsmuskulaturen. Hun er svett.',
        krets: 'Mellom tuben og Y-stykket sitter nå HME-filter, et fleksibelt slangestykke på 15 cm og en vinkelkobling. Alt dette er dødrom, og det er mye i forhold til hennes lille Vt.',
        hold: 'Pplateau 11 cmH2O. Vt rundt 225 ml (4,4 ml/kg) ved frekvens 30.',
        blodgass: 'pH 7,28, PaCO2 6,9 kPa, HCO3 24, PaO2 12 kPa. I morges var PaCO2 5,4 kPa.',
      },
      fixes: { ...ventFix },
      // med nok støtte hviler hun: lavere frekvens og mindre innsats
      effortFn: ({ settings }) => (settings.mode !== 'SPONT' || settings.psupport >= 12 ? { amplitude: 2.5, rate: 16, duration: 0.9 } : null),
      harmful: { sedasjon: 'Skadelig: sedasjon demper pustedriven hos en pasient som allerede ikke klarer å kompensere for dødrommet. PaCO2 stiger mer.' },
      neutral: { ...NEUTRAL_BASE, lege: 'Legen: «Fjern det ekstra slangestykket og få på aktiv fukter så snart den er klar. Til da: mer trykkstøtte, så Vt blir 7–8 ml/kg.»', kondens: 'Slangene er tørre. HME-filteret er rent.', sug: 'Litt sekret. Det hjelper ikke på CO2.' },
      ventFix: true,
      target: 'Vt ca. 7–8 ml/kg IBW (ca. 360–410 ml), frekvens under 28 og PaCO2 ≤ 6,0 kPa: øk trykkstøtten til ca. 12–13. Fjern unødvendig utstyrsdødrom og sett på aktiv fukter så snart den er klar.',
      resolve: ({ m, gas }) => paco2(gas) <= 6.0 && m.vtPerKg >= 6.5 && m.vtPerKg <= 8.5 && m.fTotal <= 28,
      teach: [
        { kind: 'obs', when: ({ gas }) => gas.paco2 > 6.5, text: 'Obs: PaCO2 stiger. HME-filter og ekstra slangestykke øker dødrommet. Med Vt rundt 230 ml blir en stor del av hvert pust luft som går fram og tilbake i utstyret uten å nå alveolene.' },
        { when: ({ settings, m }) => settings.psupport >= 11 && m.vtPerKg >= 6.5, text: 'Riktig! Høyere trykkstøtte gir større Vt, så dødrommet blir en mindre del av hvert pust. Pelosi (1996) viste at HME øker minuttvolum, pustedrive og pustearbeid under trykkstøtte, og at 5–10 cmH2O mer trykkstøtte kan kompensere.' },
        { kind: 'obs', when: ({ m }) => m.vtPerKg > 9, text: 'Obs: For mye trykkstøtte gir stort Vt og overassistanse. Sikt mot 7–8 ml/kg.' },
        { kind: 'info', after: 'juster', when: () => true, text: 'Den beste løsningen er å fjerne dødrommet: ta bort unødvendige slangestykker og koblinger, og bruk aktiv fukter hos pasienter med lite Vt. Hos ARDS-pasienter senket fjerning av HME og 15 cm slangestykke PaCO2 med ca. 11 mmHg (1,5 kPa) uten andre endringer (Hinkson 2006).' },
      ],
      explanation: 'Alt utstyr mellom Y-stykket og tuben (HME-filter, fleksible slangestykker, vinkelkoblinger) er dødrom: luften der pustes inn og ut igjen uten å delta i gassutvekslingen. Hos en liten pasient med lite Vt utgjør det en stor andel av hvert pust. Hun prøvde å kompensere med høyere frekvens, men pusten ble rask og overfladisk, og PaCO2 steg. Pelosi et al. (1996) viste at HME under trykkstøtte øker minuttvolum, pustedrive og pustearbeid, og at 5–10 cmH2O mer trykkstøtte kan kompensere. Hinkson et al. (2006) fant at fjerning av HME og 15 cm slangestykke senket PaCO2 med ca. 11 mmHg ved lungebeskyttende ventilasjon. Øk trykkstøtten så Vt blir 7–8 ml/kg, fjern unødvendig utstyr, og bytt til aktiv fukter så snart det går. Sedasjon er feil: den demper pustedriven.',
    }],
  },
];
