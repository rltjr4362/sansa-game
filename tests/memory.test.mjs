import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemory } from '../src/memory.js';

function fakeStorage(init) {
  const m = new Map(init);
  return { m, getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) };
}
const at = (y, mo, d, h = 12) => new Date(y, mo, d, h).getTime();

test('초기 상태', () => {
  const mem = createMemory(fakeStorage(), () => at(2026, 10, 25));
  assert.deepEqual(mem.get('monk'), {
    meetings: 0, affinity: 0, errands: { offered: 0, accepted: 0, done: 0 }, lastLines: []
  });
  assert.equal(mem.band('monk'), 'new');
});

test('저장 후 새 인스턴스에서 복원', () => {
  const st = fakeStorage();
  const a = createMemory(st, () => at(2026, 10, 25));
  a.recordMeeting('monk');
  a.recordErrand('monk', 'offered');
  a.pushTurn('monk', '안녕', '반가워요');
  assert.ok(st.m.has('sansa.v1'));
  assert.equal(JSON.parse(st.m.get('sansa.v1')).version, 1);
  const b = createMemory(st, () => at(2026, 10, 25));
  assert.equal(b.get('monk').meetings, 1);
  assert.equal(b.get('monk').affinity, 1);
  assert.equal(b.get('monk').errands.offered, 1);
  assert.deepEqual(b.get('monk').lastLines, [{ role: 'user', content: '안녕' }, { role: 'assistant', content: '반가워요' }]);
});

test('대화 호감도는 하루 +3 상한, 다음 날 다시 +1', () => {
  let t = at(2026, 10, 25, 9);
  const mem = createMemory(fakeStorage(), () => t);
  for (let i = 0; i < 5; i++) mem.recordMeeting('monk');
  assert.equal(mem.get('monk').meetings, 5);
  assert.equal(mem.get('monk').affinity, 3);
  t = at(2026, 10, 25, 23);
  mem.recordMeeting('monk');
  assert.equal(mem.get('monk').affinity, 3);
  t = at(2026, 10, 26, 0);
  mem.recordMeeting('monk');
  assert.equal(mem.get('monk').affinity, 4);
});

test('상한 기록은 재생성 후에도 유지된다', () => {
  const st = fakeStorage();
  const t = at(2026, 10, 25);
  const a = createMemory(st, () => t);
  for (let i = 0; i < 3; i++) a.recordMeeting('monk');
  const b = createMemory(st, () => t);
  b.recordMeeting('monk');
  assert.equal(b.get('monk').affinity, 3);
});

test('done은 호감도 +5, offered·accepted는 0', () => {
  const mem = createMemory(fakeStorage(), () => at(2026, 10, 25));
  mem.recordErrand('monk', 'offered');
  mem.recordErrand('monk', 'accepted');
  assert.equal(mem.get('monk').affinity, 0);
  mem.recordErrand('monk', 'done');
  assert.equal(mem.get('monk').affinity, 5);
  assert.equal(mem.get('monk').errands.done, 1);
  assert.equal(mem.band('monk'), 'familiar');
});

test('알 수 없는 kind는 무시', () => {
  const mem = createMemory(fakeStorage(), () => at(2026, 10, 25));
  mem.recordErrand('monk', 'bogus');
  assert.deepEqual(mem.get('monk').errands, { offered: 0, accepted: 0, done: 0 });
});

test('lastLines는 최대 4개', () => {
  const mem = createMemory(fakeStorage(), () => at(2026, 10, 25));
  for (let i = 0; i < 6; i += 2) mem.pushTurn('monk', `m${i}`, `m${i + 1}`);
  assert.deepEqual(mem.get('monk').lastLines.map(l => l.content), ['m2', 'm3', 'm4', 'm5']);
});

test('get은 내부 상태를 복사해 돌려준다', () => {
  const mem = createMemory(fakeStorage(), () => at(2026, 10, 25));
  mem.get('monk').affinity = 99;
  mem.get('monk').lastLines.push({ role: 'user', content: 'x' });
  assert.equal(mem.get('monk').affinity, 0);
  assert.equal(mem.get('monk').lastLines.length, 0);
});

test('throw하는 storage에서도 메모리 내에서 동작', () => {
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('y'); } };
  const mem = createMemory(bad, () => at(2026, 10, 25));
  mem.recordMeeting('monk');
  mem.recordErrand('monk', 'done');
  assert.equal(mem.get('monk').affinity, 6);
});

