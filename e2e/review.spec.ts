import { expect, test } from '@playwright/test';

import { cardText, loadSample, openApp, reviewCount, startReview } from './helpers';

test.describe('review session', () => {
  test('reviews the whole sample deck and files every card', async ({ page, isMobile }) => {
    await openApp(page);
    await loadSample(page);
    await startReview(page);

    for (let index = 1; index <= 25; index++) {
      await expect(reviewCount(page)).toHaveText(`${index} / 25`);
      await expect(cardText(page)).toHaveText(/^Question: /);
      if (isMobile) {
        await page.getByRole('button', { name: /Show answer/ }).click();
        await expect(cardText(page)).toHaveText(/^Answer: /);
        await page.getByRole('button', { name: index % 5 === 0 ? /Missed/ : /Knew it/ }).click();
      } else {
        await page.keyboard.press('Space');
        await expect(cardText(page)).toHaveText(/^Answer: /);
        await page.keyboard.press(index % 5 === 0 ? 'f' : 'j');
      }
    }

    await expect(page.locator('.summary h2')).toHaveText('25 cards reviewed');
    await expect(page.locator('.stat.know dd')).toHaveText('20');
    await expect(page.locator('.stat.miss dd')).toHaveText('5');
    await page.getByRole('button', { name: /Back to desk/ }).click();
    await expect(page.locator('.home-status')).toHaveText('All caught up. Next review tomorrow.');
  });

  test('undo brings the last graded card back', async ({ page, isMobile }) => {
    await openApp(page);
    await loadSample(page);
    await startReview(page);
    const first = await cardText(page).textContent();

    await page.getByRole('button', { name: /Show answer/ }).click();
    await page.getByRole('button', { name: /Knew it/ }).click();
    await expect(reviewCount(page)).toHaveText('2 / 25');
    await expect(page.locator('.toast')).toContainText('Moved to box 2');

    if (isMobile) await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
    else await page.keyboard.press('z');
    await expect(reviewCount(page)).toHaveText('1 / 25');
    await expect(cardText(page)).toHaveText(first!);
  });

  test('ending early summarizes and keeps unreviewed cards due', async ({ page }) => {
    await openApp(page);
    await loadSample(page);
    await startReview(page);
    await page.getByRole('button', { name: /Show answer/ }).click();
    await page.getByRole('button', { name: /Knew it/ }).click();
    await page.getByRole('button', { name: /^End/ }).click();
    await expect(page.locator('.summary h2')).toHaveText('1 card reviewed');
    await page.getByRole('button', { name: /Back to desk/ }).click();
    await expect(page.locator('.home-status')).toHaveText('24 cards due today');
  });

  test('keyboard hints show on desktop and hide on touch-only phones', async ({ page, isMobile }) => {
    await openApp(page);
    await loadSample(page);
    const hint = page.getByRole('button', { name: /Start review/ }).locator('.keys');
    if (isMobile) await expect(hint).toBeHidden();
    else await expect(hint).toBeVisible();
  });
});
