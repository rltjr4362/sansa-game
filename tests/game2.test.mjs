// 2단계: 동물 대화, 빙의 대화, 부탁 종류·대상 켜기, 일지, 모델 선택. 새 Play 기준.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { createMemory } from '../src/memory.js';
import { createErrands } from '../src/errands.js';
import {
  MONK_NAME, ERRANDS, ANIMAL_STATUS, NPC_NAMES, MOCK, scriptedAnimalLine, animalOptions,
  animalPartnerOptions, monkToAnimalLine, templateOptions
} from '../src/lines.js';
import { flush, fakeStorage, fakePlay, manualRouter } from './helpers/fake-play.mjs';

const NOON = new Date(2026, 10, 25, 12).getTime();
const GEMMA = 'gemma-4-E2B-it-q4f16_1-MLC';
const QWEN = 'Qwen3.5-2B-q4f16_1-MLC';

function setup(deps = {}, playOpts = {}) {
  const play = fakePlay(playOpts);
  const memory = deps.memory ?? createMemory(fakeStorage(), () => NOON);
  const errands = deps.errands ?? createErrands(memory);
  const game = createGame(play, { memory, errands, modelStorage: fakeStorage(), ...deps });
  return { play, memory, errands, game, d: play.dialogue, monk: play.monk, animals: play.animals };
}
// 호감도를 close(15) 이상으로 올린다: 부탁 완료 3번 = +15.
const makeClose = (memory, npc) => { for (let i = 0; i < 3; i++) memory.recordErrand(npc, 'done'); };
const llmRouter = () => ({ ...manualRouter(), active: () => 'llm' });
const llmReply = (say, action = 'none', options = ['가', '나', '다']) =>
  ({ raw: '', reply: { say, action, place: null, options }, source: 'llm' });

// ── 동물 대화: 대본 ────────────────────────────────────────

test('동물 Space: 대화창(이름), 대본 첫 줄, emote, hold, 추천, 상태, 만남 기록', () => {
  const { play, d, memory, animals } = setup();
  play.fire.interact('dog');
  assert.deepEqual(d.log[0], ['open', '황구']);
  const line = scriptedAnimalLine('dog', 0);
  assert.equal(d.npcText, line.say);
  assert.deepEqual(animals.dog.calls.emote, [line.emote]);
  assert.deepEqual(animals.dog.calls.hold, [4]);
  assert.deepEqual(d.options, animalOptions('dog'));
  assert.deepEqual(d.choices, []);
  assert.equal(d.status, ANIMAL_STATUS.scripted);
  assert.equal(memory.get('dog').meetings, 1);
  assert.equal(memory.get('monk').meetings, 0);
});

test('동물 이름: 황구·백구·고양이', () => {
  for (const [npc, name] of [['dog', '황구'], ['white', '백구'], ['cat', '고양이']]) {
    const { play, d } = setup();
    play.fire.interact(npc);
    assert.deepEqual(d.log[0], ['open', name]);
    assert.equal(NPC_NAMES[npc], name);
  }
});

test('동물 대본: 다시 만나면 다른 줄, 같은 대화 안 제출도 다음 줄', async () => {
  const { play, d } = setup();
  play.fire.interact('dog');
  const first = d.npcText;
  d.submit('쓰다듬어 준다');
  const second = d.npcText;
  assert.equal(second, scriptedAnimalLine('dog', 1).say);
  d.close();
  play.fire.interact('dog');
  assert.notEqual(d.npcText, first);
  assert.notEqual(d.npcText, second);
  assert.equal(d.npcText, scriptedAnimalLine('dog', 3).say);
});

