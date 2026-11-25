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

// ── Plan 2(플레이) ↔ Plan 3(게임 두뇌) 연결 ──────────────────────────────
// index.html: `const play = startPlay(canvas); createGame(play);`
// Plan 2는 src/play.js의 startPlay를, Plan 3은 src/game.js의 createGame을 만든다.

/**
 * 스님을 바깥에서 다루는 손잡이. Plan 2가 구현하고 Plan 3(actions.js)이 호출한다.
 * 모든 메서드는 예외를 던지지 않는다.
 * @typedef {{
 *   possessed(): boolean,                       // 플레이어가 스님에 빙의 중
 *   busy(): boolean,                            // 원본 공동 활동(s.encounter, s.meeting) 진행 중
 *   tile(): [number, number],                   // 스님의 현재 정수 타일
 *   snapshotBase(): {clock: number, weather: string, place: string|null, activity: string, following: boolean},
 *   follow(seconds: number): boolean,           // 방문객 뒤 1~2타일을 따라감. 빙의 중이면 false
 *   stopFollow(): void,                         // 따라가기 종료, 일과 재개(현재 타일에서 재탐색)
 *   goTo(place: keyof typeof PLACES): boolean,  // 장소 접근 타일로 이동. 경로 없거나 빙의 중이면 false. 도착하면 일과 재개
 *   hold(seconds: number): void,                // 제자리에 멈춰 방문객을 바라본다. 일과는 보류했다가 시간이 끝나면 현재 타일에서 재개. 빙의 중이면 무시. 다시 부르면 시간 연장
 *   say(text: string, seconds?: number): void   // 스님 머리 위 말풍선 (대본 인사·짧은 대사)
 * }} MonkHandle
 */

/**
 * 대화창 화면. Plan 2(Codex)가 마크업·CSS·동작을 만들고 Plan 3이 내용을 채운다.
 * 열려 있는 동안 플레이어 이동 키는 막힌다. Esc는 close()와 같고 onClose를 부른다.
 * @typedef {{
 *   open(title: string): void,
 *   isOpen(): boolean,
 *   setNpcText(text: string): void,             // 스트리밍 중 매번 전체 문자열로 덮어쓴다
 *   setThinking(on: boolean): void,             // "…" 표시
 *   setOptions(options: string[]): void,        // 최대 3개, 1/2/3 키로 고름. 빈 배열이면 숨김
 *   setChoices(choices: Array<{label: string, id: string}>): void, // [수락]/[거절] 같은 버튼. 빈 배열이면 숨김
 *   setStatus(text: string): void,              // 창 아래 작은 안내 (예: "대본 스님이 답해요")
 *   onSubmit(cb: (text: string) => void): void, // 자유 입력 Enter 또는 1/2/3
 *   onChoice(cb: (id: string) => void): void,
 *   onClose(cb: () => void): void,
 *   close(): void
 * }} DialogueView
 */

/**
 * startPlay()의 반환값.
 * @typedef {{
 *   monk: MonkHandle,
 *   dialogue: DialogueView,
 *   playerTile(): [number, number],             // 지금 조종 중인 캐릭터의 타일
 *   possessing(): 'visitor'|'monk',
 *   onInteract(cb: (target: 'monk'|'well') => void): void, // E 키: 스님(대화 가능 거리·경로) 또는 우물 근처
 *   onPossessChange(cb: (who: 'visitor'|'monk') => void): void,
 *   onTick(cb: (dt: number) => void): void,     // 시뮬레이션 한 프레임마다 (일시정지 중엔 안 부름)
 *   setHud(text: string): void,                 // 화면 한쪽 작은 상태 줄 (예: "부탁: 물 길어 오기")
 *   modelButton(onClick: () => void): {setText(text: string): void, hide(): void} // "AI 스님 깨우기" 버튼
 * }} Play
 */
