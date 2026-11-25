import { affinityBand } from './contracts.js';

const KEY = 'sansa.v1';
const DAILY_MEETING_CAP = 3;
const ERRAND_KINDS = ['offered', 'accepted', 'done'];
const MAX_TURNS = 2;
const MAX_COUNT = 9999;

const blank = () => ({
  meetings: 0, affinity: 0, errands: { offered: 0, accepted: 0, done: 0 }, lastLines: [],
  day: '', dayGain: 0, dayMeetings: 0
});

function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 사용자→스님 순서의 완결된 턴만 남긴다(최근 MAX_TURNS개).
function completeTurns(lines) {
  const ok = l => l && (l.role === 'user' || l.role === 'assistant') && typeof l.content === 'string';
  const turns = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    const [u, a] = [lines[i], lines[i + 1]];
    if (ok(u) && ok(a) && u.role === 'user' && a.role === 'assistant') {
      turns.push([{ role: 'user', content: u.content }, { role: 'assistant', content: a.content }]);
      i++;
    }
  }
  return turns.slice(-MAX_TURNS).flat();
}

// 저장된 값에서 알려진 필드만 골라 정리한다(손상·변조에 대비).
function sanitize(raw) {
  const n = blank();
  if (!raw || typeof raw !== 'object') return n;
  const int = v => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 0;
    const f = Math.floor(v);
    return Number.isSafeInteger(f) ? Math.min(f, MAX_COUNT) : 0;
  };
  n.meetings = int(raw.meetings);
  n.affinity = int(raw.affinity);
  for (const k of ERRAND_KINDS) n.errands[k] = int(raw.errands?.[k]);
  if (Array.isArray(raw.lastLines)) n.lastLines = completeTurns(raw.lastLines);
  if (typeof raw.day === 'string') n.day = raw.day;
  n.dayGain = Math.min(int(raw.dayGain), DAILY_MEETING_CAP);
  n.dayMeetings = int(raw.dayMeetings);
  return n;
}

// 저장된 JSON → npcs. 읽기 실패·손상이면 null.
function read(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(KEY) ?? 'null');
    const src = parsed && typeof parsed === 'object' && parsed.npcs;
    if (!src || typeof src !== 'object' || Array.isArray(src)) return null;
    const npcs = {};
    for (const [id, v] of Object.entries(src)) npcs[id] = sanitize(v);
    return npcs;
  } catch {
    return null;
  }
}

// globalThis.localStorage 접근 자체가 SecurityError를 던질 수 있다.
function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

// storage를 생략하면 localStorage(접근 불가면 메모리 내 저장). 변경마다 최신 저장값을 다시 읽어
// 그 위에 적용·저장한다(탭 간 잠금 없는 최선 노력).
export function createMemory(storage, now = () => Date.now()) {
  if (storage === undefined) storage = defaultStorage();
  let npcs = read(storage) ?? {};
  let saveFailed = false;

  const rec = npc => npcs[npc] ??= blank();
  const save = () => {
    try {
      storage?.setItem(KEY, JSON.stringify({ version: 1, npcs }));
      saveFailed = false;
    } catch { saveFailed = true; /* 메모리 내에서만 동작 */ }
  };
  // 저장에 실패한 적이 있으면 메모리 쪽이 더 새로우므로 다시 읽지 않는다.
  const change = (npc, fn) => {
    if (!saveFailed) npcs = read(storage) ?? npcs;
    fn(rec(npc));
    save();
  };
  const cap = v => Math.min(v, MAX_COUNT);

  return {
    get(npc) {
      const { meetings, affinity, errands, lastLines } = rec(npc);
      return {
        meetings, affinity, errands: { ...errands }, lastLines: lastLines.map(l => ({ ...l }))
      };
    },
    recordMeeting(npc) {
      change(npc, r => {
        const today = dayKey(now());
        if (r.day !== today) { r.day = today; r.dayGain = 0; r.dayMeetings = 0; }
        r.dayMeetings = cap(r.dayMeetings + 1);
        r.meetings = cap(r.meetings + 1);
        if (r.dayGain < DAILY_MEETING_CAP) { r.dayGain++; r.affinity = cap(r.affinity + 1); }
      });
    },
    recordErrand(npc, kind) {
      if (!ERRAND_KINDS.includes(kind)) return;
      change(npc, r => {
        r.errands[kind] = cap(r.errands[kind] + 1);
        if (kind === 'done') r.affinity = cap(r.affinity + 5);
      });
    },
    // 질문과 답을 한 턴으로 한 번에 저장한다(저장 실패로 반쪽 턴이 남지 않게).
    pushTurn(npc, userText, assistantText) {
      change(npc, r => {
        r.lastLines = completeTurns([
          ...r.lastLines, { role: 'user', content: userText }, { role: 'assistant', content: assistantText }
        ]);
      });
    },
    // 오늘(at이 속한 날) 만난 횟수. 일지용.
    today(npc, at = now()) {
      const r = rec(npc);
      return r.day === dayKey(at) ? r.dayMeetings : 0;
    },
    band: npc => affinityBand(rec(npc).affinity)
  };
}
