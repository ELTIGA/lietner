import { expect, test } from '@playwright/test';

import { openApp } from './helpers';

test.describe('deck editor', () => {
  test('creates a deck, adds, edits and deletes cards, then deletes the deck', async ({ page, isMobile }) => {
    await openApp(page);
    await page.getByRole('textbox', { name: 'Deck name' }).fill('Biology');
    await page.getByRole('button', { name: 'Create deck' }).click();

    const editor = page.locator('aside.drawer.open');
    await expect(editor).toBeVisible();
    if (isMobile) {
      // 16px inputs keep iOS from zooming focused fields.
      await expect(editor.getByRole('textbox', { name: 'Front' }).first()).toHaveCSS('font-size', '16px');
    }
    if (page.viewportSize()!.width <= 600) {
      // On phones the editor is a full-screen sheet.
      const box = await editor.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
    }

    await editor.getByPlaceholder('Front (question)').fill('mitochondria');
    await editor.getByPlaceholder('Back (answer)').fill('the powerhouse of the cell');
    await editor.getByRole('button', { name: /Add card/ }).click();
    await expect(editor.locator('.card-list h3')).toHaveText('1 card');

    const row = editor.locator('.card-row').first();
    await row.getByRole('textbox', { name: 'Front' }).fill('ribosome');
    await row.getByRole('textbox', { name: 'Back' }).fill('makes proteins');
    await row.getByRole('textbox', { name: 'Back' }).blur();
    await editor.getByRole('button', { name: 'Close editor' }).click();
    await expect(page.locator('.home-status')).toHaveText('1 card due today');

    await page.keyboard.press('e');
    if (!(await editor.isVisible())) await page.getByRole('button', { name: /Add cards|Edit deck|Menu/ }).first().click();
    await expect(editor).toBeVisible();
    await expect(editor.locator('.card-row').first().getByRole('textbox', { name: 'Front' })).toHaveValue('ribosome');
    await editor.getByRole('button', { name: /Delete card ribosome/ }).click();
    await expect(editor.locator('.card-list h3')).toHaveText('0 cards');

    await editor.getByRole('button', { name: 'Delete deck' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete deck?' });
    await expect(dialog).toContainText('Delete “Biology” and all 0 cards?');
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.welcome')).toBeVisible();
  });

  test('imports CSV rows and reports skipped ones', async ({ page }) => {
    await openApp(page);
    await page.getByRole('textbox', { name: 'Deck name' }).fill('Imported');
    await page.getByRole('button', { name: 'Create deck' }).click();
    const editor = page.locator('aside.drawer.open');
    await editor.getByText('Import CSV / Anki text export').click();
    await editor.getByRole('textbox', { name: 'CSV text' }).fill('front,back\nuno,one\ndos,two\nonly-front\n');
    await expect(editor.locator('.import-preview')).toHaveText('2 cards ready, 1 row skipped (missing front or back).');
    await editor.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(editor.locator('.card-list h3')).toHaveText('2 cards');
  });

  test('new deck uses the in-app dialog, not window.prompt', async ({ page }) => {
    await openApp(page);
    page.on('dialog', () => {
      throw new Error('A native browser dialog opened');
    });
    await page.getByRole('button', { name: /Spanish sample deck/ }).click();
    const newDeck = page.getByRole('button', { name: 'New deck' });
    if (!(await newDeck.isVisible())) {
      await page.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('button', { name: 'New deck' }).click();
    } else {
      await newDeck.click();
    }
    const dialog = page.getByRole('dialog', { name: 'New deck' });
    await dialog.getByRole('textbox', { name: 'Deck name' }).fill('Chemistry');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('aside.drawer.open')).toBeVisible();
    await expect(page.locator('.deck-select')).toContainText('Chemistry');
  });
});
