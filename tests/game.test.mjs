import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { createMemory } from '../src/memory.js';
import { createErrands } from '../src/errands.js';
import { MONK_NAME, ERRAND, MOCK, greetingFor, openingFor, templateOptions } from '../src/lines.js';

const flush = () => new Promise(r => setImmediate(r));

function fakeStorage() {
  const m = new Map();
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) };
}

function fakeMonk() {
  const m = {
    tileAt: [10, 12], isBusy: false, isPossessed: false, following: false,
    calls: { follow: [], stopFollow: 0, goTo: [], say: [] },
    possessed: () => m.isPossessed,
    busy: () => m.isBusy,
    tile: () => m.tileAt,
    snapshotBase: () => ({ clock: 720, weather: '맑음', place: '앞마당', activity: '낙엽 쓸기', following: m.following }),
    follow(s) { m.calls.follow.push(s); if (m.isPossessed) return false; m.following = true; return true; },
    stopFollow() { m.calls.stopFollow++; m.following = false; },
    goTo(p) { m.calls.goTo.push(p); return true; },
    say(text, s) { m.calls.say.push(text); }
  };
  return m;
}

function fakeDialogue() {
  const cb = {};
  const d = {
    log: [], opened: false, npcText: null, options: null, choices: null, thinking: false, status: null,
    open(title) { d.log.push(['open', title]); d.opened = true; },
    isOpen: () => d.opened,
    setNpcText(t) { d.log.push(['npc', t]); d.npcText = t; },
    setThinking(on) { d.log.push(['thinking', on]); d.thinking = on; },
    setOptions(o) { d.log.push(['options', o]); d.options = o; },
    setChoices(c) { d.log.push(['choices', c]); d.choices = c; },
    setStatus(t) { d.log.push(['status', t]); d.status = t; },
    onSubmit: f => { cb.submit = f; },
    onChoice: f => { cb.choice = f; },
    onClose: f => { cb.close = f; },
    close() { d.log.push(['close']); d.opened = false; cb.close?.(); },
    submit: text => cb.submit(text),
    choose: id => cb.choice(id)
  };
  return d;
}

function fakePlay() {
  const cb = {};
  const monk = fakeMonk();
  const dialogue = fakeDialogue();
  const p = {
    monk, dialogue, tileAt: [10, 13], who: 'visitor', hud: [], button: { texts: [], hidden: false },
    playerTile: () => p.tileAt,
    possessing: () => p.who,
    onInteract: f => { cb.interact = f; },
    onPossessChange: f => { cb.possess = f; },
    onTick: f => { cb.tick = f; },
    setHud: t => p.hud.push(t),
    modelButton(onClick) {
      cb.button = onClick;
      return { setText: t => p.button.texts.push(t), hide: () => { p.button.hidden = true; } };
    },
    fire: {
      interact: t => cb.interact(t),
      tick: dt => cb.tick(dt),
      possess: who => { p.who = who; cb.possess(who); },
      button: () => cb.button()
    }
  };
  return p;
}

function setup(deps = {}) {
  const play = fakePlay();
  const memory = deps.memory ?? createMemory(fakeStorage(), () => new Date(2026, 10, 25, 12).getTime());
  const errands = deps.errands ?? createErrands(memory);
  const game = createGame(play, { memory, errands, ...deps });
  return { play, memory, errands, game, d: play.dialogue, monk: play.monk };
}

// 수동으로 응답을 내보내는 라우터. chat 호출마다 {args, resolve, reject}가 쌓인다.
function manualRouter() {
  const calls = [];
  return {
    calls,
    active: () => 'mock',
    chat: args => new Promise((resolve, reject) => calls.push({ args, resolve, reject }))
  };
}
const replyOf = (say, action = 'none') =>
  ({ raw: '', reply: { say, action, place: null, options: ['가', '나', '다'] }, source: 'mock' });

// ── 선제 인사 ──────────────────────────────────────────────

test('선제 인사: 가까우면 즉시 첫 인사, 60초 쿨다운', () => {
  const { play, monk } = setup();
  play.fire.tick(0.1);
  assert.deepEqual(monk.calls.say, [greetingFor({ clock: 720, weather: '맑음', meetings: 0 })]);
  play.fire.tick(30);
  play.fire.tick(29.8);
  assert.equal(monk.calls.say.length, 1);
  play.fire.tick(0.2);
  assert.equal(monk.calls.say.length, 2);
});

