import { mountRespirator } from './ui.js';

let cssLoaded = false;
function ensureCss() {
  if (cssLoaded) return;
  cssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./respirator.css', import.meta.url).href;
  document.head.append(link);
}

export default {
  id: 'respirator',
  name: 'Respiratorsimulator',
  description: 'Enkompartment lungemodell med (S)CMV, PCV+ og SPONT i Hamilton-stil. Kurver, sløyfer, måleverdier, hold-manøvrer og oppgaver.',
  mount(container, ctx) {
    ensureCss();
    return mountRespirator(container, ctx);
  },
};
