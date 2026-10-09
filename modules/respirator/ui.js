/**
 * Respiratorsimulator – brukergrensesnitt etter HAMILTON-C6.
 *
 * Venstre: «respiratoren», lagt opp etter HAMILTON-C6s hovedskjerm (brukerhåndbok kap. 2.2.2):
 *   modus øverst til venstre, fargekodet meldingslinje med Audio pause-nedtelling, MMP-kolonne til
 *   venstre med alarmgrenser (gul/rød ved alarm), grafikk i midten med valgfrie intelligente paneler
 *   (Dynamic Lung, Vent Status) eller sløyfer, vindusknappene Alarmer, Kontroller, Monitorering,
 *   Grafikk, Verktøy, Hendelser og System til høyre, hurtigknapper og hovedkontroller nederst.
 * Høyre: sidepanel med pasientmonitor, pasientoppsett, caser (meldingsfeed og valg 1 av 5) og oppgaver.
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

/** MMP-er (Hamilton: Ppeak alltid øverst; alarmgrenser ved verdien). */
const MMP_MAIN = [
  { key: 'ppeak', label: 'Ppeak', unit: 'cmH2O', d: 0, limits: ['pmax', null] },
  { key: 'peepTotal', label: 'PEEP/CPAP', unit: 'cmH2O', d: 1 },
  { key: 'vte', label: 'VTE', unit: 'ml', d: 0, limits: ['vtHigh', 'vtLow'] },
  { key: 'expMinVol', label: 'ExpMinVol', unit: 'l/min', d: 1, limits: ['mvHigh', 'mvLow'] },
  { key: 'fTotal', label: 'fTotal', unit: 'b/min', d: 0 },
  { key: 'pplat', label: 'Pplateau', unit: 'cmH2O', d: 0 },
  { key: 'spo2', label: 'SpO2', unit: '%', d: 0, limits: [null, 'spo2Low'], compact: true },
];
const MMP_ALL = [
  ...MMP_MAIN.map((m) => ({ ...m, compact: false })),
  { key: 'autoPeep', label: 'AutoPEEP', unit: 'cmH2O', d: 1 }, { key: 'petco2', label: 'PetCO2', unit: 'kPa', d: 1 },
  { key: 'pmean', label: 'Pmean', unit: 'cmH2O', d: 1 }, { key: 'drivingPressure', label: 'ΔP (drivtrykk)', unit: 'cmH2O', d: 1 }, { key: 'pinsp', label: 'ΔPinsp', unit: 'cmH2O', d: 1 },
  { key: 'vti', label: 'VTI', unit: 'ml', d: 0 }, { key: 'vtPerKg', label: 'Vt/IBW', unit: 'ml/kg', d: 1 }, { key: 'fSpont', label: 'fSpont', unit: 'b/min', d: 0 },
  { key: 'cstat', label: 'Cstat', unit: 'ml/cmH2O', d: 0 }, { key: 'rinsp', label: 'Rinsp', unit: 'cmH2O/(l/s)', d: 0 }, { key: 'rcexp', label: 'RCexp', unit: 's', d: 2 },
  { key: 'ti', label: 'TI', unit: 's', d: 2 }, { key: 'te', label: 'TE', unit: 's', d: 2 }, { key: 'ieText', label: 'I:E', unit: '', d: null }, { key: 'ibw', label: 'IBW', unit: 'kg', d: 1 },
  { key: 'paco2', label: 'PaCO2 (modell)', unit: 'kPa', d: 1 }, { key: 'pao2', label: 'PaO2 (modell)', unit: 'kPa', d: 1 },
];
/** Sekundære monitoreringsparametre (C6 standard-SMP: Vt/IBW, Pplateau, RCexp, TI, ΔP, Pmean, Cstat, fSpont). */
const SMP = [['vtPerKg', 'Vt/IBW', 'ml/kg', 1], ['pplat', 'Pplateau', 'cmH2O', 0], ['rcexp', 'RCexp', 's', 2], ['ti', 'TI', 's', 2], ['drivingPressure', 'ΔP', 'cmH2O', 0], ['pmean', 'Pmean', 'cmH2O', 1], ['cstat', 'Cstat', 'ml/cmH2O', 0], ['fSpont', 'fSpont', 'b/min', 0]];
const WINDOWS = [
  ['alarms', 'Alarmer'], ['controls', 'Kontroller'], ['monitor', 'Monitorering'],
  ['graphics', 'Grafikk'], ['tools', 'Verktøy'], ['events', 'Hendelser'], ['system', 'System'],
];
const BOTTOM_WINDOWS = ['monitor', 'graphics', 'tools', 'events', 'system'];
const PERSON_ICON = '<svg viewBox="0 0 22 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="11" cy="5" r="4.5" fill="#fff"/><path d="M3 12h16l-2 14h-2v13h-3V26h-2v13H8V26H6z" fill="#fff"/></svg>';
const WHO = { obs: ['👁', 'Observasjon'], kollega: ['🧑‍⚕️', 'Kollega'], monitor: ['📟', 'Monitor'], respirator: ['🫁', 'Respirator'], handling: ['✋', 'Du'] };

