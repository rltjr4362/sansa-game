import { Temple } from './world.js';

const bell = Temple.halls.find(hall => hall.name === '종루');
const loop = [[11, 20], [11, 16], [11, 12], [8, 12], [8, 11], [12, 11], [13, 12], [12, 13], [11, 16], [11, 20]];
const route = [[11.5, 20.5], ...loop.slice(1).flatMap((tile, i) => Temple.route(...loop[i], ...tile))];
const walkSeconds = 22.6;
const spacing = 1.2;
const cooldown = 60;

export const bellPosition = { x: bell.x + bell.w / 2, y: bell.y + bell.d / 2 };

export function nearBell(actor) {
  const dx = Math.max(bell.x - actor.x, actor.x - bell.x - bell.w, 0);
  const dy = Math.max(bell.y - actor.y, actor.y - bell.y - bell.d, 0);
  return Math.hypot(dx, dy) <= 1.25;
}

export function createEaster(onRing) {
  let started = -Infinity, stamps = 0, lastStamp = -Infinity;

  function ring(time) {
    if (time - started < cooldown) return false;
    started = time;
    stamps = 0;
    onRing();
    return true;
  }

  return {
    available: time => time - started >= cooldown,
    ring,
    stamp(time, now) {
      if (now - lastStamp > 1_200) stamps = 0;
      lastStamp = now;
      if (++stamps < 5) return false;
      stamps = 0;
      return ring(time);
    },
    figures(time) {
      const figures = [];
      for (let kind = 0; kind < 3; kind++) {
        const age = time - started - kind * spacing;
        if (age < 0 || age >= walkSeconds) continue;
        const distance = age / walkSeconds * (route.length - 1);
        const index = Math.floor(distance), u = distance - index;
        const [x, y] = route[index], [nx, ny] = route[index + 1];
        figures.push({
          kind,
          x: x + (nx - x) * u,
          y: y + (ny - y) * u,
          face: Math.atan2(ny - y, nx - x),
          step: distance * 9
        });
      }
      return figures;
    }
  };
}

export function createBellEffect(canvas) {
  let audio;
  return () => {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      canvas.animate?.([
        { translate: '0 0' }, { translate: '2px -1px' }, { translate: '-2px 1px' },
        { translate: '1px 0' }, { translate: '0 0' }
      ], { duration: 380 });
    }
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      audio ??= new Audio();
      const play = () => {
        const now = audio.currentTime;
        for (const [hz, volume, decay] of [[136, .048, 3.8], [284, .022, 2.5], [391, .012, 1.55], [583, .006, .85]]) {
          const partial = audio.createOscillator(), envelope = audio.createGain();
          partial.frequency.value = hz;
          envelope.gain.setValueAtTime(.0001, now);
          envelope.gain.exponentialRampToValueAtTime(volume, now + .04);
          envelope.gain.exponentialRampToValueAtTime(.0001, now + decay);
          partial.connect(envelope);
          envelope.connect(audio.destination);
          partial.onended = () => { partial.disconnect(); envelope.disconnect(); };
          partial.start(now);
          partial.stop(now + decay);
        }
      };
      if (audio.state === 'running') play();
      else audio.resume().then(play).catch(() => {});
    } catch {
      // The procession still plays when audio is unavailable.
    }
  };
}
