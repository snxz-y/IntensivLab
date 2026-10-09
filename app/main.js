import { modules } from './registry.js';
import { createShell, renderHome } from './shell.js';
import { storage } from '../core/storage.js';
import { createBus } from '../core/bus.js';
import * as units from '../core/units.js';
import { clear, h } from '../core/ui/dom.js';
import { toast } from '../core/ui/toast.js';

const root = document.getElementById('app');
const shell = createShell(root, modules);
const bus = createBus();
const ctx = { storage, bus, units };

let unmount = null;
let currentId = null;

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const id = hash.split('/')[0];
  if (id === currentId && id !== '') return;

  if (typeof unmount === 'function') {
    try { unmount(); } catch (err) { console.error('Feil ved avmontering:', err); }
  }
  unmount = null;
  currentId = id;
  clear(shell.main);
  shell.setActive(id);
  window.scrollTo(0, 0);

  if (!id) {
    renderHome(shell.main, modules);
    document.title = 'IntensivLab';
    return;
  }
  const mod = modules.find((m) => m.id === id);
  if (!mod) {
    shell.main.append(h('div', { class: 'placeholder' }, `Fant ingen modul med id «${id}». `, h('a', { href: '#/' }, 'Til forsiden')));
    document.title = 'IntensivLab';
    return;
  }
  document.title = `${mod.name} · IntensivLab`;
  try {
    unmount = mod.mount(shell.main, ctx) || null;
  } catch (err) {
    console.error(err);
    shell.main.append(h('div', { class: 'placeholder danger' }, `Modulen «${mod.name}» feilet: ${err.message}`));
  }
}

window.addEventListener('hashchange', route);
route();

if (!storage.available) {
  toast('Lagring er ikke tilgjengelig. Fremdrift blir ikke husket.', { kind: 'warn', ms: 5000 });
}
