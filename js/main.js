// Entry point: wires the input mirror, maxlength, dance button, and ripple.

import { danceLetters } from './dance.js';
import { clearSelection, renderLetters, syncSelection } from './mirror.js';
import { updateMaxLength } from './maxlength.js';
import { createRipple } from './ripple.js';

const btn = document.getElementById('btn');
const hiddenInput = document.getElementById('hidden-input');
const textInput = document.getElementById('text-input');
const wrapper = document.querySelector('.input-wrapper');

if (!btn || !hiddenInput || !textInput || !wrapper) {
  throw new Error('letter-dance: required DOM elements are missing');
}

// --- Input mirror -------------------------------------------------------

renderLetters(textInput, hiddenInput.value);

hiddenInput.addEventListener('input', () => {
  renderLetters(textInput, hiddenInput.value);
  clearSelection(textInput);
});

document.addEventListener('selectionchange', () => {
  if (document.activeElement !== hiddenInput) return;
  if (hiddenInput.selectionStart === hiddenInput.selectionEnd) {
    clearSelection(textInput);
    return;
  }
  syncSelection(textInput, hiddenInput);
});
hiddenInput.addEventListener('blur', () => clearSelection(textInput));

// --- Dynamic maxlength ---------------------------------------------------

function refreshMaxLength() {
  updateMaxLength({ wrapperEl: wrapper, mirrorEl: textInput, inputEl: hiddenInput });
}

refreshMaxLength();

let resizeQueued = false;
window.addEventListener('resize', () => {
  // Coalesce resize events to one recalculation per frame.
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    refreshMaxLength();
  });
});

// --- Dance ---------------------------------------------------------------

let isDancing = false;

async function startDance() {
  if (isDancing) return;
  isDancing = true;

  btn.disabled = true;
  btn.classList.add('dancing');

  try {
    await danceLetters(textInput.querySelectorAll('.letter'));
  } finally {
    isDancing = false;
    btn.classList.remove('dancing');
    btn.disabled = false;
  }
}

btn.addEventListener('click', (event) => {
  createRipple(event);
  startDance();
});
