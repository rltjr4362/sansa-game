# Plan 1 — 기반(기준선·world 추출·계약) + 추론 스파이크

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 원본 동작을 숫자로 고정하고, `Temple`을 ES 모듈로 꺼내고, Codex·Claude 작업의 접점 계약(`src/contracts.js`)을 확정한 뒤, 브라우저 LLM 두 후보를 같은 입력으로 측정해 기본 모델을 정한다.

**Architecture:** 빌드 없는 ES 모듈. Node 26 내장 `node:test`로 DOM 없는 모듈(world, contracts)을 테스트. 스파이크는 `spike/` 정적 페이지 + WebLLM WebWorker 엔진, `python3 -m http.server`로 localhost에서 실행.

**Tech Stack:** Node 26 (`node --test`), WebLLM `@mlc-ai/web-llm@0.2.89` (esm.run CDN), Chrome WebGPU.

**스펙:** `docs/superpowers/specs/2026-11-25-sansa-llm-npc-design.md` (§9 기준선, §3 계약, §5 스키마, §7 런타임, §10 순서 0·1a)

**후속 계획:** Plan 2 = 플레이 흐름(Codex, 스펙 §4), Plan 3 = 두뇌·행동·대화(Claude, 스펙 §5·§6). 둘 다 이 계획의 Task 4(contracts) 완료 후 시작 가능.

**스펙 대비 의도적 변경 1건:** 스키마의 `place`는 `null` 대신 `"없음"` 문자열 enum을 쓴다. `anyOf`/`null`과 `maxLength`는 작은 모델·문법 엔진에서 실패 위험이 있어 스키마에서 빼고, 길이 제한은 `parseReply`가 자른다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `package.json` | `"type":"module"`, `npm test` = `node --test` |
| `.gitignore` | `node_modules/`, `.DS_Store` |
| `tests/helpers/trace.mjs` | 원본 HTML에서 Temple 로드, 시뮬레이션 실행 → 추적 객체 |
| `scripts/record-baseline.mjs` | 기준선 JSON 생성 (1회) |
| `tests/baseline/temple-720s.json` | 원본 720초 추적 결과 |
| `tests/original-baseline.test.mjs` | 원본 HTML이 기준선과 같은지 (기준선 파일 자체 보호) |
| `src/world.js` | 원본 `#model` 블록 그대로 + `export { Temple }` |
| `tests/world.test.mjs` | `src/world.js`가 기준선과 같은지 |
| `src/contracts.js` | 행동·장소 enum, 응답 스키마, `parseReply`, `affinityBand`, 타입 주석 |
| `tests/contracts.test.mjs` | 계약 단위 테스트 |
| `spike/prompts.js` | 한글 입력 20개 + 기대 행동 |
| `spike/worker.js` | WebLLM WebWorker 핸들러 |
| `spike/index.html` | 모델 로드·측정·결과 표·JSON 저장 |
| `docs/spike/2026-11-25-results.md` | 측정 결과와 모델 결정 |

---

### Task 1: 프로젝트 골격

**Files:**
- Create: `package.json`, `.gitignore`

- [ ] **Step 1: 파일 작성**

`package.json`
```json
{
  "name": "sansa-game",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/",
    "serve": "python3 -m http.server 8000"
  }
}
```

`.gitignore`
```
node_modules/
.DS_Store
```

- [ ] **Step 2: 테스트 러너 확인**

Run: `cd ~/Projects/sansa-game && npm test`
Expected: `# tests 0` 출력(테스트 파일 없음), 종료 코드 0

- [ ] **Step 3: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: add package.json and node test runner"
```

---

### Task 2: 원본 기준선 기록

**Files:**
- Create: `tests/helpers/trace.mjs`, `scripts/record-baseline.mjs`, `tests/baseline/temple-720s.json`(생성물), `tests/original-baseline.test.mjs`

- [ ] **Step 1: 추적 헬퍼 작성**

`tests/helpers/trace.mjs`
```js
import fs from 'node:fs';
import vm from 'node:vm';

export const ORIGINAL = new URL('../../docs/review/original.html', import.meta.url);
export const BASELINE = new URL('../baseline/temple-720s.json', import.meta.url);

export function loadOriginalTemple() {
  const html = fs.readFileSync(ORIGINAL, 'utf8');
  const code = html.match(/<script id="model">([\s\S]*?)<\/script>/)[1];
  return vm.runInNewContext(code + '\n;Temple', {});
}

