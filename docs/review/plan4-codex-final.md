`plan4-play` 워크트리에 Part A를 구현했습니다. 동물 빙의와 상호작용, 스님 방향 표시, 일지, 모델 선택, 종루 이스터에그를 추가했습니다. 버튼에 포커스가 있을 때 게임 단축키가 가로채는 문제를 재현해 수정했습니다. 초기 모드 전환 제보는 재현되지 않았습니다.

`control`과 `player`는 Node 테스트의 실패를 먼저 확인한 뒤 구현했습니다. `npm test` **176개 통과, 0개 실패**이며 Node DOM/Canvas 스모크도 통과했습니다. **브라우저 미확인.**

계약과 금지 파일은 변경하지 않았습니다. Part B 병합 전에는 기존 게임이 대상 활성화 API를 호출하지 않아 우물 부탁을 진행할 수 없습니다. 샌드박스가 Git `index.lock` 생성을 거부해 변경 파일을 워크트리에 남겼습니다.

[Plan 4 구현 보고서](/Users/kks/Projects/sansa-game-play4/docs/review/plan4-report.md)