/**
 * Enkompartment lungemodell. Ren logikk, ingen DOM.
 *
 * Tilstand: V = volum i ml over volumet ved Paw = 0 (dvs. volumet ved PEEP er C·PEEP).
 * Bevegelsesligningen [K1 i respiratory.js]:
 *   Paw + Pmus = V/C + R·flow
 * Alveolært trykk: Palv = V/C − Pmus (muskelinnsats senker alveolærtrykket for gitt volum).
 *
 * To drivmåter per tidssteg:
 *  - stepFlow(dt, flow, pmus): respiratoren påtvinger flow (volumkontroll). Paw beregnes.
 *  - stepPressure(dt, paw, pmus): respiratoren påtvinger Paw (trykkontroll, trykkstøtte,
 *    ekspirasjon mot PEEP). Flow beregnes. Integreres eksakt (eksponentielt) så modellen er
 *    stabil for alle R·C.
 *  - stepOccluded(dt, pmus): begge ventiler lukket (hold-manøver). flow = 0, Paw = Palv.
 */
export function createLung({ compliance, resistance, resistanceExp = null, initialVolume = 0 }) {
  const state = {
    compliance,
    resistance,
    resistanceExp: resistanceExp ?? resistance,
    volume: initialVolume, // ml
    flow: 0, // L/s
    paw: 0, // cmH2O
    palv: 0, // cmH2O
    pmus: 0,
    deltaVolume: 0, // ml endret i siste steg
  };

  function palv(pmus = 0) {
    return state.volume / state.compliance - pmus;
  }

  const lung = {
    get state() { return state; },

    setMechanics({ compliance: c, resistance: r, resistanceExp: re }) {
      if (c !== undefined) state.compliance = c;
      if (r !== undefined) state.resistance = r;
      if (re !== undefined) state.resistanceExp = re ?? state.resistance;
      else if (r !== undefined && re === undefined) state.resistanceExp = state.resistanceExp ?? r;
    },

    /** Respiratoren påtvinger flow (L/s). */
    stepFlow(dt, flow, pmus = 0) {
      state.deltaVolume = flow * dt * 1000;
      state.volume += state.deltaVolume;
      state.flow = flow;
      state.pmus = pmus;
      state.palv = palv(pmus);
      state.paw = state.palv + state.resistance * flow;
      return state;
    },

    /** Respiratoren påtvinger luftveistrykk (cmH2O). */
    stepPressure(dt, paw, pmus = 0) {
      // Flowretning avgjør hvilken resistance som gjelder.
      const drive = paw + pmus - state.volume / state.compliance;
      const r = drive >= 0 ? state.resistance : state.resistanceExp;
      const tau = (r * state.compliance) / 1000;
      const vEq = state.compliance * (paw + pmus);
      const vNew = vEq + (state.volume - vEq) * Math.exp(-dt / tau);
      state.deltaVolume = vNew - state.volume;
      state.volume = vNew;
      state.flow = (paw + pmus - vNew / state.compliance) / r;
      state.pmus = pmus;
      state.paw = paw;
      state.palv = palv(pmus);
      return state;
    },

    /** Begge ventiler lukket. */
    stepOccluded(dt, pmus = 0) {
      state.flow = 0;
      state.deltaVolume = 0;
      state.pmus = pmus;
      state.palv = palv(pmus);
      state.paw = state.palv;
      return state;
    },

    /** Alveolært trykk ved nåværende volum (uten muskelinnsats). */
    get elasticPressure() { return state.volume / state.compliance; },

    reset(volume = 0) {
      state.volume = volume;
      state.flow = 0;
      state.paw = 0;
      state.palv = 0;
      state.pmus = 0;
      state.deltaVolume = 0;
    },
  };
  return lung;
}