test('동물 대본 제출: LLM 없이 즉시 답하고 emote·이력을 남긴다', () => {
  const router = manualRouter();
  const { play, d, memory, animals } = setup({ router });
  play.fire.interact('white');
  d.log.length = 0;
  d.submit('같이 놀자');
  assert.equal(router.calls.length, 0);
  assert.ok(!d.log.some(([k, v]) => k === 'thinking' && v === true));
  const line = scriptedAnimalLine('white', 1);
  assert.equal(d.npcText, line.say);
  assert.equal(animals.white.calls.emote.at(-1), line.emote);
  assert.deepEqual(d.options, animalOptions('white'));
  assert.deepEqual(memory.get('white').lastLines, [
    { role: 'user', content: '같이 놀자' }, { role: 'assistant', content: line.say }
  ]);
});

test('동물 호감도가 close여도 LLM이 안 깨어 있으면 대본', () => {
  const router = manualRouter(); // active() === 'mock'
  const { play, d, memory } = setup({ router });
  makeClose(memory, 'cat');
  play.fire.interact('cat');
  assert.equal(d.status, ANIMAL_STATUS.scripted);
  d.submit('안녕');
  assert.equal(router.calls.length, 0);
  assert.match(d.npcText, /\(.+\)/);
});

test('동물 호감도가 낯익음 미만이면 LLM이 깨어 있어도 대본', () => {
  const router = llmRouter();
  const { play, d, memory } = setup({ router });
  memory.recordMeeting('dog'); // 1: new (interact가 +1 해도 2)
  play.fire.interact('dog');
  d.submit('안녕');
  assert.equal(router.calls.length, 0);
});

// ── 동물 대화: LLM ─────────────────────────────────────────

test('동물 close + LLM: brain에 동물 스냅샷, 행동은 none만, 대사·추천 표시', async () => {
  const router = llmRouter();
  const { play, d, memory, errands, monk, animals } = setup({ router });
  makeClose(memory, 'dog');
  play.fire.interact('dog');
  assert.equal(d.status, '');
  d.submit('황구야 안녕');
  assert.ok(d.log.some(([k, v]) => k === 'thinking' && v === true));
  assert.equal(router.calls.length, 1);
  const sys = router.calls[0].args.messages[0].content;
  assert.ok(sys.includes('황구'));
  assert.ok(!sys.includes('도연'));
  assert.ok(sys.includes('방문객이 황구에게 다가왔다'));
  router.calls[0].args.onText('{"say":"멍');
  assert.equal(d.npcText, '멍');
  router.calls[0].resolve(llmReply('멍멍! 냄새 좋다!', 'offer_errand', ['쓰담', '간식', '산책']));
  await flush();
  assert.equal(d.thinking, false);
  assert.equal(d.npcText, '멍멍! 냄새 좋다!');
  assert.deepEqual(d.options, ['쓰담', '간식', '산책']);
  assert.equal(errands.state(), 'none');
  assert.equal(monk.calls.follow.length + monk.calls.goTo.length, 0);
  assert.equal(animals.dog.calls.emote.length, 2); // 대본 첫 줄 + LLM 답
  assert.deepEqual(memory.get('dog').lastLines.at(-1), { role: 'assistant', content: '멍멍! 냄새 좋다!' });
  assert.deepEqual(d.choices, []);
});

test('동물 LLM: 스냅샷 모양', async () => {
  let seen;
  const brain = { ask: async a => { seen = a; return { requestId: a.requestId, reply: llmReply('멍').reply, source: 'llm' }; } };
  const { play, d, memory } = setup({ brain, router: llmRouter() });
  makeClose(memory, 'white');
  play.fire.interact('white');
  d.submit('x');
  await flush();
  assert.deepEqual(seen.snapshot, {
    npc: 'white', clock: 720, weather: '맑음', place: null, activity: '', following: false,
    partner: 'visitor', errand: null, meetings: 1, affinityBand: 'close', history: []
  });
});

