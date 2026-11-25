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

test('앞의 빈 think 블록을 벗기고 읽는다 (Qwen3.5 실측)', () => {
  const raw = '<think>\n\n</think>\n\n{\n  "say": "맑은 날이에요.",\n  "action": "follow",\n  "place": "없음",\n  "options": ["a","b","c"]\n}';
  assert.deepEqual(parseReply(raw), { say: '맑은 날이에요.', action: 'follow', place: null, options: ['a', 'b', 'c'] });
});

test('think 블록 안에 내용이 있어도 하나만 벗긴다', () => {
  const json = '{"say":"네","action":"none","place":"없음","options":[]}';
  assert.equal(parseReply(`  <think>생각 {중}</think>  ${json}`).say, '네');
  assert.equal(parseReply(`<think>a</think><think>b</think>${json}`), null);
});

test('산문이나 코드펜스가 감싸면 null', () => {
  const json = '{"say":"네","action":"follow","place":"없음","options":[]}';
  assert.equal(parseReply('답: ' + json), null);
  assert.equal(parseReply('```json\n' + json + '\n```'), null);
  assert.equal(parseReply('<think></think>\n```json\n' + json + '\n```'), null);
});

test('문자열이 아닌 입력, 객체가 아닌 JSON은 null', () => {
  assert.equal(parseReply(['{"say":"네","action":"follow"}']), null);
  assert.equal(parseReply(undefined), null);
  assert.equal(parseReply(null), null);
  assert.equal(parseReply({ say: '네' }), null);
  assert.equal(parseReply('[{"say":"네","action":"follow"}]'), null);
  assert.equal(parseReply('"문자열"'), null);
  assert.equal(parseReply('42'), null);
});

test('place가 이상한 타입이어도 던지지 않고 none으로 강등하며 대사는 살린다', () => {
  for (const place of ['{"toString":null}', '["연못가"]', '123', 'null']) {
    let r;
    assert.doesNotThrow(() => { r = parseReply(`{"say":"네","action":"go_to","place":${place},"options":[]}`); }, place);
    assert.equal(r.action, 'none', place);
    assert.equal(r.place, null, place);
    assert.equal(r.say, '네', place);
  }
});

test('say가 없거나 문자열이 아니면 null', () => {
  assert.equal(parseReply('{"action":"follow","place":"없음","options":["a","b","c"]}'), null);
  assert.equal(parseReply('{"say":5,"action":"follow","place":"없음","options":["a","b","c"]}'), null);
  assert.equal(parseReply('{"say":null,"action":"follow","place":"없음","options":[]}'), null);
});

test('보이지 않는 글자뿐인 추천은 비어 있는 것으로 보고 options는 null', () => {
  const r = parseReply(JSON.stringify({ say: '네', action: 'none', place: '없음', options: ['하나', '​', '셋'] }));
  assert.equal(r.options, null);
  for (const z of ['​', '‌', '‍', '⁠', '﻿', ' ​﻿ ']) {
    const q = parseReply(JSON.stringify({ say: '네', action: 'none', place: '없음', options: ['a', z, 'c'] }));
    assert.equal(q.options, null);
  }
});

test('자르기는 보이는 글자(grapheme) 단위다', () => {
  const opt = '가'.repeat(19) + '🙂' + '나';
  const r = parseReply(JSON.stringify({ say: '네', action: 'none', place: '없음', options: [opt, 'b', 'c'] }));
  assert.equal(r.options[0], '가'.repeat(19) + '🙂');
  const s = parseReply(JSON.stringify({ say: '가'.repeat(59) + '👨‍👩‍👧' + '나', action: 'none', place: '없음', options: [] }));
  assert.equal(s.say, '가'.repeat(59) + '👨‍👩‍👧');
});

test('PLACES는 world.js의 실제 방문지·밭·우물과 맞는다', () => {
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  for (const name of ['대웅전', '연못가', '산문', '앞마당']) {
    const tiles = Temple.visits.filter(v => v[0] === name).flatMap(v => v[3]);
    assert.ok(tiles.some(t => same(t, PLACES[name])), name);
  }
  assert.ok(Temple.beds.some(b => same(b.access, PLACES['들밭'])), '들밭');
  const well = Temple.props.find(p => p.kind === 'well');
  const [wx, wy] = PLACES['우물'];
  assert.equal(Math.abs(well.x - wx) + Math.abs(well.y - wy), 1, '우물');
  for (const [name, [x, y]] of Object.entries(PLACES)) {
    assert.notEqual(Temple.route(11, 19, x, y), null, name);
  }
});
