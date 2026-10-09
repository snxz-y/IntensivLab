import { h } from './dom.js';
import { fmt } from '../units.js';

/** Panel/kort med valgfri tittel og innhold. */
export function panel({ title, actions, compact = false, class: cls = '' }, ...children) {
  return h('section', { class: `panel ${compact ? 'compact' : ''} ${cls}`.trim() },
    title ? h('div', { class: 'panel-title' }, h('span', {}, title), actions || null) : null,
    ...children,
  );
}

/**
 * Verdiflis for måleverdier. Returnerer { el, set(value, status) }.
 * status: '', 'ok', 'warn', 'danger'
 */
export function valueTile({ label, unit = '', decimals = 0, value = null }) {
  const val = h('span', { class: 'tile-value' }, fmt(value, decimals));
  const el = h('div', { class: 'tile' },
    h('div', { class: 'tile-label' }, label),
    h('div', {}, val, unit ? h('span', { class: 'tile-unit' }, unit) : null),
  );
  return {
    el,
    set(v, status = '') {
      val.textContent = fmt(v, decimals);
      el.className = `tile ${status}`.trim();
    },
  };
}

/** Enkel tabell. rows: [[cell, cell, ...]], cols: [{label, num}] */
export function table(cols, rows) {
  return h('table', { class: 'table' },
    h('thead', {}, h('tr', {}, ...cols.map((c) => h('th', { class: c.num ? 'num' : '' }, c.label)))),
    h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((cell, i) => h('td', { class: cols[i]?.num ? 'num' : '' }, cell))))),
  );
}

export function badge(text, kind = '') {
  return h('span', { class: `badge ${kind}`.trim() }, text);
}
