/** @returns {import('./contracts.js').DialogueView} */
export function createDialogueView(dialog, onOpen) {
  const el = id => dialog.querySelector('#' + id);
  const input = el('dialogueInput');
  const optionsBox = el('dialogueOptions'), choicesBox = el('dialogueChoices');
  const submitHandlers = new Set(), choiceHandlers = new Set(), closeHandlers = new Set();
  let options = [], composing = false, previousFocus;

  function submit(text) {
    const content = text.trim();
    if (!dialog.open || !content) return;
    input.value = '';
    input.focus();
    for (const cb of submitHandlers) cb(content);
  }

  function buttons(box, items, render) {
    box.replaceChildren(...items.map(render));
    box.hidden = items.length === 0;
  }

  function button() {
    const node = document.createElement('button');
    node.type = 'button';
    return node;
  }

  function close() {
    if (!dialog.open) return;
    dialog.close();
    composing = false;
    previousFocus?.focus({ preventScroll: true });
    for (const cb of closeHandlers) cb();
  }

  const view = {
    open(title) {
      el('dialogueTitle').textContent = title;
      if (dialog.open) return;
      previousFocus = document.activeElement;
      view.setNpcText('');
      view.setThinking(false);
      view.setOptions([]);
      view.setChoices([]);
      view.setStatus('');
      input.value = '';
      onOpen();
      dialog.showModal();
      input.focus();
    },
    isOpen: () => dialog.open,
    setNpcText(text) { el('dialogueText').textContent = text; },
    setThinking(on) { el('dialogueThinking').hidden = !on; },
    setOptions(lines) {
      options = lines.slice(0, 3);
      buttons(optionsBox, options, (line, i) => {
        const node = button(), key = document.createElement('kbd');
        key.textContent = String(i + 1);
        node.append(key, line);
        node.addEventListener('click', () => submit(line));
        return node;
      });
    },
    setChoices(choices) {
      buttons(choicesBox, choices, ({ label, id }) => {
        const node = button();
        node.textContent = label;
        node.addEventListener('click', () => {
          input.focus();
          for (const cb of choiceHandlers) cb(id);
        });
        return node;
      });
    },
    setStatus(text) {
      const status = el('dialogueStatus');
      status.textContent = text;
      status.hidden = !text;
    },
    onSubmit: cb => { submitHandlers.add(cb); },
    onChoice: cb => { choiceHandlers.add(cb); },
    onClose: cb => { closeHandlers.add(cb); },
    close
  };

  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  el('dialogueForm').addEventListener('submit', event => event.preventDefault());
  el('dialogueSend').addEventListener('click', () => {
    if (!composing) submit(input.value);
  });
  dialog.addEventListener('keydown', event => {
    if (event.isComposing || composing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Enter' && event.target === input) {
      event.preventDefault();
      if (!event.repeat) submit(input.value);
    } else if (!input.value && !event.altKey && !event.ctrlKey && !event.metaKey &&
               /^[123]$/.test(event.key)) {
      const option = options[Number(event.key) - 1];
      if (option) {
        event.preventDefault();
        if (!event.repeat) submit(option);
      }
    }
  });
  el('dialogueClose').addEventListener('click', close);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  return view;
}
