import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebLLM } from '../src/llm/webllm.js';

const flush = () => new Promise(r => setImmediate(r));
const msgs = [{ role: 'user', content: '안녕' }];

function fakeWorker() {
  const w = new EventTarget();
  w.terminated = 0;
  w.terminate = () => { w.terminated++; };
  return w;
}

// create(req) 호출을 쌓아 두고 테스트가 직접 resolve한다(예열 호출은 즉시 성공).
function fakeEngine() {
  const e = { creates: [], interrupts: 0 };
  e.interruptGenerate = () => { e.interrupts++; };
  e.chat = { completions: { create: req => {
    if (!req.stream) return Promise.resolve({});
    return new Promise((resolve, reject) => e.creates.push({ req, resolve, reject }));
  } } };
  return e;
}

// next()마다 정해 둔 청크를 내보내는 스트림. 호출 수를 센다.
function fakeStream(chunks) {
  const s = { nexts: 0, returns: 0, i: 0 };
  s.next = async () => {
    s.nexts++;
    return s.i < chunks.length
      ? { done: false, value: { choices: [{ delta: { content: chunks[s.i++] } }] } }
      : { done: true, value: undefined };
  };
  s.return = async () => { s.returns++; return { done: true, value: undefined }; };
  s[Symbol.asyncIterator] = () => s;
  return s;
}

function setup({ createEngine } = {}) {
  const workers = [];
  const engine = fakeEngine();
  const llm = createWebLLM({
    importWebLLM: async () => ({
      CreateWebWorkerMLCEngine: createEngine ?? (async () => engine)
    }),
    createWorker: () => { const w = fakeWorker(); workers.push(w); return w; },
    settle: async () => {}
  });
  return { llm, engine, workers };
}

test('정상: 스트림 청크를 이어 onText, 결과 반환', async () => {
  const { llm, engine } = setup();
  await llm.load();
  assert.equal(llm.ready, true);
  const seen = [];
  const p = llm.chat({ messages: msgs, onText: t => seen.push(t) });
  await flush();
  engine.creates[0].resolve(fakeStream(['{"say":', '"네"}']));
  assert.equal(await p, '{"say":"네"}');
  assert.deepEqual(seen, ['{"say":', '{"say":"네"}']);
});

test('create() 대기 중 abort → 스트림 도착 즉시 return(), next() 없이 AbortError', async () => {
  const { llm, engine } = setup();
  await llm.load();
  const ac = new AbortController();
  const p = llm.chat({ messages: msgs, signal: ac.signal });
  await flush();
  ac.abort();
  assert.equal(engine.interrupts, 1);
  const s = fakeStream(['x']);
  engine.creates[0].resolve(s);
  await assert.rejects(p, { name: 'AbortError' });
  assert.equal(s.nexts, 0);
  assert.equal(s.returns, 1);
});

test('chat 직렬화: 앞 요청이 끝나기 전엔 다음 create를 부르지 않는다', async () => {
  const { llm, engine } = setup();
  await llm.load();
  const p1 = llm.chat({ messages: msgs });
  const p2 = llm.chat({ messages: msgs });
  await flush();
  assert.equal(engine.creates.length, 1);
  engine.creates[0].resolve(fakeStream(['a']));
  assert.equal(await p1, 'a');
  await flush();
  assert.equal(engine.creates.length, 2);
  engine.creates[1].resolve(fakeStream(['b']));
  assert.equal(await p2, 'b');
});

test('chat 직렬화: 앞 요청이 실패해도 다음 요청은 진행', async () => {
  const { llm, engine } = setup();
  await llm.load();
  const p1 = llm.chat({ messages: msgs });
  const p2 = llm.chat({ messages: msgs });
  await flush();
  engine.creates[0].reject(new Error('boom'));
  await assert.rejects(p1, /boom/);
  await flush();
  engine.creates[1].resolve(fakeStream(['b']));
  assert.equal(await p2, 'b');
});

test('로드 실패 → worker.terminate(), 재시도는 새 워커로', async () => {
  let n = 0;
  const { llm, workers } = setup({ createEngine: async () => { n++; throw new Error('oom'); } });
  await assert.rejects(llm.load(), /oom/);
  await assert.rejects(llm.load(), /oom/);
  assert.equal(n, 2);
  assert.equal(workers.length, 2);
  assert.deepEqual(workers.map(w => w.terminated), [1, 1]);
  assert.equal(llm.ready, false);
});

