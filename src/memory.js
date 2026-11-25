import { affinityBand } from './contracts.js';

const KEY = 'sansa.v1';
const DAILY_MEETING_CAP = 3;
const ERRAND_KINDS = ['offered', 'accepted', 'done'];
const MAX_LINES = 4;

const blank = () => ({
  meetings: 0, affinity: 0, errands: { offered: 0, accepted: 0, done: 0 }, lastLines: [],
  day: '', dayGain: 0
});

function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 저장된 값에서 알려진 필드만 골라 정리한다(손상·변조에 대비).
function sanitize(raw) {
  const n = blank();
  if (!raw || typeof raw !== 'object') return n;
  const int = v => Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  n.meetings = int(raw.meetings);
  n.affinity = int(raw.affinity);
  for (const k of ERRAND_KINDS) n.errands[k] = int(raw.errands?.[k]);
  if (Array.isArray(raw.lastLines)) {
    n.lastLines = raw.lastLines
      .filter(l => l && (l.role === 'user' || l.role === 'assistant') && typeof l.content === 'string')
      .slice(-MAX_LINES)
      .map(l => ({ role: l.role, content: l.content }));
  }
  if (typeof raw.day === 'string') n.day = raw.day;
  n.dayGain = int(raw.dayGain);
  return n;
}

export function createMemory(storage = globalThis.localStorage, now = () => Date.now()) {
  let npcs = {};
  try {
    const parsed = JSON.parse(storage?.getItem(KEY) ?? 'null');
    const src = parsed && typeof parsed === 'object' && parsed.npcs;
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      for (const [id, v] of Object.entries(src)) npcs[id] = sanitize(v);
    }
  } catch { npcs = {}; }

  const rec = npc => npcs[npc] ??= blank();
  const save = () => {
    try { storage?.setItem(KEY, JSON.stringify({ version: 1, npcs })); } catch { /* 메모리 내에서만 동작 */ }
  };

  return {
    get(npc) {
      const { meetings, affinity, errands, lastLines } = rec(npc);
      return {
        meetings, affinity, errands: { ...errands }, lastLines: lastLines.map(l => ({ ...l }))
      };
    },
    recordMeeting(npc) {
      const r = rec(npc);
      const today = dayKey(now());
      if (r.day !== today) { r.day = today; r.dayGain = 0; }
      r.meetings++;
      if (r.dayGain < DAILY_MEETING_CAP) { r.dayGain++; r.affinity++; }
      save();
    },
    recordErrand(npc, kind) {
      if (!ERRAND_KINDS.includes(kind)) return;
      const r = rec(npc);
      r.errands[kind]++;
      if (kind === 'done') r.affinity += 5;
      save();
    },
    pushLine(npc, role, content) {
      const r = rec(npc);
      r.lastLines.push({ role, content });
      r.lastLines = r.lastLines.slice(-MAX_LINES);
      save();
    },
    band: npc => affinityBand(rec(npc).affinity)
  };
}
