import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, PLACES, NO_PLACE, REPLY_SCHEMA, parseReply, affinityBand } from '../src/contracts.js';
import { Temple } from '../src/world.js';

test('모든 장소 좌표는 걸을 수 있는 타일이다', () => {
  for (const [name, [x, y]] of Object.entries(PLACES)) {
    assert.ok(Temple.walkable(x, y), name);
  }
});

test('스키마 enum은 상수와 일치한다', () => {
  assert.deepEqual(REPLY_SCHEMA.properties.action.enum, ACTIONS);
  assert.deepEqual(REPLY_SCHEMA.properties.place.enum, [NO_PLACE, ...Object.keys(PLACES)]);
});

test('정상 응답을 그대로 읽는다', () => {
  const r = parseReply('{"say":"연못으로 가 봅시다.","action":"go_to","place":"연못가","options":["좋아요","물고기 있나요?","나중에요"]}');
  assert.deepEqual(r, { say: '연못으로 가 봅시다.', action: 'go_to', place: '연못가', options: ['좋아요', '물고기 있나요?', '나중에요'] });
});

test('JSON이 아니면 null', () => {
  assert.equal(parseReply('안녕하세요'), null);
  assert.equal(parseReply(''), null);
});

test('모르는 행동은 none으로 강등한다', () => {
  assert.equal(parseReply('{"say":"네","action":"fly","place":"없음","options":[]}').action, 'none');
});

test('go_to인데 장소가 없거나 모르면 none, place는 null', () => {
  const a = parseReply('{"say":"네","action":"go_to","place":"없음","options":[]}');
  assert.equal(a.action, 'none'); assert.equal(a.place, null);
  const b = parseReply('{"say":"네","action":"go_to","place":"부산","options":[]}');
  assert.equal(b.action, 'none'); assert.equal(b.place, null);
});

test('go_to가 아니면 place는 null', () => {
  assert.equal(parseReply('{"say":"네","action":"follow","place":"연못가","options":[]}').place, null);
});

test('대사는 60자, 추천은 20자로 자른다', () => {
  const r = parseReply(JSON.stringify({ say: '가'.repeat(80), action: 'none', place: '없음', options: ['나'.repeat(30), '다', '라'] }));
  assert.equal(r.say.length, 60);
  assert.equal(r.options[0].length, 20);
});

test('추천이 정확히 3개의 비어 있지 않은 문자열이 아니면 options는 null', () => {
  assert.equal(parseReply('{"say":"네","action":"none","place":"없음","options":["하나","둘"]}').options, null);
  assert.equal(parseReply('{"say":"네","action":"none","place":"없음","options":["하나","","셋"]}').options, null);
  assert.equal(parseReply('{"say":"네","action":"none","place":"없음"}').options, null);
});

test('대사가 비고 행동도 none이면 null', () => {
  assert.equal(parseReply('{"say":"  ","action":"none","place":"없음","options":["a","b","c"]}'), null);
});

test('대사가 비어도 행동이 있으면 살린다', () => {
  assert.equal(parseReply('{"say":"","action":"follow","place":"없음","options":[]}').action, 'follow');
});

test('호감도 구간', () => {
  assert.equal(affinityBand(0), 'new');
  assert.equal(affinityBand(4), 'new');
  assert.equal(affinityBand(5), 'familiar');
  assert.equal(affinityBand(14), 'familiar');
  assert.equal(affinityBand(15), 'close');
});
