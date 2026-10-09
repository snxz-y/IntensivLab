import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breathGain, breathFilterHz, pulsePitch, ALARM_PATTERNS, createVentAudio } from '../core/audio/ventSounds.js';

test('pustelyd: stille uten flow, maks ved høy flow, lysere ved inspirasjon', () => {
  assert.equal(breathGain(0), 0);
  assert.ok(breathGain(0.3) > 0 && breathGain(0.3) < breathGain(0.6));
  assert.equal(breathGain(2), 1);
  assert.equal(breathGain(-0.9), 1);
  assert.ok(breathFilterHz(0.5) > breathFilterHz(-0.5));
});

test('pulstone: tonehøyden faller med SpO2', () => {
  assert.ok(pulsePitch(1.0) > pulsePitch(0.9) && pulsePitch(0.9) > pulsePitch(0.8));
  assert.equal(pulsePitch(0.7), pulsePitch(0.8));
  assert.equal(pulsePitch(1.0), 880);
});

test('alarmmønstre: høy prioritet har flere pulser og kortere periode enn middels', () => {
  assert.ok(ALARM_PATTERNS.high.times.length > ALARM_PATTERNS.medium.times.length);
  assert.ok(ALARM_PATTERNS.high.period < ALARM_PATTERNS.medium.period);
  for (const p of Object.values(ALARM_PATTERNS)) assert.equal(p.freqs.length, p.times.length);
  assert.deepEqual(ALARM_PATTERNS.medium.freqs, ALARM_PATTERNS.high.freqs.slice(0, 3));
});

test('createVentAudio tåler miljø uten Web Audio (Node)', async () => {
  globalThis.window = {};
  const a = createVentAudio();
  assert.equal(await a.enable(), false);
  a.setBreath(1); a.setAlarm('high'); a.setPulse(0.95); a.silence(10);
  assert.ok(a.silenced);
  a.disable(); a.destroy();
  delete globalThis.window;
});