test('동물 LLM이 Mock으로 떨어지면(source mock) 대본으로 답한다', async () => {
  const router = llmRouter();
  const { play, d, memory } = setup({ router });
  makeClose(memory, 'cat');
  play.fire.interact('cat');
  d.submit('안녕');
  router.calls[0].resolve({ raw: '', reply: { say: MOCK.fallback, action: 'none', place: null, options: ['가', '나', '다'] }, source: 'mock' });
  await flush();
  assert.equal(d.npcText, scriptedAnimalLine('cat', 1).say);
  assert.deepEqual(d.options, animalOptions('cat'));
});

test('동물 LLM: 대화가 멀어지면 늦은 응답은 버린다', async () => {
  const router = llmRouter();
  const { play, d, memory } = setup({ router });
  makeClose(memory, 'dog');
  play.fire.interact('dog');
  d.submit('x');
  play.tileAt = [30, 20];
  router.calls[0].resolve(llmReply('멍'));
  await flush();
  assert.notEqual(d.npcText, '멍');
  assert.equal(memory.get('dog').lastLines.length, 0);
});

test('동물 대화 중 빙의가 바뀌면 창이 닫히고 요청이 중단된다', () => {
  const router = llmRouter();
  const { play, d, memory } = setup({ router });
  makeClose(memory, 'dog');
  play.fire.interact('dog');
  d.submit('x');
  play.fire.possess('monk');
  assert.equal(d.opened, false);
  assert.equal(router.calls[0].args.signal.aborted, true);
});

test('동물 대화 중 매 틱 동물을 hold(4)로 붙잡는다', () => {
  const { play, animals, monk } = setup();
  play.fire.interact('cat');
  animals.cat.calls.hold.length = 0;
  play.fire.tick(0.1);
  assert.deepEqual(animals.cat.calls.hold, [4]);
  assert.equal(monk.calls.hold.length, 0);
});

test('빙의한 동물이 다른 동물에게 Space: partner는 그 동물, 자기 자신은 무시', async () => {
  let seen;
  const brain = { ask: async a => { seen = a; return { requestId: a.requestId, reply: llmReply('야옹').reply, source: 'llm' }; } };
  const { play, d, memory } = setup({ brain, router: llmRouter() });
  makeClose(memory, 'cat');
  play.fire.possess('dog');
  play.tileAt = [12, 13];
  play.fire.interact('dog'); // 자기 자신
  assert.equal(d.opened, false);
  play.fire.interact('cat');
  assert.deepEqual(d.log[0], ['open', '고양이']);
  d.submit('x');
  await flush();
  assert.equal(seen.snapshot.partner, 'dog');
  assert.equal(seen.snapshot.npc, 'cat');
});

test('옛 Play(animals 없음): 동물 Space는 조용히 무시', () => {
  const { play, d } = setup({}, { legacy: true });
  assert.doesNotThrow(() => play.fire.interact('dog'));
  assert.equal(d.opened, false);
});

// ── 빙의해서 스님과 대화 ───────────────────────────────────

test('동물 빙의 + 스님 Space: 스님이 그 동물에게 말하는 톤, 부탁 선택·전달 없음', async () => {
  let seen;
  const brain = { ask: async a => { seen = a; return { requestId: a.requestId, reply: llmReply('허허').reply, source: 'llm' }; } };
  const { play, d, memory, errands } = setup({ brain });
  errands.offer(); // 제안된 부탁이 있어도
  play.fire.possess('dog');
  play.fire.interact('monk');
  assert.deepEqual(d.log[0], ['open', MONK_NAME]);
  assert.equal(d.npcText, monkToAnimalLine('dog', memory.get('monk').meetings - 1));
  assert.deepEqual(d.options, animalPartnerOptions('dog'));
  assert.deepEqual(d.choices, []);
  d.submit('멍!');
  await flush();
  assert.equal(seen.snapshot.partner, 'dog');
  assert.equal(seen.snapshot.npc, 'monk');
  assert.deepEqual(d.choices, []);
});

