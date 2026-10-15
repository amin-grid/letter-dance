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
