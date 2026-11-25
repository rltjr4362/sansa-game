import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJournal } from '../src/journal.js';
import { createMemory } from '../src/memory.js';
import { MONK_NAME } from '../src/lines.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) };
}
const NOON = new Date(2026, 10, 25, 12).getTime();
const mem = () => createMemory(fakeStorage(), () => NOON);

test('만남이 없으면 빈 배열', () => {
  assert.deepEqual(buildJournal(mem()), []);
});

test('만난 NPC마다 한 항목: 이름, 오늘 만남·호감도 구간, 순서는 스님·황구·백구·고양이', () => {
  const m = mem();
  for (const npc of ['cat', 'dog', 'monk']) m.recordMeeting(npc);
  const j = buildJournal(m);
  assert.deepEqual(j.map(e => e.title), [MONK_NAME, '황구', '고양이']);
  assert.deepEqual(j[0].lines, ['오늘 만남 1번 · 처음 봄']);
});

test('호감도 구간 이름: 처음 봄 · 낯익음 · 친함', () => {
  const m = mem();
  for (let i = 0; i < 5; i++) m.recordErrand('dog', 'done'); // 호감도 25
  m.recordMeeting('dog');
  m.recordErrand('white', 'done'); // 5
  m.recordMeeting('white');
  assert.match(buildJournal(m).find(e => e.title === '황구').lines[0], /친함$/);
  assert.match(buildJournal(m).find(e => e.title === '백구').lines[0], /낯익음$/);
});

test('완료한 부탁이 있으면 줄이 붙고, 없으면 없다', () => {
  const m = mem();
  m.recordMeeting('monk');
  assert.ok(!buildJournal(m)[0].lines.some(l => l.includes('부탁')));
  m.recordErrand('monk', 'done'); m.recordErrand('monk', 'done');
  assert.ok(buildJournal(m)[0].lines.includes('완료한 부탁 2개'));
});

test('마지막 응답 한 줄을 인용한다(동물 포함)', () => {
  const m = mem();
  m.recordMeeting('monk'); m.recordMeeting('dog');
  m.pushTurn('monk', '안녕', '반갑습니다.');
  m.pushTurn('monk', '날씨 좋네요', '볕이 좋지요.');
  m.pushTurn('dog', '멍', '멍! (꼬리를 흔든다)');
  const j = buildJournal(m);
  assert.equal(j[0].lines.at(-1), '“볕이 좋지요.”');
  assert.equal(j[1].lines.at(-1), '“멍! (꼬리를 흔든다)”');
});

test('오늘 만난 적 없는 NPC는 전체 만남 수로 보여 준다', () => {
  const m = mem();
  m.recordMeeting('cat'); m.recordMeeting('cat');
  const next = NOON + 24 * 3600 * 1000;
  assert.equal(buildJournal(m, NOON)[0].lines[0], '오늘 만남 2번 · 처음 봄');
  assert.equal(buildJournal(m, next)[0].lines[0], '지난 만남 2번 · 처음 봄');
});

test('JournalEntry 형태: 문자열 title, 문자열 배열 lines', () => {
  const m = mem();
  m.recordMeeting('white');
  for (const e of buildJournal(m)) {
    assert.equal(typeof e.title, 'string');
    assert.ok(Array.isArray(e.lines) && e.lines.every(l => typeof l === 'string'));
  }
});
