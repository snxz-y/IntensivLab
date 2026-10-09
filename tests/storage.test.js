import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../core/storage.js';

function memoryBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

test('lagrer og henter JSON med prefiks', () => {
  const b = memoryBackend();
  const s = createStorage(b);
  assert.equal(s.set('a', { x: 1 }), true);
  assert.deepEqual(s.get('a'), { x: 1 });
  assert.ok(b._map.has('intensivlab:a'));
  assert.equal(s.get('finnes-ikke', 'fallback'), 'fallback');
  assert.equal(s.available, true);
});

test('update og remove', () => {
  const s = createStorage(memoryBackend());
  s.update('teller', (v) => (v ?? 0) + 1);
  s.update('teller', (v) => (v ?? 0) + 1);
  assert.equal(s.get('teller'), 2);
  s.remove('teller');
  assert.equal(s.get('teller'), null);
});

test('tåler manglende backend', () => {
  const s = createStorage(null);
  assert.equal(s.set('a', 1), false);
  assert.equal(s.get('a', 'f'), 'f');
  assert.equal(s.available, false);
});

test('tåler backend som kaster (f.eks. full lagring eller nektet tilgang)', () => {
  const throwing = {
    getItem() { throw new Error('nei'); },
    setItem() { throw new Error('QuotaExceeded'); },
    removeItem() { throw new Error('nei'); },
  };
  const s = createStorage(throwing);
  assert.equal(s.set('a', 1), false);
  assert.equal(s.get('a', 'f'), 'f');
  assert.equal(s.remove('a'), false);
  assert.equal(s.available, false);
});

test('tåler ugyldig JSON', () => {
  const b = memoryBackend();
  b.setItem('intensivlab:x', '{ikke json');
  const s = createStorage(b);
  assert.equal(s.get('x', 'f'), 'f');
});
