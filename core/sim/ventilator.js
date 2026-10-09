/**
 * Respiratorsimulator (Hamilton-lik terminologi). Ren logikk, ingen DOM.
 *
 * Modi:
 *   SCMV  (S)CMV  volumkontroll, konstant eller deselererende flow, valgfri pause (TIP),
 *                 synkronisert: pasienttrigger gir en mandatorisk pust og nullstiller syklusen.
 *   PCV   PCV+    trykkontroll, Pcontrol over PEEP, stigetid Pramp.
 *   SPONT SPONT   trykkstøtte, Psupport over PEEP, syklus ved ETS (% av toppflow) eller TI max,
 *                 backup-ventilasjon (PCV) ved apné.
 *
 * Alle trykk i cmH2O, volum i ml, flow i L/s internt (innstilt trigger i L/min), tid i s.
 * Innstillinger som leses ved hver puststart, så endringer virker fra neste pust (som på en
 * ekte respirator).
 *
 * Standardverdier (DEFAULT_SETTINGS) er ment å ligne Hamiltons voksenstandard, men er
 * UVERIFISERT – se KILDER.md.
 */
import { createLung } from './lungModel.js';
import { pmusAt } from './patientEffort.js';
import {
  cycleTime, tiFromIE, peakFlowForVolume, flowAtFraction, timeConstant,
  staticCompliance, inspiratoryResistance, idealBodyWeightHamilton, vtPerKg,
} from '../physiology/respiratory.js';

export const MODES = {
  SCMV: { id: 'SCMV', label: '(S)CMV', description: 'Volumkontroll, synkronisert' },
  PCV: { id: 'PCV', label: 'PCV+', description: 'Trykkontroll' },
  SPONT: { id: 'SPONT', label: 'SPONT', description: 'Trykkstøtte (spontan)' },
};

export const DEFAULT_SETTINGS = {
  mode: 'SCMV',
  vt: 500,            // ml
  rate: 15,           // /min
  peep: 5,            // cmH2O
  fio2: 40,           // % (ingen effekt i v1, lagres for senere gassutveksling)
  timingMode: 'ie',   // 'ie' | 'ti'
  ie: { i: 1, e: 2 },
  ti: 1.0,            // s (brukes når timingMode = 'ti')
  tip: 0,             // pause i % av TI (UVERIFISERT om Hamilton bruker % av TI eller syklus)
  flowPattern: 'square', // 'square' | 'decel'
  pcontrol: 15,       // cmH2O over PEEP
  psupport: 10,       // cmH2O over PEEP
  pramp: 50,          // ms
  ets: 25,            // % av toppflow
  trigger: { type: 'flow', value: 2 }, // L/min (flow) eller cmH2O (pressure)
  tiMax: 2.0,         // s, maks inspirasjonstid i SPONT
  apneaTime: 20,      // s før backup i SPONT
  backup: { rate: 12, pcontrol: 15 },
};

export const DEFAULT_PATIENT = {
  compliance: 50,     // ml/cmH2O
  resistance: 10,     // cmH2O/(L/s)
  resistanceExp: null, // null = samme som resistance
  effort: { amplitude: 0, rate: 14, duration: 1.0 }, // Pmus cmH2O, egenfrekvens /min, nevral Ti s
  height: 175,        // cm
  sex: 'M',           // 'M' | 'K'
};

const MAX_HOLD = 10;       // s, Hamilton avslutter hold automatisk (UVERIFISERT: 10 s)
const MIN_EXP_BEFORE_TRIGGER = 0.15; // s refraktærtid etter ekspirasjonsstart
const WINDOW = 8;          // antall pust i glidende gjennomsnitt for fTotal/ExpMinVol