test('선제 인사: 거리 3 경계', () => {
  const { play, monk } = setup();
  play.tileAt = [12, 14]; // 거리 4
  play.fire.tick(1);
  assert.equal(monk.calls.say.length, 0);
  play.tileAt = [12, 13]; // 거리 3
  play.fire.tick(1);
  assert.equal(monk.calls.say.length, 1);
});

test('선제 인사: 막는 조건들', () => {
  const cases = [
    s => { s.play.who = 'monk'; },
    s => { s.monk.isBusy = true; },
    s => { s.monk.isPossessed = true; },
    s => { s.monk.following = true; },
    s => { s.d.opened = true; }
  ];
  for (const block of cases) {
    const s = setup();
    block(s);
    s.play.fire.tick(1);
    assert.equal(s.monk.calls.say.length, 0);
  }
});

// ── E → 스님 ───────────────────────────────────────────────

test('E→스님: 대화창 열림, 첫 줄, 추천, 상태 줄, 만남 기록', () => {
  const { play, d, memory } = setup();
  play.fire.interact('monk');
  assert.deepEqual(d.log[0], ['open', MONK_NAME]);
  assert.equal(memory.get('monk').meetings, 1);
  assert.equal(d.npcText, openingFor({ meetings: 1, affinityBand: 'new' }));
  assert.deepEqual(d.options, templateOptions({}));
  assert.equal(d.status, '대본 스님이 답해요 · 우상단에서 AI 스님을 깨울 수 있어요');
});

// ── 제출 ───────────────────────────────────────────────────

test('제출: 생각 중 → 대사·추천 표시, 이력 기록', async () => {
  const { play, d, memory } = setup();
  play.fire.interact('monk');
  d.log.length = 0;
  d.submit('안녕하세요');
  assert.deepEqual(d.log.slice(0, 3), [['thinking', true], ['options', []], ['choices', []]]);
  await flush();
  assert.equal(d.thinking, false);
  assert.equal(d.npcText, MOCK.greet);
  assert.equal(d.options.length, 3);
  assert.deepEqual(memory.get('monk').lastLines, [
    { role: 'user', content: '안녕하세요' }, { role: 'assistant', content: MOCK.greet }
  ]);
});

test('제출: 스냅샷이 brain에 전달된다', async () => {
  let seen;
  const brain = { ask: async a => { seen = a; return { requestId: a.requestId, reply: replyOf('네').reply, source: 'mock' }; } };
  const { play, d } = setup({ brain });
  play.fire.interact('monk');
  d.submit('x');
  await flush();
  assert.equal(seen.requestId, 1);
  assert.equal(seen.userText, 'x');
  assert.deepEqual(seen.snapshot, {
    npc: 'monk', clock: 720, weather: '맑음', place: '앞마당', activity: '낙엽 쓸기', following: false,
    partner: 'visitor', errand: null, meetings: 1, affinityBand: 'new', history: []
  });
});

test('제출: 따라와 → follow 실행, 이후 추천은 따라가는 중 템플릿', async () => {
  const { play, d, monk } = setup();
  play.fire.interact('monk');
  d.submit('저 따라와 주실래요?');
  await flush();
  assert.deepEqual(monk.calls.follow, [60]);
  assert.equal(monk.following, true);
  assert.equal(d.npcText, MOCK.follow);
  d.submit('그만 따라오세요');
  await flush();
  assert.equal(monk.calls.stopFollow, 1);
});

test('제출: 연못 보러 가요 → goTo', async () => {
  const { play, d, monk } = setup();
  play.fire.interact('monk');
  d.submit('연못 보러 가요');
  await flush();
  assert.deepEqual(monk.calls.goTo, ['연못가']);
});

test('제출: 스트리밍 대사는 setNpcText로 바로 보인다', async () => {
  const router = manualRouter();
  const { play, d } = setup({ router });
  play.fire.interact('monk');
  d.submit('x');
  router.calls[0].args.onText('{"say":"반갑');
  assert.equal(d.npcText, '반갑');
  router.calls[0].args.onText('{"say":"반갑습니다"');
  assert.equal(d.npcText, '반갑습니다');
  router.calls[0].resolve(replyOf('반갑습니다.'));
  await flush();
  assert.equal(d.npcText, '반갑습니다.');
  assert.deepEqual(d.options, ['가', '나', '다']);
});

