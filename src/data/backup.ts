import type { Box, Card, Deck, GradeEvent } from '../domain/types';
import { charLength, LIMITS, MASTERED } from '../domain/types';
import { t } from '../strings';
import type { Database } from './db';
import { isLive, touch } from './repo';

/** Never change: old backup files are recognized by this string. */
export const BACKUP_FORMAT = 'leitner-3d-backup';
export const BACKUP_VERSION = 1;

export type BackupDeck = Pick<Deck, 'id' | 'name' | 'createdAt' | 'updatedAt' | 'sample'>;
export type BackupCard = Pick<Card, 'id' | 'deckId' | 'front' | 'back' | 'box' | 'dueDay' | 'createdAt' | 'updatedAt' | 'history'>;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  decks: BackupDeck[];
  cards: BackupCard[];
}

/** Live decks and cards only; sync bookkeeping stays out of the file. */
export async function exportBackup(db: Database): Promise<Backup> {
  const [decks, cards] = await Promise.all([db.getAll('decks'), db.getAll('cards')]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    decks: decks.filter(isLive).map(({ id, name, createdAt, updatedAt, sample }) => ({ id, name, createdAt, updatedAt, ...(sample ? { sample } : {}) })),
    cards: cards.filter(isLive).map(({ id, deckId, front, back, box, dueDay, createdAt, updatedAt, history }) => ({
      id,
      deckId,
      front,
      back,
      box,
      dueDay,
      createdAt,
      updatedAt,
      history,
    })),
  };
}

export function parseBackup(json: string): Backup {
  const value: unknown = JSON.parse(json);
  if (!isBackupShape(value)) throw new Error(t.errors.notBackup);
  if (value.version > BACKUP_VERSION) throw new Error(t.errors.backupTooNew(value.version));

  const now = Date.now();
  const decks: BackupDeck[] = value.decks.map((deck) => ({
    id: deck.id,
    name: deck.name.trim().slice(0, LIMITS.deckName) || t.untitledDeck,
    createdAt: finiteOr(deck.createdAt, now),
    updatedAt: finiteOr(deck.updatedAt, finiteOr(deck.createdAt, now)),
    ...(deck.sample === true ? { sample: true } : {}),
  }));
  const deckIds = new Set(decks.map((deck) => deck.id));
  // Cards whose deck isn't in the file can't be shown anywhere, so they're dropped.
  const cards: BackupCard[] = value.cards
    .filter((card) => deckIds.has(card.deckId))
    .map((card) => ({
      id: card.id,
      deckId: card.deckId,
      front: card.front,
      back: card.back,
      box: card.box as Box,
      dueDay: card.dueDay,
      createdAt: finiteOr(card.createdAt, now),
      updatedAt: finiteOr(card.updatedAt, finiteOr(card.createdAt, now)),
      history: Array.isArray(card.history) ? (card.history as GradeEvent[]) : [],
    }));

  if (decks.length > LIMITS.decks) throw new Error(t.limits.decks);
  if (cards.length > LIMITS.cards) throw new Error(t.limits.cards);
  if (cards.some((card) => charLength(card.front) > LIMITS.sideChars || charLength(card.back) > LIMITS.sideChars)) throw new Error(t.limits.sideChars);
  return { format: BACKUP_FORMAT, version: value.version, exportedAt: value.exportedAt ?? '', decks, cards };
}

/**
 * Makes local data match the backup, as fresh edits so a signed-in account converges to it:
 * backup rows are written as new versions, and live rows missing from the backup become tombstones.
 * A backup id that matches a local tombstone gets a new id, because deletions are final on the server.
 */
export async function importBackup(db: Database, backup: Backup): Promise<void> {
  const tx = db.transaction(['decks', 'cards'], 'readwrite');
  const deckStore = tx.objectStore('decks');
  const cardStore = tx.objectStore('cards');
  const [localDecks, localCards] = await Promise.all([deckStore.getAll(), cardStore.getAll()]);
  const decksById = new Map(localDecks.map((deck) => [deck.id, deck]));
  const cardsById = new Map(localCards.map((card) => [card.id, card]));
  const now = Date.now();

  const deckIdMap = new Map<string, string>();
  const keptDecks = new Set<string>();
  const writes: Array<Promise<unknown>> = [];
  for (const deck of backup.decks) {
    const local = decksById.get(deck.id);
    const id = local && !isLive(local) ? crypto.randomUUID() : deck.id;
    deckIdMap.set(deck.id, id);
    keptDecks.add(id);
    const row: Deck = { ...deck, id, updatedAt: now, deletedAt: null, dirty: 1 };
    writes.push(deckStore.put(id === deck.id ? touch(row, local, now) : row));
  }

  const keptCards = new Set<string>();
  for (const card of backup.cards) {
    const local = cardsById.get(card.id);
    const id = local && !isLive(local) ? crypto.randomUUID() : card.id;
    keptCards.add(id);
    const row: Card = { ...card, id, deckId: deckIdMap.get(card.deckId) ?? card.deckId, updatedAt: now, deletedAt: null, dirty: 1 };
    writes.push(cardStore.put(id === card.id ? touch(row, local, now) : row));
  }

  for (const deck of localDecks) {
    if (isLive(deck) && !keptDecks.has(deck.id)) writes.push(deckStore.put(touch({ ...deck, deletedAt: now }, deck, now)));
  }
  for (const card of localCards) {
    if (isLive(card) && !keptCards.has(card.id)) writes.push(cardStore.put(touch({ ...card, deletedAt: now }, card, now)));
  }
  await Promise.all([...writes, tx.done]);
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

interface RawBackup {
  version: number;
  exportedAt?: string;
  decks: Array<Record<string, unknown> & { id: string; name: string }>;
  cards: Array<Record<string, unknown> & { id: string; deckId: string; front: string; back: string; box: number; dueDay: number }>;
}

function isBackupShape(value: unknown): value is RawBackup {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<PropertyKey, unknown>;
  return (
    record.format === BACKUP_FORMAT &&
    typeof record.version === 'number' &&
    Array.isArray(record.decks) &&
    Array.isArray(record.cards) &&
    record.decks.every(isDeckLike) &&
    record.cards.every(isCardLike)
  );
}

function isDeckLike(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const deck = value as Record<PropertyKey, unknown>;
  return typeof deck.id === 'string' && typeof deck.name === 'string';
}

function isCardLike(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const card = value as Record<PropertyKey, unknown>;
  return (
    typeof card.id === 'string' &&
    typeof card.deckId === 'string' &&
    typeof card.front === 'string' &&
    typeof card.back === 'string' &&
    Number.isInteger(card.box) &&
    (card.box as number) >= 1 &&
    (card.box as number) <= MASTERED &&
    typeof card.dueDay === 'number'
  );
}