function deepMerge(target, src) {
  for (const [k, v] of Object.entries(src || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') {
      target[k] = deepMerge({ ...target[k] }, v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

export function createVentilator({ settings = {}, patient = {}, dt = 0.005 } = {}) {
  const s = deepMerge(structuredClone(DEFAULT_SETTINGS), settings);
  const p = deepMerge(structuredClone(DEFAULT_PATIENT), patient);
  const lung = createLung({ compliance: p.compliance, resistance: p.resistance, resistanceExp: p.resistanceExp, initialVolume: p.compliance * s.peep });

  let t = 0;
  let phase = 'exp';
  let breath = null;          // pågående pust
  let lastBreath = null;      // forrige fullførte pust
  let nextMandatory = 0;      // tidspunkt for neste maskinpust
  let expStart = 0;
  let effortStart = -Infinity;
  let effortNext = Infinity;
  let backupActive = false;
  let lastBreathStart = 0;
  const hold = { requested: null, active: null, start: 0, released: false };
  let disconnected = false;
  // Ved frakobling står luftveien åpen mot atmosfæren uansett hva respiratoren gjør.
  const openLung = {
    stepFlow: (d, f, pm) => lung.stepPressure(d, 0, pm),
    stepPressure: (d, pw, pm) => lung.stepPressure(d, 0, pm),
    stepOccluded: (d, pm) => lung.stepPressure(d, 0, pm),
  };
  const L = () => (disconnected ? openLung : lung);
  const history = [];         // siste fullførte pust (for glidende gjennomsnitt)
  const listeners = new Set();
  let holdResult = null;

  const measurements = {
    ppeak: null, pplat: null, pplatMeasured: null, pmean: null,
    peep: s.peep, autoPeep: null, autoPeepMeasured: null, peepTotal: null,
    vti: null, vte: null, expMinVol: null, fTotal: null, fSpont: null,
    cstat: null, rinsp: null, rcexp: null, drivingPressure: null,
    ti: null, te: null, ieText: null, vtPerKg: null, ibw: null,
    breathType: null, cycleReason: null, mode: s.mode,
  };

  function ibw() { return idealBodyWeightHamilton(p.height, p.sex); }

  function tiSetting() {
    const tc = cycleTime(s.rate);
    let ti = s.timingMode === 'ie' ? tiFromIE(s.rate, s.ie) : s.ti;
    return Math.max(0.1, Math.min(ti, tc - 0.1));
  }

  function pmusNow() {
    if (!p.effort || p.effort.amplitude <= 0) return 0;
    return pmusAt(t - effortStart, p.effort);
  }

  function scheduleEffortAfter(time) {
    if (p.effort && p.effort.amplitude > 0 && p.effort.rate > 0) effortNext = time + 60 / p.effort.rate;
    else effortNext = Infinity;
  }

  function startBreath(type) {
    const tc = cycleTime(s.rate);
    const mode = s.mode;
    const ti = tiSetting();
    const b = {
      type, mode, start: t, vStart: lung.state.volume, peepSet: s.peep,
      ti: null, te: null, tcycle: null,
      ppeak: -Infinity, pawInt: 0, vti: 0, vte: 0,
      endInspPalv: null, endInspFlow: null, endInspPaw: null, endExpPalv: null,
      peakFlow: 0, cycleReason: null,
      reg: { n: 0, sx: 0, sy: 0, sxx: 0, sxy: 0 }, // regresjon flow vs volum i ekspirasjon
      expSampleStart: null,
    };
    if (mode === 'SCMV' && type !== 'backup') {
      b.flowTime = ti * (1 - Math.min(70, Math.max(0, s.tip)) / 100);
      b.pauseTime = ti - b.flowTime;
      b.peakSetFlow = peakFlowForVolume(s.vt, b.flowTime, s.flowPattern);
      b.tiSet = ti;
    } else if (mode === 'PCV' && type !== 'backup') {
      b.ptarget = s.peep + s.pcontrol;
      b.tiSet = ti;
    } else if (type === 'backup') {
      b.ptarget = s.peep + s.backup.pcontrol;
      b.tiSet = Math.min(1.0, cycleTime(s.backup.rate) / 3);
    } else {
      b.ptarget = s.peep + s.psupport;
      b.tiSet = s.tiMax;
    }
    b.rampTime = Math.max(0, s.pramp) / 1000;
    breath = b;
    phase = 'insp';
    lastBreathStart = t;
    if (type === 'backup') nextMandatory = t + cycleTime(s.backup.rate);
    else if (mode !== 'SPONT') nextMandatory = t + tc;
    if (type === 'mandatory' || type === 'backup') scheduleEffortAfter(t); // pasienten følger maskinen
    if (type === 'triggered' || type === 'spont') backupActive = false;
  }

  function endInspiration() {
    const b = breath;
    b.ti = t - b.start;
    b.endInspPalv = lung.state.palv;
    b.endInspPaw = lung.state.paw;
    b.endInspFlow = lung.state.flow;
    if (hold.requested === 'insp') {
      hold.requested = null;
      hold.active = 'insp';
      hold.start = t;
      hold.released = false;
      phase = 'hold-insp';
    } else {
      startExpiration();
    }
  }

  function startExpiration() {
    phase = 'exp';
    expStart = t;
    breath.expStartTime = t;
  }

  function finishBreath() {
    const b = breath;
    b.tcycle = t - b.start;
    b.te = b.tcycle - b.ti - (b.holdTime || 0);
    b.endExpPalv = lung.state.palv;
    updateMeasurements(b);
    lastBreath = b;
    history.push(b);
    if (history.length > WINDOW) history.shift();
    listeners.forEach((fn) => fn({ ...measurements }, b));
  }

  function updateMeasurements(b) {
    const m = measurements;
    const peepTotal = Math.max(b.peepSet, b.endExpPalv);
    m.mode = s.mode;
    m.breathType = b.type;
    m.cycleReason = b.cycleReason;
    m.ppeak = b.ppeak;
    m.pplat = b.endInspPalv;
    m.pmean = b.pawInt / b.tcycle;
    m.peep = b.peepSet;
    m.peepTotal = peepTotal;
    m.autoPeep = Math.max(0, peepTotal - b.peepSet);
    m.vti = b.vti;
    m.vte = b.vte;
    m.ti = b.ti;
    m.te = b.te;
    const ratio = b.te / b.ti;
    m.ieText = ratio >= 1 ? `1:${ratio.toFixed(1)}` : `${(1 / ratio).toFixed(1)}:1`;
    m.drivingPressure = b.endInspPalv - peepTotal;
    m.cstat = staticCompliance(b.vti, b.endInspPalv, peepTotal);
    m.rinsp = b.endInspFlow > 0.05 ? inspiratoryResistance(b.endInspPaw, b.endInspPalv, b.endInspFlow) : null;
    const slope = regressionSlope(b.reg);
    m.rcexp = slope < 0 ? -1 / (slope * 1000) : null; // volum i ml, flow i L/s → s
    m.ibw = ibw();
    m.vtPerKg = vtPerKg(b.vte, m.ibw);
    const totalTime = history.reduce((a, x) => a + x.tcycle, 0) + b.tcycle;
    const n = history.length + 1;
    m.fTotal = (60 * n) / totalTime;
    m.expMinVol = ((history.reduce((a, x) => a + x.vte, 0) + b.vte) / totalTime) * 60 / 1000;
    const spontN = history.filter((x) => x.type === 'spont').length + (b.type === 'spont' ? 1 : 0);
    m.fSpont = (60 * spontN) / totalTime;
    if (holdResult?.type === 'insp') m.pplatMeasured = holdResult.pplat;
    if (holdResult?.type === 'exp') m.autoPeepMeasured = holdResult.autoPeep;
  }

  function regressionSlope(r) {
    if (r.n < 10) return null;
    const d = r.n * r.sxx - r.sx * r.sx;
    if (Math.abs(d) < 1e-9) return null;
    return (r.n * r.sxy - r.sx * r.sy) / d;
  }

  function triggerCheck(pmus) {
    if (disconnected) return false; // ingen flow/trykk å trigge på i en åpen krets
    if (t - expStart < MIN_EXP_BEFORE_TRIGGER) return false;
    const pdrop = pmus - (lung.elasticPressure - s.peep); // trykk pasienten trekker under PEEP
    if (pdrop <= 0) return false;
    if (s.trigger.type === 'pressure') return pdrop >= s.trigger.value;
    const r = lung.state.resistance;
    return pdrop / r >= s.trigger.value / 60; // flow i L/s
  }

  function patientTriggerDisplayDrop(pmus) {
    const pdrop = pmus - (lung.elasticPressure - s.peep);
    if (pdrop <= 0) return 0;
    return s.trigger.type === 'pressure' ? Math.min(pdrop, s.trigger.value) : Math.min(pdrop, 1) * 0.5;
  }

  function step() {
    // pasientinnsats
    if (t >= effortNext) {
      effortStart = t;
      effortNext = effortStart + 60 / p.effort.rate;
    }
    const pmus = pmusNow();
    let sample;

    if (phase === 'exp') {
      // Skal det starte en pust?
      let startType = null;
      if (hold.active === 'exp') {
        // holdes nedenfor
      } else if (triggerCheck(pmus)) {
        startType = s.mode === 'SPONT' ? 'spont' : 'triggered';
      } else if (s.mode !== 'SPONT' && t >= nextMandatory) {
        startType = 'mandatory';
      } else if (s.mode === 'SPONT') {
        if (backupActive && t >= nextMandatory) startType = 'backup';
        else if (!backupActive && t - lastBreathStart >= s.apneaTime) { startType = 'backup'; backupActive = true; }
      }

      if (startType && hold.requested === 'exp' && breath) {
        hold.requested = null;
        hold.active = 'exp';
        hold.start = t;
        hold.released = false;
        phase = 'hold-exp';
        breath.pendingStart = startType;
      } else if (startType) {
        if (breath) finishBreath();
        startBreath(startType);
        return step(); // kjør første inspirasjonssteg med en gang
      }
    }

    if (phase === 'hold-exp') {
      L().stepOccluded(dt, pmus);
      breath.holdTime = (breath.holdTime || 0) + dt;
      if (hold.released || t - hold.start >= MAX_HOLD) {
        holdResult = { type: 'exp', peepTotal: lung.state.paw, autoPeep: Math.max(0, lung.state.paw - s.peep), time: t };
        hold.active = null;
        const next = breath.pendingStart;
        finishBreath();
        startBreath(next);
        return step();
      }
    } else if (phase === 'exp') {
      const paw = s.peep;
      L().stepPressure(dt, paw, pmus);
      // ekspirert volum og regresjon for RCexp
      if (breath && !disconnected && lung.state.deltaVolume < 0) {
        breath.vte += -lung.state.deltaVolume;
        if (t - expStart > 0.05 && pmus === 0) {
          const x = lung.state.volume; // ml
          const y = lung.state.flow;   // L/s
          const r = breath.reg;
          r.n++; r.sx += x; r.sy += y; r.sxx += x * x; r.sxy += x * y;
        }
      }
      // vis lite trykkfall ved pasientinnsats før trigging
      if (!disconnected) lung.state.paw = paw - patientTriggerDisplayDrop(pmus);
    } else if (phase === 'insp') {
      const b = breath;
      const elapsed = t - b.start;
      if (b.mode === 'SCMV' && b.type !== 'backup') {
        if (elapsed < b.flowTime - 1e-9 && (disconnected || b.vti < s.vt - 1e-9)) {
          let flow = flowAtFraction(b.peakSetFlow, elapsed / b.flowTime, s.flowPattern);
          const remaining = s.vt - b.vti;
          if (flow * dt * 1000 > remaining) flow = remaining / (dt * 1000);
          L().stepFlow(dt, flow, pmus);
        } else if (elapsed < b.tiSet - 1e-9) {
          L().stepOccluded(dt, pmus);
        } else {
          endInspiration();
          return step();
        }
      } else {
        // trykkstyrt (PCV+, SPONT, backup)
        const ramp = b.rampTime > 0 ? Math.min(1, elapsed / b.rampTime) : 1;
        const target = s.peep + (b.ptarget - s.peep) * ramp;
        L().stepPressure(dt, target, pmus);
        const flow = lung.state.flow;
        if (flow > b.peakFlow) b.peakFlow = flow;
        let cycle = false;
        if (b.type === 'spont') {
          if (elapsed >= b.tiSet) { cycle = true; b.cycleReason = 'TI max'; }
          else if (elapsed > b.rampTime + 0.05 && b.peakFlow > 0 && flow <= b.peakFlow * (s.ets / 100)) { cycle = true; b.cycleReason = 'ETS'; }
          else if (flow < 0 && elapsed > 0.1) { cycle = true; b.cycleReason = 'ekspiratorisk flow'; }
        } else if (elapsed >= b.tiSet) {
          cycle = true; b.cycleReason = 'TI';
        }
        if (cycle) {
          endInspiration();
          return step();
        }
      }
      if (!disconnected && lung.state.deltaVolume > 0) b.vti += lung.state.deltaVolume;
    } else if (phase === 'hold-insp') {
      L().stepOccluded(dt, pmus);
      breath.holdTime = (breath.holdTime || 0) + dt;
      if (hold.released || t - hold.start >= MAX_HOLD) {
        holdResult = { type: 'insp', pplat: lung.state.paw, time: t };
        nextMandatory += t - hold.start;
        breath.endInspPalv = lung.state.paw; // målt platå erstatter estimatet
        hold.active = null;
        startExpiration();
      }
    }

    if (breath) {
      breath.ppeak = Math.max(breath.ppeak, lung.state.paw);
      breath.pawInt += lung.state.paw * dt;
    }

    t += dt;
    sample = {
      t, paw: lung.state.paw, flow: lung.state.flow,
      volume: breath ? lung.state.volume - breath.vStart : 0,
      palv: lung.state.palv, pmus,
      phase: hold.active ? `hold-${hold.active}` : phase,
      breathType: breath?.type ?? null,
    };
    return sample;
  }

  const vent = {
    lung,
    get settings() { return s; },
    get patient() { return p; },
    get time() { return t; },
    get phase() { return phase; },
    get measurements() { return measurements; },
    get holdResult() { return holdResult; },
    get holdActive() { return hold.active; },
    get holdRequested() { return hold.requested; },
    get breath() { return breath; },
    get lastBreath() { return lastBreath; },
    get dt() { return dt; },
    get backupActive() { return backupActive; },
    get disconnected() { return disconnected; },
    setDisconnected(v) { disconnected = !!v; },

    setSettings(partial) {
      const prevMode = s.mode;
      deepMerge(s, partial);
      if (s.mode !== prevMode) {
        backupActive = false;
        if (s.mode !== 'SPONT' && phase === 'exp') nextMandatory = Math.min(nextMandatory, t + cycleTime(s.rate));
        if (s.mode === 'SPONT') lastBreathStart = t;
      }
      if (partial.rate !== undefined && s.mode !== 'SPONT' && breath) {
        nextMandatory = Math.min(nextMandatory, breath.start + cycleTime(s.rate));
      }
      measurements.peep = s.peep;
      return s;
    },

    setPatient(partial) {
      deepMerge(p, partial);
      lung.setMechanics({ compliance: p.compliance, resistance: p.resistance, resistanceExp: p.resistanceExp ?? p.resistance });
      if (partial.effort) {
        if (p.effort.amplitude > 0 && effortNext === Infinity) scheduleEffortAfter(t);
        if (p.effort.amplitude <= 0) effortNext = Infinity;
      }
      return p;
    },

    /** Be om hold ved neste faseovergang. type: 'insp' | 'exp' */
    requestHold(type) {
      hold.requested = type;
      hold.released = false;
    },
    releaseHold() {
      hold.requested = null;
      hold.released = true;
    },

    onBreath(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    step,

    /** Kjør i `seconds` sekunder, returner prøver (for tester og hurtigsimulering). */
    run(seconds) {
      const out = [];
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n; i++) out.push(step());
      return out;
    },

    reset() {
      t = 0; phase = 'exp'; breath = null; lastBreath = null; nextMandatory = 0; expStart = 0;
      effortStart = -Infinity; effortNext = Infinity; backupActive = false; lastBreathStart = 0;
      hold.requested = null; hold.active = null; hold.released = false; holdResult = null;
      history.length = 0;
      lung.reset(p.compliance * s.peep);
      scheduleEffortAfter(0);
    },
  };

  vent.reset();
  return vent;
}
