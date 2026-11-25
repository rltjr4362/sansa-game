// Codex 리뷰(plan4b) 반영: 빙의 중 행동 차단, 동물 상대 대사, 대상 동기화, 선택 유효성, 제안문, deliver 장소.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { createMemory } from '../src/memory.js';
import { createErrands } from '../src/errands.js';
import { ERRANDS, MOCK, animalPartnerOptions, monkToAnimalLine, templateOptions } from '../src/lines.js';
import { flush, fakeStorage, fakePlay, manualRouter } from './helpers/fake-play.mjs';

const NOON = new Date(2026, 10, 25, 12).getTime();
function setup(deps = {}) {
  const play = fakePlay();
  const memory = createMemory(fakeStorage(), () => NOON);
  const errands = createErrands(memory);
  const game = createGame(play, { memory, errands, modelStorage: fakeStorage(), ...deps });
  return { play, memory, errands, game, d: play.dialogue, monk: play.monk };
}
const llmRouter = () => ({ ...manualRouter(), active: () => 'llm' });
const llmReply = (say, action = 'none', options = ['가', '나', '다']) =>
  ({ raw: '', reply: { say, action, place: null, options }, source: 'llm' });
const isMonkToAnimal = (npc, text) => [0, 1, 2, 3, 4, 5].some(i => monkToAnimalLine(npc, i) === text);

// Important 2
test('동물이 스님에게 follow/stop_follow: 실행하지 않고 none, 대사는 동물에게 하는 말', async () => {
  for (const action of ['follow', 'stop_follow']) {
    const router = llmRouter();
    const { play, d, monk } = setup({ router });
    monk.following = action === 'stop_follow';
    play.fire.possess('dog');
    play.fire.interact('monk');
    d.submit('따라와');
    router.calls[0].resolve(llmReply('그러지요.', action));
    await flush();
    assert.deepEqual(monk.calls.follow, [], action);
    assert.equal(monk.calls.stopFollow, 0, action);
    assert.ok(isMonkToAnimal('dog', d.npcText), action);
  }
});

test('방문객의 follow는 그대로 실행된다', async () => {
  const router = llmRouter();
  const { play, d, monk } = setup({ router });
  play.fire.interact('monk');
  d.submit('따라와');
  router.calls[0].resolve(llmReply('그러지요.', 'follow'));
  await flush();
  assert.equal(monk.calls.follow.length, 1);
  assert.equal(d.npcText, '그러지요.');
});

// Important 3
test('황구 + 대본 스님: 부탁 문구·부탁 추천 없이 동물용 대사와 추천', async () => {
  for (const text of ['따라와', '도울 일 있을까요?', '연못 보러 가요', '그만 따라와']) {
    const { play, d, errands, monk } = setup();
    play.fire.possess('dog');
    play.fire.interact('monk');
    d.submit(text);
    await flush();
    assert.equal(errands.state(), 'none', text);
    assert.deepEqual(monk.calls.follow, [], text);
    assert.ok(isMonkToAnimal('dog', d.npcText), text);
    assert.ok(![MOCK.errand, MOCK.follow, MOCK.stopFollow].includes(d.npcText), text);
    assert.deepEqual(d.options, animalPartnerOptions('dog'), text);
    assert.ok(!d.options.includes('도울 일 있을까요?'), text);
  }
});

test('동물 상대 LLM의 차단된 offer_errand도 대사를 바꾼다', async () => {
  const router = llmRouter();
  const { play, d } = setup({ router });
  play.fire.possess('white');
  play.fire.interact('monk');
  d.submit('도울 일?');
  router.calls[0].resolve(llmReply('부탁이 있어요.', 'offer_errand'));
  await flush();
  assert.ok(isMonkToAnimal('white', d.npcText));
});

