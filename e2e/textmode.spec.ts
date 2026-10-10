import { expect, test } from '@playwright/test';

import { cardText, loadSample, openApp, reviewCount, startReview } from './helpers';

test('without WebGL, reviews run in text mode', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('html')).toHaveClass(/text-mode/);
  await loadSample(page);
  await startReview(page);

  const card = page.locator('.text-card');
  await expect(card).toBeVisible();
  const question = (await cardText(page).textContent())!.replace('Question: ', '');
  await expect(card).toContainText(question);

  await page.getByRole('button', { name: /Show answer/ }).click();
  await expect(cardText(page)).toHaveText(/^Answer: /);
  await expect(card).toHaveClass(/back/);
  await page.getByRole('button', { name: /Knew it/ }).click();
  await expect(reviewCount(page)).toHaveText('2 / 25');
  await expect(page.locator('.text-box.b2 .text-box-count')).toHaveText('1');
});

test('without WebGL, a new deck still gets the starter sheet', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('textbox', { name: 'Cards from your AI' }).fill('[{"front": "uno", "back": "one"}]');
  await page.getByRole('button', { name: 'Import cards' }).click();
  await expect(page.locator('.home-status')).toHaveText('1 card due today');
  await expect(page.locator('.text-box.b1 .text-box-count')).toHaveText('1');
});
