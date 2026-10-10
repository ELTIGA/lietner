import { grade, newCard } from '../domain/leitner';
import type { Card, CardDraft, Deck } from '../domain/types';
import { t } from '../strings';
import type { Database } from './db';

export class Repo {
  constructor(private readonly db: Database) {}

  listDecks(): Promise<Deck[]> {
    return this.db.getAll('decks').then((decks) => decks.sort((a, b) => a.createdAt - b.createdAt));
  }

  async createDeck(name: string): Promise<Deck> {
    const deck: Deck = { id: crypto.randomUUID(), name: name.trim() || t.untitledDeck, createdAt: Date.now() };
    await this.db.put('decks', deck);
    return deck;
  }

  async renameDeck(id: string, name: string): Promise<void> {
    const deck = await this.db.get('decks', id);
    if (deck) await this.db.put('decks', { ...deck, name: name.trim() || deck.name });
  }

  async deleteDeck(id: string): Promise<void> {
    const tx = this.db.transaction(['decks', 'cards'], 'readwrite');
    const cardKeys = await tx.objectStore('cards').index('deckId').getAllKeys(id);
    await Promise.all([...cardKeys.map((key) => tx.objectStore('cards').delete(key)), tx.objectStore('decks').delete(id), tx.done]);
  }

  listCards(deckId: string): Promise<Card[]> {
    return this.db.getAllFromIndex('cards', 'deckId', deckId).then((cards) => cards.sort((a, b) => a.createdAt - b.createdAt));
  }

  async addCards(deckId: string, drafts: CardDraft[], day: number): Promise<Card[]> {
    const now = Date.now();
    // Offset createdAt so bulk imports keep their file order.
    const cards = drafts.map((draft, index) => ({ ...newCard(draft, deckId, day), createdAt: now + index }));
    const tx = this.db.transaction('cards', 'readwrite');
    await Promise.all([...cards.map((card) => tx.store.put(card)), tx.done]);
    return cards;
  }

  async updateCard(id: string, draft: CardDraft): Promise<void> {
    const card = await this.db.get('cards', id);
    if (card) await this.db.put('cards', { ...card, front: draft.front.trim(), back: draft.back.trim() });
  }

  deleteCard(id: string): Promise<void> {
    return this.db.delete('cards', id);
  }

  async gradeCard(card: Card, knew: boolean, day: number): Promise<Card> {
    const next = grade(card, knew, day);
    await this.db.put('cards', next);
    return next;
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('meta', key)) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.put('meta', value, key);
  }
}
