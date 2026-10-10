import { expect, test } from '@playwright/test';

import { loadSample, openApp } from './helpers';

test.describe('offline', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Service worker interception is exercised in Chromium');

  test('works fully offline as a guest after the first visit', async ({ page, context }) => {
    await openApp(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // The first visit installs the worker; from the next load it controls the page.
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await loadSample(page);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.home-status')).toHaveText('25 cards due today');
    await page.getByRole('button', { name: /Start review/ }).click();
    await expect(page.locator('.review-count')).toHaveText('1 / 25');

    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy policy');
  });
});
