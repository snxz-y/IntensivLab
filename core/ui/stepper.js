import { h, clear } from './dom.js';

/**
 * Trinnvis veiviser: hvert trinn må besvares før neste vises.
 *
 * steps: [{ title, render(body, api) }]
 *   render tegner trinnets innhold i `body` og kaller api.done({ correct, summary })
 *   når trinnet er besvart. api.skip(summary) markerer trinnet som ikke aktuelt.
 * onComplete(results) kalles når alle trinn er ferdige.
 * paged: true viser ett trinn om gangen med pilnavigasjon (← → også på tastaturet);
 *   besvarte trinn kan blas tilbake til, men ikke endres.
 *
 * Returnerer { el, reset(), destroy(), results }.
 */
export function createStepper({ steps, onComplete, paged = false }) {
  const el = h('div', { class: `stepper ${paged ? 'paged' : ''}`.trim() });
  let results = [];
  let index = 0;   // aktivt (ubesvart) trinn
  let view = 0;    // trinnet som vises (paged)
  const views = [];
  let nav = null;
  let dots = [];
  let prevBtn, nextBtn, navLabel;

  function build() {
    clear(el);
    views.length = 0;
    results = [];
    index = 0;
    view = 0;
    if (paged) {
      prevBtn = h('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Forrige trinn', onClick: () => show(view - 1) }, '← Forrige');
      nextBtn = h('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Neste trinn', onClick: () => show(view + 1) }, 'Neste →');
      dots = steps.map((s, i) => h('button', { type: 'button', class: 'step-dot', title: s.title, 'aria-label': `Trinn ${i + 1}`, onClick: () => show(i) }));
      navLabel = h('span', { class: 'step-nav-label' });
      nav = h('div', { class: 'step-nav' }, prevBtn, h('div', { class: 'step-dots' }, ...dots), nextBtn);
      el.append(nav, navLabel);
    }
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

  function show(i) {
    if (!paged) return;
    if (i < 0 || i > Math.min(index, steps.length - 1)) return;
    view = i;
    views.forEach((v, j) => v.step.classList.toggle('visible', j === view));
    dots.forEach((d, j) => {
      d.classList.toggle('current', j === view);
      d.classList.toggle('done', j < index || (results[j] && j <= index));
      d.classList.toggle('locked', j > index);
    });
    prevBtn.disabled = view === 0;
    nextBtn.disabled = view >= index;
    navLabel.textContent = `Trinn ${view + 1} av ${steps.length}`;
  }

  function activate(i) {
    if (i >= steps.length) {
      index = steps.length;
      if (paged) show(steps.length - 1);
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
    if (paged) show(i);
    else v.step.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }

  function onKey(e) {
    if (!paged || !el.isConnected) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowLeft') { show(view - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { show(view + 1); e.preventDefault(); }
  }
  if (paged) document.addEventListener('keydown', onKey);

  build();
  return {
    el,
    reset: build,
    destroy() { document.removeEventListener('keydown', onKey); el.remove(); },
    get results() { return results; },
    get index() { return index; },
  };
}
