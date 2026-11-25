import test from 'node:test';
import assert from 'node:assert/strict';
import { createControl } from '../src/control.js';
import { Temple } from '../src/world.js';

const step = 1 / 30;

function setup() {
  const sim = Temple.create();
  const visitor = { x: 11.5, y: 15.5, face: -Math.PI / 2, step: 0 };
  const control = createControl(sim, visitor);
  return { sim, visitor, control, monk: control.monk };
}

function until(control, condition, seconds) {
  for (let i = 0; i < seconds * 30 && !condition(); i++) control.tick(step);
  assert.ok(condition(), '시뮬레이션 시간 안에 조건을 만족해야 한다');
}

function advance(control, seconds) {
  for (let i = 0; i < seconds * 30; i++) control.tick(step);
}

test('스님·황구 만남 중 빙의해도 황구와 세계는 계속 움직이고 해제하면 일과를 마친다', () => {
  const { sim, visitor, control, monk } = setup();
  until(control, () => monk.busy() && sim.meeting, 30);
  const { dog } = sim.animals;
  const start = { x: dog.x, y: dog.y, clock: sim.clock, completed: sim.completed };
  const parked = [visitor.x, visitor.y];
  control.togglePossession();
  assert.equal(monk.possessed(), true);
  assert.equal(monk.busy(), false);
  assert.deepEqual(sim.path, []);

  Object.assign(control.actor(), { x: 6.5, y: 15.5, face: 0 });
  advance(control, 30);
  assert.deepEqual([sim.x, sim.y, sim.face], [6.5, 15.5, 0]);
  assert.deepEqual([visitor.x, visitor.y], parked);
  assert.equal(sim.completed, start.completed);
  assert.ok(sim.clock > start.clock);
  assert.notEqual(sim.retreat.stage, 'empty');
  assert.ok(Math.hypot(dog.x - start.x, dog.y - start.y) > 1);

  control.togglePossession();
  assert.equal(monk.possessed(), false);
  assert.equal(control.actor(), visitor);
  until(control, () => sim.completed > start.completed, 60);
  assert.deepEqual(monk.tile(), [11, 16]);
});

test('빙의 해제 후 새 위치에서 원래 밭으로 가기 전에는 수확하지 않는다', () => {
  const { sim, control, monk } = setup();
  until(control, () => sim.id === 11 && sim.phase === 'act', 120);
  const harvests = sim.harvests;
  control.togglePossession();
  Object.assign(control.actor(), { x: 10.2, y: 9.1 });
  advance(control, 10);
  assert.equal(sim.harvests, harvests);
  control.togglePossession();
  assert.deepEqual(monk.tile(), [10, 9]);
  assert.equal(sim.phase, 'walk');
  advance(control, 3);
  assert.equal(sim.harvests, harvests);
  until(control, () => sim.harvests > harvests, 90);
  assert.deepEqual(monk.tile(), [38, 15]);
});

test('보관한 접근 타일을 향한 길이 없으면 원본 스케줄러가 새 일과를 고른다', t => {
  const { sim, control, monk } = setup();
  const targets = Temple.visits[0][3];
  const original = targets[0];
  t.after(() => { targets[0] = original; });

  control.togglePossession();
  targets[0] = [17, 7]; // 연못으로 둘러싸여 산문에서 닿을 수 없는 타일
  control.togglePossession();
  until(control, () => sim.completed === 1, 60);
  assert.equal(sim.id, 1);
  assert.deepEqual(monk.tile(), [10, 7]);
});

test('완료 뒤 쉬는 중에 빙의했다가 해제해도 같은 수확을 되풀이하지 않는다', () => {
  const { sim, control } = setup();
  until(control, () => sim.id === 11 && sim.phase === 'pause', 130);
  const { completed, harvests } = sim;
  control.togglePossession();
  control.togglePossession();
  until(control, () => sim.completed > completed, 60);
  assert.notEqual(sim.id, 11);
  assert.equal(sim.harvests, harvests);
});

test('빙의할 때 스님의 인사와 황구 교감, 합동 놀이를 정리한다', () => {
  const { sim, control, monk } = setup();
  assert.equal(sim.interact('greet', 0), true);
  assert.equal(sim.touchDog('pet', 0), true);
  Object.assign(sim.animals.group, { kind: 'chase', pair: true });
  control.togglePossession();
  assert.equal(monk.busy(), false);
  assert.equal(sim.animals.dog.visitor, null);
  assert.equal(sim.animals.group.pair, false);
});

test('60초 동안 방문객 뒤를 따라가고 시간이 지나면 일과를 재개한다', () => {
  const { sim, visitor, control, monk } = setup();
  assert.equal(monk.follow(60), true);
  advance(control, 4);
  assert.equal(monk.tile()[0], 11);
  assert.ok(sim.y - visitor.y >= 1 && sim.y - visitor.y <= 2);
  visitor.y = 12.5;
  advance(control, 55);
  assert.ok(sim.y - visitor.y >= 1 && sim.y - visitor.y <= 2);
  assert.equal(monk.snapshotBase().activity, '방문객을 따라가는 중');
  assert.equal(sim.completed, 0);
  advance(control, 2);
  assert.equal(monk.snapshotBase().following, false);
  until(control, () => sim.completed === 1, 30);
  assert.deepEqual(monk.tile(), [11, 16]);
});