test('동물 빙의: 스님이 offer_errand 해도 제안되지 않는다', async () => {
  const router = llmRouter();
  const { play, d, errands, memory } = setup({ router });
  play.fire.possess('white');
  play.fire.interact('monk');
  d.submit('도울 일?');
  router.calls[0].resolve(llmReply('부탁이 있어요.', 'offer_errand'));
  await flush();
  assert.equal(errands.state(), 'none');
  assert.equal(memory.get('monk').errands.offered, 0);
  assert.ok(!d.npcText.includes(ERRANDS.water.offer));
  assert.equal(d.npcText, '부탁이 있어요.');
  assert.deepEqual(d.choices, []);
});

test('동물 빙의 + 대본 스님(Mock): 일반 대답이면 동물에게 하는 말로 바꾼다', async () => {
  const { play, d } = setup();
  play.fire.possess('cat');
  play.fire.interact('monk');
  d.submit('야옹.');
  await flush();
  assert.notEqual(d.npcText, MOCK.fallback);
  assert.match(d.npcText, /[가-힣]/);
  assert.ok([0, 1, 2].some(i => monkToAnimalLine('cat', i) === d.npcText));
});

test('동물 빙의: 물을 들고 있어도 스님이 받지 않는다', () => {
  const { play, errands, d } = setup();
  errands.offer(); errands.accept(); errands.atWell();
  play.fire.possess('dog');
  play.fire.interact('monk');
  assert.equal(errands.state(), 'carrying');
  assert.notEqual(d.npcText, ERRANDS.water.delivered);
});

test('동물 빙의: 우물·들밭·공양간 Space는 부탁을 진행시키지 않는다', () => {
  const { play, errands } = setup();
  errands.offer(); errands.accept();
  play.fire.possess('dog');
  play.fire.interact('well');
  assert.equal(errands.state(), 'accepted');
});

// ── 부탁: 대상 켜기 ────────────────────────────────────────

test('시작: well·field·kitchen 모두 꺼 둔다', () => {
  const { play } = setup();
  assert.deepEqual(play.targets, { well: false, field: false, kitchen: false });
  assert.equal(play.targetLog.length, 3);
});

test('물 부탁: 수락하면 우물만, 물을 길으면 모두 꺼짐, 전달하면 보상', async () => {
  const { play, d, errands, memory } = setup();
  play.fire.interact('monk');
  d.submit('도울 일 있을까요?');
  await flush();
  assert.deepEqual(play.targets, { well: false, field: false, kitchen: false }); // 제안만으로는 켜지 않는다
  d.choose('accept');
  assert.deepEqual(play.targets, { well: true, field: false, kitchen: false });
  d.close();
  play.fire.interact('field'); // 엉뚱한 곳
  assert.equal(errands.state(), 'accepted');
  play.fire.interact('well');
  assert.equal(errands.state(), 'carrying');
  assert.deepEqual(play.targets, { well: false, field: false, kitchen: false });
  assert.equal(play.hud.at(-1), ERRANDS.water.hudCarrying);
  play.fire.interact('kitchen');
  assert.equal(errands.state(), 'carrying');
  const before = memory.get('monk').affinity;
  play.fire.interact('monk');
  assert.equal(errands.state(), 'done');
  assert.equal(play.hud.at(-1), '');
  assert.equal(memory.get('monk').affinity, before + 5 + 1);
});

