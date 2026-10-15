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
