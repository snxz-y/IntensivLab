# IntensivLab

Nettbasert læringsplattform for intensivsykepleie, bygd som statisk app
(vanilla JS med ES-moduler, HTML og CSS). Ingen byggesteg, ingen backend.

> **Læringsverktøy, ikke til klinisk bruk.** Alle verdier, formler og
> referanseområder er samlet i [KILDER.md](KILDER.md) med kildehenvisning.
> Det som ikke er belagt med kilde, er merket **UVERIFISERT**.

## Moduler

| Modul | Status |
|---|---|
| Respiratorsimulator (`#/respirator`) | ferdig (fase 3) |
| Blodgasstrener (`#/blodgass`) | ferdig (fase 5) |

## Respiratorsimulatoren

Skjermen til venstre er bygget etter HAMILTON-C6 (sammenlignet mot skjermbilde fra Hamiltons
C6-simuleringsprogramvare og video av en ekte C6): modusfelt med pasientikon øverst til venstre,
svart meldingslinje (rød/gul ved alarm), MMP-kolonne til venstre med alarmgrensene oppe til venstre
og store verdier til høyre, kurver (Paw gul, Flow magenta) med tidsakse, og under dem de to
intelligente panelene Dynamic Lung og Vent Status på blå bunn. Høyrekolonnen har Modus øverst,
ringknapper for modusens hovedkontroller og knappene Kontroller og Alarmer. Nederst ligger
hurtigknappene (audio pause, manuell pust, O2-anrikning, lyd, standby), hjem og frys, vinduene
Monitorering, Grafikk, Verktøy, Hendelser og System, og dato/klokke.

Vinduene følger C6: lyse med faner til venstre, ringknapper som blir gule når de er valgt, og
−/+ eller glidebryter nederst i stedet for dreieknappen.

- **Modus**: gruppene Volumkontrollert (adaptiv), Trykkontrollert (bifasisk), Intelligent
  ventilasjon og Noninvasiv. Gjeldende modus er grønn, grå modi finnes på C6 men er ikke simulert.
  Velg modus, trykk Bekreft, sett kontrollene for den nye modusen, og trykk Bekreft igjen før den
  tas i bruk (Avbryt forkaster alt).
- **Kontroller**: fanene Grunn (I:E eller TI, Rate, P-ramp, Vt/Pcontrol/Psupport, PEEP/CPAP,
  trigger, Oksygen), Mer (apné-backup) og Pasient (kjønn og høyde gir IBW). Nederst står TI, TE
  og Vt/IBW. I gjeldende modus virker endringer fra neste pust.
- **Alarmvisning**: som på C6 blir verdien rød (høy prioritet) eller gul (middels) i MMP-flisen,
  grensen som er brutt farges, og flisen får en farget stolpe i høyre kant. Meldingslinjen viser
  alarmen med høyest prioritet. Lyd: høy prioritet er fem toner (3 + 2) hvert 2,4 s, middels er tre
  toner, begge med Hamiltons tre tonehøyder.
- **Alarmer**: en kolonne per alarm med øvre grense som ring, søyle med måleverdien og nedre
  grense som ring. «Auto» setter grensene rundt gjeldende måleverdier.
- **Monitorering**: som på C6 med fanene General, CO2, SpO2 og Pes, ✕ til venstre og verdiene i
  kolonner med stort tall og navn/enhet ved siden av. CO2-verdiene (VDaw, Vtalv, V'alv, V'CO2) er
  modellverdier; Pes og Pcuff vises som «---» fordi de ikke er simulert.
- **Hendelser**: logg som på C6 med tid, kategori (!!! høy alarm, !! middels, Control, Mode, Alarm,
  Hold) og tekst. Røde og gule rader for alarmer.
- **Verktøy**: fanene P/V Tool, Hold, Utilities og Configuration som på C6. Hold har knappene
  Inspirasjonshold og Ekspirasjonshold (hold inne). Utilities har manuell pust, O2-anrikning og
  simuleringshastighet. P/V Tool og Configuration er ikke simulert.
- **Grafikk**: oppsett 1–4 (tre kurver, kurver + sløyfer, kurver + paneler, Paw + store paneler),
  tidsskala og frys.
- **Standby**: gult Standby-felt og blått pasientoppsett (kjønn, høyde, IBW) med «Start ventilasjon».

Sidepanelet til høyre (under på smale skjermer) ligger utenfor respiratoren og forsvinner
ikke når du justerer den:

- **Pasientmonitor** øverst: SpO2, puls, blodtrykk, RF og temperatur.
- **Pasient**: profil (normal, ARDS, obstruktiv, restriktiv), mekanikk, egenpust,
  gassutveksling (shunt, rekrutterbarhet). Høyde og kjønn stilles på respiratoren.
- **Caser**: 13 falske pasienter, nummerert «Case 1» til «Case 13» så navnet ikke røper
  hva som skjer (det vises først i oppsummeringen). Du får pasientinformasjon,
  observasjoner, beskjeder fra kollega, monitor og respirator i en meldingsfeed, og valg på
  løpende bånd: først to runder undersøkelser (1 av 5, f.eks. lytt, se på tube, sjekk krets,
  blodgass, inspiratorisk hold), så tiltak (1 av 5) med noen sekunders pause mellom valgene
  så du rekker å observere. Alarmerer respiratoren, kommer første valg etter 2 s; avslører en
  undersøkelse årsaken, går du rett til tiltak etter 3 s. Etter tiltaket viser panelet hva som
  gjenstår (verdiene må være innenfor målet i 10 s). «Juster respiratoren» er alltid ett av tiltakene; velger du det
  der det er riktig, får du ingen flere alternativer og må gjøre justeringen selv på
  skjermen. Riktig tiltak løser casen når målingene har holdt seg normale i 15 s.
