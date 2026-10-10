import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import { openDB } from 'idb';

import type { Card, Deck } from '../domain/types';

export interface LeitnerDB extends DBSchema {
  decks: { key: string; value: Deck; indexes: { dirty: number } };
  cards: { key: string; value: Card; indexes: { deckId: string; dirty: number } };
  meta: { key: string; value: unknown };
}

export type Database = IDBPDatabase<LeitnerDB>;

/** Never rename: existing users' decks live in this database. */
export const DB_NAME = 'leitner-3d';
export const DB_VERSION = 2;

type UpgradeTransaction = IDBPTransaction<LeitnerDB, Array<StoreNames<LeitnerDB>>, 'versionchange'>;

export function openDatabase(name = DB_NAME): Promise<Database> {
  return openDB<LeitnerDB>(name, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        db.createObjectStore('decks', { keyPath: 'id' });
        const cards = db.createObjectStore('cards', { keyPath: 'id' });
        cards.createIndex('deckId', 'deckId');
        db.createObjectStore('meta');
      }
      if (oldVersion < 2) {
        tx.objectStore('decks').createIndex('dirty', 'dirty');
        tx.objectStore('cards').createIndex('dirty', 'dirty');
        // Only IDB requests are awaited, so the upgrade transaction stays alive until the backfill ends.
        void backfillSyncFields(tx, oldVersion);
      }
    },
    blocking(_currentVersion, _blockedVersion, event) {
      // Another tab is upgrading the schema: step aside and reload into the new version.
      (event.target as IDBDatabase).close();
      if (typeof location !== 'undefined') location.reload();
    },
  });
}

/** v1 → v2: every row gets updatedAt = createdAt, no tombstone, and is marked unsynced. */
async function backfillSyncFields(tx: UpgradeTransaction, oldVersion: number): Promise<void> {
  if (oldVersion < 1) return;
  for (const name of ['decks', 'cards'] as const) {
    let cursor = await tx.objectStore(name).openCursor();
    while (cursor) {
      const row = cursor.value as Partial<Deck & Card> & { createdAt?: number };
      await cursor.update({
        ...cursor.value,
        updatedAt: row.updatedAt ?? row.createdAt ?? Date.now(),
        deletedAt: row.deletedAt ?? null,
        dirty: 1,
      });
      cursor = await cursor.continue();
    }
  }
}
