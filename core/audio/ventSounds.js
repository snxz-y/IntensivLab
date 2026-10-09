/**
 * Respirator- og pasientlyder med Web Audio API. Ingen lydfiler; alt syntetiseres.
 *
 * Lag:
 *  - Turbin: svak, konstant høyfrekvent sus når respiratoren går (HAMILTON-C1 har integrert turbin).
 *  - Pustelyd: filtrert støy styrt av flow. Inspirasjon lysere (luft gjennom tube og slanger),
 *    ekspirasjon mørkere og «åpnere» (ekspirasjonsventil). Ventilklikk ved faseskifte.
 *  - Pasientlyder: pipelyd (tonal, ekspiratorisk), sekretlyd/rhonchi (knitring i takt med flow),
 *    hoste (støtvise lufttrykk).
 *  - Alarmer: høy prioritet 5 pip gjentatt, middels 3 pip periodisk (HAMILTON-C6-håndbok kap. 9),
 *    tonehøyde/tempo er valgt. Pulstone som følger SpO2.
 *
 * Alle volumer settes direkte med egen utjevning; ingen automasjonskø (Safari rydder ikke køen).
 * De rene hjelpefunksjonene (breathGain, breathFilterHz, pulsePitch, ALARM_PATTERNS) er testbare uten
 * lydkontekst.
 */

/** Lydstyrke (0–1) for pustelyden ut fra flow (L/s). */
export function breathGain(flowLps) {
  const x = Math.min(1, Math.abs(flowLps) / 0.9);
  return x * x;
}

/** Filterfrekvens (Hz): inspirasjon lysere, ekspirasjon mørkere. */
export function breathFilterHz(flowLps) {
  return flowLps >= 0 ? 900 : 420;
}

/** Tonehøyde (Hz) for pulstone ut fra SpO2 (0–1): 100 % ≈ 880 Hz, 80 % ≈ 520 Hz. */
export function pulsePitch(spo2) {
  const x = Math.min(1, Math.max(0, (spo2 - 0.80) / 0.20));
  return 520 + 360 * x;
}

/**
 * Alarmmønstre, målt fra opptak av HAMILTON-C6-simuleringsprogramvaren (ren sinus, 205 ms per tone,
 * tonene G5 ≈ 787 Hz, E6 ≈ 1335 Hz, C6 ≈ 1051 Hz):
 *  - høy prioritet: fem toner i to grupper (3 + 2) med 95 ms mellomrom, gruppene 0,4 s fra hverandre, gjentatt hvert 2,4 s
 *  - middels prioritet: tre toner med 195 ms mellomrom, gjentatt sjeldnere
 * Dette er samme oppbygning som IEC 60601-1-8 (høy: 5 pulser, middels: 3 pulser).
 */
export const ALARM_PATTERNS = {
  high: { freqs: [787, 1335, 1051, 1335, 1051], pulse: 0.205, times: [0, 0.3, 0.6, 1.2, 1.5], period: 2.4 },
  medium: { freqs: [787, 1335, 1051], pulse: 0.205, times: [0, 0.4, 0.8], period: 8.0 },
};

