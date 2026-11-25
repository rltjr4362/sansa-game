// 일지 항목 만들기. 순수 함수: memory만 읽는다.
import { NPC_NAMES } from './lines.js';

const NPCS = ['monk', 'dog', 'white', 'cat'];
const BAND = { new: '처음 봄', familiar: '낯익음', close: '친함' };

/**
 * @param {{get(npc: string): any, band(npc: string): string, today(npc: string, at?: number): number}} memory
 * @param {number} [now] 생략하면 memory의 시계
 * @returns {import('./contracts.js').JournalEntry[]}
 */
export function buildJournal(memory, now) {
  const entries = [];
  for (const npc of NPCS) {
    const rec = memory.get(npc);
    if (rec.meetings <= 0) continue;
    const today = memory.today(npc, now);
    const band = BAND[memory.band(npc)];
    const lines = [today > 0 ? `오늘 만남 ${today}번 · ${band}` : `지난 만남 ${rec.meetings}번 · ${band}`];
    if (rec.errands.done > 0) lines.push(`완료한 부탁 ${rec.errands.done}개`);
    const last = rec.lastLines.findLast(l => l.role === 'assistant');
    if (last?.content) lines.push(`“${last.content}”`);
    entries.push({ title: NPC_NAMES[npc], lines });
  }
  return entries;
}
