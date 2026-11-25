// ActionRequest 사전검사·실행. 예외를 던지지 않고, 실행할 수 없으면 none으로 강등한다.
const none = reason => (reason ? { executed: 'none', reason } : { executed: 'none' });

export function applyAction(monk, request, { errands, followSeconds = 60 }) {
  try {
    if (request.action === 'none') return none();
    if (monk.possessed()) return none('possessed');
    if (monk.busy()) return none('busy');
    switch (request.action) {
      case 'follow':
        if (monk.snapshotBase().following) return none('already following');
        return monk.follow(followSeconds) ? { executed: 'follow' } : none('follow refused');
      case 'stop_follow':
        if (!monk.snapshotBase().following) return none('not following');
        monk.stopFollow();
        return { executed: 'stop_follow' };
      case 'go_to':
        return monk.goTo(request.place) ? { executed: 'go_to' } : none('no path');
      case 'offer_errand':
        return errands.offer() ? { executed: 'offer_errand' } : none('errand unavailable');
      default:
        return none('unknown action');
    }
  } catch (e) {
    return none(`error: ${e?.message ?? e}`);
  }
}
