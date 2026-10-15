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
