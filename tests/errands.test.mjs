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
  assert.equal(e.deliver(), true);
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
  assert.equal(e.deliver(), false);
  assert.equal(e.state(), 'none');
  e.offer();
  assert.equal(e.offer(), false);
  assert.equal(e.atWell(), false);
  assert.equal(e.deliver(), false);
  assert.equal(e.state(), 'offered');
  e.accept();
  assert.equal(e.accept(), false);
  assert.equal(e.decline(), false);
  assert.equal(e.deliver(), false);
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
  assert.equal(e.deliver(), true);
  assert.equal(e.deliver(), false);
  assert.equal(mem.calls.filter(c => c[1] === 'done').length, 1);
});

test('done 후 다시 offer할 수 있다', () => {
  const e = createErrands(fakeMemory());
  e.offer(); e.accept(); e.atWell(); e.deliver();
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
