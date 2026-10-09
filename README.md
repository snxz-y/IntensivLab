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

Skjermen er lagt opp som en Hamilton C6: modusknapp øverst til venstre,
hovedmonitoreringsparametre (MMP) i kolonnen til venstre, kurver og sløyfer i midten,
vinduer (Monitorering, Kontroller, Pasient, Verktøy, Oppgaver) via knappene til høyre,
og innstillingene som knapper nederst. Trykk på en innstilling for å endre den.

- Modi: (S)CMV (volumkontroll), PCV+ (trykkontroll), SPONT (trykkstøtte med backup).
- Verktøy: inspiratorisk og ekspiratorisk hold (hold inne knappen), hastighet, nullstilling.
- Oppgaver: før hver endring må du forutsi hva som skjer med en måleverdi. Fasit
  hentes ved å simulere endringen til steady state i en kopi av respiratoren.
- Situasjoner: «falske pasienter» der noe skjer underveis (snuing med desaturasjon,
  biting på tuben, sekret, frakobling, pneumothorax, bronkospasme, asynkroni). Du
  undersøker (lytt, se, sjekk krets) og setter inn tiltak. Riktig tiltak løser
  situasjonen; feil tiltak logges og forklares.
- SpO2 og PetCO2 kommer fra en forenklet gassutvekslingsmodell (shuntligning,
  Severinghaus' dissosiasjonskurve, alveolær ventilasjonsligning). Shunt og
  rekrutterbarhet kan justeres under «Pasient».
- Fremdrift (løste oppgaver, forutsigelser, situasjoner) lagres lokalt i nettleseren.

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