test('따라가기를 중단하거나 빙의하면 따라가기 명령이 끝난다', () => {
  const { sim, control, monk } = setup();
  assert.equal(monk.follow(60), true);
  advance(control, 1);
  monk.stopFollow();
  assert.equal(monk.snapshotBase().following, false);
  assert.equal(sim.phase, 'walk');
  assert.equal(monk.follow(60), true);
  control.togglePossession();
  assert.equal(monk.snapshotBase().following, false);
  control.togglePossession();
  until(control, () => sim.completed === 1, 30);
});

test('장소 이동은 도착한 뒤 원래 목적지로 재탐색한다', () => {
  const { sim, control, monk } = setup();
  assert.equal(monk.goTo('우물'), true);
  until(control, () => sim.x === 28.5 && sim.y === 10.5, 60);
  assert.equal(sim.completed, 0);
  until(control, () => sim.completed === 1, 60);
  assert.deepEqual(monk.tile(), [11, 16]);
});

test('잘못된 장소나 닿을 수 없는 장소의 이동 명령은 거절한다', () => {
  const { sim, monk } = setup();
  assert.equal(monk.goTo('없는 곳'), false);
  assert.equal(monk.goTo('toString'), false);
  Object.assign(sim, { x: 17.5, y: 7.5 });
  assert.equal(monk.goTo('우물'), false);
});

test('빙의 중에는 따라가기와 장소 이동 명령을 거절한다', () => {
  const { control, monk } = setup();
  control.togglePossession();
  assert.equal(monk.follow(60), false);
  assert.equal(monk.goTo('우물'), false);
});

test('스냅샷의 장소는 명령의 목적지 대신 현재 타일로 판정한다', () => {
  const { sim, control, monk } = setup();
  assert.equal(monk.snapshotBase().place, null);
  assert.equal(monk.goTo('우물'), true);
  assert.equal(monk.snapshotBase().activity, '걷는 중');
  assert.equal(monk.snapshotBase().place, null);
  until(control, () => sim.x === 28.5 && sim.y === 10.5, 60);
  assert.equal(monk.snapshotBase().place, '우물');
});

// ── hold ──────────────────────────────────────────────────

function walking() {
  const s = setup();
  until(s.control, () => s.sim.phase === 'walk', 30);
  return s;
}

test('hold: 시간 동안 제자리에 서서 방문객을 보고, 끝나면 일과를 재개한다', () => {
  const { sim, visitor, control, monk } = walking();
  visitor.x = sim.x + 2; visitor.y = sim.y;
  const pos = [sim.x, sim.y];
  monk.hold(5);
  advance(control, 3);
  assert.deepEqual([sim.x, sim.y], pos);
  assert.equal(sim.walking, false);
  assert.ok(Math.abs(Temple.turn(sim.face, 0)) < .05);
  advance(control, 3);
  until(control, () => sim.x !== pos[0] || sim.y !== pos[1], 20);
});

test('hold: 다시 부르면 until이 연장되고 짧은 호출이 줄이지 않는다', () => {
  const { sim, control, monk } = walking();
  const pos = [sim.x, sim.y];
  monk.hold(4);
  advance(control, 3);
  monk.hold(4);
  monk.hold(1);
  advance(control, 3);
  assert.deepEqual([sim.x, sim.y], pos);
  advance(control, 2);
  until(control, () => sim.x !== pos[0] || sim.y !== pos[1], 20);
});

test('hold: 빙의하면 취소되고, 빙의 중 hold는 무시된다', () => {
  const { sim, control, monk } = walking();
  monk.hold(60);
  control.togglePossession();
  control.togglePossession();
  const pos = [sim.x, sim.y];
  until(control, () => sim.x !== pos[0] || sim.y !== pos[1], 20);

  control.togglePossession();
  monk.hold(60);
  control.togglePossession();
  const pos2 = [sim.x, sim.y];
  until(control, () => sim.x !== pos2[0] || sim.y !== pos2[1], 20);
});

test('hold: follow가 대체하고 stopFollow는 hold에 영향이 없다', () => {
  const { sim, control, monk } = walking();
  const pos = [sim.x, sim.y];
  monk.hold(60);
  monk.stopFollow();
  advance(control, 3);
  assert.deepEqual([sim.x, sim.y], pos);
  assert.equal(monk.follow(60), true);
  assert.equal(monk.snapshotBase().following, true);
  monk.stopFollow();
  assert.equal(monk.snapshotBase().following, false);
  until(control, () => sim.completed >= 1, 90);
});
