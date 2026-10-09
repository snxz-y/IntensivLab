# Kilder

Alle formler og referanseområder i IntensivLab skal kunne spores hit.
Oppføringer merket **UVERIFISERT** har jeg ikke kunnet belegge med en kilde
jeg er sikker på, og bør sjekkes mot pensum før de stoles på.

Status: alle fem faser ferdig. Oppføringer merket UVERIFISERT bør sjekkes mot pensum.

## Enheter (core/units.js)

| Hva | Verdi | Kilde |
|---|---|---|
| 1 kPa i mmHg | 7,50062 | SI: 1 mmHg = 133,322 Pa (BIPM, SI-brosjyren, tabell over enheter utenfor SI) |
| 1 cmH2O i Pa | 98,0665 | Definisjon (vannsøyle ved 4 °C, standard tyngde) |

## Respiratorsimulator

### Formler (core/physiology/respiratory.js, core/sim/)

| Nøkkel | Formel | Kilde |
|---|---|---|
| K1 | Bevegelsesligningen, enkompartment: Paw + Pmus = V/C + R·V̇ (+ PEEP når V regnes fra PEEP-nivå) | Tobin MJ (red.), *Principles and Practice of Mechanical Ventilation*, 3. utg., McGraw-Hill 2013, kapitlene om respirasjonsmekanikk |
| K2 | Tidskonstant τ = R·C; 63 / 86 / 95 % ekshalert etter 1 / 2 / 3 τ | Samme som K1 |
| K3 | Predikert kroppsvekt: menn 50 + 0,91·(høyde − 152,4); kvinner 45,5 + 0,91·(høyde − 152,4) | ARDS Network, *N Engl J Med* 2000;342:1301–8 |
| K5 | Drivtrykk ΔP = Pplat − PEEP (totalt) | Amato MBP et al., *N Engl J Med* 2015;372:747–55 |
| K6 | Cstat = Vt/(Pplat − PEEPtot); Rinsp = (Ppeak − Pplat)/flow ved konstant flow | Samme som K1 |
| – | Auto-PEEP = alveolært trykk ved ekspirasjonsslutt − innstilt PEEP, målt ved ekspiratorisk hold | Samme som K1 |
| – | RCexp beregnes i simulatoren som −1/stigningstall i flow–volum-kurven under passiv ekspirasjon (for enkompartment: flow = −(V − V∞)/τ) | Følger av K1/K2 |
| – | Lungebeskyttende mål brukt i oppgaver (fase 3): Vt 6 ml/kg PBW, Pplat ≤ 30 cmH2O | ARDS Network, *N Engl J Med* 2000;342:1301–8 |
| – | Drivtrykk ≤ 15 cmH2O som mål i oppgaver (fase 3) | Amato 2015 (assosiasjon, ikke randomisert mål) |

### Modellvalg (ikke kliniske fakta)

- Pasientinnsats Pmus modelleres som halv sinus over nevral inspirasjonstid (core/sim/patientEffort.js). Vanlig forenkling i simulatorer; ingen klinisk kilde.
- Trykkstyrt steg integreres eksakt (eksponentielt) per tidssteg på 5 ms.
- SPONT-trigging beregnes fra hvor mye pasienten «trekker» under PEEP; flowtrigger sammenlikner dette delt på R med innstilt L/min.
- (S)CMV+ (APVcmv) er modellert som trykkontroll der ΔPinsp justeres ±3 cmH2O per pust (maks) mot innstilt Vt, mellom 5 cmH2O og Plimit − PEEP. Hamiltons faktiske regulator er ikke offentlig beskrevet; at APV er trykkregulert med volummål og begrenses av Plimit = Pmax − 10 er bekreftet i håndboken. Den gamle flowstyrte (S)CMV beholdes for undervisning og tester.

## Gassutveksling i respiratorsimulatoren (core/physiology/gasExchange.js, core/sim/gasModel.js)

Forenklet modell for SpO2 og PaCO2, brukt til situasjonene. Ikke ment som fysiologisk presis.

| Nøkkel | Formel | Kilde |
|---|---|---|
| G1 | Alveolær ventilasjonsligning: PaCO2[mmHg] = 0,863 · VCO2[ml/min] / VA[L/min]; VA = (Vt − Vd) · f | West JB. *Respiratory Physiology: The Essentials* |
| G2 | O2-dissosiasjonskurve: SO2 = 1 / (23400/(PO2³ + 150·PO2) + 1), PO2 i mmHg | Severinghaus JW. *J Appl Physiol* 1979;46:599–602 |
| G3 | Shuntligning Qs/Qt = (CcO2 − CaO2)/(CcO2 − CvO2); O2-innhold = 1,34 · Hb · SO2 + 0,003 · PO2[mmHg] | Lumb AB. *Nunn's Applied Respiratory Physiology*, 8. utg.; West JB |
| G4 | Alveolær gassligning (B9) | West JB |

