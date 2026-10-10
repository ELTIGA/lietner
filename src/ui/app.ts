import { parseCards } from '../data/csv';
import type { Database } from '../data/db';
import type { Repo } from '../data/repo';
import { dayToDate, today } from '../domain/day';
import { boxCounts, isDue } from '../domain/leitner';
import type { Card, Deck } from '../domain/types';
import { MASTERED } from '../domain/types';
import type { AnimationSpeed, CardActor } from '../scene/cardActor';
import type { Desk } from '../scene/desk';
import { t } from '../strings';
import { DeckEditor } from './deckEditor';
import { promptDialog } from './dialog';
import { anyDialogOpen, h, isTyping, kbd } from './dom';
import { ReviewSession } from './review';
import { SettingsDialog } from './settings';
import { showError } from './toast';

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

  /** Creates and selects a deck; false if a limit (or storage) stopped it, after telling the user. */
  async createDeck(name: string): Promise<boolean> {
    try {
      const deck = await this.deps.repo.createDeck(name);
      this.decks = await this.deps.repo.listDecks();
      await this.selectDeck(deck);
      return true;
    } catch (error) {
      showError(error, t.errors.saveFailed);
      return false;
    }
  }

  async loadSample(): Promise<void> {
    try {
      const deck = await this.deps.repo.createSampleDeck(t.welcome.sampleDeckName, parseCards(this.deps.sampleCsv).cards, today());
      this.decks = await this.deps.repo.listDecks();
      await this.selectDeck(deck);
    } catch (error) {
      showError(error, t.errors.saveFailed);
    }
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

  /** Puts keyboard focus back on the desk after a drawer or dialog closes. */
  focusHome(): void {
    this.stage.querySelector<HTMLElement>('.btn.primary, .field')?.focus();
  }

  /** Makes everything behind the editor drawer inert while it is open. */
  setBackgroundInert(inert: boolean): void {
    for (const element of [this.topbar, this.stage, document.getElementById('scene')]) if (element) element.inert = inert;
  }

  private renderTopbar(): void {
    const reviewing = !!this.session;
    const select = h(
      'select',
      {
        class: 'deck-select',
        'aria-label': t.topbar.deck,
        disabled: reviewing,
        onchange: (event: Event) => void this.selectDeck(this.decks.find((deck) => deck.id === (event.target as HTMLSelectElement).value) ?? null),
      },
      ...this.decks.map((deck) => h('option', { value: deck.id, selected: deck.id === this.deck?.id }, deck.name)),
    );

    this.topbar.replaceChildren(
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, t.brandMark), h('span', { class: 'brand-name' }, t.appName)),
      this.decks.length ? select : h('span'),
      h(
        'div',
        { class: 'topbar-actions' },
        !reviewing && this.deck && h('button', { class: 'btn ghost', onclick: () => this.openEditor() }, t.topbar.editDeck, kbd('E')),
        !reviewing && h('button', { class: 'btn ghost', onclick: () => void this.promptNewDeck() }, t.topbar.newDeck),
        h('button', { class: 'btn icon', 'aria-label': t.topbar.settings, title: t.topbar.settings, onclick: () => this.settings.open() }, '⚙'),
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
    if (total === 0) status = t.home.empty;
    else if (due > 0) status = t.home.due(due);
    else if (Number.isFinite(nextDue)) status = t.home.caughtUp(relativeDay(nextDue));
    else status = t.home.allMastered;

    this.stage.replaceChildren(
      h(
        'section',
        { class: 'home-panel', 'aria-live': 'polite' },
        h('p', { class: 'eyebrow' }, this.deck.name),
        h('h1', { class: 'home-status' }, status),
        h('p', { class: 'home-meta' }, t.home.meta(total, counts[MASTERED])),
        due > 0
          ? h('button', { class: 'btn primary large', onclick: () => this.startReview() }, t.home.startReview, kbd('↵'))
          : total === 0 && h('button', { class: 'btn primary large', onclick: () => this.openEditor() }, t.home.addCards, kbd('E')),
      ),
    );
  }

  private welcomePanel(): HTMLElement {
    const name = h('input', { class: 'field', placeholder: t.welcome.deckNamePlaceholder, 'aria-label': t.welcome.deckNameLabel, maxLength: 80, dir: 'auto' });
    const create = (event: Event) => {
      event.preventDefault();
      void this.createDeck(name.value || t.welcome.defaultDeckName).then((created) => created && this.openEditor());
    };
    return h(
      'section',
      { class: 'home-panel welcome' },
      h('p', { class: 'eyebrow' }, t.welcome.eyebrow),
      h('h1', { class: 'home-status' }, t.welcome.title),
      h('form', { class: 'inline-form', onsubmit: create }, name, h('button', { class: 'btn primary', type: 'submit' }, t.welcome.create)),
      h('button', { class: 'btn link', onclick: () => void this.loadSample() }, t.welcome.sample),
    );
  }

  private async promptNewDeck(): Promise<void> {
    const name = await promptDialog({ title: t.newDeck.title, label: t.newDeck.label, maxLength: 80, confirmLabel: t.newDeck.create });
    if (name === null) return;
    if (await this.createDeck(name || t.untitledDeck)) this.openEditor();
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (isTyping(event) || event.metaKey || event.ctrlKey || event.altKey || anyDialogOpen()) return;
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
  if (diff <= 0) return t.day.today;
  if (diff === 1) return t.day.tomorrow;
  if (diff < 7) return t.day.inDays(diff);
  return t.day.on(dayToDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
}
