// Codex(플레이 흐름)와 Claude(두뇌·행동)의 유일한 접점. 바꿀 때는 양쪽 합의.

export const ACTIONS = ['none', 'follow', 'stop_follow', 'go_to', 'offer_errand'];

// 장소 이름 → 접근 타일(걸을 수 있는 정수 타일 좌표). tests/contracts.test.mjs가 walkable을 검사한다.
export const PLACES = {
  '대웅전': [10, 7],
  '연못가': [18, 12],
  '우물': [28, 10],
  '들밭': [28, 15],
  '산문': [11, 16],
  '앞마당': [10, 12]
};
export const NO_PLACE = '없음';

export const SAY_MAX = 60;
export const OPTION_MAX = 20;

// WebLLM response_format.schema 로 넘긴다. 길이 제한은 문법 엔진이 아니라 parseReply가 맡는다.
export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    say: { type: 'string' },
    action: { type: 'string', enum: ACTIONS },
    place: { type: 'string', enum: [NO_PLACE, ...Object.keys(PLACES)] },
    options: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 }
  },
  required: ['say', 'action', 'place', 'options'],
  additionalProperties: false
};

/** @typedef {'none'|'follow'|'stop_follow'|'go_to'|'offer_errand'} Action */
/** @typedef {{say: string, action: Action, place: string|null, options: string[]|null}} Reply */

const THINK_RE = /^\s*<think>[\s\S]*?<\/think>\s*/;
const INVISIBLE_RE = /[\u200B\u200C\u200D\u2060\uFEFF]/g;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// 보이는 글자(grapheme) 기준으로 max개까지만 남긴다.
function truncate(str, max) {
  if (str.length <= max) return str;
  let out = '';
  let n = 0;
  for (const { segment } of segmenter.segment(str)) {
    if (n++ === max) break;
    out += segment;
  }
  return out;
}

/**
 * LLM 원문 → 검증된 Reply. 읽을 수 없거나 쓸모없으면 null (호출자는 Mock으로 대체).
 * 맨 앞의 <think>...</think> 한 블록만 벗기고, 그 밖의 산문·코드펜스는 허용하지 않는다.
 * @param {string} text
 * @returns {Reply|null}
 */
export function parseReply(text) {
  if (typeof text !== 'string') return null;
  let raw;
  try { raw = JSON.parse(text.replace(THINK_RE, '')); } catch { return null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.say !== 'string') return null;

  const say = truncate(raw.say.trim(), SAY_MAX);
  let action = ACTIONS.includes(raw.action) ? raw.action : 'none';
  let place = null;
  if (action === 'go_to') {
    if (typeof raw.place === 'string' && Object.hasOwn(PLACES, raw.place)) place = raw.place;
    else action = 'none';
  }
  const clean = o => typeof o === 'string' ? o.replace(INVISIBLE_RE, '').trim() : '';
  const options = Array.isArray(raw.options) && raw.options.length === 3 &&
    raw.options.every(o => clean(o))
    ? raw.options.map(o => truncate(o.trim(), OPTION_MAX))
    : null;

  if (!say && action === 'none') return null;
  return { say, action, place, options };
}

/** @param {number} affinity @returns {'new'|'familiar'|'close'} */
export function affinityBand(affinity) {
  return affinity < 5 ? 'new' : affinity < 15 ? 'familiar' : 'close';
}

/**
 * brain 입력. 플레이 흐름(Plan 2)이 만들고 두뇌(Plan 3)가 읽는다.
 * @typedef {{
 *   npc: 'monk',
 *   clock: number,                 // 0~1439 분
 *   weather: string,               // '맑음' | '옅은 안개' | '가랑비'
 *   place: string|null,            // 스님이 지금 실제로 있는 장소(현재 위치로 판정, 식별 불가면 null). 걷는 중에 visits[id][0]을 쓰지 않는다
 *   activity: string,              // 지금 하는 일. 걷는 중 '걷는 중', 따라가는 중 '방문객을 따라가는 중', 그 외 phase가 'act'일 때 현재 방문 라벨
 *   partner: 'visitor',            // MVP는 방문객만. 2단계에서 'monk'|'dog'|'white'|'cat'
 *   following: boolean,
 *   errand: null | {id: string, state: 'offered'|'accepted'|'carrying'},
 *   meetings: number,
 *   affinityBand: 'new'|'familiar'|'close',
 *   history: Array<{role: 'user'|'assistant', content: string}>  // 직전 1~2턴
 * }} NpcSnapshot
 */

/**
 * actions 입력. 두뇌가 만들고 플레이 흐름이 실행 전 다시 검사한다.
 * requestId는 플레이 코드가 요청마다 단조 증가로 발급하며 대화 상대에 묶인다. 두뇌는 그대로 되돌려 준다.
 * 타임아웃·대화 종료·빙의 전환이 있으면 활성 id는 무효가 된다.
 * 적용 직전에 거리·경로·공동 활동·빙의·심부름 상태를 다시 확인한다.
 * @typedef {{requestId: number, npc: 'monk', action: 'go_to', place: keyof typeof PLACES}
 *   | {requestId: number, npc: 'monk', action: 'none'|'follow'|'stop_follow'|'offer_errand', place: null}} ActionRequest
 */
