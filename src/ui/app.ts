import { parseCards } from '../data/csv';
import type { Database } from '../data/db';
import type { Repo } from '../data/repo';
import { dayToDate, today } from '../domain/day';
import { boxCounts, isDue } from '../domain/leitner';
import type { Card, Deck } from '../domain/types';
import { MASTERED } from '../domain/types';
import type { AnimationSpeed, CardActor } from '../scene/cardActor';
import type { Desk } from '../scene/desk';
import { DeckEditor } from './deckEditor';
import { h, isTyping, kbd, plural } from './dom';
import { ReviewSession } from './review';
import { SettingsDialog } from './settings';

const META_LAST_DECK = 'lastDeck';
const META_SPEED = 'speed';

export interface AppDeps {
  db: Database;
  repo: Repo;
  desk: Desk;
  actor: CardActor;
  sampleCsv: string;
}

/** Top-level controller: owns deck selection and switches between home, review and editing. */
export class App {
  decks: Deck[] = [];
  deck: Deck | null = null;
  cards: Card[] = [];
  speed: AnimationSpeed = 1;

  private readonly root = h('div', { class: 'shell' });
  private readonly topbar = h('header', { class: 'topbar' });
  private readonly stage = h('main', { class: 'stage' });
  private readonly editor: DeckEditor;
  private readonly settings: SettingsDialog;
  private session: ReviewSession | null = null;

  constructor(
    host: HTMLElement,
    readonly deps: AppDeps,
  ) {
    this.editor = new DeckEditor(this);
    this.settings = new SettingsDialog(this);
    this.root.append(this.topbar, this.stage, this.editor.element, this.settings.element);
    host.append(this.root);
    window.addEventListener('keydown', this.onKey);
  }

  async start(): Promise<void> {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.speed = (await this.deps.repo.getMeta<AnimationSpeed>(META_SPEED)) ?? (reducedMotion ? 0 : 1);
    this.deps.actor.setSpeed(this.speed);
    this.decks = await this.deps.repo.listDecks();
    const lastId = await this.deps.repo.getMeta<string>(META_LAST_DECK);
    await this.selectDeck(this.decks.find((deck) => deck.id === lastId) ?? this.decks[0] ?? null);
  }

  get dueCount(): number {
    const day = today();
    return this.cards.filter((card) => isDue(card, day)).length;
  }

  async selectDeck(deck: Deck | null): Promise<void> {
    this.deck = deck;
    this.cards = deck ? await this.deps.repo.listCards(deck.id) : [];
    if (deck) await this.deps.repo.setMeta(META_LAST_DECK, deck.id);
    this.refresh();
  }

  /** Reload decks and cards from storage, then redraw. */
  async reload(): Promise<void> {
    this.decks = await this.deps.repo.listDecks();
    const current = this.decks.find((deck) => deck.id === this.deck?.id) ?? this.decks[0] ?? null;
    await this.selectDeck(current);
  }

  async createDeck(name: string, csv?: string): Promise<void> {
    const deck = await this.deps.repo.createDeck(name);
    if (csv) {
      await this.deps.repo.addCards(deck.id, parseCards(csv).cards, today());
    }
    this.decks = await this.deps.repo.listDecks();
    await this.selectDeck(deck);
  }

  async setSpeed(speed: AnimationSpeed): Promise<void> {
    this.speed = speed;
    this.deps.actor.setSpeed(speed);
    await this.deps.repo.setMeta(META_SPEED, speed);
  }

  replaceCard(card: Card): void {
    this.cards = this.cards.map((existing) => (existing.id === card.id ? card : existing));
  }

  /** Redraw the topbar, the home panel and the desk stacks for the current deck. */
  refresh(): void {
    if (this.session) return;
    this.deps.desk.setCounts(boxCounts(this.cards));
    this.renderTopbar();
    this.renderHome();
  }

  startReview(): void {
    if (!this.deck || this.session || this.dueCount === 0) return;
    this.editor.close();
    this.session = new ReviewSession(this, this.stage, () => {
      this.session = null;
      this.refresh();
    });
    this.renderTopbar();
    void this.session.start();
  }

