// 부탁 종류별 상태 기계. 한 번에 하나만 진행한다. 보상(호감도)은 deliver에서 정확히 1회만 기록된다.
// water: 우물 → 스님, veg: 들밭 → 공양간. 보상은 둘 다 스님에게(recordErrand('monk', 'done')).
const KINDS = {
  water: { pickup: 'well', dropoff: 'monk' },
  veg: { pickup: 'field', dropoff: 'kitchen' }
};
const ORDER = Object.keys(KINDS);
const ACTIVE = ['offered', 'accepted', 'carrying'];

export function createErrands(memory) {
  let state = 'none';
  let current = null;
  let next = ORDER[0];

  const move = (from, to, kind) => {
    if (!from.includes(state)) return false;
    state = to;
    if (kind) memory.recordErrand('monk', kind);
    return true;
  };
  // 거둔 곳(pickup)에서만 accepted → carrying.
  const pickUp = place => Boolean(current) && KINDS[current].pickup === place && move(['accepted'], 'carrying');

  return {
    state: () => state,
    kind: () => ACTIVE.includes(state) ? current : null,
    nextKind: () => next,
    offer(kind = next) {
      if (!Object.hasOwn(KINDS, kind) || !['none', 'done'].includes(state)) return false;
      current = kind;
      next = ORDER[(ORDER.indexOf(kind) + 1) % ORDER.length];
      return move(['none', 'done'], 'offered', 'offered');
    },
    accept: () => move(['offered'], 'accepted', 'accepted'),
    decline: () => move(['offered'], 'none'),
    atWell: () => pickUp('well'),
    atField: () => pickUp('field'),
    // at를 생략하면 그 부탁의 전달 장소로 본다(스님/공양간).
    deliver(at) {
      if (!current || (at !== undefined && at !== KINDS[current].dropoff)) return false;
      return move(['carrying'], 'done', 'done');
    },
    // 지금 단계에서 켜야 할 장소 대상. 스님은 사람 대상이라 항상 켜져 있어 여기 없다.
    targets() {
      if (!current) return [];
      const { pickup, dropoff } = KINDS[current];
      if (state === 'accepted') return [pickup];
      if (state === 'carrying' && dropoff !== 'monk') return [dropoff];
      return [];
    },
    snapshot: () => ACTIVE.includes(state) ? { id: current, state } : null
  };
}
