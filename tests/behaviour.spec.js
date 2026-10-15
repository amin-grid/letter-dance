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