// Important 4
test('대상: 동물 빙의 중에는 꺼지고, 방문객으로 돌아오면 현재 단계 대상이 복원된다', () => {
  const { play, errands, game } = setup();
  errands.offer(); errands.accept();
  play.fire.interact('monk'); // 동기화 계기
  assert.equal(play.targets.well, true);
  play.fire.possess('dog');
  assert.deepEqual(play.targets, { well: false, field: false, kitchen: false });
  play.fire.interact('well');
  assert.equal(errands.state(), 'accepted');
  play.fire.possess('visitor');
  assert.deepEqual(play.targets, { well: true, field: false, kitchen: false });
  game.dispose();
});

test('대상: 처음부터 동물이어도 수락 상태 대상은 꺼져 있고, 채소 전달 대상도 마찬가지', () => {
  const { play, errands } = setup();
  errands.offer('veg'); errands.accept();
  play.fire.possess('cat');
  assert.deepEqual(play.targets, { well: false, field: false, kitchen: false });
  play.fire.possess('visitor');
  assert.equal(play.targets.field, true);
  play.fire.interact('field');
  assert.equal(play.targets.kitchen, true);
  play.fire.possess('monk');
  assert.equal(play.targets.kitchen, false);
});

test('dispose()는 켜 둔 대상을 모두 끈다', () => {
  const { play, errands, game } = setup();
  errands.offer(); errands.accept();
  play.fire.interact('monk');
  assert.equal(play.targets.well, true);
  game.dispose();
  assert.deepEqual(play.targets, { well: false, field: false, kitchen: false });
});

// Important 5
test('choose: 스님과 멀어진 뒤의 수락은 무시하고 선택지를 지운다', async () => {
  const { play, d, errands } = setup();
  play.fire.interact('monk');
  d.submit('도울 일 있을까요?');
  await flush();
  assert.equal(errands.state(), 'offered');
  play.tileAt = [10, 18]; // 거리 6
  d.choose('accept');
  assert.equal(errands.state(), 'offered');
  assert.equal(play.targets.well, false);
  assert.deepEqual(d.choices, []);
});

test('choose: 창이 닫혔거나 방문객이 아니면 무시', async () => {
  const { play, d, errands } = setup();
  errands.offer();
  d.choose('accept'); // 대화 없음
  assert.equal(errands.state(), 'offered');
  play.fire.interact('monk');
  d.choose('decline'); // 열린 대화에서는 동작
  assert.equal(errands.state(), 'none');
  errands.offer();
  play.fire.possess('dog');
  play.fire.interact('monk');
  d.choose('accept');
  assert.equal(errands.state(), 'offered');
});

test('choose: 동물 대화창에서는 부탁 선택이 동작하지 않는다', () => {
  const { play, d, errands } = setup();
  errands.offer();
  play.fire.interact('dog');
  d.choose('accept');
  assert.equal(errands.state(), 'offered');
});

// Important 6
test('수락된 제안문은 실제 부탁 종류의 문구 하나만 보여 준다', async () => {
  const router = llmRouter();
  const { play, d, errands } = setup({ router });
  errands.offer(); errands.decline(); // 다음은 채소
  play.fire.interact('monk');
  d.submit('도울 일?');
  router.calls[0].resolve(llmReply('우물에서 물을 길어다 주세요.', 'offer_errand'));
  await flush();
  assert.equal(errands.kind(), 'veg');
  assert.equal(d.npcText, ERRANDS.veg.offer);
  assert.ok(!d.npcText.includes('우물'));
});

// Minor
test('errands.deliver: 장소 없음·틀린 장소는 거절하고 보상도 없다', () => {
  const calls = [];
  const e = createErrands({ recordErrand: (...a) => calls.push(a) });
  e.offer('water'); e.accept(); e.atWell();
  assert.equal(e.deliver(), false);
  assert.equal(e.deliver('kitchen'), false);
  assert.equal(e.state(), 'carrying');
  assert.equal(e.deliver('monk'), true);
  e.offer('veg'); e.accept(); e.atField();
  assert.equal(e.deliver(), false);
  assert.equal(e.deliver('monk'), false);
  assert.equal(e.state(), 'carrying');
  assert.equal(e.deliver('kitchen'), true);
  assert.equal(calls.filter(c => c[1] === 'done').length, 2);
});
