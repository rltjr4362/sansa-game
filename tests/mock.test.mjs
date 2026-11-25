import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockLLM } from '../src/llm/mock.js';
import { parseReply } from '../src/contracts.js';
import { PROMPTS } from '../spike/prompts.js';

const ask = (llm, text) => llm.chat({ messages: [{ role: 'system', content: 's' }, { role: 'user', content: text }] });

test('PROMPTS 20개 중 18개 이상 기대 행동 일치, 모두 parseReply 통과', async () => {
  const llm = createMockLLM();
  assert.equal(llm.kind, 'mock');
  assert.equal(llm.ready, true);
  let ok = 0;
  for (const p of PROMPTS) {
    const reply = parseReply(await ask(llm, p.text));
    assert.ok(reply, p.text);
    if (reply.action === p.expect && (p.expect !== 'go_to' || reply.place === p.place)) ok++;
    else console.log('miss:', p.text, reply.action, reply.place);
  }
  console.log(`mock accuracy ${ok}/${PROMPTS.length}`);
  assert.ok(ok >= 18, `accuracy ${ok}`);
});

test('onText를 결과 전체로 한 번 호출', async () => {
  const calls = [];
  const raw = await createMockLLM().chat({ messages: [{ role: 'user', content: '안녕' }], onText: t => calls.push(t) });
  assert.deepEqual(calls, [raw]);
});

test('signal이 abort면 AbortError로 reject', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    createMockLLM().chat({ messages: [{ role: 'user', content: 'x' }], signal: ac.signal }),
    { name: 'AbortError' }
  );
});

test('마지막 user 메시지만 본다', async () => {
  const raw = await createMockLLM().chat({ messages: [
    { role: 'user', content: '따라와 주세요' }, { role: 'assistant', content: '네' }, { role: 'user', content: '고마워요' }
  ] });
  assert.equal(parseReply(raw).action, 'none');
});

test('장소 질문·이동 거절은 go_to가 아니다', async () => {
  const llm = createMockLLM();
  for (const text of ['우물물이 시원한가요?', '우물에는 가지 말아요', '연못 말고 다른 데 얘기해요', '대웅전엔 안 가요', '산문 쪽은 싫어요']) {
    const reply = parseReply(await ask(llm, text));
    assert.notEqual(reply.action, 'go_to', text);
  }
});

test('장소 + 긍정 이동 요청은 go_to', async () => {
  const llm = createMockLLM();
  for (const [text, place] of [['우물로 가자', '우물'], ['대웅전 안내해 주세요', '대웅전'], ['앞마당 가요', '앞마당']]) {
    const reply = parseReply(await ask(llm, text));
    assert.equal(reply.action, 'go_to', text);
    assert.equal(reply.place, place, text);
  }
});

test('PROMPTS 20/20', async () => {
  const llm = createMockLLM();
  let ok = 0;
  for (const p of PROMPTS) {
    const reply = parseReply(await ask(llm, p.text));
    if (reply.action === p.expect && (p.expect !== 'go_to' || reply.place === p.place)) ok++;
  }
  assert.equal(ok, PROMPTS.length);
});
