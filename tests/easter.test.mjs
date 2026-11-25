import test from 'node:test';
import assert from 'node:assert/strict';
import { createEaster, nearBell } from '../src/easter.js';
import { Temple } from '../src/world.js';

test('종루 주변에서만 타종할 수 있다', () => {
  assert.equal(nearBell({ x: 17.5, y: 16.5 }), true);
  assert.equal(nearBell({ x: 15.5, y: 14.5 }), true);
  assert.equal(nearBell({ x: 14.5, y: 14.5 }), false);
});

test('꼬마 셋이 걸을 수 있는 산문 길로 들어와 25초 안에 퇴장한다', () => {
  const easter = createEaster(() => {});
  assert.deepEqual(easter.figures(4), []);
  easter.ring(5);
  assert.deepEqual(easter.figures(5).map(({ x, y }) => [x, y]), [[11.5, 20.5]]);
  assert.deepEqual(easter.figures(8).map(({ kind }) => kind), [0, 1, 2]);
  let inYard = false;
  for (let time = 5; time < 30; time += .1) {
    for (const { x, y } of easter.figures(time)) {
      assert.ok(Temple.walkable(Math.floor(x), Math.floor(y)));
      if (y < 13) inYard = true;
    }
  }
  assert.ok(inYard);
  assert.ok(easter.figures(29.9)[0].y > 20);
  assert.deepEqual(easter.figures(30.1), []);
});

test('도장을 빠르게 다섯 번 클릭하면 발동하고 타종과 60초 쿨다운을 공유한다', () => {
  let rings = 0;
  const easter = createEaster(() => rings++);
  for (let i = 0; i < 4; i++) assert.equal(easter.stamp(0, i * 150), false);
  for (let i = 0; i < 4; i++) assert.equal(easter.stamp(2, 2000 + i * 150), false);
  assert.equal(easter.stamp(2, 2600), true);
  assert.equal(easter.ring(61.9), false);
  assert.equal(easter.ring(62), true);
  assert.equal(rings, 2);
});
