import test from 'node:test';
import assert from 'node:assert/strict';
import { Temple } from '../src/world.js';
import { traceTemple, readBaseline } from './helpers/trace.mjs';

test('src/world.js는 원본과 같은 720초 일과를 보낸다', () => {
  assert.deepEqual(traceTemple(Temple), readBaseline());
});
