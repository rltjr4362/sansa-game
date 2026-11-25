export function createJournalView(dialog, onChange) {
  const entries = dialog.querySelector('#journalEntries');
  const empty = dialog.querySelector('#journalEmpty');
  const dismiss = dialog.querySelector('#journalClose');
  let previousFocus;

  function close() {
    if (!dialog.open) return;
    dialog.close();
    previousFocus?.focus({ preventScroll: true });
    onChange();
  }

  dismiss.addEventListener('click', close);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code !== 'KeyJ' && event.key.toLowerCase() !== 'j') return;
    event.preventDefault();
    if (!event.repeat) close();
  });

  return {
    isOpen: () => dialog.open,
    open(items) {
      previousFocus = document.activeElement;
      entries.replaceChildren(...items.map(({ title, lines }) => {
        const entry = document.createElement('section');
        const heading = document.createElement('h3');
        heading.textContent = title;
        entry.append(heading);
        for (const line of lines) {
          const text = document.createElement('p');
          text.textContent = line;
          entry.append(text);
        }
        return entry;
      }));
      empty.hidden = items.length > 0;
      dialog.showModal();
      dismiss.focus();
      onChange();
    }
  };
}
