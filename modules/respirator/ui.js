/**
 * Respiratorsimulator – brukergrensesnitt etter HAMILTON-C6.
 *
 * Venstre: «respiratoren», lagt opp etter HAMILTON-C6s hovedskjerm (sammenlignet mot skjermbilder og
 * video av en ekte C6): modusfelt med pasientikon øverst til venstre, meldingslinje, MMP-kolonne med
 * alarmgrenser, kurver med tidsakse, intelligente paneler (Dynamic Lung, Vent Status), høyrekolonne med
 * Modus, ringknapper og Kontroller/Alarmer, bunnlinje med Monitorering, Grafikk, Verktøy, Hendelser, System.
 * Vinduene er lyse med faner, ringknapper som blir gule når de er valgt, og Avbryt/Bekreft ved modusbytte.
 * Høyre: sidepanel med pasientmonitor, pasientoppsett, caser (meldingsfeed og valg 1 av 5) og oppgaver.
 */
import { h, clear } from '../../core/ui/dom.js';
import { slider, segmented, button, toggle } from '../../core/ui/controls.js';
import { toast } from '../../core/ui/toast.js';
import { fmt } from '../../core/units.js';
import { createScope } from '../../core/charts/scope.js';
import { createLoop } from '../../core/charts/loop.js';
import { createVentilator, MODES, DEFAULT_SETTINGS } from '../../core/sim/ventilator.js';
import { timeConstant, idealBodyWeightHamilton } from '../../core/physiology/respiratory.js';
import { createGasModel } from '../../core/sim/gasModel.js';
import { anatomicDeadspace } from '../../core/physiology/gasExchange.js';
import { createVentAudio } from '../../core/audio/ventSounds.js';
import { PROFILES, getProfile } from './profiles.js';
import { TASKS, CATEGORIES, taskSetup, evaluateTask, predictionFor, MEASURES, settingLabel } from './tasks.js';
import { SITUATIONS, ACTIONS, createSituation, gasForProfile, computeVitals } from './scenarios.js';

const IE_OPTIONS = [
  { value: '2:1', label: '2:1', ie: { i: 2, e: 1 } }, { value: '1.5:1', label: '1,5:1', ie: { i: 1.5, e: 1 } },
  { value: '1:1', label: '1:1', ie: { i: 1, e: 1 } }, { value: '1:1.5', label: '1:1,5', ie: { i: 1, e: 1.5 } },
  { value: '1:2', label: '1:2', ie: { i: 1, e: 2 } }, { value: '1:2.5', label: '1:2,5', ie: { i: 1, e: 2.5 } },
  { value: '1:3', label: '1:3', ie: { i: 1, e: 3 } }, { value: '1:4', label: '1:4', ie: { i: 1, e: 4 } }, { value: '1:5', label: '1:5', ie: { i: 1, e: 5 } },
];
const ieKey = (ie) => (ie.i === 1 ? `1:${ie.e}` : `${ie.i}:1`);
const ieLabel = (ie) => ieKey(ie).replace('.', ',');
const ieIndex = (ie) => Math.max(0, IE_OPTIONS.findIndex((o) => o.value === ieKey(ie)));

/** MMP-er (Hamilton: Ppeak alltid øverst; alarmgrenser oppe til venstre i flisen). */
const MMP_MAIN = [
  { key: 'ppeak', label: 'Ppeak', unit: 'cmH2O', d: 0, limits: ['pmax', null] },
  { key: 'peepTotal', label: 'PEEP/CPAP', unit: 'cmH2O', d: 1 },
  { key: 'vte', label: 'VTE', unit: 'ml', d: 0, limits: ['vtHigh', 'vtLow'] },
  { key: 'expMinVol', label: 'ExpMinVol', unit: 'l/min', d: 1, limits: ['mvHigh', 'mvLow'] },
  { key: 'fTotal', label: 'fTotal', unit: 'b/min', d: 0, limits: ['fHigh', 'fLow'] },
  { key: 'pplat', label: 'Pplateau', unit: 'cmH2O', d: 0 },
  { key: 'spo2', label: 'SpO2', unit: '%', d: 0, limits: [null, 'spo2Low'], compact: true },
];
const MMP_ALL = [
  ...MMP_MAIN.map((m) => ({ ...m, compact: false })),
  { key: 'autoPeep', label: 'AutoPEEP', unit: 'cmH2O', d: 1 }, { key: 'petco2', label: 'PetCO2', unit: 'kPa', d: 1 },
  { key: 'pmean', label: 'Pmean', unit: 'cmH2O', d: 1 }, { key: 'drivingPressure', label: 'ΔP (drivtrykk)', unit: 'cmH2O', d: 1 }, { key: 'pinsp', label: 'Pinsp', unit: 'cmH2O', d: 1 },
  { key: 'vti', label: 'VTI', unit: 'ml', d: 0 }, { key: 'vtPerKg', label: 'Vt/IBW', unit: 'ml/kg', d: 1 }, { key: 'fSpont', label: 'fSpont', unit: 'b/min', d: 0 },
  { key: 'cstat', label: 'Cstat', unit: 'ml/cmH2O', d: 0 }, { key: 'rinsp', label: 'Rinsp', unit: 'cmH2O/(l/s)', d: 0 }, { key: 'rcexp', label: 'RCexp', unit: 's', d: 2 },
  { key: 'ti', label: 'TI', unit: 's', d: 2 }, { key: 'te', label: 'TE', unit: 's', d: 2 }, { key: 'ieText', label: 'I:E', unit: '', d: null }, { key: 'ibw', label: 'IBW', unit: 'kg', d: 1 },
  { key: 'paco2', label: 'PaCO2 (modell)', unit: 'kPa', d: 1 }, { key: 'pao2', label: 'PaO2 (modell)', unit: 'kPa', d: 1 },
];
const WINDOWS = {
  alarms: 'Alarmer', controls: 'Kontroller', monitor: 'Monitorering', graphics: 'Grafikk', tools: 'Verktøy', events: 'Hendelser', system: 'System', modes: 'Modus', standby: 'Standby',
};
const BOTTOM_WINDOWS = ['monitor', 'graphics', 'tools', 'events', 'system'];
const PERSON_ICON = '<svg viewBox="0 0 22 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="11" cy="5" r="4.5" fill="#fff"/><path d="M3 12h16l-2 14h-2v13h-3V26h-2v13H8V26H6z" fill="#fff"/></svg>';
const WHO = { obs: ['👁', 'Observasjon'], kollega: ['🧑‍⚕️', 'Kollega'], monitor: ['📟', 'Monitor'], respirator: ['🫁', 'Respirator'], handling: ['✋', 'Du'] };

/** Modusgrupper slik Modus-vinduet på C6 viser dem. Bare noen er simulert. */
const MODE_GROUPS = [
  { title: 'Volumkontrollert (adaptiv)', modes: [['APVCMV', '(S)CMV+'], ['APVSIMV', 'SIMV+'], ['SCMV', '(S)CMV'], ['SIMV', 'SIMV']] },
  { title: 'Trykkontrollert (bifasisk)', modes: [['PCV', 'PCV+'], ['PSIMV', 'PSIMV+'], ['SPONT', 'SPONT'], ['DUOPAP', 'DuoPAP'], ['APRV', 'APRV']] },
  { title: 'Intelligent ventilasjon', modes: [['ASV', 'ASV'], ['IVASV', 'INTELLiVENT-ASV']] },
  { title: 'Noninvasiv', modes: [['NIV', 'NIV'], ['NIVST', 'NIV-ST'], ['HIFLOW', 'HiFlowO2']] },
];

/** Kontroller som ringknapper. get/set gir delvis innstillingsobjekt; fmtFn formaterer verdien i ringen. */
const CTL = {
  fio2: { label: 'Oksygen', unit: '%', min: 21, max: 100, step: 1 },
  peep: { label: 'PEEP/CPAP', unit: 'cmH2O', min: 0, max: 35, step: 1 },
  rate: { label: 'Rate', unit: 'b/min', min: 1, max: 80, step: 1 },
  vt: { label: 'Vt', unit: 'ml', min: 100, max: 1000, step: 10 },
  pcontrol: { label: 'Pcontrol', unit: 'cmH2O', min: 5, max: 60, step: 1 },
  psupport: { label: 'Psupport', unit: 'cmH2O', min: 0, max: 60, step: 1 },
  ie: { label: 'I:E', unit: '', min: 0, max: IE_OPTIONS.length - 1, step: 1, get: (s) => ieIndex(s.ie), set: (s, i) => ({ ie: IE_OPTIONS[i].ie, timingMode: 'ie' }), fmtFn: (i) => IE_OPTIONS[i].label },
  ti: { label: 'TI', unit: 's', min: 0.1, max: 3, step: 0.05, dec: 2, set: (s, v) => ({ ti: v, timingMode: 'ti' }) },
  pramp: { label: 'P-ramp', unit: 'ms', min: 0, max: 600, step: 25 },
  tip: { label: 'Pause', unit: '%', min: 0, max: 30, step: 5 },
  ets: { label: 'ETS', unit: '%', min: 5, max: 80, step: 5 },
  tiMax: { label: 'TI max', unit: 's', min: 0.5, max: 3, step: 0.1, dec: 1 },
  trigger: { label: (s) => (s.trigger.type === 'flow' ? 'Flowtrigger' : 'Trykktrigger'), unit: (s) => (s.trigger.type === 'flow' ? 'l/min' : 'cmH2O'), min: 0.5, max: (s) => (s.trigger.type === 'flow' ? 20 : 15), step: 0.5, dec: 1, get: (s) => s.trigger.value, set: (s, v) => ({ trigger: { ...s.trigger, value: v } }), fmtFn: (v, s) => (s.trigger.type === 'flow' ? String(v) : `-${v}`) },
  apneaTime: { label: 'Apnétid', unit: 's', min: 5, max: 60, step: 5 },
  backupRate: { label: 'Backup rate', unit: 'b/min', min: 4, max: 30, step: 1, get: (s) => s.backup.rate, set: (s, v) => ({ backup: { ...s.backup, rate: v } }) },
  backupPcontrol: { label: 'Backup Pinsp', unit: 'cmH2O', min: 5, max: 40, step: 1, get: (s) => s.backup.pcontrol, set: (s, v) => ({ backup: { ...s.backup, pcontrol: v } }) },
};
const resolve = (v, s) => (typeof v === 'function' ? v(s) : v);
function ctlItem(key, s) {
  const d = CTL[key];
  const value = d.get ? d.get(s) : s[key];
  return { key, label: resolve(d.label, s), unit: resolve(d.unit, s), min: resolve(d.min, s), max: resolve(d.max, s), step: d.step, dec: d.dec ?? 0, value, fmtFn: (v) => (d.fmtFn ? d.fmtFn(v, s) : d.dec ? Number(v).toFixed(d.dec) : String(v)), set: (v) => (d.set ? d.set(s, v) : { [key]: v }) };
}
/** Hvilke kontroller som vises per modus og fane (Grunn / Mer), som på C6. */
function controlKeys(s, tab) {
  const timing = s.timingMode === 'ie' ? 'ie' : 'ti';
  if (tab === 'basic') {
    if (s.mode === 'APVCMV') return [timing, 'rate', 'pramp', 'vt', 'peep', 'trigger', 'fio2'];
    if (s.mode === 'SCMV') return [timing, 'rate', 'tip', 'vt', 'peep', 'trigger', 'fio2'];
    if (s.mode === 'PCV') return [timing, 'rate', 'pramp', 'pcontrol', 'peep', 'trigger', 'fio2'];
    return ['psupport', 'pramp', 'ets', 'tiMax', 'peep', 'trigger', 'fio2'];
  }
  return ['apneaTime', 'backupRate', 'backupPcontrol'];
}
/** Ringkontrollene i høyrekolonnen (C6 viser modusens viktigste kontroller der). */
const RING_KEYS = { APVCMV: ['vt', 'rate', 'peep', 'fio2'], SCMV: ['vt', 'rate', 'peep', 'fio2'], PCV: ['pcontrol', 'rate', 'peep', 'fio2'], SPONT: ['psupport', 'peep', 'fio2'] };

