// 키워드 규칙으로 REPLY_SCHEMA를 만족하는 JSON 문자열을 만든다. 항상 쓸 수 있는 마지막 보루.
import { PLACES, NO_PLACE } from '../contracts.js';
import { MOCK, templateOptions } from '../lines.js';

const ALIASES = { 연못: '연못가', 밭: '들밭', 법당: '대웅전', 마당: '앞마당' };
const PLACE_WORDS = [...Object.keys(PLACES), ...Object.keys(ALIASES)];

const STOP_RE = /그만\s*따라|따라오지\s*않|기다려|여기서\s*잠깐/;
// 긍정형 이동 요청만 go_to. '가 보고 싶'은 스파이크 PROMPTS("대웅전에 가 보고 싶어요")용.
const GO_RE = /가자|가실래요|가\s*볼까요|가\s*보고\s*싶|보러|데려|구경|안내/;
const NO_GO_RE = /말아요|말고|않|안\s*가|싫/;

// '가요'는 앞 음절이 ㄴ 받침이면 의문 어미(-ㄴ가요: 시원한가요, 있는가요)라 이동 요청이 아니다.
const endsWithNieun = ch => {
  const c = ch?.charCodeAt(0) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 === 4;
};
const hasGaYo = text => [...text.matchAll(/가요/g)].some(m => !endsWithNieun(text[m.index - 1]));
const wantsToGo = text => (GO_RE.test(text) || hasGaYo(text)) && !NO_GO_RE.test(text);
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
  if (place && wantsToGo(text)) return { action: 'go_to', place, say: MOCK.goTo(place) };
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
