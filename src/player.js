import { Temple } from './world.js';

const WALK_SPEED = 1.1;
export const VIEW_SQUASH = .53;
export const well = Temple.props.find(prop => prop.kind === 'well');

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

export function movementForKeys(keys, angle, dt) {
  const [left, right, up, down] = directions.map(pair => Number(pair.some(key => keys.has(key))));
  const x = right - left, y = (down - up) / VIEW_SQUASH;
  const length = Math.hypot(x, y);
  if (!length) return [0, 0];
  const scale = WALK_SPEED * dt / length, cos = Math.cos(angle), sin = Math.sin(angle);
  return [(x * cos + y * sin) * scale, (y * cos - x * sin) * scale];
}

export function findInteraction(visitor, monk) {
  const tile = tileOf(visitor);
  const atWell = Math.abs(tile[0] - well.x) + Math.abs(tile[1] - well.y) === 1;
  const wellDistance = atWell ? Math.hypot(visitor.x - well.x - .5, visitor.y - well.y - .5) : Infinity;
  const monkDistance = Math.hypot(visitor.x - monk.x, visitor.y - monk.y);
  if (monkDistance <= 2 && monkDistance <= wellDistance) {
    const path = Temple.route(...tile, ...tileOf(monk));
    if (path && path.length <= 4) return 'monk';
  }
  return atWell ? 'well' : null;
}

export function bindPlayerInput({ enabled, onInteract, onPossess }) {
  const keys = new Set();
  const moveKeys = new Set(directions.flat());
  const keyFor = event => /^Key[WASDEQ]$/.test(event.code)
    ? event.code.at(-1).toLowerCase()
    : event.key.length === 1 ? event.key.toLowerCase() : event.key;

  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || !enabled() || event.isComposing ||
        event.altKey || event.ctrlKey || event.metaKey ||
        event.target.closest?.('input, select, textarea, [contenteditable]')) return;
    const key = keyFor(event);
    if (!moveKeys.has(key) && key !== 'e' && key !== 'q') return;
    event.preventDefault();
    if (moveKeys.has(key)) keys.add(key);
    else if (!event.repeat) {
      if (key === 'e') onInteract();
      else onPossess();
    }
  });
  window.addEventListener('keyup', event => keys.delete(keyFor(event)));
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => keys.clear());
  return {
    clear: () => keys.clear(),
    move: (actor, angle, dt) => moveActor(actor, ...movementForKeys(keys, angle, dt))
  };
}