/** Standard Vt ved oppstart: 8 ml/kg IBW (Hamilton: Vt/IBW standard 8 ml/kg), avrundet til 10 ml. */
function startupVt(patient) {
  return Math.max(200, Math.round((8 * idealBodyWeightHamilton(patient.height, patient.sex)) / 10) * 10);
}
const clock = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

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
    running: true, frozen: false, speed: 1, window: null, focusKey: null, layout: 'panels', profileId,
    raf: 0, acc: 0, lastNow: null, lastHoldTime: null, lastBreathTime: 0, autoHoldUntil: null,
    task: null, situation: null, tab: 'patient', unread: 0, o2Enrich: null,
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
  const panels = h('div', { class: 'hc-panels' });
  const waves = h('div', { class: 'hc-waves' }, curves, panels, loops);
  const rings = h('div', { class: 'hc-rings' });
  const modesBtn = h('button', { type: 'button', class: 'hc-btn', onClick: () => openModeModal() }, 'Modus');
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
  const cssColor = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff';
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
  function applyLayout() {
    waves.classList.toggle('with-loops', ui.layout === 'loops');
    waves.classList.toggle('with-panels', ui.layout === 'panels');
    curves.classList.toggle('three', ui.layout === 'curves');
    sc.vol.wrap.style.display = ui.layout === 'curves' ? '' : 'none';
    loops.style.display = ui.layout === 'loops' ? '' : 'none';
    panels.style.display = ui.layout === 'panels' ? '' : 'none';
  }

  // ======================= MMP =======================
  const mmpTiles = {};
  for (const m of MMP_MAIN) {
    const val = h('div', { class: 'mmp-value' }, '–');
    const lim = h('div', { class: 'mmp-limits' });
    const el = h('div', { class: `mmp ${m.compact ? 'compact' : ''}`, onClick: () => openWindow('alarms', m.key) }, lim, h('div', { class: 'mmp-main' }, val, h('div', { class: 'mmp-label' }, m.label, h('span', { class: 'mmp-unit' }, m.unit))));
    mmpTiles[m.key] = { el, val, lim, def: m };
    mmpCol.append(el);
  }
  const withGas = (m) => ({ ...m, spo2: gas.state.spo2 * 100, petco2: vent.disconnected ? 0 : gas.petco2, paco2: gas.state.paco2, pao2: gas.state.pao2 });
  const limitValue = (key) => (key === 'pmax' ? vent.settings.pmax : ui.alarms[key]);
  function updateMMP(mRaw) {
    const m = withGas(mRaw);
    const alarmByKey = {};
    for (const a of ui.activeAlarms) if (a.mmp) alarmByKey[a.mmp] = a.priority === 'high' ? 'high' : (alarmByKey[a.mmp] ?? 'medium');
    for (const [key, t] of Object.entries(mmpTiles)) {
      let cls = `mmp ${t.def.compact ? 'compact' : ''}`;
      if (alarmByKey[key]) cls += ` alarm-${alarmByKey[key]}`;
      if (key === 'pplat' && m.pplatMeasured != null) cls += ' measured';
      if (key === 'autoPeep' && m.autoPeepMeasured != null) cls += ' measured';
      t.val.textContent = t.def.d === null ? (m[key] ?? '–') : fmt(m[key], t.def.d);
      t.el.className = cls;
      if (t.def.limits) { const [hi, lo] = t.def.limits; t.lim.replaceChildren(h('span', {}, hi ? String(limitValue(hi)) : ''), h('span', {}, lo ? String(limitValue(lo)) : '')); }
    }
    monitorRefresh?.(m);
  }
  let monitorRefresh = null;

  // ======================= Alarmer og meldingslinje =======================
  function evaluateAlarms() {
    const m = vent.measurements, s = vent.settings;
    const list = [];
    const hasBreath = m.breathType !== null;
    if (vent.disconnected || (hasBreath && m.ppeak < m.peep + 2 && s.mode !== 'SPONT')) list.push({ id: 'disc', text: 'Frakobling på pasientsiden', priority: 'high', mmp: 'ppeak' });
    if (m.highPressure || (m.ppeak !== null && m.ppeak >= s.pmax)) list.push({ id: 'phigh', text: 'Trykk høy', priority: 'high', mmp: 'ppeak' });
    if (hasBreath && m.expMinVol < ui.alarms.mvLow) list.push({ id: 'mvlow', text: 'ExpMinVol lav', priority: 'high', mmp: 'expMinVol' });
    if (hasBreath && m.expMinVol > ui.alarms.mvHigh) list.push({ id: 'mvhigh', text: 'ExpMinVol høy', priority: 'high', mmp: 'expMinVol' });
    if (vent.backupActive || (vent.time - ui.lastBreathTime > ui.alarms.apnea && vent.time > ui.alarms.apnea)) list.push({ id: 'apnea', text: vent.backupActive ? 'Apné-ventilasjon' : 'Apné', priority: 'high' });
    if (gas.state.spo2 * 100 < ui.alarms.spo2Low) list.push({ id: 'spo2', text: `SpO2 lav (${fmt(gas.state.spo2 * 100, 0)} %)`, priority: 'high', mmp: 'spo2' });
    if (hasBreath && !vent.disconnected && m.vte < ui.alarms.vtLow) list.push({ id: 'vtlow', text: 'Vt lav', priority: 'medium', mmp: 'vte' });
    if (hasBreath && m.vte > ui.alarms.vtHigh) list.push({ id: 'vthigh', text: 'Vt høy', priority: 'medium', mmp: 'vte' });
    if (m.pressureLimited) list.push({ id: 'plimit', text: 'Trykkbegrensning', priority: 'medium', mmp: 'ppeak' });
    const prev = new Set(ui.activeAlarms.map((a) => a.id)), now = new Set(list.map((a) => a.id));
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
    if (audio.enabled && (list.length || audio.silenced)) msgBar.append(button(audio.silenced ? `🔕 ${clock(audio.silencedFor)}` : '🔔 Audio pause', { small: true, onClick: () => { audio.silenced ? audio.unsilence() : audio.silence(120); renderMsgBar(); } }));
    alarmsBtn.classList.toggle('alarming', high);
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
    modeBtn.innerHTML = PERSON_ICON;
    modeBtn.append(h('div', { class: 'hc-mode-name' }, MODES[s.mode].label));
    renderMsgBar(); renderRings();
  }
  function renderClock() {
    const now = new Date();
    clockBox.replaceChildren(
      h('div', { class: 'clock-text' }, h('span', {}, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`), h('span', {}, clock(vent.time)), h('small', {}, ui.speed === 1 ? 'simulert tid' : `${ui.speed}×`)),
      h('button', { type: 'button', class: 'menu', 'aria-label': 'System', onClick: () => openWindow('system') }, '☰'));
  }

  // ======================= Hovedkontroller nederst =======================
  function settingDefs() {
    const s = vent.settings;
    const common = [{ key: 'fio2', label: 'Oksygen', value: s.fio2, unit: '%' }, { key: 'peep', label: 'PEEP/CPAP', value: s.peep, unit: 'cmH2O' }];
    const timing = s.timingMode === 'ie' ? { key: 'ie', label: 'I:E', value: ieLabel(s.ie), unit: '' } : { key: 'ti', label: 'TI', value: s.ti.toFixed(2), unit: 's' };
    const trig = { key: 'trigger', label: s.trigger.type === 'flow' ? 'Trigger (flow)' : 'Trigger (trykk)', value: s.trigger.type === 'flow' ? s.trigger.value : `-${s.trigger.value}`, unit: s.trigger.type === 'flow' ? 'l/min' : 'cmH2O' };
    if (s.mode === 'APVCMV') return [...common, { key: 'rate', label: 'Rate', value: s.rate, unit: 'b/min' }, { key: 'vt', label: 'Vt', value: s.vt, unit: 'ml' }, timing, { key: 'pramp', label: 'P-ramp', value: s.pramp, unit: 'ms' }, trig];
    if (s.mode === 'SCMV') return [...common, { key: 'rate', label: 'Rate', value: s.rate, unit: 'b/min' }, { key: 'vt', label: 'Vt', value: s.vt, unit: 'ml' }, timing, { key: 'tip', label: 'Pause', value: s.tip, unit: '%' }, { key: 'flowPattern', label: 'Flowmønster', value: s.flowPattern === 'decel' ? 'Desel.' : 'Firkant', unit: '' }, trig];
    if (s.mode === 'PCV') return [...common, { key: 'rate', label: 'Rate', value: s.rate, unit: 'b/min' }, { key: 'pcontrol', label: 'ΔPcontrol', value: s.pcontrol, unit: 'cmH2O' }, timing, { key: 'pramp', label: 'P-ramp', value: s.pramp, unit: 'ms' }, trig];
    return [...common, { key: 'psupport', label: 'ΔPsupport', value: s.psupport, unit: 'cmH2O' }, { key: 'pramp', label: 'P-ramp', value: s.pramp, unit: 'ms' }, { key: 'ets', label: 'ETS', value: s.ets, unit: '%' }, trig, { key: 'tiMax', label: 'TI max', value: s.tiMax, unit: 's' }];
  }
  /** Ringkontrollene i høyrekolonnen (C6 viser modusens viktigste kontroller her). */
  const RING_KEYS = { APVCMV: ['vt', 'rate', 'peep', 'fio2'], SCMV: ['vt', 'rate', 'peep', 'fio2'], PCV: ['pcontrol', 'rate', 'peep', 'fio2'], SPONT: ['psupport', 'peep', 'fio2'] };
  function renderRings() {
    clear(rings);
    const defs = settingDefs();
    for (const key of RING_KEYS[vent.settings.mode] ?? []) {
      const d = defs.find((x) => x.key === key); if (!d) continue;
      rings.append(h('button', { type: 'button', class: `knob ${ui.window === 'controls' && ui.focusKey === key ? 'active' : ''}`, dataset: { key }, onClick: () => openWindow('controls', key) },
        h('div', { class: 'ring' }, h('div', { class: 'ring-value' }, String(d.value)), h('div', { class: 'ring-unit' }, d.unit)), h('div', { class: 'ring-label' }, d.label)));
    }
  }
  const renderSettingsBar = renderRings;

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
    updateMarkers(); renderSettingsBar(); renderTop();
  }
  const PREDICTABLE = new Set(['vt', 'rate', 'peep', 'ie', 'ti', 'pcontrol', 'psupport', 'tip', 'flowPattern', 'ets', 'pramp', 'pmax']);
  function changeSetting(key, value) {
    const s = vent.settings;
    const oldValue = key === 'ie' ? s.ie : s[key];
    if (ui.task && PREDICTABLE.has(key)) {
      const q = predictionFor({ key, oldValue, newValue: value, settings: s, patient: vent.patient, focus: ui.task.task.focus });
      if (q) { showPrediction(q, () => applySetting(key, value), () => openWindow('controls', key)); return; }
    }
    applySetting(key, value);
  }

  // ======================= Vinduer på respiratoren =======================
  let windowEl = null;
  function closeWindow() {
    windowEl?.remove(); windowEl = null; ui.window = null; ui.focusKey = null;
    hc.querySelectorAll('.hc-btn[data-win]').forEach((b) => b.classList.remove('active'));
    rings.querySelectorAll('.knob').forEach((b) => b.classList.remove('active'));
  }
  function openWindow(name, focusKey) {
    if (ui.window === name && !focusKey) { closeWindow(); return; }
    closeWindow();
    ui.window = name; ui.focusKey = typeof focusKey === 'string' ? focusKey : null;
    hc.querySelectorAll('.hc-btn[data-win]').forEach((b) => b.classList.toggle('active', b.dataset.win === name));
    rings.querySelectorAll('.knob').forEach((b) => b.classList.toggle('active', b.dataset.key === ui.focusKey));
    const body = h('div', { class: 'hc-window-body' });
    const head = h('div', { class: 'hc-window-head' });
    windowEl = h('div', { class: 'hc-window', role: 'dialog' }, head, body);
    hc.append(windowEl);
    head.append(h('h2', {}, Object.fromEntries(WINDOWS)[name]), h('button', { class: 'hc-close', type: 'button', 'aria-label': 'Lukk', onClick: closeWindow }, '✕'));
    ({ alarms: renderAlarms, controls: renderControls, monitor: renderMonitor, graphics: renderGraphics, tools: renderTools, events: renderEvents, system: renderSystem })[name](body, head, focusKey === true ? null : focusKey);
  }

  function renderAlarms(body, head, focusKey) {
    const mk = (label, key, unit, min, max, step) => {
      const ctl = slider({ label, unit, min, max, step, value: key === 'pmax' ? vent.settings.pmax : ui.alarms[key], onChange: (v) => { if (key === 'pmax') applySetting('pmax', v); else { ui.alarms[key] = v; logEvent(`Alarmgrense ${label}: ${v}`); } updateMMP(vent.measurements); } });
      if (focusKey && ((focusKey === 'ppeak' && key === 'pmax') || (focusKey === 'vte' && key.startsWith('vt')) || (focusKey === 'expMinVol' && key.startsWith('mv')) || (focusKey === 'spo2' && key === 'spo2Low'))) ctl.el.classList.add('highlight');
      body.append(ctl.el);
    };
    body.append(h('div', { class: 'hc-section' }, 'Grenser 1'));
    mk('Trykk høy (Pmax)', 'pmax', 'cmH2O', 15, 70, 1);
    body.append(h('p', { class: 'faint', style: { fontSize: '0.82rem' } }, `Plimit = Pmax − 10 = ${vent.settings.pmax - 10} cmH2O: respiratoren begrenser levert trykk her. Ved Pmax åpnes ekspirasjonsventilen (høyprioritetsalarm).`));
    mk('ExpMinVol lav', 'mvLow', 'l/min', 0.5, 20, 0.5); mk('ExpMinVol høy', 'mvHigh', 'l/min', 2, 40, 0.5);
    mk('Vt lav', 'vtLow', 'ml', 50, 1000, 10); mk('Vt høy', 'vtHigh', 'ml', 100, 2000, 10);
    body.append(h('div', { class: 'hc-section' }, 'Grenser 2'));
    mk('Apnétid', 'apnea', 's', 5, 60, 5); mk('SpO2 lav', 'spo2Low', '%', 70, 99, 1);
    body.append(h('div', { class: 'hc-section' }, 'Buffer (aktive alarmer)'));
    body.append(ui.activeAlarms.length ? h('div', { class: 'event-list' }, ...ui.activeAlarms.map((a) => h('div', { class: `ev ${a.priority}` }, h('time', {}, a.priority === 'high' ? 'HØY' : 'MIDDELS'), h('span', {}, a.text)))) : h('p', { class: 'muted' }, 'Ingen aktive alarmer.'));
    if (focusKey) windowEl.querySelector('.highlight')?.scrollIntoView({ block: 'center' });
  }

  function renderControls(body, head, focusKey) {
    const s = vent.settings;
    const tabs = [['basic', 'Grunn'], ['patient', 'Pasient'], ...(s.mode === 'SPONT' ? [['apnea', 'Apné']] : [])];
    let tab = focusKey === 'height' ? 'patient' : focusKey === 'apnea' ? 'apnea' : 'basic';
    const tabBar = h('div', { class: 'tabs' });
    const content = h('div', {});
    const renderTab = () => {
      tabBar.replaceChildren(...tabs.map(([id, label]) => h('button', { type: 'button', class: id === tab ? 'active' : '', onClick: () => { tab = id; renderTab(); } }, label)));
      clear(content);
      const add = (key, ctl) => { if (key === focusKey) ctl.el.classList.add('highlight'); content.append(ctl.el); return ctl; };
      const sl = (key, opts) => add(key, slider({ ...opts, onChange: (v) => changeSetting(key, v) }));
      if (tab === 'basic') {
        // Som på C6: alle kontroller som ringknapper; trykk på en, juster med −/+ eller glidebryteren under.
        const items = [];
        const num = (key, label, unit, min, max, step, value, fmtFn = (v) => String(v)) => items.push({ key, label, unit, min, max, step, value, fmtFn });
        num('fio2', 'Oksygen', '%', 21, 100, 1, s.fio2);
        num('peep', 'PEEP/CPAP', 'cmH2O', 0, 35, 1, s.peep);
        if (s.mode !== 'SPONT') num('rate', 'Rate', 'b/min', 1, 80, 1, s.rate);
        if (s.mode === 'APVCMV' || s.mode === 'SCMV') num('vt', 'Vt', 'ml', 100, 1000, 10, s.vt);
        if (s.mode === 'PCV') num('pcontrol', 'ΔPcontrol', 'cmH2O', 5, 60, 1, s.pcontrol);
        if (s.mode === 'SPONT') num('psupport', 'ΔPsupport', 'cmH2O', 0, 60, 1, s.psupport);
        if (s.mode !== 'SPONT') {
          if (s.timingMode === 'ie') items.push({ key: 'ie', label: 'I:E', unit: '', min: 0, max: IE_OPTIONS.length - 1, step: 1, value: Math.max(0, IE_OPTIONS.findIndex((o) => o.value === ieKey(s.ie))), fmtFn: (i) => IE_OPTIONS[i].label });
          else num('ti', 'TI', 's', 0.1, 3, 0.05, s.ti, (v) => Number(v).toFixed(2));
        }
        if (s.mode === 'SCMV') num('tip', 'Pause', '%', 0, 30, 5, s.tip);
        else num('pramp', 'P-ramp', 'ms', 0, s.mode === 'SPONT' ? 200 : 600, 25, Math.min(s.pramp, s.mode === 'SPONT' ? 200 : 600));
        if (s.mode === 'SPONT') { num('ets', 'ETS', '%', 5, 80, 5, s.ets); num('tiMax', 'TI max', 's', 0.5, 3, 0.1, s.tiMax, (v) => Number(v).toFixed(1)); }
        if (s.trigger.type === 'flow') num('trigger', 'Flowtrigger', 'l/min', 0.5, 20, 0.5, s.trigger.value);
        else num('trigger', 'Trykktrigger', 'cmH2O', 0.5, 15, 0.5, s.trigger.value, (v) => `-${v}`);
        if (s.mode === 'APVCMV') num('pmax', 'Pmax', 'cmH2O', 15, 70, 1, s.pmax);

        let selected = items.some((i) => i.key === focusKey) ? focusKey : items[0].key;
        const grid = h('div', { class: 'knob-grid' });
        const adj = h('div', { class: 'adj' });
        const applyValue = (item, v) => {
          if (item.key === 'ie') changeSetting('ie', IE_OPTIONS[v].ie);
          else if (item.key === 'trigger') applySetting('triggerValue', v);
          else changeSetting(item.key, v);
          openWindow('controls', item.key);
        };
        const renderGrid = () => {
          grid.replaceChildren(...items.map((it) => h('button', { type: 'button', class: `knob ${it.key === selected ? 'active' : ''}`, onClick: () => { selected = it.key; ui.focusKey = it.key; renderGrid(); renderAdj(); rings.querySelectorAll('.knob').forEach((b) => b.classList.toggle('active', b.dataset.key === it.key)); } },
            h('div', { class: 'ring' }, h('div', { class: 'ring-value' }, it.fmtFn(it.value)), h('div', { class: 'ring-unit' }, it.unit)), h('div', { class: 'ring-label' }, it.label))));
        };
        const renderAdj = () => {
          const it = items.find((i) => i.key === selected);
          const dec = Math.max(0, -Math.floor(Math.log10(it.step)));
          const clampV = (v) => Number(Math.min(it.max, Math.max(it.min, v)).toFixed(dec));
          const range = h('input', { type: 'range', min: String(it.min), max: String(it.max), step: String(it.step), value: String(it.value), 'aria-label': it.label, onChange: (e) => applyValue(it, clampV(Number(e.target.value))) });
          adj.replaceChildren(
            h('div', { class: 'adj-head' }, h('span', {}, it.label), h('span', { class: 'adj-val' }, it.fmtFn(it.value), ' ', h('small', {}, it.unit))),
            h('div', { class: 'adj-row' },
              h('button', { type: 'button', class: 'adj-btn', 'aria-label': 'Mindre', onClick: () => applyValue(it, clampV(it.value - it.step)) }, '−'),
              range,
              h('button', { type: 'button', class: 'adj-btn', 'aria-label': 'Mer', onClick: () => applyValue(it, clampV(it.value + it.step)) }, '+')));
        };
        renderGrid(); renderAdj();
        content.append(h('div', { class: 'hc-section' }, `${MODES[s.mode].label} – trykk på en kontroll og juster`), grid);
        const extras = h('div', { class: 'row', style: { marginTop: '10px', flexWrap: 'wrap', gap: '10px' } });
        if (s.mode !== 'SPONT') extras.append(h('span', { class: 'muted' }, 'Tid via'), segmented({ ariaLabel: 'Tidsinnstilling', value: s.timingMode, options: [{ value: 'ie', label: 'I:E' }, { value: 'ti', label: 'TI' }], onChange: (v) => { applySetting('timingMode', v, { silent: true }); openWindow('controls', v); } }).el);
        extras.append(h('span', { class: 'muted' }, 'Trigger'), segmented({ ariaLabel: 'Triggertype', value: s.trigger.type, options: [{ value: 'flow', label: 'Flow' }, { value: 'pressure', label: 'Trykk' }], onChange: (v) => { applySetting('triggerType', v); openWindow('controls', 'trigger'); } }).el);
        if (s.mode === 'SCMV') extras.append(h('span', { class: 'muted' }, 'Flowmønster'), segmented({ ariaLabel: 'Flowmønster', value: s.flowPattern, options: [{ value: 'square', label: 'Firkant' }, { value: 'decel', label: 'Desel. 50 %' }], onChange: (v) => changeSetting('flowPattern', v) }).el);
        content.append(extras, h('p', { class: 'faint', style: { marginTop: '8px', fontSize: '0.8rem' } }, 'Endringer virker fra neste pust.'), adj);
      } else if (tab === 'patient') {
        const p = vent.patient;
        content.append(h('div', { class: 'hc-section' }, 'Pasient (IBW beregnes fra kjønn og høyde)'));
        content.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Kjønn'), segmented({ ariaLabel: 'Kjønn', value: p.sex, options: [{ value: 'M', label: 'Mann' }, { value: 'K', label: 'Kvinne' }], onChange: (v) => { vent.setPatient({ sex: v }); renderTop(); renderTab(); } }).el));
        content.append(slider({ label: 'Pasienthøyde', unit: 'cm', min: 30, max: 250, step: 1, value: p.height, onChange: (v) => { vent.setPatient({ height: v }); renderTop(); renderTab(); } }).el);
        content.append(h('p', { class: 'muted' }, `IBW ${fmt(idealBodyWeightHamilton(p.height, p.sex), 1)} kg · Vt 8 ml/kg = ${fmt(8 * idealBodyWeightHamilton(p.height, p.sex), 0)} ml`));
      } else {
        content.append(h('div', { class: 'hc-section' }, 'Apné-backup'));
        sl('apneaTime', { label: 'Apnétid', unit: 's', min: 5, max: 60, step: 5, value: s.apneaTime });
        add('backupRate', slider({ label: 'Backup rate', unit: 'b/min', min: 4, max: 30, step: 1, value: s.backup.rate, onChange: (v) => applySetting('backupRate', v) }));
        add('backupPcontrol', slider({ label: 'Backup ΔPinsp', unit: 'cmH2O', min: 5, max: 40, step: 1, value: s.backup.pcontrol, onChange: (v) => applySetting('backupPcontrol', v) }));
      }
      if (focusKey) content.querySelector('.highlight')?.scrollIntoView({ block: 'center' });
    };
    head.insertBefore(tabBar, head.lastChild);
    body.append(content);
    renderTab();
  }

  function renderMonitor(body) {
    const grid = h('div', { class: 'mon-grid' });
    const tiles = {};
    for (const d of MMP_ALL) { const val = h('div', { class: 'mmp-value' }, '–'); tiles[d.key] = { val, d }; grid.append(h('div', { class: 'mmp' }, h('div', { class: 'mmp-main' }, h('div', { class: 'mmp-label' }, d.label, h('span', { class: 'mmp-unit' }, d.unit)), val))); }
    const extra = h('div', { class: 'muted', style: { marginTop: '10px', fontSize: '0.85rem' } });
    body.append(grid, extra);
    monitorRefresh = (m) => {
      for (const [k, t] of Object.entries(tiles)) t.val.textContent = t.d.d === null ? (m[k] ?? '–') : fmt(m[k], t.d.d);
      extra.textContent = `Siste pust: ${({ mandatory: 'maskinstyrt', triggered: 'pasienttrigget (mandatorisk)', spont: 'spontan (trykkstøtte)', backup: 'backup' })[m.breathType] ?? '–'}${m.cycleReason ? ` · syklet av ${m.cycleReason}` : ''}. Pplateau ved hold: ${fmt(m.pplatMeasured, 1)} · AutoPEEP ved hold: ${fmt(m.autoPeepMeasured, 1)}.`;
    };
    monitorRefresh(withGas(vent.measurements));
  }

  function renderGraphics(body) {
    body.append(h('div', { class: 'hc-section' }, 'Oppsett (som C6: kurver + intelligente paneler eller sløyfer)'));
    body.append(segmented({ ariaLabel: 'Oppsett', value: ui.layout, options: [{ value: 'panels', label: 'Dynamic Lung + Vent Status' }, { value: 'loops', label: 'Sløyfer' }, { value: 'curves', label: 'Tre kurver' }], onChange: (v) => { ui.layout = v; applyLayout(); } }).el);
    body.append(h('div', { class: 'hc-section' }, 'Tidsskala (s)'));
    body.append(segmented({ ariaLabel: 'Tidsskala', value: String(sc.paw.sweep ?? 11), options: [{ value: '5.5', label: '5,5' }, { value: '11', label: '11' }, { value: '22', label: '22' }, { value: '33', label: '33' }], onChange: (v) => { for (const s of Object.values(sc)) { s.setSweep(Number(v)); s.sweep = Number(v); } } }).el);
    body.append(h('p', { class: 'faint', style: { fontSize: '0.85rem' } }, 'Hamilton-C6 bruker 22 s som standard for voksne; her er 11 s valgt fordi skjermen er mindre.'));
    body.append(h('div', { class: 'hc-section' }, 'Frys'));
    body.append(toggle({ label: 'Frys kurvene (ventilasjonen fortsetter)', checked: ui.frozen, onChange: (v) => { ui.frozen = v; hc.classList.toggle('frozen', v); } }).el);
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
    body.append(h('div', { class: 'hc-section' }, 'Manøvrer'), h('div', { class: 'grid grid-2' }, mkHold('insp', 'Insp. hold (Pplateau)'), mkHold('exp', 'Eksp. hold (AutoPEEP)')), result);
    toolsRefresh = () => {
      const r = vent.holdResult; if (!r) return;
      clear(result);
      if (vent.holdActive) result.append(h('b', {}, vent.holdActive === 'insp' ? 'Inspiratorisk hold pågår …' : 'Ekspiratorisk hold pågår …'), ` Paw ${fmt(vent.lung.state.paw, 1)} cmH2O`);
      else if (r.type === 'insp') result.append(h('b', {}, `Pplateau målt: ${fmt(r.pplat, 1)} cmH2O`), h('div', { class: 'muted' }, `Ppeak − Pplat = ${fmt(vent.measurements.ppeak - r.pplat, 1)} (resistiv del). Pplat − PEEPtot = ${fmt(r.pplat - vent.measurements.peepTotal, 1)} (drivtrykk).`));
      else result.append(h('b', {}, `PEEP totalt: ${fmt(r.peepTotal, 1)} cmH2O → AutoPEEP ${fmt(r.autoPeep, 1)} cmH2O`), h('div', { class: 'muted' }, `Innstilt PEEP ${vent.settings.peep}.`));
    };
    body.append(h('div', { class: 'hc-section' }, 'Annet'));
    body.append(h('div', { class: 'row' }, button('Manuell pust', { onClick: () => { if (vent.manualBreath()) logEvent('Manuell pust'); else toast('Vent til ekspirasjonsfasen.', { kind: 'warn' }); } }), button(ui.o2Enrich ? 'Avbryt O2-anrikning' : 'O2-anrikning (100 % i 2 min)', { onClick: () => { toggleO2Enrich(); openWindow('tools', true); } })));
    body.append(h('div', { class: 'hc-section' }, 'Simulering'));
    body.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Hastighet'), segmented({ ariaLabel: 'Hastighet', value: String(ui.speed), options: [{ value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }], onChange: (v) => { ui.speed = Number(v); renderClock(); } }).el));
  }
  let toolsRefresh = null;

  function renderEvents(body) {
    if (!ui.events.length) { body.append(h('p', { class: 'muted' }, 'Ingen hendelser ennå. Alarmer, innstillingsendringer og manøvrer logges her.')); return; }
    body.append(h('div', { class: 'event-list' }, ...ui.events.map((e) => h('div', { class: `ev ${e.priority}` }, h('time', {}, clock(e.t)), h('span', {}, e.text)))));
  }

  function renderSystem(body) {
    body.append(h('div', { class: 'hc-section' }, 'Lyd'));
    const o = audio.options;
    const setO = (p) => { audio.setOptions(p); saveAudio(); };
    body.append(h('p', { class: 'faint', style: { fontSize: '0.85rem' } }, audio.enabled ? 'Lyd er på.' : 'Slå på lyd med «Lyd»-knappen nederst (nettleseren krever et trykk først).'));
    body.append(slider({ label: 'Volum', unit: '', min: 0, max: 1, step: 0.05, value: o.volume, onChange: (v) => setO({ volume: v }) }).el);
    body.append(h('div', { class: 'row' },
      toggle({ label: 'Respirator og pust', checked: o.breath, onChange: (v) => setO({ breath: v }) }).el,
      toggle({ label: 'Pasientlyder', checked: o.patient, onChange: (v) => setO({ patient: v }) }).el,
      toggle({ label: 'Alarmer', checked: o.alarms, onChange: (v) => setO({ alarms: v }) }).el,
      toggle({ label: 'Pulstone (SpO2)', checked: o.pulse, onChange: (v) => setO({ pulse: v }) }).el));
    body.append(h('div', { class: 'hc-section' }, 'Nullstilling'));
    body.append(h('div', { class: 'row' },
      button('Nullstill innstillinger', { onClick: () => { vent.setSettings({ ...structuredClone(DEFAULT_SETTINGS), vt: startupVt(vent.patient) }); vent.reset(); logEvent('Innstillinger nullstilt'); refreshAll(); } }),
      button('Slett lagret fremdrift', { variant: 'danger', onClick: () => { storage.remove('respirator:progress'); progress.predictions = { correct: 0, total: 0 }; toast('Fremdrift slettet'); } })));
    body.append(h('div', { class: 'hc-section' }, 'Info'));
    body.append(h('p', { class: 'muted', style: { fontSize: '0.9rem' } }, 'Læringsverktøy, ikke til klinisk bruk. Skjermen er lagt opp etter HAMILTON-C6s hovedskjerm (brukerhåndbok kap. 2.2.2), men er ikke en gjengivelse av programvaren. Formler og kilder: ', h('a', { href: './KILDER.md', target: '_blank' }, 'KILDER.md'), '.'));
  }

  // ======================= Hurtigknapper og vindusknapper =======================
  const soundBtn = h('button', { type: 'button', class: 'hc-btn', onClick: async () => {
    if (audio.enabled) audio.disable(); else if (!(await audio.enable())) { toast('Nettleseren støtter ikke lyd her.', { kind: 'warn' }); return; }
    soundBtn.classList.toggle('on', audio.enabled); soundBtn.replaceChildren(h('span', { class: 'ico' }, audio.enabled ? '🔊' : '🔇'), 'Lyd'); renderMsgBar();
  } }, h('span', { class: 'ico' }, '🔇'), 'Lyd');
  const o2Btn = h('button', { type: 'button', class: 'hc-btn', title: 'O2-anrikning: 100 % i 2 min', onClick: () => toggleO2Enrich() }, h('span', { class: 'ico' }, 'O₂'), '2 min');
  const breathBtn = h('button', { type: 'button', class: 'hc-btn', onClick: () => { if (vent.manualBreath()) logEvent('Manuell pust'); } }, h('span', { class: 'ico' }, '💨'), 'Man. pust');
  const standbyBtn = h('button', { type: 'button', class: 'hc-btn', onClick: () => { ui.running = !ui.running; standbyBtn.replaceChildren(h('span', { class: 'ico' }, ui.running ? '⏻' : '▶'), ui.running ? 'Standby' : 'Start'); standbyBtn.classList.toggle('on', !ui.running); logEvent(ui.running ? 'Ventilasjon startet' : 'Standby'); } }, h('span', { class: 'ico' }, '⏻'), 'Standby');
  quick.append(breathBtn, o2Btn, soundBtn, standbyBtn);
  for (const id of BOTTOM_WINDOWS) bottom.append(h('button', { type: 'button', class: 'hc-btn', dataset: { win: id }, onClick: () => openWindow(id) }, Object.fromEntries(WINDOWS)[id]));

  function toggleO2Enrich() {
    if (ui.o2Enrich) { applySetting('fio2', ui.o2Enrich.prev, { silent: true }); ui.o2Enrich = null; logEvent('O2-anrikning avbrutt'); o2Btn.classList.remove('on'); }
    else { ui.o2Enrich = { until: vent.time + 120, prev: vent.settings.fio2 }; applySetting('fio2', 100, { silent: true }); logEvent('O2-anrikning: 100 % i 2 min'); o2Btn.classList.add('on'); }
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
    body.append(h('p', { class: 'faint', style: { fontSize: '0.82rem' } }, 'Høyde og kjønn (IBW) settes på respiratoren under Kontroller › Pasient, som på C6.'));
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
    ui.running = true; ui.events = [];
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
    ui.running = true;
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

  // ======================= Modaler =======================
  let modalEl = null;
  function openModal(content) { closeModal(); modalEl = h('div', { class: 'hc-modal-backdrop' }, h('div', { class: 'hc-modal', role: 'dialog' }, ...content)); hc.append(modalEl); }
  function closeModal() { modalEl?.remove(); modalEl = null; }
  function openModeModal() {
    const opts = [MODES.APVCMV, MODES.PCV, MODES.SPONT, MODES.SCMV].map((m) => h('button', { type: 'button', class: `choice ${vent.settings.mode === m.id ? 'selected' : ''}`, onClick: () => { closeModal(); applySetting('mode', m.id); openWindow('controls', true); } }, h('div', { class: 'mode-option' }, h('b', {}, m.label), h('small', {}, m.description))));
    const others = ['SIMV+', 'PSIMV+', 'DuoPAP', 'APRV', 'ASV', 'NIV', 'NIV-ST', 'HiFlowO2'].map((m) => h('button', { type: 'button', class: 'choice disabled', disabled: true }, h('div', { class: 'mode-option' }, h('b', {}, m), h('small', {}, 'Finnes på C6, ikke i simulatoren ennå'))));
    openModal([h('h3', {}, 'Modus'), h('div', { class: 'choices mode-list' }, ...opts, ...others), h('div', { class: 'row', style: { marginTop: '12px' } }, button('Avbryt', { onClick: closeModal }))]);
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
      audio.setBreath(vent.disconnected ? 0 : vent.lung.state.flow, true);
    } else audio.setBreath(0, false);
    for (const s of Object.values(sc)) s.draw();
    if (ui.layout === 'loops') { pvLoop.setData(loopCur.pv, loopPrev.pv); pvLoop.draw(); fvLoop.setData(loopCur.fv, loopPrev.fv); fvLoop.draw(); }
    if (ui.layout === 'panels') drawDynamicLung(lastSample);
    if (ui.autoHoldUntil !== null && vent.time >= ui.autoHoldUntil) { vent.releaseHold(); ui.autoHoldUntil = null; }
    const sec = Math.floor(vent.time);
    if (sec !== lastClockSec) {
      lastClockSec = sec;
      renderClock();
      if (vent.holdActive) toolsRefresh?.();
      if (vent.time - ui.lastBreathTime > 12 || vent.disconnected) updateGasFromVent();
      if (ui.o2Enrich && vent.time >= ui.o2Enrich.until) { applySetting('fio2', ui.o2Enrich.prev, { silent: true }); ui.o2Enrich = null; o2Btn.classList.remove('on'); logEvent('O2-anrikning ferdig'); }
      evaluateAlarms(); updateMMP(vent.measurements); renderMsgBar(); renderMonitorPanel();
      if (ui.layout === 'panels') { drawVentStatus(); drawDynamicLungText(); }
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
    updateMarkers(); renderTop(); renderSettingsBar(); updateMMP(vent.measurements); renderClock(); renderMonitorPanel();
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