export function createVentAudio() {
  let ctx = null;
  let master, breathGainNode, breathFilter, exhaleFilter, exhaleGain, turbineGain, wheezeOsc, wheezeGain, crackleGain, crackleFilter;
  let enabled = false;
  const opts = { volume: 0.6, breath: true, alarms: true, pulse: false, patient: true };
  let alarmPriority = null;
  let alarmTimer = null;
  let silencedUntil = 0;
  let pulseTimer = null;
  let pulseSpo2 = null;
  let pulseRate = 80;
  let curGain = 0, curExhale = 0, curFreq = 600, curWheeze = 0, curCrackle = 0;
  let patient = { wheeze: 0, secretions: 0 };
  let lastFlowSign = 0;
  let lastCrackle = 0;
  let unlockEl = null;
  let resumeHooked = false;

  function silentWav() {
    const rate = 8000, n = 1600;
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    str(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    let bin = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }

  function hookResume() {
    if (resumeHooked || typeof document === 'undefined') return;
    resumeHooked = true;
    const tryResume = () => { if (enabled && ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); };
    document.addEventListener('visibilitychange', tryResume);
    document.addEventListener('touchend', tryResume, { passive: true });
    document.addEventListener('click', tryResume);
  }

  /** Støybuffer med «rosa» karakter (lavpassfiltrert hvit støy) for naturligere sus. */
  function noiseBuffer(seconds = 2) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    return buf;
  }
  function loopNoise() { const src = ctx.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true; src.start(); return src; }

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = opts.volume; master.connect(ctx.destination);
    ctx.onstatechange = () => { if (enabled && ctx.state === 'interrupted') ctx.resume().catch(() => {}); };

    // Turbin: høyfrekvent svak sus
    turbineGain = ctx.createGain(); turbineGain.gain.value = 0;
    const tf = ctx.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 3200; tf.Q.value = 2.5;
    loopNoise().connect(tf).connect(turbineGain).connect(master);

    // Inspirasjonslyd: båndpass-støy som følger flow
    breathFilter = ctx.createBiquadFilter(); breathFilter.type = 'bandpass'; breathFilter.frequency.value = 900; breathFilter.Q.value = 0.9;
    breathGainNode = ctx.createGain(); breathGainNode.gain.value = 0;
    loopNoise().connect(breathFilter).connect(breathGainNode).connect(master);

    // Ekspirasjonslyd: mørkere, «åpen» lyd fra ekspirasjonsventilen
    exhaleFilter = ctx.createBiquadFilter(); exhaleFilter.type = 'lowpass'; exhaleFilter.frequency.value = 700; exhaleFilter.Q.value = 0.5;
    exhaleGain = ctx.createGain(); exhaleGain.gain.value = 0;
    loopNoise().connect(exhaleFilter).connect(exhaleGain).connect(master);

    // Pipelyd: tonal, med vibrato, følger ekspiratorisk flow
    wheezeOsc = ctx.createOscillator(); wheezeOsc.type = 'sawtooth'; wheezeOsc.frequency.value = 420;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vibG = ctx.createGain(); vibG.gain.value = 12;
    vib.connect(vibG).connect(wheezeOsc.frequency); vib.start();
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 1200;
    wheezeGain = ctx.createGain(); wheezeGain.gain.value = 0;
    wheezeOsc.connect(wf).connect(wheezeGain).connect(master); wheezeOsc.start();

    // Sekretlyd: knitring = korte støypulser gjennom båndpass
    crackleFilter = ctx.createBiquadFilter(); crackleFilter.type = 'bandpass'; crackleFilter.frequency.value = 350; crackleFilter.Q.value = 1.5;
    crackleGain = ctx.createGain(); crackleGain.gain.value = 0;
    loopNoise().connect(crackleFilter).connect(crackleGain).connect(master);
  }

  function beep(freq, duration, when = 0, gain = 0.5, type = 'triangle', overtone = 0.25) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator(); const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    osc2.type = 'sine'; osc2.frequency.value = freq * 2; // overtone for «elektronisk» klang (0 = ren tone)
    const g2 = ctx.createGain(); g2.gain.value = overtone;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.setValueAtTime(gain, t0 + duration - 0.02);
    g.gain.linearRampToValueAtTime(0, t0 + duration);
    osc.connect(g); osc2.connect(g2).connect(g); g.connect(master);
    osc.start(t0); osc2.start(t0); osc.stop(t0 + duration + 0.01); osc2.stop(t0 + duration + 0.01);
  }

  /** Kort støystøt (ventilklikk, hostestøt). */
  function burst({ duration = 0.03, freq = 2000, q = 1, gain = 0.3, when = 0, type = 'bandpass' } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.3);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(f).connect(g).connect(master);
    src.start(t0); src.stop(t0 + duration + 0.02);
  }

  function scheduleAlarm() {
    clearInterval(alarmTimer); alarmTimer = null;
    if (!enabled || !opts.alarms || !alarmPriority) return;
    const p = ALARM_PATTERNS[alarmPriority];
    const fire = () => { if (Date.now() < silencedUntil) return; p.times.forEach((t, i) => beep(p.freqs[i], p.pulse, t, alarmPriority === 'high' ? 0.6 : 0.45, 'sine', 0)); };
    fire();
    alarmTimer = setInterval(fire, p.period * 1000);
  }
  function schedulePulse() {
    clearInterval(pulseTimer); pulseTimer = null;
    if (!enabled || !opts.pulse || pulseSpo2 === null) return;
    pulseTimer = setInterval(() => beep(pulsePitch(pulseSpo2), 0.06, 0, 0.25, 'sine'), 60000 / Math.max(30, pulseRate));
  }

  return {
    get enabled() { return enabled; },
    get options() { return { ...opts }; },
    async enable() {
      ensure();
      if (!ctx) return false;
      try {
        if (!unlockEl && typeof Audio !== 'undefined') { unlockEl = new Audio(silentWav()); unlockEl.loop = true; unlockEl.volume = 0.01; }
        await unlockEl?.play?.();
      } catch { /* ikke kritisk */ }
      if (ctx.state !== 'running') await ctx.resume();
      hookResume();
      enabled = true;
      scheduleAlarm(); schedulePulse();
      return true;
    },
    disable() {
      enabled = false;
      clearInterval(alarmTimer); alarmTimer = null;
      clearInterval(pulseTimer); pulseTimer = null;
      for (const g of [breathGainNode, exhaleGain, turbineGain, wheezeGain, crackleGain]) if (g) g.gain.value = 0;
      curGain = curExhale = curWheeze = curCrackle = 0;
      unlockEl?.pause?.();
      ctx?.suspend?.();
    },
    setOptions(partial) {
      Object.assign(opts, partial);
      if (master) master.gain.value = opts.volume;
      if (!opts.breath && breathGainNode) { breathGainNode.gain.value = 0; exhaleGain.gain.value = 0; turbineGain.gain.value = 0; }
      if (!opts.patient && wheezeGain) { wheezeGain.gain.value = 0; crackleGain.gain.value = 0; }
      scheduleAlarm(); schedulePulse();
    },
    /** Oppdater pustelyden fra gjeldende flow (L/s). Kall hver frame. running: respiratoren går. */
    setBreath(flowLps, running = true) {
      if (!enabled || !ctx) return;
      if (opts.breath) {
        const g = breathGain(flowLps);
        const insp = flowLps > 0.02 ? g : 0;
        const exp = flowLps < -0.02 ? g : 0;
        curGain += (insp * 0.3 - curGain) * 0.25;
        curExhale += (exp * 0.22 - curExhale) * 0.2;
        curFreq += (breathFilterHz(flowLps) - curFreq) * 0.15;
        breathGainNode.gain.value = curGain;
        exhaleGain.gain.value = curExhale;
        breathFilter.frequency.value = curFreq;
        exhaleFilter.frequency.value = 500 + 600 * g;
        turbineGain.gain.value += ((running ? 0.035 : 0) - turbineGain.gain.value) * 0.1;
        // ventilklikk ved faseskifte
        const sign = flowLps > 0.05 ? 1 : flowLps < -0.05 ? -1 : lastFlowSign;
        if (sign !== lastFlowSign && lastFlowSign !== 0) burst({ duration: 0.02, freq: sign > 0 ? 2500 : 1600, q: 2, gain: 0.12 });
        lastFlowSign = sign;
      }
      if (opts.patient) {
        // pipelyd mest ved ekspirasjon, litt ved inspirasjon
        const expo = flowLps < -0.05 ? Math.min(1, -flowLps / 0.6) : flowLps > 0.1 ? 0.25 : 0;
        curWheeze += (patient.wheeze * expo * 0.12 - curWheeze) * 0.2;
        wheezeGain.gain.value = curWheeze;
        if (wheezeOsc) wheezeOsc.frequency.value = 380 + 120 * patient.wheeze + (flowLps < 0 ? 0 : 60);
        // sekret: knitring i takt med flow, tilfeldige små pulser
        const target = patient.secretions * breathGain(flowLps) * 0.25;
        curCrackle += (target - curCrackle) * 0.3;
        crackleGain.gain.value = curCrackle * (Math.random() < 0.5 ? 1 : 0.3);
        if (patient.secretions > 0 && Math.abs(flowLps) > 0.2 && ctx.currentTime - lastCrackle > 0.12 && Math.random() < 0.35) {
          lastCrackle = ctx.currentTime;
          burst({ duration: 0.012, freq: 500 + Math.random() * 900, q: 3, gain: 0.18 * patient.secretions });
        }
      }
    },
    /** Pasientlyder: { wheeze: 0–1, secretions: 0–1 } */
    setPatientSounds(p) { patient = { ...patient, ...p }; },
    /** Hoste: 2–4 støtvise lufttrykk. */
    cough(n = 3) {
      if (!enabled || !ctx || !opts.patient) return;
      for (let i = 0; i < n; i++) {
        const when = i * (0.28 + Math.random() * 0.08);
        burst({ duration: 0.16, freq: 300, q: 0.6, gain: 0.5, when, type: 'lowpass' });
        burst({ duration: 0.06, freq: 1800, q: 1.2, gain: 0.25, when });
      }
    },
    setAlarm(priority) { if (priority === alarmPriority) return; alarmPriority = priority; scheduleAlarm(); },
    silence(seconds = 120) { silencedUntil = Date.now() + seconds * 1000; },
    get silenced() { return Date.now() < silencedUntil; },
    get silencedFor() { return Math.max(0, (silencedUntil - Date.now()) / 1000); },
    unsilence() { silencedUntil = 0; },
    notify() { if (!enabled || !ctx) return; beep(740, 0.08, 0, 0.3, 'sine'); beep(988, 0.1, 0.1, 0.3, 'sine'); },
    setPulse(spo2, rate = 80) {
      const was = pulseSpo2 === null;
      pulseSpo2 = spo2; pulseRate = rate;
      if (was !== (spo2 === null) || !pulseTimer) schedulePulse();
    },
    destroy() {
      this.disable();
      try { ctx?.close(); } catch { /* ignorer */ }
      ctx = null;
    },
  };
}