export function traceTemple(T, seconds = 720, step = 1 / 30) {
  const s = T.create();
  const visits = [];
  let last = -1;
  const n = Math.round(seconds / step);
  for (let i = 0; i < n; i++) {
    s.tick(step);
    if (s.id !== last) { visits.push(s.id); last = s.id; }
  }
  return {
    visits,
    completed: s.completed,
    harvests: s.harvests,
    stays: s.retreat.stays,
    farm: s.farm.map(b => b.stage),
    clock: Math.round(s.clock),
    monk: [Number(s.x.toFixed(3)), Number(s.y.toFixed(3))],
    dog: [Number(s.animals.dog.x.toFixed(3)), Number(s.animals.dog.y.toFixed(3))]
  };
}

export function readBaseline() {
  return JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
}
```

- [ ] **Step 2: 기준선 생성 스크립트 작성**

`scripts/record-baseline.mjs`
```js
import fs from 'node:fs';
import { loadOriginalTemple, traceTemple, BASELINE } from '../tests/helpers/trace.mjs';

const trace = traceTemple(loadOriginalTemple());
fs.mkdirSync(new URL('.', BASELINE), { recursive: true });
fs.writeFileSync(BASELINE, JSON.stringify(trace, null, 2) + '\n');
console.log('visits', trace.visits.length, 'harvests', trace.harvests, 'stays', trace.stays);
```

- [ ] **Step 3: 기준선 생성**

Run: `node scripts/record-baseline.mjs`
Expected: `visits 20 harvests 1 stays 1` (사전 검증값). 다른 값이면 멈추고 원인 확인 — 원본이 결정적이지 않다는 뜻.

- [ ] **Step 4: 기준선 보호 테스트 작성**

`tests/original-baseline.test.mjs`
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOriginalTemple, traceTemple, readBaseline } from './helpers/trace.mjs';

test('원본 Temple은 720초 동안 기준선과 같은 일과를 보낸다', () => {
  assert.deepEqual(traceTemple(loadOriginalTemple()), readBaseline());
});

test('원본 Temple은 두 번 돌려도 같다 (결정성)', () => {
  const T = loadOriginalTemple();
  assert.deepEqual(traceTemple(T, 120), traceTemple(T, 120));
});
```

- [ ] **Step 5: 테스트 실행**

Run: `npm test`
Expected: `# pass 2`, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/trace.mjs scripts/record-baseline.mjs tests/baseline/temple-720s.json tests/original-baseline.test.mjs
git commit -m "test: record original Temple 720s baseline"
```

---

### Task 3: `Temple`을 `src/world.js`로 추출

**Files:**
- Create: `src/world.js`, `tests/world.test.mjs`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/world.test.mjs`
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { Temple } from '../src/world.js';
import { traceTemple, readBaseline } from './helpers/trace.mjs';

test('src/world.js는 원본과 같은 720초 일과를 보낸다', () => {
  assert.deepEqual(traceTemple(Temple), readBaseline());
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/world.js`

- [ ] **Step 3: 원본 블록을 그대로 복사해 모듈화**

원본 71~504행이 `"use strict";`부터 `})();`까지인지 먼저 확인:

Run: `sed -n '71p;504p' docs/review/original.html`
Expected:
```
"use strict";
})();
```

그다음:
```bash
mkdir -p src
sed -n '71,504p' docs/review/original.html > src/world.js
printf '\nexport { Temple };\n' >> src/world.js
```
코드 내용은 한 글자도 바꾸지 않는다(스타일 정리 금지 — 기준선 비교 대상).

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: `# pass 3`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/world.js tests/world.test.mjs
git commit -m "refactor: extract Temple model into src/world.js"
```

---

### Task 4: 접점 계약 `src/contracts.js`

**Files:**
- Create: `src/contracts.js`, `tests/contracts.test.mjs`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/contracts.test.mjs`
```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/contracts.js`

- [ ] **Step 3: 구현**

`src/contracts.js`
```js
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
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: `# pass 15`, `# fail 0` (기존 3 + 신규 12)

- [ ] **Step 5: Commit**

```bash
git add src/contracts.js tests/contracts.test.mjs
git commit -m "feat: add NPC snapshot/action contracts and reply parser"
```

> **이 시점에서 Plan 2(Codex 플레이 흐름)를 병렬로 시작할 수 있다.**

