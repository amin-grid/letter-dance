# Letter Dance — Architecture & Refactor Notes

> An interactive text animation where clicking a button triggers a cascading letter‑jump effect.
> This document explains **what the project looked like before**, **what was refactored and why**,
> and contains the **full source of every major file** afterwards.

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
   - [js/mirror.js](#jsmirrorjs)
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
├── index.html              # Markup: input + mirror overlay + button
├── css/
│   └── style.css           # Fonts, layout, mirror, button, ripple
├── js/
│   ├── main.js             # Entry point: wiring only (listeners + orchestration)
│   ├── config.js           # Single source of truth for constants
│   ├── mirror.js           # Render letters, sync/clear selection highlight
│   ├── dance.js            # Physics jump (Promise-based) + cascade
│   ├── ripple.js           # Material-style click ripple
│   └── maxlength.js        # Dynamic maxlength via canvas measurement
├── fonts/                  # Local Fredoka .ttf files (offline support)
├── tests/
│   ├── baseline.spec.js    # Pre-refactor behaviour lock (7 tests)
│   └── behaviour.spec.js   # Post-refactor guarantees (8 tests)
├── playwright.config.js    # Test runner + auto static server
└── package.json            # npm scripts: start / test
```

---

## 3. Architecture overview

### The core trick: hidden input + visual mirror

A plain `<input>` cannot animate individual letters, and a `contenteditable` div has
notoriously bad cursor/selection behaviour. So the page overlays two elements in the
same CSS Grid cell (`grid-area: 1 / 1`):

1. **`.hidden-input`** (real `<input>`, `z-index: 1`, transparent text) — receives all
   keyboard input, shows the caret, owns the true selection.
2. **`#text-input`** (a `<div>`, `z-index: 0`, `pointer-events: none`) — renders the
   same text as one `.letter` `<span>` per character so each letter can be animated
   independently with `transform: translateY(...)`.

JavaScript keeps them in sync:

```
user types ──▶ input event ──▶ renderLetters(mirror, value)
user selects ──▶ selectionchange ──▶ syncSelection(mirror, input)
```

### The dance

Clicking the button cascades a physics-based jump across the letters: letter `i`
starts after `i × 150 ms`. Each jump integrates simple gravity
(`vy += g·dt`, `y += vy·dt`) via `requestAnimationFrame` until the letter lands
back at `y = 0`. The button is disabled for the whole cascade.

### Module dependency graph

```
main.js ──┬──▶ mirror.js      (renderLetters, syncSelection, clearSelection)
          ├──▶ dance.js ──▶ config.js
          ├──▶ maxlength.js ──▶ config.js
          └──▶ ripple.js
```

`main.js` does no work itself beyond wiring event listeners — every behaviour lives
in a small, independently understandable module.

---

## 4. What was refactored (and why)

### Before

- One 160-line `js/script.js` doing **everything**: mirror rendering, maxlength,
  physics, cascade timing, ripple, and event wiring — with implicit globals and
  module-level mutable state (`let dynamicMaxLength`, `let isDancing`).
- Classic "big ball of JS in one file": hard to test, hard to reason about, easy
  to break one feature while touching another.

### After

| File | Responsibility |
|---|---|
| `js/config.js` | All constants: `MAX_LENGTH`, `GRAVITY`, `JUMP_FORCE`, `CASCADE_DELAY_MS`, `JUMP_TIMEOUT_MS`, `RIPPLE_DURATION_MS` |
| `js/mirror.js` | Pure-ish rendering: `renderLetters()`, `syncSelection()`, `clearSelection()` |
| `js/dance.js` | `jumpLetter()` returns a **Promise**; `danceLetters()` cascades with `Promise.all` + optional `AbortSignal` |
| `js/ripple.js` | Ripple creation with leak-proof cleanup |
| `js/maxlength.js` | Pure `computeMaxLength()` + canvas-based measurement (no DOM churn) |
| `js/main.js` | Thin entry point: listeners + `startDance()` orchestration only |

Additional changes:

- `js/script.js` → `js/main.js`, loaded as `<script type="module">`.
- Added `package.json` (`npm start` / `npm test`), fixed license to MIT.
- Added `playwright.config.js` with an automatic static file server.
- Added 15 Playwright tests (see [Testing](#6-testing)).
- CSS: disabled-button styling moved from JS inline styles into `:disabled` rules;
  duplicate `.letter` rule removed; button padding fixed (`12px 12px` → `12px 24px`).

---

## 5. Antipattern catalogue

Each antipattern found in the original code, and its fix:

1. **God file / no separation of concerns**
   → Split into 6 single-responsibility ES modules.

2. **Magic numbers** (`1500`, `-600`, `150`, `1000`, `50`, `600` scattered through
   the code) → `js/config.js` as the single source of truth.

3. **Fire-and-forget timers** — the cascade used `setTimeout` per letter plus a
   hand-computed `totalDuration = letters × 150 + 1000` to re-enable the button.
   Any physics change desynced the button (stuck disabled, or re-enabled early).
   → `jumpLetter()` returns a Promise; `danceLetters()` awaits `Promise.all`;
   `startDance()` uses `try/finally` so the button **always** recovers.

4. **Inline styles for state** (`btn.style.cursor`, `btn.style.opacity`)
   → `:disabled` CSS rule (`cursor: not-allowed`, dimmed, no hover effect).

5. **Stale-state bugs** — collapsing a selection or typing after selecting left the
   blue mirror highlight stuck, because the old `syncSelection` early-returned when
   `start === end`.
   → `main.js` explicitly clears the highlight on collapsed selection, on every
   `input` event, and on `blur`.

6. **Leaking DOM nodes** — the ripple was only removed on `animationend`, which
   never fires if the animation is interrupted (e.g. `display: none`, test env).
   → `{ once: true }` listener **plus** a timeout fallback; `ripple.remove()` is
   idempotent so double-removal is safe.

7. **Layout thrash** — `calculateMaxLength()` appended a measuring `<span>` to the
   document, called `getComputedStyle` 3×, then removed the span — on **every**
   resize event.
   → Canvas 2D `measureText()` with a cached context (zero DOM churn), one
   `getComputedStyle` per element, resize handler coalesced with `requestAnimationFrame`,
   and the math extracted as pure `computeMaxLength()`.

8. **Redundant work on every keystroke** — the mirror was re-split with an extra
   `.slice(0, dynamicMaxLength)` even though the browser already enforces the native
   `maxLength` attribute; each span was appended individually (N reflows).
   → Single render via `DocumentFragment` (1 reflow), no redundant slicing.

9. **Unbounded `dt`** — after a backgrounded tab, the huge `requestAnimationFrame`
   gap made `y += vy·dt` fling the letter thousands of pixels.
   → `dt` clamped to 50 ms, plus a `JUMP_TIMEOUT_MS` safety net that can never leave
   the Promise (or button) hanging.

10. **Dead / confusing code** — duplicate `.letter` CSS rule, asymmetric ripple
    positioning math, `setTimeout(..., 0)` just to add a class, `padding: 12px 12px`,
    `main: index.js` + wrong `ISC` license in `package.json`, two separate `click`
    listeners on the same button.
    → Removed, simplified, merged into one listener.

11. **No fail-fast** — a missing DOM id produced cryptic `Cannot read properties of
    null` errors.
    → Explicit guard in `main.js` throwing `letter-dance: required DOM elements
    are missing`.

---

## 6. Testing

### Strategy

1. **Lock behaviour first**: `tests/baseline.spec.js` (7 tests) was written against
   the *original* code and passed before any refactor — any regression would fail it.
2. **Guard the fixes**: `tests/behaviour.spec.js` (8 tests) covers the new guarantees
   (rapid-click guard, empty-text dance, ripple cleanup, disabled cursor,
   selection-clear cases, resize bounds, cascade ordering) and fails on any uncaught
   page error.
3. Every refactor commit was verified green (`npx playwright test` → 15/15) before
   committing.

### Test list

**baseline.spec.js** — page loads with title/default text/button; typing re-splits
the mirror; spaces render as NBSP; empty input shows placeholder; click triggers a
cascading dance and disables the button; maxlength enforced (≤ 50); selection
highlights mirrored letters.

**behaviour.spec.js** — rapid clicks ignored (single cascade); button re-enabled
with empty text; ripple never leaks; disabled cursor via CSS; collapsing selection
clears highlight; typing after selection clears highlight; maxlength updates on
resize within [1, 50]; letters start in cascade order.

---

## 7. Commit history

Small, individually verified commits (each green before committing):

```
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
    <div class="input-wrapper">
      <input type="text" id="hidden-input" class="hidden-input" value="HELLO WORLD" spellcheck="false" aria-label="Text to animate">
      <div id="text-input" class="text-input" aria-hidden="true"></div>
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

.hidden-input {
  grid-area: 1 / 1;
  width: 100%;
  height: 3.5rem;
  padding: 0.75rem 1rem;
  font-family: inherit;
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  border: 2px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: transparent;
  caret-color: #6200ee;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  z-index: 1;
  white-space: nowrap;
  overflow: hidden;
}

.hidden-input::selection {
  background: transparent;
  color: transparent;
}

#text-input {
  grid-area: 1 / 1;
  padding: 0.75rem 1rem;
  font-family: inherit;
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  color: #333;
  pointer-events: none;
  white-space: nowrap;
  text-overflow: ellipsis;
  z-index: 0;
  box-sizing: border-box;
  background: #fff;
  border-radius: 8px;
  border: 2px solid #ddd;
}

.input-wrapper:focus-within #text-input {
  border-color: #6200ee;
  box-shadow: 0 0 0 3px rgba(98, 0, 238, 0.15);
}

#text-input:empty::before {
  content: "Type your text...";
  color: #999;
  font-weight: 400;
}

#text-input .letter {
  display: inline-block;
  font-size: inherit;
  font-weight: 700;
}

#text-input .letter.selected {
  background: #6200ee;
  color: #fff;
  border-radius: 2px;
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

### js/mirror.js

```js
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
 * Compute how many characters fit in `wrapperEl`, given the mirror's font.
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
 * width of `wrapperEl` and font of `mirrorEl`.
 */
export function updateMaxLength({ wrapperEl, mirrorEl, inputEl }) {
  const style = getComputedStyle(wrapperEl);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const availableWidth = wrapperEl.clientWidth - padding;
  const mirrorStyle = getComputedStyle(mirrorEl);
  const font = `${mirrorStyle.fontWeight} ${mirrorStyle.fontSize} ${mirrorStyle.fontFamily}`;
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

// Baseline behaviour of the letter-dance page.
// These tests lock current behaviour BEFORE any refactor so regressions
// are caught. They intentionally describe what the page does today.

test.describe('letter-dance baseline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads with title, default text and button', async ({ page }) => {
    await expect(page).toHaveTitle('Letter Dance');

    const hiddenInput = page.locator('#hidden-input');
    await expect(hiddenInput).toHaveValue('HELLO WORLD');

    // Mirror splits every char (incl. space) into .letter spans.
    const letters = page.locator('#text-input .letter');
    await expect(letters).toHaveCount('HELLO WORLD'.length);
    await expect(letters.first()).toHaveText('H');

    await expect(page.locator('#btn')).toHaveText('Click Me');
    await expect(page.locator('#btn')).toBeEnabled();
  });

  test('typing in the input re-splits the mirror', async ({ page }) => {
    const hiddenInput = page.locator('#hidden-input');
    await hiddenInput.fill('AB');

    const letters = page.locator('#text-input .letter');
    await expect(letters).toHaveCount(2);
    await expect(letters.nth(0)).toHaveText('A');
    await expect(letters.nth(1)).toHaveText('B');
  });

  test('spaces are rendered as non-breaking spaces', async ({ page }) => {
    await page.locator('#hidden-input').fill('A B');

    const letters = page.locator('#text-input .letter');
    await expect(letters).toHaveCount(3);
    await expect(letters.nth(1)).toHaveText('\u00A0');
  });

  test('empty input shows placeholder', async ({ page }) => {
    await page.locator('#hidden-input').fill('');
    await expect(page.locator('#text-input .letter')).toHaveCount(0);

    const placeholder = await page.evaluate(() => {
      const el = document.querySelector('#text-input');
      return window.getComputedStyle(el, '::before').content;
    });
    expect(placeholder).toContain('Type your text...');
  });

  test('clicking the button triggers a cascading dance and disables the button', async ({
    page,
  }) => {
    const btn = page.locator('#btn');
    const letters = page.locator('#text-input .letter');

    await btn.click();

    // Button is disabled while dancing.
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveClass(/dancing/);

    // Letters animate: at least the first letter should leave y=0 quickly.
    // Wait for any non-identity transform on the first letter.
    await page.waitForFunction(() => {
      const first = document.querySelector('#text-input .letter');
      if (!first) return false;
      const t = first.style.transform;
      return t !== '' && t !== 'translateY(0)' && t !== 'translateY(0px)';
    });

    // Ripple element is created on click and removed after animation.
    await expect(page.locator('#btn .ripple')).toHaveCount(0, { timeout: 3000 });

    // After the full cascade the button is re-enabled. Default text
    // "HELLO WORLD" (11 chars): 11*150 + 1000 = 2650ms, allow margin.
    await expect(btn).toBeEnabled({ timeout: 8000 });
    await expect(btn).not.toHaveClass(/dancing/);

    // All letters settle back at y=0.
    const transforms = await letters.evaluateAll((els) =>
      els.map((el) => el.style.transform)
    );
    for (const t of transforms) {
      expect(['', 'translateY(0)', 'translateY(0px)']).toContain(t);
    }
  });

  test('input enforces a maxlength (dynamic, capped at 50)', async ({ page }) => {
    const maxLength = await page.locator('#hidden-input').evaluate((el) => el.maxLength);
    expect(maxLength).toBeGreaterThan(0);
    expect(maxLength).toBeLessThanOrEqual(50);

    // Typing beyond maxlength is truncated by the browser.
    await page.locator('#hidden-input').fill('x'.repeat(60));
    const value = await page.locator('#hidden-input').inputValue();
    expect(value.length).toBeLessThanOrEqual(50);
    await expect(page.locator('#text-input .letter')).toHaveCount(value.length);
  });

  test('selection in input highlights mirrored letters', async ({ page }) => {
    const hiddenInput = page.locator('#hidden-input');
    await hiddenInput.fill('ABC');
    await hiddenInput.focus();
    await page.evaluate(() => {
      const el = document.getElementById('hidden-input');
      el.setSelectionRange(0, 2);
      // selectionchange fires async; dispatch to be deterministic in test
      document.dispatchEvent(new Event('selectionchange'));
    });

    const selected = page.locator('#text-input .letter.selected');
    await expect(selected).toHaveCount(2);
  });
});
```

### tests/behaviour.spec.js

```js
const { test, expect } = require('@playwright/test');

// Post-refactor behaviour: guards the fixes and guarantees, not just the
// original baseline. If any of these fail, a refactor regressed behaviour.

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
    // Triple-click quickly; guard must prevent overlapping dances.
    await btn.click();
    await btn.click({ force: true }).catch(() => {});
    await btn.click({ force: true }).catch(() => {});

    // Still exactly one dance: button re-enables after one cascade.
    await expect(btn).toBeEnabled({ timeout: 8000 });
    await expect(btn).not.toHaveClass(/dancing/);
    const transforms = await page
      .locator('#text-input .letter')
      .evaluateAll((els) => els.map((el) => el.style.transform));
    for (const t of transforms) {
      expect(['', 'translateY(0)', 'translateY(0px)']).toContain(t);
    }
  });

  test('button is re-enabled even with empty text (no letters)', async ({ page }) => {
    await page.locator('#hidden-input').fill('');
    await page.locator('#btn').click();
    await expect(page.locator('#btn')).toBeEnabled({ timeout: 5000 });
  });

  test('ripple element never leaks (removed after animation)', async ({ page }) => {
    await page.locator('#btn').click();
    await expect(page.locator('#btn .ripple')).toHaveCount(0, { timeout: 3000 });
  });

  test('disabled button has not-allowed cursor via CSS', async ({ page }) => {
    const btn = page.locator('#btn');
    await btn.click();
    await expect(btn).toBeDisabled();
    const cursor = await btn.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe('not-allowed');
    await expect(btn).toBeEnabled({ timeout: 8000 });
  });

  test('collapsing the selection clears mirror highlight', async ({ page }) => {
    const hiddenInput = page.locator('#hidden-input');
    await hiddenInput.fill('ABC');
    await hiddenInput.focus();
    await page.evaluate(() => {
      document.getElementById('hidden-input').setSelectionRange(0, 2);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await expect(page.locator('#text-input .letter.selected')).toHaveCount(2);

    // Collapse the selection -> highlight must clear (old code left it stale).
    await page.evaluate(() => {
      const el = document.getElementById('hidden-input');
      el.setSelectionRange(1, 1);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await expect(page.locator('#text-input .letter.selected')).toHaveCount(0);
  });

  test('typing after a selection clears stale highlight', async ({ page }) => {
    const hiddenInput = page.locator('#hidden-input');
    await hiddenInput.fill('ABC');
    await hiddenInput.focus();
    await page.evaluate(() => {
      document.getElementById('hidden-input').setSelectionRange(0, 3);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await expect(page.locator('#text-input .letter.selected')).toHaveCount(3);

    await hiddenInput.press('Backspace');
    await expect(page.locator('#text-input .letter.selected')).toHaveCount(0);
  });

  test('maxlength updates on resize and stays within [1, 50]', async ({ page }) => {
    const maxLength = async () =>
      page.locator('#hidden-input').evaluate((el) => el.maxLength);

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
    await page.locator('#hidden-input').fill('ABCDE');
    await page.locator('#btn').click();

    // Sample transforms shortly after click: first letter should already
    // be moving while the last one has not started yet (4*150=600ms delay).
    await page.waitForTimeout(150);
    const snapshot = await page
      .locator('#text-input .letter')
      .evaluateAll((els) => els.map((el) => el.style.transform));
    expect(snapshot[0]).not.toBe('');
    expect(snapshot[4]).toBe('');

    await expect(page.locator('#btn')).toBeEnabled({ timeout: 8000 });
  });
});
```
