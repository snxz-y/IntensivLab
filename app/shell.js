import { h, clear } from '../core/ui/dom.js';

export const DISCLAIMER = 'Læringsverktøy, ikke til klinisk bruk';

/** Bygger skallet (topplinje, advarsel, hovedområde, bunntekst). Returnerer { main, setActive }. */
export function createShell(root, modules) {
  const navLinks = modules.map((m) => h('a', { href: `#/${m.id}`, dataset: { id: m.id } }, m.name));
  const main = h('main', { class: 'main', id: 'main' });

  clear(root);
  root.append(
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/' }, 'IntensivLab'),
      h('nav', { class: 'nav', 'aria-label': 'Moduler' }, ...navLinks),
    ),
    h('div', { class: 'disclaimer', role: 'note' }, `⚠ ${DISCLAIMER}`),
    main,
    h('footer', { class: 'footer' },
      h('div', {}, h('strong', {}, DISCLAIMER), '. Verdier og formler er samlet i ', h('a', { href: './KILDER.md' }, 'KILDER.md'), '.'),
      h('div', {}, 'IntensivLab · åpen kildekode · fremdrift lagres kun lokalt i nettleseren.'),
    ),
  );

  return {
    main,
    setActive(id) {
      navLinks.forEach((a) => a.classList.toggle('active', a.dataset.id === id));
    },
  };
}

/** Forsiden: kort for hver modul. */
export function renderHome(container, modules) {
  clear(container);
  container.append(
    h('div', { class: 'stack' },
      h('div', {},
        h('h1', {}, 'Velkommen til IntensivLab'),
        h('p', { class: 'muted' }, 'Øv på respiratorinnstillinger og blodgasstolkning. Velg en modul.'),
      ),
      h('div', { class: 'grid grid-auto' },
        ...modules.map((m) => h('a', { class: 'module-card', href: `#/${m.id}` },
          h('h2', {}, m.name),
          h('p', {}, m.description),
          h('span', { class: 'cta' }, 'Åpne →'),
        )),
      ),
    ),
  );
}
