import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Opens the app on a clean origin and waits for the first render. */
export async function openApp(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.locator('.home-panel')).toBeVisible();
}

/** Loads the 25-card Spanish sample deck from the welcome panel. */
export async function loadSample(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Spanish sample deck/ }).click();
  await expect(page.locator('.home-status')).toHaveText('25 cards due today');
}

export async function startReview(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Start review/ }).click();
  await expect(page.locator('.review-count')).toHaveText('1 / 25');
}

export const reviewCount = (page: Page) => page.locator('.review-count');
/** The aria-live mirror of the card under review. */
export const cardText = (page: Page) => page.locator('main.stage > p.sr-only');

/** Horizontal drag across the 3D scene in small steps, like a finger. */
export async function swipe(page: Page, fromX: number, toX: number, y: number, steps = 12): Promise<void> {
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(fromX + ((toX - fromX) * step) / steps, y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}
