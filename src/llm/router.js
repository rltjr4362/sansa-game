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

  async function tryPrimary({ messages, signal, onText }) {
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const raw = await primary.chat({ messages, signal: ac.signal, onText });
      const reply = parseReply(raw);
      return reply ? { raw, reply, source: 'llm' } : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
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
