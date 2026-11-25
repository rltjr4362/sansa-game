// 주 엔진 → 타임아웃·실패·파싱 실패 시 fallback(Mock). 외부 중단은 그대로 reject.
import { parseReply } from '../contracts.js';

const abortError = () => new DOMException('Aborted', 'AbortError');

export function createRouter({ primary, fallback, timeoutMs = 8000 }) {
  async function useFallback({ messages, signal, onText }) {
    const raw = await fallback.chat({ messages, signal, onText });
    const reply = parseReply(raw);
    if (!reply) throw new Error('fallback returned an invalid reply');
    return { raw, reply, source: 'mock' };
  }

  // 타임아웃·외부 abort는 primary가 abort를 무시해도 대기를 즉시 끝낸다. 그 뒤의 청크·결과는 버린다.
  // 타임아웃·실패·파싱 실패 → null(fallback으로), 외부 abort → AbortError.
  function tryPrimary({ messages, signal, onText }) {
    return new Promise((resolve, reject) => {
      const ac = new AbortController();
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        fn(value);
      };
      const onAbort = () => { ac.abort(); finish(reject, abortError()); };
      const timer = setTimeout(() => { ac.abort(); finish(resolve, null); }, timeoutMs);
      signal?.addEventListener('abort', onAbort);
      Promise.resolve()
        .then(() => primary.chat({
          messages, signal: ac.signal, onText: t => { if (!settled) onText?.(t); }
        }))
        .then(raw => {
          const reply = parseReply(raw);
          finish(resolve, reply ? { raw, reply, source: 'llm' } : null);
        }, () => finish(resolve, null));
    });
  }

  return {
    active: () => (primary?.ready ? 'llm' : 'mock'),
    async chat({ messages, signal, onText }) {
      if (signal?.aborted) throw abortError();
      if (primary?.ready) {
        const out = await tryPrimary({ messages, signal, onText });
        if (signal?.aborted) throw abortError();
        if (out) return out;
      }
      return useFallback({ messages, signal, onText });
    }
  };
}
