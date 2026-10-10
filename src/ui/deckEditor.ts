import { parseCards } from '../data/csv';
import type { CsvResult } from '../data/csv';
import { today } from '../domain/day';
import type { Card } from '../domain/types';
import { MASTERED } from '../domain/types';
import type { App } from './app';
import { h, plural } from './dom';

/** Slide-in drawer for renaming a deck, adding/importing cards and editing the card list. */
export class DeckEditor {
  readonly element = h('aside', { class: 'drawer', 'aria-label': 'Deck editor', inert: true });
  private pendingImport: CsvResult | null = null;

  constructor(private readonly app: App) {
    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.close();
    });
  }

  get isOpen(): boolean {
    return this.element.classList.contains('open');
  }

  open(): void {
    this.render();
    this.element.inert = false;
    this.element.classList.add('open');
    this.element.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.element.classList.remove('open');
    this.element.inert = true;
    this.pendingImport = null;
    void this.app.reload();
  }

  private render(): void {
    const deck = this.app.deck;
    if (!deck) return;

    const name = h('input', {
      class: 'field title-field',
      value: deck.name,
      'aria-label': 'Deck name',
      maxLength: 80,
      onchange: () => void this.app.deps.repo.renameDeck(deck.id, name.value),
    });

    this.element.replaceChildren(
      h(
        'div',
        { class: 'drawer-head' },
        name,
        h('button', { class: 'btn icon', 'aria-label': 'Close editor', onclick: () => this.close() }, '✕'),
      ),
      h('div', { class: 'drawer-body' }, this.addForm(), this.importSection(), this.cardList(), this.dangerZone()),
    );
  }

  private addForm(): HTMLElement {
    const front = h('textarea', { class: 'field', rows: 2, placeholder: 'Front (question)', 'aria-label': 'Front', required: true });
    const back = h('textarea', { class: 'field', rows: 2, placeholder: 'Back (answer)', 'aria-label': 'Back', required: true });
    const submit = async (event: Event) => {
      event.preventDefault();
      if (!front.value.trim() || !back.value.trim() || !this.app.deck) return;
      await this.app.deps.repo.addCards(this.app.deck.id, [{ front: front.value, back: back.value }], today());
      await this.refreshCards();
      front.value = '';
      back.value = '';
      this.element.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    };
    const form = h(
      'form',
      { class: 'card-form', onsubmit: submit },
      h('h3', {}, 'Add a card'),
      front,
      back,
      h('button', { class: 'btn primary', type: 'submit' }, 'Add card', h('span', { class: 'keys' }, h('kbd', {}, '⌘'), h('kbd', {}, '↵'))),
    );
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) form.requestSubmit();
    });
    return form;
  }

  private importSection(): HTMLElement {
    const preview = h('p', { class: 'import-preview', 'aria-live': 'polite' });
    const paste = h('textarea', { class: 'field mono', rows: 3, placeholder: 'Paste CSV or tab-separated rows: front, back', 'aria-label': 'CSV text' });
    const confirm = h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Import');

    const preparse = (text: string) => {
      this.pendingImport = text.trim() ? parseCards(text) : null;
      const result = this.pendingImport;
      confirm.disabled = !result?.cards.length;
      preview.textContent = result
        ? `${plural(result.cards.length, 'card')} ready${result.skipped ? `, ${plural(result.skipped, 'row')} skipped (missing front or back)` : ''}.`
        : '';
    };
    const file = h('input', {
      type: 'file',
      accept: '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain',
      class: 'file-input',
      'aria-label': 'CSV file',
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
      await this.app.deps.repo.addCards(this.app.deck.id, this.pendingImport.cards, today());
      paste.value = '';
      file.value = '';
      preparse('');
      await this.refreshCards();
      preview.textContent = `Imported ${plural(count, 'card')} into box 1.`;
    });

    return h(
      'details',
      { class: 'import' },
      h('summary', {}, 'Import CSV / Anki text export'),
      h('p', { class: 'hint' }, 'Two columns, or a header row with front and back. Comma or tab separated.'),
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
      h('h3', {}, plural(cards.length, 'card')),
      cards.length ? h('ul', {}, ...cards.map((card) => this.cardRow(card))) : h('p', { class: 'hint' }, 'No cards yet.'),
    );
  }

  private cardRow(card: Card): HTMLElement {
    const save = () => void this.app.deps.repo.updateCard(card.id, { front: front.value, back: back.value });
    const front = h('textarea', { class: 'field inline', rows: 1, value: card.front, 'aria-label': 'Front', onchange: save });
    const back = h('textarea', { class: 'field inline', rows: 1, value: card.back, 'aria-label': 'Back', onchange: save });
    const remove = async () => {
      await this.app.deps.repo.deleteCard(card.id);
      await this.refreshCards();
    };
    return h(
      'li',
      { class: 'card-row' },
      h('span', { class: `box-badge b${card.box}`, title: card.box === MASTERED ? 'Mastered' : `Box ${card.box}` }, card.box === MASTERED ? '★' : String(card.box)),
      front,
      back,
      h('button', { class: 'btn icon small', 'aria-label': `Delete card ${card.front}`, onclick: remove }, '✕'),
    );
  }

  private dangerZone(): HTMLElement {
    const remove = async () => {
      const deck = this.app.deck;
      if (!deck || !window.confirm(`Delete “${deck.name}” and all ${plural(this.app.cards.length, 'card')}? This cannot be undone.`)) return;
      await this.app.deps.repo.deleteDeck(deck.id);
      this.close();
    };
    return h('section', { class: 'danger' }, h('button', { class: 'btn danger-btn', onclick: remove }, 'Delete deck'));
  }

  private async refreshCards(): Promise<void> {
    if (!this.app.deck) return;
    this.app.cards = await this.app.deps.repo.listCards(this.app.deck.id);
    this.app.refresh();
    const list = this.element.querySelector('.card-list');
    list?.replaceWith(this.cardList());
  }
}
