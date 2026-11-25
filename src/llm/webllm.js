// WebLLM WebWorker 엔진 어댑터. 브라우저 전용. WebLLM은 load() 안에서만 동적 import 한다.
import { REPLY_SCHEMA } from '../contracts.js';

const WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.89';
const abortError = () => new DOMException('Aborted', 'AbortError');

const defaultImport = () => import(WEBLLM_URL);
const defaultWorker = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

// importWebLLM·createWorker는 테스트용 주입점(기본값은 브라우저 동작).
export function createWebLLM({
  modelId = 'gemma-4-E2B-it-q4f16_1-MLC', onProgress,
  importWebLLM = defaultImport, createWorker = defaultWorker
} = {}) {
  let engine = null;
  let worker = null;
  let failLoad = null;       // 진행 중인 load()를 실패시키는 함수
  let generation = 0;        // dispose()마다 증가. import 대기 중 dispose 감지용
  let queue = Promise.resolve(); // 엔진당 생성 요청 직렬화
  const isQwen = modelId.startsWith('Qwen');

  function teardown() {
    llm.ready = false;
    engine = null;
    const w = worker;
    worker = null;
    try { w?.terminate(); } catch { /* 무시 */ }
  }

  async function runChat({ messages, signal, onText }) {
    if (!engine) throw new Error('webllm not loaded');
    if (signal?.aborted) throw abortError();
    const eng = engine;
    const onAbort = () => { try { eng.interruptGenerate(); } catch { /* 무시 */ } };
    signal?.addEventListener('abort', onAbort);
    try {
      const req = {
        messages, stream: true, temperature: 0.7, max_tokens: 160,
        response_format: { type: 'json_object', schema: JSON.stringify(REPLY_SCHEMA) }
      };
      if (isQwen) req.extra_body = { enable_thinking: false };
      const stream = await eng.chat.completions.create(req);
      // create() 대기 중 취소됐으면 첫 next() 전에 스트림을 닫는다.
      if (signal?.aborted) {
        try { await stream.return?.(); } catch { /* 무시 */ }
        throw abortError();
      }
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
      if (llm.ready) return;
      const gen = generation;
      const { CreateWebWorkerMLCEngine } = await importWebLLM();
      if (gen !== generation) throw new Error('webllm disposed');
      const w = createWorker();
      worker = w;
      // 워커 시작 실패(error·messageerror)나 dispose()는 응답 대기와 무관하게 로드를 끝낸다.
      const failed = new Promise((_, reject) => {
        failLoad = e => reject(e instanceof Error ? e : new Error(e?.message || 'webllm worker failed'));
      });
      failed.catch(() => {});
      const onError = e => failLoad?.(e?.error ?? e);
      w.addEventListener?.('error', onError);
      w.addEventListener?.('messageerror', onError);
      try {
        const eng = await Promise.race([
          CreateWebWorkerMLCEngine(w, modelId, { initProgressCallback: r => onProgress?.(r.progress, r.text) }),
          failed
        ]);
        // 예열: 첫 응답의 셰이더 컴파일 지연을 미리 치른다. 실패는 무시.
        await Promise.race([
          eng.chat.completions.create({
            messages: [{ role: 'user', content: '안녕' }], stream: false, max_tokens: 8
          }).catch(() => {}),
          failed
        ]);
        engine = eng;
        llm.ready = true;
      } catch (e) {
        if (worker === w) teardown(); // dispose()가 이미 정리했으면 worker는 다른 값
        throw e;
      } finally {
        failLoad = null;
        w.removeEventListener?.('error', onError);
        w.removeEventListener?.('messageerror', onError);
      }
    },

    // 앞 요청이 끝난(성공·실패·취소) 뒤에 다음 요청을 시작한다.
    chat(args) {
      const run = queue.then(() => runChat(args));
      queue = run.catch(() => {});
      return run;
    },

    // 로드 대기 중이면 실패시키고, 워커를 종료한다. 이후 load()는 새로 시작한다.
    dispose() {
      generation++;
      failLoad?.(new Error('webllm disposed'));
      teardown();
    }
  };
  return llm;
}
