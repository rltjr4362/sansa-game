import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../src/llm/router.js';
import { createMockLLM } from '../src/llm/mock.js';

const msgs = [{ role: 'user', content: '안녕하세요' }];
const good = JSON.stringify({ say: '네, 안녕하세요.', action: 'none', place: '없음', options: ['가', '나', '다'] });
const primary = chat => ({ kind: 'llm', ready: true, chat });

test('정상: primary 결과를 llm으로 돌려주고 onText를 전달', async () => {
  const seen = [];
  const r = createRouter({ primary: primary(async ({ onText }) => { onText('x'); return good; }), fallback: createMockLLM() });
  assert.equal(r.active(), 'llm');
  const out = await r.chat({ messages: msgs, onText: t => seen.push(t) });
  assert.equal(out.source, 'llm');
  assert.equal(out.raw, good);
  assert.equal(out.reply.say, '네, 안녕하세요.');
  assert.equal(seen[0], 'x');
});

test('primary 없음·미준비 → mock', async () => {
  for (const p of [undefined, { ready: false, chat: async () => { throw new Error('no'); } }]) {
    const r = createRouter({ primary: p, fallback: createMockLLM() });
    assert.equal(r.active(), 'mock');
    assert.equal((await r.chat({ messages: msgs })).source, 'mock');
  }
});

test('예외 → mock', async () => {
  const r = createRouter({ primary: primary(async () => { throw new Error('boom'); }), fallback: createMockLLM() });
  assert.equal((await r.chat({ messages: msgs })).source, 'mock');
});

test('타임아웃 → primary signal abort, mock', async () => {
  let got;
  const p = primary(({ signal }) => new Promise((_, rej) => {
    got = signal;
    signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')));
  }));
  const r = createRouter({ primary: p, fallback: createMockLLM(), timeoutMs: 20 });
  const out = await r.chat({ messages: msgs });
  assert.equal(out.source, 'mock');
  assert.equal(got.aborted, true);
});

test('파싱 실패 → mock', async () => {
  const r = createRouter({ primary: primary(async () => 'not json'), fallback: createMockLLM() });
  assert.equal((await r.chat({ messages: msgs })).source, 'mock');
});

test('외부 abort → reject, fallback 미호출', async () => {
  let fbCalls = 0;
  const fallback = { ready: true, chat: async () => { fbCalls++; return good; } };
  const ac = new AbortController();
  let got;
  const p = primary(({ signal }) => new Promise((_, rej) => {
    got = signal;
    signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')));
  }));
  const r = createRouter({ primary: p, fallback });
  const pr = r.chat({ messages: msgs, signal: ac.signal });
  ac.abort();
  await assert.rejects(pr, { name: 'AbortError' });
  assert.equal(got.aborted, true);
  assert.equal(fbCalls, 0);
});

test('이미 abort된 signal → reject', async () => {
  const ac = new AbortController();
  ac.abort();
  const r = createRouter({ primary: primary(async () => good), fallback: createMockLLM() });
  await assert.rejects(r.chat({ messages: msgs, signal: ac.signal }), { name: 'AbortError' });
});

// abort를 무시하고 직접 결과를 내보내는 primary. 대기 종료·늦은 결과 차단 검증용.
function stubborn() {
  const h = {};
  h.engine = primary(({ onText }) => new Promise(resolve => { h.onText = onText; h.resolve = resolve; }));
  return h;
}

test('타임아웃: primary가 abort를 무시해도 즉시 mock, 늦은 청크·결과는 버린다', async () => {
  const h = stubborn();
  const seen = [];
  const r = createRouter({ primary: h.engine, fallback: createMockLLM(), timeoutMs: 5 });
  const t0 = Date.now();
  const out = await Promise.race([
    r.chat({ messages: msgs, onText: t => seen.push(t) }),
    new Promise(res => setTimeout(() => res('hung'), 200))
  ]);
  assert.notEqual(out, 'hung');
  assert.equal(out.source, 'mock');
  assert.ok(Date.now() - t0 < 150);
  const n = seen.length;
  h.onText('late chunk');
  h.resolve(good);
  await new Promise(res => setImmediate(res));
  assert.equal(seen.length, n);
  assert.ok(!seen.includes('late chunk'));
});

test('외부 abort: primary가 abort를 무시해도 즉시 AbortError, fallback 미호출, 늦은 청크 차단', async () => {
  const h = stubborn();
  let fbCalls = 0;
  const fallback = { ready: true, chat: async () => { fbCalls++; return good; } };
  const seen = [];
  const ac = new AbortController();
  const r = createRouter({ primary: h.engine, fallback, timeoutMs: 10000 });
  const pr = r.chat({ messages: msgs, signal: ac.signal, onText: t => seen.push(t) });
  await new Promise(res => setImmediate(res));
  ac.abort();
  const out = await Promise.race([
    pr.then(() => 'resolved', e => e),
    new Promise(res => setTimeout(() => res('hung'), 200))
  ]);
  assert.equal(out?.name, 'AbortError');
  assert.equal(fbCalls, 0);
  h.onText('late');
  h.resolve(good);
  await new Promise(res => setImmediate(res));
  assert.deepEqual(seen, []);
});
