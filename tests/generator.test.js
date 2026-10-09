import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCase, pickScenario } from '../modules/blodgass/generator.js';
import { SCENARIOS } from '../modules/blodgass/vignettes.js';
import { phFromHco3Pco2, anionGap, correctedAnionGap, alveolarPo2, pfRatio } from '../core/physiology/acidbase.js';

/** Deterministisk tilfeldighet (mulberry32). */
function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 40;

function expectedStep3(sc) {
  if (sc.primary === 'normal') return ['ikke-aktuelt'];
  if (sc.primary === 'met-acidose' || sc.primary === 'met-alkalose') {
    if (sc.secondary === 'resp-acidose') return ['tillegg-resp-acidose'];
    if (sc.secondary === 'resp-alkalose') return ['tillegg-resp-alkalose'];
    return ['adekvat'];
  }
  if (sc.secondary === 'met-acidose-hoy-ag') return ['tillegg-met-acidose', 'tillegg-resp-acidose'];
  if (sc.secondary === 'met-alkalose') return ['tillegg-met-alkalose', 'tillegg-resp-alkalose'];
  return sc.chronic ? ['kronisk', 'delvis-kronisk', 'akutt'] : ['akutt'];
}

for (const sc of SCENARIOS) {
  test(`scenario «${sc.id}» (nivå ${sc.level}): ${N} kasus er internt konsistente`, () => {
    const rng = seeded(sc.id.length * 7919 + sc.level);
    for (let i = 0; i < N; i++) {
      const c = generateCase({ scenarioId: sc.id, rng });
      const v = c.values;
      const tag = `${sc.id}#${i} ${JSON.stringify(v)}`;

      // fysiologiske grenser
      assert.ok(v.ph > 6.8 && v.ph < 7.8, `pH ${tag}`);
      assert.ok(v.pco2 > 1.5 && v.pco2 < 20, `PaCO2 ${tag}`);
      assert.ok(v.hco3 > 3 && v.hco3 < 60, `HCO3 ${tag}`);
      assert.ok(v.cl > 70 && v.cl < 130, `Cl ${tag}`);
      assert.ok(v.po2 >= 3.5 && v.po2 <= 70, `PaO2 ${tag}`);

      // Henderson–Hasselbalch: pH, PaCO2 og HCO3 henger sammen
      const phCalc = phFromHco3Pco2(v.hco3, v.pco2);
      assert.ok(Math.abs(phCalc - v.ph) <= 0.011, `HH-avvik ${(phCalc - v.ph).toFixed(4)} ${tag}`);

      // anion gap i fasit stemmer med elektrolyttene
      assert.ok(Math.abs(c.key.step4.ag - anionGap(v.na, v.cl, v.hco3)) < 0.06);
      assert.ok(Math.abs(c.key.step4.agCorr - correctedAnionGap(c.key.step4.ag, v.albumin)) < 0.06);
      // og med det generatoren siktet mot (avrundingsstøy < 1,5 mmol/L)
      assert.ok(Math.abs(c.key.step4.agCorr - c.key.agCorrTarget) < 1.5, `AG-mål ${tag}`);

      // oksygenering: PaO2 under alveolært PO2, P/F stemmer
      assert.ok(v.po2 < alveolarPo2(v.fio2, v.pco2), `PaO2 > PAO2 ${tag}`);
      assert.ok(Math.abs(c.key.step6.pf - pfRatio(v.po2, v.fio2)) < 0.06);

      // pH ligger på riktig side av 7,40 for primærforstyrrelsen
      const acid = sc.primary.endsWith('acidose');
      if (sc.primary === 'normal') assert.ok(v.ph >= 7.35 && v.ph <= 7.45 && c.key.step2 === 'normal', `normal ${tag}`);
      else if (acid) assert.ok(v.ph <= 7.40 || c.key.step1 === 'normal', `pH-side ${tag}`);
      else assert.ok(v.ph >= 7.40 || c.key.step1 === 'normal', `pH-side ${tag}`);
      assert.ok(['acidemi', 'alkalemi', 'normal'].includes(c.key.step1));

      // primær forstyrrelse fra tallene stemmer med scenarioet
      const allowed = [sc.primary];
      if (sc.secondary === 'resp-acidose' || sc.secondary === 'met-acidose-hoy-ag') allowed.push('blandet-acidose');
      if (sc.secondary === 'met-alkalose' && sc.primary === 'resp-alkalose') allowed.push('blandet-alkalose');
      assert.ok(allowed.includes(c.key.step2), `primær ${c.key.step2} ∉ ${allowed} ${tag}`);
      assert.ok(c.key.step2Accepted.includes(c.key.step2));

      // kompensasjonsvurdering
      const s3 = c.key.step3;
      if (c.key.step2 === 'blandet-acidose' && sc.primary === 'resp-acidose') {
        assert.equal(s3.verdict, 'tillegg-resp-acidose');
      } else {
        assert.ok(expectedStep3(sc).includes(s3.verdict), `trinn 3 ${s3.verdict} ∉ ${expectedStep3(sc)} ${tag}`);
        assert.ok(s3.accepted.includes(s3.verdict));
      }

      // anion gap høy/normal som tiltenkt
      const wantHigh = sc.agType === 'hoy' || sc.secondary === 'met-acidose-hoy-ag';
      assert.equal(c.key.step4.high, wantHigh, `AG høy ${tag}`);

      // delta ratio
      if (sc.secondary === 'met-alkalose' && sc.primary === 'met-acidose') assert.equal(c.key.step5.verdict, 'hoy-ag-pluss-met-alkalose', tag);
      if (sc.secondary === 'met-acidose-normal-ag') assert.equal(c.key.step5.verdict, 'blandet-hoy-og-normal-ag', tag);
      if (sc.agType === 'hoy' && !sc.secondary) assert.equal(c.key.step5.verdict, 'ren-hoy-ag', tag);
      if (!wantHigh) assert.equal(c.key.step5.applicable, false, tag);

      // årsaker og vignett
      assert.ok(c.key.causes.every((id) => c.causeOptions.some((o) => o.id === id)));
      assert.ok(!c.vignette.includes('{'), `uferdig vignett ${tag}`);
      assert.ok(c.causeOptions.length >= 5);
    }
  });
}

test('pickScenario respekterer nivå og vekter', () => {
  const rng = seeded(42);
  for (let i = 0; i < 50; i++) assert.equal(pickScenario({ level: 2, rng }).level, 2);
  const counts = {};
  for (let i = 0; i < 400; i++) {
    const s = pickScenario({ level: 1, rng, weights: { 'met-alkalose': 8 } });
    counts[s.primary] = (counts[s.primary] ?? 0) + 1;
  }
  assert.ok(counts['met-alkalose'] > counts['resp-alkalose'], JSON.stringify(counts));
});

test('generateCase uten argumenter gir gyldig kasus med alle verdier', () => {
  const c = generateCase({ rng: seeded(7) });
  for (const k of ['ph', 'pco2', 'po2', 'hco3', 'be', 'lactate', 'na', 'k', 'cl', 'albumin', 'glucose', 'fio2']) {
    assert.ok(Number.isFinite(c.values[k]), k);
  }
  assert.ok(c.vignette.length > 20);
});