Modellvalg (UVERIFISERT): dødrom 2,2 ml/kg IBW; a–v O2-differanse 5 ml/dL; Hb 120 g/L; VCO2 200 ml/min;
PEEP reduserer shunt lineært med pasientens «rekrutterbarhet» opp til PEEP 15; tidskonstanter PaCO2 180 s,
alveolærgass 20 s (90 s ved apné), SpO2 30 s; PetCO2 = PaCO2 − 0,5 kPa. Profilverdier for shunt
(normal 5 %, ARDS 30 %, obstruktiv 10 %, restriktiv 15 %) er valgt for undervisning.

## Caser (modules/respirator/scenarios.js)

Casene (snuing med derekruttering eller tubemigrasjon, biting, sekret, frakobling, trykkpneumothorax,
bronkospasme, asynkroni, cuff-lekkasje, tubeplugg, lungeemboli, PEEP-hypotensjon, opioidapné, smerte)
er konstruert. Hendelsenes effektstørrelser (f.eks. resistance × 6 ved biting, compliance × 0,4 ved trykkpneumothorax,
shunt + 0,22 ved derekruttering) er pedagogiske valg, UVERIFISERT. De kliniske funnene i ledetrådene
(ensidig respirasjonslyd ved tube i hovedbronkus, hypersonor perkusjon og halsvenestuvning ved
trykkpneumothorax, rhonchi ved sekret) er standard klinisk undersøkelseslære.

## Lyd (core/audio/ventSounds.js)

Alarmmønstrene (høy prioritet: 5 pulser gjentatt; middels: 3 pulser periodisk) følger beskrivelsen i HAMILTON-C6-håndboken kap. 9, men tonehøyde og tempo er valgt (UVERIFISERT som gjengivelse av den faktiske lyden).
Pustelyden er lagdelt, filtrert støy styrt av flow (ren syntese); pasientlydene (ekspiratoriske pipelyder,
sekretrasling, hoste) er også syntetiske og bare ment som gjenkjennelige signaler, ikke som gjengivelse av auskultasjonsfunn. Pulstonen følger pulsoksymeterpraksis der
tonehøyden faller med metningen; tallene (880 Hz ved 100 %, 520 Hz ved 80 %) er valgt, ikke kildebelagt.

## Blodgasstrener

### Formler (core/physiology/acidbase.js)

| Nøkkel | Formel | Kilde |
|---|---|---|
| B1 | Henderson–Hasselbalch: pH = 6,1 + log10(HCO3 / (0,0307 · PaCO2[mmHg])); 0,0307 mmol/L/mmHg = 0,230 mmol/L/kPa ved 37 °C | Boron WF, Boulpaep EL. *Medical Physiology*, 3. utg., Elsevier 2017 |
| B2 | Metabolsk acidose, forventet PaCO2 (mmHg) = 1,5 · HCO3 + 8 ± 2 (Winters formel) | Albert MS, Dell RB, Winters RW. *Ann Intern Med* 1967;66:312–22 |
| B4 | Akutt resp. acidose: HCO3 +1 per 10 mmHg PaCO2; kronisk +3,5 per 10. Akutt resp. alkalose: HCO3 −2 per 10 mmHg; kronisk −4 per 10 | Berend K, de Vries APJ, Gans ROB. *N Engl J Med* 2014;371:1434–45 |
| B5 | Anion gap = Na − (Cl + HCO3), uten K. Albuminkorrigert: AG + 2,5 · (4,0 − albumin[g/dL]) = AG + 0,25 · (40 − albumin[g/L]) | Figge J, Jabor A, Kazda A, Fencl V. *Crit Care Med* 1998;26:1807–10 |
| B6 | Delta ratio = (AG − 12)/(24 − HCO3); < 0,4 / 0,4–0,8 / 0,8–2 / > 2 | Rastegar A. *J Am Soc Nephrol* 2007;18:2429–31 |
| B7 | Standard base excess (Van Slyke): SBE = 0,93 · [(HCO3 − 24,4) + 14,8 · (pH − 7,4)] | Siggaard-Andersen O. *Scand J Clin Lab Invest* 1977;37 Suppl 146:15–20 |
| B8 | P/F-ratio = PaO2/FiO2. Berlin: ≤ 300 / 200 / 100 mmHg = ≤ 40 / 26,7 / 13,3 kPa (mild/moderat/alvorlig) ved PEEP ≥ 5 | ARDS Definition Task Force. *JAMA* 2012;307:2526–33 |
| B9 | Alveolær gassligning: PAO2 = FiO2 · (101,3 − 6,3) − PaCO2/0,8 (kPa) | West JB. *Respiratory Physiology: The Essentials* |
| B10 | Hypoksemisk respirasjonssvikt: PaO2 < 8 kPa (60 mmHg) | Roussos C, Koutsoukou A. *Eur Respir J* 2003;22 Suppl 47:3s–14s |

