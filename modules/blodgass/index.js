import { h } from '../../core/ui/dom.js';

export default {
  id: 'blodgass',
  name: 'Blodgasstrener',
  description: 'Genererte kasus med trinnvis tolkning: syre–base, kompensasjon, anion gap, delta ratio, oksygenering og årsaker.',
  mount(container) {
    container.append(h('div', { class: 'placeholder' }, 'Blodgasstreneren bygges i fase 4–5.'));
    return () => {};
  },
};
