// 기기 능력 → 쓸 수 있는 모델. 순수 함수라 Node에서 테스트한다.
export const GEMMA_ID = 'gemma-4-E2B-it-q4f16_1-MLC';
export const QWEN_ID = 'Qwen3.5-2B-q4f16_1-MLC';
const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

const NO_GPU = '이 브라우저는 AI를 쓸 수 없어요';
const NO_F16 = '이 기기의 그래픽은 AI에 필요한 기능이 없어요';
const HEAVY = '이 기기의 그래픽 메모리로는 무거워요';
const LAPTOP = '이 노트북 그래픽에는 무거워요';

/**
 * @param {{webgpu?: boolean, f16?: boolean, maxBuffer?: number, maxStorage?: number, weakGpu?: boolean}} probe
 * @returns {{models: Array<{id: string, ok: boolean, reason: string}>, recommended: string|null}}
 */
export function chooseModels(probe = {}) {
  const { webgpu, f16, maxBuffer = 0, maxStorage = 0, weakGpu } = probe;
  const base = !webgpu ? NO_GPU : !f16 ? NO_F16 : '';
  const qwen = base || (maxStorage < 128 * MiB ? HEAVY : '');
  const gemma = base || (weakGpu ? LAPTOP : (maxStorage < 256 * MiB || maxBuffer < GiB ? HEAVY : ''));
  const models = [
    { id: QWEN_ID, ok: !qwen, reason: qwen },
    { id: GEMMA_ID, ok: !gemma, reason: gemma }
  ];
  return { models, recommended: qwen ? null : QWEN_ID };
}
