import type { ImportResult } from '../data/import';
import { parseImport } from '../data/import';
import { today } from '../domain/day';
import { t } from '../strings';
import type { App } from './app';
import { showImportPreview } from './deckEditor';
import { h, watchKeyboardInset } from './dom';
import { showError } from './toast';

/** How long the Copy button says "Copied" before going back to its label. */
const COPIED_MS = 2000;

/**
 * Home panel for a deck with no cards: copy a prompt into your own AI, paste back the JSON it writes.
 * Lietner never calls an AI itself.
 */
export class StarterSheet {
  readonly element: HTMLElement;
  private readonly paste = h('textarea', {
    class: 'field mono',
    rows: 3,
    placeholder: t.starter.pastePlaceholder,
    'aria-label': t.starter.pasteLabel,
  });
  private readonly preview = h('p', { class: 'import-preview', 'aria-live': 'polite' });
  private readonly importButton = h('button', { class: 'btn primary', type: 'button', disabled: true }, t.starter.import);
  private readonly copyButton = h('button', { class: 'btn primary large', type: 'button' }, t.starter.copyPrompt);
  private readonly copyStep: HTMLElement;
  private pending: ImportResult | null = null;
  private stopKeyboardWatch: (() => void) | null = null;

  constructor(
    private readonly app: App,
    footer: HTMLElement,
  ) {
    const deck = app.deck;
    this.copyButton.addEventListener('click', () => void this.copy());
    this.importButton.addEventListener('click', () => void this.import());
    this.paste.spellcheck = false;
    this.paste.addEventListener('input', () => this.preparse());
    // Lift the sheet above the on-screen keyboard. Keep watching after blur: dropping the sheet
    // while the keyboard closes would move the Import button out from under the tap.
    this.paste.addEventListener('focus', () => {
      this.stopKeyboardWatch ??= watchKeyboardInset(this.element);
    });

    this.copyStep = h('li', {}, h('h2', { class: 'starter-step' }, t.starter.copyStep), h('p', { class: 'hint' }, t.starter.copyHint), this.copyButton);
    this.element = h(
      'section',
      { class: 'home-panel starter' },
      h(
        'button',
        { class: 'btn icon starter-close', type: 'button', 'aria-label': t.starter.discard, title: t.starter.discard, onclick: () => void app.discardEmptyDeck() },
        '✕',
      ),
      h('p', { class: 'eyebrow' }, deck?.name ?? ''),
      h('h1', { class: 'home-status', 'aria-live': 'polite' }, t.starter.title),
      h(
        'ol',
        { class: 'starter-steps' },
        this.copyStep,
        h(
          'li',
          {},
          h('h2', { class: 'starter-step' }, t.starter.pasteStep),
          h('p', { class: 'hint' }, t.starter.pasteHint),
          this.paste,
          h('div', { class: 'row' }, this.preview, this.importButton),
        ),
      ),
      h('button', { class: 'btn link', type: 'button', onclick: () => app.openEditor() }, t.starter.byHand),
      footer,
    );
  }

  /** A half-done paste that a redraw would throw away. */
  get busy(): boolean {
    return this.paste.value.trim() !== '';
  }

  focus(): void {
    this.copyButton.focus();
  }

  /** Call before the sheet is replaced. */
  dispose(): void {
    this.stopKeyboardWatch?.();
    this.stopKeyboardWatch = null;
  }

  private async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(t.starter.prompt);
    } catch {
      this.showPrompt();
      return;
    }
    this.copyButton.textContent = t.starter.copied;
    window.setTimeout(() => (this.copyButton.textContent = t.starter.copyPrompt), COPIED_MS);
  }

  /** No clipboard access (blocked, or an insecure origin): show the prompt for copying by hand. */
  private showPrompt(): void {
    let prompt = this.copyStep.querySelector<HTMLTextAreaElement>('.starter-prompt');
    if (!prompt) {
      prompt = h('textarea', { class: 'field mono starter-prompt', rows: 6, readOnly: true, value: t.starter.prompt, 'aria-label': t.starter.promptLabel });
      this.copyStep.append(h('p', { class: 'hint', role: 'status' }, t.starter.copyFailed), prompt);
    }
    prompt.focus();
    prompt.select();
    prompt.scrollTop = 0;
  }

  private preparse(): void {
    const text = this.paste.value;
    this.pending = text.trim() ? parseImport(text) : null;
    this.importButton.disabled = !this.pending?.cards.length;
    showImportPreview(this.preview, this.pending);
    if (!text.trim()) this.app.starterIdle();
  }

  private async import(): Promise<void> {
    const { deck } = this.app;
    const result = this.pending;
    if (!deck || !result?.cards.length) return;
    try {
      await this.app.deps.repo.addCards(deck.id, result.cards, today());
      // Only replace a name the student never chose.
      if (result.deckName && (deck.name === t.welcome.defaultDeckName || deck.name === t.untitledDeck)) {
        await this.app.deps.repo.renameDeck(deck.id, result.deckName);
      }
    } catch (error) {
      showError(error, t.errors.saveFailed);
      return;
    }
    this.paste.value = '';
    await this.app.reload();
    this.app.focusHome();
  }
}
