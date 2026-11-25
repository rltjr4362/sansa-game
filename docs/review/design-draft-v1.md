# 산사의 하루 — LLM NPC 게임화 설계 초안 v1

원본: `docs/review/original.html` (Codex가 만든 1,771줄 단일 HTML, 캔버스 아이소메트릭 픽셀아트 산사 시뮬레이션. 스크립트 3블록: `#model` Temple / `#painting` Scene / `#viewer`).

## 0. 사용자와 확정한 요구사항
- NPC: LLM이 **대화 + 행동 결정** (정해진 행동 어휘 중 JSON으로 선택). NPC-NPC 자율 사회는 범위 밖.
- 플레이어: **새 방문객**으로 시작, 키 하나로 스님/황구/백구/고양이 **빙의** 가능. 빙의 중 원래 AI 정지, 해제 시 복귀.
- 루프: **샌드박스 + 가벼운 목표** (NPC가 즉석 부탁 제안, 호감도, 하루 일지).
- 동물: 평소 소리+행동 묘사(대본), **빙의 시 또는 호감도 높을 때 말함**.
- 입력: **자유 한글 입력 + LLM 추천 대사 3개(1/2/3 키)**.
- 기억: NPC별 **요약 기억 + 호감도를 localStorage에 저장**.
- 배포: **친구에게 링크 하나로 공유** → GitHub Pages, 설치 없음.
- 모델: **최대한 가볍게**. 기본 경량(~1.3GB): Gemma 4 E2B vs Qwen3.5 2B 스파이크 후 확정. 설정에서 0.8B/4B 선택 가능.
- 런타임: WebLLM(WebGPU) 기본, Ollama 고급 옵션, Mock(대본) 폴백/테스트.
- 분업: 그림/스프라이트/UI 디자인/렌더 수정 = Codex(GPT), 설계·LLM 통합·행동 시스템·리뷰 = Claude.

## 1. 구조
빌드 없는 ES 모듈 + GitHub Pages.
```
index.html            HUD·대화창 마크업+CSS
src/world.js          원본 Temple. actor.controlled 플래그 → AI tick 스킵
src/render.js         원본 Scene + 방문객 스프라이트, 말풍선, 상호작용 표시
src/viewer.js         원본 viewer + 플레이어 카메라 추적
src/player.js         키보드 이동(타일 충돌, walkable 재사용), E 상호작용, Q 빙의 순환
src/actions.js        행동 어휘 → world 명령, 검증
src/brain.js          상황 스냅샷 → 프롬프트 → {say, action, args, mood, suggestions}
src/memory.js         localStorage: affinity, summary[], tasks, journal
src/tasks.js          부탁 템플릿 + 완료 판정
src/dialogue.js       대화 UI
src/llm/{index,webllm,ollama,mock}.js
tests/
```
경계: world/render는 LLM을 모름. brain은 DOM을 모름. LLM 출력은 actions.js 검증 통과해야만 세계 반영.

## 2. NPC 두뇌 (초안)
- 호출 시점: (a) 플레이어가 E로 말 걸고 입력/선택 → 응답, (b) **먼저 말 걸기**: 플레이어가 3타일 안 + NPC 일과가 idle/look/rest + 쿨다운 60s 지남 → brain에 "인사할지?" 질의(say 빈 문자열 허용).
- 출력 스키마(JSON 문법 강제):
  `{ "say": string(≤60자), "action": enum, "target": enum|null, "mood": enum, "suggestions": [string×3] }`
  - action enum: `none, follow_player, stop_follow, go_to, offer_task, complete_task, emote, resume_routine, chant, sit`
  - target enum: 장소 키(대웅전, 연못가, 우물, 들밭, 산문 …) 또는 task id
  - mood: `calm, happy, curious, tired, worried`
- 프롬프트(작게): 시스템 = 페르소나 3줄 + 규칙 4줄 + 행동 목록. 컨텍스트 = 시각·날씨·장소·NPC 현재 일과·주변 인물·진행 중 부탁·호감도·요약기억 3줄·최근 대화 4턴.
- 기억: 대화 종료(창 닫기) 시 한 번 LLM 호출해 "한 줄 요약" → summary 배열(최대 5, 오래된 것부터 삭제). affinity는 규칙 기반(+1 대화, +3 부탁 완료, mood=happy +1).
- 동물: 호감도<임계 & 비빙의 → LLM 호출 없이 대본 테이블(소리+행동 묘사)과 규칙 행동. 임계 이상이면 LLM, 말투 제약.
- 빙의 시: 플레이어가 그 캐릭터. 다른 NPC 프롬프트의 "상대" 정보가 해당 캐릭터로 바뀜(예: 스님이 강아지에게 말하는 톤).

## 3. 조작·UI (초안)
- 이동: WASD/방향키, 카메라 회전(시점 4방향)에 맞춰 화면 기준 방향을 월드 방향으로 변환. 연속 이동 + 타일 충돌(walkable).
- E: 가장 가까운 NPC(2타일 내)와 대화. 대화창: NPC 대사, 1/2/3 추천, Enter로 자유 입력, Esc 종료.
- Q: 빙의 순환(방문객→스님→황구→백구→고양이→방문객).
- 모델 로딩: 첫 대화 시 다운로드 시작, 진행률 표시, 그동안 Mock 응답.
- 하루 일지: J 키, 완료한 부탁·만난 NPC·호감도 표시.

## 4. 오류·테스트 (초안)
- LLM 실패/타임아웃(8s)/스키마 위반 → Mock 응답으로 대체, 게임 계속.
- WebGPU 없음 → 시작 시 감지, Mock 모드 + 안내.
- 렌더 끊김 방지: LLM은 Web Worker(WebLLM WebWorkerEngine)에서 실행.
- 테스트: Mock LLM으로 brain→actions→world 통합 테스트(node로 world.js 헤드리스 구동), 스키마 검증 단위 테스트, 수동 플레이 체크리스트.

## 5. 진행 순서·에이전트 (초안)
0. 스파이크: file://·Pages에서 WebLLM, 모델 3종 한국어·JSON·속도 비교 (Claude)
1. 원본을 모듈로 분리, 동작 동일 확인 (Codex — 원작자 스타일 유지)
2. player.js + 빙의 + 방문객 스프라이트 (Claude 로직 / Codex 스프라이트)
3. llm/ + brain + actions + Mock (Claude Opus)
4. dialogue UI 디자인 (Codex), 연결 (Claude)
5. memory + tasks + 일지 (Claude Sonnet)
6. 페르소나/대본 테이블 초안 (Haiku/Sonnet), 리뷰 (Codex sol)
7. GitHub Pages 배포, 친구 기기 테스트
