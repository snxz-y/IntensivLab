# IntensivLab

Nettbasert læringsplattform for intensivsykepleie, bygd som statisk app
(vanilla JS med ES-moduler, HTML og CSS). Ingen byggesteg, ingen backend.

> **Læringsverktøy, ikke til klinisk bruk.** Alle verdier, formler og
> referanseområder er samlet i [KILDER.md](KILDER.md) med kildehenvisning.
> Det som ikke er belagt med kilde, er merket **UVERIFISERT**.

## Moduler

| Modul | Status |
|---|---|
| Respiratorsimulator (`#/respirator`) | modell og tester ferdig (fase 2), UI i fase 3 |
| Blodgasstrener (`#/blodgass`) | fase 4–5 |

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
