import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../src/actions.js';

function fakeMonk(over = {}) {
  const calls = [];
  const m = {
    calls, _following: false,
    possessed: () => false, busy: () => false, tile: () => [0, 0],
    snapshotBase: () => ({ following: m._following }),
    follow: s => { calls.push(['follow', s]); m._following = true; return true; },
    stopFollow: () => { calls.push(['stopFollow']); m._following = false; },
    goTo: p => { calls.push(['goTo', p]); return true; },
    say: () => {},
    ...over
  };
  return m;
}
const errands = (ok = true) => ({ offer: () => ok });
const req = (action, place = null) => ({ requestId: 1, npc: 'monk', action, place });

test('none', () => {
  assert.deepEqual(applyAction(fakeMonk(), req('none'), { errands: errands() }), { executed: 'none' });
});

test('follow: 기본 60초, followSeconds 지정 가능, 이미 따라가는 중이면 none', () => {
  const m = fakeMonk();
  assert.equal(applyAction(m, req('follow'), { errands: errands() }).executed, 'follow');
  assert.deepEqual(m.calls[0], ['follow', 60]);
  const m2 = fakeMonk();
  applyAction(m2, req('follow'), { errands: errands(), followSeconds: 30 });
  assert.deepEqual(m2.calls[0], ['follow', 30]);
  const m3 = fakeMonk({ snapshotBase: () => ({ following: true }) });
  const r = applyAction(m3, req('follow'), { errands: errands() });
  assert.equal(r.executed, 'none');
  assert.ok(r.reason);
  assert.equal(m3.calls.length, 0);
});

test('follow: monk.follow가 false면 none', () => {
  const m = fakeMonk({ follow: () => false });
  assert.equal(applyAction(m, req('follow'), { errands: errands() }).executed, 'none');
});

test('stop_follow: following일 때만', () => {
  const m = fakeMonk({ snapshotBase: () => ({ following: true }) });
  assert.equal(applyAction(m, req('stop_follow'), { errands: errands() }).executed, 'stop_follow');
  assert.deepEqual(m.calls, [['stopFollow']]);
  const r = applyAction(fakeMonk(), req('stop_follow'), { errands: errands() });
  assert.equal(r.executed, 'none');
  assert.ok(r.reason);
});

test('go_to: 성공, 실패 강등', () => {
  const m = fakeMonk();
  assert.equal(applyAction(m, req('go_to', '우물'), { errands: errands() }).executed, 'go_to');
  assert.deepEqual(m.calls, [['goTo', '우물']]);
  const r = applyAction(fakeMonk({ goTo: () => false }), req('go_to', '우물'), { errands: errands() });
  assert.equal(r.executed, 'none');
  assert.ok(r.reason);
});

test('offer_errand: errands.offer 성공/실패', () => {
  assert.equal(applyAction(fakeMonk(), req('offer_errand'), { errands: errands(true) }).executed, 'offer_errand');
  const r = applyAction(fakeMonk(), req('offer_errand'), { errands: errands(false) });
  assert.equal(r.executed, 'none');
  assert.ok(r.reason);
});

test('빙의·공동 활동 중이면 모든 행동이 none', () => {
  for (const over of [{ possessed: () => true }, { busy: () => true }]) {
    for (const a of ['follow', 'stop_follow', 'offer_errand']) {
      const m = fakeMonk({ ...over, snapshotBase: () => ({ following: true }) });
      const r = applyAction(m, req(a), { errands: errands() });
      assert.equal(r.executed, 'none');
      assert.ok(r.reason);
      assert.equal(m.calls.length, 0);
    }
    assert.equal(applyAction(fakeMonk(over), req('go_to', '산문'), { errands: errands() }).executed, 'none');
  }
});

test('monk 메서드가 던져도 none', () => {
  const boom = () => { throw new Error('boom'); };
  for (const [a, place] of [['follow'], ['stop_follow'], ['go_to', '우물']]) {
    const m = fakeMonk({ possessed: boom });
    const r = applyAction(m, req(a, place ?? null), { errands: errands() });
    assert.equal(r.executed, 'none');
  }
  const m = fakeMonk({ goTo: boom });
  assert.equal(applyAction(m, req('go_to', '우물'), { errands: errands() }).executed, 'none');
  assert.equal(applyAction(fakeMonk(), req('offer_errand'), { errands: { offer: boom } }).executed, 'none');
});
