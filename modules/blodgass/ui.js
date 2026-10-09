/**
 * Blodgasstrener – brukergrensesnitt. Trinnvis tolkning der hvert trinn må besvares før neste
 * vises. Ved feil vises trinnet som sviktet, regnestykket og resonnementet.
 */
import { h, clear } from '../../core/ui/dom.js';
import { segmented, button } from '../../core/ui/controls.js';
import { panel } from '../../core/ui/panel.js';
import { createStepper } from '../../core/ui/stepper.js';
import { toast } from '../../core/ui/toast.js';
import { fmt, kPaToMmHg } from '../../core/units.js';
import { REF, flag } from '../../core/physiology/references.js';
import { generateCase } from './generator.js';
import { PRIMARY_LABELS, COMP_LABELS, SIMPLE_COMP_LABELS, DELTA_LABELS, PF_LABELS } from './interpret.js';
import { LEVELS, CAUSES, DISORDER_TYPES } from './vignettes.js';
import { emptyStats, recordCase, accuracy, weakest, selectionWeights, suggestLevel, pickLevel, STEP_NAMES, STATS_VERSION } from './stats.js';

const VALUE_ROWS = [
  { group: 'Blodgass (arteriell)' },
  { key: 'ph', label: 'pH' }, { key: 'pco2', label: 'PaCO2' }, { key: 'po2', label: 'PaO2' },
  { key: 'hco3', label: 'HCO3⁻' }, { key: 'be', label: 'BE' }, { key: 'lactate', label: 'Laktat' },
  { group: 'Elektrolytter og annet' },
  { key: 'na', label: 'Na⁺' }, { key: 'k', label: 'K⁺' }, { key: 'cl', label: 'Cl⁻' },
  { key: 'albumin', label: 'Albumin' }, { key: 'glucose', label: 'Glukose' },
  { group: 'Oksygen' },
  { key: 'fio2', label: 'FiO2' },
];

const parseNum = (s) => { const n = Number(String(s ?? '').trim().replace(',', '.')); return Number.isFinite(n) && String(s).trim() !== '' ? n : null; };
const within = (val, target, tol) => val !== null && Math.abs(val - target) <= tol;
const dir = (key, v) => ({ høy: 'høy', lav: 'lav', normal: 'normal' })[flag(key, v)];

