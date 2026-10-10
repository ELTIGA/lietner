import type { Card, Deck } from '../domain/types';

/** A deck as it travels to and from the server: no local sync flag. */
export type SyncDeck = Omit<Deck, 'dirty'>;
/** A card as it travels: no local sync flag and no grade history (it never leaves the device). */
export type SyncCard = Omit<Card, 'dirty' | 'history'>;

export interface SyncRows {
  decks: SyncDeck;
  cards: SyncCard;
}

export type Table = keyof SyncRows;
export const TABLES: Table[] = ['decks', 'cards'];

/** A row as stored on the server, with the time the server stored it. */
export type Stored<T extends Table> = SyncRows[T] & { serverAt: string };

/** Keyset position in a table's pull order (server_at, id). */
export interface Cursor {
  serverAt: string;
  id: string;
}

export interface PushResult<T extends Table> {
  /** Rows the server stored, as it stored them (its clock-capped updatedAt, cascaded deletions). */
  accepted: Array<Stored<T>>;
  /** Rows refused outright (limits, constraints); the rest of the batch still went through. */
  rejected: Array<{ id: string; message: string }>;
}

/** `deleted`: the account no longer exists. `signedOut`: this device's session ended (revoked or expired for good). */
export type AccountState = 'ok' | 'deleted' | 'signedOut';

/** Network-level failure: the device is offline, or the backend is down or paused. */
export class RemoteUnavailable extends Error {
  constructor(
    readonly reason: 'offline' | 'paused',
    cause?: unknown,
  ) {
    super(reason === 'offline' ? 'Offline' : 'Sync backend unavailable', { cause });
    this.name = 'RemoteUnavailable';
  }
}

/**
 * The server side of sync. Rows the server skipped (an older edit losing to a newer one)
 * are neither accepted nor rejected; the engine fetches the server's version instead.
 */
export interface Remote {
  /** Confirms with the server that the account still exists (it may have been deleted elsewhere). */
  checkAccount(): Promise<AccountState>;
  push<T extends Table>(table: T, rows: Array<SyncRows[T]>): Promise<PushResult<T>>;
  fetch<T extends Table>(table: T, ids: string[]): Promise<Array<Stored<T>>>;
  /** Rows stored after `after` in (serverAt, id) order. */
  pull<T extends Table>(table: T, after: Cursor | null, limit: number): Promise<Array<Stored<T>>>;
}

/**
 * Epoch ms from a Postgres timestamp. Postgres sends microseconds
 * ("2026-10-10T12:00:00.123456+00:00"), which not every engine parses; keep milliseconds.
 */
export function parseTimestamp(value: string): number {
  return Date.parse(value.replace(/(\.\d{3})\d+/, '$1'));
}
