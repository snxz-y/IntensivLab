# IntensivLab – plan (v1)

Status: godkjent 2026-10-09. Valg: Hamilton-konvensjoner i respiratoren, anion gap uten kalium.

## Hamilton-konvensjoner (brukes i respiratormodulen)
- Modusnavn: (S)CMV = volumkontroll, PCV+ = trykkontroll, SPONT = trykkstøtte.
- Pcontrol og Psupport settes OVER PEEP (ikke absolutt). Pinsp vist = PEEP + Pcontrol.
- Innstillinger: Vt, Frekvens, PEEP/CPAP, Oksygen (%), I:E eller TI (bytte), Pcontrol,
  Psupport, Pramp (trykkstigetid, ms), ETS (ekspiratorisk triggerfølsomhet, % av
  toppflow), Trigger (flow i L/min eller trykk i cmH2O), TIP (pause i % av syklus,
  (S)CMV), flowmønster (firkant / deselererende 50 %).
- Måleverdinavn: Ppeak, Pplat, Pmean, PEEP/CPAP, AutoPEEP, VTI, VTE, ExpMinVol,
  fTotal, Cstat, Rinsp, RCexp, Vt/kg IBW, I:E, TI, TE.
- IBW (ideal body weight) fra høyde og kjønn, vist som Vt/kg IBW.
- Manøvrer: inspiratorisk hold og ekspiratorisk hold (som i Hamiltons «Verktøy»).
Alt over er mine gjengivelser av Hamiltons terminologi; tall (standardverdier,
områder) merkes UVERIFISERT i KILDER.md der jeg ikke kan belegge dem.

## Rammer (fra bestilling)
- Statisk app, vanilla JS (ES-moduler), HTML, CSS. Ingen byggesteg, ingen backend. GitHub Pages.
- iPad (touch) + PC. Mørkt tema. Norsk bokmål.
- Enheter: kPa (blodgass), mmol/L, cmH2O.
- Fremdrift i localStorage via lagringsmodul med try/catch.
- Merking: «Læringsverktøy, ikke til klinisk bruk».

## Filstruktur

```
IntensivLab/
├── index.html                      Skall: header, nav, modulcontainer, footer
├── package.json                    Kun {"type":"module","scripts":{"test":"node --test tests/"}}
├── README.md                       Kjøre lokalt, deploye, legge til modul
├── KILDER.md                       Alle formler/referanseområder m/ kilde eller UVERIFISERT
├── docs/PLAN.md                    Denne planen
├── styles/
│   ├── base.css                    Tokens (farger, avstander), mørkt tema, typografi
│   └── components.css              Kort, knapper, slidere, faner, varsler, stepper
├── app/
│   ├── main.js                     Starter skallet, hash-ruter (#/respirator), monterer modul
│   ├── registry.js                 Modulregister: én linje per modul
│   └── shell.js                    Nav, modulvisning, advarselsbanner
├── core/
│   ├── units.js                    kPa<->mmHg, ml<->L, L/min<->L/s, g/L<->g/dL
│   ├── storage.js                  get/set/remove med try/catch, navnerom "intensivlab:"
│   ├── physiology/
│   │   ├── respiratory.js          Bevegelsesligning, tidskonstant, PBW, drivtrykk, Pmean, auto-PEEP
│   │   ├── acidbase.js             Henderson-Hasselbalch, BE, anion gap (albuminkorr.), delta ratio,
│   │   │                           forventet kompensasjon, P/F-ratio, klassifisering
│   │   └── references.js           Referanseområder (kPa, mmol/L) med kildekommentar
│   ├── sim/
│   │   ├── lungModel.js            Enkompartment: tilstand (V, flow, Palv), steg(dt), pasientinnsats
│   │   ├── ventilator.js           Modi VK/TK/TS, trigging, syklus, hold-manøvrer, måleverdier
│   │   └── patientEffort.js        Pmus-profil (sinus/halvsinus) m/ egenfrekvens
│   ├── charts/
│   │   ├── canvas.js               DPR-skalering, akser, felles tegnehjelp
│   │   ├── scope.js                Rullende sanntidskurver (trykk/flow/volum)
│   │   └── loop.js                 Trykk-volum- og flow-volum-sløyfer
│   └── ui/
│       ├── dom.js                  h()/el-hjelper, hendelser
│       ├── controls.js             Slider+tallfelt (touchvennlig), bryter, velger
│       ├── panel.js                Kort/panel, verdi-fliser
│       ├── stepper.js              Trinnvis veiviser (brukes av blodgass og oppgaver)
│       └── toast.js                Korte meldinger
├── modules/
│   ├── respirator/
│   │   ├── index.js                export {id, name, description, mount}
│   │   ├── ui.js                   Layout: kurver, sløyfer, innstillinger, måleverdier, manøvrer
│   │   ├── profiles.js             Pasientprofiler: normal, ARDS, obstruktiv, restriktiv
│   │   └── tasks.js                Oppgaver med forutsi-først-tilbakemelding
│   └── blodgass/
│       ├── index.js                export {id, name, description, mount}
│       ├── generator.js            Kasusgenerator (forstyrrelse -> konsistente verdier)
│       ├── vignettes.js            Vignetter og årsakspool per forstyrrelse
│       ├── interpret.js            Fasit-tolkning per trinn (ren logikk, gjenbruker core/acidbase)
│       ├── stats.js                Statistikk per trinn/forstyrrelse, adaptiv utvelgelse
│       └── ui.js                   Trinnvis UI
└── tests/
    ├── units.test.js
    ├── respiratory.test.js         Inkl. kontroll: C=50, R=10, Vt=500, flow 60 L/min, PEEP 5 -> Pplat 15, Ppeak 25
    ├── lungModel.test.js           Simulering mot analytisk løsning, auto-PEEP ved kort Te
    ├── ventilator.test.js          Modi, trigging, hold-manøvrer, måleverdier
    ├── acidbase.test.js            HH, AG, delta ratio, kompensasjon, P/F
    ├── generator.test.js           Intern konsistens for mange genererte kasus (alle nivåer)
    └── storage.test.js             try/catch-oppførsel uten localStorage
```