export function mountBlodgass(container, ctx) {
  const { storage } = ctx;
  let stats = storage.get('blodgass:stats', null);
  if (!stats || stats.version !== STATS_VERSION) stats = emptyStats();
  let levelChoice = storage.get('blodgass:level', 'adaptiv');
  const saveStats = () => storage.set('blodgass:stats', stats);

  const caseArea = h('div', {});
  const stepArea = h('div', {});
  const grid = h('div', { class: 'bg-grid' }, caseArea, stepArea);
  const levelSeg = segmented({
    ariaLabel: 'Nivå', value: String(levelChoice),
    options: [{ value: 'adaptiv', label: 'Adaptiv' }, ...LEVELS.map((l) => ({ value: String(l.id), label: l.name }))],
    onChange: (v) => { levelChoice = v === 'adaptiv' ? 'adaptiv' : Number(v); storage.set('blodgass:level', levelChoice); },
  });
  const root = h('div', { class: 'bg' },
    h('div', { class: 'bg-head' },
      h('h1', {}, 'Blodgasstrener'),
      levelSeg.el,
      button('Nytt kasus', { variant: 'primary', onClick: () => newCase() }),
      button('Statistikk', { onClick: () => showStats() }),
    ),
    grid,
  );
  container.append(root);

  let current = null;
  let stepper = null;

  // ---------- Kasus ----------
  function newCase() {
    let level = levelChoice === 'adaptiv' ? pickLevel(suggestLevel(stats).weights) : levelChoice;
    current = generateCase({ level, weights: selectionWeights(stats) });
    renderCase(current);
    renderSteps(current);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderCase(c) {
    const v = c.values;
    const rows = [];
    for (const r of VALUE_ROWS) {
      if (r.group) { rows.push(h('tr', {}, h('th', { colspan: 5 }, r.group))); continue; }
      const ref = REF[r.key];
      const f = flag(r.key, v[r.key]);
      const refText = r.key === 'fio2' ? '' : `${fmt(ref.low, ref.decimals)}–${fmt(ref.high, ref.decimals)}`;
      rows.push(h('tr', { class: f !== 'normal' ? 'abn' : '' },
        h('td', {}, r.label),
        h('td', { class: 'v' }, r.key === 'fio2' ? fmt(v.fio2 * 100, 0) : fmt(v[r.key], ref.decimals)),
        h('td', { class: 'u' }, r.key === 'fio2' ? '%' : ref.unit),
        h('td', {}, h('span', { class: `flag ${f}` }, f === 'høy' ? '↑' : f === 'lav' ? '↓' : '')),
        h('td', { class: 'ref' }, refText),
      ));
    }
    const compact = h('div', { class: 'vals-compact' });
    for (const r of VALUE_ROWS) {
      if (r.group) continue;
      const ref = REF[r.key];
      const f = flag(r.key, v[r.key]);
      compact.append(h('div', { class: `vc ${f !== 'normal' ? 'abn' : ''}` },
        h('span', { class: 'vc-label' }, r.label),
        h('span', { class: 'vc-value' }, r.key === 'fio2' ? fmt(v.fio2 * 100, 0) : fmt(v[r.key], ref.decimals), h('span', { class: `flag ${f}` }, f === 'høy' ? '↑' : f === 'lav' ? '↓' : '')),
        h('span', { class: 'vc-unit' }, r.key === 'fio2' ? '%' : ref.unit)));
    }
    clear(caseArea);
    caseArea.append(
      panel({ title: `Kasus · ${LEVELS.find((l) => l.id === c.level)?.name ?? ''}`, class: 'bg-case' },
        h('p', { class: 'vignette' }, c.vignette),
        h('table', { class: 'vals' }, h('tbody', {}, ...rows)),
        compact,
        h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Referanseområder er typiske voksenverdier; se KILDER.md. Anion gap regnes uten kalium.'),
      ),
    );
  }

  // ---------- Hjelpere for svar ----------
  function choices(options, { multi = false } = {}) {
    let selected = new Set();
    const btns = options.map((o) => h('button', { type: 'button', class: 'choice', dataset: { id: o.id }, onClick: () => {
      if (multi) { selected.has(o.id) ? selected.delete(o.id) : selected.add(o.id); }
      else selected = new Set([o.id]);
      btns.forEach((b) => b.classList.toggle('selected', selected.has(b.dataset.id)));
    } }, o.label));
    const el = h('div', { class: 'choices' }, ...btns);
    return {
      el,
      get: () => (multi ? [...selected] : [...selected][0] ?? null),
      lock(correctIds) {
        btns.forEach((b) => { b.disabled = true; if (correctIds.includes(b.dataset.id)) b.classList.add('correct'); else if (selected.has(b.dataset.id)) b.classList.add('wrong'); });
      },
    };
  }

  function numField(label, unit, placeholder = '') {
    const input = h('input', { type: 'text', inputmode: 'decimal', placeholder, 'aria-label': label });
    const el = h('div', { class: 'numrow' }, h('label', {}, label), h('div', {}, input, h('span', { class: 'unit' }, unit)));
    return { el, get: () => parseNum(input.value), mark(ok) { input.disabled = true; input.classList.add(ok ? 'ok' : 'bad'); } };
  }

  function answerBlock(body, api, { inputs, evaluate }) {
    const fb = h('div', {});
    const actions = h('div', { class: 'row' });
    const submit = button('Svar', { variant: 'primary', onClick: () => {
      const r = evaluate();
      if (r === null) { toast('Fyll ut svaret først.', { kind: 'warn' }); return; }
      submit.disabled = true;
      clear(fb);
      fb.append(h('div', { class: `feedback ${r.correct ? 'correct' : 'wrong'}` }, h('b', {}, r.correct ? 'Riktig. ' : 'Ikke riktig. '), ...r.explain));
      clear(actions);
      actions.append(button('Neste trinn', { variant: 'primary', onClick: () => api.done({ correct: r.correct, summary: r.summary }) }));
      fb.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    } });
    actions.append(submit);
    body.append(h('div', { class: 'answer' }, ...inputs, actions, fb));
  }

  const P = (...c) => (c[0] && typeof c[0] === 'object' && !(c[0] instanceof Node) ? h('p', c[0], ...c.slice(1)) : h('p', {}, ...c));
  const calc = (text) => h('div', { class: 'calc' }, text);

  // ---------- Trinnene ----------
  function renderSteps(c) {
    const v = c.values;
    const k = c.key;
    
    const fordypning = (title, ...content) => h('details', { class: 'fordypning' }, h('summary', {}, title), ...content);

    const steps = [
      {
        title: 'Acidemi eller alkalemi?',
        render(body, api) {
          const ch = choices([{ id: 'acidemi', label: 'Acidemi (pH < 7,35)' }, { id: 'alkalemi', label: 'Alkalemi (pH > 7,45)' }, { id: 'normal', label: 'Normal pH (7,35–7,45)' }]);
          answerBlock(body, api, { inputs: [ch.el], evaluate: () => {
            const a = ch.get(); if (!a) return null;
            ch.lock([k.step1]);
            const correct = a === k.step1;
            const explain = [P(`pH er ${fmt(v.ph, 2)}. `, k.step1 === 'normal' ? 'Det ligger innenfor 7,35–7,45. Normal pH utelukker ikke en forstyrrelse: den kan være kompensert eller blandet.' : k.step1 === 'acidemi' ? 'Under 7,35 er acidemi. Primærforstyrrelsen er da en acidose, med eller uten kompensasjon.' : 'Over 7,45 er alkalemi. Primærforstyrrelsen er da en alkalose.')];
            return { correct, explain, summary: k.step1 };
          } });
        },
      },
      {
        title: 'Primær forstyrrelse',
        render(body, api) {
          const opts = Object.entries(PRIMARY_LABELS).map(([id, label]) => ({ id, label }));
          const ch = choices(opts);
          answerBlock(body, api, { inputs: [h('p', { class: 'hint' }, 'Hvilken verdi forklarer pH-avviket: PaCO2 (respiratorisk) eller HCO3 (metabolsk)?'), ch.el], evaluate: () => {
            const a = ch.get(); if (!a) return null;
            ch.lock(k.step2Accepted);
            const correct = k.step2Accepted.includes(a);
            const explain = [
              P(`PaCO2 ${fmt(v.pco2, 1)} kPa er ${dir('pco2', v.pco2)}, HCO3 ${fmt(v.hco3, 1)} mmol/L er ${dir('hco3', v.hco3)}.`),
              P(explainPrimary(v, k)),
              P(h('b', {}, 'Fasit: '), PRIMARY_LABELS[k.step2], k.step2Accepted.length > 1 ? ` (${k.step2Accepted.slice(1).map((x) => PRIMARY_LABELS[x]).join(' / ')} kan også forsvares ut fra tallene; sykehistorien avgjør)` : ''),
            ];
            return { correct, explain, summary: PRIMARY_LABELS[k.step2] };
          } });
        },
      },
      {
        title: 'Kompensasjon',
        render(body, api) {
          const s3 = k.step3;
          const want = k.step3Simple;
          if (want === 'ikke-aktuelt') { body.append(P('Ingen primær forstyrrelse, ingen kompensasjon å vurdere.')); api.skip('Ikke aktuelt'); return; }
          const metabolic = k.step2.startsWith('met');
          const ch = choices(Object.entries(SIMPLE_COMP_LABELS).map(([id, label]) => ({ id, label })));
          answerBlock(body, api, { inputs: [h('p', { class: 'hint' }, `Primær: ${PRIMARY_LABELS[k.step2]}. ${k.step2.startsWith('blandet') ? '' : `Den kompenserende verdien er ${metabolic ? 'PaCO2 (lungene justerer på minutter)' : 'HCO3 (nyrene bruker 2–5 døgn)'}.`} Hvordan ser kompensasjonen ut?`), ch.el], evaluate: () => {
            const a = ch.get(); if (!a) return null;
            ch.lock([want]);
            const correct = a === want;
            const compVal = metabolic ? `PaCO2 ${fmt(v.pco2, 1)} kPa (${dir('pco2', v.pco2)})` : `HCO3 ${fmt(v.hco3, 1)} mmol/L (${dir('hco3', v.hco3)})`;
            const explain = [];
            if (want === 'blandet') explain.push(P(`Både PaCO2 og HCO3 trekker pH samme vei. Da er det ikke kompensasjon, men to forstyrrelser samtidig.`));
            else if (want === 'ukompensert') explain.push(P(`${compVal} ligger i referanseområdet: kroppen har ennå ikke kompensert. ${metabolic ? 'Ved metabolsk forstyrrelse skjer dette vanligvis raskt, så en normal PaCO2 kan også bety at pasienten ikke klarer å kompensere.' : 'Typisk for en akutt respiratorisk forstyrrelse: nyrene trenger dager.'}`));
            else if (want === 'delvis') explain.push(P(`${compVal} har beveget seg i kompenserende retning, men pH ${fmt(v.ph, 2)} er fortsatt utenfor 7,35–7,45: delvis kompensert.`));
            else explain.push(P(`pH ${fmt(v.ph, 2)} er normal selv om ${compVal} er unormal: fullt kompensert. ${metabolic ? '' : 'Ved respiratorisk forstyrrelse betyr det en kronisk tilstand.'}`));
            if (s3.applicable && !k.step2.startsWith('blandet')) {
              const exp = s3.target === 'pco2'
                ? `${s3.rule}. Forventet PaCO2 ${fmt(s3.low, 1)}–${fmt(s3.high, 1)} kPa, målt ${fmt(v.pco2, 1)}.`
                : `Akutt: ${s3.acute.rule} → ${fmt(s3.acute.expected, 1)} mmol/L. Kronisk: ${s3.chronic.rule} → ${fmt(s3.chronic.expected, 1)} mmol/L. Målt ${fmt(v.hco3, 1)}.`;
              explain.push(fordypning('Fordypning: forventet kompensasjon (legenivå)', calc(exp), P(COMP_LABELS[s3.verdict], s3.verdict.startsWith('tillegg') ? ' Det tyder på en tilleggsforstyrrelse.' : '')));
            }
            return { correct, explain, summary: SIMPLE_COMP_LABELS[want].split(':')[0] };
          } });
        },
      },
      {
        title: 'Anion gap',
        render(body, api) {
          const nAg = numField('Anion gap = Na − (Cl + HCO3)', 'mmol/L');
          const ch = choices([{ id: 'hoy', label: 'Høy anion gap (> 12)' }, { id: 'normal', label: 'Normal anion gap (≤ 12)' }]);
          answerBlock(body, api, { inputs: [h('p', { class: 'hint' }, `Na ${v.na}, Cl ${v.cl}, HCO3 ${fmt(v.hco3, 1)}. Høy anion gap betyr at det finnes syrer som ikke måles direkte (laktat, ketoner, toksiner, nyresvikt).`), nAg.el, ch.el], evaluate: () => {
            const a = ch.get(), ag = nAg.get(); if (!a || ag === null) return null;
            const agOk = within(ag, k.step4.ag, 1.5);
            nAg.mark(agOk);
            const want = k.step4.high ? 'hoy' : 'normal';
            ch.lock([want]);
            const correct = agOk && a === want;
            const explain = [
              calc(`AG = ${v.na} − (${v.cl} + ${fmt(v.hco3, 1)}) = ${fmt(k.step4.ag, 1)} mmol/L`),
              P(k.step4.high ? 'Høy anion gap: det finnes umålte anioner (laktat, ketoner, sulfat/fosfat ved nyresvikt, toksiske syrer). ' : 'Normal anion gap: ingen umålte anioner av betydning. Ved metabolsk acidose betyr det tap av bikarbonat (diaré) eller tilførsel av klorid (mye NaCl). '),
            ];
            if (k.step4.correctionApplied) explain.push(P(`Albumin er ${v.albumin} g/L. Lav albumin gir lavere anion gap, så korrigert gap er ${fmt(k.step4.agCorr, 1)} (+0,25 per g/L under 40). Vurderingen er gjort på korrigert verdi.`));
            if (k.step5.applicable) explain.push(fordypning('Fordypning: delta ratio (legenivå)', calc(`Δratio = (AGkorr − 12)/(24 − HCO3) = (${fmt(k.step4.agCorr, 1)} − 12)/(24 − ${fmt(v.hco3, 1)}) = ${fmt(k.step5.ratio, 2)}`), P(DELTA_LABELS[k.step5.verdict])));
            return { correct, explain, summary: k.step4.high ? `Høy AG (${fmt(k.step4.ag, 0)})` : `Normal AG (${fmt(k.step4.ag, 0)})` };
          } });
        },
      },
      {
        title: 'Oksygenering (P/F-ratio)',
        render(body, api) {
          const nPf = numField('P/F = PaO2 / FiO2', 'kPa');
          const ch = choices(Object.entries(PF_LABELS).map(([id, label]) => ({ id, label })));
          answerBlock(body, api, { inputs: [h('p', { class: 'hint' }, `PaO2 ${fmt(v.po2, 1)} kPa på FiO2 ${fmt(v.fio2, 2)} (${fmt(v.fio2 * 100, 0)} %).`), nPf.el, ch.el], evaluate: () => {
            const a = ch.get(), pf = nPf.get(); if (!a || pf === null) return null;
            const numOk = within(pf, k.step6.pf, 1.5); nPf.mark(numOk);
            ch.lock([k.step6.grade]);
            const correct = numOk && a === k.step6.grade;
            const explain = [
              calc(`P/F = ${fmt(v.po2, 1)} / ${fmt(v.fio2, 2)} = ${fmt(k.step6.pf, 1)} kPa (= ${fmt(kPaToMmHg(k.step6.pf), 0)} mmHg)`),
              P(`Gradering: ${PF_LABELS[k.step6.grade]}. `, k.step6.hypoxemic ? `PaO2 ${fmt(v.po2, 1)} kPa er under 8 kPa: hypoksemisk respirasjonssvikt.` : 'PaO2 er over 8 kPa.', ' Ved hypoventilasjon faller PaO2 fordi alveolært PO2 faller, ikke nødvendigvis på grunn av lungesykdom.'),
            ];
            return { correct, explain, summary: `${fmt(k.step6.pf, 0)} kPa, ${k.step6.grade}` };
          } });
        },
      },
      {
        title: 'Sannsynlige årsaker',
        render(body, api) {
          const ch = choices(c.causeOptions, { multi: true });
          answerBlock(body, api, { inputs: [h('p', { class: 'hint' }, 'Velg alle som passer med vignetten og tallene.'), ch.el], evaluate: () => {
            const a = ch.get(); if (!a.length) return null;
            ch.lock(k.causes);
            const set = new Set(a);
            const correct = k.causes.every((id) => set.has(id)) && a.every((id) => k.causes.includes(id));
            const missing = k.causes.filter((id) => !set.has(id));
            const extra = a.filter((id) => !k.causes.includes(id));
            const explain = [P(h('b', {}, 'Fasit: '), k.causes.map((id) => CAUSES[id]).join(' + '), '.')];
            if (missing.length) explain.push(P(`Manglet: ${missing.map((id) => CAUSES[id]).join(', ')}.`));
            if (extra.length) explain.push(P(`Passer ikke: ${extra.map((id) => CAUSES[id]).join(', ')}.`));
            explain.push(P(explainCauses(c)));
            return { correct, explain, summary: k.causes.map((id) => CAUSES[id].split(' (')[0]).join(', ') };
          } });
        },
      },
    ];

    clear(stepArea);
    stepper?.destroy();
    stepper = createStepper({ steps, paged: true, onComplete: (results) => finishCase(c, results) });
    stepArea.append(stepper.el);
  }

  function finishCase(c, results) {
    stats = recordCase(stats, c, results);
    saveStats();
    const n = results.filter((r) => r.correct !== null).length;
    const ok = results.filter((r) => r.correct === true).length;
    const weakSteps = weakest(stats.steps, 3).slice(0, 2);
    stepArea.append(panel({ title: 'Oppsummering' },
      P(h('b', {}, `${ok} av ${n} trinn riktig.`), ` Kasus: ${PRIMARY_LABELS[c.primary]}${c.secondary ? ' + ' + (PRIMARY_LABELS[c.secondary.replace(/-normal-ag|-hoy-ag/, '')] ?? c.secondary) : ''}.`),
      h('div', { class: 'summary-steps' }, ...results.map((r, i) => h('div', { class: `srow ${r.correct === null ? 'skip' : r.correct ? 'ok' : 'fail'}` },
        h('span', {}, r.correct === null ? '–' : r.correct ? '✓' : '✗'), h('span', {}, STEP_NAMES[i + 1]), h('span', { class: 'muted' }, r.summary ?? '')))),
      weakSteps.length ? P({ class: 'muted' }, `Svakest så langt: ${weakSteps.map((w) => `${STEP_NAMES[w.key]} (${fmt(w.acc * 100, 0)} %)`).join(', ')}. Neste kasus vektes mot svake områder.`) : null,
      h('div', { class: 'row', style: { marginTop: '10px' } }, button('Nytt kasus', { variant: 'primary', onClick: () => newCase() }), button('Statistikk', { onClick: () => showStats() })),
    ));
  }

  // ---------- Forklaringer ----------
  function explainPrimary(v, k) {
    const s1 = k.step1;
    const p = k.step2;
    if (p === 'met-acidose') return `${s1 === 'acidemi' ? 'Acidemi' : 'pH på acidosesiden av 7,40'} med lav HCO3 → metabolsk acidose. ${v.pco2 < REF.pco2.low ? 'Lav PaCO2 er respiratorisk kompensasjon (hyperventilasjon), ikke en primær alkalose.' : ''}`;
    if (p === 'met-alkalose') return `${s1 === 'alkalemi' ? 'Alkalemi' : 'pH på alkalosesiden av 7,40'} med høy HCO3 → metabolsk alkalose. ${v.pco2 > REF.pco2.high ? 'Høy PaCO2 er respiratorisk kompensasjon (hypoventilasjon).' : ''}`;
    if (p === 'resp-acidose') return `${s1 === 'acidemi' ? 'Acidemi' : 'pH på acidosesiden av 7,40'} med høy PaCO2 → respiratorisk acidose. ${v.hco3 > REF.hco3.high ? 'Høy HCO3 er renal kompensasjon, som tar dager; det peker mot en kronisk tilstand.' : 'HCO3 er ikke vesentlig forhøyet, så nyrene har ikke rukket å kompensere: akutt.'}`;
    if (p === 'resp-alkalose') return `${s1 === 'alkalemi' ? 'Alkalemi' : 'pH på alkalosesiden av 7,40'} med lav PaCO2 → respiratorisk alkalose. ${v.hco3 < REF.hco3.low ? 'Lav HCO3 er renal kompensasjon eller en samtidig metabolsk acidose; trinn 3 skiller dem.' : ''}`;
    if (p === 'blandet-acidose') return 'Acidemi der både PaCO2 er høy og HCO3 er lav: begge trekker pH ned. Ingen av dem kan være kompensasjon for den andre, så dette er en blandet acidose.';
    if (p === 'blandet-alkalose') return 'Alkalemi der både PaCO2 er lav og HCO3 er høy: begge trekker pH opp. Blandet alkalose.';
    return 'Alle verdier innenfor referanseområdet.';
  }

  function explainCauses(c) {
    const v = c.values;
    const bits = [];
    if (v.lactate > 2.5) bits.push(`laktat ${fmt(v.lactate, 1)} peker mot hypoperfusjon/sepsis`);
    if (v.glucose > 15) bits.push(`glukose ${fmt(v.glucose, 1)} peker mot ketoacidose`);
    if (v.k > 5.2) bits.push(`K ${fmt(v.k, 1)} passer med nyresvikt eller acidose med kaliumskift`);
    if (v.k < 3.4) bits.push(`K ${fmt(v.k, 1)} passer med oppkast, diuretika, diaré eller RTA`);
    if (v.cl < 96) bits.push(`Cl ${v.cl} er lav: tap av klorid (oppkast/diuretika)`);
    if (c.key.step4.high && c.key.step2.includes('acidose')) bits.push('høy anion gap betyr umålte anioner');
    if (!c.key.step4.high && c.key.step2 === 'met-acidose') bits.push('normal anion gap betyr bikarbonattap eller kloridtilførsel');
    return bits.length ? `Spor i tallene: ${bits.join('; ')}.` : 'Vignetten gir hovedsporet; tallene bekrefter.';
  }

  // ---------- Statistikk ----------
  function showStats() {
    clear(stepArea);
    const bar = (acc) => { const pct = acc === null ? 0 : acc * 100; return h('div', { class: `stat-bar ${acc === null ? '' : acc < 0.5 ? 'low' : acc < 0.8 ? 'mid' : 'high'}` }, h('div', { style: { width: `${pct}%` } })); };
    const tbl = (title, map, nameOf) => h('div', {},
      h('h3', {}, title),
      h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { class: 'num' }, 'n'), h('th', { class: 'num' }, 'Riktig'), h('th', {}, ''))),
        h('tbody', {}, ...Object.entries(map).map(([key, e]) => h('tr', {}, h('td', {}, nameOf(key)), h('td', { class: 'num' }, String(e.n)), h('td', { class: 'num' }, accuracy(e) === null ? '–' : `${fmt(accuracy(e) * 100, 0)} %`), h('td', {}, bar(accuracy(e))))))),
    );
    const stepsMap = Object.fromEntries(Object.keys(STEP_NAMES).map((k) => [k, stats.steps[k] ?? { n: 0, correct: 0 }]));
    const typesMap = Object.fromEntries(DISORDER_TYPES.map((t) => [t.id, stats.types[t.id] ?? { n: 0, correct: 0 }]));
    const levelsMap = Object.fromEntries(LEVELS.map((l) => [String(l.id), stats.levels[String(l.id)] ?? { n: 0, correct: 0 }]));
    const weak = weakest(stats.steps, 3)[0];
    const weakT = weakest(stats.types, 3)[0];
    const sug = suggestLevel(stats);
    stepArea.append(panel({ title: 'Statistikk' },
      P(h('b', {}, `${stats.cases} kasus gjennomført.`), ' ', weak ? `Svakeste trinn: ${STEP_NAMES[weak.key]} (${fmt(weak.acc * 100, 0)} %). ` : '', weakT ? `Svakeste forstyrrelse: ${DISORDER_TYPES.find((t) => t.id === weakT.key)?.name} (${fmt(weakT.acc * 100, 0)} %).` : ''),
      P({ class: 'muted' }, `Adaptivt nivå: ${sug.reason}.`),
      h('div', { class: 'grid grid-2' }, tbl('Per trinn', stepsMap, (k) => STEP_NAMES[k]), h('div', {}, tbl('Per forstyrrelse', typesMap, (k) => DISORDER_TYPES.find((t) => t.id === k)?.name ?? k), tbl('Per nivå', levelsMap, (k) => LEVELS.find((l) => String(l.id) === k)?.name ?? k))),
      h('h3', { style: { marginTop: '12px' } }, 'Siste kasus (ett felt per trinn)'),
      h('div', { class: 'stack' }, ...stats.history.slice(-10).reverse().map((hst) => h('div', { class: 'row' }, h('span', { class: 'muted', style: { minWidth: '180px' } }, `${PRIMARY_LABELS[hst.primary]} · nivå ${hst.level}`), h('div', { class: 'hist' }, ...hst.perStep.map((p) => h('span', { class: `dot ${p === null ? '' : p ? 'ok' : 'fail'}` })))))),
      h('div', { class: 'row', style: { marginTop: '12px' } },
        button('Nytt kasus', { variant: 'primary', onClick: () => newCase() }),
        button('Nullstill statistikk', { variant: 'danger', onClick: () => { stats = emptyStats(); saveStats(); showStats(); toast('Statistikk nullstilt'); } })),
    ));
  }

  // Start
  newCase();
  return () => { stepper?.destroy(); root.remove(); };
}
