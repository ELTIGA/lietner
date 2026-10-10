import { parseCards } from '../data/csv';
import type { Database } from '../data/db';
import type { Repo } from '../data/repo';
import { dayToDate, today } from '../domain/day';
import { boxCounts, isDue } from '../domain/leitner';
import type { Card, Deck } from '../domain/types';
import { MASTERED } from '../domain/types';
import type { AnimationSpeed, CardView, DeskView } from '../scene/views';
import { t } from '../strings';
import { Account } from './account';
import { DeckEditor } from './deckEditor';
import { promptDialog } from './dialog';
import { anyDialogOpen, h, isTyping, kbd } from './dom';
import { attachSwipe } from './gestures';
import { ReviewSession } from './review';
import { SettingsDialog } from './settings';
import { isIosSafari } from './pwa';
import { StarterSheet } from './starterSheet';
import { showError } from './toast';

const META_LAST_DECK = 'lastDeck';
const META_SPEED = 'speed';
/** Kept across sign-out (see data/wipe.ts). */
const META_INSTALL_HINT = 'installHintDismissed';

export interface AppDeps {
  db: Database;
  repo: Repo;
  desk: DeskView;
  actor: CardView;
  /** Full-screen layer behind the UI where taps and swipes on the card land. */
  scene: HTMLElement;
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
  /** The home panel while the deck has no cards. */
  private starter: StarterSheet | null = null;
  /** The deck that was open before the last one was created, for the starter sheet's ✕. */
  private deckBeforeCreate: string | null = null;
  /** Sync pulled changes while a review or the editor was open; redraw when it closes. */
  private reloadPending = false;
  private installHintDismissed = true;
  private readonly reviewListeners = new Set<(reviewing: boolean) => void>();
  readonly account: Account;

  constructor(
    host: HTMLElement,
    readonly deps: AppDeps,
  ) {
    this.editor = new DeckEditor(this);
    this.settings = new SettingsDialog(this);
    this.account = new Account(this);
    this.account.onChange(() => {
      this.renderTopbar();
      this.settings.refresh();
    });
    this.root.append(this.topbar, this.stage, this.editor.element, this.settings.element);
    host.append(this.root);
    window.addEventListener('keydown', this.onKey);
    attachSwipe(deps.scene, () => (this.session?.active ? this.session : null));
  }

  async start(): Promise<void> {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.speed = (await this.deps.repo.getMeta<AnimationSpeed>(META_SPEED)) ?? (reducedMotion ? 0 : 1);
    this.deps.actor.setSpeed(this.speed);
    this.decks = await this.deps.repo.listDecks();
    const lastId = await this.deps.repo.getMeta<string>(META_LAST_DECK);
    this.installHintDismissed = !isIosSafari() || !!(await this.deps.repo.getMeta<boolean>(META_INSTALL_HINT));
    await this.selectDeck(this.decks.find((deck) => deck.id === lastId) ?? this.decks[0] ?? null);
    // Local data is on screen; the account (and its network) comes second.
    void this.account.restore();
  }

  get reviewing(): boolean {
    return !!this.session;
  }

  onReviewChange(listener: (reviewing: boolean) => void): void {
    this.reviewListeners.add(listener);
  }

