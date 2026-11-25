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
