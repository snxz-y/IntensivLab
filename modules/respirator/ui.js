/**
 * Respiratorsimulator – brukergrensesnitt.
 *
 * Venstre: «respiratoren», lagt opp etter HAMILTON-C6s hovedskjerm (brukerhåndbok kap. 2.2.2):
 *   modus øverst til venstre, fargekodet meldingslinje med Audio pause, MMP-kolonne til venstre
 *   med alarmgrenser, grafikk i midten, vindusknapper til høyre (Alarmer, Kontroller,
 *   Monitorering, Grafikk, Verktøy, Hendelser, System), hurtigknapper og hovedkontroller nederst.
 * Høyre: sidepanel med pasientmonitor, pasientoppsett, situasjoner (meldingsfeed, undersøkelser,
 *   tiltak) og oppgaver. Panelet ligger utenfor respiratorskjermen, så det forsvinner ikke når du
 *   justerer respiratoren.
 */
import { h, clear } from '../../core/ui/dom.js';
import { slider, select, segmented, button, toggle } from '../../core/ui/controls.js';
import { toast } from '../../core/ui/toast.js';
import { fmt } from '../../core/units.js';
import { createScope } from '../../core/charts/scope.js';
import { createLoop } from '../../core/charts/loop.js';
import { createVentilator, MODES, DEFAULT_SETTINGS } from '../../core/sim/ventilator.js';
import { timeConstant, idealBodyWeightHamilton } from '../../core/physiology/respiratory.js';
import { createGasModel } from '../../core/sim/gasModel.js';
import { createVentAudio } from '../../core/audio/ventSounds.js';
import { PROFILES, getProfile } from './profiles.js';
import { TASKS, taskSetup, evaluateTask, predictionFor, MEASURES, settingLabel } from './tasks.js';
import { SITUATIONS, ACTIONS, createSituation, gasForProfile, computeVitals } from './scenarios.js';

const IE_OPTIONS = [
  { value: '2:1', label: '2:1', ie: { i: 2, e: 1 } }, { value: '1.5:1', label: '1,5:1', ie: { i: 1.5, e: 1 } },
  { value: '1:1', label: '1:1', ie: { i: 1, e: 1 } }, { value: '1:1.5', label: '1:1,5', ie: { i: 1, e: 1.5 } },
  { value: '1:2', label: '1:2', ie: { i: 1, e: 2 } }, { value: '1:2.5', label: '1:2,5', ie: { i: 1, e: 2.5 } },
  { value: '1:3', label: '1:3', ie: { i: 1, e: 3 } }, { value: '1:4', label: '1:4', ie: { i: 1, e: 4 } }, { value: '1:5', label: '1:5', ie: { i: 1, e: 5 } },
];
const ieKey = (ie) => (ie.i === 1 ? `1:${ie.e}` : `${ie.i}:1`);
const ieLabel = (ie) => ieKey(ie).replace('.', ',');

/** MMP-er (Hamilton: Ppeak alltid øverst). limits: hvilke alarmgrenser som vises. */
const MMP_MAIN = [
  { key: 'ppeak', label: 'Ppeak', unit: 'cmH2O', d: 0, limits: ['pmax', null] },
  { key: 'peepTotal', label: 'PEEP/CPAP', unit: 'cmH2O', d: 1 },
  { key: 'vte', label: 'VTE', unit: 'ml', d: 0, limits: ['vtHigh', 'vtLow'] },
  { key: 'expMinVol', label: 'ExpMinVol', unit: 'L/min', d: 1, limits: ['mvHigh', 'mvLow'] },
  { key: 'fTotal', label: 'fTotal', unit: 'b/min', d: 0 },
  { key: 'pplat', label: 'Pplateau', unit: 'cmH2O', d: 0 },
  { key: 'autoPeep', label: 'AutoPEEP', unit: 'cmH2O', d: 1 },
  { key: 'petco2', label: 'PetCO2', unit: 'kPa', d: 1 },
  { key: 'spo2', label: 'SpO2', unit: '%', d: 0, limits: [null, 'spo2Low'] },
];
const MMP_ALL = [
  ...MMP_MAIN,
  { key: 'pmean', label: 'Pmean', unit: 'cmH2O', d: 1 },
  { key: 'drivingPressure', label: 'ΔP (drivtrykk)', unit: 'cmH2O', d: 1 },
  { key: 'vti', label: 'VTI', unit: 'ml', d: 0 },
  { key: 'vtPerKg', label: 'Vt/IBW', unit: 'ml/kg', d: 1 },
  { key: 'fSpont', label: 'fSpont', unit: 'b/min', d: 0 },
  { key: 'cstat', label: 'Cstat', unit: 'ml/cmH2O', d: 0 },
  { key: 'rinsp', label: 'Rinsp', unit: 'cmH2O/(L/s)', d: 0 },
  { key: 'rcexp', label: 'RCexp', unit: 's', d: 2 },
  { key: 'ti', label: 'TI', unit: 's', d: 2 }, { key: 'te', label: 'TE', unit: 's', d: 2 },
  { key: 'ieText', label: 'I:E', unit: '', d: null }, { key: 'ibw', label: 'IBW', unit: 'kg', d: 1 },
  { key: 'paco2', label: 'PaCO2 (modell)', unit: 'kPa', d: 1 }, { key: 'pao2', label: 'PaO2 (modell)', unit: 'kPa', d: 1 },
];
const WINDOWS = [
  ['alarms', '🔔', 'Alarmer'], ['controls', '⚙', 'Kontroller'], ['monitor', '📈', 'Monitorering'],
  ['graphics', '📉', 'Grafikk'], ['tools', '🛠', 'Verktøy'], ['events', '📋', 'Hendelser'], ['system', '🖥', 'System'],
];
const WHO = { obs: ['👁', 'Observasjon'], kollega: ['🧑‍⚕️', 'Kollega'], monitor: ['📟', 'Monitor'], respirator: ['🫁', 'Respirator'], handling: ['✋', 'Du'] };

/** Standard Vt ved oppstart: 8 ml/kg IBW (Hamilton-C6: Vt/IBW standard 8 ml/kg, avrundet til 10 ml). */
function startupVt(patient) {
  return Math.max(200, Math.round((8 * idealBodyWeightHamilton(patient.height, patient.sex)) / 10) * 10);
}

