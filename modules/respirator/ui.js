/**
 * Respiratorsimulator – brukergrensesnitt etter mønster fra Hamilton C6:
 *   topplinje (modus, pasient, status, klokke)
 *   MMP-kolonne til venstre, kurver (+ sløyfer) i midten, knappekolonne til høyre,
 *   innstillingsknapper nederst, og vinduer (Kontroller, Monitorering, Pasient, Verktøy, Oppgaver)
 *   som legger seg over kurveområdet.
 */
import { h, clear } from '../../core/ui/dom.js';
import { slider, select, segmented, button } from '../../core/ui/controls.js';
import { toast } from '../../core/ui/toast.js';
import { fmt } from '../../core/units.js';
import { createScope } from '../../core/charts/scope.js';
import { createLoop } from '../../core/charts/loop.js';
import { createVentilator, MODES, DEFAULT_SETTINGS, DEFAULT_PATIENT } from '../../core/sim/ventilator.js';
import { timeConstant, idealBodyWeightHamilton } from '../../core/physiology/respiratory.js';
import { PROFILES, getProfile } from './profiles.js';
import { TASKS, taskSetup, evaluateTask, predictionFor, MEASURES, settingLabel } from './tasks.js';

const IE_OPTIONS = [
  { value: '2:1', label: '2:1', ie: { i: 2, e: 1 } },
  { value: '1.5:1', label: '1,5:1', ie: { i: 1.5, e: 1 } },
  { value: '1:1', label: '1:1', ie: { i: 1, e: 1 } },
  { value: '1:1.5', label: '1:1,5', ie: { i: 1, e: 1.5 } },
  { value: '1:2', label: '1:2', ie: { i: 1, e: 2 } },
  { value: '1:2.5', label: '1:2,5', ie: { i: 1, e: 2.5 } },
  { value: '1:3', label: '1:3', ie: { i: 1, e: 3 } },
  { value: '1:4', label: '1:4', ie: { i: 1, e: 4 } },
  { value: '1:5', label: '1:5', ie: { i: 1, e: 5 } },
];
const ieKey = (ie) => (ie.i === 1 ? `1:${ie.e}` : `${ie.i}:1`);
const ieLabel = (ie) => ieKey(ie).replace('.', ',');

const MMP_MAIN = [
  { key: 'ppeak', label: 'Ppeak', unit: 'cmH2O', d: 1 },
  { key: 'pplat', label: 'Pplat', unit: 'cmH2O', d: 1 },
  { key: 'pmean', label: 'Pmean', unit: 'cmH2O', d: 1 },
  { key: 'peepTotal', label: 'PEEP/CPAP', unit: 'cmH2O', d: 1 },
  { key: 'autoPeep', label: 'AutoPEEP', unit: 'cmH2O', d: 1 },
  { key: 'vte', label: 'VTE', unit: 'ml', d: 0 },
  { key: 'expMinVol', label: 'ExpMinVol', unit: 'L/min', d: 1 },
  { key: 'fTotal', label: 'fTotal', unit: '/min', d: 0 },
];
const MMP_ALL = [
  ...MMP_MAIN,
  { key: 'drivingPressure', label: 'ΔP (drivtrykk)', unit: 'cmH2O', d: 1 },
  { key: 'vti', label: 'VTI', unit: 'ml', d: 0 },
  { key: 'vtPerKg', label: 'Vt/kg IBW', unit: 'ml/kg', d: 1 },
  { key: 'fSpont', label: 'fSpont', unit: '/min', d: 0 },
  { key: 'cstat', label: 'Cstat', unit: 'ml/cmH2O', d: 0 },
  { key: 'rinsp', label: 'Rinsp', unit: 'cmH2O/(L/s)', d: 0 },
  { key: 'rcexp', label: 'RCexp', unit: 's', d: 2 },
  { key: 'ti', label: 'TI', unit: 's', d: 2 },
  { key: 'te', label: 'TE', unit: 's', d: 2 },
  { key: 'ieText', label: 'I:E', unit: '', d: null },
  { key: 'ibw', label: 'IBW', unit: 'kg', d: 1 },
];

