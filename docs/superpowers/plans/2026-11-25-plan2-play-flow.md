# Plan 2 — 플레이 흐름 (담당: Codex)

**Goal:** 원본 산사를 키보드로 플레이할 수 있게 만든다. 방문객 이동·충돌, E 상호작용, 스님 빙의/해제, 플레이 카메라, 대화창 화면, 그리고 `src/contracts.js`의 `Play`·`MonkHandle`·`DialogueView` 구현.

**스펙:** `docs/superpowers/specs/2026-11-25-sansa-llm-npc-design.md` §4(플레이어·빙의·카메라), §1 성공 기준 1·2·3·6·8. 설계 검토 기록: `docs/review/codex-review-1.md`(네가 쓴 1차 리뷰 — 그 지적이 이 계획의 요구사항이다).

**접점 계약 (바꾸지 말 것, 바꿔야 하면 멈추고 보고):** `src/contracts.js`의 `MonkHandle`, `DialogueView`, `Play` 타입과 `PLACES`. Plan 3(Claude)이 동시에 `src/game.js`, `src/brain.js`, `src/actions.js`, `src/llm/*`, `src/memory.js`, `src/errands.js`, `src/lines.js`를 만든다. **이 파일들은 만들거나 고치지 말 것**(단, 아래 `src/game.js` 임시본 예외).

## 소유 파일
| 파일 | 내용 |
|---|---|
| `index.html` | 원본 마크업·CSS 기반 게임 페이지. `<script type="module">`로 `startPlay`, `createGame` 호출 |
| `src/render.js` | 원본 `#painting`(Scene)을 모듈로. 방문객 스프라이트, 말풍선, "E 말걸기" 표시, 빙의 대상 통일 처리 |
| `src/viewer.js` | 원본 `#viewer`를 모듈로. 관찰 모드(기존 휠·핀치·회전) + 플레이 모드 카메라 |
| `src/player.js` | 키 입력, 연속 이동, 타일 충돌, E 대상 선택 |
| `src/control.js` | 빙의(조종권 이전), 스님 따라가기·장소 이동, `MonkHandle` 구현. **DOM 금지** (Node 테스트 대상) |
| `src/dialogue-view.js` | `DialogueView` 구현 (대화창 디자인 포함) |
| `src/play.js` | `startPlay(canvas): Play` 조립 |
| `src/game.js` | **임시본만.** E로 스님에게 말 걸면 대화창을 열고 입력을 그대로 되받아 말하는 echo. Plan 3 병합 시 Claude 것으로 교체된다 |
| `tests/control.test.mjs`, `tests/player.test.mjs` | Node 테스트 |

`src/world.js`는 원본과 동일해야 한다는 기준선 테스트(`tests/world.test.mjs`)가 있다. **world.js를 고치지 말고** 필요한 동작은 control.js에서 `s`(Temple.create() 결과)의 공개 필드를 다뤄 구현한다. 정말 world.js 수정이 필요하면 멈추고 이유를 보고.

## 요구사항

### 이동·충돌 (player.js)
- WASD/방향키 연속 이동, 방문객 속도는 스님 걷기와 비슷하게(약 1.1타일/초).
- 화면 방향 → 월드 방향은 현재 카메라 각도로 변환. **플레이 모드에서 시점 회전 고정.**
- 충돌: 발 좌표를 `Math.floor`로 타일화해 `Temple.walkable` 검사, 한 프레임 이동 중 통과하는 모든 타일 검사, 축별 분리 이동(벽에 비스듬히 붙어 미끄러짐). 대각선 모서리 통과 금지, 법당 문턱 통과 가능.
- 시작 위치: 산문 안쪽 (11.5, 19.5) 근처 걸을 수 있는 타일.

### E 상호작용
- 대상: 스님(거리 2타일 이내 **그리고** `Temple.route` 길이 4 이하) 또는 우물(prop kind 'well'에 4방향 인접 타일 위). 둘 다면 가까운 쪽.
- 대상 위에 "E 말걸기" / "E 물 긷기" 표시.
- 대화창이 열려 있으면 이동·E·Q 무시.
- 방문객으로 플레이 중일 때만 `onInteract` 호출(빙의 중 E는 MVP에서 무시).

### 빙의 (control.js) — 조종권 이전
- Q: 방문객 ↔ 스님 전환(MVP는 이 둘만). 스님과 거리 무관.
- 세계 tick은 계속(시계·날씨·농사·손님·동물).
- 빙의 시작: `s.meeting`, `s.encounter`, `dog.visitor`, `group.pair` 등 스님이 끼어 있는 공동 활동 종료, 현재 일과는 목적지 id만 보관하고 `s.path` 폐기, 일과 진행·완료 처리 중단. 스님 위치는 플레이어 입력으로만 바뀐다. 방문객은 그 자리에 서 있다.
- 해제: 보관한 일과의 접근 타일로 **현재 타일에서 재탐색**, 실패하면 새 일과 선택. 다른 장소에서 일과 완료(`finishDuty`) 처리가 일어나지 않아야 한다.
- 합격 기준(테스트로): 스님–황구 만남 진행 중 빙의 → 30초 후 황구가 대기 상태에 갇혀 있지 않음, 해제 후 60초 내 스님이 일과 하나를 정상 완료.
- 빙의 중 `s.tick`이 스님을 움직이지 않게 하는 방법은 control.js에서 결정(예: 빙의 중엔 스님 위치·face를 tick 전후로 복원하고 phase를 고정). 원본 tick 내부 동작에 기대는 부분은 주석으로 원본 줄번호를 적는다.