- **Oppgaver**: 24 oppgaver i seks kategorier (lungebeskyttende ventilasjon, feilsøking og
  alarmer, auto-PEEP og obstruksjon, modus og innstillinger, oksygenering og CO2, trigging,
  synkroni og avvenning). Før hver endring må du forutsi hva som skjer; fasit simuleres i en
  kopi av respiratoren. Løste oppgaver merkes ikke.

Respiratoren starter alltid i standardoppsett: (S)CMV+ (adaptiv trykkregulering mot
volummål, som Hamiltons APVcmv), Vt 8 ml/kg IBW, Rate 15, PEEP 5, Oksygen 40 %, I:E 1:2,
P-ramp 50 ms, flowtrigger 2 l/min. Plimit = Pmax − 10 begrenser levert trykk, og ved Pmax
åpnes ekspirasjonsventilen, slik C6 gjør. Lyd (respiratorens pustelyd som følger flowen,
alarmer i to prioriteter med Hamiltons tonemønster, pulstone, pasientlyder som pipelyder,
sekretrasling og hoste) syntetiseres med Web Audio og virker på iPad etter første trykk på «Lyd». Fremdrift lagres
lokalt i nettleseren.

## Blodgasstreneren

Hvert kasus genereres fra en underliggende forstyrrelse, så pH, PaCO2 og HCO3 alltid
henger sammen (Henderson–Hasselbalch). Tolkningen gjøres trinn for trinn, og neste
trinn vises først når du har svart:

1. acidemi/alkalemi, 2. primær forstyrrelse, 3. kompensasjon (ukompensert, delvis,
fullt, blandet), 4. anion gap (du regner), 5. P/F-ratio i kPa (du regner),
6. sannsynlige årsaker. Ett trinn vises om gangen, med piler (også piltaster) for å
bla tilbake. Forventet kompensasjon etter formel og delta ratio ligger som
«Fordypning» i tilbakemeldingen, ikke som krav.

Ved feil vises regnestykket og resonnementet for trinnet. Nivå kan velges (enkle,
kompenserte, blandede) eller settes til «Adaptiv», som velger nivå og forstyrrelse ut
fra statistikken din. Statistikk per trinn, forstyrrelse og nivå ligger under
«Statistikk», og neste kasus vektes mot det du er svakest i.

## Kjøre lokalt

ES-moduler krever at filene serveres over HTTP (ikke `file://`).

```bash
# alternativ 1 (Python 3 er installert på de fleste maskiner)
npm start            # = python3 -m http.server 8000
# alternativ 2
npx serve .
```

Åpne deretter <http://localhost:8000>.

## Tester

Fysiologi og generatorer er rene funksjoner uten DOM og testes med Nodes
innebygde testløper (Node 20 eller nyere):

```bash
npm test
```

## Deploye til GitHub Pages

1. Push til GitHub.
2. *Settings → Pages → Build and deployment*: Source «Deploy from a branch»,
   branch `master`, mappe `/ (root)`.
3. Appen er tilgjengelig på `https://<bruker>.github.io/IntensivLab/`.

Alle stier i koden er relative (`./`), så appen virker både i rot og i undermappe.
`.nojekyll` ligger i rot slik at GitHub Pages ikke prøver å bygge med Jekyll.

## Legge til en modul

1. Lag mappen `modules/<id>/` med `index.js` som eksporterer modulobjektet:

   ```js
   import { h } from '../../core/ui/dom.js';

   export default {
     id: 'min-modul',          // URL: #/min-modul
     name: 'Min modul',
     description: 'Én setning om hva modulen gjør.',
     mount(container, ctx) {   // ctx = { storage, bus, units }
       container.append(h('p', {}, 'Hei!'));
       return () => { /* rydd opp: stopp timere, fjern lyttere */ };
     },
   };
   ```

2. Legg til én linje i `app/registry.js`:

   ```js
   import minModul from '../modules/min-modul/index.js';
   export const modules = [respirator, blodgass, minModul];
   ```

3. Fysiologi og referanseverdier legges som rene funksjoner i `core/physiology/`
   med kildehenvisning i kommentar, og føres opp i `KILDER.md`. Skriv test i
   `tests/`.

## Struktur

```
index.html          Skall
app/                main.js (ruter), registry.js (modulregister), shell.js
core/               units, storage, bus, physiology/, sim/, charts/, ui/
modules/<id>/       Én mappe per modul
tests/              node --test
styles/             base.css (tokens, mørkt tema), components.css
docs/PLAN.md        Plan og designvalg
KILDER.md           Kilder for formler og referanseområder
```

## Lagring

Fremdrift lagres i `localStorage` under prefikset `intensivlab:` via
`core/storage.js`. Alle kall er pakket i try/catch, så appen virker også
uten lagring (du får et varsel).
