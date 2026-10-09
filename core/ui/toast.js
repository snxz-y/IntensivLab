import { h } from './dom.js';

let container = null;

/** Kort melding nederst på skjermen. kind: '', 'ok', 'warn', 'danger' */
export function toast(message, { kind = '', ms = 2800 } = {}) {
  if (!container) {
    container = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(container);
  }
  const el = h('div', { class: `toast ${kind}`.trim(), role: 'status' }, message);
  container.append(el);
  setTimeout(() => el.remove(), ms);
  return el;
}
