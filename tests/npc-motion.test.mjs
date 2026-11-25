import test from 'node:test';
import assert from 'node:assert/strict';
import { createControl } from '../src/control.js';
import { Temple } from '../src/world.js';

const step = 1 / 30;

test('빙의 중에도 동물과 시계가 움직이고, 해제하면 스님이 일과로 돌아가 걷는다', () => {
  const sim = Temple.create();
  const visitor = { x: 11.5, y: 15.5, face: -Math.PI / 2, step: 0 };
  const control = createControl(sim, visitor);
  const { dog, white, cat } = sim.animals;
  for (let i = 0; i < 30; i++) control.tick(step);

  control.togglePossession();
  const before = { dog: [dog.x, dog.y], white: [white.x, white.y], cat: [cat.x, cat.y], clock: sim.clock };
  const moved = { dog: false, white: false, cat: false };
  for (let i = 0; i < 30 * 30; i++) {
    control.tick(step);
    for (const [name, a] of Object.entries({ dog, white, cat })) {
      if (a.x !== before[name][0] || a.y !== before[name][1]) moved[name] = true;
    }
  }
  assert.deepEqual(moved, { dog: true, white: true, cat: true });
  assert.ok(sim.clock > before.clock);

  control.togglePossession();
  const start = [sim.x, sim.y];
  let walked = false;
  for (let i = 0; i < 20 * 30 && !walked; i++) {
    control.tick(step);
    walked = sim.x !== start[0] || sim.y !== start[1];
  }
  assert.ok(walked, '해제 후 20초 안에 스님이 움직여야 한다');
});