test('제출: 빈 대사는 …, 추천 없으면 템플릿', async () => {
  const brain = { ask: async a => ({ requestId: a.requestId, reply: { say: '', action: 'none', place: null, options: null } }) };
  const { play, d } = setup({ brain });
  play.fire.interact('monk');
  d.submit('x');
  await flush();
  assert.equal(d.npcText, '…');
  assert.deepEqual(d.options, templateOptions({}));
});

// ── 부탁 전체 흐름 ─────────────────────────────────────────

test('부탁: 제안 → 수락 → 우물 → 전달, 호감도 +5 (+만남 2회)', async () => {
  const { play, d, memory, errands, monk } = setup();
  play.fire.interact('monk');
  d.submit('도울 일 있을까요?');
  await flush();
  assert.equal(errands.state(), 'offered');
  assert.ok(d.npcText.includes(ERRAND.offer));
  assert.deepEqual(d.choices, [{ label: '수락', id: 'accept' }, { label: '거절', id: 'decline' }]);

  d.choose('accept');
  assert.equal(errands.state(), 'accepted');
  assert.equal(d.npcText, ERRAND.accepted);
  assert.deepEqual(d.choices, []);
  assert.equal(play.hud.at(-1), ERRAND.hudAccepted);
  d.close();

  play.fire.interact('well');
  assert.equal(errands.state(), 'carrying');
  assert.equal(play.hud.at(-1), ERRAND.hudCarrying);
  assert.equal(monk.calls.say.length, 0);

  const before = memory.get('monk').affinity;
  assert.equal(before, 1);
  play.fire.interact('monk');
  assert.equal(errands.state(), 'done');
  assert.equal(d.npcText, ERRAND.delivered);
  assert.equal(play.hud.at(-1), '');
  assert.equal(memory.get('monk').affinity, before + 5 + 1);
  assert.equal(memory.get('monk').errands.done, 1);

  // 다시 말을 걸어도 보상은 한 번뿐
  d.close();
  play.fire.interact('monk');
  assert.equal(memory.get('monk').affinity, before + 5 + 2);
});

test('부탁: 거절', async () => {
  const { play, d, errands } = setup();
  play.fire.interact('monk');
  d.submit('도울 일 있을까요?');
  await flush();
  d.choose('decline');
  assert.equal(errands.state(), 'none');
  assert.equal(d.npcText, ERRAND.declined);
  assert.deepEqual(d.choices, []);
});

test('우물: 부탁 수락 전엔 아무것도 안 함', () => {
  const { play, errands } = setup();
  play.fire.interact('well');
  assert.equal(errands.state(), 'none');
  assert.deepEqual(play.hud, []);
});

// ── 요청 수명 ──────────────────────────────────────────────

test('대화창을 닫은 뒤 도착한 응답은 무시되고 신호는 중단된다', async () => {
  const router = manualRouter();
  const { play, d, monk, memory } = setup({ router });
  play.fire.interact('monk');
  d.submit('저 따라와 주실래요?');
  const { args, resolve } = router.calls[0];
  d.close();
  assert.equal(args.signal.aborted, true);
  d.log.length = 0;
  resolve(replyOf('그러지요.', 'follow'));
  await flush();
  assert.deepEqual(d.log, []);
  assert.deepEqual(monk.calls.follow, []);
  assert.deepEqual(memory.get('monk').lastLines, []);
});

test('늦은 스트리밍 조각도 닫힌 뒤엔 무시', async () => {
  const router = manualRouter();
  const { play, d } = setup({ router });
  play.fire.interact('monk');
  d.submit('x');
  d.close();
  d.log.length = 0;
  router.calls[0].args.onText('{"say":"늦은');
  assert.deepEqual(d.log, []);
});

test('새 제출은 이전 요청을 중단·무효화한다', async () => {
  const router = manualRouter();
  const { play, d } = setup({ router });
  play.fire.interact('monk');
  d.submit('첫째');
  d.submit('둘째');
  assert.equal(router.calls[0].args.signal.aborted, true);
  assert.equal(router.calls[1].args.signal.aborted, false);
  router.calls[1].resolve(replyOf('둘째 답'));
  await flush();
  router.calls[0].resolve(replyOf('첫째 답'));
  await flush();
  assert.equal(d.npcText, '둘째 답');
});

