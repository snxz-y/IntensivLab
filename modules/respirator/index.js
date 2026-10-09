import { h } from '../../core/ui/dom.js';

export default {
  id: 'respirator',
  name: 'Respiratorsimulator',
  description: 'Enkompartment lungemodell med (S)CMV, PCV+ og SPONT. Kurver, sløyfer, måleverdier og oppgaver.',
  mount(container) {
    container.append(h('div', { class: 'placeholder' }, 'Respiratorsimulatoren bygges i fase 2–3.'));
    return () => {};
  },
};
