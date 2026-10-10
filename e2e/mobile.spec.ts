import { expect, test } from '@playwright/test';

import { openApp } from './helpers';

test.describe('phones', () => {
  test.skip(({ isMobile }) => !isMobile, 'Phone and tablet only');

  test('iOS Safari shows the Add to Home Screen hint before the first deck, once', async ({ page }) => {
    await openApp(page);
    const hint = page.locator('.install-hint');
    await expect(hint).toContainText('Add Lietner to your Home Screen');
    await hint.getByRole('button', { name: 'Got it' }).click();
    await expect(hint).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.welcome')).toBeVisible();
    await expect(hint).toHaveCount(0);
  });

  test('controls meet the 48px touch target size', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: /Spanish sample deck/ }).click();
    await page.getByRole('button', { name: /Start review/ }).click();
    const box = await page.getByRole('button', { name: /Show answer/ }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
  });
});
