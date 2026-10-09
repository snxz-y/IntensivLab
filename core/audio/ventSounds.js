/**
 * Respiratorlyder med Web Audio API: pustelyd som følger flowkurven, alarmtoner i to
 * prioriteter og valgfri pulstone som følger SpO2. Ingen lydfiler; alt syntetiseres.
 *
 * Alarmmønstrene er inspirert av IEC 60601-1-8 (høy prioritet: to grupper med 3 + 2 pulser,
 * middels prioritet: 3 pulser), men er ikke en gjengivelse av Hamiltons faktiske lyder
 * (UVERIFISERT, se KILDER.md). Pulstonen følger praksis i pulsoksymetre der tonehøyden
 * faller med metningen.
 *
 * De rene hjelpefunksjonene (breathGain, breathFilterHz, pulsePitch, ALARM_PATTERNS) er
 * testbare uten lydkontekst.
 */

/** Lydstyrke (0–1) for pustelyden ut fra flow (L/s). */
export function breathGain(flowLps) {
  const x = Math.min(1, Math.abs(flowLps) / 0.9);
  return x * x; // kvadratisk: stille ved lav flow, tydelig ved høy
}

/** Filterfrekvens (Hz): inspirasjon lysere, ekspirasjon mørkere. */
export function breathFilterHz(flowLps) {
  return flowLps >= 0 ? 700 : 380;
}

/** Tonehøyde (Hz) for pulstone ut fra SpO2 (0–1): 100 % ≈ 880 Hz, 80 % ≈ 520 Hz. */
export function pulsePitch(spo2) {
  const x = Math.min(1, Math.max(0, (spo2 - 0.80) / 0.20));
  return 520 + 360 * x;
}

/** Alarmmønstre: pulstidspunkter (s) innen en periode. */
export const ALARM_PATTERNS = {
  high: { freq: 880, pulse: 0.14, times: [0, 0.22, 0.44, 0.84, 1.06], period: 2.6 },
  medium: { freq: 660, pulse: 0.2, times: [0, 0.3, 0.6], period: 5.0 },
};

export function createVentAudio() {
  let ctx = null;
  let master, noiseSrc, noiseFilter, noiseGain;
  let enabled = false;
  const opts = { volume: 0.6, breath: true, alarms: true, pulse: false };
  let alarmPriority = null;
  let alarmTimer = null;
  let silencedUntil = 0;
  let pulseTimer = null;
  let pulseSpo2 = null;
  let pulseRate = 80;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = opts.volume;
    master.connect(ctx.destination);
    // pustelyd: filtrert støy
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buf;
    noiseSrc.loop = true;
    noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 500;
    noiseFilter.Q.value = 0.8;
    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noiseSrc.connect(noiseFilter).connect(noiseGain).connect(master);
    noiseSrc.start();
  }

  function beep(freq, duration, when = 0, gain = 0.5) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.setValueAtTime(gain, t0 + duration - 0.02);
    g.gain.linearRampToValueAtTime(0, t0 + duration);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.01);
  }

  function scheduleAlarm() {
    clearInterval(alarmTimer);
    alarmTimer = null;
    if (!enabled || !opts.alarms || !alarmPriority) return;
    const p = ALARM_PATTERNS[alarmPriority];
    const fire = () => {
      if (Date.now() < silencedUntil) return;
      for (const t of p.times) beep(p.freq, p.pulse, t, alarmPriority === 'high' ? 0.6 : 0.4);
    };
    fire();
    alarmTimer = setInterval(fire, p.period * 1000);
  }

  function schedulePulse() {
    clearInterval(pulseTimer);
    pulseTimer = null;
    if (!enabled || !opts.pulse || pulseSpo2 === null) return;
    pulseTimer = setInterval(() => beep(pulsePitch(pulseSpo2), 0.06, 0, 0.25), 60000 / pulseRate);
  }

  return {
    get enabled() { return enabled; },
    get options() { return { ...opts }; },
    /** Må kalles fra en brukerhandling (klikk/touch). */
    async enable() {
      ensure();
      if (!ctx) return false;
      if (ctx.state === 'suspended') await ctx.resume();
      enabled = true;
      scheduleAlarm();
      schedulePulse();
      return true;
    },
    disable() {
      enabled = false;
      clearInterval(alarmTimer); alarmTimer = null;
      clearInterval(pulseTimer); pulseTimer = null;
      if (noiseGain && ctx) noiseGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      ctx?.suspend?.();
    },
    setOptions(partial) {
      Object.assign(opts, partial);
      if (master) master.gain.setTargetAtTime(opts.volume, ctx.currentTime, 0.05);
      if (!opts.breath && noiseGain) noiseGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      scheduleAlarm();
      schedulePulse();
    },
    /** Oppdater pustelyden fra gjeldende flow (L/s). Kall hver frame. */
    setBreath(flowLps) {
      if (!enabled || !ctx || !opts.breath) return;
      const t = ctx.currentTime;
      noiseGain.gain.setTargetAtTime(breathGain(flowLps) * 0.35, t, 0.04);
      noiseFilter.frequency.setTargetAtTime(breathFilterHz(flowLps), t, 0.08);
    },
    /** 'high' | 'medium' | null */
    setAlarm(priority) {
      if (priority === alarmPriority) return;
      alarmPriority = priority;
      scheduleAlarm();
    },
    /** Demp alarmen i `seconds` sekunder (Hamilton: «Audio pause»). */
    silence(seconds = 120) {
      silencedUntil = Date.now() + seconds * 1000;
    },
    get silenced() { return Date.now() < silencedUntil; },
    /** spo2 0–1 eller null for å slå av. */
    setPulse(spo2, rate = 80) {
      const was = pulseSpo2 === null;
      pulseSpo2 = spo2;
      pulseRate = rate;
      if (was !== (spo2 === null) || !pulseTimer) schedulePulse();
    },
    destroy() {
      this.disable();
      try { noiseSrc?.stop(); ctx?.close(); } catch { /* ignorer */ }
      ctx = null;
    },
  };
}
