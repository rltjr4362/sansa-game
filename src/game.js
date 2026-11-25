// createGame(play): 두뇌·행동·기억·부탁을 Plan 2의 Play에 연결한다.
import { createMemory } from './memory.js';
import { createErrands } from './errands.js';
import { createMockLLM } from './llm/mock.js';
import { createRouter } from './llm/router.js';
import { createBrain } from './brain.js';
import { applyAction } from './actions.js';
import { MONK_NAME, ERRAND, MOCK, greetingFor, openingFor, templateOptions } from './lines.js';

const GREET_RANGE = 3;
// 응답을 적용할 수 있는 거리. 계약에 E 판정 질의가 없어 맨해튼 거리로 근사한다.
const TALK_RANGE = 4;
const ERRAND_CHOICES = [{ label: '수락', id: 'accept' }, { label: '거절', id: 'decline' }];
const GREET_COOLDOWN = 60;
const MOCK_STATUS = '대본 스님이 답해요 · 우상단에서 AI 스님을 깨울 수 있어요';
const BUTTON = {
  idle: 'AI 스님 깨우기 (약 2.7GB)',
  unsupported: '이 기기에선 대본 스님',
  progress: p => `깨우는 중 ${Math.round(p * 100)}%`,
  failed: '깨우기 실패 · 대본 스님'
};

const distance = ([ax, ay], [bx, by]) => Math.abs(ax - bx) + Math.abs(ay - by);

