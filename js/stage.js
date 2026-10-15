// Ephemeral animation stage: builds letter spans on demand for the dance
// and tears them down afterwards. Nothing here persists between dances —
// during idle/editing the input is 100% native and this layer is dormant.

const SPACE_SUBSTITUTE = '\u00A0';

/**
 * Snapshot `text` into one `.letter` span per character inside `stageEl`.
 * Spaces become non-breaking spaces so they keep their width.
 * Returns the created letter elements.
 */
export function buildStage(stageEl, text) {
  stageEl.textContent = '';
  const fragment = document.createDocumentFragment();
  for (const char of text) {
    const span = document.createElement('span');
    span.className = 'letter';
    span.textContent = char === ' ' ? SPACE_SUBSTITUTE : char;
    fragment.appendChild(span);
  }
  stageEl.appendChild(fragment);
  return stageEl.querySelectorAll('.letter');
}

/**
 * Completely teardown the stage: remove all letter nodes so no
 * animation DOM survives after the dance.
 */
export function teardownStage(stageEl) {
  stageEl.textContent = '';
}
