import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOriginalTemple, traceTemple, readBaseline } from './helpers/trace.mjs';

test('원본 Temple은 720초 동안 기준선과 같은 일과를 보낸다', () => {
  assert.deepEqual(traceTemple(loadOriginalTemple()), readBaseline());
});

test('원본 Temple은 두 번 돌려도 같다 (결정성)', () => {
  const T = loadOriginalTemple();
  assert.deepEqual(traceTemple(T, 120), traceTemple(T, 120));
});
