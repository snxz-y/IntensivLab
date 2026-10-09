# Kilder

Alle formler og referanseområder i IntensivLab skal kunne spores hit.
Oppføringer merket **UVERIFISERT** har jeg ikke kunnet belegge med en kilde
jeg er sikker på, og bør sjekkes mot pensum før de stoles på.

Status: fase 2 (respiratormodell). Blodgass fylles ut i fase 4.

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

## Blodgasstrener

Fylles ut i fase 4.

## UVERIFISERT (sjekk mot pensum)

### Hamilton-standarder og terminologi (core/sim/ventilator.js)

| Hva | Verdi brukt | Merknad |
|---|---|---|
| K4: IBW-formel | menn 0,9079·høyde − 88,022; kvinner 0,9049·høyde − 92,006 | Jeg mener dette står i Hamilton-C6/G5-brukerhåndbok (avsnitt «IBW»). Avviker < 1,5 kg fra ARDSNet (K3). |
| Standardinnstillinger voksen | Vt 500, f 15, PEEP 5, O2 40 %, I:E 1:2, Pcontrol 15, Psupport 10, Pramp 50 ms, ETS 25 %, flowtrigger 2 L/min, TIP 0 %, TI max 2,0 s, apnétid 20 s, backup f 12 / Pcontrol 15 | Ment å ligne Hamiltons voksenstandard. |
| TIP (pause) | % av TI | Usikker på om Hamilton regner % av TI eller av syklustid. |
| Maks holdvarighet | 10 s | Hamilton avslutter insp./eksp. hold automatisk; usikker på grensen. |
| Deselererende flow | lineært til 50 % av toppflow | Hamilton tilbyr flere mønstre; 50 %-varianten er valgt. |
| Refraktærtid etter ekspirasjonsstart før ny trigging | 0,15 s | Eget valg for å unngå autotrigging i modellen. |

### Pasientprofiler (modules/respirator/profiles.js)

| Profil | C (ml/cmH2O) | Rinsp / Rexp (cmH2O/(L/s)) | Egenpust | Merknad |
|---|---|---|---|---|
| Normal, intubert | 50 | 10 / 10 | ingen | Typiske lærebokverdier for intubert voksen; ikke belagt med enkeltkilde |
| ARDS (moderat) | 25 | 12 / 12 | ingen | Lav compliance er veletablert; tallet er valgt |
| Obstruktiv (KOLS/astma) | 70 | 20 / 30 | 6 cmH2O @ 22/min | Høy, særlig ekspiratorisk, resistance; τexp 2,1 s |
| Restriktiv | 20 | 8 / 8 | ingen | Lav compliance, normal resistance |

### Enheter som allerede er belagt

Se tabellen under «Enheter».
