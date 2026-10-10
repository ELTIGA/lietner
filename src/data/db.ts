import type { DBSchema, IDBPDatabase } from 'idb';
import { openDB } from 'idb';

import type { Card, Deck } from '../domain/types';

export interface LeitnerDB extends DBSchema {
  decks: { key: string; value: Deck };
  cards: { key: string; value: Card; indexes: { deckId: string } };
  meta: { key: string; value: unknown };
}

export type Database = IDBPDatabase<LeitnerDB>;

export const DB_NAME = 'leitner-3d';
const DB_VERSION = 1;

export function openDatabase(name = DB_NAME): Promise<Database> {
  return openDB<LeitnerDB>(name, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('decks', { keyPath: 'id' });
      const cards = db.createObjectStore('cards', { keyPath: 'id' });
      cards.createIndex('deckId', 'deckId');
      db.createObjectStore('meta');
    },
  });
}
