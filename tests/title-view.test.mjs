import assert from 'node:assert/strict';
import test from 'node:test';
import { createTitleView } from '../src/title-view.js';

function openTitle({ choices = [
  { id: 'first', label: '첫 AI', detail: '2.7GB', recommended: true },
  { id: 'second', label: '둘째 AI', detail: '1.1GB' }
], reduced = true } = {}) {
  // Node has EventTarget but lacks the DOM. Keep the fixture at the element boundary.
  const document = Object.assign(new EventTarget(), {
    activeElement: null,
    createElement: () => new Element(),
    defaultView: { matchMedia: () => ({ matches: reduced }) }
  });
  class Element extends EventTarget {
    children = [];
    attributes = new Map();
    ownerDocument = document;
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    focus() { document.activeElement = this; this.dispatchEvent(new Event('focus')); }
    click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
  }
  const group = new Element(), note = new Element(), skip = new Element(), root = new Element();
  root.querySelector = selector => ({ '#titleChoices': group, '#titleNote': note, '#titleSkip': skip })[selector];
  root.showModal = () => { root.open = true; };
  root.close = () => { root.open = false; };
  let finishFade;
  root.animate = () => ({ finished: new Promise(resolve => { finishFade = resolve; }) });
  const starts = [];
  let closed = false;
  const handle = createTitleView(root, choices, id => starts.push(id), () => { closed = true; });
  return {
    handle, cards: group.children, skip, note, root, starts,
    focused: () => document.activeElement,
    closed: () => closed,
    finishFade: () => finishFade(),
    key(key, options) {
      const event = Object.assign(new Event('keydown', { cancelable: true }), { key, ...options });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    },
    blur() { document.activeElement = null; }
  };
}

test('first card receives focus and Enter starts the restored choice', () => {
  const title = openTitle();
  const [first, second] = title.cards;
  assert.equal(title.focused(), first);
  assert.deepEqual(first.children.map(child => child.textContent), ['첫 AI', '2.7GB']);
  assert.equal(first.children[0].children[0].textContent, '추천');
  title.handle.setSelected('second');
  assert.equal(second.attributes.get('aria-pressed'), 'true');
  assert.equal(title.key('Enter'), true);
  assert.deepEqual(title.starts, ['second']);
  assert.equal(title.closed(), true);
});

test('arrows and Tab wrap across the choices and AI-free button', () => {
  const title = openTitle();
  assert.equal(title.key('ArrowRight'), true);
  assert.equal(title.focused(), title.cards[1]);
  assert.equal(title.key('Tab'), true);
  assert.equal(title.focused(), title.skip);
  title.key('ArrowDown');
  assert.equal(title.focused(), title.cards[0]);
  title.key('Tab', { shiftKey: true });
  assert.equal(title.focused(), title.skip);
});

test('Tab restores card focus when focus leaves the buttons', () => {
  const title = openTitle();
  title.blur();
  assert.equal(title.key('Tab'), true);
  assert.equal(title.focused(), title.cards[1]);
});

test('AI unavailability disables the cards and leaves only AI-free start', () => {
  const title = openTitle();
  title.handle.setAiAvailable(false, 'WebGPU를 지원하지 않아요');
  title.handle.setSelected('second');
  assert.ok(title.cards.every(card => card.disabled));
  assert.equal(title.note.textContent, 'WebGPU를 지원하지 않아요');
  assert.equal(title.note.hidden, false);
  assert.equal(title.focused(), title.skip);
  title.cards[1].click();
  assert.deepEqual(title.starts, []);
  title.key('Enter');
  assert.deepEqual(title.starts, [null]);
});

test('a second activation during the fade cannot start the game again', async () => {
  const title = openTitle({ reduced: false });
  title.cards[0].click();
  assert.equal(title.root.open, true);
  title.skip.click();
  title.key('Enter');
  assert.deepEqual(title.starts, ['first']);
  assert.equal(title.closed(), false);
  title.finishFade();
  await Promise.resolve();
  assert.equal(title.root.open, false);
  assert.equal(title.closed(), true);
});

test('the AI-free button remains reachable when there are no AI choices', () => {
  const title = openTitle({ choices: [] });
  assert.equal(title.focused(), title.skip);
  assert.equal(title.key(' '), true);
  assert.deepEqual(title.starts, []);
  title.skip.click();
  assert.deepEqual(title.starts, [null]);
});