test('storage가 없어도 동작', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const mem = createMemory(null, () => at(2026, 10, 25));
  mem.recordMeeting('monk');
  assert.equal(mem.get('monk').meetings, 1);
  if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
});

test('손상된 JSON은 빈 상태로 시작', () => {
  for (const bad of ['{not json', 'null', '[]', '{"version":1,"npcs":5}']) {
    const st = fakeStorage([['sansa.v1', bad]]);
    const mem = createMemory(st, () => at(2026, 10, 25));
    assert.equal(mem.get('monk').meetings, 0);
    mem.recordMeeting('monk');
    assert.equal(JSON.parse(st.m.get('sansa.v1')).npcs.monk.meetings, 1);
  }
});

test('localStorage getter가 SecurityError를 던져도 기본 인자로 생성된다', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, get() { throw new DOMException('denied', 'SecurityError'); }
  });
  try {
    const mem = createMemory();
    mem.recordMeeting('monk');
    assert.equal(mem.get('monk').meetings, 1);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
    else delete globalThis.localStorage;
  }
});

test('두 인스턴스가 같은 저장소를 써도 서로 덮어쓰지 않는다', () => {
  const st = fakeStorage();
  const t = () => at(2026, 10, 25);
  const a = createMemory(st, t);
  const b = createMemory(st, t);
  a.recordErrand('monk', 'done');
  b.recordMeeting('monk');
  const c = createMemory(st, t);
  assert.equal(c.get('monk').errands.done, 1);
  assert.equal(c.get('monk').meetings, 1);
  assert.equal(c.get('monk').affinity, 6);
  b.pushTurn('monk', 'q', 'a');
  a.recordMeeting('monk');
  const d = createMemory(st, t);
  assert.equal(d.get('monk').meetings, 2);
  assert.deepEqual(d.get('monk').lastLines.map(l => l.content), ['q', 'a']);
});

test('pushTurn: 질문과 답을 한 번에 저장, 최근 2턴', () => {
  const st = fakeStorage();
  let sets = 0;
  const orig = st.setItem;
  st.setItem = (k, v) => { sets++; orig(k, v); };
  const mem = createMemory(st, () => at(2026, 10, 25));
  for (let i = 0; i < 3; i++) mem.pushTurn('monk', `q${i}`, `a${i}`);
  assert.equal(sets, 3);
  assert.deepEqual(mem.get('monk').lastLines, [
    { role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'q2' }, { role: 'assistant', content: 'a2' }
  ]);
});

test('복원 시 완결된 턴만, 최근 2턴', () => {
  const L = (role, content) => ({ role, content });
  const lines = [L('user', 'q0'), L('assistant', 'a0'), L('user', 'q1'), L('assistant', 'a1'),
    L('assistant', 'stray'), L('user', 'q2'), L('assistant', 'a2'), L('user', 'orphan')];
  const st = fakeStorage([['sansa.v1', JSON.stringify({ version: 1, npcs: { monk: { lastLines: lines } } })]]);
  const mem = createMemory(st, () => at(2026, 10, 25));
  assert.deepEqual(mem.get('monk').lastLines.map(l => l.content), ['q1', 'a1', 'q2', 'a2']);
});

test('손상된 수치: 비유한·안전 정수 밖 카운터는 0, dayGain은 0..3', () => {
  const day = '2026-11-25';
  const st = fakeStorage([['sansa.v1', JSON.stringify({ version: 1, npcs: { monk: {
    meetings: 1e308, affinity: 1e308, errands: { offered: 1e300, accepted: -3, done: 2 }, day, dayGain: 99
  } } })]]);
  const mem = createMemory(st, () => at(2026, 10, 25));
  const g = mem.get('monk');
  assert.equal(g.meetings, 0);
  assert.equal(g.affinity, 0);
  assert.deepEqual(g.errands, { offered: 0, accepted: 0, done: 2 });
  assert.equal(mem.band('monk'), 'new');
  mem.recordMeeting('monk'); // dayGain 3으로 잘렸으니 호감도 증가 없음
  assert.equal(mem.get('monk').affinity, 0);
  assert.equal(mem.get('monk').meetings, 1);
  const st2 = fakeStorage([['sansa.v1', JSON.stringify({ version: 1, npcs: { monk: { day, dayGain: -5 } } })]]);
  const m2 = createMemory(st2, () => at(2026, 10, 25));
  m2.recordMeeting('monk');
  assert.equal(m2.get('monk').affinity, 1);
});