test('채소 부탁 전체 흐름: 거절 뒤 다음 제안은 채소, 들밭 → 공양간, 보상 1회, 나중에 스님이 고마워함', async () => {
  const { play, d, errands, memory } = setup();
  play.fire.interact('monk');
  d.submit('도울 일 있을까요?');
  await flush();
  d.choose('decline');
  assert.equal(errands.state(), 'none');
  d.submit('도울 일 있을까요?');
  await flush();
  assert.equal(errands.kind(), 'veg');
  assert.ok(d.npcText.includes(ERRANDS.veg.offer));
  d.choose('accept');
  assert.equal(d.npcText, ERRANDS.veg.accepted);
  assert.equal(play.hud.at(-1), ERRANDS.veg.hudAccepted);
  assert.deepEqual(play.targets, { well: false, field: true, kitchen: false });
  d.close();

  play.fire.interact('kitchen'); // 아직 거두지 않음
  assert.equal(errands.state(), 'accepted');
  play.fire.interact('field');
  assert.equal(errands.state(), 'carrying');
  assert.equal(play.hud.at(-1), ERRANDS.veg.hudCarrying);
  assert.deepEqual(play.targets, { well: false, field: false, kitchen: true });

  play.fire.interact('monk'); // 채소는 스님에게 주지 않는다
  assert.equal(errands.state(), 'carrying');
  assert.notEqual(d.npcText, ERRANDS.water.delivered);
  d.close();

  const before = memory.get('monk').affinity;
  play.fire.interact('kitchen');
  assert.equal(errands.state(), 'done');
  assert.equal(memory.get('monk').affinity, before + 5);
  assert.equal(memory.get('monk').errands.done, 1);
  assert.equal(play.hud.at(-1), ERRANDS.veg.hudDelivered);
  assert.deepEqual(play.targets, { well: false, field: false, kitchen: false });
  play.fire.interact('kitchen');
  assert.equal(memory.get('monk').affinity, before + 5);

  play.fire.tick(3);
  assert.equal(play.hud.at(-1), ERRANDS.veg.hudDelivered);
  play.fire.tick(4);
  assert.equal(play.hud.at(-1), '');

  play.fire.interact('monk');
  assert.equal(d.npcText, ERRANDS.veg.thanks);
  d.close();
  play.fire.interact('monk');
  assert.notEqual(d.npcText, ERRANDS.veg.thanks);
});

test('채소 안내 HUD는 새 부탁이 시작되면 시간 때문에 지워지지 않는다', async () => {
  const { play, d, errands } = setup();
  errands.offer('veg'); errands.accept(); errands.atField();
  play.fire.interact('kitchen');
  errands.offer('water');
  play.fire.interact('monk');
  d.choose('accept');
  play.fire.tick(10);
  assert.equal(play.hud.at(-1), ERRANDS.water.hudAccepted);
});

test('채소 부탁 중 스냅샷 errand id는 veg', async () => {
  let seen;
  const brain = { ask: async a => { seen = a; return { requestId: a.requestId, reply: llmReply('네').reply, source: 'llm' }; } };
  const { play, d, errands } = setup({ brain });
  errands.offer('veg'); errands.accept();
  play.fire.interact('monk');
  d.submit('x');
  await flush();
  assert.deepEqual(seen.snapshot.errand, { id: 'veg', state: 'accepted' });
});

test('채소 부탁 단계별 추천', () => {
  const { play, d, errands } = setup();
  errands.offer('veg'); errands.accept();
  play.fire.interact('monk');
  assert.deepEqual(d.options, templateOptions({ errandState: 'accepted', errandKind: 'veg' }));
});

test('옛 Play(setTargetEnabled 없음): 부탁 흐름이 그대로 동작', () => {
  const { play, errands } = setup({}, { legacy: true });
  errands.offer('veg'); errands.accept();
  play.fire.interact('field');
  assert.equal(errands.state(), 'carrying');
  play.fire.interact('kitchen');
  assert.equal(errands.state(), 'done');
});

// ── 일지 ───────────────────────────────────────────────────

test('onJournal: 만난 NPC 항목을 돌려준다', () => {
  const { play, memory } = setup();
  assert.deepEqual(play.fire.journal(), []);
  play.fire.interact('monk');
  play.fire.interact('dog');
  const j = play.fire.journal();
  assert.deepEqual(j.map(e => e.title), [MONK_NAME, '황구']);
  assert.equal(j[1].lines[0], '오늘 만남 1번 · 처음 봄');
  assert.equal(memory.get('dog').meetings, 1);
});

