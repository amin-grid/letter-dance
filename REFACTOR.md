# Letter Dance — Architecture & Refactor Notes

> An interactive text animation where clicking a button triggers a cascading letter‑jump effect.
> This document explains the **Layer Swapping / Temporal Decoupling** architecture,
> **what was refactored and why**, and contains the **full source of every major file**.

---

## Table of contents

1. [How to run](#1-how-to-run)
2. [Project structure](#2-project-structure)
3. [Architecture overview](#3-architecture-overview)
4. [What was refactored (and why)](#4-what-was-refactored-and-why)
5. [Antipattern catalogue](#5-antipattern-catalogue)
6. [Testing](#6-testing)
7. [Commit history](#7-commit-history)
8. [Full source code](#8-full-source-code)
   - [index.html](#indexhtml)
   - [css/style.css](#cssstylecss)
   - [js/main.js](#jsmainjs)
   - [js/config.js](#jsconfigjs)
   - [js/stage.js](#jsstagejs)
   - [js/dance.js](#jsdancejs)
   - [js/ripple.js](#jsripplejs)
   - [js/maxlength.js](#jsmaxlengthjs)
   - [playwright.config.js](#playwrightconfigjs)
   - [package.json](#packagejson)
   - [tests/baseline.spec.js](#testsbaselinespecjs)
   - [tests/behaviour.spec.js](#testsbehaviourspecjs)

---

## 1. How to run

```bash
# Install dependencies (Playwright + Chromium)
npm install
npx playwright install --with-deps chromium

# Serve the site locally (http://127.0.0.1:8080)
npm start

# Run the test suite (15 tests, starts its own server automatically)
npm test
```

No build step is needed — the site is plain HTML/CSS/JS loaded as native ES modules.

---

## 2. Project structure

```
letter-dance/
├── index.html              # Markup: native input + dormant stage + button
├── css/
│   └── style.css           # Fonts, native input, state-gated stage, button, ripple
├── js/
│   ├── main.js             # Entry point: idle -> animating -> idle state machine
│   ├── config.js           # Single source of truth for constants
│   ├── stage.js            # Ephemeral stage: build on click, teardown after dance
│   ├── dance.js            # Physics jump (Promise-based) + cascade
│   ├── ripple.js           # Material-style click ripple
│   └── maxlength.js        # Dynamic maxlength via canvas measurement
├── fonts/                  # Local Fredoka .ttf files (offline support)
├── tests/
│   ├── baseline.spec.js    # Native-idle + ephemeral-stage behaviour (7 tests)
│   └── behaviour.spec.js   # Decoupling guarantees (8 tests)
├── playwright.config.js    # Test runner + auto static server
└── package.json            # npm scripts: start / test
```

---

## 3. Architecture overview

### Layer Swapping / Temporal Decoupling

The key insight: **the user never needs to edit text and watch letters dance at
the exact same millisecond.** Editing and animation are separated in *time* —
only one layer is ever active:

```
idle ──(button click)──▶ animating ──(dance resolves)──▶ idle
```

**State 1 — Idle / Editing (the default).**
`#text-input` is a completely normal, visible, native `<input>`: OS caret, native
text selection, native placeholder, native `maxlength`. The `#animation-stage`
overlay is `display: none` and empty — zero DOM cost, zero listeners, zero
per-keystroke work. There is no mirroring of any kind.

**State 2 — Animating (button click).**
The wrapper flips to `data-state="animating"`. The input yields *visually only*
(`color: transparent`, `caret-color: transparent`, `pointer-events: none` — its
`value` is untouched), the stage becomes visible, `stage.js` snapshots the input
string into ephemeral `.letter` spans, and `dance.js` runs the physics cascade
on them. The button is disabled for the whole dance.

**State 3 — Cleanup.**
Once the `Promise.all` cascade resolves, `teardownStage()` removes every letter
node (in a `finally`, so it always runs), the wrapper returns to `data-state="idle"`,
and the button is re-enabled. No animation DOM survives the dance.

### The dance

Letter `i` starts jumping after `i × 150 ms`. Each jump integrates simple gravity
(`vy += g·dt`, `y += vy·dt`) via `requestAnimationFrame` until the letter lands
back at `y = 0`, then its Promise resolves.

### Module dependency graph

```
main.js ──┬──▶ stage.js       (buildStage, teardownStage)
          ├──▶ dance.js ──▶ config.js
          ├──▶ maxlength.js ──▶ config.js
          └──▶ ripple.js
```

`main.js` owns the state machine and event wiring; every behaviour lives in a
small, independently understandable module. `config.js`, `dance.js`, and
`ripple.js` are unchanged by the Layer Swapping refactor — only the editing
surface and its orchestration were replaced.

---

## 4. What was refactored (and why)

### Before (two generations of the same flaw)

- **Generation 1:** one 160-line `js/script.js` doing everything (God file).
- **Generation 2:** split into ES modules — but still built on the **twin-surface
  live-mirroring** pattern: a transparent-text `<input>` stacked over a `<div>`
  that re-rendered every keystroke, with native selection suppressed
  (`::selection { background: transparent }`) and faked via synthetic `.selected`
  classes. Editing fought the animation surface on every keystroke.

### After (this refactor)

| File | Responsibility |
|---|---|
| `js/config.js` | All constants: `MAX_LENGTH`, `GRAVITY`, `JUMP_FORCE`, `CASCADE_DELAY_MS`, `JUMP_TIMEOUT_MS`, `RIPPLE_DURATION_MS` (unchanged) |
| `js/stage.js` | **New.** `buildStage()` snapshots text into letters; `teardownStage()` wipes them. Replaces `mirror.js` (deleted). |
| `js/dance.js` | `jumpLetter()` returns a **Promise**; `danceLetters()` cascades with `Promise.all` + optional `AbortSignal` (unchanged) |
| `js/ripple.js` | Ripple creation with leak-proof cleanup (unchanged) |
| `js/maxlength.js` | Pure `computeMaxLength()` + canvas measurement; now reads the **input's own** font (no mirror exists) |
| `js/main.js` | Explicit `idle → animating → idle` state machine via `wrapper[data-state]`; no `input`/`selectionchange` listeners at all |

Markup & style changes:

- `#hidden-input.hidden-input` → `#text-input.text-input`: a clean native control
  with `placeholder` and `maxlength` attributes; the fake `:empty::before`
  placeholder is gone.
- `#text-input` mirror `<div>` → `#animation-stage.animation-stage`: `display: none`
  unless `.input-wrapper[data-state="animating"]`.
- `color: transparent` now exists **only** under the `animating` state (plus the
  benign `-webkit-tap-highlight-color`); `::selection` override and `.selected`
  rules deleted.
- Tests rewritten for the new architecture (see [Testing](#6-testing)).

---

## 5. Antipattern catalogue

Antipatterns eliminated across both refactors, and their fixes:

1. **Twin-surface live-mirroring (the fundamental flaw)** — a suppressed native
   input (`color: transparent`, hacked `::selection`) permanently stacked over a
   `<div>` re-rendered on every keystroke, with selection faked via synthetic
   classes.
   → **Layer Swapping / Temporal Decoupling**: one native input while editing;
   one ephemeral stage while animating; never both. `mirror.js`,
   `renderLetters`-on-`input`, the `selectionchange` listener, and every
   `.selected` rule deleted.

2. **God file / no separation of concerns**
   → Six single-responsibility ES modules.

3. **Magic numbers** (`1500`, `-600`, `150`, `1000`, `50`, `600` scattered through
   the code) → `js/config.js` as the single source of truth.

4. **Fire-and-forget timers** — the cascade used `setTimeout` per letter plus a
   hand-computed `totalDuration = letters × 150 + 1000` to re-enable the button.
   Any physics change desynced the button (stuck disabled, or re-enabled early).
   → `jumpLetter()` returns a Promise; `danceLetters()` awaits `Promise.all`;
   `startDance()` uses `try/finally` so the button and state **always** recover.

5. **Inline styles for state** (`btn.style.cursor`, `btn.style.opacity`)
   → `:disabled` CSS rule (`cursor: not-allowed`, dimmed, no hover effect);
   input yield handled by the `data-state` selector, not JS styles.

6. **Leaking DOM nodes** — the ripple was only removed on `animationend`, which
   never fires if the animation is interrupted (e.g. `display: none`, test env).
   → `{ once: true }` listener **plus** a timeout fallback; `ripple.remove()` is
   idempotent so double-removal is safe. Stage letters are wiped in `finally`.

7. **Layout thrash** — `calculateMaxLength()` appended a measuring `<span>` to the
   document, called `getComputedStyle` 3×, then removed the span — on **every**
   resize event.
   → Canvas 2D `measureText()` with a cached context (zero DOM churn), one
   `getComputedStyle` call, resize handler coalesced with `requestAnimationFrame`,
   and the math extracted as pure `computeMaxLength()`.

8. **Redundant work on every keystroke** — the mirror was re-split per keystroke
   with an extra `.slice()` even though the browser enforces native `maxLength`;
   each span appended individually (N reflows).
   → No per-keystroke work at all: the browser owns editing natively; letters are
   built once per dance via `DocumentFragment` (1 reflow).

9. **Unbounded `dt`** — after a backgrounded tab, the huge `requestAnimationFrame`
   gap made `y += vy·dt` fling the letter thousands of pixels.
   → `dt` clamped to 50 ms, plus a `JUMP_TIMEOUT_MS` safety net that can never leave
   the Promise (or button) hanging.

10. **Dead / confusing code** — duplicate `.letter` CSS rule, asymmetric ripple
    positioning math, `setTimeout(..., 0)` just to add a class, `padding: 12px 12px`,
    `main: index.js` + wrong `ISC` license in `package.json`, two separate `click`
    listeners on the same button, fake `:empty::before` placeholder.
    → Removed, simplified, merged into one listener; native `placeholder` used.

11. **No fail-fast** — a missing DOM id produced cryptic `Cannot read properties of
    null` errors.
    → Explicit guard in `main.js` throwing `letter-dance: required DOM elements
    are missing`.

---

## 6. Testing

### Strategy

1. **Native-idle lock**: `tests/baseline.spec.js` (7 tests) proves the input is
   100% native while editing (visible text, native selection range, native
   placeholder, no animation DOM on typing) and that a click builds an ephemeral
   stage, dances, and tears everything down.
2. **Decoupling guarantees**: `tests/behaviour.spec.js` (8 tests) proves the two
   surfaces never coexist (state attribute, pointer-events, snapshot semantics,
   teardown after every dance) and fails on any uncaught page error.
3. Every refactor commit was verified green (`npx playwright test` → 15/15) before
   committing.

### Test list

**baseline.spec.js** — page loads with title/default text/button (native visible
text, dormant empty stage, `data-state="idle"`); typing builds no animation DOM;
selection is fully native (intact range, zero synthetic highlights); empty input
shows native placeholder; click builds ephemeral stage (correct letters incl.
NBSP space), dances, then tears down (idle state, hidden empty stage, value
untouched); maxlength enforced (≤ 50, still no animation DOM); input text hidden
only while animating (color transparent during, restored after).

**behaviour.spec.js** — rapid clicks ignored (single cascade, teardown verified);
button re-enabled with empty text; ripple never leaks; disabled cursor via CSS;
input ignores pointer events while animating; stage snapshots the value at click
time (input value survives untouched); maxlength updates on resize within
[1, 50]; letters start in cascade order (first moving, last not yet).

---

## 7. Commit history

Small, individually verified commits (each green before committing):

```
cc5b818 refactor: drop unused wrapperEl param, fix stale mirror comment
dabad90 test: rewrite specs for Layer Swapping architecture (native idle, ephemeral stage)
4eb2f7e refactor: replace live-mirroring with Layer Swapping / Temporal Decoupling
d343cfa docs: add REFACTOR.md with refactor notes and full source
7e35152 test: add post-refactor behaviour tests (cascade, ripple, selection, resize)
f5ef528 refactor: move disabled button styling to CSS, fix padding, drop duplicate .letter rule
283a0ae refactor: split script into ES modules (config, mirror, dance, ripple, maxlength, main)
bcc6680 refactor: rename js/script.js to js/main.js and load as ES module
87a3ebe chore: ignore Playwright test output
983e86a test: add Playwright config and baseline behaviour tests
d1495ba chore: init npm project and add Playwright dev dependency
```

---

## 8. Full source code

### index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Letter Dance</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div class="container">
    <div class="input-wrapper" data-state="idle">
      <input type="text" id="text-input" class="text-input" value="HELLO WORLD" spellcheck="false" aria-label="Text to animate" placeholder="Type your text..." maxlength="50">
      <div id="animation-stage" class="animation-stage" aria-hidden="true"></div>
    </div>
    <button class="btn" id="btn">Click Me</button>
  </div>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

### css/style.css

```css
@font-face {
  font-family: 'Fredoka';
  src: url('../fonts/Fredoka-Regular.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Fredoka';
  src: url('../fonts/Fredoka-SemiBold.ttf') format('truetype');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Fredoka';
  src: url('../fonts/Fredoka-Bold.ttf') format('truetype');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f0f0;
  font-family: 'Fredoka', system-ui, sans-serif;
}

.container {
  text-align: center;
}

.input-wrapper {
  display: grid;
  width: 100%;
  max-width: 400px;
  margin: 0 auto 1.5rem;
  contain: layout;
}

.text-input {
  grid-area: 1 / 1;
  width: 100%;
  height: 3.5rem;
  padding: 0.75rem 1rem;
  font-family: inherit;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  color: #333;
  background: #fff;
  border: 2px solid #ddd;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.text-input:focus-visible {
  border-color: #6200ee;
  box-shadow: 0 0 0 3px rgba(98, 0, 238, 0.15);
}

.text-input::placeholder {
  color: #999;
  font-weight: 400;
}

/* Ephemeral animation stage: fully dormant until the wrapper
   enters the animating state. Letters overflow visibly so jumps
   are never clipped. */
.animation-stage {
  grid-area: 1 / 1;
  display: none;
  padding: 0.75rem 1rem;
  font-family: inherit;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  color: #333;
  pointer-events: none;
  white-space: nowrap;
  box-sizing: border-box;
}

.input-wrapper[data-state="animating"] .animation-stage {
  display: block;
}

/* While animating, the native input yields visually (value untouched)
   and ignores pointer input: editing and animation never overlap. */
.input-wrapper[data-state="animating"] .text-input {
  color: transparent;
  caret-color: transparent;
  pointer-events: none;
}

.input-wrapper[data-state="animating"] .text-input::placeholder {
  color: transparent;
}

.animation-stage .letter {
  display: inline-block;
}

.btn {
  position: relative;
  overflow: hidden;
  padding: 12px 24px;
  font-size: 1rem;
  border: none;
  border-radius: 4px;
  background-color: #6200ee;
  color: #fff;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.3s;
}

.btn:hover:not(:disabled) {
  background-color: #3700b3;
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.btn:active {
  transform: scale(0.97);
}

.btn.dancing:active {
  transform: scale(1);
}

.ripple {
  position: absolute;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.7);
  transform: scale(0);
  animation: ripple-animation 0.6s linear;
  pointer-events: none;
}

@keyframes ripple-animation {
  to {
    transform: scale(4);
    opacity: 0;
  }
}
```

### js/main.js

```js
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
  updateMaxLength({ inputEl: textInput });
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
```

### js/config.js

```js
// Shared constants for the letter-dance app.
// Single source of truth for physics, timing, and limits.

export const MAX_LENGTH = 50;

// Physics (pixels / seconds) for the letter jump animation.
export const GRAVITY = 1500;
export const JUMP_FORCE = -600;

// Milliseconds between the start of each letter's jump.
export const CASCADE_DELAY_MS = 150;

// Upper bound in ms for a single letter jump (physics settles in ~800ms).
export const JUMP_TIMEOUT_MS = 1000;

// Ripple effect duration in ms (must match CSS animation duration).
export const RIPPLE_DURATION_MS = 600;
```

### js/stage.js

```js
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
```

### js/dance.js

```js
// Dance animation: physics-based letter jumps with a cascade delay.
// Each jump returns a Promise so the cascade can be awaited instead of
// relying on hardcoded setTimeout totals.

import { CASCADE_DELAY_MS, GRAVITY, JUMP_FORCE, JUMP_TIMEOUT_MS } from './config.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Animate a single jump of `letterEl` using simple gravity integration.
 * Resolves when the letter lands back at y=0.
 */
export function jumpLetter(letterEl) {
  return new Promise((resolve) => {
    let vy = JUMP_FORCE;
    let y = 0;
    let lastTime = null;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      letterEl.style.transform = 'translateY(0)';
      resolve();
    };

    // Safety net: never leave the promise (or the button) hanging.
    const timeoutId = setTimeout(finish, JUMP_TIMEOUT_MS);

    function animate(timestamp) {
      if (finished) return;
      if (lastTime === null) {
        lastTime = timestamp;
        requestAnimationFrame(animate);
        return;
      }
      // Clamp dt so a backgrounded tab (huge rAF gap) can't fling the letter.
      const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
      lastTime = timestamp;

      vy += GRAVITY * dt;
      y += vy * dt;

      letterEl.style.transform = `translateY(${y}px)`;

      if (y < 0) {
        requestAnimationFrame(animate);
      } else {
        clearTimeout(timeoutId);
        finish();
      }
    }

    requestAnimationFrame(animate);
  });
}

/**
 * Jump each letter with a cascade delay. Resolves when all landed.
 * An optional AbortSignal cancels remaining jumps.
 */
export async function danceLetters(letterEls, { signal } = {}) {
  const jumps = [...letterEls].map(async (letter, index) => {
    await delay(index * CASCADE_DELAY_MS);
    if (signal?.aborted) return;
    await jumpLetter(letter);
  });
  await Promise.all(jumps);
}
```

### js/ripple.js

```js
// Material-style click ripple for buttons.

/**
 * Spawn a ripple inside `button` at the click point of `event`.
 * The element removes itself when its CSS animation ends (with a
 * timeout fallback so it never leaks if the animation is interrupted).
 */
export function createRipple(event) {
  const button = event.currentTarget;
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

  const remove = () => ripple.remove();
  ripple.addEventListener('animationend', remove, { once: true });
  // Fallback: animationend may never fire (display:none, test env, etc.)
  setTimeout(remove, 1000);

  button.appendChild(ripple);
}
```

### js/maxlength.js

```js
// Dynamic maxlength: caps the input length to what fits the visible width
// (up to MAX_LENGTH), measured with a canvas so no DOM nodes are created.

import { MAX_LENGTH } from './config.js';

let measureContext = null;

function getMeasureContext() {
  if (!measureContext) {
    measureContext = document.createElement('canvas').getContext('2d');
  }
  return measureContext;
}

/**
 * Compute how many characters fit in `availableWidth`, given the input's font.
 * Returns a value in [1, MAX_LENGTH]. Pure (no DOM side effects).
 */
export function computeMaxLength(availableWidth, font) {
  const ctx = getMeasureContext();
  ctx.font = font;
  const charWidth = ctx.measureText('M').width || 1;
  const maxChars = Math.max(1, Math.floor(availableWidth / charWidth));
  return Math.min(MAX_LENGTH, maxChars);
}

/**
 * Recompute and apply the maxlength for `inputEl` based on the current
 * width of `wrapperEl` and the input's own font.
 */
export function updateMaxLength({ inputEl }) {
  const style = getComputedStyle(inputEl);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const availableWidth = inputEl.clientWidth - padding;
  const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const maxLength = computeMaxLength(availableWidth, font);
  inputEl.maxLength = maxLength;
  return maxLength;
}
```

### playwright.config.js

```js
// Playwright configuration for the letter-dance static site.
// A tiny static file server is started automatically so tests always
// run against http://127.0.0.1:8080 (reusing it if already running).
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8080',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'python3 -m http.server 8080 --directory .',
    url: 'http://127.0.0.1:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

### package.json

```json
{
  "name": "letter-dance",
  "version": "1.0.0",
  "description": "An interactive text animation where clicking a button triggers a cascading letter‑jump effect.",
  "scripts": {
    "start": "python3 -m http.server 8080 --directory .",
    "test": "playwright test"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/amin-grid/letter-dance.git"
  },
  "keywords": [],
  "author": "",
  "license": "MIT",
  "type": "commonjs",
  "bugs": {
    "url": "https://github.com/amin-grid/letter-dance/issues"
  },
  "homepage": "https://github.com/amin-grid/letter-dance#readme",
  "devDependencies": {
    "@playwright/test": "^1.64.1"
  }
}
```

### tests/baseline.spec.js

```js
const { test, expect } = require('@playwright/test');

// Baseline behaviour of the letter-dance page under the
// Layer Swapping / Temporal Decoupling architecture:
// - idle: the input is 100% native (visible text, native caret/selection,
//   native placeholder), the animation stage is dormant and empty.
// - animating: an ephemeral stage over the input dances, then is torn down.

test.describe('letter-dance baseline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads with title, default text and button', async ({ page }) => {
    await expect(page).toHaveTitle('Letter Dance');

    const textInput = page.locator('#text-input');
    await expect(textInput).toHaveValue('HELLO WORLD');

    // Idle: native visible text, empty dormant stage.
    await expect(textInput).toBeVisible();
    const color = await textInput.evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toBe('rgba(0, 0, 0, 0)');
    await expect(page.locator('#animation-stage .letter')).toHaveCount(0);
    await expect(page.locator('.input-wrapper')).toHaveAttribute('data-state', 'idle');

    await expect(page.locator('#btn')).toHaveText('Click Me');
    await expect(page.locator('#btn')).toBeEnabled();
  });

  test('typing in the input does not build animation DOM', async ({ page }) => {
    const textInput = page.locator('#text-input');
    await textInput.fill('AB');
    await expect(textInput).toHaveValue('AB');

    // No live mirroring: the stage stays empty while editing.
    await expect(page.locator('#animation-stage .letter')).toHaveCount(0);
    await expect(page.locator('#animation-stage')).toBeHidden();
  });

  test('selection is fully native (no synthetic highlight)', async ({ page }) => {
    const textInput = page.locator('#text-input');
    await textInput.fill('ABC');
    await textInput.focus();
    await page.evaluate(() => {
      document.getElementById('text-input').setSelectionRange(0, 2);
    });

    // Native selection range is intact...
    const selection = await textInput.evaluate((el) => [
      el.selectionStart,
      el.selectionEnd,
    ]);
    expect(selection).toEqual([0, 2]);
    // ...and no synthetic highlight elements exist.
    await expect(page.locator('.letter.selected')).toHaveCount(0);
    await expect(page.locator('#animation-stage .letter')).toHaveCount(0);
  });

  test('empty input shows native placeholder', async ({ page }) => {
    const textInput = page.locator('#text-input');
    await textInput.fill('');
    await expect(page.locator('#animation-stage .letter')).toHaveCount(0);
    await expect(textInput).toHaveAttribute('placeholder', 'Type your text...');
  });

  test('clicking the button builds an ephemeral stage, dances, then tears it down', async ({
    page,
  }) => {
    const btn = page.locator('#btn');
    const wrapper = page.locator('.input-wrapper');
    const stage = page.locator('#animation-stage');

    await btn.click();

    // Animating state: button disabled, wrapper flagged, stage populated
    // from a snapshot of the input value.
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveClass(/dancing/);
    await expect(wrapper).toHaveAttribute('data-state', 'animating');
    const stageLetters = stage.locator('.letter');
    await expect(stageLetters).toHaveCount('HELLO WORLD'.length);
    await expect(stageLetters.first()).toHaveText('H');
    await expect(stageLetters.nth(5)).toHaveText('\u00A0');

    // Letters animate: at least the first letter should leave y=0 quickly.
    await page.waitForFunction(() => {
      const first = document.querySelector('#animation-stage .letter');
      if (!first) return false;
      const t = first.style.transform;
      return t !== '' && t !== 'translateY(0)' && t !== 'translateY(0px)';
    });

    // Ripple element is created on click and removed after animation.
    await expect(page.locator('#btn .ripple')).toHaveCount(0, { timeout: 3000 });

    // After the full cascade ("HELLO WORLD", 11 chars):
    // 11*150 + 1000 = 2650ms, allow margin.
    await expect(btn).toBeEnabled({ timeout: 8000 });
    await expect(btn).not.toHaveClass(/dancing/);
    await expect(wrapper).toHaveAttribute('data-state', 'idle');

    // Stage fully torn down; native input value untouched and visible.
    await expect(stageLetters).toHaveCount(0);
    await expect(stage).toBeHidden();
    await expect(page.locator('#text-input')).toHaveValue('HELLO WORLD');
  });

  test('input enforces a maxlength (dynamic, capped at 50)', async ({ page }) => {
    const maxLength = await page.locator('#text-input').evaluate((el) => el.maxLength);
    expect(maxLength).toBeGreaterThan(0);
    expect(maxLength).toBeLessThanOrEqual(50);

    // Typing beyond maxlength is truncated by the browser.
    await page.locator('#text-input').fill('x'.repeat(60));
    const value = await page.locator('#text-input').inputValue();
    expect(value.length).toBeLessThanOrEqual(50);
    // Still no animation DOM after typing.
    await expect(page.locator('#animation-stage .letter')).toHaveCount(0);
  });

  test('input text is hidden only while animating', async ({ page }) => {
    const textInput = page.locator('#text-input');

    const idleColor = await textInput.evaluate((el) => getComputedStyle(el).color);
    expect(idleColor).not.toBe('rgba(0, 0, 0, 0)');

    await page.locator('#btn').click();
    await expect(page.locator('.input-wrapper')).toHaveAttribute(
      'data-state',
      'animating'
    );
    const animatingColor = await textInput.evaluate((el) => getComputedStyle(el).color);
    expect(animatingColor).toBe('rgba(0, 0, 0, 0)');

    await expect(page.locator('#btn')).toBeEnabled({ timeout: 8000 });
    const restoredColor = await textInput.evaluate((el) => getComputedStyle(el).color);
    expect(restoredColor).toBe(idleColor);
  });
});
```

### tests/behaviour.spec.js

```js
const { test, expect } = require('@playwright/test');

// Behavioural guarantees under Layer Swapping / Temporal Decoupling:
// the editing surface and the animation surface never coexist.

test.describe('letter-dance behaviour', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Fail the test on any uncaught page error.
    page.on('pageerror', (err) => {
      throw err;
    });
  });

  test('rapid clicks during a dance are ignored (single cascade)', async ({ page }) => {
    const btn = page.locator('#btn');
    // Triple-click quickly; the state guard must prevent overlapping dances.
    await btn.click();
    await btn.click({ force: true }).catch(() => {});
    await btn.click({ force: true }).catch(() => {});

    // Still exactly one dance: button re-enables after one cascade,
    // state returns to idle, stage is torn down.
    await expect(btn).toBeEnabled({ timeout: 8000 });
    await expect(btn).not.toHaveClass(/dancing/);
    await expect(page.locator('.input-wrapper')).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('#animation-stage .letter')).toHaveCount(0);
  });

  test('button is re-enabled even with empty text (no letters)', async ({ page }) => {
    await page.locator('#text-input').fill('');
    await page.locator('#btn').click();
    await expect(page.locator('#btn')).toBeEnabled({ timeout: 5000 });
    await expect(page.locator('.input-wrapper')).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('#animation-stage .letter')).toHaveCount(0);
  });

  test('ripple element never leaks (removed after animation)', async ({ page }) => {
    await page.locator('#btn').click();
    await expect(page.locator('#btn .ripple')).toHaveCount(0, { timeout: 3000 });
    await expect(page.locator('#btn')).toBeEnabled({ timeout: 8000 });
  });

  test('disabled button has not-allowed cursor via CSS', async ({ page }) => {
    const btn = page.locator('#btn');
    await btn.click();
    await expect(btn).toBeDisabled();
    const cursor = await btn.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe('not-allowed');
    await expect(btn).toBeEnabled({ timeout: 8000 });
  });

  test('input ignores pointer events while animating', async ({ page }) => {
    await page.locator('#btn').click();
    await expect(page.locator('.input-wrapper')).toHaveAttribute(
      'data-state',
      'animating'
    );
    const pointerEvents = await page
      .locator('#text-input')
      .evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(pointerEvents).toBe('none');
    await expect(page.locator('#btn')).toBeEnabled({ timeout: 8000 });
  });

  test('stage snapshots the value at click time', async ({ page }) => {
    const textInput = page.locator('#text-input');
    await textInput.fill('ABC');
    await page.locator('#btn').click();

    // Stage reflects the clicked-time value...
    const stageLetters = page.locator('#animation-stage .letter');
    await expect(stageLetters).toHaveCount(3);

    // ...and the input value survives the dance untouched.
    await expect(page.locator('#btn')).toBeEnabled({ timeout: 8000 });
    await expect(textInput).toHaveValue('ABC');
    await expect(stageLetters).toHaveCount(0);
  });

  test('maxlength updates on resize and stays within [1, 50]', async ({ page }) => {
    const maxLength = async () =>
      page.locator('#text-input').evaluate((el) => el.maxLength);

    await page.setViewportSize({ width: 1200, height: 800 });
    const wide = await maxLength();
    await page.setViewportSize({ width: 320, height: 800 });
    const narrow = await maxLength();

    expect(wide).toBeGreaterThanOrEqual(1);
    expect(wide).toBeLessThanOrEqual(50);
    expect(narrow).toBeGreaterThanOrEqual(1);
    expect(narrow).toBeLessThanOrEqual(50);
    expect(narrow).toBeLessThanOrEqual(wide);
  });

  test('cascade timing: letters start in order', async ({ page }) => {
    await page.locator('#text-input').fill('ABCDE');
    await page.locator('#btn').click();

    // Sample transforms shortly after click: first letter should already
    // be moving while the last one has not started yet (4*150=600ms delay).
    await page.waitForTimeout(150);
    const snapshot = await page
      .locator('#animation-stage .letter')
      .evaluateAll((els) => els.map((el) => el.style.transform));
    expect(snapshot).toHaveLength(5);
    expect(snapshot[0]).not.toBe('');
    expect(snapshot[4]).toBe('');

    await expect(page.locator('#btn')).toBeEnabled({ timeout: 8000 });
    await expect(page.locator('#animation-stage .letter')).toHaveCount(0);
  });
});
```
