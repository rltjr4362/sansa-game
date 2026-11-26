// createGame 테스트용 가짜 Play. { legacy: true }면 1단계 Play(새 메서드 없음).

export const flush = () => new Promise(r => setImmediate(r));

export function fakeStorage() {
  const m = new Map();
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) };
}

export function fakeMonk() {
  const m = {
    tileAt: [10, 12], isBusy: false, isPossessed: false, following: false,
    calls: { follow: [], stopFollow: 0, goTo: [], say: [], hold: [] },
    possessed: () => m.isPossessed,
    busy: () => m.isBusy,
    tile: () => m.tileAt,
    snapshotBase: () => ({ clock: 720, weather: '맑음', place: '앞마당', activity: '낙엽 쓸기', following: m.following }),
    follow(s) { m.calls.follow.push(s); if (m.isPossessed) return false; m.following = true; return true; },
    stopFollow() { m.calls.stopFollow++; m.following = false; },
    goTo(p) { m.calls.goTo.push(p); return true; },
    hold(s) { m.calls.hold.push(s); },
    say(text, s) { m.calls.say.push(text); }
  };
  return m;
}

export function fakeAnimal(at) {
  const a = {
    tileAt: at, isPossessed: false, calls: { say: [], emote: [], hold: [] },
    tile: () => a.tileAt,
    possessed: () => a.isPossessed,
    say: (t, s) => a.calls.say.push(t),
    emote: k => a.calls.emote.push(k),
    hold: s => a.calls.hold.push(s)
  };
  return a;
}

export function fakeDialogue() {
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

// 모든 모델이 가능한 기기. game 테스트의 기본 probe.
export const STRONG_PROBE = async () => ({ webgpu: true, f16: true, maxBuffer: 4 * 2 ** 30, maxStorage: 2 ** 30 });

export function fakePlay({ legacy = false, title = false } = {}) {
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
    busy: [],
    setBusy: (on, text) => p.busy.push([on, text]),
    modelButton(onClick) {
      cb.button = onClick;
      return { setText: (t, a) => { p.button.texts.push(t); p.button.action = a; }, hide: () => { p.button.hidden = true; } };
    },
    fire: {
      interact: t => cb.interact(t),
      tick: dt => cb.tick(dt),
      possess: who => { p.who = who; cb.possess(who); },
      button: () => cb.button()
    }
  };
  if (legacy) return p; // 1단계 Play: 새 메서드 없음 (animals·setTargetEnabled·modelPicker·onJournal)

  p.animals = { dog: fakeAnimal([11, 13]), white: fakeAnimal([12, 13]), cat: fakeAnimal([13, 13]) };
  p.targets = { well: false, field: false, kitchen: false };
  p.targetLog = [];
  p.setTargetEnabled = (t, on) => { p.targets[t] = on; p.targetLog.push([t, on]); };
  p.picker = { choices: null, texts: [], hidden: false };
  p.modelPicker = (choices, onPick) => {
    p.picker.choices = choices;
    cb.pick = onPick;
    return { setText: (t, a) => { p.picker.texts.push(t); p.picker.action = a; }, hide: () => { p.picker.hidden = true; } };
  };
  if (title) {
    p.title = { choices: null, selected: undefined, available: [], choiceEnabled: [] };
    p.showTitle = (choices, onStart) => {
      p.title.choices = choices;
      cb.start = onStart;
      return {
        setSelected: id => { p.title.selected = id; },
        setAiAvailable: (ok, note) => p.title.available.push([ok, note]),
        setChoiceEnabled: (id, ok, note) => p.title.choiceEnabled.push([id, ok, note])
      };
    };
    p.fire.start = id => cb.start(id);
  }
  p.onJournal = f => { cb.journal = f; };
  p.fire.pick = id => cb.pick(id);
  p.fire.journal = () => cb.journal();
  return p;
}


// 수동으로 응답을 내보내는 라우터. chat 호출마다 {args, resolve, reject}가 쌓인다.
export function manualRouter() {
  const calls = [];
  return {
    calls,
    active: () => 'mock',
    chat: args => new Promise((resolve, reject) => calls.push({ args, resolve, reject }))
  };
}
export const replyOf = (say, action = 'none') =>
  ({ raw: '', reply: { say, action, place: null, options: ['가', '나', '다'] }, source: 'mock' });