test('워커 error·messageerror 이벤트는 로드 실패로 처리', async () => {
  for (const type of ['error', 'messageerror']) {
    const { llm, workers } = setup({ createEngine: () => new Promise(() => {}) });
    const p = llm.load();
    await flush();
    workers[0].dispatchEvent(new Event(type));
    await assert.rejects(p);
    assert.equal(workers[0].terminated, 1);
    assert.equal(llm.ready, false);
  }
});

test('dispose: 로드된 워커 종료, ready false', async () => {
  const { llm, workers } = setup();
  await llm.load();
  llm.dispose();
  assert.equal(workers[0].terminated, 1);
  assert.equal(llm.ready, false);
  await assert.rejects(llm.chat({ messages: msgs }));
});

test('dispose: 로드 대기 중이면 로드를 실패시키고 워커 종료', async () => {
  const { llm, workers } = setup({ createEngine: () => new Promise(() => {}) });
  const p = llm.load();
  await flush();
  llm.dispose();
  await assert.rejects(p);
  assert.equal(workers[0].terminated, 1);
  assert.equal(llm.ready, false);
});

test('dispose: 라이브러리 import 대기 중이면 워커를 만들지 않는다', async () => {
  const workers = [];
  let release;
  const llm = createWebLLM({
    importWebLLM: () => new Promise(r => { release = r; }),
    createWorker: () => { const w = fakeWorker(); workers.push(w); return w; }
  });
  const p = llm.load();
  llm.dispose();
  release({ CreateWebWorkerMLCEngine: async () => fakeEngine() });
  await assert.rejects(p);
  assert.equal(workers.length, 0);
  assert.equal(llm.ready, false);
});

// ── 저사양 대응 ────────────────────────────────────────────

test('load: chatOpts(4번째 인자)로 컨텍스트·prefill을 줄이고, 쉰 다음 max_tokens 2로 예열', async () => {
  const log = [];
  const engine = fakeEngine();
  engine.chat.completions.create = req => { log.push(['warm', req.max_tokens]); return Promise.resolve({}); };
  let args;
  const llm = createWebLLM({
    importWebLLM: async () => ({ CreateWebWorkerMLCEngine: async (...a) => { args = a; log.push('create'); return engine; } }),
    createWorker: fakeWorker,
    settle: async () => { log.push('settle'); }
  });
  await llm.load();
  assert.deepEqual(args[3], { context_window_size: 2048 });
  assert.deepEqual(log, ['create', 'settle', ['warm', 2]]);
});

test('probe: WebGPU 없음·예외에도 던지지 않는다', async () => {
  const { probe } = await import('../src/llm/webllm.js');
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const set = v => Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true });
  try {
    set({});
    assert.deepEqual(await probe(), { webgpu: false, f16: false, maxBuffer: 0, maxStorage: 0, weakGpu: false });
    set({ gpu: { requestAdapter: async () => { throw new Error('x'); } } });
    assert.equal((await probe()).webgpu, false);
    const adapter = info => ({ features: new Set(['shader-f16']), limits: { maxBufferSize: 5, maxStorageBufferBindingSize: 7 }, info });
    set({ userAgent: 'Mozilla Windows NT', gpu: { requestAdapter: async () => adapter({ vendor: 'intel', architecture: 'gen-12' }) } });
    assert.deepEqual(await probe(), { webgpu: true, f16: true, maxBuffer: 5, maxStorage: 7, weakGpu: true });
    set({ userAgent: 'Mozilla Macintosh', gpu: { requestAdapter: async () => adapter({ vendor: 'intel' }) } });
    assert.equal((await probe()).weakGpu, false);
    set({ userAgent: 'Windows', gpu: { requestAdapter: async () => adapter({ vendor: 'nvidia', description: 'RTX 4060' }) } });
    assert.equal((await probe()).weakGpu, false);
    set({ userAgent: 'Windows', gpu: { requestAdapter: async () => adapter(undefined) } });
    assert.equal((await probe()).weakGpu, false);
  } finally {
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator;
  }
});