// ── 모델 선택 ──────────────────────────────────────────────

const CHOICES = [
  { id: GEMMA, label: '똑똑하게 · 2.7GB' },
  { id: QWEN, label: '가볍게 · 1.1GB' }
];

function loader() {
  const calls = [];
  const engine = { kind: 'webllm', ready: false, supported: async () => true, async load() { this.onProgress(0.5); engine.ready = true; }, chat: async () => '' };
  return { calls, engine, loadWebLLM: async opts => { calls.push(opts); engine.onProgress = opts.onProgress; return engine; } };
}

test('modelPicker가 있으면 그것을 쓰고 modelButton은 쓰지 않는다', () => {
  const { play } = setup();
  assert.deepEqual(play.picker.choices, CHOICES);
  assert.equal(play.picker.texts.at(-1), 'AI 스님 깨우기');
  assert.deepEqual(play.button.texts, []);
});

test('고른 모델로 load하고, 진행률 → 숨김, 선택을 저장한다', async () => {
  const modelStorage = fakeStorage();
  const l = loader();
  const { play } = setup({ modelStorage, loadWebLLM: l.loadWebLLM });
  play.fire.pick(QWEN);
  await flush();
  assert.equal(l.calls[0].modelId, QWEN);
  assert.equal(typeof l.calls[0].onProgress, 'function');
  assert.ok(play.picker.texts.includes('깨우는 중 50%'));
  assert.equal(play.picker.hidden, true);
  assert.equal(modelStorage.getItem('sansa.model'), QWEN);
});

test('저장된 마지막 선택을 문구에 보여 주고 목록에 없으면 무시한다', () => {
  const st = fakeStorage();
  st.setItem('sansa.model', QWEN);
  assert.equal(setup({ modelStorage: st }).play.picker.texts.at(-1), 'AI 스님 깨우기 · 가볍게');
  const bad = fakeStorage();
  bad.setItem('sansa.model', 'evil-model');
  assert.equal(setup({ modelStorage: bad }).play.picker.texts.at(-1), 'AI 스님 깨우기');
});

test('모델 선택: 로드 실패 뒤 다시 고를 수 있다', async () => {
  let n = 0;
  const loadWebLLM = async () => ({ supported: async () => true, load: async () => { if (n++ === 0) throw new Error('oom'); } , ready: true, chat: async () => '' });
  const { play } = setup({ loadWebLLM });
  play.fire.pick(GEMMA);
  await flush();
  assert.equal(play.picker.texts.at(-1), '깨우기 실패 · 대본 스님');
  play.fire.pick(QWEN);
  await flush();
  assert.equal(n, 2);
  assert.equal(play.picker.hidden, true);
});

test('localStorage 접근이 막혀도 모델 선택은 던지지 않는다', async () => {
  const modelStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const l = loader();
  const { play } = setup({ modelStorage, loadWebLLM: l.loadWebLLM });
  play.fire.pick(GEMMA);
  await flush();
  assert.equal(l.calls[0].modelId, GEMMA);
});

test('옛 Play(modelPicker 없음): modelButton 폴백, 저장된 선택을 따른다', async () => {
  const l1 = loader();
  const a = setup({ loadWebLLM: l1.loadWebLLM }, { legacy: true });
  assert.deepEqual(a.play.button.texts, ['AI 스님 깨우기 (약 2.7GB)']);
  a.play.fire.button();
  await flush();
  assert.equal(l1.calls[0].modelId, GEMMA);

  const st = fakeStorage();
  st.setItem('sansa.model', QWEN);
  const l2 = loader();
  const b = setup({ modelStorage: st, loadWebLLM: l2.loadWebLLM }, { legacy: true });
  assert.deepEqual(b.play.button.texts, ['AI 스님 깨우기 (약 1.1GB)']);
  b.play.fire.button();
  await flush();
  assert.equal(l2.calls[0].modelId, QWEN);
});
