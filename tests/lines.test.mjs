import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MONK_NAME, SYSTEM_RULES, PERSONA, greetingFor, openingFor, templateOptions, MOCK, ERRAND
} from '../src/lines.js';
import { PLACES, SAY_MAX, OPTION_MAX } from '../src/contracts.js';

const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const len = s => [...seg.segment(s)].length;

function collect(obj, out = []) {
  for (const v of Object.values(obj)) {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'object' && v) collect(v, out);
  }
  return out;
}

test('모든 대사 문자열은 비어 있지 않고 60자 이하', () => {
  const all = [
    MONK_NAME,
    ...collect(MOCK).filter(s => typeof s === 'string'),
    ...Object.keys(PLACES).map(p => MOCK.goTo(p)),
    ...collect(ERRAND).filter(s => s !== ERRAND.id)
  ];
  for (const m of [0, 1, 5]) for (const b of ['new', 'familiar', 'close']) all.push(openingFor({ meetings: m, affinityBand: b }));
  for (const clock of [0, 300, 360, 480, 599, 600, 800, 1139, 1140, 1439]) {
    for (const weather of ['맑음', '옅은 안개', '가랑비']) {
      for (const meetings of [0, 3]) all.push(greetingFor({ clock, weather, meetings }));
    }
  }
  for (const s of all) {
    assert.ok(typeof s === 'string' && s.trim().length > 0, `빈 문자열: ${s}`);
    assert.ok(len(s) <= SAY_MAX, `너무 김(${len(s)}): ${s}`);
  }
});

test('PERSONA와 SYSTEM_RULES는 필요한 규칙을 담는다', () => {
  assert.ok(PERSONA.trim());
  assert.ok(PERSONA.includes('도연'));
  assert.ok(SYSTEM_RULES.includes('어서 오십시오'));
  assert.ok(SYSTEM_RULES.includes('go_to'));
  for (const p of Object.keys(PLACES)) assert.ok(SYSTEM_RULES.includes(p));
});

test('templateOptions는 항상 3개, 각 20자 이하', () => {
  for (const following of [false, true]) {
    for (const errandState of [null, 'none', 'offered', 'accepted', 'carrying', 'done', undefined]) {
      const o = templateOptions({ following, errandState });
      assert.equal(o.length, 3);
      for (const s of o) assert.ok(s.trim() && len(s) <= OPTION_MAX, s);
    }
  }
  assert.equal(templateOptions({}).length, 3);
});

test('greetingFor는 결정적이다', () => {
  const a = { clock: 480, weather: '맑음', meetings: 2 };
  assert.equal(greetingFor(a), greetingFor({ ...a }));
});

test('비 오는 날 인사에는 비 관련 말이 들어간다', () => {
  for (const clock of [100, 480, 800, 1200]) {
    assert.match(greetingFor({ clock, weather: '가랑비', meetings: 1 }), /비/);
  }
});

test('인사는 시간대·첫 만남에 따라 달라진다', () => {
  const g = (clock, meetings) => greetingFor({ clock, weather: '맑음', meetings });
  assert.notEqual(g(480, 1), g(800, 1));
  assert.notEqual(g(800, 1), g(1200, 1));
  assert.equal(g(100, 1), g(1200, 1));
  assert.notEqual(g(800, 0), g(800, 1));
});

test('MOCK.goTo 조사: 받침 없음·ㄹ은 로, 그 외 으로', () => {
  const cases = { 연못가: '연못가로', 대웅전: '대웅전으로', 우물: '우물로', 들밭: '들밭으로', 산문: '산문으로', 앞마당: '앞마당으로' };
  for (const [place, want] of Object.entries(cases)) assert.ok(MOCK.goTo(place).startsWith(`${want} `), MOCK.goTo(place));
});

test('ERRAND.accepted는 우물이 동쪽 밭 옆임을 알려 준다', () => {
  assert.equal(ERRAND.accepted, '고맙습니다. 우물은 동쪽 밭 옆에 있어요.');
});