### Tolkningsregler (modules/blodgass/interpret.js)

- Acidemi pH < 7,35, alkalemi pH > 7,45 (B1-lærebøker).
- Ved normal pH peker siden av 7,40 mot den primære forstyrrelsen (vanlig lærebokheuristikk, f.eks. Berend 2014). Der PaCO2 og HCO3 avviker i samme syre–base-retning, godtas både den respiratoriske og den metabolske lesningen, og kasusets sykehistorie avgjør hva som regnes som «foretrukket».
- Bånd for respiratorisk kompensasjon: ±3 mmol/L rundt akutt og kronisk forventning (eget valg, fordi regelvariantene 3,5 vs 4 per 10 mmHg gir ±1–2 mmol/L spredning). Der akutt og kronisk forventning overlapper, godtas begge svar.
- Bånd for metabolsk kompensasjon: ±2 mmHg (B2).

### Generatorens modellvalg (ikke kliniske fakta)

- HCO3 beregnes fra avrundet pH og PaCO2 slik blodgassanalysatorer gjør; derfor er verdiene innbyrdes konsistente per konstruksjon.
- Cl beregnes fra Na, HCO3 og et mål for albuminkorrigert AG (Figge invertert).
- PaO2 settes fra et P/F-mål per lungestatus og begrenses av alveolær gassligning (PaO2 < PAO2).
- Laktat, glukose, K og albumin i vignettene er typiske verdier for tilstanden, ikke kildebelagte.

## UVERIFISERT (sjekk mot pensum)

### Hamilton-standarder og terminologi (core/sim/ventilator.js)

| Hva | Verdi brukt | Merknad |
|---|---|---|
| K4: IBW-formel | menn 0,9079·høyde − 88,022; kvinner 0,9049·høyde − 92,006 | Brukerhåndboken bekrefter at IBW regnes fra høyde og kjønn, men formelen fant jeg ikke i teksten. Avviker < 1,5 kg fra ARDSNet (K3). |
| Standardinnstillinger voksen | modus (S)CMV+, f 15, PEEP 5, O2 40 %, I:E 1:2, Pcontrol 15, Psupport 10, Pramp 50 ms, flowtrigger 2 L/min, apnétid 20 s, backup f 12 / Pcontrol 15, Pmax 40 | Ment å ligne Hamiltons voksenstandard; ikke bekreftet i håndboken. Bekreftet: Vt/IBW 8 ml/kg, ETS 25 %, TI max 1,5 s, trykktrigger −2 cmH2O (se under). |
| Maks holdvarighet | 10 s | Hamilton avslutter insp./eksp. hold automatisk; usikker på grensen. |
| Deselererende flow | lineært til 50 % av toppflow | Hamilton tilbyr flere mønstre; 50 %-varianten er valgt. |
| Refraktærtid etter ekspirasjonsstart før ny trigging | 0,15 s | Eget valg for å unngå autotrigging i modellen. |
| Vent Status-soner (avvenningssone) | O2 21–40 %, PEEP ≤ 8, ΔPinsp ≤ 10, MinVol 4–10 l/min, spontanandel ≥ 60 %, RSB ≤ 105 | Panelet finnes på C6 (håndboken kap. 8), men sonegrensene her er pedagogiske valg; RSB ≤ 105 fra Yang & Tobin 1991. |
| Dynamic Lung | lungestørrelse følger volum, farge følger compliance, bronkiebredde følger resistance | Panelet finnes på C6; tegningen er egen forenkling. Der C6 viser Pcuff og PVI, viser simulatoren Pplateau og AutoPEEP. |
| Skjermens utseende og vinduer | plassering av felter, farger (Paw gul, Flow magenta, blå paneler), ringknapper, lyse vinduer med faner, Modus-gruppene, Avbryt/Bekreft ved modusbytte, Alarmer med ringer og søyler, Standby-vinduet | Lagt opp etter skjermbilde av Hamiltons C6-simuleringsprogramvare og stillbilder fra video av en HAMILTON-C6 (SW 1.1.4) på messe; detaljer som ikke var synlige (Monitorering, Hendelser, System, Verktøy) er egne løsninger. Ingen Hamilton-grafikk eller -lyd er kopiert. |
| Alarmgrenser fTotal | høy 40, lav 0 (av) | Egne standardverdier. |
| Auto-alarmgrenser | MinVol og Vt ±50 %, fTotal + 15, Pmax = Ppeak + 15 | C6 har en Auto-knapp; reglene her er egne valg. |