/** Alarmgrenser i Alarmer-vinduet: øvre ring, søyle med måleverdi, nedre ring. */
const ALARM_COLS = [
  { label: 'Trykk', unit: 'cmH2O', hi: 'pmax', lo: null, measure: 'ppeak', min: 0, max: 70 },
  { label: 'ExpMinVol', unit: 'l/min', hi: 'mvHigh', lo: 'mvLow', measure: 'expMinVol', min: 0, max: 40 },
  { label: 'Vt', unit: 'ml', hi: 'vtHigh', lo: 'vtLow', measure: 'vte', min: 0, max: 2000 },
  { label: 'fTotal', unit: 'b/min', hi: 'fHigh', lo: 'fLow', measure: 'fTotal', min: 0, max: 80 },
  { label: 'SpO2', unit: '%', hi: null, lo: 'spo2Low', measure: 'spo2', min: 50, max: 100 },
  { label: 'Apnétid', unit: 's', hi: 'apnea', lo: null, measure: null, min: 0, max: 60 },
];
const ALARM_DEF = { pmax: { label: 'Trykk høy (Pmax)', min: 15, max: 70, step: 1 }, mvLow: { label: 'ExpMinVol lav', min: 0.5, max: 20, step: 0.5, dec: 1 }, mvHigh: { label: 'ExpMinVol høy', min: 2, max: 40, step: 0.5, dec: 1 }, vtLow: { label: 'Vt lav', min: 50, max: 1000, step: 10 }, vtHigh: { label: 'Vt høy', min: 100, max: 2000, step: 10 }, fLow: { label: 'fTotal lav', min: 0, max: 40, step: 1 }, fHigh: { label: 'fTotal høy', min: 10, max: 80, step: 1 }, spo2Low: { label: 'SpO2 lav', min: 70, max: 99, step: 1 }, apnea: { label: 'Apnétid', min: 5, max: 60, step: 5 } };

