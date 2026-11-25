import fs from 'node:fs';
import vm from 'node:vm';

export const ORIGINAL = new URL('../../docs/review/original.html', import.meta.url);
export const BASELINE = new URL('../baseline/temple-720s.json', import.meta.url);

export function loadOriginalTemple() {
  const html = fs.readFileSync(ORIGINAL, 'utf8');
  const code = html.match(/<script id="model">([\s\S]*?)<\/script>/)[1];
  return vm.runInNewContext(code + '\n;Temple', {});
}

export function traceTemple(T, seconds = 720, step = 1 / 30) {
  const s = T.create();
  const visits = [];
  let last = -1;
  const n = Math.round(seconds / step);
  for (let i = 0; i < n; i++) {
    s.tick(step);
    if (s.id !== last) { visits.push(s.id); last = s.id; }
  }
  return {
    visits,
    completed: s.completed,
    harvests: s.harvests,
    stays: s.retreat.stays,
    farm: Array.from(s.farm, b => b.stage),
    clock: Math.round(s.clock),
    monk: [Number(s.x.toFixed(3)), Number(s.y.toFixed(3))],
    dog: [Number(s.animals.dog.x.toFixed(3)), Number(s.animals.dog.y.toFixed(3))]
  };
}

export function readBaseline() {
  return JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
}
