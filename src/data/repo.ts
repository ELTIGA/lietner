import { grade, newCard } from '../domain/leitner';
import type { Card, CardDraft, Deck, SyncFields } from '../domain/types';
import { charLength, LIMITS } from '../domain/types';
import { t } from '../strings';
import type { Database } from './db';

export type LimitKind = 'sideChars' | 'cards' | 'decks';

/** A write would exceed one of the per-account limits; `message` is user-facing. */
export class LimitError extends Error {
  constructor(readonly kind: LimitKind) {
    super(t.limits[kind]);
    this.name = 'LimitError';
  }
}

export const SAMPLE_DECK_ID = 'sample-es';

/**
 * Marks a row as locally edited. `updatedAt` never goes backwards for a row, so an edit
 * always beats the version it was based on even if this device's clock is behind.
 */
export function touch<T extends SyncFields>(row: T, previous?: Pick<SyncFields, 'updatedAt'>, now = Date.now()): T {
  return { ...row, updatedAt: Math.max(now, (previous?.updatedAt ?? 0) + 1), dirty: 1 };
}

export function isLive<T extends SyncFields>(row: T | undefined): row is T {
  return !!row && row.deletedAt === null;
}

function checkSides(draft: CardDraft): void {
  if (charLength(draft.front.trim()) > LIMITS.sideChars || charLength(draft.back.trim()) > LIMITS.sideChars) throw new LimitError('sideChars');
}

/** Local data access. Every write marks rows dirty for sync; deletes leave tombstones and reads skip them. */
export class Repo {
  private readonly listeners = new Set<() => void>();

  constructor(readonly db: Database) {}

  /** Called after every local write (the sync scheduler listens). */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Tells listeners about writes made outside the repo (backup import). */
  notifyChanged(): void {
    this.changed();
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  async listDecks(): Promise<Deck[]> {
    const decks = await this.db.getAll('decks');
    return decks.filter(isLive).sort((a, b) => a.createdAt - b.createdAt);
  }

  async createDeck(name: string, options: { id?: string; sample?: boolean } = {}): Promise<Deck> {
    if ((await this.listDecks()).length >= LIMITS.decks) throw new LimitError('decks');
    const now = Date.now();
    const deck: Deck = {
      id: options.id ?? crypto.randomUUID(),
      name: name.trim().slice(0, LIMITS.deckName) || t.untitledDeck,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      dirty: 1,
      ...(options.sample ? { sample: true } : {}),
    };
    await this.db.put('decks', deck);
    this.changed();
    return deck;
  }

  /** Creates the built-in sample deck. Fixed ids let two devices' copies merge into one on sign-in. */
  async createSampleDeck(name: string, drafts: CardDraft[], day: number): Promise<Deck> {
    const ids = [SAMPLE_DECK_ID, ...drafts.map((_, index) => sampleCardId(index))];
    const existing = await Promise.all([this.db.get('decks', SAMPLE_DECK_ID), ...ids.slice(1).map((id) => this.db.get('cards', id))]);
    // A tombstone can't be revived (deletes are final on the server), so fall back to fresh ids.
    const fixed = existing.every((row) => row === undefined);
    const deck = await this.createDeck(name, { id: fixed ? SAMPLE_DECK_ID : undefined, sample: true });
    await this.addCards(deck.id, drafts, day, fixed ? ids.slice(1) : undefined);
    return deck;
  }

  async renameDeck(id: string, name: string): Promise<void> {
    const deck = await this.db.get('decks', id);
    if (!isLive(deck)) return;
    const trimmed = name.trim().slice(0, LIMITS.deckName);
    if (!trimmed || trimmed === deck.name) return;
    await this.db.put('decks', touch({ ...deck, name: trimmed }, deck));
    this.changed();
  }

  /** Tombstones the deck and every card in it. */
  async deleteDeck(id: string): Promise<void> {
    const tx = this.db.transaction(['decks', 'cards'], 'readwrite');
    const now = Date.now();
    const deck = await tx.objectStore('decks').get(id);
    const cards = await tx.objectStore('cards').index('deckId').getAll(id);
    const writes: Array<Promise<unknown>> = [];
    if (isLive(deck)) writes.push(tx.objectStore('decks').put(touch({ ...deck, deletedAt: now }, deck, now)));
    for (const card of cards.filter(isLive)) writes.push(tx.objectStore('cards').put(touch({ ...card, deletedAt: now }, card, now)));
    await Promise.all([...writes, tx.done]);
    this.changed();
  }

  async listCards(deckId: string): Promise<Card[]> {
    const cards = await this.db.getAllFromIndex('cards', 'deckId', deckId);
    return cards.filter(isLive).sort((a, b) => a.createdAt - b.createdAt);
  }

  async getCard(id: string): Promise<Card | null> {
    const card = await this.db.get('cards', id);
    return isLive(card) ? card : null;
  }

  async countCards(): Promise<number> {
    const cards = await this.db.getAll('cards');
    return cards.filter(isLive).length;
  }

  async addCards(deckId: string, drafts: CardDraft[], day: number, ids?: string[]): Promise<Card[]> {
    drafts.forEach(checkSides);
    if ((await this.countCards()) + drafts.length > LIMITS.cards) throw new LimitError('cards');
    const now = Date.now();
    // Offset createdAt so bulk imports keep their file order.
    const cards = drafts.map((draft, index) => newCard(draft, deckId, day, ids?.[index] ?? crypto.randomUUID(), now + index));
    const tx = this.db.transaction('cards', 'readwrite');
    await Promise.all([...cards.map((card) => tx.store.put(card)), tx.done]);
    this.changed();
    return cards;
  }

  async updateCard(id: string, draft: CardDraft): Promise<void> {
    checkSides(draft);
    const card = await this.db.get('cards', id);
    if (!isLive(card)) return;
    const front = draft.front.trim();
    const back = draft.back.trim();
    if (front === card.front && back === card.back) return;
    await this.db.put('cards', touch({ ...card, front, back }, card));
    this.changed();
  }

  async deleteCard(id: string): Promise<void> {
    const card = await this.db.get('cards', id);
    if (!isLive(card)) return;
    await this.db.put('cards', touch({ ...card, deletedAt: Date.now() }, card));
    this.changed();
  }

  /**
   * Grades the stored version of the card, not the caller's copy, so edits pulled
   * from another device mid-session aren't overwritten. Null if it was deleted meanwhile.
   */
  async gradeCard(id: string, knew: boolean, day: number): Promise<Card | null> {
    const card = await this.db.get('cards', id);
    if (!isLive(card)) return null;
    const next = touch(grade(card, knew, day), card);
    await this.db.put('cards', next);
    this.changed();
    return next;
  }

  /** Undo: puts back the box, schedule and history from before a grade, as a new edit. */
  async restoreGrade(previous: Card): Promise<Card | null> {
    const card = await this.db.get('cards', previous.id);
    if (!isLive(card)) return null;
    const restored = touch({ ...card, box: previous.box, dueDay: previous.dueDay, history: previous.history }, card);
    await this.db.put('cards', restored);
    this.changed();
    return restored;
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('meta', key)) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.put('meta', value, key);
  }
}

export function sampleCardId(index: number): string {
  return `${SAMPLE_DECK_ID}-${String(index + 1).padStart(2, '0')}`;
}