export function mountRespirator(container, ctx) {
  const { storage } = ctx;
  const profileId = 'normal';
  const startPatient = structuredClone(getProfile(profileId).patient);
  const vent = createVentilator({ settings: { vt: startupVt(startPatient) }, patient: startPatient });
  const gas = createGasModel(gasForProfile(profileId));
  const audio = createVentAudio();
  audio.setOptions(storage.get('respirator:audio', {}));
  const saveAudio = () => storage.set('respirator:audio', audio.options);
  storage.remove('respirator:state');
  const progress = storage.get('respirator:progress', { tasks: {}, predictions: { correct: 0, total: 0 }, situations: {} });
  progress.situations ??= {};
  const saveProgress = () => storage.set('respirator:progress', progress);

  const ui = {
    running: true, frozen: false, speed: 1, window: null, showLoops: window.innerWidth > 900, profileId,
    raf: 0, acc: 0, lastNow: null, lastHoldTime: null, lastBreathTime: 0,
    task: null, situation: null, tab: 'patient', unread: 0,
    o2Enrich: null, // { until, prev }
    alarms: { mvLow: 3, mvHigh: 15, vtLow: 200, vtHigh: 1000, spo2Low: 90, apnea: 20 },
    activeAlarms: [], events: [],
  };

  // ======================= DOM-skjelett =======================
  const modeBtn = h('button', { class: 'hc-mode', type: 'button', onClick: () => openModeModal() });
  const msgBar = h('div', { class: 'hc-msg' });
  const clockBox = h('div', { class: 'hc-clock' });
  const mmpCol = h('div', { class: 'hc-mmp' });
  const curves = h('div', { class: 'hc-curves' });
  const loops = h('div', { class: 'hc-loops' });
  const waves = h('div', { class: 'hc-waves' }, curves, loops);
  const side = h('div', { class: 'hc-side' });
  const quick = h('div', { class: 'hc-quick' });
  const settingsBar = h('div', { class: 'hc-settings' });
  const hc = h('div', { class: 'hc' },
    h('div', { class: 'hc-top' }, modeBtn, msgBar, clockBox),
    mmpCol, waves, side, h('div', { class: 'hc-bottom' }, quick, settingsBar));

  const pmon = h('div', { class: 'pmon', 'aria-label': 'Pasientmonitor' });
  const sideTabs = h('div', { class: 'side-tabs' });
  const sideBody = h('div', { class: 'side-body' });
  const panel = h('aside', { class: 'side-panel' }, pmon, sideTabs, sideBody);
  const root = h('div', { class: 'lab' }, hc, panel);
  container.append(root);

  // ======================= Kurver =======================
  const cssColor = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff';
  const sc = {
    paw: createScope(h('div', {}), { label: 'Paw', unit: 'cmH2O', color: cssColor('--curve-pressure'), range: [-5, 40], sweepSeconds: 11 }),
    flow: createScope(h('div', {}), { label: 'Flow', unit: 'l/min', color: cssColor('--curve-flow'), range: [-60, 60], sweepSeconds: 11 }),
    vol: createScope(h('div', {}), { label: 'Volum', unit: 'ml', color: cssColor('--curve-volume'), range: [0, 600], sweepSeconds: 11 }),
  };
  curves.append(...Object.values(sc).map((s) => s.wrap));
  const pvLoop = createLoop(h('div', {}), { title: 'Trykk/volum', xLabel: 'Paw cmH2O / Volum ml', color: cssColor('--curve-pressure'), xRange: [0, 40], yRange: [0, 600] });
  const fvLoop = createLoop(h('div', {}), { title: 'Volum/flow', xLabel: 'Volum ml / Flow l/min', color: cssColor('--curve-flow'), xRange: [0, 600], yRange: [-60, 60] });
  loops.append(pvLoop.wrap, fvLoop.wrap);
  let loopCur = { pv: [], fv: [] }, loopPrev = { pv: [], fv: [] }, loopBreathRef = null, sampleCount = 0;

  function updateMarkers() {
    sc.paw.setMarkers([{ value: vent.settings.pmax, color: '#e53935' }, { value: vent.settings.pmax - 10, color: '#4cc2ff', dash: [2, 4] }]);
  }

  // ======================= MMP =======================
  const mmpTiles = {};
  for (const m of MMP_MAIN) {
    const val = h('div', { class: 'mmp-value' }, '–');
    const lim = h('div', { class: 'mmp-limits' });
    const el = h('div', { class: 'mmp', onClick: () => openWindow('alarms', m.key) },
      h('div', { class: 'mmp-main' }, h('div', { class: 'mmp-label' }, m.label, h('span', { class: 'mmp-unit' }, m.unit)), val), lim);
    mmpTiles[m.key] = { el, val, lim, def: m };
    mmpCol.append(el);
  }
  const withGas = (m) => ({ ...m, spo2: gas.state.spo2 * 100, petco2: vent.disconnected ? 0 : gas.petco2, paco2: gas.state.paco2, pao2: gas.state.pao2 });
  function limitValue(key) { return key === 'pmax' ? vent.settings.pmax : ui.alarms[key]; }
  function updateMMP(mRaw) {
    const m = withGas(mRaw);
    const alarmByKey = {};
    for (const a of ui.activeAlarms) if (a.mmp) alarmByKey[a.mmp] = a.priority === 'high' ? 'high' : (alarmByKey[a.mmp] ?? 'medium');
    for (const [key, t] of Object.entries(mmpTiles)) {
      const v = m[key];
      let cls = 'mmp';
      if (alarmByKey[key]) cls += ` alarm-${alarmByKey[key]}`;
      if (key === 'pplat' && m.pplatMeasured != null) cls += ' measured';
      if (key === 'autoPeep' && m.autoPeepMeasured != null) cls += ' measured';
      t.val.textContent = t.def.d === null ? (v ?? '–') : fmt(v, t.def.d);
      t.el.className = cls;
      if (t.def.limits) {
        const [hi, lo] = t.def.limits;
        t.lim.replaceChildren(h('span', {}, hi ? String(limitValue(hi)) : ''), h('span', {}, lo ? String(limitValue(lo)) : ''));
      }
    }
    monitorRefresh?.(m);
  }
  let monitorRefresh = null;

  // ======================= Alarmer og meldingslinje =======================
  function evaluateAlarms() {
    const m = vent.measurements;
    const s = vent.settings;
    const list = [];
    const hasBreath = m.breathType !== null;
    if (vent.disconnected || (hasBreath && m.ppeak < m.peep + 2 && s.mode !== 'SPONT')) list.push({ id: 'disc', text: 'Frakobling / lavt trykk', priority: 'high', mmp: 'ppeak' });
    if (m.highPressure || (m.ppeak !== null && m.ppeak >= s.pmax)) list.push({ id: 'phigh', text: 'Høyt trykk', priority: 'high', mmp: 'ppeak' });
    if (hasBreath && m.expMinVol < ui.alarms.mvLow) list.push({ id: 'mvlow', text: 'ExpMinVol lav', priority: 'high', mmp: 'expMinVol' });
    if (hasBreath && m.expMinVol > ui.alarms.mvHigh) list.push({ id: 'mvhigh', text: 'ExpMinVol høy', priority: 'high', mmp: 'expMinVol' });
    if (vent.backupActive || (vent.time - ui.lastBreathTime > ui.alarms.apnea && vent.time > ui.alarms.apnea)) list.push({ id: 'apnea', text: 'Apné', priority: 'high' });
    if (gas.state.spo2 * 100 < ui.alarms.spo2Low) list.push({ id: 'spo2', text: `SpO2 lav (${fmt(gas.state.spo2 * 100, 0)} %)`, priority: 'high', mmp: 'spo2' });
    if (hasBreath && !vent.disconnected && m.vte < ui.alarms.vtLow) list.push({ id: 'vtlow', text: 'Vt lav', priority: 'medium', mmp: 'vte' });
    if (hasBreath && m.vte > ui.alarms.vtHigh) list.push({ id: 'vthigh', text: 'Vt høy', priority: 'medium', mmp: 'vte' });
    if (m.pressureLimited) list.push({ id: 'plimit', text: 'Trykkbegrensning', priority: 'medium', mmp: 'ppeak' });
    // hendelseslogg ved endring
    const prev = new Set(ui.activeAlarms.map((a) => a.id));
    const now = new Set(list.map((a) => a.id));
    for (const a of list) if (!prev.has(a.id)) logEvent(`Alarm: ${a.text}`, a.priority);
    for (const a of ui.activeAlarms) if (!now.has(a.id)) logEvent(`Alarm avsluttet: ${a.text}`, '');
    ui.activeAlarms = list;
    return list;
  }

  function renderMsgBar() {
    const list = ui.activeAlarms;
    const high = list.some((a) => a.priority === 'high');
    audio.setAlarm(list.length ? (high ? 'high' : 'medium') : null);
    msgBar.className = `hc-msg ${list.length ? (high ? 'high' : 'medium') : ''}`;
    clear(msgBar);
    const text = list.length ? list.map((a) => a.text).join(' · ') : (ui.o2Enrich ? `O2-anrikning: ${fmt(Math.max(0, ui.o2Enrich.until - vent.time), 0)} s igjen` : '');
    msgBar.append(h('span', { class: 'hc-msg-text' }, text));
    if (audio.enabled && (list.length || audio.silenced)) {
      const left = audio.silencedFor;
      msgBar.append(button(audio.silenced ? `🔕 ${fmt(left, 0)} s` : '🔔 Audio pause', { small: true, onClick: () => { audio.silenced ? audio.unsilence() : audio.silence(120); renderMsgBar(); } }));
    }
    side.querySelector('[data-win="alarms"]')?.classList.toggle('alarming', high);
  }

  function logEvent(text, priority = '') {
    ui.events.unshift({ t: vent.time, text, priority });
    if (ui.events.length > 200) ui.events.length = 200;
    if (ui.window === 'events') openWindow('events', true);
  }

  // ======================= Topplinje =======================
  function renderTop() {
    const s = vent.settings;
    clear(modeBtn);
    modeBtn.append(h('div', { class: 'hc-mode-name' }, MODES[s.mode].label), h('div', { class: 'hc-mode-sub' }, `Voksen · IBW ${fmt(idealBodyWeightHamilton(vent.patient.height, vent.patient.sex), 0)} kg`));
    renderMsgBar();
  }
  function renderClock() {
    const t = vent.time;
    clockBox.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    clockBox.append(h('small', {}, ui.speed === 1 ? 'simulert tid' : `${ui.speed}× hastighet`));
  }

  // ======================= Hovedkontroller nederst =======================
  function settingDefs() {
    const s = vent.settings;
    const common = [{ key: 'fio2', label: 'Oksygen', value: s.fio2, unit: '%' }, { key: 'peep', label: 'PEEP/CPAP', value: s.peep, unit: 'cmH2O' }];
    const timing = s.timingMode === 'ie' ? { key: 'ie', label: 'I:E', value: ieLabel(s.ie), unit: '' } : { key: 'ti', label: 'TI', value: s.ti.toFixed(2), unit: 's' };
    const trig = { key: 'trigger', label: s.trigger.type === 'flow' ? 'Trigger (flow)' : 'Trigger (trykk)', value: s.trigger.type === 'flow' ? s.trigger.value : `-${s.trigger.value}`, unit: s.trigger.type === 'flow' ? 'l/min' : 'cmH2O' };
    if (s.mode === 'SCMV') return [...common, { key: 'rate', label: 'Rate', value: s.rate, unit: 'b/min' }, { key: 'vt', label: 'Vt', value: s.vt, unit: 'ml' }, timing, { key: 'tip', label: 'Pause', value: s.tip, unit: '%' }, { key: 'flowPattern', label: 'Flowmønster', value: s.flowPattern === 'decel' ? 'Desel.' : 'Firkant', unit: '' }, trig];
    if (s.mode === 'PCV') return [...common, { key: 'rate', label: 'Rate', value: s.rate, unit: 'b/min' }, { key: 'pcontrol', label: 'ΔPcontrol', value: s.pcontrol, unit: 'cmH2O' }, timing, { key: 'pramp', label: 'P-ramp', value: s.pramp, unit: 'ms' }, trig];
    return [...common, { key: 'psupport', label: 'ΔPsupport', value: s.psupport, unit: 'cmH2O' }, { key: 'pramp', label: 'P-ramp', value: s.pramp, unit: 'ms' }, { key: 'ets', label: 'ETS', value: s.ets, unit: '%' }, trig, { key: 'tiMax', label: 'TI max', value: s.tiMax, unit: 's' }];
  }
  function renderSettingsBar() {
    clear(settingsBar);
    for (const d of settingDefs()) {
      settingsBar.append(h('button', { type: 'button', class: 'hc-set', dataset: { key: d.key }, onClick: () => openWindow('controls', d.key) },
        h('span', { class: 'set-label' }, d.label), h('span', { class: 'set-value' }, String(d.value)), h('span', { class: 'set-unit' }, d.unit)));
    }
  }

  // ======================= Endring av innstillinger =======================
  function applySetting(key, value, { silent = false } = {}) {
    const s = vent.settings;
    const before = key === 'ie' ? ieLabel(s.ie) : key === 'triggerValue' ? s.trigger.value : key === 'backupRate' ? s.backup.rate : key === 'backupPcontrol' ? s.backup.pcontrol : s[key];
    const partial = {};
    if (key === 'ie') { partial.ie = value; partial.timingMode = 'ie'; }
    else if (key === 'ti') { partial.ti = value; partial.timingMode = 'ti'; }
    else if (key === 'triggerType') partial.trigger = { type: value, value: 2 };
    else if (key === 'triggerValue') partial.trigger = { ...s.trigger, value };
    else if (key === 'backupRate') partial.backup = { ...s.backup, rate: value };
    else if (key === 'backupPcontrol') partial.backup = { ...s.backup, pcontrol: value };
    else partial[key] = value;
    vent.setSettings(partial);
    const after = key === 'ie' ? ieLabel(value) : key === 'mode' ? MODES[value].label : value;
    if (!silent) logEvent(`${settingLabel(key)}: ${key === 'mode' ? MODES[before]?.label ?? before : before} → ${after}`);
    updateMarkers();
    renderSettingsBar();
    renderTop();
  }
  const PREDICTABLE = new Set(['vt', 'rate', 'peep', 'ie', 'ti', 'pcontrol', 'psupport', 'tip', 'flowPattern']);
  function changeSetting(key, value, revert) {
    const s = vent.settings;
    const oldValue = key === 'ie' ? s.ie : s[key];
    if (ui.task && PREDICTABLE.has(key)) {
      const q = predictionFor({ key, oldValue, newValue: value, settings: s, patient: vent.patient, focus: ui.task.task.focus });
      if (q) { showPrediction(q, () => applySetting(key, value), revert); return; }
    }
    applySetting(key, value);
  }

  // ======================= Vinduer på respiratoren =======================
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
    hc.append(windowEl);
    const title = Object.fromEntries(WINDOWS.map(([id, , label]) => [id, label]))[name];
    head.append(h('h2', {}, title), h('button', { class: 'hc-close', type: 'button', 'aria-label': 'Lukk', onClick: closeWindow }, '✕'));
    ({ alarms: renderAlarms, controls: renderControls, monitor: renderMonitor, graphics: renderGraphics, tools: renderTools, events: renderEvents, system: renderSystem })[name](body, focusKey === true ? null : focusKey);
  }

  function renderAlarms(body, focusKey) {
    const mk = (label, key, unit, min, max, step) => {
      const ctl = slider({ label, unit, min, max, step, value: key === 'pmax' ? vent.settings.pmax : ui.alarms[key], onChange: (v) => { if (key === 'pmax') applySetting('pmax', v); else { ui.alarms[key] = v; logEvent(`Alarmgrense ${label}: ${v}`); } updateMMP(vent.measurements); } });
      if (focusKey && ((focusKey === 'ppeak' && key === 'pmax') || (focusKey === 'vte' && key.startsWith('vt')) || (focusKey === 'expMinVol' && key.startsWith('mv')) || (focusKey === 'spo2' && key === 'spo2Low'))) ctl.el.classList.add('highlight');
      body.append(ctl.el);
    };
    body.append(h('div', { class: 'hc-section' }, 'Grenser 1'));
    mk('Trykk høy (Pmax)', 'pmax', 'cmH2O', 15, 70, 1);
    body.append(h('p', { class: 'faint', style: { fontSize: '0.82rem' } }, `Plimit = Pmax − 10 = ${vent.settings.pmax - 10} cmH2O: respiratoren begrenser levert trykk her. Ved Pmax åpnes ekspirasjonsventilen (høyprioritetsalarm).`));
    mk('ExpMinVol lav', 'mvLow', 'L/min', 0.5, 20, 0.5);
    mk('ExpMinVol høy', 'mvHigh', 'L/min', 2, 40, 0.5);
    mk('Vt lav', 'vtLow', 'ml', 50, 1000, 10);
    mk('Vt høy', 'vtHigh', 'ml', 100, 2000, 10);
    body.append(h('div', { class: 'hc-section' }, 'Grenser 2'));
    mk('Apnétid', 'apnea', 's', 5, 60, 5);
    mk('SpO2 lav', 'spo2Low', '%', 70, 99, 1);
    body.append(h('div', { class: 'hc-section' }, 'Aktive alarmer'));
    body.append(ui.activeAlarms.length ? h('div', { class: 'event-list' }, ...ui.activeAlarms.map((a) => h('div', { class: `ev ${a.priority}` }, h('time', {}, a.priority === 'high' ? 'HØY' : 'MIDDELS'), h('span', {}, a.text)))) : h('p', { class: 'muted' }, 'Ingen aktive alarmer.'));
    if (focusKey) windowEl.querySelector('.highlight')?.scrollIntoView({ block: 'center' });
  }

  function renderControls(body, focusKey) {
    const s = vent.settings;
    const add = (key, ctl) => { if (key === focusKey) ctl.el.classList.add('highlight'); body.append(ctl.el); return ctl; };
    const sl = (key, opts) => add(key, slider({ ...opts, onChange: (v) => changeSetting(key, v, () => {}) }));
    body.append(h('div', { class: 'hc-section' }, `${MODES[s.mode].label} – kontroller`));
    sl('fio2', { label: 'Oksygen', unit: '%', min: 21, max: 100, step: 1, value: s.fio2 });
    sl('peep', { label: 'PEEP/CPAP', unit: 'cmH2O', min: 0, max: 25, step: 1, value: s.peep });
    if (s.mode !== 'SPONT') sl('rate', { label: 'Rate', unit: 'b/min', min: 4, max: 40, step: 1, value: s.rate });
    if (s.mode === 'SCMV') sl('vt', { label: 'Vt', unit: 'ml', min: 100, max: 1000, step: 10, value: s.vt });
    if (s.mode === 'PCV') sl('pcontrol', { label: 'ΔPcontrol (over PEEP)', unit: 'cmH2O', min: 2, max: 50, step: 1, value: s.pcontrol });
    if (s.mode === 'SPONT') sl('psupport', { label: 'ΔPsupport (over PEEP)', unit: 'cmH2O', min: 0, max: 40, step: 1, value: s.psupport });
    if (s.mode !== 'SPONT') {
      body.append(h('div', { class: 'hc-section' }, 'Tid'));
      body.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Still inn via'), segmented({ ariaLabel: 'Tidsinnstilling', value: s.timingMode, options: [{ value: 'ie', label: 'I:E' }, { value: 'ti', label: 'TI' }], onChange: (v) => { applySetting('timingMode', v, { silent: true }); openWindow('controls', v); } }).el));
      if (s.timingMode === 'ie') add('ie', select({ label: 'I:E', value: ieKey(s.ie), options: IE_OPTIONS, onChange: (v) => changeSetting('ie', IE_OPTIONS.find((o) => o.value === v).ie, () => {}) }));
      else sl('ti', { label: 'TI', unit: 's', min: 0.3, max: 3, step: 0.05, value: s.ti });
      if (s.mode === 'SCMV') {
        sl('tip', { label: 'Pause (% av syklustid)', unit: '%', min: 0, max: 30, step: 5, value: s.tip });
        add('flowPattern', segmented({ ariaLabel: 'Flowmønster', value: s.flowPattern, options: [{ value: 'square', label: 'Firkant' }, { value: 'decel', label: 'Deselererende 50 %' }], onChange: (v) => changeSetting('flowPattern', v, () => {}) }));
      }
    }
    if (s.mode !== 'SCMV') { body.append(h('div', { class: 'hc-section' }, 'Trykkstigning')); sl('pramp', { label: 'P-ramp', unit: 'ms', min: 0, max: 400, step: 25, value: s.pramp }); }
    body.append(h('div', { class: 'hc-section' }, 'Trigger'));
    add('trigger', segmented({ ariaLabel: 'Triggertype', value: s.trigger.type, options: [{ value: 'flow', label: 'Flow' }, { value: 'pressure', label: 'Trykk' }], onChange: (v) => { applySetting('triggerType', v); openWindow('controls', 'trigger'); } }));
    if (s.trigger.type === 'flow') add('trigger', slider({ label: 'Flowtrigger', unit: 'l/min', min: 0.5, max: 15, step: 0.5, value: s.trigger.value, onChange: (v) => applySetting('triggerValue', v) }));
    else add('trigger', slider({ label: 'Trykktrigger (under PEEP)', unit: 'cmH2O', min: 0.5, max: 10, step: 0.5, value: s.trigger.value, onChange: (v) => applySetting('triggerValue', v) }));
    if (s.mode === 'SPONT') {
      body.append(h('div', { class: 'hc-section' }, 'Syklus og apné-backup'));
      sl('ets', { label: 'ETS', unit: '% av toppflow', min: 5, max: 70, step: 5, value: s.ets });
      sl('tiMax', { label: 'TI max', unit: 's', min: 0.5, max: 3, step: 0.1, value: s.tiMax });
      sl('apneaTime', { label: 'Apnétid (backup)', unit: 's', min: 5, max: 60, step: 5, value: s.apneaTime });
      add('backupRate', slider({ label: 'Backup rate', unit: 'b/min', min: 4, max: 30, step: 1, value: s.backup.rate, onChange: (v) => applySetting('backupRate', v) }));
      add('backupPcontrol', slider({ label: 'Backup ΔPinsp', unit: 'cmH2O', min: 5, max: 40, step: 1, value: s.backup.pcontrol, onChange: (v) => applySetting('backupPcontrol', v) }));
    }
    body.append(h('p', { class: 'faint', style: { marginTop: '12px', fontSize: '0.85rem' } }, 'Endringer virker fra neste pust.'));
    if (focusKey) windowEl.querySelector('.highlight')?.scrollIntoView({ block: 'center' });
  }

  function renderMonitor(body) {
    const grid = h('div', { class: 'mon-grid' });
    const tiles = {};
    for (const d of MMP_ALL) {
      const val = h('div', { class: 'mmp-value' }, '–');
      tiles[d.key] = { val, d };
      grid.append(h('div', { class: 'mmp' }, h('div', { class: 'mmp-main' }, h('div', { class: 'mmp-label' }, d.label, h('span', { class: 'mmp-unit' }, d.unit)), val)));
    }
    const extra = h('div', { class: 'muted', style: { marginTop: '10px', fontSize: '0.85rem' } });
    body.append(grid, extra);
    monitorRefresh = (m) => {
      for (const [k, t] of Object.entries(tiles)) t.val.textContent = t.d.d === null ? (m[k] ?? '–') : fmt(m[k], t.d.d);
      extra.textContent = `Siste pust: ${({ mandatory: 'maskinstyrt', triggered: 'pasienttrigget (mandatorisk)', spont: 'spontan (trykkstøtte)', backup: 'backup' })[m.breathType] ?? '–'}${m.cycleReason ? ` · syklet av ${m.cycleReason}` : ''}. Pplat målt ved hold: ${fmt(m.pplatMeasured, 1)} · AutoPEEP målt ved hold: ${fmt(m.autoPeepMeasured, 1)}.`;
    };
    monitorRefresh(withGas(vent.measurements));
  }

  function renderGraphics(body) {
    body.append(h('div', { class: 'hc-section' }, 'Tidsskala (s)'));
    body.append(segmented({ ariaLabel: 'Tidsskala', value: String(sc.paw.sweep ?? 11), options: [{ value: '5.5', label: '5,5' }, { value: '11', label: '11' }, { value: '22', label: '22' }, { value: '33', label: '33' }], onChange: (v) => { for (const s of Object.values(sc)) { s.setSweep(Number(v)); s.sweep = Number(v); } } }).el);
    body.append(h('p', { class: 'faint', style: { fontSize: '0.85rem' } }, 'Hamilton-C6 bruker 22 s som standard for voksne; her er 11 s valgt fordi skjermen er mindre.'));
    body.append(h('div', { class: 'hc-section' }, 'Oppsett'));
    body.append(toggle({ label: 'Vis sløyfer (trykk/volum, volum/flow)', checked: ui.showLoops, onChange: (v) => { ui.showLoops = v; applyLoopsLayout(); } }).el);
  }

  function renderTools(body) {
    const result = h('div', { class: 'feedback info', style: { minHeight: '48px' } }, 'Hold inne knappen. Holdet starter ved neste faseovergang og varer til du slipper (maks 10 s).');
    const mkHold = (type, label) => {
      const btn = h('button', { type: 'button', class: 'hc-btn hc-hold' }, h('span', { class: 'ico' }, '⏸'), label);
      const start = (e) => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); vent.requestHold(type); btn.classList.add('holding'); };
      const stop = () => { if (!btn.classList.contains('holding')) return; vent.releaseHold(); btn.classList.remove('holding'); };
      btn.addEventListener('pointerdown', start); btn.addEventListener('pointerup', stop); btn.addEventListener('pointercancel', stop); btn.addEventListener('lostpointercapture', stop);
      return btn;
    };
    body.append(h('div', { class: 'hc-section' }, 'Manøvrer'));
    body.append(h('div', { class: 'grid grid-2' }, mkHold('insp', 'Insp. hold (Pplateau)'), mkHold('exp', 'Eksp. hold (AutoPEEP)')), result);
    toolsRefresh = () => {
      const r = vent.holdResult; if (!r) return;
      clear(result);
      if (vent.holdActive) result.append(h('b', {}, vent.holdActive === 'insp' ? 'Inspiratorisk hold pågår …' : 'Ekspiratorisk hold pågår …'), ` Paw ${fmt(vent.lung.state.paw, 1)} cmH2O`);
      else if (r.type === 'insp') result.append(h('b', {}, `Pplateau målt: ${fmt(r.pplat, 1)} cmH2O`), h('div', { class: 'muted' }, `Ppeak − Pplat = ${fmt(vent.measurements.ppeak - r.pplat, 1)} (resistiv del). Pplat − PEEPtot = ${fmt(r.pplat - vent.measurements.peepTotal, 1)} (drivtrykk).`));
      else result.append(h('b', {}, `PEEP totalt: ${fmt(r.peepTotal, 1)} cmH2O → AutoPEEP ${fmt(r.autoPeep, 1)} cmH2O`), h('div', { class: 'muted' }, `Innstilt PEEP ${vent.settings.peep}.`));
    };
    body.append(h('div', { class: 'hc-section' }, 'Annet'));
    body.append(h('div', { class: 'row' },
      button('Manuell pust', { onClick: () => { if (vent.manualBreath()) logEvent('Manuell pust'); else toast('Vent til ekspirasjonsfasen.', { kind: 'warn' }); } }),
      button(ui.o2Enrich ? 'Avbryt O2-anrikning' : 'O2-anrikning (100 % i 2 min)', { onClick: () => { toggleO2Enrich(); openWindow('tools', true); } })));
    body.append(h('div', { class: 'hc-section' }, 'Simulering'));
    body.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Hastighet'), segmented({ ariaLabel: 'Hastighet', value: String(ui.speed), options: [{ value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }], onChange: (v) => { ui.speed = Number(v); renderClock(); } }).el));
  }
  let toolsRefresh = null;

  function renderEvents(body) {
    if (!ui.events.length) { body.append(h('p', { class: 'muted' }, 'Ingen hendelser ennå. Alarmer, innstillingsendringer og manøvrer logges her.')); return; }
    body.append(h('div', { class: 'event-list' }, ...ui.events.map((e) => h('div', { class: `ev ${e.priority}` }, h('time', {}, `${String(Math.floor(e.t / 60)).padStart(2, '0')}:${String(Math.floor(e.t % 60)).padStart(2, '0')}`), h('span', {}, e.text)))));
  }

  function renderSystem(body) {
    body.append(h('div', { class: 'hc-section' }, 'Lyd'));
    const o = audio.options;
    const setO = (p) => { audio.setOptions(p); saveAudio(); };
    body.append(h('p', { class: 'faint', style: { fontSize: '0.85rem' } }, audio.enabled ? 'Lyd er på.' : 'Slå på lyd med «Lyd»-knappen nederst (nettleseren krever et trykk først).'));
    body.append(slider({ label: 'Volum', unit: '', min: 0, max: 1, step: 0.05, value: o.volume, onChange: (v) => setO({ volume: v }) }).el);
    body.append(h('div', { class: 'row' },
      toggle({ label: 'Pustelyd', checked: o.breath, onChange: (v) => setO({ breath: v }) }).el,
      toggle({ label: 'Alarmer', checked: o.alarms, onChange: (v) => setO({ alarms: v }) }).el,
      toggle({ label: 'Pulstone (SpO2)', checked: o.pulse, onChange: (v) => setO({ pulse: v }) }).el));
    body.append(h('div', { class: 'hc-section' }, 'Nullstilling'));
    body.append(h('div', { class: 'row' },
      button('Nullstill innstillinger', { onClick: () => { vent.setSettings({ ...structuredClone(DEFAULT_SETTINGS), vt: startupVt(vent.patient) }); vent.reset(); logEvent('Innstillinger nullstilt'); refreshAll(); } }),
      button('Slett lagret fremdrift', { variant: 'danger', onClick: () => { storage.remove('respirator:progress'); progress.tasks = {}; progress.situations = {}; progress.predictions = { correct: 0, total: 0 }; toast('Fremdrift slettet'); } })));
    body.append(h('div', { class: 'hc-section' }, 'Om'));
    body.append(h('p', { class: 'muted', style: { fontSize: '0.9rem' } }, 'Læringsverktøy, ikke til klinisk bruk. Skjermen er lagt opp etter HAMILTON-C6s hovedskjerm (brukerhåndbok kap. 2.2.2), men er ikke en gjengivelse av programvaren. Formler og kilder: ', h('a', { href: './KILDER.md', target: '_blank' }, 'KILDER.md'), '.'));
  }

  // ======================= Hurtigknapper og vindusknapper =======================
  const soundBtn = h('button', { type: 'button', class: 'hc-btn', onClick: async () => {
    if (audio.enabled) audio.disable();
    else if (!(await audio.enable())) { toast('Nettleseren støtter ikke lyd her.', { kind: 'warn' }); return; }
    soundBtn.classList.toggle('on', audio.enabled);
    soundBtn.replaceChildren(h('span', { class: 'ico' }, audio.enabled ? '🔊' : '🔇'), 'Lyd');
    renderMsgBar();
  } }, h('span', { class: 'ico' }, '🔇'), 'Lyd');
  const freezeBtn = h('button', { type: 'button', class: 'hc-btn', onClick: () => { ui.frozen = !ui.frozen; freezeBtn.classList.toggle('on', ui.frozen); hc.classList.toggle('frozen', ui.frozen); } }, h('span', { class: 'ico' }, '❄'), 'Frys');
  const o2Btn = h('button', { type: 'button', class: 'hc-btn', onClick: () => toggleO2Enrich() }, h('span', { class: 'ico' }, 'O₂'), '100 % 2 min');
  const breathBtn = h('button', { type: 'button', class: 'hc-btn', onClick: () => { if (vent.manualBreath()) logEvent('Manuell pust'); } }, h('span', { class: 'ico' }, '💨'), 'Man. pust');
  const runBtn = h('button', { type: 'button', class: 'hc-btn', onClick: () => { ui.running = !ui.running; runBtn.replaceChildren(h('span', { class: 'ico' }, ui.running ? '⏸' : '▶'), ui.running ? 'Pause' : 'Start'); } }, h('span', { class: 'ico' }, '⏸'), 'Pause');
  quick.append(breathBtn, o2Btn, freezeBtn, soundBtn, runBtn);
  for (const [id, ico, label] of WINDOWS) side.append(h('button', { type: 'button', class: 'hc-btn', dataset: { win: id }, onClick: () => openWindow(id) }, h('span', { class: 'ico' }, ico), label));

  function toggleO2Enrich() {
    if (ui.o2Enrich) { applySetting('fio2', ui.o2Enrich.prev, { silent: true }); ui.o2Enrich = null; logEvent('O2-anrikning avbrutt'); o2Btn.classList.remove('on'); }
    else { ui.o2Enrich = { until: vent.time + 120, prev: vent.settings.fio2 }; applySetting('fio2', 100, { silent: true }); logEvent('O2-anrikning: 100 % i 2 min'); o2Btn.classList.add('on'); }
    renderMsgBar();
  }
  function applyLoopsLayout() { waves.classList.toggle('with-loops', ui.showLoops); loops.style.display = ui.showLoops ? '' : 'none'; }

  // ======================= Sidepanel =======================
  function renderTabs() {
    clear(sideTabs);
    for (const [id, label] of [['patient', 'Pasient'], ['situations', 'Situasjoner'], ['tasks', 'Oppgaver']]) {
      sideTabs.append(h('button', { type: 'button', class: ui.tab === id ? 'active' : '', onClick: () => { ui.tab = id; if (id === 'situations') ui.unread = 0; renderTabs(); renderSide(); } }, label,
        id === 'situations' && ui.unread && ui.tab !== id ? h('span', { class: 'badge danger' }, String(ui.unread)) : null));
    }
  }
  function renderSide() {
    clear(sideBody);
    ({ patient: renderPatientTab, situations: renderSituationsTab, tasks: renderTasksTab })[ui.tab](sideBody);
  }

  function currentVitals() {
    if (ui.situation) return ui.situation.sit.vitals({ gas: gas.state });
    return computeVitals({ hr: 78, sys: 122, dia: 68, temp: 37.1 }, null, 0, gas.state.spo2);
  }
  function renderMonitorPanel() {
    const v = currentVitals();
    const spo2 = gas.state.spo2 * 100;
    const pv = (cls, label, value, alarm = false) => h('div', { class: `pv ${cls} ${alarm ? 'alarm' : ''}` }, h('span', { class: 'pv-label' }, label), h('span', { class: 'pv-value' }, value));
    pmon.replaceChildren(
      pv('spo2', 'SpO2 %', fmt(spo2, 0), spo2 < ui.alarms.spo2Low),
      pv('hr', 'Puls', String(v.hr), v.hr > 120),
      pv('bp', 'BT', `${v.sys}/${v.dia}`, v.sys < 90),
      pv('rf', 'RF', fmt(vent.measurements.fTotal, 0)),
      pv('temp', 'Temp', fmt(v.temp, 1)),
    );
  }

  function renderPatientTab(body) {
    if (ui.task || ui.situation) {
      body.append(h('div', { class: 'placeholder' }, 'Pasienten er låst mens en oppgave eller situasjon pågår. Bruk målinger, hold-manøvrer og undersøkelser.'));
      return;
    }
    const p = vent.patient;
    body.append(h('div', { class: 'hc-section' }, 'Profil'));
    const profRow = h('div', { class: 'btn-group' });
    for (const pr of PROFILES) profRow.append(button(pr.name, { small: true, variant: pr.id === ui.profileId ? 'active' : '', onClick: () => { applyProfile(pr.id); renderSide(); } }));
    body.append(profRow, h('p', { class: 'muted', style: { fontSize: '0.85rem', marginTop: '6px' } }, getProfile(ui.profileId).notes));
    const info = h('div', { class: 'muted', style: { fontSize: '0.9rem', margin: '8px 0' } });
    const refreshInfo = () => { const q = vent.patient; info.textContent = `IBW ${fmt(idealBodyWeightHamilton(q.height, q.sex), 1)} kg · τinsp ${fmt(timeConstant(q.resistance, q.compliance), 2)} s · τexp ${fmt(timeConstant(q.resistanceExp ?? q.resistance, q.compliance), 2)} s`; };
    body.append(info);
    const setP = (partial) => { vent.setPatient(partial); ui.profileId = 'egen'; renderTop(); refreshInfo(); };
    body.append(h('div', { class: 'hc-section' }, 'Mekanikk'));
    body.append(slider({ label: 'Compliance', unit: 'ml/cmH2O', min: 5, max: 120, step: 1, value: p.compliance, onChange: (v) => setP({ compliance: v }) }).el);
    body.append(slider({ label: 'Resistance, inspiratorisk', unit: 'cmH2O/(L/s)', min: 2, max: 50, step: 1, value: p.resistance, onChange: (v) => setP({ resistance: v }) }).el);
    body.append(slider({ label: 'Resistance, ekspiratorisk', unit: 'cmH2O/(L/s)', min: 2, max: 60, step: 1, value: p.resistanceExp ?? p.resistance, onChange: (v) => setP({ resistanceExp: v }) }).el);
    body.append(h('div', { class: 'hc-section' }, 'Egen pusteinnsats'));
    body.append(slider({ label: 'Pmus', unit: 'cmH2O', min: 0, max: 25, step: 1, value: p.effort.amplitude, onChange: (v) => setP({ effort: { amplitude: v } }) }).el);
    body.append(slider({ label: 'Egenfrekvens', unit: '/min', min: 6, max: 40, step: 1, value: p.effort.rate, onChange: (v) => setP({ effort: { rate: v } }) }).el);
    body.append(h('div', { class: 'hc-section' }, 'Gassutveksling (forenklet)'));
    body.append(slider({ label: 'Shunt', unit: '%', min: 0, max: 60, step: 1, value: Math.round(gas.params.shunt * 100), onChange: (v) => { gas.setParams({ shunt: v / 100 }); ui.profileId = 'egen'; } }).el);
    body.append(slider({ label: 'Rekrutterbarhet med PEEP', unit: '', min: 0, max: 1, step: 0.1, value: gas.params.recruitability, onChange: (v) => { gas.setParams({ recruitability: v }); ui.profileId = 'egen'; } }).el);
    body.append(h('div', { class: 'hc-section' }, 'Kroppsvekt (IBW)'));
    body.append(slider({ label: 'Høyde', unit: 'cm', min: 140, max: 210, step: 1, value: p.height, onChange: (v) => setP({ height: v }) }).el);
    body.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Kjønn'), segmented({ ariaLabel: 'Kjønn', value: p.sex, options: [{ value: 'M', label: 'Mann' }, { value: 'K', label: 'Kvinne' }], onChange: (v) => setP({ sex: v }) }).el));
    refreshInfo();
  }
  function applyProfile(id) {
    const pr = getProfile(id);
    ui.profileId = id;
    vent.setPatient(structuredClone(pr.patient));
    gas.setParams(gasForProfile(id));
    renderTop();
  }

  // ---------- Situasjoner ----------
  function renderSituationsTab(body) {
    const S = ui.situation;
    if (S) {
      body.append(h('div', { class: 'task-brief' }, h('h3', {}, S.def.title), h('p', {}, S.def.vignette),
        h('p', { class: 'muted', style: { margin: 0 } }, 'Tid: ', h('span', { id: 'sit-time' }, `${fmt(Math.max(0, vent.time - S.sit.state.tStart), 0)} s`))));
      if (S.summary) body.append(renderSituationSummary(S.summary));
      const act = (id) => {
        const r = S.sit.act(id, vent.time);
        addFeed({ t: vent.time, who: 'handling', text: `${ACTIONS[id].label}: ${r.text}`, kind: r.kind }, false);
        if (r.kind === 'skadelig') toast('Det tiltaket var skadelig.', { kind: 'danger' });
      };
      const undersok = Object.entries(ACTIONS).filter(([, a]) => a.kind === 'undersok');
      const tiltak = Object.entries(ACTIONS).filter(([, a]) => a.kind === 'tiltak');
      body.append(h('div', { class: 'hc-section' }, 'Undersøk'), h('div', { class: 'btn-group' }, ...undersok.map(([id, a]) => button(a.label, { small: true, onClick: () => act(id) }))));
      body.append(h('div', { class: 'hc-section' }, 'Tiltak'), h('div', { class: 'btn-group' }, ...tiltak.map(([id, a]) => button(a.label, { small: true, onClick: () => act(id) }))));
      body.append(h('div', { class: 'row', style: { margin: '10px 0' } }, button(S.summary ? 'Tilbake til listen' : 'Avslutt situasjon', { onClick: () => endSituation() })));
      body.append(h('div', { class: 'hc-section' }, 'Meldinger'), S.feedEl);
      return;
    }
    body.append(h('p', { class: 'muted' }, 'Falske pasienter der noe skjer underveis. Følg med på respiratoren, pasientmonitoren og meldingene, undersøk pasienten og sett inn riktig tiltak. Respiratoren justerer du som vanlig.'));
    for (const def of SITUATIONS) {
      const pr = progress.situations[def.id];
      body.append(h('div', { class: 'task-item' },
        h('h3', {}, def.title, pr?.solved ? h('span', { class: 'badge ok' }, `løst${pr.bestTime != null ? ` · beste ${fmt(pr.bestTime, 0)} s` : ''}`) : pr?.attempts ? h('span', { class: 'badge' }, `${pr.attempts} forsøk`) : null),
        h('div', { class: 'muted', style: { fontSize: '0.9rem' } }, def.vignette),
        h('div', {}, button('Start', { variant: 'primary', small: true, onClick: () => startSituation(def) }))));
    }
  }
  function addFeed(msg, notify = true) {
    const S = ui.situation; if (!S) return;
    const [ico, who] = WHO[msg.who] ?? ['•', msg.who];
    const t = `${String(Math.floor(msg.t / 60)).padStart(2, '0')}:${String(Math.floor(msg.t % 60)).padStart(2, '0')}`;
    S.feedEl.prepend(h('div', { class: `msg ${msg.kind ?? msg.who}` }, h('span', {}, ico), h('div', {}, h('time', {}, `${t} · ${who}`), msg.text)));
    if (notify) {
      toast(`${ico} ${msg.text}`, { kind: msg.who === 'monitor' || msg.who === 'respirator' ? 'warn' : '', ms: 6000 });
      audio.notify();
      if (ui.tab !== 'situations') { ui.unread += 1; renderTabs(); }
    }
  }
  function renderSituationSummary(sum) {
    return h('div', { class: `feedback ${sum.solved ? 'correct' : 'wrong'}` },
      h('b', {}, sum.solved ? 'Situasjonen er løst. ' : 'Situasjonen ble avsluttet uløst. '),
      sum.timeToFix !== null ? `Tid fra hendelse til riktig tiltak: ${fmt(sum.timeToFix, 0)} s. ` : sum.solved ? 'Løst med respiratorinnstillinger. ' : '',
      `Unødvendige eller skadelige tiltak: ${sum.wrongActions}.`,
      h('p', { style: { marginTop: '8px' } }, h('b', {}, 'Hva skjedde: '), sum.explanation));
  }
  function startSituation(def) {
    if (ui.task) endTask();
    const patient = { ...structuredClone(getProfile(def.profileId).patient), ...structuredClone(def.patient ?? {}) };
    vent.setSettings(structuredClone(def.settings));
    vent.setPatient(patient);
    vent.setDisconnected(false);
    gas.setParams(def.gas ?? gasForProfile(def.profileId));
    vent.reset();
    vent.run(20);
    ui.lastBreathTime = vent.time;
    updateGasFromVent();
    gas.settle();
    const hooks = { getPatient: () => vent.patient, setPatient: (p) => vent.setPatient(p), getGas: () => ({ ...gas.params }), setGas: (g) => gas.setParams(g), setDisconnected: (v) => vent.setDisconnected(v) };
    const sit = createSituation(def, { hooks });
    sit.start(vent.time);
    ui.situation = { sit, def, feedEl: h('div', { class: 'feed' }), summary: null };
    ui.running = true;
    ui.events = [];
    refreshAll();
    ui.tab = 'situations'; ui.unread = 0; renderTabs(); renderSide();
    addFeed({ t: vent.time, who: 'kollega', text: 'Pasienten er klar. Følg med.' }, false);
  }
  function finishSituation() {
    const S = ui.situation; if (!S || S.summary) return;
    S.summary = S.sit.summary();
    const pr = progress.situations[S.def.id] ?? { solved: false, attempts: 0, bestTime: null };
    pr.attempts += 1;
    if (S.summary.solved) { pr.solved = true; if (S.summary.timeToFix !== null && (pr.bestTime === null || S.summary.timeToFix < pr.bestTime)) pr.bestTime = S.summary.timeToFix; }
    progress.situations[S.def.id] = pr;
    saveProgress();
    toast(S.summary.solved ? 'Situasjonen er løst!' : 'Situasjonen er avsluttet.', { kind: S.summary.solved ? 'ok' : 'warn' });
    if (ui.tab === 'situations') renderSide();
  }
  function endSituation() {
    const S = ui.situation; if (!S) return;
    if (!S.summary) finishSituation();
    S.sit.end();
    vent.setDisconnected(false);
    ui.situation = null;
    applyProfile(ui.profileId === 'egen' ? 'normal' : ui.profileId);
    refreshAll();
    renderSide();
  }

  // ---------- Oppgaver ----------
  function renderTasksTab(body) {
    if (ui.task) {
      const T = ui.task;
      body.append(h('div', { class: 'task-brief' }, h('h3', {}, T.task.title), h('p', {}, T.task.vignette), h('p', {}, h('b', {}, 'Mål: '), T.task.goal)));
      if (T.task.question) {
        body.append(h('div', { class: 'hc-section' }, T.task.question.text));
        body.append(h('div', { class: 'choices' }, ...T.task.question.options.map((o) => h('button', { type: 'button', class: `choice ${T.answer === o.id ? 'selected' : ''}`, onClick: () => { T.answer = o.id; renderSide(); } }, o.label))));
      }
      body.append(h('div', { class: 'row', style: { margin: '12px 0' } }, button('Sjekk oppgaven', { variant: 'primary', onClick: () => checkTask() }), button('Avslutt oppgave', { onClick: () => endTask() })));
      if (T.result) {
        body.append(h('div', { class: `feedback ${T.result.ok ? 'correct' : 'wrong'}` }, h('b', {}, T.result.ok ? 'Oppgaven er løst!' : 'Ikke helt ennå.'),
          h('div', { class: 'crit', style: { marginTop: '8px' } }, ...T.result.items.map((i) => h('div', { class: `crit-item ${i.ok ? 'ok' : 'fail'}` }, h('span', {}, i.ok ? '✓' : '✗'), h('div', {}, h('div', {}, i.label), h('small', {}, i.detail)))))));
      }
      body.append(h('p', { class: 'faint', style: { marginTop: '12px', fontSize: '0.85rem' } }, `Forutsigelser: ${progress.predictions.correct} av ${progress.predictions.total} riktige.`));
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
    body.append(h('p', { class: 'faint', style: { marginTop: '12px', fontSize: '0.85rem' } }, `Forutsigelser så langt: ${progress.predictions.correct} av ${progress.predictions.total} riktige.`));
  }
  function startTask(task) {
    if (ui.situation) endSituation();
    const setup = taskSetup(task);
    ui.task = { task, hidden: setup.hidden, answer: null, holdDone: false, result: null };
    vent.setSettings(setup.settings);
    vent.setPatient(setup.patient);
    gas.setParams(gasForProfile(task.profileId));
    vent.reset();
    ui.running = true;
    refreshAll();
    ui.tab = 'tasks'; renderTabs(); renderSide();
  }
  function endTask() {
    ui.task = null;
    applyProfile(ui.profileId === 'egen' ? 'normal' : ui.profileId);
    refreshAll();
    renderSide();
  }
  function checkTask() {
    const T = ui.task; if (!T) return;
    if (!vent.lastBreath) { toast('Vent til respiratoren har levert noen pust.', { kind: 'warn' }); return; }
    T.result = evaluateTask(T.task, { m: vent.measurements, hidden: T.hidden, answer: T.answer, holdDone: T.holdDone });
    const pr = progress.tasks[T.task.id] ?? { completed: false, attempts: 0 };
    pr.attempts += 1;
    if (T.result.ok) pr.completed = true;
    progress.tasks[T.task.id] = pr;
    saveProgress();
    renderSide();
    toast(T.result.ok ? 'Riktig – oppgaven er løst!' : 'Se tilbakemeldingen per kriterium.', { kind: T.result.ok ? 'ok' : 'warn' });
  }

  // ======================= Modaler =======================
  let modalEl = null;
  function openModal(content) { closeModal(); modalEl = h('div', { class: 'hc-modal-backdrop' }, h('div', { class: 'hc-modal', role: 'dialog' }, ...content)); hc.append(modalEl); }
  function closeModal() { modalEl?.remove(); modalEl = null; }
  function openModeModal() {
    const opts = Object.values(MODES).map((m) => h('button', { type: 'button', class: `choice ${vent.settings.mode === m.id ? 'selected' : ''}`, onClick: () => { closeModal(); applySetting('mode', m.id); } },
      h('div', { class: 'mode-option' }, h('b', {}, m.label), h('small', {}, m.description))));
    openModal([h('h3', {}, 'Modus'), h('div', { class: 'choices' }, ...opts), h('div', { class: 'row', style: { marginTop: '12px' } }, button('Avbryt', { onClick: closeModal }))]);
  }
  function showPrediction(q, onApply, onCancel) {
    const mm = MEASURES[q.measure];
    const choices = h('div', { class: 'choices' });
    const fb = h('div', {});
    const actions = h('div', { class: 'row', style: { marginTop: '12px' } }, button('Avbryt endringen', { onClick: () => { closeModal(); onCancel?.(); } }));
    for (const o of q.options) {
      choices.append(h('button', { type: 'button', class: 'choice', dataset: { id: o.id }, onClick: (e) => {
        const correct = o.id === q.expected;
        progress.predictions.total += 1; if (correct) progress.predictions.correct += 1; saveProgress();
        choices.querySelectorAll('.choice').forEach((b) => { b.disabled = true; b.classList.toggle('correct', b.dataset.id === q.expected); });
        e.currentTarget.classList.add(correct ? 'correct' : 'wrong');
        clear(fb);
        fb.append(h('div', { class: `feedback ${correct ? 'correct' : 'wrong'}` }, h('b', {}, correct ? 'Riktig. ' : `Ikke riktig – ${mm.label} ${q.expected === 'opp' ? 'øker' : q.expected === 'ned' ? 'synker' : 'er omtrent uendret'}. `),
          `Simulert steady state: ${mm.label} ${fmt(q.baseValue, mm.decimals)} → ${fmt(q.expectedValue, mm.decimals)} ${mm.unit}.`, h('p', { style: { marginTop: '6px' } }, q.why)));
        clear(actions);
        actions.append(button('Utfør endringen og se på kurvene', { variant: 'primary', onClick: () => { closeModal(); onApply(); } }));
      } }, o.label));
    }
    openModal([h('h3', {}, 'Forutsi først'), h('p', {}, q.text), choices, fb, actions]);
  }

  // ======================= Simuleringsløkke =======================
  function onSample(s) {
    if (!ui.frozen) {
      sc.paw.push(s.t, s.paw); sc.flow.push(s.t, s.flow * 60); sc.vol.push(s.t, s.volume);
      if (vent.breath !== loopBreathRef) { loopBreathRef = vent.breath; loopPrev = loopCur; loopCur = { pv: [], fv: [] }; }
      if ((sampleCount++ & 1) === 0) { loopCur.pv.push({ x: s.paw, y: s.volume }); loopCur.fv.push({ x: s.volume, y: s.flow * 60 }); }
    }
    if (vent.holdResult && vent.holdResult.time !== ui.lastHoldTime) {
      ui.lastHoldTime = vent.holdResult.time;
      const r = vent.holdResult;
      logEvent(r.type === 'insp' ? `Insp. hold: Pplateau ${fmt(r.pplat, 1)}` : `Eksp. hold: AutoPEEP ${fmt(r.autoPeep, 1)}`);
      if (ui.task && r.type === ui.task.task.requireHold) ui.task.holdDone = true;
      toolsRefresh?.();
    }
  }
  function updateGasFromVent() {
    const m = vent.measurements;
    const stale = vent.time - ui.lastBreathTime > 12;
    gas.setVentilation({
      vtMl: vent.disconnected || stale ? 0 : (m.vte ?? 0), rate: stale ? 0 : (m.fTotal ?? 0),
      fio2: vent.settings.fio2 / 100, peep: vent.disconnected ? 0 : (m.peepTotal ?? vent.settings.peep),
      ibwKg: m.ibw ?? idealBodyWeightHamilton(vent.patient.height, vent.patient.sex),
    });
  }
  const offBreath = vent.onBreath((m) => { ui.lastBreathTime = vent.time; updateGasFromVent(); autoRange(m); evaluateAlarms(); updateMMP(m); renderMsgBar(); });

  let lastClockSec = -1;
  function frame(now) {
    if (ui.lastNow === null) ui.lastNow = now;
    const elapsed = Math.min(0.2, (now - ui.lastNow) / 1000);
    ui.lastNow = now;
    if (ui.running) {
      ui.acc += elapsed * ui.speed;
      const dt = vent.dt; let n = 0;
      while (ui.acc >= dt && n < 400) { onSample(vent.step()); ui.acc -= dt; n++; }
      if (n >= 400) ui.acc = 0;
      gas.step(n * dt);
      audio.setBreath(vent.disconnected ? 0 : vent.lung.state.flow);
    } else audio.setBreath(0);
    for (const s of Object.values(sc)) s.draw();
    if (ui.showLoops) { pvLoop.setData(loopCur.pv, loopPrev.pv); pvLoop.draw(); fvLoop.setData(loopCur.fv, loopPrev.fv); fvLoop.draw(); }
    const sec = Math.floor(vent.time);
    if (sec !== lastClockSec) {
      lastClockSec = sec;
      renderClock();
      if (vent.holdActive) toolsRefresh?.();
      if (vent.time - ui.lastBreathTime > 12 || vent.disconnected) updateGasFromVent();
      if (ui.o2Enrich && vent.time >= ui.o2Enrich.until) { applySetting('fio2', ui.o2Enrich.prev, { silent: true }); ui.o2Enrich = null; o2Btn.classList.remove('on'); logEvent('O2-anrikning ferdig'); }
      evaluateAlarms(); updateMMP(vent.measurements); renderMsgBar(); renderMonitorPanel();
      audio.setPulse(gas.state.spo2, currentVitals().hr);
      if (ui.situation && !ui.situation.summary) {
        const S = ui.situation;
        const status = S.sit.tick(vent.time, { m: vent.measurements, gas: gas.state, settings: vent.settings, pmax: vent.settings.pmax, disconnected: vent.disconnected });
        for (const msg of S.sit.drain()) addFeed(msg);
        const el = document.getElementById('sit-time'); if (el) el.textContent = `${fmt(Math.max(0, vent.time - S.sit.state.tStart), 0)} s`;
        if (status === 'resolved') finishSituation();
      }
    }
    ui.raf = requestAnimationFrame(frame);
  }
  function autoRange(m) {
    const [, pMax] = sc.paw.takeExtremes();
    const pHi = Math.max(30, Math.ceil((Math.max(Number.isFinite(pMax) ? pMax : 0, m.ppeak ?? 0, vent.settings.pmax) + 5) / 10) * 10);
    sc.paw.setRange(-5, pHi); pvLoop.setRanges([0, pHi], null);
    const [fMin, fMax] = sc.flow.takeExtremes();
    const fAbs = Math.max(Math.abs(fMin), Math.abs(fMax));
    const fHi = Math.max(40, Math.ceil((Number.isFinite(fAbs) ? fAbs : 40) / 20) * 20);
    sc.flow.setRange(-fHi, fHi); fvLoop.setRanges(null, [-fHi, fHi]);
    const vHi = Math.max(400, Math.ceil((Math.max(m.vti ?? 0, m.vte ?? 0) + 50) / 100) * 100);
    sc.vol.setRange(0, vHi); pvLoop.setRanges(null, [0, vHi]); fvLoop.setRanges([0, vHi], null);
  }
  function refreshAll() {
    updateMarkers(); renderTop(); renderSettingsBar(); updateMMP(vent.measurements); renderClock(); renderMonitorPanel();
    for (const s of Object.values(sc)) s.clear();
  }

  applyLoopsLayout();
  refreshAll();
  renderTabs(); renderSide();
  ui.raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(ui.raf);
    audio.destroy();
    offBreath();
    for (const s of Object.values(sc)) s.destroy();
    pvLoop.destroy(); fvLoop.destroy();
    closeModal(); closeWindow();
    root.remove();
  };
}
