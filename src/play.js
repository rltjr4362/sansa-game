import { createControl } from './control.js';
import { createDialogueView } from './dialogue-view.js';
import { bellPosition, createBellEffect, createEaster, nearBell } from './easter.js';
import { createJournalView } from './journal-view.js';
import { bindPlayerInput, findInteraction, tileOf } from './player.js';
import { createScene } from './render.js';
import { createViewer } from './viewer.js';
import { Temple } from './world.js';

/** @returns {import('./contracts.js').Play} */
export function startPlay(canvas) {
  const app = canvas.closest('main');
  const sim = Temple.create();
  const visitor = { x: 12.5, y: 19.5, face: -Math.PI / 2, step: 0, walking: false };
  const control = createControl(sim, visitor);
  const interactions = new Set(), possessions = new Set(), ticks = new Set();
  const enabledTargets = new Set();
  let journalEntries = () => [];

  const refreshInput = () => {
    input.clear();
    viewer.refresh();
  };
  const dialogue = createDialogueView(app.querySelector('#dialogue'), refreshInput);
  const journal = createJournalView(app.querySelector('#journal'), refreshInput);
  const modalOpen = () => dialogue.isOpen() || journal.isOpen();
  const hasWorldFocus = target => target === app || target === canvas || target === document.body;
  // 마우스로 누른 버튼(도장, 설정 등)이 포커스를 쥐고 있으면 게임 키가 죽는다.
  // 클릭 처리가 끝난 뒤 포커스를 장면으로 돌린다. 대화창·일지·모델 메뉴는 포커스가 필요해 제외.
  document.addEventListener('click', event => {
    if (!event.detail || !(event.target instanceof Element)) return;
    const button = event.target.closest('button');
    if (!button || button.closest('#dialogue, #journal, .model-picker, #settings')) return;
    setTimeout(() => { if (document.activeElement === button) app.focus({ preventScroll: true }); });
  });
  const easter = createEaster(() => {
    viewer.refresh();
    bellEffect();
  });
  const bellEffect = createBellEffect(canvas);
  const atBell = () => easter.available(sim.time) && nearBell(control.actor());
  const target = () => findInteraction(control.actor(), sim, enabledTargets);
  const viewer = createViewer(canvas, createScene(canvas), sim, visitor, {
    actor: control.actor,
    possessing: control.possessing,
    animalPaused: control.animalPaused,
    target: () => atBell() ? { target: 'bell', position: bellPosition } : target(),
    modalOpen,
    hasWorldFocus,
    speech: control.speech,
    animalSpeech: control.animalSpeech,
    animalEmote: control.animalEmote,
    easterFigures: () => easter.figures(sim.time),
    clearInput: () => input.clear(),
    step(dt, angle, playing) {
      const actor = control.actor();
      if (playing && !modalOpen()) input.move(actor, angle, dt, control.possessing());
      else actor.walking = false;
      control.tick(dt);
    },
    frame(dt) { for (const cb of ticks) cb(dt); }
  });
  const input = bindPlayerInput({
    enabled: () => viewer.inputEnabled() && !modalOpen(),
    journalEnabled: () => !modalOpen(),
    hasWorldFocus,
    onInteract(key) {
      if (key === ' ' && atBell() && easter.ring(sim.time)) return;
      const interaction = target();
      if (interaction) {
        for (const cb of interactions) cb(interaction.target);
      } else if (atBell()) easter.ring(sim.time);
    },
    onPossess() {
      const who = control.togglePossession();
      viewer.refresh();
      for (const cb of possessions) cb(who);
    },
    onJournal: () => journal.open(journalEntries())
  });
  canvas.addEventListener('pointerdown', () => app.focus({ preventScroll: true }));
  app.querySelector('#seal').addEventListener('click', () => easter.stamp(sim.time, performance.now()));
  dialogue.onClose(viewer.refresh);

  const modelControls = app.querySelector('#modelControls');
  function modelTrigger() {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'AI 스님 깨우기';
    return button;
  }

  function modelProgress(button, root, close = () => {}) {
    return {
      setText(text) { button.textContent = text; close(); },
      hide() {
        close();
        if (root.contains(document.activeElement)) app.focus({ preventScroll: true });
        root.hidden = true;
      }
    };
  }

  return {
    monk: control.monk,
    animals: control.animals,
    dialogue,
    playerTile: () => tileOf(control.actor()),
    possessing: control.possessing,
    onInteract: cb => { interactions.add(cb); },
    setTargetEnabled(target, on) {
      if (on) enabledTargets.add(target);
      else enabledTargets.delete(target);
      viewer.refresh();
    },
    onPossessChange: cb => { possessions.add(cb); },
    onTick: cb => { ticks.add(cb); },
    onJournal: cb => { journalEntries = cb; },
    setHud(text) {
      const hud = app.querySelector('#hud');
      hud.textContent = text;
      hud.hidden = !text;
    },
    modelButton(onClick) {
      const button = modelTrigger();
      button.addEventListener('click', onClick);
      modelControls.append(button);
      return modelProgress(button, button);
    },
    modelPicker(choices, onPick) {
      const root = document.createElement('div');
      root.className = 'model-picker';
      const button = modelTrigger(), list = document.createElement('div');
      list.className = 'model-choices';
      list.setAttribute('role', 'group');
      list.setAttribute('aria-label', 'AI 모델 선택');
      function show(open) {
        if (!open && list.contains(document.activeElement)) button.focus({ preventScroll: true });
        list.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
      }
      for (const { id, label } of choices) {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.textContent = label;
        choice.addEventListener('click', () => {
          show(false);
          onPick(id);
        });
        list.append(choice);
      }
      show(false);
      button.disabled = choices.length === 0;
      button.addEventListener('click', () => show(list.hidden));
      root.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || list.hidden) return;
        event.preventDefault();
        show(false);
      });
      window.addEventListener('pointerdown', event => {
        if (!list.hidden && !root.contains(event.target)) show(false);
      });
      window.addEventListener('focusin', event => {
        if (!list.hidden && !root.contains(event.target)) show(false);
      });
      root.append(button, list);
      modelControls.append(root);
      return modelProgress(button, root, () => show(false));
    }
  };
}
