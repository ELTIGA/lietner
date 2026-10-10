import type { Card, Deck } from '../domain/types';
import { MASTERED } from '../domain/types';
import { t } from '../strings';
import type { Database } from './db';

export const BACKUP_FORMAT = 'leitner-3d-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  decks: Deck[];
  cards: Card[];
}

export async function exportBackup(db: Database): Promise<Backup> {
  const [decks, cards] = await Promise.all([db.getAll('decks'), db.getAll('cards')]);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), decks, cards };
}

export function parseBackup(json: string): Backup {
  const value: unknown = JSON.parse(json);
  if (!isBackup(value)) throw new Error(t.errors.notBackup);
  if (value.version > BACKUP_VERSION) throw new Error(t.errors.backupTooNew(value.version));
  return value;
}

/** Replaces all decks and cards with the backup contents. */
export async function importBackup(db: Database, backup: Backup): Promise<void> {
  const tx = db.transaction(['decks', 'cards'], 'readwrite');
  const decks = tx.objectStore('decks');
  const cards = tx.objectStore('cards');
  await Promise.all([decks.clear(), cards.clear()]);
  await Promise.all([...backup.decks.map((deck) => decks.put(deck)), ...backup.cards.map((card) => cards.put(card)), tx.done]);
}

function isBackup(value: unknown): value is Backup {
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
