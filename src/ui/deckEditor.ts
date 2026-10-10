import type { ImportResult } from '../data/import';
import { parseImport } from '../data/import';
import { today } from '../domain/day';
import type { Card } from '../domain/types';
import { LIMITS, MASTERED } from '../domain/types';
import { t } from '../strings';
import type { App } from './app';
import { confirmDialog } from './dialog';
import { h, watchKeyboardInset } from './dom';
import { showError } from './toast';

/** Slide-in drawer for renaming a deck, adding/importing cards and editing the card list. */
export class DeckEditor {
  readonly element = h('aside', { class: 'drawer', 'aria-label': t.editor.label, inert: true });
  private pendingImport: ImportResult | null = null;
  private opener: HTMLElement | null = null;
  private stopKeyboardWatch: (() => void) | null = null;

  constructor(private readonly app: App) {
    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) this.close();
    });
    // On phones the on-screen keyboard covers the bottom of the sheet: keep the focused field visible.
    this.element.addEventListener('focusin', (event) => {
      const field = event.target as HTMLElement;
      if (field.matches('input, textarea') && window.visualViewport) window.setTimeout(() => field.scrollIntoView({ block: 'nearest' }), 300);
    });
  }

  get isOpen(): boolean {
    return this.element.classList.contains('open');
  }

  open(): void {
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.render();
    this.element.inert = false;
    this.element.classList.add('open');
    // Focus stays inside the drawer: everything behind it is inert until it closes.
    this.app.setBackgroundInert(true);
    // Space taken by the on-screen keyboard, as padding at the bottom of the sheet.
    this.stopKeyboardWatch = watchKeyboardInset(this.element);
    this.element.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.element.classList.remove('open');
    this.element.inert = true;
    this.app.setBackgroundInert(false);
    this.stopKeyboardWatch?.();
    this.stopKeyboardWatch = null;
    this.pendingImport = null;
    void this.app.reload().then(() => {
      // Re-rendering usually replaces the opener, so fall back to the home panel's main action.
      if (this.opener?.isConnected) this.opener.focus();
      else this.app.focusHome();
    });
  }

  private render(): void {
    const deck = this.app.deck;
    if (!deck) return;

    const name = h('input', {
      class: 'field title-field',
      value: deck.name,
      'aria-label': t.editor.deckName,
      dir: 'auto',
      maxLength: 80,
      onchange: () => void this.app.deps.repo.renameDeck(deck.id, name.value).catch((error: unknown) => showError(error, t.errors.saveFailed)),
    });

    this.element.replaceChildren(
      h('div', { class: 'drawer-head' }, name, h('button', { class: 'btn icon', 'aria-label': t.editor.close, onclick: () => this.close() }, '✕')),
      h('div', { class: 'drawer-body' }, this.addForm(), this.importSection(), this.cardList(), this.dangerZone()),
    );
  }

  private addForm(): HTMLElement {
    const front = h('textarea', {
      class: 'field',
      rows: 2,
      placeholder: t.editor.frontPlaceholder,
      'aria-label': t.editor.front,
      required: true,
      dir: 'auto',
      maxLength: LIMITS.sideChars,
    });
    const back = h('textarea', {
      class: 'field',
      rows: 2,
      placeholder: t.editor.backPlaceholder,
      'aria-label': t.editor.back,
      required: true,
      dir: 'auto',
      maxLength: LIMITS.sideChars,
    });
    const submit = async (event: Event) => {
      event.preventDefault();
      if (!front.value.trim() || !back.value.trim() || !this.app.deck) return;
      try {
        await this.app.deps.repo.addCards(this.app.deck.id, [{ front: front.value, back: back.value }], today());
      } catch (error) {
        showError(error, t.errors.saveFailed);
        return;
      }
      await this.refreshCards();
      front.value = '';
      back.value = '';
      this.element.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    };
    const form = h(
      'form',
      { class: 'card-form', onsubmit: submit },
      h('h3', {}, t.editor.addHeading),
      front,
      back,
      h('button', { class: 'btn primary', type: 'submit' }, t.editor.addCard, h('span', { class: 'keys' }, h('kbd', {}, '⌘'), h('kbd', {}, '↵'))),
    );
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) form.requestSubmit();
    });
    return form;
  }

  private importSection(): HTMLElement {
    const preview = h('p', { class: 'import-preview', 'aria-live': 'polite' });
    const paste = h('textarea', { class: 'field mono', rows: 3, placeholder: t.editor.importPlaceholder, 'aria-label': t.editor.importText });
    const confirm = h('button', { class: 'btn primary', type: 'button', disabled: true }, t.editor.import);

    const preparse = (text: string) => {
      this.pendingImport = text.trim() ? parseImport(text) : null;
      const result = this.pendingImport;
      confirm.disabled = !result?.cards.length;
      showImportPreview(preview, result);
    };
    const file = h('input', {
      type: 'file',
      accept: '.json,.csv,.tsv,.txt,application/json,text/csv,text/tab-separated-values,text/plain',
      class: 'file-input',
      'aria-label': t.editor.importFile,
      onchange: async () => {
        const chosen = file.files?.[0];
        if (!chosen) return;
        paste.value = await chosen.text();
        preparse(paste.value);
      },
    });
    paste.addEventListener('input', () => preparse(paste.value));
    confirm.addEventListener('click', async () => {
      if (!this.pendingImport?.cards.length || !this.app.deck) return;
      const count = this.pendingImport.cards.length;
      try {
        await this.app.deps.repo.addCards(this.app.deck.id, this.pendingImport.cards, today());
      } catch (error) {
        showError(error, t.errors.saveFailed);
        return;
      }
      paste.value = '';
      file.value = '';
      preparse('');
      await this.refreshCards();
      preview.textContent = t.editor.imported(count);
    });

    return h(
      'details',
      { class: 'import' },
      h('summary', {}, t.editor.importSummary),
      h('p', { class: 'hint' }, t.editor.importHint),
      file,
      paste,
      h('div', { class: 'row' }, preview, confirm),
    );
  }

  private cardList(): HTMLElement {
    const cards = [...this.app.cards].reverse();
    return h(
      'section',
      { class: 'card-list' },
      h('h3', {}, t.editor.cardCount(cards.length)),
      cards.length ? h('ul', {}, ...cards.map((card) => this.cardRow(card))) : h('p', { class: 'hint' }, t.editor.noCards),
    );
  }

  private cardRow(card: Card): HTMLElement {
    const save = () =>
      void this.app.deps.repo.updateCard(card.id, { front: front.value, back: back.value }).catch((error: unknown) => showError(error, t.errors.saveFailed));
    const field = { class: 'field inline', rows: 1, onchange: save, dir: 'auto', maxLength: LIMITS.sideChars };
    const front = h('textarea', { ...field, value: card.front, 'aria-label': t.editor.front });
    const back = h('textarea', { ...field, value: card.back, 'aria-label': t.editor.back });
    const remove = async () => {
      await this.app.deps.repo.deleteCard(card.id);
      await this.refreshCards();
    };
    return h(
      'li',
      { class: 'card-row' },
      h(
        'span',
        { class: `box-badge b${card.box}`, title: card.box === MASTERED ? t.editor.mastered : t.editor.box(card.box) },
        card.box === MASTERED ? '★' : String(card.box),
      ),
      front,
      back,
      h('button', { class: 'btn icon small', 'aria-label': t.editor.deleteCard(card.front), onclick: remove }, '✕'),
    );
  }

  private dangerZone(): HTMLElement {
    const remove = async () => {
      const deck = this.app.deck;
      if (!deck) return;
      const ok = await confirmDialog(t.editor.deleteDeckConfirm(deck.name, this.app.cards.length), {
        title: t.editor.deleteDeckTitle,
        confirmLabel: t.dialog.delete,
        danger: true,
      });
      if (!ok) return;
      await this.app.deps.repo.deleteDeck(deck.id);
      this.opener = null;
      this.close();
    };
    return h('section', { class: 'danger' }, h('button', { class: 'btn danger-btn', onclick: remove }, t.editor.deleteDeck));
  }

  private async refreshCards(): Promise<void> {
    if (!this.app.deck) return;
    this.app.cards = await this.app.deps.repo.listCards(this.app.deck.id);
    this.app.refresh();
    const list = this.element.querySelector('.card-list');
    list?.replaceWith(this.cardList());
  }
}

/** Says what a paste would import, or why it can't (in red). Shared with the starter sheet. */
export function showImportPreview(preview: HTMLElement, result: ImportResult | null): void {
  const bad = result?.error === 'badJson';
  preview.textContent = !result ? '' : bad ? t.starter.badJson : t.editor.importReady(result.cards.length, result.skipped, result.tooLong);
  preview.classList.toggle('error', bad);
}