### 스님 손잡이 (MonkHandle)
- `follow(seconds)`: 일과 보류, 방문객 뒤 1~2타일 유지(경로는 `Temple.route`), 시간 만료·`stopFollow()`·빙의 시 종료 후 일과 재개.
- `goTo(place)`: `PLACES[place]`로 이동, 도착하면 일과 재개. 경로 없으면 false.
- `busy()`, `possessed()`, `tile()`, `snapshotBase()` — contracts.js 주석대로. `snapshotBase().place`는 **실제 위치** 기준: 스님 타일이 어느 PLACES 타일이나 visits 접근 타일에서 2타일 이내면 그 이름, 아니면 null.
- `say(text, seconds=4)`: 스님 머리 위 말풍선(원본 `#chant` 스타일 재사용 가능).

### 렌더 (render.js)
- 방문객 스프라이트: 원본 픽셀 그림체(원본 `guestFigure` 참고)로 새 디자인 — 배낭 멘 방문객, 원본 손님과 구별되는 색. 걷기 애니메이션.
- 방문객·빙의 대상의 방 점유, 실내/실외 한 번만 그리기, 컷어웨이 대상: 원본은 스님/손님/백구·고양이를 경로별로 다룬다(`original.html` 1255, 1284, 1327, 1353행). "주인공(지금 조종 중인 캐릭터)" 개념으로 통일.
- 말풍선과 "E" 표시는 캔버스와 같은 카메라 변환.

### 카메라 (viewer.js)
- `selected`(상호작용 대상)와 카메라 대상 분리.
- 플레이 모드(기본): 조종 중인 캐릭터 추적, 줌 약 2.5배, 시점 회전 고정.
- 관찰 모드: Tab으로 전환, 원본 조작 그대로(휠·핀치·드래그·구역 선택·회전).
- 원본 UI(설정, 음악, 환경음 등)는 유지. 원본 "스님과 대화/강아지와 교감" 메뉴는 플레이 모드에서 숨김.

### 대화창 (dialogue-view.js) — 디자인 자유
- 원본 파스텔 Ⅱ 톤(48~51행 색)과 어울리게. 화면 하단, 모바일 폭에서도 깨지지 않게.
- NPC 이름, NPC 대사(스트리밍으로 갱신), "…" 생각 중 표시, 추천 1/2/3, 자유 입력칸(Enter 전송, 한글 IME 조합 중 Enter 무시 — `e.isComposing`), 선택 버튼, 상태 줄, Esc 닫기.
- 대화창이 열리면 입력칸 포커스. 1/2/3은 입력칸이 비어 있을 때만 추천 선택.

### 기타 Play 메서드
- `onTick(cb)`: 시뮬레이션 프레임마다 dt(초).
- `setHud(text)`: 화면 구석 작은 줄. 빈 문자열이면 숨김.
- `modelButton(onClick)`: 화면 우상단 "AI 스님 깨우기" 버튼, `setText`/`hide`.

## 테스트 (Node, `npm test`)
- `tests/control.test.mjs`: 빙의 합격 기준, 해제 후 재탐색(다른 장소에서 finishDuty 안 됨), follow 60초 유지·만료 후 일과 재개, goTo 도착 후 일과 재개, goTo 잘못된 장소 false, 빙의 중 follow/goTo false, snapshotBase.place가 이동 중엔 목적지가 아닌 실제 위치.
- `tests/player.test.mjs`: 벽·연못 통과 불가, 대각선 모서리 통과 불가, 법당 문턱 통과, 축별 미끄러짐, E 대상 선택(벽 너머 스님 제외, 우물 인접).
- 기존 테스트(24개)는 전부 계속 통과.

## 브라우저 확인
`python3 -m http.server 8000` → `http://localhost:8000/` 에서 성공 기준 확인: 방문객 이동·충돌, E로 echo 대화, Q 빙의/해제, Tab 관찰 모드, 30fps 이상. 콘솔 오류 없음.

## 커밋
작은 단위로 자주. 메시지 끝에 빈 줄 + `Co-Authored-By: Codex gpt-6.2-sol <noreply@openai.com>`.

## 완료 보고 (`docs/review/plan2-report.md`)
구현 요약, 테스트 결과(`ℹ pass/fail`), 원본 대비 바뀐 동작, 계약 문서와 다르게 한 부분(있다면 이유), 남은 문제.