---

### Task 5: 추론 스파이크 페이지

**Files:**
- Create: `spike/prompts.js`, `spike/worker.js`, `spike/index.html`

- [ ] **Step 1: 입력 세트 작성**

`spike/prompts.js`
```js
// 같은 입력으로 모델·옵션 조합을 비교한다. expect = 기대 행동, place = go_to일 때 기대 장소.
export const PROMPTS = [
  { text: '안녕하세요 스님!', expect: 'none' },
  { text: '여기 처음 와 봤어요. 참 조용하네요.', expect: 'none' },
  { text: '스님은 아침에 뭐 하세요?', expect: 'none' },
  { text: '오늘 날씨가 어떤 것 같으세요?', expect: 'none' },
  { text: '마음이 좀 복잡해서 왔어요.', expect: 'none' },
  { text: '저 따라와 주실 수 있어요?', expect: 'follow' },
  { text: '같이 좀 걸어요, 제 뒤로 오세요.', expect: 'follow' },
  { text: '산책 같이 하실래요? 제가 앞장설게요.', expect: 'follow' },
  { text: '이제 따라오지 않으셔도 괜찮아요.', expect: 'stop_follow' },
  { text: '여기서 잠깐 기다려 주세요.', expect: 'stop_follow' },
  { text: '연못 같이 보러 가실래요?', expect: 'go_to', place: '연못가' },
  { text: '대웅전에 가 보고 싶어요.', expect: 'go_to', place: '대웅전' },
  { text: '우물이 어디 있는지 데려가 주세요.', expect: 'go_to', place: '우물' },
  { text: '밭 구경시켜 주세요.', expect: 'go_to', place: '들밭' },
  { text: '산문 쪽으로 내려가 볼까요?', expect: 'go_to', place: '산문' },
  { text: '제가 도울 일 있을까요?', expect: 'offer_errand' },
  { text: '심심한데 뭐 시키실 일 없으세요?', expect: 'offer_errand' },
  { text: '일손이 필요하시면 말씀하세요.', expect: 'offer_errand' },
  { text: 'ㅋㅋㅋ 스님 귀여우세요', expect: 'none' },
  { text: '고마워요, 다음에 또 올게요.', expect: 'none' }
];

export const SYSTEM = [
  '너는 산사의 스님 "도연"이다. 방문객에게 따뜻한 존댓말로 1~2문장, 60자 이내로 답한다.',
  'JSON 하나만 출력한다. 필드: say(대사), action, place, options.',
  'action 규칙: 방문객이 자기를 따라와 달라고 하면 follow. 그만 따라오라거나 기다리라고 하면 stop_follow.',
  '특정 장소에 같이 가자고 하면 go_to 그리고 place에 장소 이름. 도울 일이나 시킬 일을 물으면 offer_errand. 그 외에는 none.',
  'place는 go_to일 때만 장소 이름, 아니면 "없음". 장소: 대웅전, 연못가, 우물, 들밭, 산문, 앞마당.',
  'options는 방문객이 다음에 할 만한 짧은 말 3개(각 20자 이내).'
].join('\n');

export const SYSTEM_NO_OPTIONS = SYSTEM.replace(
  'options는 방문객이 다음에 할 만한 짧은 말 3개(각 20자 이내).',
  'options는 빈 문자열 3개 ["","",""]로 둔다.'
);

export const CONTEXT = '상황: 오전 8시 10분, 맑음. 스님은 앞마당에서 낙엽을 쓸고 있다. 방문객과는 처음 만났다.';
```

- [ ] **Step 2: 워커 작성**

`spike/worker.js`
```js
import { WebWorkerMLCEngineHandler } from 'https://esm.run/@mlc-ai/web-llm@0.2.89';
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = msg => handler.onmessage(msg);
```

- [ ] **Step 3: 측정 페이지 작성**

