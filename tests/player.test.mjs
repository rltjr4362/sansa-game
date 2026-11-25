import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPlayerInput, findInteraction, moveActor, movementForKeys } from '../src/player.js';
import { Temple } from '../src/world.js';

const actorAt = (x, y) => ({ x, y, face: 0, step: 0 });

test('한 프레임에 벽 너머를 목표로 해도 대웅전 벽을 통과하지 않는다', () => {
  const player = actorAt(8.5, 9.5);
  moveActor(player, 0, -3);
  assert.equal(Math.floor(player.y), 9);
});

test('큰 이동량으로도 연못 맞은편까지 한 번에 건너지 못한다', () => {
  const player = actorAt(15.5, 9.5);
  moveActor(player, 8, 0);
  assert.equal(Math.floor(player.x), 15);
});

test('두 막힌 타일 사이의 대각선 모서리를 통과하지 않는다', () => {
  const player = actorAt(20.5, 15.5);
  moveActor(player, 1, 1);
  assert.deepEqual([Math.floor(player.x), Math.floor(player.y)], [20, 15]);
});

test('대웅전 문턱의 열린 타일을 지나 내부로 들어간다', () => {
  const player = actorAt(10.5, 9.5);
  moveActor(player, 0, -2);
  assert.equal(player.y, 7.5);
});

test('벽을 향하는 축이 막혀도 다른 축으로 벽을 따라 움직인다', () => {
  const player = actorAt(8.5, 9.2);
  moveActor(player, .75, -.75);
  assert.equal(player.x, 9.25);
  assert.equal(Math.floor(player.y), 9);
});

test('화면 오른쪽 입력을 카메라 각도의 역변환으로 이동한다', () => {
  const [dx, dy] = movementForKeys(new Set(['d', 'ArrowRight']), Math.PI / 2, 1);
  assert.ok(Math.abs(dx) < 1e-12);
  assert.ok(Math.abs(dy + 2.2) < 1e-12);
});

test('Shift를 누르면 달리기 배율 1.6이 곱해진다', () => {
  const [, dy] = movementForKeys(new Set(['d']), Math.PI / 2, 1, true);
  assert.ok(Math.abs(dy + 2.2 * 1.6) < 1e-12);
});

function targetAt(actor, monk, enabled = [], animals = {}, farm = []) {
  return findInteraction(actor, { ...monk, animals, farm }, new Set(enabled))?.target ?? null;
}

test('스님과 거리 3·경로 5까지 말을 걸 수 있다', () => {
  assert.equal(targetAt(actorAt(10.5, 10.5), actorAt(10.5, 7.5)), 'monk');
  assert.equal(targetAt(actorAt(10.5, 11.5), actorAt(10.5, 7.5)), null);
});

test('거리 2타일 이내여도 벽으로 우회 경로가 긴 스님은 제외한다', () => {
  assert.equal(targetAt(actorAt(8.5, 9.5), actorAt(8.5, 7.5)), null);
  assert.equal(targetAt(actorAt(10.5, 9.5), actorAt(10.5, 7.5)), 'monk');
});

test('켜진 우물의 네 방향 인접 타일에서만 물 긷기를 선택한다', () => {
  const monk = actorAt(11.5, 16.5);
  assert.equal(targetAt(actorAt(28.5, 10.5), monk), null);
  assert.equal(targetAt(actorAt(28.5, 10.5), monk, ['well']), 'well');
  assert.equal(targetAt(actorAt(28.5, 8.5), monk, ['well']), 'well');
  assert.equal(targetAt(actorAt(27.5, 10.5), monk, ['well']), null);
});

test('우물과 스님 모두에게 접근할 수 있으면 더 가까운 쪽을 선택한다', () => {
  const player = actorAt(28.5, 10.5);
  assert.equal(targetAt(player, actorAt(28.8, 10.5), ['well']), 'monk');
  assert.equal(targetAt(player, actorAt(30.1, 10.5), ['well']), 'well');
});