export function mountRespirator(container, ctx) {
  const { storage } = ctx;
  const saved = storage.get('respirator:state', null);
  const profileId = saved?.profileId ?? 'normal';
  const vent = createVentilator({
    settings: saved?.settings ?? {},
    patient: saved?.patient ?? structuredClone(getProfile(profileId).patient),
  });
  const ui = {
    running: true, speed: 1, window: null, showLoops: window.innerWidth > 900, profileId,
    pmax: 40, lastHoldTime: null, raf: 0, acc: 0, lastNow: null,
    task: null, // { task, hidden, answer, holdDone, result }
  };
  const progress = storage.get('respirator:progress', { tasks: {}, predictions: { correct: 0, total: 0 } });
  const save = () => storage.set('respirator:state', { settings: vent.settings, patient: vent.patient, profileId: ui.profileId });
  const saveProgress = () => storage.set('respirator:progress', progress);

  // ---------- DOM-skjelett ----------
  const modeBtn = h('button', { class: 'hc-mode', type: 'button', onClick: () => openModeModal() });
  const patientBox = h('div', { class: 'hc-patient' });
  const statusBox = h('div', { class: 'hc-status' });
  const clockBox = h('div', { class: 'hc-clock' });
  const mmpCol = h('div', { class: 'hc-mmp' });
  const curves = h('div', { class: 'hc-curves' });
  const loops = h('div', { class: 'hc-loops' });
  const waves = h('div', { class: 'hc-waves' }, curves, loops);
  const side = h('div', { class: 'hc-side' });
  const settingsBar = h('div', { class: 'hc-settings' });
  const root = h('div', { class: 'hc' },
    h('div', { class: 'hc-top' }, modeBtn, patientBox, statusBox, clockBox),
    mmpCol, waves, side, settingsBar,
  );
  container.append(root);

  // ---------- Kurver ----------
  const sc = {
    paw: createScope(h('div', {}), { label: 'Paw', unit: 'cmH2O', color: cssColor('--curve-pressure'), range: [-5, 40] }),
    flow: createScope(h('div', {}), { label: 'Flow', unit: 'L/min', color: cssColor('--curve-flow'), range: [-60, 60] }),
    vol: createScope(h('div', {}), { label: 'Volum', unit: 'ml', color: cssColor('--curve-volume'), range: [0, 600] }),
  };
  curves.append(...Object.values(sc).map((s) => s.wrap));
  const pvLoop = createLoop(h('div', {}), { title: 'Trykk–volum', xLabel: 'Paw cmH2O / Volum ml', color: cssColor('--curve-pressure'), xRange: [0, 40], yRange: [0, 600] });
  const fvLoop = createLoop(h('div', {}), { title: 'Flow–volum', xLabel: 'Volum ml / Flow L/min', color: cssColor('--curve-flow'), xRange: [0, 600], yRange: [-60, 60] });
  loops.append(pvLoop.wrap, fvLoop.wrap);
  let loopCur = { pv: [], fv: [] };
  let loopPrev = { pv: [], fv: [] };
  let loopBreathRef = null;
  let sampleCount = 0;

  function cssColor(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff'; }

  // ---------- MMP ----------
  const mmpTiles = {};
  for (const m of MMP_MAIN) {
    const val = h('div', { class: 'mmp-value' }, '–');
    const el = h('div', { class: 'mmp' }, h('div', { class: 'mmp-label' }, h('span', {}, m.label)), val, h('div', { class: 'mmp-unit' }, m.unit));
    mmpTiles[m.key] = { el, val, def: m };
    mmpCol.append(el);
  }

  function updateMMP(m) {
    for (const [key, t] of Object.entries(mmpTiles)) {
      let v = m[key];
      let cls = 'mmp';
      if (key === 'pplat' && m.pplatMeasured !== null && m.pplatMeasured !== undefined) cls += ' measured';
      if (key === 'autoPeep' && m.autoPeepMeasured !== null && m.autoPeepMeasured !== undefined) cls += ' measured';
      if (key === 'ppeak' && v > ui.pmax) cls += ' alarm';
      t.val.textContent = t.def.d === null ? (v ?? '–') : fmt(v, t.def.d);
      t.el.className = cls;
    }
    if (monitorRefresh) monitorRefresh(m);
  }
  let monitorRefresh = null;

  // ---------- Topplinje ----------
  function renderTop() {
    const s = vent.settings;
    clear(modeBtn);
    modeBtn.append(h('div', { class: 'hc-mode-name' }, MODES[s.mode].label), h('div', { class: 'hc-mode-sub' }, 'Trykk for å bytte modus'));
    const p = vent.patient;
    clear(patientBox);
    patientBox.append(
      h('div', {}, h('b', {}, 'Voksen'), ` · ${p.sex === 'M' ? 'Mann' : 'Kvinne'} ${p.height} cm`),
      h('div', {}, `IBW ${fmt(idealBodyWeightHamilton(p.height, p.sex), 1)} kg · ${ui.task ? 'Oppgave' : getProfile(ui.profileId).name}`),
    );
    renderStatus();
  }

  function renderStatus() {
    const m = vent.measurements;
    const alarms = [];
    if (m.ppeak !== null && m.ppeak > ui.pmax) alarms.push(`Høyt trykk: Ppeak ${fmt(m.ppeak, 0)} > Pmax ${ui.pmax}`);
    if (vent.backupActive) alarms.push('Apné – backup-ventilasjon');
    if (m.expMinVol !== null && m.expMinVol < 2 && m.fTotal > 0) alarms.push(`Lavt minuttvolum: ${fmt(m.expMinVol, 1)} L/min`);
    statusBox.className = `hc-status ${alarms.length ? 'alarm' : ''}`;
    clear(statusBox);
    if (alarms.length) statusBox.append(h('span', {}, '⚠ ' + alarms.join(' · ')));
    else if (ui.task) {
      statusBox.append(h('span', { class: 'hc-task-chip' }, h('b', {}, 'Oppgave:'), ui.task.task.title,
        button('Sjekk', { small: true, variant: 'primary', onClick: () => checkTask() }),
        button('Vis', { small: true, onClick: () => openWindow('tasks') })));
    } else if (!ui.running) statusBox.append(h('span', { class: 'warn' }, '⏸ Simulering pauset'));
    else statusBox.append(h('span', { class: 'muted' }, 'Læringsverktøy, ikke til klinisk bruk'));
    if (vent.holdResult && vent.holdResult.time !== ui.lastHoldTime) {
      const r = vent.holdResult;
      statusBox.append(h('span', { class: 'hc-hold-result' }, r.type === 'insp' ? ` Insp. hold: Pplat ${fmt(r.pplat, 1)}` : ` Eksp. hold: PEEPtot ${fmt(r.peepTotal, 1)} → AutoPEEP ${fmt(r.autoPeep, 1)}`));
    }
  }

  function renderClock() {
    const t = vent.time;
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(Math.floor(t % 60)).padStart(2, '0');
    clockBox.textContent = `${mm}:${ss}`;
    clockBox.append(h('small', {}, ui.speed === 1 ? 'simulert tid' : `${ui.speed}× hastighet`));
  }

  // ---------- Innstillingsknapper nederst ----------
  function settingDefs() {
    const s = vent.settings;
    const common = [{ key: 'fio2', label: 'Oksygen', value: s.fio2, unit: '%' }, { key: 'peep', label: 'PEEP/CPAP', value: s.peep, unit: 'cmH2O' }];
    const timing = s.timingMode === 'ie'
      ? { key: 'ie', label: 'I:E', value: ieLabel(s.ie), unit: '' }
      : { key: 'ti', label: 'TI', value: s.ti.toFixed(2), unit: 's' };
    const trig = { key: 'trigger', label: s.trigger.type === 'flow' ? 'Flowtrigger' : 'Trykktrigger', value: s.trigger.value, unit: s.trigger.type === 'flow' ? 'L/min' : 'cmH2O' };
    if (s.mode === 'SCMV') return [...common, { key: 'rate', label: 'Frekvens', value: s.rate, unit: '/min' }, { key: 'vt', label: 'Vt', value: s.vt, unit: 'ml' }, timing, { key: 'tip', label: 'TIP (pause)', value: s.tip, unit: '%' }, { key: 'flowPattern', label: 'Flowmønster', value: s.flowPattern === 'decel' ? 'Desel.' : 'Firkant', unit: '' }, trig];
    if (s.mode === 'PCV') return [...common, { key: 'rate', label: 'Frekvens', value: s.rate, unit: '/min' }, { key: 'pcontrol', label: 'Pcontrol', value: s.pcontrol, unit: 'cmH2O' }, timing, { key: 'pramp', label: 'Pramp', value: s.pramp, unit: 'ms' }, trig];
    return [...common, { key: 'psupport', label: 'Psupport', value: s.psupport, unit: 'cmH2O' }, { key: 'pramp', label: 'Pramp', value: s.pramp, unit: 'ms' }, { key: 'ets', label: 'ETS', value: s.ets, unit: '%' }, trig, { key: 'tiMax', label: 'TI max', value: s.tiMax, unit: 's' }, { key: 'apneaTime', label: 'Apnétid', value: s.apneaTime, unit: 's' }];
  }

  function renderSettingsBar() {
    clear(settingsBar);
    for (const d of settingDefs()) {
      settingsBar.append(h('button', { type: 'button', class: 'hc-set', dataset: { key: d.key }, onClick: () => openWindow('controls', d.key) },
        h('span', { class: 'set-label' }, d.label),
        h('span', { class: 'set-value' }, String(d.value)),
        h('span', { class: 'set-unit' }, d.unit)));
    }
  }

  // ---------- Endring av innstillinger (med forutsigelse i oppgaver) ----------
  function applySetting(key, value) {
    const partial = {};
    if (key === 'ie') { partial.ie = value; partial.timingMode = 'ie'; }
    else if (key === 'ti') { partial.ti = value; partial.timingMode = 'ti'; }
    else if (key === 'triggerType') partial.trigger = { type: value, value: value === 'flow' ? 2 : 2 };
    else if (key === 'triggerValue') partial.trigger = { ...vent.settings.trigger, value };
    else if (key === 'backupRate') partial.backup = { ...vent.settings.backup, rate: value };
    else if (key === 'backupPcontrol') partial.backup = { ...vent.settings.backup, pcontrol: value };
    else partial[key] = value;
    vent.setSettings(partial);
    save();
    renderSettingsBar();
    renderTop();
  }

  const PREDICTABLE = new Set(['vt', 'rate', 'peep', 'ie', 'ti', 'pcontrol', 'psupport', 'tip', 'flowPattern']);

  function changeSetting(key, value, revert) {
    const s = vent.settings;
    const oldValue = key === 'ie' ? s.ie : key === 'ti' ? s.ti : s[key];
    if (ui.task && PREDICTABLE.has(key)) {
      const q = predictionFor({ key, oldValue, newValue: value, settings: s, patient: vent.patient, focus: ui.task.task.focus });
      if (q) { showPrediction(q, () => applySetting(key, value), revert); return; }
    }
    applySetting(key, value);
  }

  // ---------- Vinduer ----------
  let windowEl = null;
  function closeWindow() {
    windowEl?.remove(); windowEl = null; ui.window = null;
    side.querySelectorAll('.hc-btn[data-win]').forEach((b) => b.classList.remove('active'));
  }
  function openWindow(name, focusKey) {
    if (ui.window === name && !focusKey) { closeWindow(); return; }
    closeWindow();
    ui.window = name;
    side.querySelectorAll('.hc-btn[data-win]').forEach((b) => b.classList.toggle('active', b.dataset.win === name));
    const body = h('div', { class: 'hc-window-body' });
    const head = h('div', { class: 'hc-window-head' });
    windowEl = h('div', { class: 'hc-window', role: 'dialog' }, head, body);
    root.append(windowEl);
    const title = { controls: 'Kontroller', monitor: 'Monitorering', patient: 'Pasient', tools: 'Verktøy', tasks: 'Oppgaver' }[name];
    head.append(h('h2', {}, title), h('button', { class: 'hc-close', type: 'button', 'aria-label': 'Lukk', onClick: closeWindow }, '✕'));
    ({ controls: renderControls, monitor: renderMonitor, patient: renderPatient, tools: renderTools, tasks: renderTasks })[name](body, head, focusKey);
  }

  function renderControls(body, head, focusKey) {
    const s = vent.settings;
    const add = (key, ctl) => { if (key === focusKey) ctl.el.classList.add('highlight'); body.append(ctl.el); return ctl; };
    const sl = (key, opts) => add(key, slider({ ...opts, onChange: (v) => changeSetting(key, v, () => ctlRefs[key]?.set(vent.settings[key] ?? v, true)) }));
    const ctlRefs = {};
    body.append(h('div', { class: 'hc-section' }, `${MODES[s.mode].label} – grunninnstillinger`));
    ctlRefs.fio2 = sl('fio2', { label: 'Oksygen', unit: '%', min: 21, max: 100, step: 1, value: s.fio2 });
    ctlRefs.peep = sl('peep', { label: 'PEEP/CPAP', unit: 'cmH2O', min: 0, max: 25, step: 1, value: s.peep });
    if (s.mode !== 'SPONT') ctlRefs.rate = sl('rate', { label: 'Frekvens', unit: '/min', min: 4, max: 40, step: 1, value: s.rate });
    if (s.mode === 'SCMV') ctlRefs.vt = sl('vt', { label: 'Vt', unit: 'ml', min: 100, max: 1000, step: 10, value: s.vt });
    if (s.mode === 'PCV') ctlRefs.pcontrol = sl('pcontrol', { label: 'Pcontrol (over PEEP)', unit: 'cmH2O', min: 2, max: 50, step: 1, value: s.pcontrol });
    if (s.mode === 'SPONT') ctlRefs.psupport = sl('psupport', { label: 'Psupport (over PEEP)', unit: 'cmH2O', min: 0, max: 40, step: 1, value: s.psupport });

    if (s.mode !== 'SPONT') {
      body.append(h('div', { class: 'hc-section' }, 'Tid'));
      const timingSeg = segmented({ ariaLabel: 'Tidsinnstilling', value: s.timingMode, options: [{ value: 'ie', label: 'I:E' }, { value: 'ti', label: 'TI' }], onChange: (v) => { applySetting('timingMode', v); openWindow('controls', v); } });
      body.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Still inn via'), timingSeg.el));
      if (s.timingMode === 'ie') {
        add('ie', select({ label: 'I:E', value: ieKey(s.ie), options: IE_OPTIONS, onChange: (v) => changeSetting('ie', IE_OPTIONS.find((o) => o.value === v).ie, () => {}) }));
      } else {
        ctlRefs.ti = sl('ti', { label: 'TI', unit: 's', min: 0.3, max: 3, step: 0.05, value: s.ti });
      }
      if (s.mode === 'SCMV') {
        ctlRefs.tip = sl('tip', { label: 'TIP (pause, % av TI)', unit: '%', min: 0, max: 50, step: 5, value: s.tip });
        add('flowPattern', segmented({ ariaLabel: 'Flowmønster', value: s.flowPattern, options: [{ value: 'square', label: 'Firkant' }, { value: 'decel', label: 'Deselererende 50 %' }], onChange: (v) => changeSetting('flowPattern', v, () => {}) }));
      }
    }
    if (s.mode !== 'SCMV') {
      body.append(h('div', { class: 'hc-section' }, 'Trykkstigning'));
      ctlRefs.pramp = sl('pramp', { label: 'Pramp', unit: 'ms', min: 0, max: 400, step: 25, value: s.pramp });
    }
    body.append(h('div', { class: 'hc-section' }, 'Trigger'));
    add('trigger', segmented({ ariaLabel: 'Triggertype', value: s.trigger.type, options: [{ value: 'flow', label: 'Flow' }, { value: 'pressure', label: 'Trykk' }], onChange: (v) => { applySetting('triggerType', v); openWindow('controls', 'trigger'); } }));
    if (s.trigger.type === 'flow') add('trigger', slider({ label: 'Flowtrigger', unit: 'L/min', min: 0.5, max: 15, step: 0.5, value: s.trigger.value, onChange: (v) => applySetting('triggerValue', v) }));
    else add('trigger', slider({ label: 'Trykktrigger', unit: 'cmH2O', min: 0.5, max: 10, step: 0.5, value: s.trigger.value, onChange: (v) => applySetting('triggerValue', v) }));
    if (s.mode === 'SPONT') {
      body.append(h('div', { class: 'hc-section' }, 'Syklus og apné'));
      sl('ets', { label: 'ETS (eksp. triggerfølsomhet)', unit: '% av toppflow', min: 5, max: 70, step: 5, value: s.ets });
      sl('tiMax', { label: 'TI max', unit: 's', min: 0.5, max: 3, step: 0.1, value: s.tiMax });
      sl('apneaTime', { label: 'Apnétid', unit: 's', min: 5, max: 60, step: 5, value: s.apneaTime });
      add('backupRate', slider({ label: 'Backup frekvens', unit: '/min', min: 4, max: 30, step: 1, value: s.backup.rate, onChange: (v) => applySetting('backupRate', v) }));
      add('backupPcontrol', slider({ label: 'Backup Pcontrol', unit: 'cmH2O', min: 5, max: 40, step: 1, value: s.backup.pcontrol, onChange: (v) => applySetting('backupPcontrol', v) }));
    }
    body.append(h('div', { class: 'hc-section' }, 'Alarm'));
    body.append(slider({ label: 'Pmax (høytrykksgrense, kun varsel)', unit: 'cmH2O', min: 15, max: 70, step: 1, value: ui.pmax, onChange: (v) => { ui.pmax = v; renderStatus(); } }).el);
    body.append(h('p', { class: 'faint', style: { marginTop: '12px', fontSize: '0.85rem' } }, 'Endringer virker fra neste pust, som på en ekte respirator.'));
    if (focusKey) windowEl.querySelector('.highlight')?.scrollIntoView({ block: 'center' });
  }

  function renderMonitor(body) {
    const grid = h('div', { class: 'mon-grid' });
    const tiles = {};
    for (const d of MMP_ALL) {
      const val = h('div', { class: 'mmp-value' }, '–');
      tiles[d.key] = { val, d };
      grid.append(h('div', { class: 'mmp' }, h('div', { class: 'mmp-label' }, h('span', {}, d.label)), val, h('div', { class: 'mmp-unit' }, d.unit)));
    }
    body.append(grid);
    const extra = h('div', { class: 'stack', style: { marginTop: '12px' } });
    body.append(extra);
    monitorRefresh = (m) => {
      for (const [k, t] of Object.entries(tiles)) t.val.textContent = t.d.d === null ? (m[k] ?? '–') : fmt(m[k], t.d.d);
      clear(extra);
      const lb = vent.lastBreath;
      extra.append(h('div', { class: 'muted', style: { fontSize: '0.85rem' } },
        `Siste pust: ${({ mandatory: 'maskinstyrt', triggered: 'pasienttrigget (mandatorisk)', spont: 'spontan (trykkstøtte)', backup: 'backup' })[m.breathType] ?? '–'}`,
        m.cycleReason ? ` · syklet av: ${m.cycleReason}` : '',
        lb?.tiSet ? ` · TI innstilt ${fmt(lb.tiSet, 2)} s` : ''),
        h('div', { class: 'muted', style: { fontSize: '0.85rem' } }, `Pplat målt ved hold: ${fmt(m.pplatMeasured, 1)} · AutoPEEP målt ved hold: ${fmt(m.autoPeepMeasured, 1)}`));
    };
    monitorRefresh(vent.measurements);
  }

  function renderPatient(body) {
    if (ui.task) {
      body.append(h('div', { class: 'placeholder' }, 'Pasientens mekanikk er låst mens en oppgave pågår. Bruk målinger og hold-manøvrer for å finne ut av den.'));
      return;
    }
    const p = vent.patient;
    body.append(h('div', { class: 'hc-section' }, 'Profil'));
    const profRow = h('div', { class: 'btn-group' });
    for (const pr of PROFILES) {
      profRow.append(button(pr.name, { small: true, variant: pr.id === ui.profileId ? 'active' : '', onClick: () => { applyProfile(pr.id); openWindow('patient'); } }));
    }
    body.append(profRow, h('p', { class: 'muted', style: { fontSize: '0.85rem', marginTop: '6px' } }, getProfile(ui.profileId).notes));
    const info = h('div', { class: 'muted', style: { fontSize: '0.9rem', margin: '8px 0' } });
    const refreshInfo = () => {
      const q = vent.patient;
      info.textContent = `IBW ${fmt(idealBodyWeightHamilton(q.height, q.sex), 1)} kg · τinsp ${fmt(timeConstant(q.resistance, q.compliance), 2)} s · τexp ${fmt(timeConstant(q.resistanceExp ?? q.resistance, q.compliance), 2)} s (lungen trenger 3–4 τexp for å tømme seg)`;
    };
    body.append(info);
    const setP = (partial) => { vent.setPatient(partial); ui.profileId = 'egen'; save(); renderTop(); refreshInfo(); };
    body.append(h('div', { class: 'hc-section' }, 'Mekanikk'));
    body.append(slider({ label: 'Compliance', unit: 'ml/cmH2O', min: 5, max: 120, step: 1, value: p.compliance, onChange: (v) => setP({ compliance: v }) }).el);
    body.append(slider({ label: 'Resistance, inspiratorisk', unit: 'cmH2O/(L/s)', min: 2, max: 50, step: 1, value: p.resistance, onChange: (v) => setP({ resistance: v }) }).el);
    body.append(slider({ label: 'Resistance, ekspiratorisk', unit: 'cmH2O/(L/s)', min: 2, max: 60, step: 1, value: p.resistanceExp ?? p.resistance, onChange: (v) => setP({ resistanceExp: v }) }).el);
    body.append(h('div', { class: 'hc-section' }, 'Egen pusteinnsats'));
    body.append(slider({ label: 'Pmus (muskeltrykk)', unit: 'cmH2O', min: 0, max: 25, step: 1, value: p.effort.amplitude, onChange: (v) => setP({ effort: { amplitude: v } }) }).el);
    body.append(slider({ label: 'Egenfrekvens', unit: '/min', min: 6, max: 40, step: 1, value: p.effort.rate, onChange: (v) => setP({ effort: { rate: v } }) }).el);
    body.append(slider({ label: 'Nevral inspirasjonstid', unit: 's', min: 0.4, max: 2, step: 0.1, value: p.effort.duration, onChange: (v) => setP({ effort: { duration: v } }) }).el);
    body.append(h('div', { class: 'hc-section' }, 'Kroppsvekt (IBW)'));
    body.append(slider({ label: 'Høyde', unit: 'cm', min: 140, max: 210, step: 1, value: p.height, onChange: (v) => setP({ height: v }) }).el);
    body.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Kjønn'), segmented({ ariaLabel: 'Kjønn', value: p.sex, options: [{ value: 'M', label: 'Mann' }, { value: 'K', label: 'Kvinne' }], onChange: (v) => setP({ sex: v }) }).el));
    refreshInfo();
  }

  function applyProfile(id) {
    const pr = getProfile(id);
    ui.profileId = id;
    vent.setPatient(structuredClone(pr.patient));
    save();
    renderTop();
    toast(`Pasientprofil: ${pr.name}`, { kind: 'ok' });
  }

  function renderTools(body) {
    const result = h('div', { class: 'feedback info', style: { minHeight: '48px' } }, 'Hold inne knappen. Holdet starter ved neste faseovergang og varer til du slipper (maks 10 s).');
    const mkHold = (type, label) => {
      const btn = h('button', { type: 'button', class: 'hc-btn hc-hold' }, h('span', { class: 'ico' }, '⏸'), label);
      const start = (e) => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); vent.requestHold(type); btn.classList.add('holding'); };
      const stop = () => { if (!btn.classList.contains('holding')) return; vent.releaseHold(); btn.classList.remove('holding'); };
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
      btn.addEventListener('lostpointercapture', stop);
      return btn;
    };
    body.append(h('div', { class: 'hc-section' }, 'Manøvrer'));
    body.append(h('div', { class: 'grid grid-2' }, mkHold('insp', 'Insp. hold (Pplat)'), mkHold('exp', 'Eksp. hold (AutoPEEP)')), result);
    toolsRefresh = () => {
      const r = vent.holdResult;
      if (!r) return;
      clear(result);
      if (vent.holdActive) result.append(h('b', {}, vent.holdActive === 'insp' ? 'Inspiratorisk hold pågår …' : 'Ekspiratorisk hold pågår …'), ` Paw ${fmt(vent.lung.state.paw, 1)} cmH2O`);
      else if (r.type === 'insp') result.append(h('b', {}, `Pplat målt: ${fmt(r.pplat, 1)} cmH2O`), h('div', { class: 'muted' }, `Ppeak − Pplat = ${fmt(vent.measurements.ppeak - r.pplat, 1)} cmH2O (resistiv del). Pplat − PEEPtot = ${fmt(r.pplat - vent.measurements.peepTotal, 1)} cmH2O (drivtrykk, elastisk del).`));
      else result.append(h('b', {}, `PEEP totalt: ${fmt(r.peepTotal, 1)} cmH2O → AutoPEEP ${fmt(r.autoPeep, 1)} cmH2O`), h('div', { class: 'muted' }, `Innstilt PEEP ${vent.settings.peep}. Ekspirasjonsflow ved slutten av TE forteller det samme: når den ikke er null, er det luft igjen.`));
    };
    body.append(h('div', { class: 'hc-section' }, 'Simulering'));
    const speedSeg = segmented({ ariaLabel: 'Hastighet', value: String(ui.speed), options: [{ value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }], onChange: (v) => { ui.speed = Number(v); renderClock(); } });
    body.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Hastighet'), speedSeg.el));
    body.append(h('div', { class: 'row', style: { marginTop: '8px' } },
      button('Nullstill innstillinger', { onClick: () => { vent.setSettings(structuredClone(DEFAULT_SETTINGS)); vent.reset(); save(); refreshAll(); toast('Innstillinger nullstilt'); } }),
      button('Slett lagret fremdrift', { variant: 'danger', onClick: () => { storage.remove('respirator:progress'); progress.tasks = {}; progress.predictions = { correct: 0, total: 0 }; toast('Fremdrift slettet'); } })));
  }
  let toolsRefresh = null;

  // ---------- Oppgaver ----------
  function renderTasks(body) {
    clear(body);
    if (ui.task) {
      const T = ui.task;
      body.append(h('div', { class: 'task-brief' }, h('h3', {}, T.task.title), h('p', {}, T.task.vignette), h('p', {}, h('b', {}, 'Mål: '), T.task.goal)));
      if (T.task.question) {
        body.append(h('div', { class: 'hc-section' }, T.task.question.text));
        const choices = h('div', { class: 'choices' });
        for (const o of T.task.question.options) {
          choices.append(h('button', { type: 'button', class: `choice ${T.answer === o.id ? 'selected' : ''}`, onClick: () => { T.answer = o.id; renderTasks(body); } }, o.label));
        }
        body.append(choices);
      }
      body.append(h('div', { class: 'row', style: { margin: '12px 0' } },
        button('Sjekk oppgaven', { variant: 'primary', onClick: () => checkTask() }),
        button('Avslutt oppgave', { onClick: () => endTask() })));
      if (T.result) {
        body.append(h('div', { class: `feedback ${T.result.ok ? 'correct' : 'wrong'}` }, h('b', {}, T.result.ok ? 'Oppgaven er løst!' : 'Ikke helt ennå.'),
          h('div', { class: 'crit', style: { marginTop: '8px' } }, ...T.result.items.map((i) => h('div', { class: `crit-item ${i.ok ? 'ok' : 'fail'}` }, h('span', {}, i.ok ? '✓' : '✗'), h('div', {}, h('div', {}, i.label), h('small', {}, i.detail)))))));
      }
      const st = progress.predictions;
      body.append(h('p', { class: 'faint', style: { marginTop: '12px', fontSize: '0.85rem' } }, `Forutsigelser: ${st.correct} av ${st.total} riktige.`));
      return;
    }
    body.append(h('p', { class: 'muted' }, 'Velg en oppgave. Underveis må du forutsi hva som skjer før hver endring du gjør.'));
    for (const t of TASKS) {
      const pr = progress.tasks[t.id];
      body.append(h('div', { class: 'task-item' },
        h('h3', {}, t.title, pr?.completed ? h('span', { class: 'badge ok' }, 'løst') : pr?.attempts ? h('span', { class: 'badge' }, `${pr.attempts} forsøk`) : null),
        h('div', { class: 'muted', style: { fontSize: '0.9rem' } }, t.goal),
        h('div', {}, button('Start', { variant: 'primary', small: true, onClick: () => startTask(t) }))));
    }
    const st = progress.predictions;
    body.append(h('p', { class: 'faint', style: { marginTop: '12px', fontSize: '0.85rem' } }, `Forutsigelser så langt: ${st.correct} av ${st.total} riktige.`));
  }

  function startTask(task) {
    const setup = taskSetup(task);
    ui.task = { task, hidden: setup.hidden, answer: null, holdDone: false, result: null };
    vent.setSettings(setup.settings);
    vent.setPatient(setup.patient);
    vent.reset();
    ui.running = true;
    refreshAll();
    openWindow('tasks');
    toast(`Oppgave startet: ${task.title}`, { kind: 'ok' });
  }

  function endTask() {
    ui.task = null;
    applyProfile(ui.profileId === 'egen' ? 'normal' : ui.profileId);
    refreshAll();
    openWindow('tasks');
  }

  function checkTask() {
    const T = ui.task;
    if (!T) return;
    if (vent.time - (vent.lastBreath?.start ?? 0) > 30 || !vent.lastBreath) { toast('Vent til respiratoren har levert noen pust.', { kind: 'warn' }); return; }
    const result = evaluateTask(T.task, { m: vent.measurements, hidden: T.hidden, answer: T.answer, holdDone: T.holdDone });
    T.result = result;
    const pr = progress.tasks[T.task.id] ?? { completed: false, attempts: 0 };
    pr.attempts += 1;
    if (result.ok) pr.completed = true;
    progress.tasks[T.task.id] = pr;
    saveProgress();
    openWindow('tasks');
    toast(result.ok ? 'Riktig – oppgaven er løst!' : 'Se tilbakemeldingen per kriterium.', { kind: result.ok ? 'ok' : 'warn' });
  }

  // ---------- Modaler ----------
  let modalEl = null;
  function openModal(content) {
    closeModal();
    modalEl = h('div', { class: 'hc-modal-backdrop' }, h('div', { class: 'hc-modal', role: 'dialog' }, ...content));
    root.append(modalEl);
  }
  function closeModal() { modalEl?.remove(); modalEl = null; }

  function openModeModal() {
    const opts = Object.values(MODES).map((m) => h('button', { type: 'button', class: `choice ${vent.settings.mode === m.id ? 'selected' : ''}`, onClick: () => { closeModal(); applySetting('mode', m.id); toast(`Modus: ${m.label}`); } },
      h('div', { class: 'mode-option' }, h('b', {}, m.label), h('small', {}, m.description))));
    openModal([h('h3', {}, 'Velg modus'), h('div', { class: 'choices' }, ...opts), h('div', { class: 'row', style: { marginTop: '12px' } }, button('Avbryt', { onClick: closeModal }))]);
  }

  function showPrediction(q, onApply, onCancel) {
    const mm = MEASURES[q.measure];
    const choices = h('div', { class: 'choices' });
    const fb = h('div', {});
    const actions = h('div', { class: 'row', style: { marginTop: '12px' } }, button('Avbryt endringen', { onClick: () => { closeModal(); onCancel?.(); } }));
    for (const o of q.options) {
      choices.append(h('button', { type: 'button', class: 'choice', onClick: (e) => {
        const correct = o.id === q.expected;
        progress.predictions.total += 1;
        if (correct) progress.predictions.correct += 1;
        saveProgress();
        choices.querySelectorAll('.choice').forEach((b) => { b.disabled = true; b.classList.toggle('correct', b.dataset.id === q.expected); });
        e.currentTarget.classList.add(correct ? 'correct' : 'wrong');
        clear(fb);
        fb.append(h('div', { class: `feedback ${correct ? 'correct' : 'wrong'}` },
          h('b', {}, correct ? 'Riktig. ' : `Ikke riktig – ${mm.label} ${q.expected === 'opp' ? 'øker' : q.expected === 'ned' ? 'synker' : 'er omtrent uendret'}. `),
          `Simulert steady state: ${mm.label} ${fmt(q.baseValue, mm.decimals)} → ${fmt(q.expectedValue, mm.decimals)} ${mm.unit}.`,
          h('p', { style: { marginTop: '6px' } }, q.why)));
        clear(actions);
        actions.append(button('Utfør endringen og se på kurvene', { variant: 'primary', onClick: () => { closeModal(); onApply(); } }));
      }, dataset: { id: o.id } }, o.label));
    }
    openModal([h('h3', {}, 'Forutsi først'), h('p', {}, q.text), choices, fb, actions]);
  }

  // ---------- Sideknapper ----------
  const sideBtn = (win, ico, label) => h('button', { type: 'button', class: 'hc-btn', dataset: { win }, onClick: () => openWindow(win) }, h('span', { class: 'ico' }, ico), label);
  const loopsBtn = h('button', { type: 'button', class: `hc-btn ${ui.showLoops ? 'active' : ''}`, onClick: () => { ui.showLoops = !ui.showLoops; loopsBtn.classList.toggle('active', ui.showLoops); applyLoopsLayout(); } }, h('span', { class: 'ico' }, '∞'), 'Sløyfer');
  const runBtn = h('button', { type: 'button', class: 'hc-btn', onClick: () => { ui.running = !ui.running; runBtn.replaceChildren(h('span', { class: 'ico' }, ui.running ? '⏸' : '▶'), ui.running ? 'Pause' : 'Start'); renderStatus(); } }, h('span', { class: 'ico' }, '⏸'), 'Pause');
  side.append(sideBtn('monitor', '📈', 'Monitorering'), sideBtn('controls', '⚙', 'Kontroller'), sideBtn('patient', '🫁', 'Pasient'), sideBtn('tools', '🛠', 'Verktøy'), sideBtn('tasks', '🎯', 'Oppgaver'), loopsBtn, runBtn);
  function applyLoopsLayout() {
    waves.classList.toggle('with-loops', ui.showLoops);
    loops.style.display = ui.showLoops ? '' : 'none';
  }

  // ---------- Simuleringsløkke ----------
  function onSample(s) {
    sc.paw.push(s.t, s.paw);
    sc.flow.push(s.t, s.flow * 60);
    sc.vol.push(s.t, s.volume);
    if (vent.breath !== loopBreathRef) {
      loopBreathRef = vent.breath;
      loopPrev = loopCur;
      loopCur = { pv: [], fv: [] };
    }
    if ((sampleCount++ & 1) === 0) {
      loopCur.pv.push({ x: s.paw, y: s.volume });
      loopCur.fv.push({ x: s.volume, y: s.flow * 60 });
    }
    if (vent.holdResult && vent.holdResult.time !== ui.lastHoldTime) {
      ui.lastHoldTime = vent.holdResult.time;
      if (ui.task && vent.holdResult.type === ui.task.task.requireHold) ui.task.holdDone = true;
      renderStatus();
      toolsRefresh?.();
      ui.lastHoldTime = vent.holdResult.time;
    }
  }

  let lastClockSec = -1;
  function frame(now) {
    if (ui.lastNow === null) ui.lastNow = now;
    const elapsed = Math.min(0.2, (now - ui.lastNow) / 1000);
    ui.lastNow = now;
    if (ui.running) {
      ui.acc += elapsed * ui.speed;
      const dt = vent.dt;
      let n = 0;
      while (ui.acc >= dt && n < 400) { onSample(vent.step()); ui.acc -= dt; n++; }
      if (n >= 400) ui.acc = 0;
    }
    for (const s of Object.values(sc)) s.draw();
    if (ui.showLoops) {
      pvLoop.setData(loopCur.pv, loopPrev.pv); pvLoop.draw();
      fvLoop.setData(loopCur.fv, loopPrev.fv); fvLoop.draw();
    }
    const sec = Math.floor(vent.time);
    if (sec !== lastClockSec) { lastClockSec = sec; renderClock(); if (vent.holdActive) toolsRefresh?.(); }
    ui.raf = requestAnimationFrame(frame);
  }

  function autoRange(m) {
    const [, pMax] = sc.paw.takeExtremes();
    const pHi = Math.max(30, Math.ceil(((Number.isFinite(pMax) ? pMax : m.ppeak) + 5) / 10) * 10);
    sc.paw.setRange(-5, pHi);
    pvLoop.setRanges([0, pHi], null);
    const [fMin, fMax] = sc.flow.takeExtremes();
    const fAbs = Math.max(Math.abs(fMin), Math.abs(fMax));
    const fHi = Math.max(40, Math.ceil((Number.isFinite(fAbs) ? fAbs : 40) / 20) * 20);
    sc.flow.setRange(-fHi, fHi);
    fvLoop.setRanges(null, [-fHi, fHi]);
    const vHi = Math.max(400, Math.ceil((Math.max(m.vti ?? 0, m.vte ?? 0) + 50) / 100) * 100);
    sc.vol.setRange(0, vHi);
    pvLoop.setRanges(null, [0, vHi]);
    fvLoop.setRanges([0, vHi], null);
  }

  const offBreath = vent.onBreath((m) => {
    updateMMP(m);
    autoRange(m);
    renderStatus();
  });

  function refreshAll() {
    renderTop();
    renderSettingsBar();
    updateMMP(vent.measurements);
    renderClock();
    for (const s of Object.values(sc)) s.clear();
  }

  applyLoopsLayout();
  refreshAll();
  ui.raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(ui.raf);
    offBreath();
    for (const s of Object.values(sc)) s.destroy();
    pvLoop.destroy(); fvLoop.destroy();
    closeModal(); closeWindow();
    root.remove();
  };
}
