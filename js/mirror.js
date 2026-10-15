// Letter-mirror: renders the hidden input's text as animatable letter spans
// and keeps the visual selection in sync.

const SPACE_SUBSTITUTE = '\u00A0';

/**
 * Render `text` as one `.letter` span per character inside `mirrorEl`.
 * Spaces become non-breaking spaces so they keep their width.
 */
export function renderLetters(mirrorEl, text) {
  mirrorEl.textContent = '';
  const fragment = document.createDocumentFragment();
  for (const char of text) {
    const span = document.createElement('span');
    span.className = 'letter';
    span.textContent = char === ' ' ? SPACE_SUBSTITUTE : char;
    fragment.appendChild(span);
  }
  mirrorEl.appendChild(fragment);
}

/**
 * Highlight mirrored letters in the [start, end) range to match the
 * hidden input's text selection.
 */
export function syncSelection(mirrorEl, inputEl) {
  const { selectionStart: start, selectionEnd: end } = inputEl;
  const spans = mirrorEl.querySelectorAll('.letter');
  spans.forEach((span, i) => {
    span.classList.toggle('selected', i >= start && i < end);
  });
}

export function clearSelection(mirrorEl) {
  mirrorEl
    .querySelectorAll('.letter.selected')
    .forEach((el) => el.classList.remove('selected'));
}