test('동물 대상은 거리 2 이내이며 벽을 돌아 4타일 안에 닿아야 한다', () => {
  const monk = actorAt(11.5, 16.5);
  const dog = actorAt(8.5, 7.5), white = actorAt(10.5, 7.5), cat = actorAt(12.5, 10.5);
  assert.equal(targetAt(actorAt(8.5, 9.5), monk, [], { dog }), null);
  assert.equal(targetAt(actorAt(9.5, 9.5), monk, [], { white }), null);
  assert.equal(targetAt(actorAt(10.5, 9.5), monk, [], { dog, white }), 'white');
  assert.equal(targetAt(actorAt(9.5, 9.5), monk, [], { dog: actorAt(9.5, 7.5) }), 'dog');
  assert.equal(targetAt(actorAt(10.5, 10.5), monk, [], { cat }), 'cat');
  assert.equal(targetAt(actorAt(10.49, 10.5), monk, [], { cat }), null);
});

test('동물 빙의 중 자신을 제외하고 스님에게 말을 걸 수 있다', () => {
  const dog = actorAt(10.5, 12.5);
  const sim = Temple.create();
  Object.assign(sim, { x: 11.5, y: 12.5 });
  sim.animals.dog = dog;
  assert.equal(findInteraction(dog, sim)?.target, 'monk');
  assert.equal(findInteraction(sim, sim), null);
});

test('밭은 익은 접근 타일에서, 공양간은 외부 문 앞에서만 표시한다', () => {
  const monk = actorAt(11.5, 16.5);
  const farm = [{ stage: 'dry' }, { stage: 'ripe' }, { stage: 'soil' }];
  assert.equal(targetAt(actorAt(33.5, 15.5), monk, [], {}, farm), null);
  assert.equal(targetAt(actorAt(28.5, 15.5), monk, ['field'], {}, farm), null);
  assert.equal(targetAt(actorAt(33.5, 15.5), monk, ['field'], {}, farm), 'field');
  assert.equal(targetAt(actorAt(32.5, 15.5), monk, ['field'], {}, farm), null);
  assert.equal(targetAt(actorAt(21.5, 28.5), monk), null);
  assert.equal(targetAt(actorAt(21.5, 28.5), monk, ['kitchen']), 'kitchen');
  assert.equal(targetAt(actorAt(21.5, 27.5), monk, ['kitchen']), null);
});

test('개는 초당 2.6타일, 고양이는 2.4타일 이동하고 달리기 배율을 공유한다', () => {
  const keys = new Set(['d']);
  for (const who of ['dog', 'white']) {
    assert.deepEqual(movementForKeys(keys, 0, 1, false, who), [2.6, 0]);
  }
  assert.deepEqual(movementForKeys(keys, 0, 1, false, 'cat'), [2.4, 0]);
  assert.deepEqual(movementForKeys(keys, 0, 1, true, 'cat'), [2.4 * 1.6, 0]);
});

test('버튼에 포커스가 있으면 Q/Space를 플레이가 가로채지 않고, 포커스 이동 후에는 이동이 멈춘다', t => {
  const window = new EventTarget(), document = new EventTarget();
  Object.assign(globalThis, { window, document });
  t.after(() => { delete globalThis.window; delete globalThis.document; });
  const world = {}, button = {};
  const actions = [];
  const input = bindPlayerInput({
    enabled: () => true,
    hasWorldFocus: target => target === world,
    onInteract: () => actions.push('interact'),
    onPossess: () => actions.push('possess'),
    onJournal: () => actions.push('journal')
  });
  function key(target, code, key, repeat = false) {
    const event = new Event('keydown', { cancelable: true });
    Object.assign(event, { code, key, repeat });
    Object.defineProperty(event, 'target', { value: target });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }
  assert.equal(key(button, 'KeyQ', 'q'), false);
  assert.equal(key(button, 'Space', ' '), false);
  assert.deepEqual(actions, []);
  assert.equal(key(world, 'KeyQ', 'q'), true);
  key(world, 'KeyQ', 'q', true);
  key(world, 'Space', ' ');
  key(world, 'KeyJ', 'J');
  assert.deepEqual(actions, ['possess', 'interact', 'journal']);
  key(world, 'KeyD', 'd');
  const actor = actorAt(10.5, 12.5);
  window.dispatchEvent(new Event('focusin'));
  input.move(actor, 0, .2);
  assert.equal(actor.x, 10.5);
});