  openEditor(): void {
    if (this.deck && !this.session) this.editor.open();
  }

  private renderTopbar(): void {
    const reviewing = !!this.session;
    const select = h(
      'select',
      {
        class: 'deck-select',
        'aria-label': 'Deck',
        disabled: reviewing,
        onchange: (event: Event) => void this.selectDeck(this.decks.find((deck) => deck.id === (event.target as HTMLSelectElement).value) ?? null),
      },
      ...this.decks.map((deck) => h('option', { value: deck.id, selected: deck.id === this.deck?.id }, deck.name)),
    );

    this.topbar.replaceChildren(
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, 'L'), h('span', { class: 'brand-name' }, 'Leitner Desk')),
      this.decks.length ? select : h('span'),
      h(
        'div',
        { class: 'topbar-actions' },
        !reviewing && this.deck && h('button', { class: 'btn ghost', onclick: () => this.openEditor() }, 'Edit deck', kbd('E')),
        !reviewing && h('button', { class: 'btn ghost', onclick: () => void this.promptNewDeck() }, 'New deck'),
        h('button', { class: 'btn icon', 'aria-label': 'Settings', title: 'Settings', onclick: () => this.settings.open() }, '⚙'),
      ),
    );
  }

  private renderHome(): void {
    if (!this.deck) {
      this.stage.replaceChildren(this.welcomePanel());
      return;
    }
    const due = this.dueCount;
    const counts = boxCounts(this.cards);
    const total = this.cards.length;
    const nextDue = this.cards.filter((card) => card.box !== MASTERED).reduce((min, card) => Math.min(min, card.dueDay), Infinity);

    let status: string;
    if (total === 0) status = 'This deck is empty. Add cards to start.';
    else if (due > 0) status = `${plural(due, 'card')} due today`;
    else if (Number.isFinite(nextDue)) status = `All caught up. Next review ${relativeDay(nextDue)}.`;
    else status = 'Every card mastered.';

    this.stage.replaceChildren(
      h(
        'section',
        { class: 'home-panel', 'aria-live': 'polite' },
        h('p', { class: 'eyebrow' }, this.deck.name),
        h('h1', { class: 'home-status' }, status),
        h('p', { class: 'home-meta' }, `${plural(total, 'card')} · ${counts[MASTERED]} mastered`),
        due > 0
          ? h('button', { class: 'btn primary large', onclick: () => this.startReview() }, 'Start review', kbd('↵'))
          : total === 0 && h('button', { class: 'btn primary large', onclick: () => this.openEditor() }, 'Add cards', kbd('E')),
      ),
    );
  }

  private welcomePanel(): HTMLElement {
    const name = h('input', { class: 'field', placeholder: 'Deck name, e.g. Spanish verbs', 'aria-label': 'Deck name', maxLength: 80 });
    const create = (event: Event) => {
      event.preventDefault();
      void this.createDeck(name.value || 'My first deck').then(() => this.openEditor());
    };
    return h(
      'section',
      { class: 'home-panel welcome' },
      h('p', { class: 'eyebrow' }, 'Spaced repetition, on a desk'),
      h('h1', { class: 'home-status' }, 'Five boxes. Cards climb when you know them, fall back when you don’t.'),
      h('form', { class: 'inline-form', onsubmit: create }, name, h('button', { class: 'btn primary', type: 'submit' }, 'Create deck')),
      h('button', { class: 'btn link', onclick: () => void this.createDeck('Spanish basics', this.deps.sampleCsv) }, 'or load a 25-card Spanish sample deck'),
    );
  }

  private async promptNewDeck(): Promise<void> {
    const name = window.prompt('Name for the new deck');
    if (name === null) return;
    await this.createDeck(name || 'Untitled deck');
    this.openEditor();
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (isTyping(event) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (this.session) {
      this.session.handleKey(event);
      return;
    }
    if (this.editor.isOpen || this.settings.isOpen) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.startReview();
    } else if (event.key.toLowerCase() === 'e') {
      event.preventDefault();
      this.openEditor();
    }
  };
}

export function relativeDay(day: number): string {
  const diff = day - today();
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return `in ${diff} days`;
  return `on ${dayToDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
