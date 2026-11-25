import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, partialSay, createBrain } from '../src/brain.js';
import { PERSONA, SYSTEM_RULES } from '../src/lines.js';

const snap = (over = {}) => ({
  npc: 'monk', clock: 490, weather: '맑음', place: '앞마당', activity: '낙엽 쓸기', partner: 'visitor',
  following: false, errand: null, meetings: 3, affinityBand: 'familiar', history: [], ...over
});

test('buildMessages: system + 상황 줄', () => {
  const m = buildMessages(snap({ errand: { id: 'water', state: 'accepted' }, following: true }), '안녕');
  assert.equal(m[0].role, 'system');
  assert.ok(m[0].content.includes(PERSONA) && m[0].content.includes(SYSTEM_RULES));
  const line = m[0].content.split('\n').find(l => l.startsWith('상황:'));
  assert.equal(line, '상황: 08:10, 맑음. 스님은 앞마당에서 낙엽 쓸기. 방문객과 3번째 만남(낯익음). 부탁: 물 길어 오기(수락함). 스님은 방문객을 따라가는 중.');
  assert.deepEqual(m.at(-1), { role: 'user', content: '안녕' });
});

test('buildMessages: 시각 zero-pad, 장소 null, 호감도·부탁 상태 한국어', () => {
  const l = s => buildMessages(s, 'x')[0].content;
  assert.ok(l(snap({ clock: 65 })).includes('01:05'));
  assert.ok(l(snap({ place: null })).includes('어딘가에서'));
  assert.ok(l(snap({ affinityBand: 'new' })).includes('(처음 봄)'));
  assert.ok(l(snap({ affinityBand: 'close' })).includes('(친함)'));
  assert.ok(l(snap({ errand: { id: 'water', state: 'offered' } })).includes('(제안함)'));
  assert.ok(l(snap({ errand: { id: 'water', state: 'carrying' } })).includes('(물을 들고 옴)'));
  assert.ok(!l(snap()).includes('부탁:'));
  assert.ok(!l(snap()).includes('따라가는 중'));
});

test('buildMessages: history가 user 앞에', () => {
  const history = [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }];
  const m = buildMessages(snap({ history }), 'c');
  assert.deepEqual(m.slice(1), [...history, { role: 'user', content: 'c' }]);
});

test('partialSay', () => {
  assert.equal(partialSay('{"say":"연못'), '연못');
  assert.equal(partialSay('{"say":"연못가","action":"none"}'), '연못가');
  assert.equal(partialSay('{"say":"그는 \\"안녕\\" \\\\ 하고\\n갔다"'), '그는 "안녕" \\ 하고\n갔다');
  assert.equal(partialSay('{"say":"끝\\'), '끝');
  assert.equal(partialSay('<think>생각 "say":"x"</think>{"say":"본문'), '본문');
  assert.equal(partialSay('<think>아직 생각 중'), '');
  assert.equal(partialSay('{"sa'), '');
  assert.equal(partialSay('{"say":'), '');
  assert.equal(partialSay(''), '');
});

test('ask: requestId·reply·source 반환, onSay는 값이 바뀔 때만 순서대로', async () => {
  const raw = '{"say":"네","action":"none","place":"없음","options":["a","b","c"]}';
  let got;
  const router = {
    async chat(args) {
      got = args;
      for (const t of ['{"say":"', '{"say":"네', '{"say":"네', raw]) args.onText(t);
      return { raw, reply: { say: '네', action: 'none', place: null, options: ['a', 'b', 'c'] }, source: 'llm' };
    }
  };
  const said = [];
  const sig = new AbortController().signal;
  const out = await createBrain(router).ask({ requestId: 7, snapshot: snap(), userText: '안녕', signal: sig, onSay: s => said.push(s) });
  assert.equal(out.requestId, 7);
  assert.equal(out.source, 'llm');
  assert.equal(out.reply.say, '네');
  assert.deepEqual(said, ['네']);
  assert.equal(got.signal, sig);
  assert.equal(got.messages.at(-1).content, '안녕');
});
