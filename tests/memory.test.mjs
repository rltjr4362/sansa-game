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
  a.pushLine('monk', 'user', '안녕');
  assert.ok(st.m.has('sansa.v1'));
  assert.equal(JSON.parse(st.m.get('sansa.v1')).version, 1);
  const b = createMemory(st, () => at(2026, 10, 25));
  assert.equal(b.get('monk').meetings, 1);
  assert.equal(b.get('monk').affinity, 1);
  assert.equal(b.get('monk').errands.offered, 1);
  assert.deepEqual(b.get('monk').lastLines, [{ role: 'user', content: '안녕' }]);
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
  for (let i = 0; i < 6; i++) mem.pushLine('monk', i % 2 ? 'assistant' : 'user', `m${i}`);
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