`spike/index.html`
```html
<!doctype html>
<html lang="ko">
<meta charset="utf-8">
<title>산사 LLM 스파이크</title>
<style>
body{font:14px system-ui,sans-serif;margin:16px;background:#f6f1e7;color:#2b382f}
table{border-collapse:collapse;width:100%;margin-top:12px}td,th{border:1px solid #cfc6b4;padding:4px 6px;vertical-align:top}
.bad{background:#f3d3cc}.ok{background:#dbe8d2}#log{white-space:pre-wrap;font:12px monospace}
canvas{width:120px;height:40px;border:1px solid #ccc}
</style>
<h1>산사 LLM 스파이크</h1>
<label>모델 <select id="model">
  <option value="Qwen3.5-2B-q4f16_1-MLC">Qwen3.5-2B (기본 후보)</option>
  <option value="gemma-4-E2B-it-q4f16_1-MLC">Gemma 4 E2B (비교)</option>
</select></label>
<label><input type="checkbox" id="withOptions" checked> options 생성 포함</label>
<button id="load">모델 받기</button> <button id="run" disabled>20문항 실행</button> <button id="save" disabled>결과 JSON 저장</button>
<canvas id="spin"></canvas>
<div id="log"></div>
<div id="summary"></div>
<table id="rows"><thead><tr><th>#</th><th>입력</th><th>기대</th><th>행동</th><th>장소</th><th>대사</th><th>추천</th><th>첫토큰ms</th><th>완료ms</th><th>최대 프레임 간격ms</th></tr></thead><tbody></tbody></table>
<script type="module">
import { CreateWebWorkerMLCEngine } from 'https://esm.run/@mlc-ai/web-llm@0.2.89';
import { REPLY_SCHEMA, parseReply } from '../src/contracts.js';
import { PROMPTS, SYSTEM, SYSTEM_NO_OPTIONS, CONTEXT } from './prompts.js';

const $ = id => document.getElementById(id);
const log = t => { $('log').textContent += t + '\n'; };
let engine = null, loadedId = null, results = [];

// 렌더 부하 대용: 매 프레임 캔버스를 그리고 프레임 간격을 잰다.
let lastFrame = performance.now(), maxGap = 0;
const g = $('spin').getContext('2d');
(function frame(t) {
  maxGap = Math.max(maxGap, t - lastFrame); lastFrame = t;
  g.clearRect(0, 0, 300, 150); g.fillStyle = '#526c57';
  g.fillRect((t / 4) % 300, 50, 40, 40);
  requestAnimationFrame(frame);
})(lastFrame);

if (!navigator.gpu) log('WebGPU 없음: 이 브라우저에서는 스파이크를 돌릴 수 없습니다.');

$('load').onclick = async () => {
  const id = $('model').value;
  $('load').disabled = true;
  const t0 = performance.now();
  try {
    if (!engine) {
      engine = await CreateWebWorkerMLCEngine(
        new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }), id,
        { initProgressCallback: r => { document.title = Math.round(r.progress * 100) + '% ' + r.text; } });
    } else {
      await engine.reload(id);
    }
    loadedId = id;
    log(`로드 완료 ${id}: ${((performance.now() - t0) / 1000).toFixed(1)}s`);
    $('run').disabled = false;
  } catch (e) {
    log('로드 실패: ' + e.message);
  } finally {
    $('load').disabled = false;
  }
};

async function ask(text, withOptions) {
  const messages = [
    { role: 'system', content: (withOptions ? SYSTEM : SYSTEM_NO_OPTIONS) + '\n' + CONTEXT },
    { role: 'user', content: text }
  ];
  const req = {
    messages, stream: true, temperature: 0.7, max_tokens: 160,
    response_format: { type: 'json_object', schema: JSON.stringify(REPLY_SCHEMA) }
  };
  if (loadedId.startsWith('Qwen')) req.extra_body = { enable_thinking: false };
  const t0 = performance.now(); let first = null, out = '';
  maxGap = 0;
  const stream = await engine.chat.completions.create(req);
  for await (const chunk of stream) {
    const d = chunk.choices[0]?.delta?.content || '';
    if (d && first === null) first = performance.now() - t0;
    out += d;
  }
  return { raw: out, first: Math.round(first ?? -1), total: Math.round(performance.now() - t0), gap: Math.round(maxGap) };
}

$('run').onclick = async () => {
  $('run').disabled = true; results = [];
  const withOptions = $('withOptions').checked, body = $('rows').tBodies[0];
  body.innerHTML = '';
  for (const [i, p] of PROMPTS.entries()) {
    let r;
    try { r = await ask(p.text, withOptions); } catch (e) { r = { raw: 'ERROR ' + e.message, first: -1, total: -1, gap: -1 }; }
    const reply = parseReply(r.raw);
    const actionOk = reply && reply.action === p.expect && (p.expect !== 'go_to' || reply.place === p.place);
    results.push({ ...p, ...r, reply, actionOk });
    const tr = body.insertRow();
    tr.className = actionOk ? 'ok' : 'bad';
    for (const v of [i + 1, p.text, p.expect + (p.place ? ':' + p.place : ''), reply?.action ?? 'JSON실패', reply?.place ?? '', reply?.say ?? r.raw, (reply?.options || []).join(' / '), r.first, r.total, r.gap])
      tr.insertCell().textContent = v;
  }
  const n = results.length, med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const summary = {
    model: loadedId, withOptions,
    jsonValid: results.filter(r => r.reply).length / n,
    actionAccuracy: results.filter(r => r.actionOk).length / n,
    goToAccuracy: results.filter(r => r.expect === 'go_to' && r.actionOk).length / results.filter(r => r.expect === 'go_to').length,
    optionsValid: withOptions ? results.filter(r => r.reply?.options).length / n : null,
    medianFirstMs: med(results.map(r => r.first)),
    medianTotalMs: med(results.map(r => r.total)),
    worstFrameGapMs: Math.max(...results.map(r => r.gap))
  };
  $('summary').textContent = JSON.stringify(summary, null, 2);
  window.spikeResult = { summary, results };
  $('run').disabled = false; $('save').disabled = false;
};

$('save').onclick = () => {
  const blob = new Blob([JSON.stringify(window.spikeResult, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const s = window.spikeResult.summary;
  a.href = URL.createObjectURL(blob);
  a.download = `spike-${s.model}-${s.withOptions ? 'opt' : 'noopt'}.json`;
  a.click();
};
</script>
</html>
```

