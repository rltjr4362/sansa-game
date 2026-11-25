import { Temple } from './world.js';

const walkSpeeds = { visitor: 2.2, monk: 2.2, dog: 2.6, white: 2.6, cat: 2.4 };
const RUN_SCALE = 1.6;
export const VIEW_SQUASH = .53;
const well = Temple.props.find(prop => prop.kind === 'well');
const kitchen = Temple.halls.find(hall => hall.name === '공양간');
const kitchenDoor = [Math.floor(kitchen.x + kitchen.w / 2), kitchen.y + kitchen.d];

export function tileOf({ x, y }) {
  return [Math.floor(x), Math.floor(y)];
}

export function moveActor(actor, dx, dy) {
  const { x, y } = actor;
  // Each axis step can cross at most one tile boundary.
  const count = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / .25);
  for (let i = 0; i < count; i++) {
    const nextX = actor.x + dx / count;
    const nextY = actor.y + dy / count;
    const [tx, ty] = tileOf(actor);
    const nx = Math.floor(nextX), ny = Math.floor(nextY);
    const openX = Temple.walkable(nx, ty);
    const openY = Temple.walkable(tx, ny);
    if (openX) actor.x = nextX;
    // When crossing a corner, both orthogonal neighbours must be open.
    if (openY && Temple.walkable(Math.floor(actor.x), ny)) actor.y = nextY;
  }
  const moved = Math.hypot(actor.x - x, actor.y - y);
  actor.walking = moved > 0;
  if (moved) {
    actor.face = Math.atan2(actor.y - y, actor.x - x);
    actor.step += moved * 8;
  }
}

const directions = [
  ['a', 'ArrowLeft'], ['d', 'ArrowRight'], ['w', 'ArrowUp'], ['s', 'ArrowDown']
];

export function movementForKeys(keys, angle, dt, run = false, who = 'visitor') {
  const [left, right, up, down] = directions.map(pair => Number(pair.some(key => keys.has(key))));
  const x = right - left, y = (down - up) / VIEW_SQUASH;
  const length = Math.hypot(x, y);
  if (!length) return [0, 0];
  const scale = walkSpeeds[who] * (run ? RUN_SCALE : 1) * dt / length, cos = Math.cos(angle), sin = Math.sin(angle);
  return [(x * cos + y * sin) * scale, (y * cos - x * sin) * scale];
}

export function findInteraction(actor, sim, enabled) {
  if (actor === sim) return null;
  const [x, y] = tileOf(actor);
  let nearest = null, bestDistance = Infinity;
  function consider(target, position, range, steps) {
    if (!position || position === actor) return;
    const distance = Math.hypot(actor.x - position.x, actor.y - position.y);
    if (distance > range || distance >= bestDistance) return;
    if (steps !== undefined) {
      const path = Temple.route(x, y, ...tileOf(position));
      if (!path || path.length > steps) return;
    }
    nearest = { target, position };
    bestDistance = distance;
  }
  consider('monk', sim, 3, 5);
  for (const key of ['dog', 'white', 'cat']) consider(key, sim.animals[key], 2, 4);

  if (enabled?.has('well') && Math.abs(x - well.x) + Math.abs(y - well.y) === 1) {
    consider('well', { x: well.x + .5, y: well.y + .5 }, Infinity);
  }
  if (enabled?.has('field')) {
    const ripe = Temple.beds.some(({ access: [tx, ty] }, i) => x === tx && y === ty && sim.farm[i]?.stage === 'ripe');
    if (ripe) consider('field', { x: x + .5, y: y + .5 }, Infinity);
  }
  if (enabled?.has('kitchen') && x === kitchenDoor[0] && y === kitchenDoor[1]) {
    consider('kitchen', { x: x + .5, y: y + .5 }, Infinity);
  }
  return nearest;
}

export function bindPlayerInput({ enabled, journalEnabled = enabled, hasWorldFocus, onInteract, onPossess, onJournal }) {
  const keys = new Set();
  const moveKeys = new Set(directions.flat());
  const keyFor = event => /^Key[WASDEQJ]$/.test(event.code)
    ? event.code.at(-1).toLowerCase()
    : event.code === 'Space' ? ' '
    : /^Shift(Left|Right)$/.test(event.code) ? event.code
    : event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const isRun = key => key === 'ShiftLeft' || key === 'ShiftRight';

  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || !hasWorldFocus(event.target) ||
        event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = keyFor(event);
    if (!(key === 'j' ? journalEnabled() : enabled())) return;
    if (isRun(key)) { keys.add(key); return; }
    if (!moveKeys.has(key) && !['e', ' ', 'q', 'j'].includes(key)) return;
    event.preventDefault();
    if (moveKeys.has(key)) keys.add(key);
    else if (!event.repeat) {
      if (key === 'e' || key === ' ') onInteract(key);
      else if (key === 'q') onPossess();
      else onJournal();
    }
  });
  window.addEventListener('keyup', event => keys.delete(keyFor(event)));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('focusin', () => keys.clear());
  document.addEventListener('visibilitychange', () => keys.clear());
  return {
    clear: () => keys.clear(),
    move: (actor, angle, dt, who) => {
      const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      moveActor(actor, ...movementForKeys(keys, angle, dt, run, who));
    }
  };
}