export function createGame(play, deps = {}) {
  const { monk, dialogue } = play;
  const memory = deps.memory ?? createMemory();
  const errands = deps.errands ?? createErrands(memory);

  // 라우터는 이 손잡이를 주 엔진으로 본다. WebLLM이 깨어나면 llm이 채워진다.
  let llm = null;
  const primary = {
    kind: 'webllm',
    get ready() { return Boolean(llm?.ready); },
    chat: args => llm.chat(args)
  };
  const router = deps.router ?? createRouter({ primary, fallback: createMockLLM() });
  const brain = deps.brain ?? createBrain(router);
  const loadWebLLM = deps.loadWebLLM ??
    (opts => import('./llm/webllm.js').then(m => m.createWebLLM(opts)));

  let disposed = false;
  let seq = 0;
  let active = null; // {id, ac}
  let time = 0;
  let lastGreet = -Infinity;
  let released = false; // follow·go_to 응답 뒤에는 붙잡지 않는다 (다시 열면 해제)

  const following = () => monk.snapshotBase().following;
  const options = () => templateOptions({ following: following(), errandState: errands.state() });
  const status = () => (router.active() === 'mock' ? MOCK_STATUS : '');
  // 제안된 부탁이 있으면 수락·거절을 (다시) 보여 준다.
  const showChoices = () => dialogue.setChoices(errands.state() === 'offered' ? ERRAND_CHOICES : []);
  // 대화가 아직 이어지는 중인가: 창이 열려 있고, 방문객을 조종 중이며, 스님이 가까이 있다.
  const inConversation = () =>
    dialogue.isOpen() && play.possessing() === 'visitor' &&
    distance(play.playerTile(), monk.tile()) <= TALK_RANGE;

  function invalidate() {
    active?.ac.abort();
    active = null;
  }

  function snapshot() {
    return {
      npc: 'monk',
      ...monk.snapshotBase(),
      partner: 'visitor',
      errand: errands.snapshot(),
      meetings: memory.get('monk').meetings,
      affinityBand: memory.band('monk'),
      history: memory.get('monk').lastLines
    };
  }

  function greet() {
    if (play.possessing() !== 'visitor' || dialogue.isOpen()) return;
    if (monk.busy() || monk.possessed() || following()) return;
    if (time - lastGreet < GREET_COOLDOWN) return;
    if (distance(play.playerTile(), monk.tile()) > GREET_RANGE) return;
    lastGreet = time;
    monk.hold(6);
    monk.say(greetingFor({ ...monk.snapshotBase(), meetings: memory.get('monk').meetings }));
  }

  function talkToMonk() {
    invalidate();
    released = false;
    monk.hold(4);
    dialogue.open(MONK_NAME);
    dialogue.setThinking(false);
    memory.recordMeeting('monk');
    if (errands.state() === 'carrying' && errands.deliver()) {
      dialogue.setNpcText(ERRAND.delivered);
      play.setHud('');
    } else {
      dialogue.setNpcText(openingFor({ meetings: memory.get('monk').meetings, affinityBand: memory.band('monk') }));
    }
    showChoices();
    dialogue.setOptions(options());
    dialogue.setStatus(status());
  }

  function atWell() {
    if (errands.state() === 'accepted' && errands.atWell()) play.setHud(ERRAND.hudCarrying);
  }

  async function submit(text) {
    if (disposed) return;
    invalidate();
    const id = ++seq;
    const ac = new AbortController();
    active = { id, ac };
    const isActive = () => !disposed && active?.id === id;
    const errandAtStart = errands.state();

    dialogue.setThinking(true);
    dialogue.setOptions([]);
    dialogue.setChoices([]);

    let result;
    try {
      result = await brain.ask({
        requestId: id,
        snapshot: snapshot(),
        userText: text,
        signal: ac.signal,
        onSay: say => { if (isActive() && inConversation()) dialogue.setNpcText(say); }
      });
    } catch (e) {
      if (e?.name === 'AbortError' || !isActive()) return;
      active = null;
      dialogue.setThinking(false);
      if (inConversation()) dialogue.setNpcText(MOCK.fallback);
      showChoices();
      dialogue.setOptions(options());
      return;
    }
    if (!isActive() || result.requestId !== id) return;
    active = null;
    dialogue.setThinking(false);

    // 그사이 대화가 끊겼으면 대사·행동·이력을 모두 버리고 새로 보여 주지 않는다.
    if (!inConversation()) {
      if (dialogue.isOpen()) { showChoices(); dialogue.setOptions(options()); }
      return;
    }

    const { reply } = result;
    // 요청 중 부탁 상태가 바뀌었으면 이전 상태를 보고 고른 offer_errand는 따르지 않는다.
    const action = reply.action === 'offer_errand' && errands.state() !== errandAtStart ? 'none' : reply.action;
    const request = action === 'go_to'
      ? { requestId: id, npc: 'monk', action: 'go_to', place: reply.place }
      : { requestId: id, npc: 'monk', action, place: null };
    const { executed } = applyAction(monk, request, { errands });
    if (executed === 'follow' || executed === 'go_to') released = true;

    memory.pushTurn('monk', text, reply.say);

    if (executed === 'offer_errand') {
      // Mock 대사("부탁드릴 일이 하나 있어요")만으로는 무슨 부탁인지 알 수 없어 부탁 문구를 붙인다.
      dialogue.setNpcText(reply.say ? `${reply.say} ${ERRAND.offer}` : ERRAND.offer);
    } else {
      dialogue.setNpcText(reply.say || '…');
    }
    showChoices();
    dialogue.setOptions(reply.options ?? options());
  }

  function choose(id) {
    if (id === 'accept' && errands.accept()) {
      dialogue.setNpcText(ERRAND.accepted);
      play.setHud(ERRAND.hudAccepted);
    } else if (id === 'decline' && errands.decline()) {
      dialogue.setNpcText(ERRAND.declined);
    } else {
      return;
    }
    dialogue.setChoices([]);
    dialogue.setOptions(options());
  }

  let button = null;
  let waking = false;
  let pending = null; // 깨우는 중인 엔진(dispose 때 정리용)
  async function wake() {
    if (waking || llm) return;
    waking = true;
    try {
      const engine = await loadWebLLM({ onProgress: p => { if (!disposed) button.setText(BUTTON.progress(p)); } });
      if (disposed) return;
      pending = engine;
      const ok = await engine.supported();
      if (disposed) return;
      if (!ok) {
        button.setText(BUTTON.unsupported);
        return;
      }
      await engine.load();
      if (disposed) { engine.dispose?.(); return; }
      llm = engine;
      button.hide();
      if (dialogue.isOpen()) dialogue.setStatus(status());
    } catch {
      if (!disposed) button.setText(BUTTON.failed);
    } finally {
      waking = false;
      pending = null;
    }
  }

  const guard = fn => (...args) => { if (!disposed) fn(...args); };

  play.onTick(guard(dt => {
    time += dt;
    greet();
    if (dialogue.isOpen() && !released) monk.hold(4);
  }));
  play.onInteract(guard(target => {
    if (target === 'monk') talkToMonk();
    else if (target === 'well') atWell();
  }));
  play.onPossessChange(guard(() => {
    invalidate();
    if (dialogue.isOpen()) dialogue.close();
  }));
  dialogue.onSubmit(guard(submit));
  dialogue.onChoice(guard(choose));
  dialogue.onClose(guard(invalidate));
  button = play.modelButton(guard(wake));
  button.setText(BUTTON.idle);

  return {
    dispose() {
      if (disposed) return;
      invalidate();
      disposed = true;
      const engine = llm ?? pending;
      llm = null;
      pending = null;
      try { engine?.dispose?.(); } catch { /* 무시 */ }
    }
  };
}
