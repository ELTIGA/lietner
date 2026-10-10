import { expect, test } from '@playwright/test';

import { loadSample, openApp } from './helpers';

/** A reply as an AI chat would give it: chatter around a fenced JSON block. */
const AI_REPLY = `Here are your cards:

\`\`\`json
{"deck": "Cells", "cards": [
  {"front": "What is the powerhouse of the cell?", "back": "The mitochondrion"},
  {"front": "Which organelle makes proteins?", "back": "The ribosome"},
  {"front": "What controls what enters the cell?", "back": "The cell membrane"}
]}
\`\`\``;

test.describe('starter sheet', () => {
  test('a new deck offers the AI prompt and imports the JSON it returns', async ({ page, context, browserName }) => {
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openApp(page);
    await page.getByRole('button', { name: 'Create deck' }).click();

    const sheet = page.locator('.starter');
    const copy = sheet.getByRole('button', { name: 'Copy prompt' });
    // Keyboard users land on Copy prompt; Enter must press it, not try to start a review.
    await expect(copy).toBeFocused();
    await page.keyboard.press('Enter');
    if (browserName === 'chromium') {
      await expect(sheet.getByRole('button', { name: 'Copied ✓' })).toBeVisible();
      const prompt = await page.evaluate(() => navigator.clipboard.readText());
      expect(prompt).toContain('three questions in ONE message');
      expect(prompt).toContain('{"deck": "Short deck name", "cards": [{"front": "Question", "back": "Answer"}]}');
    } else {
      // WebKit may refuse the clipboard: then the prompt is shown for copying by hand.
      await expect(sheet.getByRole('button', { name: 'Copied ✓' }).or(sheet.getByRole('textbox', { name: 'Prompt' }))).toBeVisible();
    }

    const paste = sheet.getByRole('textbox', { name: 'Cards from your AI' });
    const importButton = sheet.getByRole('button', { name: 'Import cards' });
    await paste.fill('{"deck": "Cells", "cards": [{"front": "a", "back": "b"},');
    await expect(sheet.locator('.import-preview')).toHaveText(/doesn’t look like the cards block/);
    await expect(importButton).toBeDisabled();

    await paste.fill(AI_REPLY);
    await expect(sheet.locator('.import-preview')).toHaveText('3 cards ready.');
    await importButton.click();
    await expect(page.locator('.home-status')).toHaveText('3 cards due today');
    // "My first deck" was never chosen, so the AI's name replaces it.
    await expect(page.locator('.deck-select option:checked')).toHaveText('Cells');
    await expect(page.getByRole('button', { name: /Start review/ })).toBeFocused();
  });

  test('keeps a deck name the student chose', async ({ page }) => {
    await openApp(page);
    await page.getByRole('textbox', { name: 'Deck name' }).fill('Biology');
    await page.getByRole('button', { name: 'Create deck' }).click();
    await page.getByRole('textbox', { name: 'Cards from your AI' }).fill(AI_REPLY);
    await page.getByRole('button', { name: 'Import cards' }).click();
    await expect(page.locator('.home-status')).toHaveText('3 cards due today');
    await expect(page.locator('.deck-select option:checked')).toHaveText('Biology');
  });

  test('✕ discards a new empty deck and goes back to the deck before it', async ({ page }) => {
    await openApp(page);
    await loadSample(page);
    const newDeck = page.getByRole('button', { name: 'New deck' });
    if (!(await newDeck.isVisible())) await page.getByRole('button', { name: 'Menu' }).click();
    await newDeck.last().click();
    const dialog = page.getByRole('dialog', { name: 'New deck' });
    await dialog.getByRole('textbox', { name: 'Deck name' }).fill('Chemistry');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('.starter')).toBeVisible();

    await page.getByRole('button', { name: 'Discard this empty deck' }).click();
    await expect(page.locator('.home-status')).toHaveText('25 cards due today');
    await expect(page.locator('.deck-select option')).toHaveText(['Spanish basics']);
  });

  test('✕ on the first deck goes back to the welcome panel', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Create deck' }).click();
    await page.getByRole('button', { name: 'Discard this empty deck' }).click();
    await expect(page.locator('.welcome')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Deck name' })).toBeFocused();
  });
});
