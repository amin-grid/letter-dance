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
    await expect(page.locator('#btn')).not.toHaveClass(/dancing/);
    await expect(page.locator('#btn')).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('Fredoka Bold is preloaded to minimise first-paint font swap', async ({
    page,
  }) => {
    const preload = page.locator(
      'link[rel="preload"][as="font"][href*="Fredoka-Bold"]'
    );
    await expect(preload).toHaveCount(1);
    await expect(preload).toHaveAttribute('crossorigin', '');
  });

  test('fallback font metrics match Fredoka (no reflow on swap)', async ({
    page,
  }) => {
    const widths = await page.evaluate(async () => {
      const measure = (family) => {
        const span = document.createElement('span');
        span.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:700 20px ${family};`;
        span.textContent = 'HELLO WORLD';
        document.body.appendChild(span);
        const w = span.getBoundingClientRect().width;
        span.remove();
        return w;
      };
      const fallback = measure("'Fredoka-fallback'");
      await document.fonts.load('700 20px Fredoka');
      const fredoka = measure('Fredoka');
      return { fallback, fredoka };
    });
    // size-adjust keeps the pre-swap width within a few px of Fredoka.
    expect(Math.abs(widths.fallback - widths.fredoka)).toBeLessThan(5);
  });

  test('maxlength is computed with the loaded webfont', async ({ page }) => {
    // Wait for the webfont, then confirm maxlength matches a fresh
    // canvas measurement with Fredoka (main.js re-runs on fonts.ready).
    await page.evaluate(() => document.fonts.load('700 20px Fredoka'));
    const { maxLength, expected } = await page.evaluate(() => {
      const input = document.getElementById('text-input');
      const style = getComputedStyle(input);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const available = input.clientWidth - padding;
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const charWidth = ctx.measureText('M').width || 1;
      return {
        maxLength: input.maxLength,
        expected: Math.min(50, Math.max(1, Math.floor(available / charWidth))),
      };
    });
    expect(maxLength).toBe(expected);
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

    // Animating state: button click-protected (aria-disabled + .dancing),
    // wrapper flagged, stage populated from a snapshot of the input value.
    await expect(btn).toHaveAttribute('aria-disabled', 'true');
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
    await expect(btn).not.toHaveClass(/dancing/, { timeout: 8000 });
    await expect(btn).not.toHaveAttribute('aria-disabled', 'true');
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

    await expect(page.locator('#btn')).not.toHaveClass(/dancing/, { timeout: 8000 });
    const restoredColor = await textInput.evaluate((el) => getComputedStyle(el).color);
    expect(restoredColor).toBe(idleColor);
  });
});
