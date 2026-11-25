// 스냅샷+입력 → 메시지, 스트리밍 중 대사 추출, ask().
import { PERSONA, SYSTEM_RULES, ANIMALS, ANIMAL_RULES, ERRANDS, NPC_NAMES } from './lines.js';

const BAND = { new: '처음 봄', familiar: '낯익음', close: '친함' };
const ERRAND_STATE = { offered: '제안함', accepted: '수락함' };
// 말을 건 쪽 + 주격 조사
const SUBJECT = { visitor: '방문객이', monk: '스님이', dog: '황구가', white: '백구가', cat: '고양이가' };
const isAnimal = who => Object.hasOwn(ANIMALS, who);
const pad = n => String(n).padStart(2, '0');

function errandPart(errand) {
  const e = ERRANDS[errand.id] ?? ERRANDS.water;
  const state = errand.state === 'carrying' ? e.carryingLabel : (ERRAND_STATE[errand.state] ?? errand.state);
  return `부탁: ${e.label}(${state}).`;
}

function situation(s) {
  const clock = `${pad(Math.floor(s.clock / 60))}:${pad(s.clock % 60)}`;
  const head = `상황: ${clock}, ${s.weather}.`;
  const band = BAND[s.affinityBand] ?? s.affinityBand;
  const partner = SUBJECT[s.partner];
  if (isAnimal(s.npc)) {
    const name = NPC_NAMES[s.npc];
    return [head, `${partner ?? SUBJECT.visitor} ${name}에게 다가왔다.`, `${name}와 ${s.meetings}번째 만남(${band}).`].join(' ');
  }
  if (isAnimal(s.partner)) {
    return [head, `스님은 ${s.place ?? '어딘가'}에서 ${s.activity}.`, `${partner} 스님에게 다가왔다.`].join(' ');
  }
  const parts = [head, `스님은 ${s.place ?? '어딘가'}에서 ${s.activity}.`, `방문객과 ${s.meetings}번째 만남(${band}).`];
  if (s.errand) parts.push(errandPart(s.errand));
  if (s.following) parts.push('스님은 방문객을 따라가는 중.');
  return parts.join(' ');
}

const rules = npc => isAnimal(npc) ? [ANIMALS[npc].persona, ANIMAL_RULES] : [PERSONA, SYSTEM_RULES];

export function buildMessages(snapshot, userText) {
  return [
    { role: 'system', content: [...rules(snapshot.npc), situation(snapshot)].join('\n') },
    ...snapshot.history,
    { role: 'user', content: userText }
  ];
}

const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' };

// 스트리밍 중인 부분 JSON에서 "say" 값만 뽑는다. 아직 닫히지 않았으면 지금까지.
export function partialSay(raw) {
  let text = raw.replace(/^\s*<think>[\s\S]*?<\/think>\s*/, '');
  if (/^\s*<think>/.test(text)) return '';
  const m = /"say"\s*:\s*"/.exec(text);
  if (!m) return '';
  text = text.slice(m.index + m[0].length);
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') break;
    if (c !== '\\') { out += c; continue; }
    const n = text[i + 1];
    if (n === undefined) break;
    if (n === 'u') {
      const hex = text.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
    } else {
      out += ESCAPES[n] ?? n;
      i++;
    }
  }
  return out;
}

export function createBrain(router) {
  return {
    async ask({ requestId, snapshot, userText, signal, onSay }) {
      let last = '';
      const { reply, source } = await router.chat({
        messages: buildMessages(snapshot, userText),
        signal,
        onText: raw => {
          const s = partialSay(raw);
          if (s !== last) { last = s; onSay?.(s); }
        }
      });
      return { requestId, reply, source };
    }
  };
}
