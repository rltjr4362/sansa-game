/**
 * @param {HTMLDialogElement} root
 * @param {import('./contracts.js').TitleChoice[]} choices
 * @param {(id: string|null) => void} onStart
 * @param {() => void} onClose
 * @returns {import('./contracts.js').TitleHandle}
 */
export function createTitleView(root, choices, onStart, onClose) {
  const document = root.ownerDocument;
  const list = root.querySelector('#titleChoices');
  const note = root.querySelector('#titleNote');
  const skip = { id: null, button: root.querySelector('#titleSkip') };
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let selected, starting = false;

  const cards = choices.map(({ id, label, detail, recommended }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'title-card';
    const name = document.createElement('strong');
    name.textContent = label;
    const description = document.createElement('span');
    description.className = 'title-detail';
    description.textContent = detail;
    button.append(name, description);
    if (recommended) {
      const badge = document.createElement('span');
      badge.className = 'title-recommended';
      badge.textContent = '추천';
      name.append(badge);
    }
    return { id, button };
  });
  const entries = [...cards, skip];
  const enabled = () => entries.filter(({ button }) => !button.disabled);

  function select(entry) {
    if (selected === entry) return;
    selected?.button.setAttribute('aria-pressed', 'false');
    selected = entry;
    selected.button.setAttribute('aria-pressed', 'true');
  }
  function choose(entry) {
    select(entry);
    entry.button.focus();
  }
  function close() {
    listeners.abort();
    root.close();
    onClose();
  }
  function start(entry) {
    if (starting || entry.button.disabled) return;
    starting = true;
    try {
      onStart(entry.id);
    } finally {
      if (document.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) close();
      else root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' })
        .finished.then(close, close);
    }
  }

  for (const entry of entries) {
    entry.button.setAttribute('aria-pressed', 'false');
    entry.button.addEventListener('focus', () => { if (!starting) select(entry); }, options);
    entry.button.addEventListener('click', () => start(entry), options);
  }
  root.addEventListener('cancel', event => event.preventDefault(), options);
  // A click on the scrim can leave focus outside the buttons while the dialog is still modal.
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
        event.altKey || event.ctrlKey || event.metaKey) return;
    const { key } = event;
    if (key === ' ') {
      event.preventDefault();
    } else if (key === 'Enter') {
      event.preventDefault();
      if (!event.repeat) start(selected);
    } else if (['Tab', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(key)) {
      event.preventDefault();
      if (starting) return;
      const available = enabled();
      const delta = key === 'Tab' ? (event.shiftKey ? -1 : 1) : (key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1);
      const next = (available.indexOf(selected) + delta + available.length) % available.length;
      choose(available[next]);
    }
  }, options);

  list.replaceChildren(...cards.map(({ button }) => button));
  note.textContent = '';
  note.hidden = true;
  root.showModal();
  choose(entries[0]);

  return {
    setAiAvailable(ok, message) {
      if (starting) return;
      for (const { button } of cards) button.disabled = !ok;
      note.textContent = !ok && message ? message : '';
      note.hidden = !note.textContent;
      if (selected.button.disabled) choose(skip);
    },
    setSelected(id) {
      if (starting) return;
      const entry = entries.find(entry => entry.id === id);
      if (entry) choose(entry.button.disabled ? skip : entry);
    }
  };
}
