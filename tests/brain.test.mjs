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

// ── 2단계: 동물 상대·동물 NPC ───────────────────────────────────

import { ANIMALS, ANIMAL_RULES } from '../src/lines.js';

const sit = m => m[0].content.split('\n').find(l => l.startsWith('상황:'));

test('스님 + 동물 상대: 누가 말하는지 밝히고 방문객 만남·부탁 문장은 뺀다', () => {
  const m = buildMessages(snap({ partner: 'dog', errand: { id: 'water', state: 'accepted' } }), '멍!');
  assert.equal(sit(m), '상황: 08:10, 맑음. 스님은 앞마당에서 낙엽 쓸기. 황구가 스님에게 다가왔다.');
  assert.ok(m[0].content.includes(PERSONA) && m[0].content.includes(SYSTEM_RULES));
  assert.ok(sit(buildMessages(snap({ partner: 'white' }), 'x')).includes('백구가 스님에게 다가왔다'));
  assert.ok(sit(buildMessages(snap({ partner: 'cat' }), 'x')).includes('고양이가 스님에게 다가왔다'));
});

test('스님 + 동물 상대: 따라가는 중이어도 방문객 따라가기 문장은 없다', () => {
  assert.ok(!sit(buildMessages(snap({ partner: 'dog', following: true }), 'x')).includes('따라가는 중'));
});

test('스님 + 방문객: 기존 상황 줄 그대로(채소 부탁 상태 포함)', () => {
  const l = buildMessages(snap({ errand: { id: 'veg', state: 'carrying' } }), 'x');
  assert.ok(sit(l).includes('부탁: 채소 나르기(채소를 들고 옴).'));
  const w = buildMessages(snap({ errand: { id: 'veg', state: 'offered' } }), 'x');
  assert.ok(sit(w).includes('부탁: 채소 나르기(제안함).'));
});

test('스님 + 스님 등 알 수 없는 상대는 방문객처럼 다룬다', () => {
  assert.equal(sit(buildMessages(snap({ partner: 'visitor' }), 'x')), sit(buildMessages(snap({ partner: undefined }), 'x')));
});

test('동물 NPC: 동물 페르소나 + 동물 규칙, 스님 규칙·장소 없음', () => {
  for (const npc of ['dog', 'white', 'cat']) {
    const m = buildMessages(snap({ npc, partner: 'visitor', place: null, activity: '', meetings: 4, affinityBand: 'close' }), '안녕');
    const sys = m[0].content;
    assert.ok(sys.includes(ANIMALS[npc].persona));
    assert.ok(sys.includes(ANIMAL_RULES));
    assert.ok(!sys.includes(PERSONA));
    assert.ok(!sys.includes(SYSTEM_RULES));
    assert.ok(!sys.includes('어딘가'));
    assert.deepEqual(m.at(-1), { role: 'user', content: '안녕' });
  }
});

test('동물 NPC 상황 줄: 누가 다가왔는지와 만남 수·호감도', () => {
  const s = npc => ({ npc, place: null, activity: '', meetings: 4, affinityBand: 'close' });
  assert.equal(sit(buildMessages(snap({ ...s('dog'), partner: 'visitor' }), 'x')),
    '상황: 08:10, 맑음. 방문객이 황구에게 다가왔다. 황구와 4번째 만남(친함).');
  assert.equal(sit(buildMessages(snap({ ...s('white'), partner: 'monk' }), 'x')),
    '상황: 08:10, 맑음. 스님이 백구에게 다가왔다. 백구와 4번째 만남(친함).');
  assert.equal(sit(buildMessages(snap({ ...s('cat'), partner: 'dog' }), 'x')),
    '상황: 08:10, 맑음. 황구가 고양이에게 다가왔다. 고양이와 4번째 만남(친함).');
});

test('동물 NPC history도 user 앞에 들어간다', () => {
  const history = [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }];
  const m = buildMessages(snap({ npc: 'dog', history }), 'c');
  assert.deepEqual(m.slice(1), [...history, { role: 'user', content: 'c' }]);
});

test('buildMessages: 최악의 입력도 2048 컨텍스트에 여유 있게 들어간다(<1500토큰, 글자수/1.5)', () => {
  const long = n => '가'.repeat(n);
  const history = [
    { role: 'user', content: long(200) }, { role: 'assistant', content: long(300) },
    { role: 'user', content: long(200) }, { role: 'assistant', content: long(300) }
  ];
  const m = buildMessages(snap({ history, errand: { id: 'water', state: 'carrying' }, following: true }), long(200));
  const tokens = m.reduce((n, x) => n + x.content.length, 0) / 1.5;
  assert.ok(tokens < 1500, `estimated ${Math.round(tokens)} tokens`);
});
