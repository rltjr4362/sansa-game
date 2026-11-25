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

/**
 * LLM 원문 → 검증된 Reply. 읽을 수 없거나 쓸모없으면 null (호출자는 Mock으로 대체).
 * @param {string} text
 * @returns {Reply|null}
 */
export function parseReply(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;

  const say = typeof raw.say === 'string' ? raw.say.trim().slice(0, SAY_MAX) : '';
  let action = ACTIONS.includes(raw.action) ? raw.action : 'none';
  let place = null;
  if (action === 'go_to') {
    if (Object.hasOwn(PLACES, raw.place)) place = raw.place;
    else action = 'none';
  }
  const options = Array.isArray(raw.options) && raw.options.length === 3 &&
    raw.options.every(o => typeof o === 'string' && o.trim())
    ? raw.options.map(o => o.trim().slice(0, OPTION_MAX))
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
 *   place: string,                 // 스님이 있는 장소 이름 (visits[id][0])
 *   activity: string,              // 스님 일과 설명 (visits[id][1])
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
 * @typedef {{requestId: number, npc: 'monk', action: Action, place: string|null}} ActionRequest
 */
