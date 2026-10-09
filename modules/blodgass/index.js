import { mountBlodgass } from './ui.js';

let cssLoaded = false;
function ensureCss() {
  if (cssLoaded) return;
  cssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./blodgass.css', import.meta.url).href;
  document.head.append(link);
}

export default {
  id: 'blodgass',
  name: 'Blodgasstrener',
  description: 'Genererte kasus med trinnvis tolkning: syre–base, kompensasjon, anion gap, delta ratio, oksygenering og årsaker. Statistikk og adaptiv utvelgelse.',
  mount(container, ctx) {
    ensureCss();
    return mountBlodgass(container, ctx);
  },
};
