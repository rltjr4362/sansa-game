`plan4-brain`의 `git diff main..HEAD -- src tests`를 Part B와 2단계 계약 기준으로 리뷰했습니다. `npm test`는 225개 통과했습니다. 아래 재현에서는 가짜 UI에 실제 Play의 상호작용 판정과 스님 제어를 연결했고, 모델 응답과 로드 실패는 테스트 입력으로 주입했습니다.

## Critical

없음.

## Important

1. **구형 Play에서 채소 부탁을 수락하면 이후 부탁 진행이 막힙니다.** **Node 재현.** 구형 Play에서 물 부탁 완료 → 다음 채소 부탁 수락 → 들밭과 공양간에서 상호작용하면 두 곳 모두 `field`·`kitchen` 이벤트가 발생하지 않아 `accepted`에 머뭅니다. 진행 중에는 새 부탁도 제안할 수 없습니다. 기존 테스트는 구형 Play가 생성할 수 없는 이벤트를 직접 주입합니다. Play의 지원 기능에 맞춰 제안 가능한 부탁을 정하고, 구형 Play에서는 물만 제안하세요. [src/game.js:274](/Users/kks/Projects/sansa-game-brain4/src/game.js:274) · [src/errands.js:28](/Users/kks/Projects/sansa-game-brain4/src/errands.js:28) · [src/player.js:48](/Users/kks/Projects/sansa-game-brain4/src/player.js:48) · [tests/game2.test.mjs:393](/Users/kks/Projects/sansa-game-brain4/tests/game2.test.mjs:393)

2. **황구가 스님에게 따라오라고 하면 스님이 대기 중인 방문객을 따라갑니다.** **Node 재현.** 황구 빙의 → 스님에게 `따라와` 입력 → 황구가 스님 왼쪽에 있어도 스님은 오른쪽에 있는 방문객 쪽으로 이동했습니다. `follow`와 `stop_follow`는 방문객 추종을 제어하므로 실행 직전에 `partner === 'visitor'`를 확인하고, 차단된 행동에 해당하는 대사도 바꾸세요. [src/game.js:274](/Users/kks/Projects/sansa-game-brain4/src/game.js:274) · [src/contracts.js:124](/Users/kks/Projects/sansa-game-brain4/src/contracts.js:124) · [Part A의 추종 경로](/Users/kks/Projects/sansa-game-play4/src/control.js:261)

3. **동물에게 실행할 수 없는 부탁과 방문객용 추천이 표시됩니다.** **Node 재현.** 황구 빙의 → 대본 스님에게 `도울 일 있을까요?` 입력 → 상태는 `none`인데 스님은 “마침 부탁드릴 일이 하나 있어요”라고 답하고, 추천에도 `도울 일 있을까요?`가 다시 뜹니다. 동물 상대의 Mock 응답에는 행동 종류와 관계없이 동물용 대사와 추천을 적용하고, LLM의 `offer_errand`를 차단할 때도 해당 부탁 대사를 교체하세요. [src/game.js:276](/Users/kks/Projects/sansa-game-brain4/src/game.js:276) · [src/game.js:284](/Users/kks/Projects/sansa-game-brain4/src/game.js:284)

4. **빙의 전환과 `dispose()`에서 부탁 대상이 켜진 채 남습니다.** **Node 재현.** 물 수락 → 황구 빙의 → 우물 옆에서 실제 상호작용 판정이 `well`을 반환하지만 게임은 이를 무시합니다. 채소도 수락 직후에는 `field`, 수확 뒤에는 `kitchen`이 동물 빙의 중 계속 켜져 있었습니다. `dispose()` 후에도 켜진 대상이 남았습니다. 대상 계산에 현재 조종 캐릭터를 반영하고, 빙의 전환 시 즉시 동기화해 방문객 복귀 때 현재 단계의 대상을 복원하세요. `dispose()`에서는 켜 둔 대상을 끄세요. [src/game.js:100](/Users/kks/Projects/sansa-game-brain4/src/game.js:100) · [src/game.js:188](/Users/kks/Projects/sansa-game-brain4/src/game.js:188) · [src/game.js:371](/Users/kks/Projects/sansa-game-brain4/src/game.js:371) · [src/game.js:395](/Users/kks/Projects/sansa-game-brain4/src/game.js:395)

