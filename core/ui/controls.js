import { h } from './dom.js';
import { clamp, round } from '../units.js';

/**
 * Slider med tilhørende tallfelt. Touchvennlig (stor tommel, 44 px høyde).
 * Returnerer { el, get(), set(value, silent), setDisabled(bool) }.
 */
export function slider({ label, unit = '', min, max, step = 1, value, decimals, onChange, onInput, id }) {
  const dec = decimals ?? (String(step).includes('.') ? String(step).split('.')[1].length : 0);
  const inputId = id || `ctl-${Math.random().toString(36).slice(2, 8)}`;
  let current = clamp(value, min, max);

  const range = h('input', { type: 'range', min, max, step, value: current, id: inputId, 'aria-label': label });
  const number = h('input', { type: 'number', min, max, step, value: current.toFixed(dec), inputmode: 'decimal', 'aria-label': `${label} (tall)` });
  const el = h('div', { class: 'control' },
    h('label', { class: 'control-label', for: inputId }, label),
    h('div', { class: 'control-value' }, number, unit ? h('span', { class: 'control-unit' }, unit) : null),
    range,
  );

  const api = {
    el,
    get: () => current,
    set(v, silent = false) {
      current = round(clamp(Number(v), min, max), dec);
      range.value = current;
      number.value = current.toFixed(dec);
      if (!silent) onChange?.(current);
    },
    setDisabled(disabled) {
      el.classList.toggle('disabled', disabled);
      range.disabled = disabled;
      number.disabled = disabled;
    },
    setRange(newMin, newMax) {
      min = newMin; max = newMax;
      range.min = min; range.max = max; number.min = min; number.max = max;
      api.set(current, true);
    },
  };

  range.addEventListener('input', () => {
    current = round(Number(range.value), dec);
    number.value = current.toFixed(dec);
    onInput?.(current);
  });
  range.addEventListener('change', () => onChange?.(current));
  number.addEventListener('change', () => api.set(number.value));
  number.addEventListener('keydown', (e) => { if (e.key === 'Enter') number.blur(); });

  return api;
}

/** Nedtrekksvelger. options: [{value, label}] */
export function select({ label, options, value, onChange, id }) {
  const inputId = id || `sel-${Math.random().toString(36).slice(2, 8)}`;
  const sel = h('select', { id: inputId },
    ...options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)),
  );
  sel.addEventListener('change', () => onChange?.(sel.value));
  const el = h('div', { class: 'select-control' }, h('label', { for: inputId }, label), sel);
  return { el, get: () => sel.value, set: (v) => { sel.value = v; } };
}

/** Segmentert velger (f.eks. modus). options: [{value, label}] */
export function segmented({ options, value, onChange, ariaLabel }) {
  let current = value;
  const buttons = options.map((o) =>
    h('button', { type: 'button', class: o.value === value ? 'active' : '', onClick: () => api.set(o.value) }, o.label),
  );
  const el = h('div', { class: 'segmented', role: 'group', 'aria-label': ariaLabel }, ...buttons);
  const api = {
    el,
    get: () => current,
    set(v, silent = false) {
      current = v;
      buttons.forEach((b, i) => b.classList.toggle('active', options[i].value === v));
      if (!silent) onChange?.(v);
    },
  };
  return api;
}

/** Avkrysning/bryter. */
export function toggle({ label, checked = false, onChange }) {
  const input = h('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange?.(input.checked));
  const el = h('label', { class: 'toggle' }, input, h('span', {}, label));
  return { el, get: () => input.checked, set: (v) => { input.checked = v; } };
}

/** Knapp. */
export function button(label, { onClick, variant = '', small = false, block = false, disabled = false, title } = {}) {
  return h('button', {
    type: 'button',
    class: ['btn', variant, small && 'small', block && 'block'].filter(Boolean).join(' '),
    onClick,
    disabled,
    title,
  }, label);
}
