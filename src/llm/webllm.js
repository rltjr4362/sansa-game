// WebLLM WebWorker 엔진 어댑터. 브라우저 전용. WebLLM은 load() 안에서만 동적 import 한다.
import { REPLY_SCHEMA } from '../contracts.js';

const WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.89';
const abortError = () => new DOMException('Aborted', 'AbortError');

export function createWebLLM({ modelId = 'gemma-4-E2B-it-q4f16_1-MLC', onProgress } = {}) {
  let engine = null;
  const isQwen = modelId.startsWith('Qwen');

  const llm = {
    kind: 'webllm',
    ready: false,

    async supported() {
      try {
        if (!globalThis.navigator?.gpu) return false;
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return false;
        if (modelId.includes('f16') && !adapter.features.has('shader-f16')) return false;
        return true;
      } catch {
        return false;
      }
    },

    async load() {
      const { CreateWebWorkerMLCEngine } = await import(WEBLLM_URL);
      engine = await CreateWebWorkerMLCEngine(
        new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }),
        modelId,
        { initProgressCallback: r => onProgress?.(r.progress, r.text) }
      );
      // 예열: 첫 응답의 셰이더 컴파일 지연을 미리 치른다.
      try {
        await engine.chat.completions.create({
          messages: [{ role: 'user', content: '안녕' }], stream: false, max_tokens: 8
        });
      } catch { /* 예열 실패는 무시 */ }
      llm.ready = true;
    },

    async chat({ messages, signal, onText }) {
      if (!engine) throw new Error('webllm not loaded');
      if (signal?.aborted) throw abortError();
      const onAbort = () => { try { engine.interruptGenerate(); } catch { /* 무시 */ } };
      signal?.addEventListener('abort', onAbort);
      try {
        const req = {
          messages, stream: true, temperature: 0.7, max_tokens: 160,
          response_format: { type: 'json_object', schema: JSON.stringify(REPLY_SCHEMA) }
        };
        if (isQwen) req.extra_body = { enable_thinking: false };
        const stream = await engine.chat.completions.create(req);
        let raw = '';
        for await (const chunk of stream) {
          if (signal?.aborted) break;
          const d = chunk.choices[0]?.delta?.content || '';
          if (!d) continue;
          raw += d;
          onText?.(raw);
        }
        if (signal?.aborted) throw abortError();
        return raw;
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    }
  };
  return llm;
}
