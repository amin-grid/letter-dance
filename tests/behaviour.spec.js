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
    // pointer-events:none blocks real re-clicks; force bypasses that to
    // prove the JS state guard alone still prevents a second cascade.
    await page.evaluate(() => document.getElementById('btn').click());
    await page.evaluate(() => document.getElementById('btn').click());

    // Still exactly one dance: class removed after one cascade,
    // state returns to idle, stage is torn down.
    await expect(btn).not.toHaveClass(/dancing/, { timeout: 8000 });
    await expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.input-wrapper')).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('#animation-stage .letter')).toHaveCount(0);
  });

  test('button returns to idle even with empty text (no letters)', async ({ page }) => {
    await page.locator('#text-input').fill('');
    await page.locator('#btn').click();
    await expect(page.locator('#btn')).not.toHaveClass(/dancing/, { timeout: 5000 });
    await expect(page.locator('.input-wrapper')).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('#animation-stage .letter')).toHaveCount(0);
  });

  test('ripple element never leaks (removed after animation)', async ({ page }) => {
    await page.locator('#btn').click();
    await expect(page.locator('#btn .ripple')).toHaveCount(0, { timeout: 3000 });
    await expect(page.locator('#btn')).not.toHaveClass(/dancing/, { timeout: 8000 });
  });

  test('dancing button stays vibrant and ignores pointer events', async ({ page }) => {
    const btn = page.locator('#btn');
    await btn.click();
    await expect(btn).toHaveClass(/dancing/);

    // Click-protection WITHOUT visual dimming: full opacity, no pointer,
    // engaged tone pinned with transitions frozen (no hover-wash fade).
    const style = await btn.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        opacity: s.opacity,
        pointerEvents: s.pointerEvents,
        background: s.backgroundColor,
        transition: s.transition,
      };
    });
    expect(style.opacity).toBe('1');
    expect(style.pointerEvents).toBe('none');
    expect(style.background).toBe('rgb(55, 0, 179)'); // pinned hover-dark
    expect(style.transition).toBe('none');
    await expect(btn).toHaveAttribute('aria-disabled', 'true');

    await expect(btn).not.toHaveClass(/dancing/, { timeout: 8000 });
    await expect(btn).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('button press gives instant tactile feedback (scale down and back)', async ({
    page,
  }) => {
    const btn = page.locator('#btn');
    const box = await btn.boundingBox();
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // mousedown -> :active scale-down applies INSTANTLY (zero-duration
    // into the press, so even a ~60ms quick click feels tactile).
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    const pressed = await btn.evaluate((el) => getComputedStyle(el).transform);
    expect(pressed).toContain('0.92');

    // mouseup -> springs back to identity via the transform transition.
    await page.mouse.up();
    await expect
      .poll(() => btn.evaluate((el) => getComputedStyle(el).transform), {
        timeout: 2000,
      })
      .toBe('none');
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
    await expect(page.locator('#btn')).not.toHaveClass(/dancing/, { timeout: 8000 });
  });

  test('stage snapshots the value at click time', async ({ page }) => {
    const textInput = page.locator('#text-input');
    await textInput.fill('ABC');
    await page.locator('#btn').click();

    // Stage reflects the clicked-time value...
    const stageLetters = page.locator('#animation-stage .letter');
    await expect(stageLetters).toHaveCount(3);

    // ...and the input value survives the dance untouched.
    await expect(page.locator('#btn')).not.toHaveClass(/dancing/, { timeout: 8000 });
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

    await expect(page.locator('#btn')).not.toHaveClass(/dancing/, { timeout: 8000 });
    await expect(page.locator('#animation-stage .letter')).toHaveCount(0);
  });

  test('no vertical layout shift when swapping to the animation stage', async ({
    page,
  }) => {
    // Native input text-top: browsers vertically center the text line
    // inside the content box: top + border + padding + (contentH - lineH)/2.
    const nativeTextTop = await page.locator('#text-input').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const borderTop = parseFloat(style.borderTopWidth);
      const paddingTop = parseFloat(style.paddingTop);
      const paddingBottom = parseFloat(style.paddingBottom);
      const borderBottom = parseFloat(style.borderBottomWidth);
      const contentH = rect.height - borderTop - paddingTop - paddingBottom - borderBottom;
      const lineH = parseFloat(style.lineHeight);
      return rect.top + borderTop + paddingTop + (contentH - lineH) / 2;
    });

    await page.locator('#text-input').fill('ABCDE');
    await page.locator('#btn').click();
    await expect(page.locator('.input-wrapper')).toHaveAttribute(
      'data-state',
      'animating'
    );

    // Sample the LAST letter: it starts after 4*150=600ms, so it sits
    // perfectly still in the stage's line box during our sampling window.
    // All letters share one line box, so this measures swap alignment.
    const stageTextTop = await page
      .locator('#animation-stage .letter')
      .last()
      .evaluate((el) => {
        if (el.style.transform !== '') {
          throw new Error('letter already jumping; sample was too late');
        }
        return el.getBoundingClientRect().top;
      });

    // Sub-pixel tolerance: the swap must be imperceptible.
    expect(Math.abs(stageTextTop - nativeTextTop)).toBeLessThan(1);

    await expect(page.locator('#btn')).not.toHaveClass(/dancing/, { timeout: 8000 });
  });
});
