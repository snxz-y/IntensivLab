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

Skjermen til venstre er lagt opp etter HAMILTON-C6s hovedskjerm (brukerhåndbok kap. 2.2.2):
modus øverst til venstre, fargekodet meldingslinje med Audio pause, MMP-kolonne til venstre
med alarmgrenser, kurver og sløyfer i midten, vindusknappene Alarmer, Kontroller,
Monitorering, Grafikk, Verktøy, Hendelser og System til høyre, hurtigknapper (manuell pust,
O2-anrikning, frys, lyd) og hovedkontrollene for aktiv modus nederst. Trykk på en kontroll
eller en MMP for å endre den.

Sidepanelet til høyre (under på smale skjermer) ligger utenfor respiratoren og forsvinner
ikke når du justerer den:

- **Pasientmonitor** øverst: SpO2, puls, blodtrykk, RF og temperatur.
- **Pasient**: profil (normal, ARDS, obstruktiv, restriktiv), mekanikk, egenpust,
  gassutveksling (shunt, rekrutterbarhet), høyde og kjønn.
- **Situasjoner**: falske pasienter der noe skjer underveis. Du får observasjoner,
  beskjeder fra kollega, monitor og respirator i en meldingsfeed (og som varsler), undersøker
  (lytt, se, sjekk krets) og setter inn tiltak. Riktig tiltak løser situasjonen; feil tiltak
  logges og forklares.
- **Oppgaver**: før hver endring må du forutsi hva som skjer. Fasit simuleres i en kopi av
  respiratoren.

Respiratoren starter alltid i standardoppsett: (S)CMV, Vt 8 ml/kg IBW, Rate 15, PEEP 5,
Oksygen 40 %. Plimit = Pmax − 10 begrenser levert trykk, og ved Pmax åpnes
ekspirasjonsventilen, slik C6 gjør. Lyd (pustelyd, alarmer i to prioriteter, pulstone)
syntetiseres med Web Audio. Fremdrift lagres lokalt i nettleseren.

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