/** Standard Vt ved oppstart: 8 ml/kg IBW (Hamilton: Vt/IBW standard 8 ml/kg), avrundet til 10 ml. */
function startupVt(patient) {
  return Math.max(200, Math.round((8 * idealBodyWeightHamilton(patient.height, patient.sex)) / 10) * 10);
}
const clock = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function timingInfo(s, patient) {
  const cycle = 60 / s.rate;
  const ti = s.timingMode === 'ie' ? cycle * (s.ie.i / (s.ie.i + s.ie.e)) : s.ti;
  const ibw = idealBodyWeightHamilton(patient.height, patient.sex);
  return { ti, te: cycle - ti, vtKg: s.vt / ibw };
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
  const progress = storage.get('respirator:progress', { predictions: { correct: 0, total: 0 } });
  progress.predictions ??= { correct: 0, total: 0 };
  const saveProgress = () => storage.set('respirator:progress', progress);

  const ui = {
    running: true, frozen: false, speed: 1, window: null, focusKey: null, layout: 3, profileId,
    raf: 0, acc: 0, lastNow: null, lastHoldTime: null, lastBreathTime: 0, autoHoldUntil: null,
    task: null, situation: null, tab: 'patient', unread: 0, o2Enrich: null, pending: null,
    alarms: { mvLow: 3, mvHigh: 15, vtLow: 200, vtHigh: 1000, fLow: 0, fHigh: 40, spo2Low: 90, apnea: 20 },
    activeAlarms: [], events: [],
  };

  // ======================= DOM-skjelett =======================
  const modeBtn = h('button', { class: 'hc-mode', type: 'button', onClick: () => openWindow('modes') });
  const msgBar = h('div', { class: 'hc-msg' });
  const clockBox = h('div', { class: 'hc-clock' });
  const mmpCol = h('div', { class: 'hc-mmp' });
  const curves = h('div', { class: 'hc-curves' });
  const loops = h('div', { class: 'hc-loops' });
  const panels = h('div', { class: 'hc-panels' });
  const waves = h('div', { class: 'hc-waves' }, curves, panels, loops);
  const rings = h('div', { class: 'hc-rings' });
  const modesBtn = h('button', { type: 'button', class: 'hc-btn', dataset: { win: 'modes' }, onClick: () => openWindow('modes') }, 'Modus');
  const controlsBtn = h('button', { type: 'button', class: 'hc-btn', dataset: { win: 'controls' }, onClick: () => openWindow('controls') }, 'Kontroller');
  const alarmsBtn = h('button', { type: 'button', class: 'hc-btn', dataset: { win: 'alarms' }, onClick: () => openWindow('alarms') }, 'Alarmer');
  const right = h('div', { class: 'hc-right' }, modesBtn, rings, controlsBtn, alarmsBtn);
  const quick = h('div', { class: 'hc-quick' });
  const bottom = h('div', { class: 'hc-bottom' });
  const hc = h('div', { class: 'hc' }, modeBtn, msgBar, right, mmpCol, waves, quick, bottom, clockBox);

  const pmon = h('div', { class: 'pmon', 'aria-label': 'Pasientmonitor' });
  const sideTabs = h('div', { class: 'side-tabs' });
  const sideBody = h('div', { class: 'side-body' });
  const panel = h('aside', { class: 'side-panel' }, pmon, sideTabs, sideBody);
  const root = h('div', { class: 'lab' }, hc, panel);
  container.append(root);

  // ======================= Kurver, sløyfer, paneler =======================
  // Kurvefarger som på C6: Paw gul, Flow magenta, Volum blå; hvit tidsakse i sekunder
  const SCOPE_OPTS = { sweepSeconds: 11, xAxis: true, textColor: '#fff', markerStyle: 'solid' };
  const sc = {
    paw: createScope(h('div', {}), { ...SCOPE_OPTS, label: 'Paw', unit: 'cmH2O', color: '#ffe100', range: [-5, 40] }),
    flow: createScope(h('div', {}), { ...SCOPE_OPTS, label: 'Flow', unit: 'l/min', color: '#ff3ab5', range: [-60, 60] }),
    vol: createScope(h('div', {}), { ...SCOPE_OPTS, label: 'Volum', unit: 'ml', color: '#4fb3ff', range: [0, 600] }),
  };
  curves.append(...Object.values(sc).map((s) => s.wrap));
  const pvLoop = createLoop(h('div', {}), { title: 'Trykk/volum', xLabel: 'Paw cmH2O / Volum ml', color: '#ffe100', xRange: [0, 40], yRange: [0, 600] });
  const fvLoop = createLoop(h('div', {}), { title: 'Volum/flow', xLabel: 'Volum ml / Flow l/min', color: '#ff3ab5', xRange: [0, 600], yRange: [-60, 60] });
  loops.append(pvLoop.wrap, fvLoop.wrap);
  let loopCur = { pv: [], fv: [] }, loopPrev = { pv: [], fv: [] }, loopBreathRef = null, sampleCount = 0;
  const updateMarkers = () => sc.paw.setMarkers([{ value: vent.settings.pmax, color: '#ff2020' }, { value: vent.settings.pmax - 10, color: '#3d8be0' }]);

  // Dynamic Lung (C6 intelligent panel): lungene utvider seg med volumet, bronkiebredde etter resistance,
  // farge etter compliance. Venstre: kjønn, høyde, IBW. Høyre: Pplateau og AutoPEEP (på C6 står Pcuff/PVI her).
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const lungSvg = svgEl('svg', { viewBox: '0 0 200 200', preserveAspectRatio: 'xMidYMid meet', 'aria-label': 'Dynamic Lung' });
  const trachea = svgEl('rect', { x: 94, y: 4, width: 12, height: 46, rx: 4, fill: '#e8f0f8' });
  const bronchL = svgEl('path', { d: 'M100 48 L72 82 L60 110', stroke: '#e8f0f8', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const bronchR = svgEl('path', { d: 'M100 48 L128 82 L140 110', stroke: '#e8f0f8', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const lungL = svgEl('path', { d: '', fill: '#8cc4ec', opacity: 0.92 });
  const lungR = svgEl('path', { d: '', fill: '#8cc4ec', opacity: 0.92 });
  const heart = svgEl('path', { d: 'M100 150 c-8 -14 -26 -10 -24 4 c2 12 16 18 24 28 c8 -10 22 -16 24 -28 c2 -14 -16 -18 -24 -4 z', fill: '#c9484f', opacity: 0.9 });
  const trigIcon = svgEl('text', { x: 100, y: 196, 'text-anchor': 'middle', 'font-size': 12, fill: '#fff' });
  lungSvg.append(lungL, lungR, bronchL, bronchR, trachea, heart, trigIcon);
  const dlInfo = h('div', { class: 'dl-info' });
  const dlSide = h('div', { class: 'dl-side' });
  const dlRow = h('div', { class: 'dl-row' });
  const dynLung = h('div', { class: 'hc-panel active' }, h('div', { class: 'dynlung' }, dlInfo, lungSvg, dlSide), dlRow);
  const ventStatus = h('div', { class: 'ventstatus' });
  const ventStatusPanel = h('div', { class: 'hc-panel' }, ventStatus);
  panels.append(dynLung, ventStatusPanel);
  function lungPath(side, scale) {
    const sN = 0.78 + 0.3 * scale;
    const cx = side === 'L' ? 66 : 134, cy = 118, sgn = side === 'L' ? -1 : 1;
    const w = 40 * sN, hgt = 66 * sN;
    return `M${cx + sgn * 2} ${cy - hgt * 0.8} C ${cx + sgn * (2 + w)} ${cy - hgt}, ${cx + sgn * (4 + w)} ${cy + hgt * 0.9}, ${cx + sgn * 10} ${cy + hgt * 0.85} C ${cx - sgn * 12} ${cy + hgt * 0.7}, ${cx - sgn * 14} ${cy - hgt * 0.1}, ${cx + sgn * 2} ${cy - hgt * 0.8} Z`;
  }
  const cell = (label, value, unit) => h('div', {}, label, h('b', {}, value), h('small', {}, unit));
  function drawDynamicLung(sample) {
    const p = vent.patient, m = vent.measurements;
    const vtRef = Math.max(300, (m.vti ?? 500));
    const fill = Math.max(0, Math.min(1.2, (sample?.volume ?? 0) / vtRef));
    lungL.setAttribute('d', lungPath('L', fill)); lungR.setAttribute('d', lungPath('R', fill));
    const cNorm = Math.max(0, Math.min(1, (p.compliance - 15) / 60));
    const col = `hsl(205, ${50 + 25 * cNorm}%, ${58 + 18 * cNorm}%)`; // stiv lunge = mørkere/gråere blå
    lungL.setAttribute('fill', col); lungR.setAttribute('fill', col);
    const rW = Math.max(2, 9 - (p.resistance - 5) / 5);
    bronchL.setAttribute('stroke-width', rW); bronchR.setAttribute('stroke-width', rW);
    trigIcon.textContent = m.breathType === 'triggered' || m.breathType === 'spont' ? '▲ pasienttrigget' : '';
  }
  function drawDynamicLungText() {
    const p = vent.patient, m = vent.measurements, v = currentVitals();
    dlInfo.replaceChildren(h('div', {}, h('b', {}, p.sex === 'K' ? 'Kvinne' : 'Mann')), h('div', {}, h('b', {}, String(p.height)), ' cm'), h('div', {}, 'IBW: ', h('b', {}, fmt(m.ibw ?? idealBodyWeightHamilton(p.height, p.sex), 0)), ' kg'));
    dlSide.replaceChildren(h('div', {}, 'Pplateau', h('span', { class: 'dl-big' }, fmt(m.pplat, 0)), h('small', {}, 'cmH2O')), h('div', {}, 'AutoPEEP', h('span', { class: 'dl-big' }, fmt(m.autoPeep, 1)), h('small', {}, 'cmH2O')));
    dlRow.replaceChildren(cell('Rinsp', fmt(m.rinsp, 0), 'cmH2O/l/s'), cell('Cstat', fmt(m.cstat, 1), 'ml/cmH2O'), cell('PetCO2', fmt(vent.disconnected ? 0 : gas.petco2, 1), 'kPa'), cell('SpO2', fmt(gas.state.spo2 * 100, 0), '%'), cell('Puls', String(v.hr), '1/min'));
  }
  /** Vent Status (C6): tre grupper med søyler, hvit avvenningssone, tid i sonen. Sonegrensene er pedagogiske valg. */
  const VS_GROUPS = [
    { title: 'Oksygenering', items: [
      { key: 'fio2', label: 'Oksygen', unit: '%', d: 0, get: () => vent.settings.fio2, min: 21, max: 100, zone: [21, 40] },
      { key: 'peep', label: 'PEEP', unit: 'cmH2O', d: 0, get: () => vent.measurements.peepTotal ?? vent.settings.peep, min: 0, max: 20, zone: [0, 8] }] },
    { title: 'CO2-eliminasjon', items: [
      { key: 'mv', label: 'MinVol', unit: 'l/min', d: 1, get: () => vent.measurements.expMinVol ?? 0, min: 0, max: 15, zone: [4, 10] },
      { key: 'pinsp', label: 'Pinsp', unit: 'cmH2O', d: 0, get: () => vent.measurements.pinsp ?? (vent.settings.mode === 'SPONT' ? vent.settings.psupport : vent.settings.pcontrol), min: 0, max: 35, zone: [0, 10] }] },
    { title: 'Spont/aktivitet', items: [
      { key: 'rsb', label: 'RSB', unit: '1/(l·min)', d: 0, get: () => (vent.measurements.vte > 0 ? vent.measurements.fTotal / (vent.measurements.vte / 1000) : null), min: 0, max: 200, zone: [0, 105] },
      { key: 'spont', label: '%fSpont', unit: '%', d: 0, get: () => (vent.measurements.fTotal ? 100 * (vent.measurements.fSpont ?? 0) / vent.measurements.fTotal : 0), min: 0, max: 100, zone: [60, 100] }] },
  ];
  const vsInZoneSince = {};
  function drawVentStatus() {
    let allIn = true;
    const groups = VS_GROUPS.map((g) => {
      const bars = [], timers = [], vals = [];
      for (const d of g.items) {
        const v = d.get();
        const pct = (x) => Math.max(0, Math.min(100, (100 * (x - d.min)) / (d.max - d.min)));
        const inZone = v !== null && v >= d.zone[0] && v <= d.zone[1];
        if (!inZone) { allIn = false; vsInZoneSince[d.key] = null; } else vsInZoneSince[d.key] ??= vent.time;
        const tIn = inZone ? vent.time - vsInZoneSince[d.key] : 0;
        bars.push(h('div', { class: 'vs-bar' },
          h('div', { class: 'vs-zone', style: { bottom: `${pct(d.zone[0])}%`, height: `${pct(d.zone[1]) - pct(d.zone[0])}%` } }),
          h('span', { class: 'vs-lim', style: { bottom: `calc(${pct(d.zone[1])}% + 2px)` } }, String(d.zone[1])),
          h('span', { class: 'vs-lim lo', style: { bottom: `calc(${pct(d.zone[0])}% + 2px)` } }, String(d.zone[0])),
          v === null ? null : h('div', { class: 'vs-mark', style: { bottom: `calc(${pct(v)}% - 2px)` } })));
        timers.push(h('span', {}, clock(tIn)));
        vals.push(h('div', {}, d.label, h('b', {}, v === null ? '---' : fmt(v, d.d)), h('small', {}, d.unit)));
      }
      return h('div', { class: 'vs-group' }, h('div', { class: 'vs-title' }, g.title), h('div', { class: 'vs-bars' }, ...bars), h('div', { class: 'vs-timers' }, ...timers), h('div', { class: 'vs-vals' }, ...vals));
    });
    ventStatus.replaceChildren(...groups);
    ventStatusPanel.classList.toggle('active', allIn);
  }
  /** Oppsett 1–4 som i Grafikk-vinduet på C6: 1 tre kurver, 2 to kurver + sløyfer, 3 to kurver + paneler, 4 én kurve + store paneler. */
  function applyLayout() {
    const L = ui.layout;
    waves.classList.toggle('with-loops', L === 2);
    waves.classList.toggle('with-panels', L === 3 || L === 4);
    waves.classList.toggle('big-panels', L === 4);
    curves.classList.toggle('three', L === 1);
    curves.classList.toggle('one', L === 4);
    sc.vol.wrap.style.display = L === 1 ? '' : 'none';
    sc.flow.wrap.style.display = L === 4 ? 'none' : '';
    loops.style.display = L === 2 ? '' : 'none';
    panels.style.display = L === 3 || L === 4 ? '' : 'none';
  }

  // ======================= MMP =======================
  const mmpTiles = {};
  for (const m of MMP_MAIN) {
    const val = h('div', { class: 'mmp-value' }, '–');
    const lim = h('div', { class: 'mmp-limits' });
    const el = h('div', { class: `mmp ${m.compact ? 'compact' : ''}`, onClick: () => openWindow('alarms', m.limits?.[0] ?? m.limits?.[1] ?? null) }, lim, h('div', { class: 'mmp-main' }, val, h('div', { class: 'mmp-label' }, m.label, h('span', { class: 'mmp-unit' }, m.unit))));
    mmpTiles[m.key] = { el, val, lim, def: m };
    mmpCol.append(el);
  }
  const withGas = (m) => ({ ...m, spo2: gas.state.spo2 * 100, petco2: vent.disconnected ? 0 : gas.petco2, paco2: gas.state.paco2, pao2: gas.state.pao2 });
  const limitValue = (key) => (key === 'pmax' ? vent.settings.pmax : ui.alarms[key]);
  function updateMMP(mRaw) {
    const m = withGas(mRaw);
    const alarmByKey = {}, limitHit = {};
    for (const a of ui.activeAlarms) if (a.mmp) { alarmByKey[a.mmp] = a.priority === 'high' ? 'high' : (alarmByKey[a.mmp] ?? 'medium'); if (a.limit) limitHit[`${a.mmp}:${a.limit}`] = a.priority; }
    for (const [key, t] of Object.entries(mmpTiles)) {
      let cls = `mmp ${t.def.compact ? 'compact' : ''}`;
      if (alarmByKey[key]) cls += ` alarm-${alarmByKey[key]}`;
      if (key === 'pplat' && m.pplatMeasured != null) cls += ' measured';
      t.val.textContent = t.def.d === null ? (m[key] ?? '–') : fmt(m[key], t.def.d);
      t.el.className = cls;
      if (t.def.limits) { const [hi, lo] = t.def.limits; t.lim.replaceChildren(h('span', { class: limitHit[`${key}:hi`] ? `hit-${limitHit[`${key}:hi`]}` : '' }, hi ? String(limitValue(hi)) : ''), h('span', { class: limitHit[`${key}:lo`] ? `hit-${limitHit[`${key}:lo`]}` : '' }, lo ? String(limitValue(lo)) : '')); }
    }
    monitorRefresh?.();
  }
  let monitorRefresh = null;

  // ======================= Alarmer og meldingslinje =======================
  function evaluateAlarms() {
    const m = vent.measurements, s = vent.settings;
    const list = [];
    if (!ui.running) { ui.activeAlarms = []; return list; }
    const hasBreath = m.breathType !== null;
    if (vent.disconnected || (hasBreath && m.ppeak < m.peep + 2 && s.mode !== 'SPONT')) list.push({ id: 'disc', text: 'Frakobling på pasientsiden', priority: 'high', mmp: 'ppeak' });
    if (m.highPressure || (m.ppeak !== null && m.ppeak >= s.pmax)) list.push({ id: 'phigh', text: 'Trykk høy', priority: 'high', mmp: 'ppeak', limit: 'hi' });
    if (hasBreath && m.expMinVol < ui.alarms.mvLow) list.push({ id: 'mvlow', text: 'Lavt minuttvolum', priority: 'high', mmp: 'expMinVol', limit: 'lo' });
    if (hasBreath && m.expMinVol > ui.alarms.mvHigh) list.push({ id: 'mvhigh', text: 'Høyt minuttvolum', priority: 'high', mmp: 'expMinVol', limit: 'hi' });
    if (vent.backupActive || (vent.time - ui.lastBreathTime > ui.alarms.apnea && vent.time > ui.alarms.apnea)) list.push({ id: 'apnea', text: vent.backupActive ? 'Apné-ventilasjon' : 'Apné', priority: 'high' });
    if (gas.state.spo2 * 100 < ui.alarms.spo2Low) list.push({ id: 'spo2', text: `Lav SpO2 (${fmt(gas.state.spo2 * 100, 0)} %)`, priority: 'high', mmp: 'spo2', limit: 'lo' });
    if (hasBreath && !vent.disconnected && m.vte < ui.alarms.vtLow) list.push({ id: 'vtlow', text: 'Lavt tidevolum', priority: 'medium', mmp: 'vte', limit: 'lo' });
    if (hasBreath && m.vte > ui.alarms.vtHigh) list.push({ id: 'vthigh', text: 'Høyt tidevolum', priority: 'medium', mmp: 'vte', limit: 'hi' });
    if (hasBreath && m.fTotal > ui.alarms.fHigh) list.push({ id: 'fhigh', text: 'Høy frekvens', priority: 'medium', mmp: 'fTotal', limit: 'hi' });
    if (hasBreath && ui.alarms.fLow > 0 && m.fTotal < ui.alarms.fLow) list.push({ id: 'flow', text: 'Lav frekvens', priority: 'medium', mmp: 'fTotal', limit: 'lo' });
    if (m.pressureLimited) list.push({ id: 'plimit', text: 'Trykkbegrensning', priority: 'medium', mmp: 'ppeak' });
    const prev = new Set(ui.activeAlarms.map((a) => a.id)), now = new Set(list.map((a) => a.id));
    for (const a of list) if (!prev.has(a.id)) logEvent(a.text, a.priority);
    for (const a of ui.activeAlarms) if (!now.has(a.id)) logEvent(`${a.text} (avsluttet)`, '', 'Alarm');
    ui.activeAlarms = list;
    return list;
  }
  function renderMsgBar() {
    const list = ui.activeAlarms;
    const high = list.some((a) => a.priority === 'high');
    audio.setAlarm(list.length ? (high ? 'high' : 'medium') : null);
    msgBar.className = `hc-msg ${list.length ? (high ? 'high' : 'medium') : ''}`;
    clear(msgBar);
    // C6 viser én melding om gangen: den med høyest prioritet (nyeste først)
    const top = list.find((a) => a.priority === 'high') ?? list[0];
    const text = list.length ? `${top.text}${list.length > 1 ? `  (+${list.length - 1})` : ''}` : (ui.o2Enrich ? `O2-anrikning: ${fmt(Math.max(0, ui.o2Enrich.until - vent.time), 0)} s igjen` : (!ui.running ? 'Standby – ingen ventilasjon leveres' : ''));
    msgBar.append(h('span', { class: 'hc-msg-text' }, text));
    if (audio.enabled && audio.silenced) msgBar.append(h('span', { class: 'hc-silenced' }, `🔕 ${clock(audio.silencedFor)}`));
    alarmsBtn.classList.toggle('alarming', high);
    silenceBtn.classList.toggle('alarming', list.length > 0 && !audio.silenced);
  }
  function logEvent(text, priority = '', cat = null) {
    const category = cat ?? (priority === 'high' ? '!!!' : priority === 'medium' ? '!!' : 'Info');
    ui.events.unshift({ t: vent.time, text, priority, cat: category });
    if (ui.events.length > 200) ui.events.length = 200;
    if (ui.window === 'events') openWindow('events', true);
  }

  // ======================= Topplinje, klokke, ringer =======================
  function renderTop() {
    const s = vent.settings;
    clear(modeBtn);
    modeBtn.classList.toggle('standby', !ui.running);
    modeBtn.innerHTML = PERSON_ICON;
    modeBtn.append(h('div', { class: 'hc-mode-name' }, ui.running ? MODES[s.mode].label : 'Standby'));
    renderMsgBar(); renderRings();
  }
  function renderClock() {
    const now = new Date();
    clockBox.replaceChildren(
      h('div', { class: 'clock-text' }, h('span', {}, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`), h('span', {}, clock(vent.time)), h('small', {}, ui.speed === 1 ? 'simulert tid' : `${ui.speed}×`)),
      h('button', { type: 'button', class: 'menu', 'aria-label': 'System', onClick: () => openWindow('system') }, '☰'));
  }
  function knobEl(item, active, onClick) {
    return h('button', { type: 'button', class: `knob ${active ? 'active' : ''}`, dataset: { key: item.key }, onClick },
      h('div', { class: 'ring' }, h('div', { class: 'ring-value' }, item.fmtFn(item.value)), h('div', { class: 'ring-unit' }, item.unit)), h('div', { class: 'ring-label' }, item.label));
  }
  function renderRings() {
    clear(rings);
    const s = vent.settings;
    for (const key of RING_KEYS[s.mode] ?? []) {
      const item = ctlItem(key, s);
      rings.append(knobEl(item, ui.window === 'controls' && !ui.pending && ui.focusKey === key, () => openWindow('controls', key)));
    }
  }

  // ======================= Endring av innstillinger =======================
  function applyPartial(partial, { silent = false, label = null } = {}) {
    const before = structuredClone(vent.settings);
    vent.setSettings(partial);
    if (!silent) {
      const key = label ?? Object.keys(partial)[0];
      const fmtV = (s) => (key === 'ie' ? ieLabel(s.ie) : key === 'trigger' ? s.trigger.value : key === 'mode' ? MODES[s.mode].label : key === 'backupRate' ? s.backup.rate : key === 'backupPcontrol' ? s.backup.pcontrol : s[key]);
      logEvent(`${settingLabel(key)} ${fmtV(before)} -> ${fmtV(vent.settings)}`, '', key === 'mode' ? 'Mode' : 'Control');
    }
    updateMarkers(); renderTop();
  }
  function applySetting(key, value, opts = {}) {
    const s = vent.settings;
    const partial = CTL[key]?.set ? CTL[key].set(s, value) : key === 'triggerType' ? { trigger: { type: value, value: 2 } } : { [key]: value };
    applyPartial(partial, { ...opts, label: key === 'triggerType' ? 'trigger' : key });
  }
  const PREDICTABLE = new Set(['vt', 'rate', 'peep', 'ie', 'ti', 'pcontrol', 'psupport', 'tip', 'flowPattern', 'ets', 'pramp', 'pmax']);
  function changeSetting(key, value, after) {
    const s = vent.settings;
    const oldValue = key === 'ie' ? s.ie : s[key];
    const newValue = key === 'ie' ? IE_OPTIONS[value].ie : value;
    if (ui.task && PREDICTABLE.has(key)) {
      const q = predictionFor({ key, oldValue, newValue, settings: s, patient: vent.patient, focus: ui.task.task.focus });
      if (q) { showPrediction(q, () => { applySetting(key, value); after?.(); }, () => after?.()); return; }
    }
    applySetting(key, value); after?.();
  }

  // ======================= Vinduer (lyse, som på C6) =======================
  let windowEl = null;
  function closeWindow() {
    windowEl?.remove(); windowEl = null; ui.window = null; ui.focusKey = null; ui.pending = null;
    hc.querySelectorAll('.hc-btn[data-win]').forEach((b) => b.classList.remove('active'));
    rings.querySelectorAll('.knob').forEach((b) => b.classList.remove('active'));
  }
  function openWindow(name, focusKey) {
    if (ui.window === name && !focusKey) { closeWindow(); return; }
    const pending = ui.pending; // beholdes ved re-rendering av Kontroller under modusbytte
    closeWindow();
    if (name === 'controls') ui.pending = pending;
    ui.window = name; ui.focusKey = typeof focusKey === 'string' ? focusKey : null;
    hc.querySelectorAll('.hc-btn[data-win]').forEach((b) => b.classList.toggle('active', b.dataset.win === name));
    rings.querySelectorAll('.knob').forEach((b) => b.classList.toggle('active', name === 'controls' && !ui.pending && b.dataset.key === ui.focusKey));
    const head = h('div', { class: 'hc-window-head' }, h('button', { class: 'hc-close', type: 'button', 'aria-label': 'Lukk', onClick: () => closeWindow() }, '✕'), h('h2', {}, WINDOWS[name]));
    const side = h('div', { class: 'hc-window-side' });
    const main = h('div', { class: 'hc-window-main' });
    const foot = h('div', { class: 'hc-window-foot' });
    windowEl = h('div', { class: `hc-window ${name === 'standby' ? 'standby' : ''}`, role: 'dialog' }, head, h('div', { class: 'hc-window-body' }, side, main), foot);
    hc.append(windowEl);
    const win = {
      head, side, main, foot,
      tabs(list, active, onPick) { side.replaceChildren(...list.map(([id, label]) => h('button', { type: 'button', class: id === active ? 'active' : '', onClick: () => onPick(id) }, label))); side.style.display = ''; },
      /** Faner øverst i vinduet (som Monitorering på C6: ✕ til venstre, faner i raden). */
      topTabs(list, active, onPick, { right = false } = {}) { head.classList.add('toptabs'); head.classList.toggle('right', right); head.querySelector('h2').replaceChildren(...list.map(([id, label]) => h('button', { type: 'button', class: id === active ? 'active' : '', onClick: () => onPick(id) }, label))); },
    };
    side.style.display = 'none';
    ({ alarms: renderAlarms, controls: renderControls, monitor: renderMonitor, graphics: renderGraphics, tools: renderTools, events: renderEvents, system: renderSystem, modes: renderModes, standby: renderStandby })[name](win, focusKey === true ? null : focusKey);
    if (!foot.childNodes.length) foot.style.display = 'none';
  }
  /** Justering nederst i vinduet: −/+ og glidebryter for valgt ringknapp (erstatter dreieknappen på C6). */
  function adjuster(item, onValue) {
    const clampV = (v) => Number(Math.min(item.max, Math.max(item.min, v)).toFixed(item.dec));
    const range = h('input', { type: 'range', min: String(item.min), max: String(item.max), step: String(item.step), value: String(item.value), 'aria-label': item.label, onChange: (e) => onValue(clampV(Number(e.target.value))) });
    return h('div', { class: 'adj' },
      h('div', { class: 'adj-head' }, h('span', {}, item.label), h('span', { class: 'adj-val' }, item.fmtFn(item.value), ' ', h('small', {}, item.unit))),
      h('div', { class: 'adj-row' },
        h('button', { type: 'button', class: 'adj-btn', 'aria-label': 'Mindre', onClick: () => onValue(clampV(item.value - item.step)) }, '−'),
        range,
        h('button', { type: 'button', class: 'adj-btn', 'aria-label': 'Mer', onClick: () => onValue(clampV(item.value + item.step)) }, '+')));
  }
  const c6btn = (label, { onClick, disabled = false, green = false } = {}) => h('button', { type: 'button', class: `btn-c6 ${green ? 'green' : ''}`, disabled, onClick }, label);

  // ---------- Modus ----------
  function renderModes(win) {
    const current = vent.settings.mode;
    let selected = current;
    const groups = h('div', { class: 'mode-groups' });
    const confirm = c6btn('Bekreft', { disabled: true, onClick: () => {
      ui.pending = { settings: { ...structuredClone(vent.settings), mode: selected } };
      openWindow('controls', true);
    } });
    const render = () => {
      groups.replaceChildren(...MODE_GROUPS.map((g) => h('div', { class: 'mode-group' }, h('h4', {}, g.title), h('div', { class: 'row-btns' }, ...g.modes.map(([id, label]) => {
        const sim = !!MODES[id];
        return h('button', { type: 'button', class: `mode-btn ${id === current ? 'current' : ''} ${id === selected && id !== current ? 'selected' : ''}`, disabled: !sim, title: sim ? MODES[id].description : 'Finnes på C6, ikke i simulatoren', onClick: () => { selected = id; confirm.disabled = selected === current; render(); } }, label);
      })))));
    };
    render();
    win.main.append(groups, h('p', { class: 'faint', style: { fontSize: '0.78rem' } }, 'Grå modi finnes på C6, men er ikke simulert. Velg modus og trykk Bekreft; deretter settes kontrollene for den nye modusen før den tas i bruk.'));
    win.foot.append(h('span', {}), h('div', { class: 'row' }, c6btn('Avbryt', { onClick: closeWindow }), confirm));
  }

  // ---------- Kontroller ----------
  function renderControls(win, focusKey) {
    const pending = ui.pending;
    const s = pending ? pending.settings : vent.settings;
    const tabs = [['basic', 'Grunn'], ['more', 'Mer'], ...(pending ? [] : [['patient', 'Pasient']])];
    let tab = focusKey === 'height' ? 'patient' : ['apneaTime', 'backupRate', 'backupPcontrol'].includes(focusKey) ? 'more' : 'basic';
    const content = h('div', { class: 'win-content' });
    const info = h('div', { class: 'ctl-info' });
    const modeName = h('div', { class: 'ctl-mode' }, MODES[s.mode].label);
    const renderInfo = () => {
      if (s.mode === 'SPONT') { info.replaceChildren(h('div', {}, `TI max: ${s.tiMax.toFixed(1)} s`), h('div', {}, `ETS: ${s.ets} %`)); return; }
      const t = timingInfo(s, vent.patient);
      info.replaceChildren(h('div', {}, `TI: ${t.ti.toFixed(2)} s`), h('div', {}, `TE: ${t.te.toFixed(2)} s`), (s.mode === 'APVCMV' || s.mode === 'SCMV') ? h('div', {}, `Vt/IBW: ${t.vtKg.toFixed(1)} ml/kg`) : h('div', {}, `I:E ${ieLabel(s.ie)}`));
    };
    const renderTab = () => {
      win.tabs(tabs, tab, (id) => { tab = id; ui.focusKey = null; renderTab(); });
      clear(content);
      if (tab === 'patient') {
        const p = vent.patient;
        content.append(h('div', { class: 'hc-section' }, 'Pasient (IBW beregnes fra kjønn og høyde, som på C6)'));
        content.append(h('div', { class: 'row', style: { gap: '8px' } }, h('button', { type: 'button', class: `mode-btn ${p.sex === 'M' ? 'current' : ''}`, onClick: () => { vent.setPatient({ sex: 'M' }); renderTop(); renderTab(); } }, 'Mann'), h('button', { type: 'button', class: `mode-btn ${p.sex === 'K' ? 'current' : ''}`, onClick: () => { vent.setPatient({ sex: 'K' }); renderTop(); renderTab(); } }, 'Kvinne')));
        const item = { key: 'height', label: 'Pasienthøyde', unit: 'cm', min: 30, max: 250, step: 1, dec: 0, value: p.height, fmtFn: String };
        content.append(h('div', { class: 'knob-grid' }, knobEl(item, true, () => {})), h('p', { class: 'muted' }, `IBW ${fmt(idealBodyWeightHamilton(p.height, p.sex), 1)} kg · Vt 8 ml/kg = ${fmt(8 * idealBodyWeightHamilton(p.height, p.sex), 0)} ml`));
        content.append(adjuster(item, (v) => { vent.setPatient({ height: v }); renderTop(); renderTab(); }));
        return;
      }
      const keys = controlKeys(s, tab);
      const items = keys.map((k) => ctlItem(k, s));
      let selected = items.some((i) => i.key === ui.focusKey) ? ui.focusKey : items[0].key;
      const grid = h('div', { class: 'knob-grid' });
      const adjBox = h('div', {});
      const applyValue = (item, v) => {
        if (pending) { Object.assign(pending.settings, item.set(v)); openWindow('controls', item.key); return; }
        if (item.key === 'trigger' || tab === 'more') { applyPartial(item.set(v), { label: item.key }); openWindow('controls', item.key); return; }
        changeSetting(item.key, v, () => openWindow('controls', item.key));
      };
      const renderGrid = () => {
        grid.replaceChildren(...items.map((it) => knobEl(it, it.key === selected, () => { selected = it.key; ui.focusKey = it.key; renderGrid(); renderAdj(); rings.querySelectorAll('.knob').forEach((b) => b.classList.toggle('active', !pending && b.dataset.key === it.key)); })));
      };
      const renderAdj = () => { const it = items.find((i) => i.key === selected); adjBox.replaceChildren(adjuster(it, (v) => applyValue(it, v))); };
      renderGrid(); renderAdj();
      content.append(grid);
      const extras = h('div', { class: 'row', style: { marginTop: '8px', flexWrap: 'wrap', gap: '8px 14px' } });
      const setLocal = (partial, focus) => { if (pending) { Object.assign(pending.settings, partial); openWindow('controls', focus); } else { applyPartial(partial, { silent: true }); openWindow('controls', focus); } };
      if (tab === 'basic') {
        if (s.mode !== 'SPONT') extras.append(h('span', { class: 'muted' }, 'Tid via'), segmented({ ariaLabel: 'Tidsinnstilling', value: s.timingMode, options: [{ value: 'ie', label: 'I:E' }, { value: 'ti', label: 'TI' }], onChange: (v) => setLocal({ timingMode: v }, v) }).el);
        extras.append(h('span', { class: 'muted' }, 'Trigger'), segmented({ ariaLabel: 'Triggertype', value: s.trigger.type, options: [{ value: 'flow', label: 'F' }, { value: 'pressure', label: 'P' }], onChange: (v) => setLocal({ trigger: { type: v, value: 2 } }, 'trigger') }).el);
        if (s.mode === 'SCMV') extras.append(h('span', { class: 'muted' }, 'Flowmønster'), segmented({ ariaLabel: 'Flowmønster', value: s.flowPattern, options: [{ value: 'square', label: 'Firkant' }, { value: 'decel', label: 'Desel. 50 %' }], onChange: (v) => setLocal({ flowPattern: v }, 'tip') }).el);
      } else {
        extras.append(h('span', { class: 'muted' }, 'Apné-backup: trykkontrollert ventilasjon når pasienten ikke puster innen apnétiden.'));
      }
      content.append(extras, adjBox);
    };
    renderTab(); renderInfo();
    win.main.append(content);
    win.foot.append(h('div', { class: 'row', style: { gap: '14px' } }, modeName, info), pending
      ? h('div', { class: 'row' }, c6btn('Avbryt', { onClick: closeWindow }), c6btn('Bekreft', { onClick: () => { const ns = pending.settings; ui.pending = null; applyPartial(ns, { label: 'mode' }); closeWindow(); } }))
      : h('span', { class: 'faint', style: { fontSize: '0.78rem' } }, 'Endringer virker fra neste pust.'));
  }

  // ---------- Alarmer ----------
  function renderAlarms(win, focusKey) {
    const m = withGas(vent.measurements);
    let selected = focusKey && ALARM_DEF[focusKey] ? focusKey : 'pmax';
    const grid = h('div', { class: 'alarm-grid' });
    const adjBox = h('div', {});
    const limItem = (key) => { const d = ALARM_DEF[key]; return { key, label: d.label, unit: ALARM_COLS.find((c) => c.hi === key || c.lo === key)?.unit ?? '', min: d.min, max: d.max, step: d.step, dec: d.dec ?? 0, value: limitValue(key), fmtFn: (v) => (d.dec ? Number(v).toFixed(d.dec) : String(v)) }; };
    const setLimit = (key, v) => { if (key === 'pmax') applySetting('pmax', v); else { const b = ui.alarms[key]; ui.alarms[key] = v; logEvent(`${ALARM_DEF[key].label} ${b} -> ${v}`, '', 'Alarm'); } updateMMP(vent.measurements); openWindow('alarms', key); };
    const render = () => {
      grid.replaceChildren(...ALARM_COLS.map((c) => {
        const pct = (x) => Math.max(0, Math.min(100, (100 * (x - c.min)) / (c.max - c.min)));
        const cur = c.measure ? m[c.measure] : null;
        const mini = (key) => { if (!key) return h('div', { class: 'knob placeholder' }, h('div', { class: 'ring none' }, '—')); const it = limItem(key); return knobEl({ ...it, label: '' }, key === selected, () => { selected = key; ui.focusKey = key; render(); }); };
        return h('div', { class: 'alarm-col' }, mini(c.hi),
          h('div', { class: 'alarm-bar' },
            c.hi ? h('div', { class: 'lim hi', style: { bottom: `${pct(limitValue(c.hi))}%` } }) : null,
            c.lo ? h('div', { class: 'lim lo', style: { bottom: `${pct(limitValue(c.lo))}%` } }) : null,
            cur != null && Number.isFinite(cur) ? h('div', { class: 'cur', style: { bottom: `${pct(cur)}%` } }) : null),
          mini(c.lo), h('div', { class: 'alarm-label' }, c.label, h('small', {}, c.unit)));
      }));
      adjBox.replaceChildren(adjuster(limItem(selected), (v) => setLimit(selected, v)));
    };
    render();
    win.main.append(h('div', { class: 'hc-section' }, 'Grenser (øvre ring = høy grense, nedre ring = lav grense; søylen viser måleverdien)'), grid, adjBox);
    win.main.append(h('p', { class: 'faint', style: { fontSize: '0.8rem' } }, `Plimit = Pmax − 10 = ${vent.settings.pmax - 10} cmH2O begrenser levert trykk. Ved Pmax åpnes ekspirasjonsventilen (høyprioritetsalarm).`));
    const auto = c6btn('Auto', { onClick: () => {
      const r = (v, s) => Math.round(v / s) * s;
      if (m.expMinVol) { ui.alarms.mvHigh = Math.max(2, r(m.expMinVol * 1.5, 0.5)); ui.alarms.mvLow = Math.max(0.5, r(m.expMinVol * 0.5, 0.5)); }
      if (m.vte) { ui.alarms.vtHigh = Math.min(2000, r(m.vte * 1.5, 10)); ui.alarms.vtLow = Math.max(50, r(m.vte * 0.5, 10)); }
      if (m.fTotal) ui.alarms.fHigh = Math.min(80, Math.round(m.fTotal + 15));
      if (m.ppeak) applySetting('pmax', Math.min(70, Math.max(15, Math.round(m.ppeak + 15))));
      logEvent('Alarmgrenser satt automatisk', '', 'Alarm'); updateMMP(vent.measurements); openWindow('alarms', selected);
    } });
    const buffer = h('div', { class: 'event-list' }, ...(ui.activeAlarms.length ? ui.activeAlarms.map((a) => h('div', { class: `ev ${a.priority}` }, h('time', {}, a.priority === 'high' ? 'HØY' : 'MIDDELS'), h('span', {}, a.text))) : [h('div', { class: 'muted' }, 'Ingen aktive alarmer.')]));
    win.main.append(h('div', { class: 'hc-section' }, 'Aktive alarmer'), buffer);
    win.foot.append(auto, h('span', { class: 'faint', style: { fontSize: '0.78rem' } }, 'Auto setter grensene rundt gjeldende måleverdier (som på C6).'));
  }

  // ---------- Monitorering (som C6: faner General, CO2, SpO2, Pes; stort tall med navn og enhet ved siden av) ----------
  const flowPeaks = { insp: 0, exp: 0, curInsp: 0, curExp: 0, breath: null };
  function monitorValues() {
    const m = withGas(vent.measurements), s = vent.settings;
    const ibw = m.ibw ?? idealBodyWeightHamilton(vent.patient.height, vent.patient.sex);
    const vd = anatomicDeadspace(ibw);
    const vtalv = m.vte != null ? Math.max(0, m.vte - vd) : null;
    const f = m.fTotal ?? 0;
    const spont = m.fSpont ?? 0;
    const vteSpont = spont > 0 && m.breathType === 'spont' ? m.vte : 0;
    const mvSpont = m.expMinVol != null && f > 0 ? (m.expMinVol * spont) / f : 0;
    const petKpa = vent.disconnected ? 0 : gas.petco2;
    const none = null;
    return {
      general: [
        [['Ppeak', m.ppeak, 'cmH2O', 0], ['Pplateau', m.pplat, 'cmH2O', 0], ['ΔP', m.drivingPressure, 'cmH2O', 0], ['Pmean', m.pmean, 'cmH2O', 0], ['PEEP/CPAP', m.peepTotal, 'cmH2O', 0], ['AutoPEEP', m.autoPeep, 'cmH2O', 1]],
        [['Insp Flow', flowPeaks.insp, 'l/min', 1], ['Exp Flow', flowPeaks.exp, 'l/min', 1], ['VTI', m.vti, 'ml', 0], ['VTE', m.vte, 'ml', 0], ['VTESpont', vteSpont, 'ml', 0], ['ExpMinVol', m.expMinVol, 'l/min', 1], ['MVSpont', mvSpont, 'l/min', 2]],
        [['fTotal', m.fTotal, 'b/min', 0], ['fSpont', m.fSpont, 'b/min', 0], ['TI', m.ti, 's', 1], ['TE', m.te, 's', 1], ['I:E', m.ieText, '', null], ['Vt/IBW', m.vtPerKg, 'ml/kg', 1]],
        [['Rinsp', m.rinsp, 'cmH2O/l/s', 0], ['Cstat', m.cstat, 'ml/cmH2O', 1], ['RCexp', m.rcexp, 's', 2], ['VLeak', vent.leak * 100, '%', 0], ['MVLeak', m.expMinVol != null ? (m.expMinVol * vent.leak) / Math.max(0.01, 1 - vent.leak) : null, 'l/min', 2], ['Oxygen', s.fio2, '%', 0]],
        [['Pcuff', none, 'cmH2O', 0], ['T humidifier', none, 'mA', 0], ['P0.1', none, 'cmH2O', 0], ['PTP', none, 'cmH2O*s', 0]],
      ],
      co2: [
        [['VDaw', vd, 'ml', 0], ['slopeCO2', none, '%CO2/l', 1], ['Vtalv', vtalv, 'ml', 0], ["V'alv", vtalv != null ? (vtalv * f) / 1000 : null, 'l/min', 1], ['VDaw/VTE', m.vte ? (100 * vd) / m.vte : null, '%', 0], ['PetCO2', petKpa, 'kPa', 1], ['FetCO2', (100 * petKpa) / 95, '%', 1]],
        [['VeCO2', f > 0 ? gas.params.vco2 / f : null, 'ml', 1], ['ViCO2', 0, 'ml', 1], ["V'CO2", vent.disconnected ? 0 : gas.params.vco2, 'ml/min', 0]],
      ],
      spo2: [
        [['SpO2', gas.state.spo2 * 100, '%', 0], ['SpO2/FiO2', (gas.state.spo2 * 100) / (s.fio2 / 100) / 100, '', 1], ['Pulse', currentVitals().hr, '1/min', 0]],
      ],
      pes: [
        [['Pes max', none, 'cmH2O', 0], ['Pes plateau', none, 'cmH2O', 0], ['Pes min', none, 'cmH2O', 0], ['Pes P0.1', none, 'cmH2O', 0], ['Pes PTP', none, 'cmH2O', 0]],
        [['Ptrans I', none, 'cmH2O', 0], ['Ptrans E', none, 'cmH2O', 0]],
      ],
    };
  }
  function renderMonitor(win) {
    let tab = 'general';
    const panel = h('div', { class: 'mon-panel' });
    const render = () => {
      win.topTabs([['general', 'General'], ['co2', 'CO2'], ['spo2', 'SpO2'], ['pes', 'Pes']], tab, (id) => { tab = id; render(); });
      monitorRefresh = () => {
        const cols = monitorValues()[tab];
        panel.replaceChildren(...cols.map((col) => h('div', { class: 'mon-col' }, ...col.map(([label, v, unit, d]) => h('div', { class: 'mon-item' },
          h('span', { class: 'mon-val' }, v == null || (typeof v === 'number' && !Number.isFinite(v)) ? '---' : d === null ? String(v) : fmt(v, d)),
          h('span', { class: 'mon-lbl' }, label, h('small', {}, unit)))))));
      };
      monitorRefresh();
    };
    render();
    win.main.append(panel);
    win.main.classList.add('mon-main');
  }

  // ---------- Grafikk ----------
  function renderGraphics(win) {
    const thumbs = [
      [1, 'Oppsett 1', h('div', { class: 'thumb' }, h('i', {}), h('i', {}), h('i', {}))],
      [2, 'Oppsett 2', h('div', { class: 'thumb' }, h('i', {}), h('i', {}), h('span', { class: 'half' }, h('i', {}), h('i', {})))],
      [3, 'Oppsett 3', h('div', { class: 'thumb' }, h('i', {}), h('i', {}), h('span', { class: 'half blue' }, h('i', {}), h('i', {})))],
      [4, 'Oppsett 4', h('div', { class: 'thumb' }, h('i', {}), h('span', { class: 'half blue tall' }, h('i', {}), h('i', {})))],
    ];
    const row = h('div', { class: 'layout-row' });
    const render = () => row.replaceChildren(...thumbs.map(([id, label, th]) => h('button', { type: 'button', class: `layout-btn ${ui.layout === id ? 'current' : ''}`, onClick: () => { ui.layout = id; applyLayout(); render(); } }, th, h('span', {}, label))));
    render();
    win.main.append(h('div', { class: 'hc-section' }, 'Oppsett'), row);
    win.main.append(h('p', { class: 'faint', style: { fontSize: '0.8rem' } }, '1: tre kurver. 2: to kurver + sløyfer. 3: to kurver + Dynamic Lung og Vent Status. 4: Paw + store paneler.'));
    win.main.append(h('div', { class: 'hc-section' }, 'Tidsskala (s)'));
    win.main.append(segmented({ ariaLabel: 'Tidsskala', value: String(sc.paw.sweep ?? 11), options: [{ value: '5.5', label: '5,5' }, { value: '11', label: '11' }, { value: '22', label: '22' }, { value: '33', label: '33' }], onChange: (v) => { for (const s of Object.values(sc)) { s.setSweep(Number(v)); s.sweep = Number(v); } } }).el);
    win.main.append(h('p', { class: 'faint', style: { fontSize: '0.8rem' } }, 'C6 bruker 22 s som standard for voksne; her er 11 s valgt fordi skjermen er mindre.'));
    win.main.append(h('div', { class: 'hc-section' }, 'Frys'));
    win.main.append(toggle({ label: 'Frys kurvene (ventilasjonen fortsetter)', checked: ui.frozen, onChange: (v) => setFrozen(v) }).el);
    win.foot.append(c6btn('Standard', { onClick: () => { ui.layout = 3; applyLayout(); for (const s of Object.values(sc)) { s.setSweep(11); s.sweep = 11; } setFrozen(false); openWindow('graphics', true); } }));
  }
  function setFrozen(v) { ui.frozen = v; hc.classList.toggle('frozen', v); freezeBtn.classList.toggle('on', v); }

  // ---------- Verktøy (som C6: faner P/V Tool, Hold, Utilities, Configuration; Hold har to knapper midt i vinduet) ----------
  function renderTools(win, focusKey) {
    let tab = focusKey === 'utilities' ? 'utilities' : 'hold';
    const content = h('div', { class: 'ev-panel tools-panel' });
    const result = h('div', { class: 'feedback info', style: { minHeight: '48px' } }, 'Hold inne knappen. Holdet starter ved neste faseovergang og varer til du slipper (maks 10 s).');
    const mkHold = (type, label) => {
      const btn = h('button', { type: 'button', class: 'btn-c6 tool-btn hc-hold' }, label);
      const start = (e) => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); vent.requestHold(type); btn.classList.add('holding'); };
      const stop = () => { if (!btn.classList.contains('holding')) return; vent.releaseHold(); btn.classList.remove('holding'); };
      btn.addEventListener('pointerdown', start); btn.addEventListener('pointerup', stop); btn.addEventListener('pointercancel', stop); btn.addEventListener('lostpointercapture', stop);
      return btn;
    };
    const render = () => {
      win.topTabs([['pv', 'P/V Tool'], ['hold', 'Hold'], ['utilities', 'Utilities'], ['config', 'Configuration']], tab, (id) => { tab = id; render(); });
      clear(content);
      if (tab === 'hold') {
        content.append(h('div', { class: 'tool-center' }, mkHold('insp', 'Inspirasjonshold'), mkHold('exp', 'Ekspirasjonshold')), result);
      } else if (tab === 'utilities') {
        content.append(h('div', { class: 'tool-center' },
          c6btn('Manuell pust', { onClick: () => { if (vent.manualBreath()) logEvent('Manuell pust', '', 'Control'); else toast('Vent til ekspirasjonsfasen.', { kind: 'warn' }); } }),
          c6btn(ui.o2Enrich ? 'Avbryt O2-anrikning' : 'O2-anrikning (100 % i 2 min)', { onClick: () => { toggleO2Enrich(); openWindow('tools', 'utilities'); } }),
          h('div', { class: 'row', style: { justifyContent: 'center' } }, h('span', { class: 'muted' }, 'Simuleringshastighet'), segmented({ ariaLabel: 'Hastighet', value: String(ui.speed), options: [{ value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }], onChange: (v) => { ui.speed = Number(v); renderClock(); } }).el)));
      } else {
        content.append(h('div', { class: 'tool-center' }, h('p', { class: 'muted' }, tab === 'pv' ? 'P/V Tool (statisk trykk/volum-manøver) er ikke simulert.' : 'Konfigurasjon er ikke tilgjengelig i simulatoren.')));
      }
    };
    toolsRefresh = () => {
      const r = vent.holdResult; if (!r || tab !== 'hold') return;
      clear(result);
      if (vent.holdActive) result.append(h('b', {}, vent.holdActive === 'insp' ? 'Inspiratorisk hold pågår …' : 'Ekspiratorisk hold pågår …'), ` Paw ${fmt(vent.lung.state.paw, 1)} cmH2O`);
      else if (r.type === 'insp') result.append(h('b', {}, `Pplateau målt: ${fmt(r.pplat, 1)} cmH2O`), h('div', { class: 'muted' }, `Ppeak − Pplat = ${fmt(vent.measurements.ppeak - r.pplat, 1)} (resistiv del). Pplat − PEEPtot = ${fmt(r.pplat - vent.measurements.peepTotal, 1)} (drivtrykk).`));
      else result.append(h('b', {}, `PEEP totalt: ${fmt(r.peepTotal, 1)} cmH2O → AutoPEEP ${fmt(r.autoPeep, 1)} cmH2O`), h('div', { class: 'muted' }, `Innstilt PEEP ${vent.settings.peep}.`));
    };
    render();
    win.main.classList.add('mon-main');
    win.main.append(content);
  }
  let toolsRefresh = null;

  // ---------- Hendelser (som C6: hendelseslogg med tid, kategori og tekst; røde/gule rader for alarmer) ----------
  function renderEvents(win) {
    win.topTabs([['all', 'Alle']], 'all', () => {}, { right: true });
    win.main.classList.add('mon-main');
    const now = new Date();
    const date = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (!ui.events.length) { win.main.append(h('div', { class: 'ev-panel' }, h('p', { class: 'muted', style: { padding: '12px' } }, 'Ingen hendelser ennå. Alarmer, innstillingsendringer og manøvrer logges her.'))); return; }
    win.main.append(h('div', { class: 'ev-panel' }, ...ui.events.map((e) => h('div', { class: `ev-row ${e.priority}` }, h('span', {}, `${date} ${clock(e.t)}`), h('span', {}, e.cat ?? 'Info'), h('span', {}, e.text)))));
  }

  // ---------- System ----------
  function renderSystem(win) {
    let tab = 'info';
    const content = h('div', {});
    const render = () => {
      win.tabs([['info', 'Info'], ['sound', 'Lyd'], ['reset', 'Nullstill']], tab, (id) => { tab = id; render(); });
      clear(content);
      if (tab === 'info') {
        const rowI = (k, v) => h('div', { class: 'info-row' }, h('span', {}, k), h('b', {}, v));
        content.append(rowI('Modell', 'IntensivLab respiratorsimulator (etter HAMILTON-C6)'), rowI('Simulert tid', clock(vent.time)), rowI('Modus', MODES[vent.settings.mode].label), rowI('Pasient', `${vent.patient.sex === 'K' ? 'Kvinne' : 'Mann'}, ${vent.patient.height} cm, IBW ${fmt(idealBodyWeightHamilton(vent.patient.height, vent.patient.sex), 0)} kg`));
        content.append(h('p', { class: 'muted', style: { fontSize: '0.85rem', marginTop: '10px' } }, 'Læringsverktøy, ikke til klinisk bruk. Skjermen er lagt opp etter HAMILTON-C6, men er ikke en gjengivelse av programvaren. Formler og kilder: ', h('a', { href: './KILDER.md', target: '_blank' }, 'KILDER.md'), '.'));
      } else if (tab === 'sound') {
        const o = audio.options;
        const setO = (p) => { audio.setOptions(p); saveAudio(); };
        content.append(h('p', { class: 'faint', style: { fontSize: '0.85rem' } }, audio.enabled ? 'Lyd er på.' : 'Slå på lyd med «Lyd»-knappen nederst til venstre (nettleseren krever et trykk først).'));
        content.append(slider({ label: 'Volum', unit: '', min: 0, max: 1, step: 0.05, value: o.volume, onChange: (v) => setO({ volume: v }) }).el);
        content.append(h('div', { class: 'row', style: { flexWrap: 'wrap' } },
          toggle({ label: 'Respirator og pust', checked: o.breath, onChange: (v) => setO({ breath: v }) }).el,
          toggle({ label: 'Pasientlyder', checked: o.patient, onChange: (v) => setO({ patient: v }) }).el,
          toggle({ label: 'Alarmer', checked: o.alarms, onChange: (v) => setO({ alarms: v }) }).el,
          toggle({ label: 'Pulstone (SpO2)', checked: o.pulse, onChange: (v) => setO({ pulse: v }) }).el));
      } else {
        content.append(h('div', { class: 'row', style: { flexWrap: 'wrap' } },
          c6btn('Nullstill innstillinger', { onClick: () => { vent.setSettings({ ...structuredClone(DEFAULT_SETTINGS), vt: startupVt(vent.patient) }); vent.reset(); logEvent('Innstillinger nullstilt', '', 'Control'); refreshAll(); } }),
          c6btn('Slett lagret fremdrift', { onClick: () => { storage.remove('respirator:progress'); progress.predictions = { correct: 0, total: 0 }; toast('Fremdrift slettet'); } })));
      }
    };
    render();
    win.main.append(content);
  }

  // ---------- Standby ----------
  function renderStandby(win) {
    win.head.style.display = 'none';
    const p = vent.patient;
    const item = { key: 'height', label: 'Pasienthøyde', unit: 'cm', min: 30, max: 250, step: 1, dec: 0, value: p.height, fmtFn: String };
    const body = h('div', { class: 'standby-body' },
      h('div', { class: 'standby-tabs' }, h('button', { type: 'button', disabled: true }, 'Neonatal'), h('button', { type: 'button', class: 'active' }, 'Voksen/barn'), h('button', { type: 'button', disabled: true }, 'Siste pasient')),
      h('div', { class: 'standby-row' },
        h('div', { class: 'row', style: { gap: '8px' } }, h('button', { type: 'button', class: `mode-btn ${p.sex === 'M' ? 'current' : ''}`, onClick: () => { vent.setPatient({ sex: 'M' }); openWindow('standby', true); } }, '♂ Mann'), h('button', { type: 'button', class: `mode-btn ${p.sex === 'K' ? 'current' : ''}`, onClick: () => { vent.setPatient({ sex: 'K' }); openWindow('standby', true); } }, '♀ Kvinne')),
        h('div', { class: 'row', style: { gap: '14px', alignItems: 'center' } }, knobEl(item, true, () => {}), h('div', {}, h('b', { style: { fontSize: '1.6rem', fontWeight: 300 } }, fmt(idealBodyWeightHamilton(p.height, p.sex), 0)), ' kg', h('small', { style: { display: 'block' } }, 'IBW')))),
      adjuster(item, (v) => { vent.setPatient({ height: v }); openWindow('standby', true); }),
      h('div', { class: 'row', style: { marginTop: '10px', justifyContent: 'space-between' } }, c6btn('Forhåndssjekk', { onClick: () => toast('Forhåndssjekk: simulert OK.', { kind: 'ok' }) }), c6btn('Start ventilasjon', { green: true, onClick: () => startVentilation() })));
    win.main.append(h('div', { class: 'standby-head' }, h('div', { class: 'standby-title' }, 'Standby'), h('div', { class: 'standby-sub' }, 'Ingen ventilasjon leveres til pasienten')), body);
  }
  function enterStandby() {
    if (!ui.running) return;
    ui.running = false; logEvent('Standby', '', 'Mode');
    standbyBtn.classList.add('on');
    renderTop(); openWindow('standby', true);
  }
  function startVentilation() {
    ui.running = true; logEvent('Ventilasjon startet', '', 'Mode');
    standbyBtn.classList.remove('on');
    ui.lastBreathTime = vent.time;
    closeWindow(); refreshAll();
  }

  // ======================= Hurtigknapper og bunnlinje =======================
  const soundBtn = h('button', { type: 'button', class: 'hc-btn', title: 'Lyd av/på', onClick: async () => {
    if (audio.enabled) audio.disable(); else if (!(await audio.enable())) { toast('Nettleseren støtter ikke lyd her.', { kind: 'warn' }); return; }
    soundBtn.classList.toggle('on', audio.enabled); soundBtn.replaceChildren(h('span', { class: 'ico' }, audio.enabled ? '🔊' : '🔇'), 'Lyd'); renderMsgBar();
  } }, h('span', { class: 'ico' }, '🔇'), 'Lyd');
  const silenceBtn = h('button', { type: 'button', class: 'hc-btn', title: 'Audio pause 2 min', onClick: () => { if (!audio.enabled) { toast('Slå på lyd først.', { kind: 'warn' }); return; } audio.silenced ? audio.unsilence() : audio.silence(120); logEvent(audio.silenced ? 'Audio pause 2 min' : 'Audio pause avbrutt', '', 'Alarm'); renderMsgBar(); } }, h('span', { class: 'ico' }, '🔕'), 'Pause');
  const o2Btn = h('button', { type: 'button', class: 'hc-btn', title: 'O2-anrikning: 100 % i 2 min', onClick: () => toggleO2Enrich() }, h('span', { class: 'ico' }, 'O₂'), '2 min');
  const breathBtn = h('button', { type: 'button', class: 'hc-btn', title: 'Manuell pust', onClick: () => { if (vent.manualBreath()) logEvent('Manuell pust', '', 'Control'); } }, h('span', { class: 'ico' }, '💨'), 'Man. pust');
  const standbyBtn = h('button', { type: 'button', class: 'hc-btn', title: 'Standby', onClick: () => { if (ui.running) enterStandby(); else openWindow('standby', true); } }, h('span', { class: 'ico' }, '⏻'), 'Standby');
  quick.append(silenceBtn, breathBtn, o2Btn, soundBtn, standbyBtn);
  const homeBtn = h('button', { type: 'button', class: 'hc-btn icon', title: 'Hovedskjerm', onClick: () => { if (ui.running) closeWindow(); } }, '⌂');
  const freezeBtn = h('button', { type: 'button', class: 'hc-btn icon', title: 'Frys kurvene', onClick: () => setFrozen(!ui.frozen) }, '⟨⟩');
  bottom.append(homeBtn, freezeBtn);
  for (const id of BOTTOM_WINDOWS) bottom.append(h('button', { type: 'button', class: 'hc-btn', dataset: { win: id }, onClick: () => openWindow(id) }, WINDOWS[id]));

  function toggleO2Enrich() {
    if (ui.o2Enrich) { applySetting('fio2', ui.o2Enrich.prev, { silent: true }); ui.o2Enrich = null; logEvent('O2-anrikning avbrutt', '', 'Control'); o2Btn.classList.remove('on'); }
    else { ui.o2Enrich = { until: vent.time + 120, prev: vent.settings.fio2 }; applySetting('fio2', 100, { silent: true }); logEvent('O2-anrikning 100 % i 2 min', '', 'Control'); o2Btn.classList.add('on'); }
    renderMsgBar();
  }

  // ======================= Sidepanel =======================
  function renderTabs() {
    clear(sideTabs);
    for (const [id, label] of [['patient', 'Pasient'], ['situations', 'Caser'], ['tasks', 'Oppgaver']]) {
      sideTabs.append(h('button', { type: 'button', class: ui.tab === id ? 'active' : '', onClick: () => { ui.tab = id; if (id === 'situations') ui.unread = 0; renderTabs(); renderSide(); } }, label, id === 'situations' && ui.unread && ui.tab !== id ? h('span', { class: 'badge danger' }, String(ui.unread)) : null));
    }
  }
  function renderSide() { clear(sideBody); ({ patient: renderPatientTab, situations: renderSituationsTab, tasks: renderTasksTab })[ui.tab](sideBody); }
  function currentVitals() {
    if (ui.situation) return ui.situation.sit.vitals({ gas: gas.state });
    return computeVitals({ hr: 78, sys: 122, dia: 68, temp: 37.1 }, null, 0, gas.state.spo2);
  }
  function renderMonitorPanel() {
    const v = currentVitals();
    const spo2 = gas.state.spo2 * 100;
    const pv = (cls, label, value, alarm = false) => h('div', { class: `pv ${cls} ${alarm ? 'alarm' : ''}` }, h('span', { class: 'pv-label' }, label), h('span', { class: 'pv-value' }, value));
    pmon.replaceChildren(pv('spo2', 'SpO2 %', fmt(spo2, 0), spo2 < ui.alarms.spo2Low), pv('hr', 'Puls', String(v.hr), v.hr > 120), pv('bp', 'BT', `${v.sys}/${v.dia}`, v.sys < 90), pv('rf', 'RF', fmt(vent.measurements.fTotal, 0)), pv('temp', 'Temp', fmt(v.temp, 1)));
  }

  function renderPatientTab(body) {
    if (ui.task || ui.situation) { body.append(h('div', { class: 'placeholder' }, 'Pasienten er låst mens en oppgave eller case pågår. Bruk målinger, hold-manøvrer og undersøkelser.')); return; }
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
    body.append(slider({ label: 'Resistance, inspiratorisk', unit: 'cmH2O/(l/s)', min: 2, max: 50, step: 1, value: p.resistance, onChange: (v) => setP({ resistance: v }) }).el);
    body.append(slider({ label: 'Resistance, ekspiratorisk', unit: 'cmH2O/(l/s)', min: 2, max: 60, step: 1, value: p.resistanceExp ?? p.resistance, onChange: (v) => setP({ resistanceExp: v }) }).el);
    body.append(h('div', { class: 'hc-section' }, 'Egen pusteinnsats'));
    body.append(slider({ label: 'Pmus', unit: 'cmH2O', min: 0, max: 25, step: 1, value: p.effort.amplitude, onChange: (v) => setP({ effort: { amplitude: v } }) }).el);
    body.append(slider({ label: 'Egenfrekvens', unit: '/min', min: 6, max: 40, step: 1, value: p.effort.rate, onChange: (v) => setP({ effort: { rate: v } }) }).el);
    body.append(h('div', { class: 'hc-section' }, 'Gassutveksling (forenklet)'));
    body.append(slider({ label: 'Shunt', unit: '%', min: 0, max: 60, step: 1, value: Math.round(gas.params.shunt * 100), onChange: (v) => { gas.setParams({ shunt: v / 100 }); ui.profileId = 'egen'; } }).el);
    body.append(slider({ label: 'Rekrutterbarhet med PEEP', unit: '', min: 0, max: 1, step: 0.1, value: gas.params.recruitability, onChange: (v) => { gas.setParams({ recruitability: v }); ui.profileId = 'egen'; } }).el);
    body.append(h('p', { class: 'faint', style: { fontSize: '0.82rem' } }, 'Høyde og kjønn (IBW) settes på respiratoren under Kontroller › Pasient eller i Standby, som på C6.'));
    refreshInfo();
  }
  function applyProfile(id) {
    const pr = getProfile(id);
    ui.profileId = id;
    vent.setPatient(structuredClone(pr.patient));
    gas.setParams({ ...gasForProfile(id), petGap: 0.5 });
    renderTop();
  }

  // ---------- Caser (situasjoner): valg 1 av 5 på løpende bånd ----------
  function renderSituationsTab(body) {
    const S = ui.situation;
    if (S) {
      body.append(h('div', { class: 'task-brief' }, h('h3', {}, `Case ${S.index + 1}`), h('p', {}, S.def.vignette), h('p', { class: 'muted', style: { margin: 0 } }, 'Tid: ', h('span', { id: 'sit-time' }, `${fmt(Math.max(0, vent.time - S.sit.state.tStart), 0)} s`))));
      if (S.summary) body.append(renderSituationSummary(S));
      S.decisionEl = h('div', {});
      body.append(S.decisionEl);
      renderDecision();
      body.append(h('div', { class: 'row', style: { margin: '10px 0' } }, button(S.summary ? 'Tilbake til listen' : 'Avslutt casen', { onClick: () => endSituation() })));
      body.append(h('div', { class: 'hc-section' }, 'Meldinger'), S.feedEl);
      return;
    }
    body.append(h('p', { class: 'muted' }, 'Falske pasienter der noe skjer underveis. Følg med på respiratoren, monitoren og meldingene. Du får valg (1 av 5) om hva du undersøker og gjør, med noen sekunders pause imellom så du rekker å observere. Står det «Juster respiratoren», gjør du det selv på skjermen.'));
    body.append(h('div', { class: 'row', style: { marginBottom: '8px' } }, button('Tilfeldig case', { variant: 'primary', onClick: () => startSituation(Math.floor(Math.random() * SITUATIONS.length)) })));
    SITUATIONS.forEach((def, i) => body.append(h('div', { class: 'task-item' }, h('h3', {}, `Case ${i + 1}`), h('div', { class: 'muted', style: { fontSize: '0.9rem' } }, def.vignette), h('div', {}, button('Start', { small: true, onClick: () => startSituation(i) })))));
  }
  function renderDecision() {
    const S = ui.situation; if (!S?.decisionEl) return;
    clear(S.decisionEl);
    if (S.summary) return;
    const d = S.sit.decision;
    if (d) {
      S.decisionEl.append(h('div', { class: 'decision' }, h('h3', {}, d.text),
        h('div', { class: 'choices' }, ...d.options.map((o) => h('button', { type: 'button', class: 'choice', onClick: () => chooseOption(o.id) }, o.label))),
        d.skippable ? h('div', { class: 'row', style: { marginTop: '8px' } }, button('Gå rett til tiltak', { small: true, onClick: () => { S.sit.skipToActions(vent.time); renderDecision(); } })) : null));
    } else {
      const wait = S.sit.nextDecisionIn(vent.time);
      if (S.sit.state.status === 'active' && wait > 0) S.decisionEl.append(h('div', { class: 'decision', style: { borderColor: 'var(--border)' } }, h('span', { class: 'wait' }, `Observer pasienten og respiratoren … neste valg om ${fmt(wait, 0)} s`)));
    }
  }
  function chooseOption(id) {
    const S = ui.situation; if (!S) return;
    const r = S.sit.choose(id, vent.time);
    if (!r) return;
    if (r.hold) { vent.requestHold('insp'); ui.autoHoldUntil = vent.time + 4; }
    addFeed({ t: vent.time, who: 'handling', text: `${ACTIONS[id].label}: ${r.text}`, kind: r.kind }, false);
    if (r.kind === 'skadelig') toast('Det tiltaket var skadelig.', { kind: 'danger' });
    if (r.kind === 'riktig') toast('Riktig tiltak.', { kind: 'ok' });
    renderDecision();
  }
  function addFeed(msg, notify = true) {
    const S = ui.situation; if (!S) return;
    const [ico, who] = WHO[msg.who] ?? ['•', msg.who];
    S.feedEl.prepend(h('div', { class: `msg ${msg.kind ?? msg.who}` }, h('span', {}, ico), h('div', {}, h('time', {}, `${clock(msg.t)} · ${who}`), msg.text)));
    if (/host/i.test(msg.text)) audio.cough();
    if (notify) {
      toast(`${ico} ${msg.text}`, { kind: msg.who === 'monitor' || msg.who === 'respirator' ? 'warn' : '', ms: 6000 });
      audio.notify();
      if (ui.tab !== 'situations') { ui.unread += 1; renderTabs(); }
    }
  }
  function renderSituationSummary(S) {
    const sum = S.summary;
    return h('div', { class: `feedback ${sum.solved ? 'correct' : 'wrong'}` },
      h('b', {}, `${sum.solved ? 'Casen er løst' : 'Casen ble avsluttet uløst'}: ${S.def.title}. `),
      sum.timeToFix !== null ? `Tid fra hendelse til riktig tiltak: ${fmt(sum.timeToFix, 0)} s. ` : sum.solved ? 'Løst med respiratorinnstillinger. ' : '',
      `Feil valg: ${sum.wrongActions}.`,
      h('p', { style: { marginTop: '8px' } }, h('b', {}, 'Hva skjedde: '), sum.explanation));
  }
  function startSituation(index) {
    if (ui.task) endTask();
    const def = SITUATIONS[index];
    const patient = { ...structuredClone(getProfile(def.profileId).patient), ...structuredClone(def.patient ?? {}) };
    vent.setSettings(structuredClone(def.settings));
    vent.setPatient(patient);
    vent.setDisconnected(false); vent.setLeak(0);
    gas.setParams({ petGap: 0.5, ...(def.gas ?? gasForProfile(def.profileId)) });
    vent.reset(); vent.run(20);
    ui.lastBreathTime = vent.time;
    updateGasFromVent(); gas.settle();
    const hooks = { getPatient: () => vent.patient, setPatient: (p) => vent.setPatient(p), getGas: () => ({ ...gas.params }), setGas: (g) => gas.setParams(g), setDisconnected: (v) => vent.setDisconnected(v), setLeak: (f) => vent.setLeak(f) };
    const sit = createSituation(def, { hooks });
    sit.start(vent.time);
    ui.situation = { sit, def, index, feedEl: h('div', { class: 'feed' }), summary: null, decisionEl: null };
    ui.running = true; standbyBtn.classList.remove('on'); closeWindow(); ui.events = [];
    refreshAll();
    ui.tab = 'situations'; ui.unread = 0; renderTabs(); renderSide();
    addFeed({ t: vent.time, who: 'kollega', text: 'Pasienten er klar. Følg med.' }, false);
  }
  function finishSituation() {
    const S = ui.situation; if (!S || S.summary) return;
    S.summary = S.sit.summary();
    toast(S.summary.solved ? 'Casen er løst!' : 'Casen er avsluttet.', { kind: S.summary.solved ? 'ok' : 'warn' });
    if (ui.tab === 'situations') renderSide();
  }
  function endSituation() {
    const S = ui.situation; if (!S) return;
    if (!S.summary) finishSituation();
    S.sit.end();
    vent.setDisconnected(false); vent.setLeak(0); gas.setParams({ petGap: 0.5 });
    ui.situation = null;
    applyProfile(ui.profileId === 'egen' ? 'normal' : ui.profileId);
    refreshAll(); renderSide();
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
      if (T.result) body.append(h('div', { class: `feedback ${T.result.ok ? 'correct' : 'wrong'}` }, h('b', {}, T.result.ok ? 'Oppgaven er løst!' : 'Ikke helt ennå.'), h('div', { class: 'crit', style: { marginTop: '8px' } }, ...T.result.items.map((i) => h('div', { class: `crit-item ${i.ok ? 'ok' : 'fail'}` }, h('span', {}, i.ok ? '✓' : '✗'), h('div', {}, h('div', {}, i.label), h('small', {}, i.detail)))))));
      body.append(h('p', { class: 'faint', style: { marginTop: '12px', fontSize: '0.85rem' } }, `Forutsigelser: ${progress.predictions.correct} av ${progress.predictions.total} riktige.`));
      return;
    }
    body.append(h('p', { class: 'muted' }, 'Velg en oppgave. Underveis må du forutsi hva som skjer før hver endring du gjør.'));
    for (const cat of CATEGORIES) {
      body.append(h('div', { class: 'cat-head' }, cat.name));
      for (const t of TASKS.filter((x) => x.cat === cat.id)) body.append(h('div', { class: 'task-item' }, h('h3', {}, t.title), h('div', { class: 'muted', style: { fontSize: '0.88rem' } }, t.goal), h('div', {}, button('Start', { small: true, onClick: () => startTask(t) }))));
    }
  }
  function startTask(task) {
    if (ui.situation) endSituation();
    const setup = taskSetup(task);
    ui.task = { task, hidden: setup.hidden, answer: null, holdDone: false, result: null };
    vent.setSettings(setup.settings); vent.setPatient(setup.patient); vent.setDisconnected(false); vent.setLeak(0);
    gas.setParams({ petGap: 0.5, ...setup.gas });
    vent.reset(); vent.run(15); ui.lastBreathTime = vent.time; updateGasFromVent(); gas.settle();
    ui.running = true; standbyBtn.classList.remove('on'); closeWindow();
    refreshAll();
    ui.tab = 'tasks'; renderTabs(); renderSide();
  }
  function endTask() { ui.task = null; applyProfile(ui.profileId === 'egen' ? 'normal' : ui.profileId); refreshAll(); renderSide(); }
  function checkTask() {
    const T = ui.task; if (!T) return;
    if (!vent.lastBreath) { toast('Vent til respiratoren har levert noen pust.', { kind: 'warn' }); return; }
    T.result = evaluateTask(T.task, { m: vent.measurements, gas: gas.state, settings: vent.settings, alarms: ui.alarms, hidden: T.hidden, answer: T.answer, holdDone: T.holdDone });
    renderSide();
    toast(T.result.ok ? 'Riktig – oppgaven er løst!' : 'Se tilbakemeldingen per kriterium.', { kind: T.result.ok ? 'ok' : 'warn' });
  }

  // ======================= Modal (forutsigelse) =======================
  let modalEl = null;
  function openModal(content) { closeModal(); modalEl = h('div', { class: 'hc-modal-backdrop' }, h('div', { class: 'hc-modal', role: 'dialog' }, ...content)); hc.append(modalEl); }
  function closeModal() { modalEl?.remove(); modalEl = null; }
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
        fb.append(h('div', { class: `feedback ${correct ? 'correct' : 'wrong'}` }, h('b', {}, correct ? 'Riktig. ' : `Ikke riktig – ${mm.label} ${q.expected === 'opp' ? 'øker' : q.expected === 'ned' ? 'synker' : 'er omtrent uendret'}. `), `Simulert steady state: ${mm.label} ${fmt(q.baseValue, mm.decimals)} → ${fmt(q.expectedValue, mm.decimals)} ${mm.unit}.`, h('p', { style: { marginTop: '6px' } }, q.why)));
        clear(actions);
        actions.append(button('Utfør endringen og se på kurvene', { variant: 'primary', onClick: () => { closeModal(); onApply(); } }));
      } }, o.label));
    }
    openModal([h('h3', {}, 'Forutsi først'), h('p', {}, q.text), choices, fb, actions]);
  }

  // ======================= Simuleringsløkke =======================
  let lastSample = null;
  function onSample(s) {
    lastSample = s;
    if (vent.breath !== flowPeaks.breath) { flowPeaks.breath = vent.breath; flowPeaks.insp = flowPeaks.curInsp; flowPeaks.exp = flowPeaks.curExp; flowPeaks.curInsp = 0; flowPeaks.curExp = 0; }
    const fl = s.flow * 60;
    if (fl > flowPeaks.curInsp) flowPeaks.curInsp = fl;
    if (-fl > flowPeaks.curExp) flowPeaks.curExp = -fl;
    if (!ui.frozen) {
      sc.paw.push(s.t, s.paw); sc.flow.push(s.t, s.flow * 60); sc.vol.push(s.t, s.volume);
      if (vent.breath !== loopBreathRef) { loopBreathRef = vent.breath; loopPrev = loopCur; loopCur = { pv: [], fv: [] }; }
      if ((sampleCount++ & 1) === 0) { loopCur.pv.push({ x: s.paw, y: s.volume }); loopCur.fv.push({ x: s.volume, y: s.flow * 60 }); }
    }
    if (vent.holdResult && vent.holdResult.time !== ui.lastHoldTime) {
      ui.lastHoldTime = vent.holdResult.time;
      const r = vent.holdResult;
      logEvent(r.type === 'insp' ? `Inspirasjonshold: Pplateau ${fmt(r.pplat, 1)}` : `Ekspirasjonshold: AutoPEEP ${fmt(r.autoPeep, 1)}`, '', 'Hold');
      if (ui.task && r.type === ui.task.task.requireHold) ui.task.holdDone = true;
      if (ui.situation && r.type === 'insp') addFeed({ t: vent.time, who: 'respirator', text: `Inspiratorisk hold: Pplateau ${fmt(r.pplat, 1)} cmH2O (Ppeak ${fmt(vent.measurements.ppeak, 1)}).` }, false);
      toolsRefresh?.();
    }
  }
  function updateGasFromVent() {
    const m = vent.measurements;
    const stale = vent.time - ui.lastBreathTime > 12;
    gas.setVentilation({ vtMl: vent.disconnected || stale ? 0 : (m.vte ?? 0), rate: stale ? 0 : (m.fTotal ?? 0), fio2: vent.settings.fio2 / 100, peep: vent.disconnected ? 0 : (m.peepTotal ?? vent.settings.peep), ibwKg: m.ibw ?? idealBodyWeightHamilton(vent.patient.height, vent.patient.sex) });
  }
  const offBreath = vent.onBreath((m) => { ui.lastBreathTime = vent.time; updateGasFromVent(); autoRange(m); evaluateAlarms(); updateMMP(m); renderMsgBar(); });
  function patientSoundLevels() {
    const p = vent.patient;
    const S = ui.situation;
    const f = S ? S.sit.state.factor : 0;
    const snd = S?.sit.variant.sounds ?? {};
    const wheezeMech = Math.min(1, Math.max(0, ((p.resistanceExp ?? p.resistance) / Math.max(1, p.resistance) - 1.2) / 1.2));
    return { wheeze: Math.max(wheezeMech * 0.6, (snd.wheeze ?? 0) * f), secretions: (snd.secretions ?? 0) * f };
  }

  let lastClockSec = -1, lastWallSec = -1;
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
      audio.setBreath(vent.disconnected ? 0 : vent.lung.state.flow, true);
    } else audio.setBreath(0, false);
    for (const s of Object.values(sc)) s.draw();
    if (ui.layout === 2) { pvLoop.setData(loopCur.pv, loopPrev.pv); pvLoop.draw(); fvLoop.setData(loopCur.fv, loopPrev.fv); fvLoop.draw(); }
    if (ui.layout >= 3) drawDynamicLung(lastSample);
    if (ui.autoHoldUntil !== null && vent.time >= ui.autoHoldUntil) { vent.releaseHold(); ui.autoHoldUntil = null; }
    const sec = Math.floor(vent.time), wallSec = Math.floor(now / 1000);
    if (sec !== lastClockSec || (!ui.running && wallSec !== lastWallSec)) {
      lastClockSec = sec; lastWallSec = wallSec;
      renderClock();
      if (vent.holdActive) toolsRefresh?.();
      if (vent.time - ui.lastBreathTime > 12 || vent.disconnected) updateGasFromVent();
      if (ui.o2Enrich && vent.time >= ui.o2Enrich.until) { applySetting('fio2', ui.o2Enrich.prev, { silent: true }); ui.o2Enrich = null; o2Btn.classList.remove('on'); logEvent('O2-anrikning ferdig', '', 'Control'); }
      evaluateAlarms(); updateMMP(vent.measurements); renderMsgBar(); renderMonitorPanel();
      if (ui.layout >= 3) { drawVentStatus(); drawDynamicLungText(); }
      audio.setPulse(gas.state.spo2, currentVitals().hr);
      audio.setPatientSounds(patientSoundLevels());
      if (ui.situation && !ui.situation.summary) {
        const S = ui.situation;
        const hadDecision = !!S.sit.decision;
        const status = S.sit.tick(vent.time, { m: vent.measurements, gas: gas.state, settings: vent.settings, pmax: vent.settings.pmax, disconnected: vent.disconnected });
        for (const msg of S.sit.drain()) addFeed(msg);
        const el = document.getElementById('sit-time'); if (el) el.textContent = `${fmt(Math.max(0, vent.time - S.sit.state.tStart), 0)} s`;
        if (!!S.sit.decision !== hadDecision || !S.sit.decision) renderDecision();
        if (S.sit.decision && !hadDecision) { audio.notify(); if (ui.tab !== 'situations') { ui.unread += 1; renderTabs(); } }
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
    updateMarkers(); renderTop(); updateMMP(vent.measurements); renderClock(); renderMonitorPanel();
    for (const s of Object.values(sc)) s.clear();
  }

  applyLayout(); refreshAll(); renderTabs(); renderSide();
  ui.raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(ui.raf);
    audio.destroy(); offBreath();
    for (const s of Object.values(sc)) s.destroy();
    pvLoop.destroy(); fvLoop.destroy();
    closeModal(); closeWindow(); root.remove();
  };
}