5. **스님이 대화 범위를 벗어나도 남아 있는 버튼으로 부탁을 수락할 수 있습니다.** **Node 재현.** 스님에게 `연못 보러 가요` → 이동을 시작한 직후 `도울 일 있을까요?` → 스님과의 맨해튼 거리가 5가 된 뒤 `수락` → `accepted`로 바뀌고 우물이 켜졌습니다. `choose()`에서 열린 방문객–스님 대화인지, 현재 조종 캐릭터와 거리가 여전히 유효한지 확인하고 유효하지 않으면 선택지를 제거하세요. [src/game.js:94](/Users/kks/Projects/sansa-game-brain4/src/game.js:94) · [src/game.js:300](/Users/kks/Projects/sansa-game-brain4/src/game.js:300)

6. **모델이 말한 부탁과 실제 수락되는 부탁이 달라질 수 있습니다.** **Node 재현.** 첫 물 부탁 거절 → 다음 요청에 모델이 물을 길어 달라는 `offer_errand` 응답 반환 → 화면에는 물과 채소 부탁이 함께 표시되고, 수락하면 들밭만 켜집니다. 제안이 승인되면 실제 선택된 종류의 `ERRANDS[kind].offer`를 제안문으로 쓰세요. [src/game.js:289](/Users/kks/Projects/sansa-game-brain4/src/game.js:289) · [src/errands.js:28](/Users/kks/Projects/sansa-game-brain4/src/errands.js:28)

7. **동물 LLM 해금 조건과 하루 호감도 상한이 Part B와 다릅니다.** **Node 재현.** AI가 켜진 상태에서 황구 대화창을 다섯 번 열기만 한 뒤 `안녕` 입력 → 호감도 5인 `familiar`에서 LLM이 호출됐습니다. Part B는 쓰다듬기 대화로 +1, 하루 최대 3, `close`부터 LLM을 요구합니다. 만남 기록과 호감도 증가를 분리하고, 하루 상한 3과 `close` 경계를 테스트하세요. [src/game.js:80](/Users/kks/Projects/sansa-game-brain4/src/game.js:80) · [src/game.js:139](/Users/kks/Projects/sansa-game-brain4/src/game.js:139) · [src/memory.js:103](/Users/kks/Projects/sansa-game-brain4/src/memory.js:103) · [Part B](/Users/kks/Projects/sansa-game-brain4/docs/superpowers/plans/2026-11-25-plan4-phase2.md:24)

8. **로드에 실패한 모델이 저장되면 구형 Play에서 그 모델만 재시도합니다.** **Node 재현.** Qwen이 저장된 상태에서 Gemma 선택 → Gemma 로드에 메모리 부족 오류 주입 → 저장값이 Gemma로 바뀜 → 같은 저장소를 구형 Play에서 열면 버튼을 누를 때마다 Gemma만 시도합니다. 마지막 선택과 마지막 성공 모델을 별도로 저장하고, 구형 버튼은 실패 시 다른 모델을 재시도할 수 있게 하세요. 손상된 문자열은 기본 모델로 폴백했고, 미등록 ID를 선택 콜백에 넘겨도 기존 값은 유지됐습니다. [src/game.js:315](/Users/kks/Projects/sansa-game-brain4/src/game.js:315) · [src/game.js:333](/Users/kks/Projects/sansa-game-brain4/src/game.js:333) · [src/game.js:380](/Users/kks/Projects/sansa-game-brain4/src/game.js:380)

## Minor

1. **전달 장소를 생략하면 공양간에 가지 않아도 채소 보상이 지급됩니다.** **Node 재현.** 채소 수락 → `atField()` → 인자 없이 `deliver()` 호출 → `done`과 호감도 +5가 기록됩니다. 현재 UI 호출부는 장소를 명시합니다. 두 부탁 모두 올바른 장소에서 연속 두 번 전달했을 때 보상은 각각 한 번이었습니다. `deliver(at)`에 장소를 필수로 하고, 인자 생략과 잘못된 장소를 모두 회귀 테스트에 넣으세요. [src/errands.js:38](/Users/kks/Projects/sansa-game-brain4/src/errands.js:38)

2. **업데이트 당일의 기존 만남이 일지에서 과거 만남으로 표시됩니다.** **Node 재현.** 오늘 날짜와 `dayGain: 2`, `meetings: 2`만 있는 1단계 저장값 → 일지에 `지난 만남 2번` 표시. `dayMeetings`가 없는 같은 날의 레코드는 `dayGain`을 확인 가능한 최소 만남 수로 사용하고, 정확한 횟수를 복원할 수 없는 경우에는 그에 맞는 문구를 표시하세요. [src/memory.js:49](/Users/kks/Projects/sansa-game-brain4/src/memory.js:49) · [src/journal.js:17](/Users/kks/Projects/sansa-game-brain4/src/journal.js:17)