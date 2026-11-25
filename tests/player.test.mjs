import test from 'node:test';
import assert from 'node:assert/strict';
import { findInteraction, moveActor, movementForKeys } from '../src/player.js';

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
  assert.ok(Math.abs(dy + 1.1) < 1e-12);
});

test('거리 2타일 이내여도 벽으로 우회 경로가 긴 스님은 제외한다', () => {
  assert.equal(findInteraction(actorAt(8.5, 9.5), actorAt(8.5, 7.5)), null);
  assert.equal(findInteraction(actorAt(10.5, 9.5), actorAt(10.5, 7.5)), 'monk');
});

test('우물의 네 방향 인접 타일에서만 물 긷기를 선택한다', () => {
  assert.equal(findInteraction(actorAt(28.5, 10.5), actorAt(11.5, 16.5)), 'well');
  assert.equal(findInteraction(actorAt(28.5, 8.5), actorAt(11.5, 16.5)), 'well');
  assert.equal(findInteraction(actorAt(27.5, 10.5), actorAt(11.5, 16.5)), null);
});

test('우물과 스님 모두에게 접근할 수 있으면 더 가까운 쪽을 선택한다', () => {
  const player = actorAt(28.5, 10.5);
  assert.equal(findInteraction(player, actorAt(28.8, 10.5)), 'monk');
  assert.equal(findInteraction(player, actorAt(30.1, 10.5)), 'well');
});
