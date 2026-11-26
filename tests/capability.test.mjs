import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseModels, GEMMA_ID, QWEN_ID } from '../src/llm/capability.js';

const MiB = 1024 * 1024, GiB = 1024 * MiB;
const strong = { webgpu: true, f16: true, maxBuffer: 4 * GiB, maxStorage: 1 * GiB };
const by = (r, id) => r.models.find(m => m.id === id);

test('강한 기기: 둘 다 ok, 추천은 Qwen', () => {
  const r = chooseModels(strong);
  assert.equal(by(r, GEMMA_ID).ok, true);
  assert.equal(by(r, QWEN_ID).ok, true);
  assert.equal(r.recommended, QWEN_ID);
});

test('Gemma 경계: storage 256MiB, buffer 1GiB', () => {
  const edge = { webgpu: true, f16: true, maxBuffer: GiB, maxStorage: 256 * MiB };
  assert.equal(by(chooseModels(edge), GEMMA_ID).ok, true);
  assert.equal(by(chooseModels({ ...edge, maxStorage: 256 * MiB - 1 }), GEMMA_ID).ok, false);
  const low = chooseModels({ ...edge, maxBuffer: GiB - 1 });
  assert.equal(by(low, GEMMA_ID).ok, false);
  assert.equal(by(low, GEMMA_ID).reason, '이 기기의 그래픽 메모리로는 무거워요');
  assert.equal(by(low, QWEN_ID).ok, true);
});

test('Qwen 경계: storage 128MiB', () => {
  const edge = { webgpu: true, f16: true, maxBuffer: 512 * MiB, maxStorage: 128 * MiB };
  const r = chooseModels(edge);
  assert.equal(by(r, QWEN_ID).ok, true);
  assert.equal(by(r, GEMMA_ID).ok, false);
  assert.equal(r.recommended, QWEN_ID);
  const r2 = chooseModels({ ...edge, maxStorage: 128 * MiB - 1 });
  assert.equal(by(r2, QWEN_ID).ok, false);
  assert.equal(r2.recommended, null);
});

test('WebGPU나 f16이 없으면 AI 없음', () => {
  for (const p of [{}, { ...strong, webgpu: false }, { ...strong, f16: false }]) {
    const r = chooseModels(p);
    assert.ok(r.models.every(m => !m.ok && m.reason));
    assert.equal(r.recommended, null);
  }
});

test('Windows 내장 그래픽(weakGpu): Gemma만 막고 Qwen은 유지', () => {
  const r = chooseModels({ ...strong, weakGpu: true });
  assert.equal(by(r, GEMMA_ID).ok, false);
  assert.equal(by(r, GEMMA_ID).reason, '이 노트북 그래픽에는 무거워요');
  assert.equal(by(r, QWEN_ID).ok, true);
  assert.equal(r.recommended, QWEN_ID);
});
