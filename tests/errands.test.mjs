import test from 'node:test';
import assert from 'node:assert/strict';
import { createErrands } from '../src/errands.js';

function fakeMemory() {
  const calls = [];
  return { calls, recordErrand: (npc, kind) => calls.push([npc, kind]) };
}

test('정상 흐름: none → offered → accepted → carrying → done', () => {
  const mem = fakeMemory();
  const e = createErrands(mem);
  assert.equal(e.state(), 'none');
  assert.equal(e.snapshot(), null);
  assert.equal(e.offer(), true);
  assert.equal(e.state(), 'offered');
  assert.equal(e.accept(), true);
  assert.equal(e.state(), 'accepted');
  assert.equal(e.atWell(), true);
  assert.equal(e.state(), 'carrying');
  assert.equal(e.deliver('monk'), true);
  assert.equal(e.state(), 'done');
  assert.equal(e.snapshot(), null);
  assert.deepEqual(mem.calls, [['monk', 'offered'], ['monk', 'accepted'], ['monk', 'done']]);
});

test('거절하면 none으로 돌아가고 다시 offer 가능', () => {
  const e = createErrands(fakeMemory());
  e.offer();
  assert.equal(e.decline(), true);
  assert.equal(e.state(), 'none');
  assert.equal(e.offer(), true);
});

test('순서 위반은 false이고 상태·기록이 변하지 않는다', () => {
  const mem = fakeMemory();
  const e = createErrands(mem);
  assert.equal(e.accept(), false);
  assert.equal(e.decline(), false);
  assert.equal(e.atWell(), false);
  assert.equal(e.deliver('monk'), false);
  assert.equal(e.state(), 'none');
  e.offer();
  assert.equal(e.offer(), false);
  assert.equal(e.atWell(), false);
  assert.equal(e.deliver('monk'), false);
  assert.equal(e.state(), 'offered');
  e.accept();
  assert.equal(e.accept(), false);
  assert.equal(e.decline(), false);
  assert.equal(e.deliver('monk'), false);
  assert.equal(e.offer(), false);
  assert.equal(e.state(), 'accepted');
  e.atWell();
  assert.equal(e.atWell(), false);
  assert.equal(e.offer(), false);
  assert.equal(e.state(), 'carrying');
  assert.deepEqual(mem.calls, [['monk', 'offered'], ['monk', 'accepted']]);
});

test('deliver를 두 번 불러도 보상은 1회', () => {
  const mem = fakeMemory();
  const e = createErrands(mem);
  e.offer(); e.accept(); e.atWell();
  assert.equal(e.deliver('monk'), true);
  assert.equal(e.deliver('monk'), false);
  assert.equal(mem.calls.filter(c => c[1] === 'done').length, 1);
});

test('done 후 다시 offer할 수 있다', () => {
  const e = createErrands(fakeMemory());
  e.offer(); e.accept(); e.atWell(); e.deliver('monk');
  assert.equal(e.offer(), true);
  assert.equal(e.state(), 'offered');
});

test('snapshot 형태', () => {
  const e = createErrands(fakeMemory());
  e.offer();
  assert.deepEqual(e.snapshot(), { id: 'water', state: 'offered' });
  e.accept();
  assert.deepEqual(e.snapshot(), { id: 'water', state: 'accepted' });
  e.atWell();
  assert.deepEqual(e.snapshot(), { id: 'water', state: 'carrying' });
});

// ── 부탁 종류: water(우물→스님), veg(들밭→공양간) ───────────────

test('offer는 종류를 물·채소 번갈아 고른다', () => {
  const e = createErrands(fakeMemory());
  assert.equal(e.kind(), null);
  assert.equal(e.nextKind(), 'water');
  e.offer(); e.accept(); e.atWell(); e.deliver('monk');
  assert.equal(e.nextKind(), 'veg');
  e.offer();
  assert.equal(e.kind(), 'veg');
  assert.deepEqual(e.snapshot(), { id: 'veg', state: 'offered' });
  e.accept(); e.atField(); e.deliver('kitchen');
  assert.equal(e.nextKind(), 'water');
  e.offer();
  assert.equal(e.kind(), 'water');
});

test('거절해도 다음 제안은 다른 종류', () => {
  const e = createErrands(fakeMemory());
  e.offer(); e.decline();
  assert.equal(e.kind(), null);
  e.offer();
  assert.equal(e.kind(), 'veg');
});

test('종류를 지정해 제안할 수 있다', () => {
  const e = createErrands(fakeMemory());
  assert.equal(e.offer('veg'), true);
  assert.equal(e.kind(), 'veg');
  const f = createErrands(fakeMemory());
  assert.equal(f.offer('모름'), false);
  assert.equal(f.state(), 'none');
});

test('채소: 들밭에서 거두고 공양간에서 전달, 보상은 스님에게 1회', () => {
  const mem = fakeMemory();
  const e = createErrands(mem);
  e.offer('veg'); e.accept();
  assert.equal(e.atWell(), false); // 우물은 물 부탁 전용
  assert.equal(e.deliver('kitchen'), false); // 아직 안 거둠
  assert.equal(e.atField(), true);
  assert.equal(e.state(), 'carrying');
  assert.equal(e.atField(), false);
  assert.equal(e.deliver('monk'), false); // 채소는 스님이 아니라 공양간
  assert.equal(e.deliver('kitchen'), true);
  assert.equal(e.deliver('kitchen'), false);
  assert.equal(mem.calls.filter(c => c[1] === 'done').length, 1);
  assert.deepEqual(mem.calls.at(-1), ['monk', 'done']);
});

test('물: 공양간에 가져가도 전달되지 않고, atField는 안 된다', () => {
  const e = createErrands(fakeMemory());
  e.offer('water'); e.accept();
  assert.equal(e.atField(), false);
  e.atWell();
  assert.equal(e.deliver('kitchen'), false);
  assert.equal(e.deliver('monk'), true);
});

test('targets: 단계별로 켜야 하는 대상', () => {
  const e = createErrands(fakeMemory());
  assert.deepEqual(e.targets(), []);
  e.offer('water');
  assert.deepEqual(e.targets(), []);
  e.accept();
  assert.deepEqual(e.targets(), ['well']);
  e.atWell();
  assert.deepEqual(e.targets(), []); // 스님은 사람 대상이라 항상 켜짐
  e.deliver('monk');
  assert.deepEqual(e.targets(), []);
  e.offer('veg'); e.accept();
  assert.deepEqual(e.targets(), ['field']);
  e.atField();
  assert.deepEqual(e.targets(), ['kitchen']);
  e.deliver('kitchen');
  assert.deepEqual(e.targets(), []);
});

test('한 번에 한 부탁: 진행 중에는 다른 종류도 제안 불가', () => {
  const e = createErrands(fakeMemory());
  e.offer('water'); e.accept();
  assert.equal(e.offer('veg'), false);
  assert.equal(e.kind(), 'water');
});
