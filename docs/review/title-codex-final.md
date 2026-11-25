`title-play` 워크트리에 ‘산사의 하루’ 시작 화면을 구현했습니다. `Play.showTitle()`을 호출하면 산사 전경이 회전하고 게임 UI와 입력이 잠깁니다. 저장된 선택은 강조와 포커스를 함께 복원하며, 시작하면 260ms 페이드 후 방문객 시점으로 줌합니다. 모션 감소 설정에서는 회전과 페이드를 생략합니다.

현재 `game.js`에서는 기존처럼 바로 플레이됩니다. `npm test` **248개 통과**, Node 통합 점검 통과. **브라우저 미확인.**

샌드박스가 Git 잠금 파일 생성을 막아 변경 파일을 워크트리에 남겼습니다. [구현 보고서](/Users/kks/Projects/sansa-game-title/docs/review/title-report.md)