Regel: alt under `core/physiology`, `core/sim`, `modules/*/generator.js`, `interpret.js`,
`stats.js` er rene funksjoner uten DOM, og testes med `node --test`.

## Skallet
- Modulregister (`app/registry.js`): `export const modules = [respirator, blodgass]`.
- Modulkontrakt: `{ id, name, description, mount(container, ctx) -> unmount }`.
  `ctx` gir `storage`, `units`, `bus` (enkel hendelsesbuss) – bussen er det senere
  gassutvekslingskobling går via, men brukes ikke i v1.
- Hash-ruting (`#/respirator`, `#/blodgass`), forside med modulkort.
- Banner «Læringsverktøy, ikke til klinisk bruk» i header og footer, alltid synlig.
- Kun relative stier (`./`) så appen virker under `/IntensivLab/` på GitHub Pages.

## Modul 1: Respiratorsimulator
Fysikk (enkompartment, bevegelsesligningen):
  Paw + Pmus = V/C + R·flow + PEEP_tot
  → Paw = V/C + R·flow + PEEP − Pmus, der Pmus ≥ 0 er pasientens inspiratoriske innsats.
  (Merk: i bestillingen står «+ Pmus»; pasientinnsats senker trykket respiratoren må
  levere, så jeg bruker «− Pmus». Si fra hvis du vil ha annen fortegnskonvensjon.)
- Tidssteg 5 ms (200 Hz), drevet av requestAnimationFrame med akkumulert tid; kurver
  tegnes decimert. Kan settes på pause.
- Ekspirasjon passiv: flow = −(Palv − PEEP)/R, Palv = V/C + PEEP. Auto-PEEP oppstår
  naturlig når Te < ~3–4 tidskonstanter.
- Modi: volumkontroll (konstant flow, valgfri pause), trykkontroll (Pinsp over PEEP,
  flow bestemmes av modellen), trykkstøtte (flow-/trykktrigger fra Pmus, syklus ved
  25 % av toppflow, backup-frekvens).
- Innstillinger: Vt / Pinsp, frekvens, PEEP, Ti eller I:E (bytte), FiO2 (lagres, ingen
  effekt i v1), triggerfølsomhet, flow (VK), pause (VK).
- Pasient: compliance, resistance, innsats (Pmus-amplitude og egenfrekvens),
  høyde/kjønn → predikert kroppsvekt (ARDSNet-formel), Vt vises også i ml/kg PBW.
