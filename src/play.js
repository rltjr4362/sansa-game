import { createControl } from './control.js';
import { createDialogueView } from './dialogue-view.js';
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

  const dialogue = createDialogueView(app.querySelector('#dialogue'), () => {
    input.clear();
    viewer.refresh();
  });
  const target = () => control.monk.possessed() ? null : findInteraction(visitor, sim);
  const viewer = createViewer(canvas, createScene(canvas), sim, visitor, {
    actor: control.actor,
    target,
    dialogueOpen: dialogue.isOpen,
    speech: control.speech,
    clearInput: () => input.clear(),
    step(dt, angle, playing) {
      const actor = control.actor();
      if (playing && !dialogue.isOpen()) input.move(actor, angle, dt);
      else actor.walking = false;
      control.tick(dt);
    },
    frame(dt) { for (const cb of ticks) cb(dt); }
  });
  const input = bindPlayerInput({
    enabled: () => viewer.inputEnabled() && !dialogue.isOpen(),
    onInteract() {
      const who = target();
      if (who) for (const cb of interactions) cb(who);
    },
    onPossess() {
      const who = control.togglePossession();
      viewer.refresh();
      for (const cb of possessions) cb(who);
    }
  });
  dialogue.onClose(viewer.refresh);

  return {
    monk: control.monk,
    dialogue,
    playerTile: () => tileOf(control.actor()),
    possessing: () => control.monk.possessed() ? 'monk' : 'visitor',
    onInteract: cb => { interactions.add(cb); },
    onPossessChange: cb => { possessions.add(cb); },
    onTick: cb => { ticks.add(cb); },
    setHud(text) {
      const hud = app.querySelector('#hud');
      hud.textContent = text;
      hud.hidden = !text;
    },
    modelButton(onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'AI 스님 깨우기';
      button.addEventListener('click', onClick);
      app.querySelector('#modelControls').append(button);
      return {
        setText: text => { button.textContent = text; },
        hide: () => { button.hidden = true; }
      };
    }
  };
}