### Bekreftet mot HAMILTON-C6 Operator's Manual (SW 1.2.x, Hamilton Medical, hamilton-medical.com)

| Hva | Hvor i håndboken |
|---|---|
| Hovedskjermens elementer: modus øverst til venstre, fargekodet meldingslinje, MMP-er til venstre (Ppeak alltid med), vindusknapper Alarms/Controls/Monitoring/Graphics/Tools/Events/System, hovedkontroller for aktiv modus, Audio pause-indikator med nedtelling, hurtigknapper | Kap. 2.2.2, figur 2-6 |
| MMP viser verdi, navn, enhet og alarmgrenser; vises gul/rød med farget stolpe ved alarm; trykk på MMP åpner Alarms > Limits | Kap. 8.2.1 |
| Standard SMP-er: Vt/IBW, Pplateau, RCexp, TI, ΔP, Pmean, Cstat, fSpont | Kap. 8.2.2 |
| Pause (TIP) settes i % av total syklustid | Kap. 7.2 |
| Vt/IBW standard 8 ml/kg (5–12); Vt, Rate, TI settes fra IBW | Kap. 14.6 og 16.8 |
| TI max standard 1,5 s (voksen); ETS standard 25 %; trykktrigger standard −2 cmH2O | Kap. 7 og 16.5 |
| Plimit = høy trykkalarmgrense − 10 cmH2O; ved Pmax åpnes ekspirasjonsventilen (høy prioritet); Pressure limitation er middels prioritet | Kap. 5.3, 9.4, 16 |
| Alarmprioritet: høy = rød meldingslinje + 5 pip gjentatt; middels = gul + 3 pip periodisk; lav = gul, to sekvenser | Kap. 9, tabell over alarmtyper |
| Audio pause demper i 2 minutter | Kap. 9.1 |
| ExpMinVol lav/høy og høyt trykk er høy prioritet; Vt lav/høy er middels | Kap. 9 / 16 |
| Standard tidsskala for voksne kurver er 22 s (11/22/33/66 valgbart) | Kap. 8.3.2 |

### Pasientprofiler (modules/respirator/profiles.js)

| Profil | C (ml/cmH2O) | Rinsp / Rexp (cmH2O/(L/s)) | Egenpust | Merknad |
|---|---|---|---|---|
| Normal, intubert | 50 | 10 / 10 | ingen | Typiske lærebokverdier for intubert voksen; ikke belagt med enkeltkilde |
| ARDS (moderat) | 25 | 12 / 12 | ingen | Lav compliance er veletablert; tallet er valgt |
| Obstruktiv (KOLS/astma) | 70 | 20 / 30 | 6 cmH2O @ 22/min | Høy, særlig ekspiratorisk, resistance; τexp 2,1 s |
| Restriktiv | 20 | 8 / 8 | ingen | Lav compliance, normal resistance |

### Blodgass (core/physiology/acidbase.js, references.js, modules/blodgass/)

| Hva | Verdi brukt | Merknad |
|---|---|---|
| B3: Metabolsk alkalose, forventet PaCO2 | 0,7 · HCO3 + 21 ± 2 mmHg | Flere varianter i litteraturen (0,7·HCO3 + 20 ± 5; 0,9·HCO3 + 15). Kilde for akkurat denne er usikker. |
| B7: Van Slyke-konstanter | 24,4 og 14,8 | Analysatorer (CLSI C46) bruker 24,8 og 1,43·Hb + 7,7 med Hb 5 g/dL for ECF; forskjellen er < 0,5 mmol/L. |
| Referanseområder | PaO2 10–13,3 kPa; laktat 0,5–2,0; Na 137–145; K 3,5–5,0; Cl 98–108; albumin 36–48 g/L; glukose 4,0–7,8 | Varierer mellom laboratorier. Sjekk mot Nasjonal brukerhåndbok i medisinsk biokjemi. |
| Anion gap normalområde | 8–12 mmol/L (uten K) | Laboratorieavhengig; moderne ISE-analysatorer gir ofte lavere. |
| Vignettverdier | laktat, glukose, K, albumin per scenario | Typiske verdier, ikke kildebelagt per tall. |