- Visning: tre rullende kurver (Paw, flow, volum), PV- og FV-sløyfe, måleverdifliser:
  Ppeak, Pplat, drivtrykk, Pmean, MV, tidskonstant, auto-PEEP (målt via eksp. hold).
- Manøvrer: inspiratorisk hold (gir Pplat) og ekspiratorisk hold (gir total PEEP).
- Profiler: normal, ARDS, obstruktiv (KOLS/astma), restriktiv. Verdier merkes med
  kilde eller UVERIFISERT i KILDER.md.
- Oppgaver (tasks.js): «lungebeskyttende på denne pasienten», «finn årsak til høyt
  topptrykk», «fjern auto-PEEP». Flyt: oppgave → før du endrer: «Hva tror du skjer med
  X hvis du gjør Y?» (velg) → endre → simulatoren sjekker kriterier (f.eks. Vt 6 ml/kg
  PBW ±, Pplat ≤ 30, drivtrykk ≤ 15, auto-PEEP < 1) → tilbakemelding med hvorfor.
- Forberedt for gassutveksling: `ventilator.getState()` eksponerer MV, Vt, f, PEEP,
  FiO2; bussen kan sende «ventilasjon:endret». Ingen gassutveksling bygges i v1.

## Modul 2: Blodgasstrener
Generator bygger fremover:
1. Velg nivå og forstyrrelse(r): metabolsk acidose (høy AG / normal AG), metabolsk
   alkalose, respiratorisk acidose (akutt/kronisk), respiratorisk alkalose (akutt/
   kronisk); kompensert; blandet (f.eks. høy-AG met. acidose + met. alkalose,
   met. acidose + resp. acidose, resp. alkalose + met. acidose ved salisylat).
2. Sett primærverdi (HCO3 eller PaCO2) innenfor forstyrrelsens område.
3. Beregn kompensasjon etter regel (Winter m.fl., i mmHg internt, vises i kPa) med
   tilfeldig avvik innenfor forventet bånd; «ukompensert» = utenfor/ingen kompensasjon.
4. pH fra Henderson-Hasselbalch: pH = 6.1 + log10(HCO3 / (0.23 · PaCO2[kPa])).
5. Elektrolytter: velg Na, albumin; Cl beregnes så AG stemmer med forstyrrelsen
   (albuminkorrigert); K og glukose fra vignett (DKA → høy glukose, osv.); laktat høyt
   ved laktacidose.
6. Oksygenering: PaO2 og FiO2 settes fra vignett (normal, hypoksemi, ARDS-grad).
7. BE fra Van Slyke-ligning (variant merkes i KILDER.md).
Hvert kasus får vignett (alder, kontekst, 2–3 setninger) og fasit per trinn.

Trinnvis tolkning (stepper): 1) acidemi/alkalemi 2) primær forstyrrelse 3) forventet
kompensasjon (du regner ut, toleranse ±0.5 kPa / ±2 mmol/L, så vurdering: adekvat/
ikke) 4) anion gap, albuminkorrigert (tall + vurdering) 5) delta ratio ved høy AG
(ellers «ikke aktuelt») 6) P/F-ratio i kPa + gradering 7) sannsynlige årsaker (velg
flere). Feil → vis trinnet, riktig resonnement og hvordan tallene gir svaret.

Statistikk: treff/forsøk per trinn og per forstyrrelsestype i localStorage; neste kasus
vektes mot svakeste kombinasjon (med litt tilfeldighet).

## Avklaringer (jeg bruker standardvalget hvis du ikke sier noe)
1. Anion gap: uten K (bekreftet), referanse ca. 8–12 mmol/L.
2. Kompensasjonsregler: klassiske mmHg-baserte regler (Winter osv.) regnet om til kPa.
3. Svarform: trinn 1, 2, 7 er valg; trinn 3–6 er tall + vurdering.

## Faser
1. Skall + kjerne (units, storage, UI-komponenter, canvas-hjelp, registry, tom modul).
2. Respiratormodell (lungModel, ventilator, respiratory) + tester.
3. Respirator-UI (kurver, sløyfer, innstillinger, profiler, manøvrer, oppgaver).
4. Blodgassgenerator + acidbase + tester.
5. Blodgass-UI (stepper, tilbakemelding, statistikk, adaptiv utvelgelse).
Etter hver fase: commit, kjør tester, vis deg resultatet og stopp.
README og KILDER.md oppdateres løpende, ferdigstilles i fase 5.
