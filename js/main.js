// Entry point: explicit state machine for Layer Swapping / Temporal Decoupling.
//
//   idle ──(button click)──▶ animating ──(dance resolves)──▶ idle
//
// - idle:      the <input> is a fully native control (caret, selection,
//              placeholder). The animation stage is dormant and empty.
// - animating: the input yields visually, an ephemeral stage is built over
//              it from a text snapshot, and the cascade runs on that stage.
// Afterwards the stage is torn down and the input restored untouched.

import { danceLetters } from './dance.js';
import { buildStage, teardownStage } from './stage.js';
import { updateMaxLength } from './maxlength.js';
import { createRipple } from './ripple.js';

const STATE_IDLE = 'idle';
const STATE_ANIMATING = 'animating';

const btn = document.getElementById('btn');
const textInput = document.getElementById('text-input');
const stage = document.getElementById('animation-stage');
const wrapper = document.querySelector('.input-wrapper');

if (!btn || !textInput || !stage || !wrapper) {
  throw new Error('letter-dance: required DOM elements are missing');
}

function getState() {
  return wrapper.dataset.state ?? STATE_IDLE;
}

function setState(next) {
  wrapper.dataset.state = next;
}

// --- Dynamic maxlength ---------------------------------------------------

function refreshMaxLength() {
  updateMaxLength({ wrapperEl: wrapper, inputEl: textInput });
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

async function startDance() {
  if (getState() !== STATE_IDLE) return;
  setState(STATE_ANIMATING);

  btn.disabled = true;
  btn.classList.add('dancing');

  try {
    const letters = buildStage(stage, textInput.value);
    await danceLetters(letters);
  } finally {
    teardownStage(stage);
    setState(STATE_IDLE);
    btn.classList.remove('dancing');
    btn.disabled = false;
  }
}

btn.addEventListener('click', (event) => {
  createRipple(event);
  startDance();
});