test('AbortError 거부는 조용히 무시', async () => {
  const router = manualRouter();
  const { play, d } = setup({ router });
  play.fire.interact('monk');
  d.submit('x');
  d.close();
  d.log.length = 0;
  router.calls[0].reject(new DOMException('Aborted', 'AbortError'));
  await flush();
  assert.deepEqual(d.log, []);
});

test('그 밖의 실패는 Mock 대사로 마무리', async () => {
  const router = manualRouter();
  const { play, d } = setup({ router });
  play.fire.interact('monk');
  d.submit('x');
  router.calls[0].reject(new Error('boom'));
  await flush();
  assert.equal(d.thinking, false);
  assert.equal(d.npcText, MOCK.fallback);
  assert.equal(d.options.length, 3);
});

test('빙의 전환: 대화창 close, 요청 중단', async () => {
  const router = manualRouter();
  const { play, d } = setup({ router });
  play.fire.interact('monk');
  d.submit('x');
  play.fire.possess('monk');
  assert.ok(d.log.some(e => e[0] === 'close'));
  assert.equal(d.isOpen(), false);
  assert.equal(router.calls[0].args.signal.aborted, true);
});

test('빙의 전환: 대화창이 닫혀 있으면 close 안 부름', () => {
  const { play, d } = setup();
  play.fire.possess('monk');
  assert.ok(!d.log.some(e => e[0] === 'close'));
});

// ── 모델 버튼 ──────────────────────────────────────────────

test('모델 버튼: 초기 문구, 미지원', async () => {
  const { play } = setup({ loadWebLLM: async () => ({ supported: async () => false, load: async () => { throw new Error('no'); } }) });
  assert.deepEqual(play.button.texts, ['AI 스님 깨우기 (약 2.7GB)']);
  play.fire.button();
  await flush();
  assert.equal(play.button.texts.at(-1), '이 기기에선 대본 스님');
  assert.equal(play.button.hidden, false);
});

test('모델 버튼: 진행률 → 완료 시 숨김, 이후 LLM이 답한다', async () => {
  const engine = {
    kind: 'webllm', ready: false, chats: 0,
    supported: async () => true,
    async load() { this.onProgress(0.37, '...'); engine.ready = true; },
    async chat({ onText }) {
      engine.chats++;
      const raw = JSON.stringify({ say: 'AI 스님입니다.', action: 'none', place: '없음', options: ['가', '나', '다'] });
      onText?.(raw);
      return raw;
    }
  };
  const { play, d } = setup({ loadWebLLM: async ({ onProgress }) => { engine.onProgress = onProgress; return engine; } });
  play.fire.interact('monk');
  play.fire.button();
  await flush();
  assert.ok(play.button.texts.includes('깨우는 중 37%'));
  assert.equal(play.button.hidden, true);
  assert.equal(d.status, '');
  d.submit('안녕');
  await flush();
  assert.equal(engine.chats, 1);
  assert.equal(d.npcText, 'AI 스님입니다.');
});

test('모델 버튼: 로드 실패', async () => {
  const { play } = setup({ loadWebLLM: async () => ({ supported: async () => true, load: async () => { throw new Error('oom'); } }) });
  play.fire.button();
  await flush();
  assert.equal(play.button.texts.at(-1), '깨우기 실패 · 대본 스님');
});

// ── dispose ───────────────────────────────────────────────

test('dispose: 처리기 무력화, 활성 요청 중단', async () => {
  const router = manualRouter();
  const { play, d, monk, game } = setup({ router });
  play.fire.interact('monk');
  d.submit('x');
  game.dispose();
  assert.equal(router.calls[0].args.signal.aborted, true);
  d.log.length = 0;
  play.fire.tick(1);
  play.fire.interact('monk');
  d.submit('y');
  router.calls[0].resolve(replyOf('늦음'));
  await flush();
  assert.deepEqual(d.log, []);
  assert.equal(monk.calls.say.length, 0);
  assert.equal(router.calls.length, 1);
});
