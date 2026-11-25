import { PLACES } from './contracts.js';
import { tileOf } from './player.js';
import { Temple } from './world.js';

const places = [
  ...Object.entries(PLACES),
  ...Temple.visits.flatMap(([name, , , tiles]) => tiles.map(tile => [name, tile]))
];

function placeAt([x, y]) {
  let nearest = null, distance = 2;
  for (const [name, [tx, ty]] of places) {
    const gap = Math.hypot(x - tx, y - ty);
    if (gap <= 2 && (nearest === null || gap < distance)) {
      nearest = name;
      distance = gap;
    }
  }
  return nearest;
}

function routeFrom(actor, [x, y]) {
  const path = Temple.route(...tileOf(actor), x, y);
  if (path?.length === 0 && (actor.x !== x + .5 || actor.y !== y + .5)) {
    path.push([x + .5, y + .5]);
  }
  return path;
}

function followRoute(monk, visitor) {
  const [tx, ty] = tileOf(visitor);
  const fx = Math.cos(visitor.face), fy = Math.sin(visitor.face);
  const candidates = [];
  for (let y = ty - 2; y <= ty + 2; y++) {
    for (let x = tx - 2; x <= tx + 2; x++) {
      if (!Temple.walkable(x, y) || (x === tx && y === ty)) continue;
      const dx = x + .5 - visitor.x, dy = y + .5 - visitor.y;
      const gap = Math.hypot(dx, dy);
      if (gap < 1 || gap > 2) continue;
      const score = Math.hypot(dx + fx * 1.5, dy + fy * 1.5);
      candidates.push({ x, y, score });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  for (const { x, y } of candidates) {
    const path = routeFrom(monk, [x, y]);
    if (path) return path;
  }
  return [];
}

function walkPath(actor, path, dt, speed) {
  let remaining = dt * speed;
  actor.walking = false;
  while (path.length && remaining > 0) {
    const [x, y] = path[0];
    const dx = x - actor.x, dy = y - actor.y, length = Math.hypot(dx, dy);
    const distance = Math.min(length, remaining);
    if (distance > 0) {
      actor.step += distance * 7.8;
      actor.face += Temple.turn(actor.face, Math.atan2(dy, dx)) * Math.min(1, dt * 10);
      actor.walking = true;
    }
    if (distance === length) {
      actor.x = x;
      actor.y = y;
      path.shift();
    } else {
      actor.x += dx * distance / length;
      actor.y += dy * distance / length;
    }
    remaining -= distance;
  }
}

export function createControl(sim, visitor) {
  let possessed = false, routine = null, command = null, speech = null;
  const { dog, white, group } = sim.animals;

  function suspendRoutine() {
    if (command) return;
    // A pause follows finishDuty (original.html:497–499), so a paused visit
    // has already earned its completion and should advance to the next one.
    routine = sim.phase === 'pause' ? null : sim.id;
    const scene = sim.encounter || sim.meeting;
    if (scene) sim.face = scene.returnFace;
    if (sim.meeting) {
      dog.path = [];
      dog.rest = 1.5;
    }
    Object.assign(sim, {
      encounter: null, meeting: null, path: [], phase: 'pause', age: 0, duration: Infinity
    });
  }

  function resumeRoutine() {
    command = null;
    sim.walking = false;
    if (routine !== null) {
      const farm = sim.bedIndex === null ? null : Temple.beds[sim.bedIndex].access;
      const targets = farm ? [farm] : Temple.visits[routine][3];
      const paths = targets.map(target => routeFrom(sim, target)).filter(path => path !== null);
      paths.sort((a, b) => a.length - b.length);
      if (paths.length) {
        sim.id = routine;
        sim.path = paths[0];
        sim.phase = sim.path.length ? 'walk' : 'orient';
        sim.age = 0;
        routine = null;
        return;
      }
    }
    routine = null;
    // The native tick calls its private choose() after a pause (original.html:499).
    Object.assign(sim, { bedIndex: null, path: [], phase: 'pause', age: 0, duration: 0 });
  }

  function togglePossession() {
    if (possessed) {
      possessed = false;
      resumeRoutine();
      return 'visitor';
    }
    suspendRoutine();
    command = null;
    if (dog.visitor) {
      dog.face = dog.visitor.returnFace;
      dog.visitor = null;
      dog.rest = 1.5;
    }
    if (group.pair) {
      Object.assign(group, { kind: 'idle', age: 0, pair: false });
      dog.path = [];
      white.path = [];
      dog.pose = '';
      white.pose = 'idle';
    }
    visitor.walking = false;
    sim.walking = false;
    possessed = true;
    return 'monk';
  }

  function tick(dt) {
    // The original tick runs animals, guests, crops and weather before the
    // monk's phase switch (original.html:454–499). An unending pause keeps
    // those updates live while preventing native movement and finishDuty.
    sim.tick(dt);
    if (possessed || command) sim.age = 0;
    if (!command) return;
    if (command.type === 'hold') {
      if (sim.time + 1e-9 >= command.until) { resumeRoutine(); return; }
      sim.walking = false;
      const target = Math.atan2(visitor.y - sim.y, visitor.x - sim.x);
      sim.face += Temple.turn(sim.face, target) * Math.min(1, dt * 10);
      return;
    }
    if (command.type === 'goTo') {
      walkPath(sim, command.path, dt, 1.2);
      if (!command.path.length) resumeRoutine();
      return;
    }

    if (sim.time + 1e-9 >= command.until) {
      resumeRoutine();
      return;
    }
    if (sim.time >= command.replan) {
      command.path = followRoute(sim, visitor);
      command.replan = sim.time + .25;
    }
    walkPath(sim, command.path, dt, 1.35);
  }

  /** @type {import('./contracts.js').MonkHandle} */
  const monk = {
    possessed: () => possessed,
    busy: () => Boolean(sim.encounter || sim.meeting),
    tile: () => tileOf(sim),
    snapshotBase() {
      const following = command?.type === 'follow';
      const activity = following ? '방문객을 따라가는 중'
        : command || sim.phase === 'walk' || (possessed && sim.walking) ? '걷는 중'
        : sim.phase === 'act' ? Temple.visits[sim.id][1] : '';
      return { clock: Math.floor(sim.clock), weather: sim.weather, place: placeAt(tileOf(sim)), activity, following };
    },
    follow(seconds) {
      if (possessed || !Number.isFinite(seconds) || seconds <= 0) return false;
      suspendRoutine();
      command = { type: 'follow', until: sim.time + seconds, path: [], replan: sim.time };
      return true;
    },
    stopFollow() {
      if (command?.type === 'follow') resumeRoutine();
    },
    goTo(place) {
      if (possessed || typeof place !== 'string' || !Object.hasOwn(PLACES, place)) return false;
      const path = routeFrom(sim, PLACES[place]);
      if (!path) return false;
      suspendRoutine();
      command = { type: 'goTo', path };
      if (!path.length) resumeRoutine();
      return true;
    },
    hold(seconds) {
      if (possessed || !Number.isFinite(seconds) || seconds <= 0) return;
      const until = sim.time + seconds;
      if (command?.type === 'hold') {
        command.until = Math.max(command.until, until);
        return;
      }
      if (command) return;
      suspendRoutine();
      command = { type: 'hold', until };
    },
    say(text, seconds = 4) {
      speech = text ? { title: '스님', line: text, until: sim.time + seconds } : null;
    }
  };

  return {
    monk,
    actor: () => possessed ? sim : visitor,
    tick,
    togglePossession,
    speech: () => speech?.until > sim.time ? speech : null
  };
}
