import { expect, test } from '@playwright/test';

import { cardText, loadSample, openApp, reviewCount, startReview, swipe } from './helpers';

test.describe('touch gestures', () => {
  test('swipe right grades Knew it, swipe left grades Missed', async ({ page }) => {
    await openApp(page);
    await loadSample(page);
    await startReview(page);
    const { width, height } = page.viewportSize()!;
    const y = height * 0.45;

    await swipe(page, width * 0.2, width * 0.85, y);
    await expect(reviewCount(page)).toHaveText('2 / 25');
    await expect(page.locator('.toast').last()).toContainText('Moved to box 2');

    await swipe(page, width * 0.85, width * 0.15, y);
    await expect(reviewCount(page)).toHaveText('3 / 25');
    await expect(page.locator('.toast').last()).toContainText('Back to box 1');
  });

  test('a short, slow drag snaps back without grading', async ({ page }) => {
    await openApp(page);
    await loadSample(page);
    await startReview(page);
    const { width, height } = page.viewportSize()!;

    await swipe(page, width * 0.4, width * 0.5, height * 0.45, 20);
    await page.waitForTimeout(400);
    await expect(reviewCount(page)).toHaveText('1 / 25');
    await expect(cardText(page)).toHaveText(/^Question: /);
  });

  test('tapping the card shows the answer', async ({ page }) => {
    await openApp(page);
    await loadSample(page);
    await startReview(page);
    const { width, height } = page.viewportSize()!;
    // The reading position: just below the middle in portrait, above it in landscape.
    const y = width < height ? height * 0.55 : height * 0.4;
    await page.mouse.click(width / 2, y);
    await expect(cardText(page)).toHaveText(/^Answer: /);
  });
});
