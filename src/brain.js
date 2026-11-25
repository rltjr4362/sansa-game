// 스냅샷+입력 → 메시지, 스트리밍 중 대사 추출, ask().
import { PERSONA, SYSTEM_RULES } from './lines.js';

const BAND = { new: '처음 봄', familiar: '낯익음', close: '친함' };
const ERRAND_STATE = { offered: '제안함', accepted: '수락함', carrying: '물을 들고 옴' };
const pad = n => String(n).padStart(2, '0');

function situation(s) {
  const clock = `${pad(Math.floor(s.clock / 60))}:${pad(s.clock % 60)}`;
  const parts = [
    `상황: ${clock}, ${s.weather}.`,
    `스님은 ${s.place ?? '어딘가'}에서 ${s.activity}.`,
    `방문객과 ${s.meetings}번째 만남(${BAND[s.affinityBand] ?? s.affinityBand}).`
  ];
  if (s.errand) parts.push(`부탁: 물 길어 오기(${ERRAND_STATE[s.errand.state] ?? s.errand.state}).`);
  if (s.following) parts.push('스님은 방문객을 따라가는 중.');
  return parts.join(' ');
}

export function buildMessages(snapshot, userText) {
  return [
    { role: 'system', content: [PERSONA, SYSTEM_RULES, situation(snapshot)].join('\n') },
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
