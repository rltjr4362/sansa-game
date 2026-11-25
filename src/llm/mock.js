// 키워드 규칙으로 REPLY_SCHEMA를 만족하는 JSON 문자열을 만든다. 항상 쓸 수 있는 마지막 보루.
import { PLACES, NO_PLACE } from '../contracts.js';
import { MOCK, templateOptions } from '../lines.js';

const ALIASES = { 연못: '연못가', 밭: '들밭', 법당: '대웅전', 마당: '앞마당' };
const PLACE_WORDS = [...Object.keys(PLACES), ...Object.keys(ALIASES)];

const STOP_RE = /그만\s*따라|따라오지\s*않|기다려|여기서\s*잠깐/;
const GO_RE = /가|보러|데려|구경/;
const FOLLOW_RE = /따라와|따라오|같이\s*(좀\s*)?걸|뒤로|산책|앞장/;
const ERRAND_RE = /도울|시킬|시키실|일손|심부름/;

function findPlace(text) {
  let best = null;
  for (const w of PLACE_WORDS) {
    const i = text.indexOf(w);
    if (i >= 0 && (!best || i < best.i)) best = { i, place: ALIASES[w] ?? w };
  }
  return best?.place ?? null;
}

function decide(text) {
  if (STOP_RE.test(text)) return { action: 'stop_follow', say: MOCK.stopFollow };
  const place = findPlace(text);
  if (place && GO_RE.test(text)) return { action: 'go_to', place, say: MOCK.goTo(place) };
  if (FOLLOW_RE.test(text)) return { action: 'follow', say: MOCK.follow };
  if (ERRAND_RE.test(text)) return { action: 'offer_errand', say: MOCK.errand };
  return { action: 'none', say: /안녕|반갑/.test(text) ? MOCK.greet : MOCK.fallback };
}

export function createMockLLM() {
  return {
    kind: 'mock',
    ready: true,
    async chat({ messages, signal, onText }) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const last = [...messages].reverse().find(m => m.role === 'user');
      const { action, place, say } = decide(last?.content ?? '');
      const raw = JSON.stringify({
        say,
        action,
        place: place ?? NO_PLACE,
        options: templateOptions({ following: action === 'follow' })
      });
      onText?.(raw);
      return raw;
    }
  };
}