- [ ] **Step 4: 정적 서버로 열리는지 확인**

Run: `cd ~/Projects/sansa-game && python3 -m http.server 8000` (백그라운드)
Chrome에서 `http://localhost:8000/spike/` 열기.
Expected: 콘솔 오류 없음, "WebGPU 없음" 문구가 **안** 보임, 파란 사각형이 움직임.

- [ ] **Step 5: Commit**

```bash
git add spike/
git commit -m "feat: add WebLLM inference spike page"
```

---

### Task 6: 스파이크 실행과 모델 결정

**Files:**
- Create: `docs/spike/2026-11-25-results.md`, `docs/spike/*.json`(저장한 결과)

- [ ] **Step 1: Qwen3.5-2B, options 포함** — 모델 받기(약 1.08GB, 첫 회만) → 20문항 실행 → 결과 JSON 저장 → `docs/spike/`로 이동
- [ ] **Step 2: Qwen3.5-2B, options 미포함** — 체크 해제 후 실행·저장
- [ ] **Step 3: Gemma 4 E2B, options 포함** — 모델 선택 변경 → 받기 → 실행·저장
- [ ] **Step 4: Gemma 4 E2B, options 미포함** — 실행·저장
- [ ] **Step 5: 사용자 한국어 품질 평가** — 사용자가 네 표의 `대사` 열을 보고 모델별 1~5점. (사람만 할 수 있는 단계)
- [ ] **Step 6: 결과 문서 작성** — `docs/spike/2026-11-25-results.md`에 4개 summary 표 + 사용자 점수 + 결정.

결정 규칙 (미리 고정):
1. `jsonValid < 0.95`인 조합은 탈락.
2. 남은 것 중 기본 모델 = Qwen3.5-2B. 단 Gemma가 사용자 품질 점수에서 **1점 이상** 높고 `medianTotalMs`가 Qwen의 1.5배 이하이면 Gemma.
3. `options`: 포함 시 `optionsValid ≥ 0.9`이고 `medianTotalMs` 증가가 40% 이하이면 포함, 아니면 템플릿.
4. `goToAccuracy < 0.6`이면 `go_to`를 2단계로 미룬다(스펙 §5).
5. `worstFrameGapMs > 100`이면 Plan 3에서 생성 중 렌더 부하 대책을 추가 과제로 등록.

- [ ] **Step 7: Commit**

```bash
git add docs/spike/
git commit -m "docs: record inference spike results and model decision"
```

- [ ] **Step 8 (사용자 승인 필요): Pages URL 측정** — GitHub 저장소 생성·Pages 활성화는 외부 공개 작업이므로 사용자 확인 후 진행. 같은 페이지를 Pages URL에서 열어 콜드 다운로드 시간·캐시 재방문 로드 시간을 결과 문서에 추가.
