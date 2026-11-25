// createGame(play): 두뇌·행동·기억·부탁을 Plan 2의 Play에 연결한다.
import { createMemory } from './memory.js';
import { createErrands } from './errands.js';
import { createMockLLM } from './llm/mock.js';
import { createRouter } from './llm/router.js';
import { createBrain } from './brain.js';
import { applyAction } from './actions.js';
import { buildJournal } from './journal.js';
import {
  NPC_NAMES, ERRANDS, MOCK, ANIMAL_STATUS, greetingFor, openingFor, templateOptions,
  scriptedAnimalLine, animalOptions, animalPartnerOptions, monkToAnimalLine
} from './lines.js';

const GREET_RANGE = 3;
// 응답을 적용할 수 있는 거리. 계약에 E 판정 질의가 없어 맨해튼 거리로 근사한다.
const TALK_RANGE = 4;
const ERRAND_CHOICES = [{ label: '수락', id: 'accept' }, { label: '거절', id: 'decline' }];
const GREET_COOLDOWN = 60;
const MOCK_STATUS = '대본 스님이 답해요 · 우상단에서 AI 스님을 깨울 수 있어요';
const MODELS = [
  { id: 'gemma-4-E2B-it-q4f16_1-MLC', label: '똑똑하게 · 2.7GB' },
  { id: 'Qwen3.5-2B-q4f16_1-MLC', label: '가볍게 · 1.1GB' }
];
const MODEL_KEY = 'sansa.model';
const TITLE_CHOICES = [
  { id: MODELS[0].id, label: '똑똑한 AI 스님', detail: '처음 한 번 2.7GB · 말을 잘 알아들어요', recommended: true },
  { id: MODELS[1].id, label: '가벼운 AI 스님', detail: '처음 한 번 1.1GB · 빨리 받아요' }
];
const TITLE_UNSUPPORTED = '이 브라우저에서는 AI를 쓸 수 없어요 · 대본 스님과 함께해요';
const ANIMALS = ['dog', 'white', 'cat'];
const PLACE_TARGETS = ['well', 'field', 'kitchen'];
const HUD_DONE_SECONDS = 6;
// 대본은 만남마다 이만큼씩 건너뛰어 다시 만났을 때 같은 줄이 바로 나오지 않게 한다.
const SCRIPT_STRIDE = 3;
const BUTTON = {
  idle: size => `AI 스님 깨우기 (약 ${size})`,
  pickerIdle: label => (label ? `AI 스님 깨우기 · ${label}` : 'AI 스님 깨우기'),
  unsupported: '이 기기에선 대본 스님',
  progress: p => `깨우는 중 ${Math.round(p * 100)}%`,
  failed: '깨우기 실패 · 대본 스님'
};

const distance = ([ax, ay], [bx, by]) => Math.abs(ax - bx) + Math.abs(ay - by);
const isAnimal = who => ANIMALS.includes(who);

