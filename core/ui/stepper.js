import { h, clear } from './dom.js';

/**
 * Trinnvis veiviser: hvert trinn må besvares før neste vises.
 *
 * steps: [{ title, render(body, api) }]
 *   render tegner trinnets innhold i `body` og kaller api.done({ correct, summary })
 *   når trinnet er besvart. api.skip(summary) markerer trinnet som ikke aktuelt.
 * onComplete(results) kalles når alle trinn er ferdige.
 *
 * Returnerer { el, reset(), results }.
 */
export function createStepper({ steps, onComplete }) {
  const el = h('div', { class: 'stepper' });
  let results = [];
  let index = 0;
  const views = [];

  function build() {
    clear(el);
    views.length = 0;
    results = [];
    index = 0;
    steps.forEach((s, i) => {
      const num = h('span', { class: 'step-num' }, String(i + 1));
      const summary = h('span', { class: 'step-summary' });
      const body = h('div', { class: 'step-body' });
      const step = h('div', { class: 'step locked' }, h('div', { class: 'step-head' }, num, h('span', {}, s.title), summary), body);
      views.push({ step, body, summary });
      el.append(step);
    });
    activate(0);
  }

  function activate(i) {
    if (i >= steps.length) {
      onComplete?.(results);
      return;
    }
    index = i;
    const v = views[i];
    v.step.classList.remove('locked');
    v.step.classList.add('active');
    const api = {
      done({ correct, summary = '' }) {
        results[i] = { correct, summary, skipped: false };
        v.step.classList.remove('active');
        v.step.classList.add('done', correct ? 'correct' : 'wrong');
        v.summary.textContent = summary;
        activate(i + 1);
      },
      skip(summary = 'Ikke aktuelt') {
        results[i] = { correct: null, summary, skipped: true };
        v.step.classList.remove('active');
        v.step.classList.add('done');
        v.summary.textContent = summary;
        activate(i + 1);
      },
    };
    steps[i].render(v.body, api);
    v.step.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }

  build();
  return {
    el,
    reset: build,
    get results() { return results; },
    get index() { return index; },
  };
}