  private notifyReview(reviewing: boolean): void {
    for (const listener of this.reviewListeners) listener(reviewing);
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

  /** Sync changed local data: redraw now, or once the review, the editor or a half-done paste is out of the way. */
  onRemoteChanges(): void {
    if (this.session || this.editor.isOpen || this.starter?.busy) this.reloadPending = true;
    else void this.reload();
  }

  /** The starter sheet's paste box was emptied: catch up on changes held back while it had text. */
  starterIdle(): void {
    if (this.reloadPending && !this.editor.isOpen) void this.reload();
  }

  /** Reload decks and cards from storage, then redraw. */
  async reload(): Promise<void> {
    this.reloadPending = false;
    this.decks = await this.deps.repo.listDecks();
    const current = this.decks.find((deck) => deck.id === this.deck?.id) ?? this.decks[0] ?? null;
    await this.selectDeck(current);
  }

  /** Creates and selects a deck; false if a limit (or storage) stopped it, after telling the user. */
  async createDeck(name: string): Promise<boolean> {
    const previous = this.deck?.id ?? null;
    try {
      const deck = await this.deps.repo.createDeck(name);
      this.deckBeforeCreate = previous;
      this.decks = await this.deps.repo.listDecks();
      await this.selectDeck(deck);
      return true;
    } catch (error) {
      showError(error, t.errors.saveFailed);
      return false;
    }
  }

  /** The starter sheet's ✕: drops the empty deck and goes back to the deck that was open before it. */
  async discardEmptyDeck(): Promise<void> {
    const { deck } = this;
    if (!deck) return;
    try {
      // Sync may have brought cards in since the sheet was drawn; never discard those.
      if ((await this.deps.repo.listCards(deck.id)).length) {
        await this.reload();
        return;
      }
      await this.deps.repo.deleteDeck(deck.id);
    } catch (error) {
      showError(error, t.errors.saveFailed);
      return;
    }
    this.decks = await this.deps.repo.listDecks();
    await this.selectDeck(this.decks.find((other) => other.id === this.deckBeforeCreate) ?? this.decks[0] ?? null);
    this.focusHome();
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
      if (this.reloadPending) void this.reload();
      else this.refresh();
      this.notifyReview(false);
    });
    this.renderTopbar();
    this.notifyReview(true);
    void this.session.start();
  }

  openEditor(): void {
    if (this.deck && !this.session) this.editor.open();
  }

  /** Puts keyboard focus back on the desk after a drawer or dialog closes. */
  focusHome(): void {
    if (this.starter) this.starter.focus();
    else this.stage.querySelector<HTMLElement>('.btn.primary, .field')?.focus();
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

    const actions: Array<[string, () => void, HTMLElement?]> = [];
    if (!reviewing && this.deck) actions.push([t.topbar.editDeck, () => this.openEditor(), kbd('E')]);
    if (!reviewing) actions.push([t.topbar.newDeck, () => void this.promptNewDeck()]);

    // Narrow screens fold the actions into a menu; wide screens show them inline.
    const menu = h('div', { class: 'menu', id: 'topbar-menu', popover: 'auto' });
    const menuItem = (label: string, run: () => void) =>
      h(
        'button',
        {
          class: 'menu-item',
          type: 'button',
          onclick: () => {
            menu.hidePopover();
            run();
          },
        },
        label,
      );
    const { account } = this;
    const signIn = account.available && !account.user && !reviewing;
    menu.append(...actions.map(([label, run]) => menuItem(label, run)), menuItem(t.topbar.settings, () => this.settings.open()));
    if (signIn) menu.append(menuItem(t.account.signIn, () => void account.signIn()));
    const syncChip =
      account.user &&
      h(
        'button',
        {
          class: 'sync-chip',
          type: 'button',
          dataset: { state: account.refusedCount ? 'refused' : (account.status ?? 'syncing') },
          title: account.refusedCount ? t.sync.refused(account.refusedCount) : t.sync[account.status ?? 'syncing'],
          'aria-label': account.refusedCount ? t.sync.refused(account.refusedCount) : t.sync[account.status ?? 'syncing'],
          onclick: () => this.settings.open(),
        },
        h('span', { class: 'sync-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'sync-label' }, t.sync[account.status ?? 'syncing']),
      );

    this.topbar.replaceChildren(
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, t.brandMark), h('span', { class: 'brand-name' }, t.appName)),
      this.decks.length ? select : h('span'),
      h(
        'div',
        { class: 'topbar-actions' },
        syncChip,
        ...actions.map(([label, run, keys]) => h('button', { class: 'btn ghost wide-only', onclick: run }, label, keys)),
        signIn && h('button', { class: 'btn ghost wide-only', onclick: () => void account.signIn() }, t.account.signIn),
        h('button', { class: 'btn icon wide-only', 'aria-label': t.topbar.settings, title: t.topbar.settings, onclick: () => this.settings.open() }, '⚙'),
        h('button', { class: 'btn icon narrow-only', 'aria-label': t.topbar.menu, title: t.topbar.menu, popovertarget: 'topbar-menu' }, '⋯'),
        menu,
      ),
    );
  }

  private renderHome(): void {
    this.starter?.dispose();
    this.starter = null;
    if (!this.deck) {
      this.stage.replaceChildren(this.welcomePanel());
      return;
    }
    const total = this.cards.length;
    if (total === 0) {
      this.starter = new StarterSheet(this, footerLinks());
      this.stage.replaceChildren(this.starter.element);
      return;
    }
    const due = this.dueCount;
    const counts = boxCounts(this.cards);
    const nextDue = this.cards.filter((card) => card.box !== MASTERED).reduce((min, card) => Math.min(min, card.dueDay), Infinity);

    let status: string;
    if (due > 0) status = t.home.due(due);
    else if (Number.isFinite(nextDue)) status = t.home.caughtUp(relativeDay(nextDue));
    else status = t.home.allMastered;

    this.stage.replaceChildren(
      h(
        'section',
        { class: 'home-panel' },
        h('p', { class: 'eyebrow' }, this.deck.name),
        h('h1', { class: 'home-status', 'aria-live': 'polite' }, status),
        h('p', { class: 'home-meta' }, t.home.meta(total, counts[MASTERED])),
        due > 0 && h('button', { class: 'btn primary large', onclick: () => this.startReview() }, t.home.startReview, kbd('↵')),
        footerLinks(),
      ),
    );
  }

  private welcomePanel(): HTMLElement {
    const name = h('input', { class: 'field', placeholder: t.welcome.deckNamePlaceholder, 'aria-label': t.welcome.deckNameLabel, maxLength: 80, dir: 'auto' });
    const create = (event: Event) => {
      event.preventDefault();
      void this.createDeck(name.value || t.welcome.defaultDeckName).then((created) => created && this.focusHome());
    };
    return h(
      'section',
      { class: 'home-panel welcome' },
      h('p', { class: 'eyebrow' }, t.welcome.eyebrow),
      h('h1', { class: 'home-status' }, t.welcome.title),
      h('form', { class: 'inline-form', onsubmit: create }, name, h('button', { class: 'btn primary', type: 'submit' }, t.welcome.create)),
      h('button', { class: 'btn link', onclick: () => void this.loadSample() }, t.welcome.sample),
      !this.installHintDismissed && this.installHint(),
      footerLinks(),
    );
  }

  /** iOS Safari evicts site data after a week without a visit; the home-screen app doesn't. */
  private installHint(): HTMLElement {
    const hint = h(
      'aside',
      { class: 'install-hint' },
      h('p', { class: 'install-title' }, t.pwa.installTitle),
      h('p', {}, t.pwa.installBody),
      h(
        'button',
        {
          class: 'btn small',
          type: 'button',
          onclick: () => {
            this.installHintDismissed = true;
            hint.remove();
            void this.deps.repo.setMeta(META_INSTALL_HINT, true);
          },
        },
        t.pwa.installDismiss,
      ),
    );
    return hint;
  }

  private async promptNewDeck(): Promise<void> {
    const name = await promptDialog({ title: t.newDeck.title, label: t.newDeck.label, maxLength: 80, confirmLabel: t.newDeck.create });
    if (name === null) return;
    if (await this.createDeck(name || t.untitledDeck)) this.focusHome();
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (isTyping(event) || event.metaKey || event.ctrlKey || event.altKey || anyDialogOpen()) return;
    if (this.session) {
      this.session.handleKey(event);
      return;
    }
    if (this.editor.isOpen || this.settings.isOpen) return;
    if (event.key === 'Enter') {
      // A focused button or link keeps Enter for itself (Copy prompt is focused on a new deck).
      if ((event.target as HTMLElement | null)?.closest?.('button, a, summary')) return;
      event.preventDefault();
      this.startReview();
    } else if (event.key.toLowerCase() === 'e') {
      event.preventDefault();
      this.openEditor();
    }
  };
}

/** Privacy, terms, source and author credit, at the foot of the home panel. */
function footerLinks(): HTMLElement {
  return h(
    'nav',
    { class: 'panel-links', 'aria-label': t.footer.label },
    h('a', { href: '/privacy' }, t.footer.privacy),
    h('a', { href: '/terms' }, t.footer.terms),
    h('a', { href: 'https://github.com/ELTIGA/lietner', target: '_blank', rel: 'noopener' }, t.footer.source),
    h('span', { class: 'panel-credit' }, `${t.footer.builtBy} `, h('a', { href: 'https://ahmedeltigani.com', target: '_blank', rel: 'noopener' }, t.footer.author)),
  );
}

export function relativeDay(day: number): string {
  const diff = day - today();
  if (diff <= 0) return t.day.today;
  if (diff === 1) return t.day.tomorrow;
  if (diff < 7) return t.day.inDays(diff);
  return t.day.on(dayToDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
}