// 접근이 막힐 수 있는 localStorage. 실패하면 null.
function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function createGame(play, deps = {}) {
  const { monk, dialogue } = play;
  const memory = deps.memory ?? createMemory();
  const errands = deps.errands ?? createErrands(memory);
  const modelStorage = deps.modelStorage === undefined ? defaultStorage() : deps.modelStorage;

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
  let convo = null; // 열려 있는 대화 {npc: 말을 받는 쪽, partner: 말을 건 쪽(조종 중인 캐릭터), turn}
  let hudClearAt = null; // 안내 줄을 자동으로 지울 시각(time 기준)
  let thanksPending = false; // 채소를 가져다 놓은 뒤 스님이 다음 대화에서 고마워한다

  const following = () => monk.snapshotBase().following;
  const animalOf = npc => play.animals?.[npc] ?? null;
  const npcTile = npc => (npc === 'monk' ? monk.tile() : animalOf(npc)?.tile() ?? null);
  const holdNpc = (npc, seconds) => (npc === 'monk' ? monk : animalOf(npc))?.hold?.(seconds);
  const hud = text => { hudClearAt = null; play.setHud(text); };

  // 동물은 호감도가 '낯익음' 이상이고 LLM이 깨어 있을 때만 LLM으로 답한다. 그 밖에는 대본.
  const animalUsesLLM = npc => router.active() === 'llm' && memory.band(npc) !== 'new';
  const options = () => {
    if (convo && isAnimal(convo.partner)) return animalPartnerOptions(convo.partner);
    return templateOptions({ following: following(), errandState: errands.state(), errandKind: errands.kind() });
  };
  const status = () => {
    if (convo && isAnimal(convo.npc)) return animalUsesLLM(convo.npc) ? '' : ANIMAL_STATUS.scripted;
    return router.active() === 'mock' ? MOCK_STATUS : '';
  };
  // 제안된 부탁이 있으면 수락·거절을 (다시) 보여 준다. 부탁은 방문객과 스님 사이의 일이다.
  const showChoices = () => dialogue.setChoices(
    convo?.npc === 'monk' && convo.partner === 'visitor' && errands.state() === 'offered' ? ERRAND_CHOICES : []);
  // 대화가 아직 이어지는 중인가: 창이 열려 있고, 말을 건 캐릭터를 아직 조종 중이며, 상대가 가까이 있다.
  const inConversation = () => {
    if (!convo || !dialogue.isOpen() || play.possessing() !== convo.partner) return false;
    const tile = npcTile(convo.npc);
    return tile !== null && distance(play.playerTile(), tile) <= TALK_RANGE;
  };

  // 지금 단계에서 필요한 장소 대상만 켠다(스님·동물은 사람 대상이라 항상 켜짐). 바뀐 것만 보낸다.
  const sentTargets = {};
  function syncTargets() {
    if (typeof play.setTargetEnabled !== 'function') return;
    const want = play.possessing() === 'visitor' ? errands.targets() : [];
    for (const target of PLACE_TARGETS) {
      const on = want.includes(target);
      if (sentTargets[target] === on) continue;
      sentTargets[target] = on;
      play.setTargetEnabled(target, on);
    }
  }

  function clearTargets() {
    if (typeof play.setTargetEnabled !== 'function') return;
    for (const target of PLACE_TARGETS) {
      if (sentTargets[target]) { sentTargets[target] = false; play.setTargetEnabled(target, false); }
    }
  }

  function invalidate() {
    active?.ac.abort();
    active = null;
  }

  function snapshot({ npc, partner }) {
    const base = monk.snapshotBase();
    const rec = memory.get(npc);
    const common = { npc, clock: base.clock, weather: base.weather, partner };
    const tail = { meetings: rec.meetings, affinityBand: memory.band(npc), history: rec.lastLines };
    if (isAnimal(npc)) {
      return { ...common, place: null, activity: '', following: false, errand: null, ...tail };
    }
    return { ...common, place: base.place, activity: base.activity, following: base.following, errand: errands.snapshot(), ...tail };
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

  function openConversation(npc, partner) {
    invalidate();
    released = false;
    convo = { npc, partner, turn: 0 };
    holdNpc(npc, 4);
    dialogue.open(NPC_NAMES[npc]);
    dialogue.setThinking(false);
    memory.recordMeeting(npc);
  }

  function talkToMonk() {
    const partner = play.possessing();
    if (partner === 'monk') return;
    openConversation('monk', partner);
    const { meetings } = memory.get('monk');
    if (isAnimal(partner)) {
      dialogue.setNpcText(monkToAnimalLine(partner, meetings - 1));
    } else if (errands.state() === 'carrying' && errands.deliver('monk')) {
      dialogue.setNpcText(ERRANDS.water.delivered);
      hud('');
    } else if (thanksPending) {
      thanksPending = false;
      dialogue.setNpcText(ERRANDS.veg.thanks);
    } else {
      dialogue.setNpcText(openingFor({ meetings, affinityBand: memory.band('monk') }));
    }
    showChoices();
    dialogue.setOptions(options());
    dialogue.setStatus(status());
    syncTargets();
  }

  // 동물 대본: 만남마다 SCRIPT_STRIDE씩, 같은 대화 안에서는 한 줄씩 넘어간다.
  const scriptLine = ({ npc, turn }) =>
    scriptedAnimalLine(npc, (memory.get(npc).meetings - 1) * SCRIPT_STRIDE + turn);

  function talkToAnimal(npc) {
    const animal = animalOf(npc);
    const partner = play.possessing();
    if (!animal || partner === npc) return;
    openConversation(npc, partner);
    const line = scriptLine(convo);
    dialogue.setNpcText(line.say);
    animal.emote?.(line.emote);
    dialogue.setChoices([]);
    dialogue.setOptions(animalOptions(npc));
    dialogue.setStatus(status());
  }

  function atPlace(target) {
    if (play.possessing() !== 'visitor') return; // 부탁은 방문객이 한다
    if (target === 'well' && errands.atWell()) {
      hud(ERRANDS.water.hudCarrying);
    } else if (target === 'field' && errands.atField()) {
      hud(ERRANDS.veg.hudCarrying);
    } else if (target === 'kitchen' && errands.deliver('kitchen')) {
      hud(ERRANDS.veg.hudDelivered);
      hudClearAt = time + HUD_DONE_SECONDS;
      thanksPending = true;
    }
    syncTargets();
  }

  // 대본으로 답한다(동물, LLM 없이). 이력도 남겨 일지에 한 줄이 보이게 한다.
  function scriptedReply(text) {
    invalidate();
    convo.turn++;
    const line = scriptLine(convo);
    memory.pushTurn(convo.npc, text, line.say);
    dialogue.setNpcText(line.say);
    animalOf(convo.npc)?.emote?.(line.emote);
    dialogue.setChoices([]);
    dialogue.setOptions(animalOptions(convo.npc));
  }

  async function submit(text) {
    if (disposed || !convo) return;
    if (isAnimal(convo.npc) && !animalUsesLLM(convo.npc)) { scriptedReply(text); return; }
    invalidate();
    const c = convo;
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
        snapshot: snapshot(c),
        userText: text,
        signal: ac.signal,
        onSay: say => { if (isActive() && inConversation()) dialogue.setNpcText(say); }
      });
    } catch (e) {
      if (e?.name === 'AbortError' || !isActive()) return;
      active = null;
      dialogue.setThinking(false);
      if (inConversation()) dialogue.setNpcText(isAnimal(c.npc) ? scriptLine({ ...c, turn: c.turn + 1 }).say : MOCK.fallback);
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
    c.turn++;
    if (isAnimal(c.npc)) finishAnimal(c, text, result);
    else finishMonk(c, text, result, id, errandAtStart);
    syncTargets();
  }

  // 동물 답: 행동은 none만. LLM이 Mock으로 떨어졌으면 스님 말투를 쓰지 않고 대본으로 답한다.
  function finishAnimal(c, text, { reply, source }) {
    const line = scriptLine(c);
    const scripted = source === 'mock';
    const say = scripted ? line.say : reply.say || '…';
    memory.pushTurn(c.npc, text, say);
    dialogue.setNpcText(say);
    animalOf(c.npc)?.emote?.(line.emote);
    showChoices();
    dialogue.setOptions(scripted ? animalOptions(c.npc) : reply.options ?? animalOptions(c.npc));
  }

  function finishMonk(c, text, { reply, source }, id, errandAtStart) {
    // 방문객이 아닌 상대에게는 follow·stop_follow·offer_errand를 따르지 않는다(대사도 바꾼다).
    // 요청 중 부탁 상태가 바뀌었을 때도 offer_errand는 따르지 않는다.
    const visitorOnly = ['follow', 'stop_follow', 'offer_errand'].includes(reply.action);
    const blocked = visitorOnly && c.partner !== 'visitor';
    const action = blocked || (reply.action === 'offer_errand' && errands.state() !== errandAtStart)
      ? 'none' : reply.action;
    const request = action === 'go_to'
      ? { requestId: id, npc: 'monk', action: 'go_to', place: reply.place }
      : { requestId: id, npc: 'monk', action, place: null };
    const { executed } = applyAction(monk, request, { errands });
    if (executed === 'follow' || executed === 'go_to') released = true;

    // 동물에게는 대본 스님의 대답을 모두, 차단된 행동의 대사도 동물에게 하는 말로 바꾼다.
    const toAnimal = isAnimal(c.partner) && (source === 'mock' || blocked);
    const say = toAnimal ? monkToAnimalLine(c.partner, memory.get('monk').meetings - 1 + c.turn) : reply.say;
    memory.pushTurn('monk', text, say);

    if (executed === 'offer_errand') {
      // 실제 부탁 문구만 보여 준다. 모델이 말한 부탁 문장은 다른 부탁일 수 있어 쓰지 않는다.
      // Mock 대사("부탁드릴 일이 하나 있어요")는 부탁 내용을 말하지 않으므로 그대로 앞에 둔다.
      const offer = ERRANDS[errands.kind()].offer;
      dialogue.setNpcText(source === 'mock' && say ? `${say} ${offer}` : offer);
    } else {
      dialogue.setNpcText(say || '…');
    }
    showChoices();
    dialogue.setOptions(toAnimal ? options() : reply.options ?? options());
  }

  function choose(id) {
    // 열린 방문객–스님 대화이고 스님이 가까이 있을 때만 수락·거절한다.
    if (!(convo?.npc === 'monk' && convo.partner === 'visitor' && inConversation())) {
      dialogue.setChoices([]);
      return;
    }
    const kind = errands.kind();
    if (id === 'accept' && errands.accept()) {
      dialogue.setNpcText(ERRANDS[kind].accepted);
      hud(ERRANDS[kind].hudAccepted);
    } else if (id === 'decline' && errands.decline()) {
      dialogue.setNpcText(ERRANDS[kind].declined);
    } else {
      return;
    }
    dialogue.setChoices([]);
    dialogue.setOptions(options());
    syncTargets();
  }

  const readPick = () => {
    try {
      const id = modelStorage?.getItem(MODEL_KEY);
      return MODELS.find(m => m.id === id) ?? null;
    } catch { return null; }
  };
  const savePick = id => { try { modelStorage?.setItem(MODEL_KEY, id); } catch { /* 기억하지 못해도 동작 */ } };

  let button = null;
  let waking = false;
  let pending = null; // 깨우는 중인 엔진(dispose 때 정리용)
  // 시작했으면 true. 이미 깨우는 중이거나 깨어 있으면 false.
  function wake(modelId) {
    if (waking || llm) return false;
    waking = true;
    run(modelId);
    return true;
  }
  async function run(modelId) {
    try {
      const engine = await loadWebLLM({ modelId, onProgress: p => { if (!disposed) button.setText(BUTTON.progress(p)); } });
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

  // 모델을 내려받기 전에 이 브라우저가 WebGPU를 쓸 수 있는지만 확인한다.
  async function probeSupport() {
    let engine = null;
    try {
      engine = await loadWebLLM({ modelId: MODELS[0].id });
      return Boolean(await engine.supported());
    } catch {
      return false;
    } finally {
      try { engine?.dispose?.(); } catch { /* 무시 */ }
    }
  }

  const guard = fn => (...args) => { if (!disposed) fn(...args); };

  play.onTick(guard(dt => {
    time += dt;
    greet();
    if (dialogue.isOpen() && convo && !released) holdNpc(convo.npc, 4);
    if (hudClearAt !== null && time >= hudClearAt) hud('');
    syncTargets();
  }));
  play.onInteract(guard(target => {
    if (target === 'monk') talkToMonk();
    else if (isAnimal(target)) talkToAnimal(target);
    else atPlace(target);
  }));
  play.onPossessChange(guard(() => {
    invalidate();
    convo = null;
    if (dialogue.isOpen()) dialogue.close();
    syncTargets();
  }));
  dialogue.onSubmit(guard(submit));
  dialogue.onChoice(guard(choose));
  dialogue.onClose(guard(() => { invalidate(); convo = null; }));

  const picked = readPick();
  function pickModel(id) {
    if (MODELS.some(m => m.id === id) && wake(id)) savePick(id);
  }
  if (typeof play.modelPicker === 'function') {
    button = play.modelPicker(MODELS.map(m => ({ ...m })), guard(pickModel));
    button.setText(BUTTON.pickerIdle(picked?.label.split(' · ')[0]));
  } else { // 1단계 Play
    const model = picked ?? MODELS[0];
    button = play.modelButton(guard(() => wake(model.id)));
    button.setText(BUTTON.idle(model.label.split(' · ')[1]));
  }
  if (typeof play.showTitle === 'function') {
    // id가 null이면 AI 없이 시작: 아무것도 불러오거나 저장하지 않는다.
    const title = play.showTitle(TITLE_CHOICES.map(c => ({ ...c })), guard(id => { if (id !== null) pickModel(id); }));
    title.setSelected(picked?.id ?? null);
    probeSupport().then(ok => { if (!disposed) title.setAiAvailable(ok, ok ? undefined : TITLE_UNSUPPORTED); });
  }
  if (typeof play.onJournal === 'function') play.onJournal(() => (disposed ? [] : buildJournal(memory)));
  syncTargets();

  return {
    dispose() {
      if (disposed) return;
      invalidate();
      clearTargets();
      disposed = true;
      const engine = llm ?? pending;
      llm = null;
      pending = null;
      try { engine?.dispose?.(); } catch { /* 무시 */ }
    }
  };
}
