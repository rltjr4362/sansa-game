// 우물 물 길어 오기 1종. 보상(호감도)은 deliver에서 정확히 1회만 기록된다.
export function createErrands(memory) {
  let state = 'none';

  const move = (from, to, kind) => {
    if (!from.includes(state)) return false;
    state = to;
    if (kind) memory.recordErrand('monk', kind);
    return true;
  };

  return {
    state: () => state,
    offer: () => move(['none', 'done'], 'offered', 'offered'),
    accept: () => move(['offered'], 'accepted', 'accepted'),
    decline: () => move(['offered'], 'none'),
    atWell: () => move(['accepted'], 'carrying'),
    deliver: () => move(['carrying'], 'done', 'done'),
    snapshot: () => ['offered', 'accepted', 'carrying'].includes(state) ? { id: 'water', state } : null
  };
}
