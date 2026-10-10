import type { Database } from '../data/db';
import type { Card, Deck } from '../domain/types';
import type { AccountState, Cursor, Remote, Stored, SyncCard, SyncDeck, SyncRows, Table } from './remote';
import { parseTimestamp, RemoteUnavailable, TABLES } from './remote';

export type SyncStatus = 'syncing' | 'synced' | 'offline' | 'paused';

export interface SyncOptions {
  onStatus?: (status: SyncStatus) => void;
  /** Pulled or server-adjusted rows changed what the user sees; the UI should reload. */
  onChanged?: () => void;
  /** The account was deleted (on another device) or this session ended; this device should sign out. */
  onAccountGone?: (state: Exclude<AccountState, 'ok'>) => void;
  /** Rows per pull request; keep at or below the server's max_rows. */
  pageSize?: number;
  /** Rows per push request. */
  chunkSize?: number;
  /**
   * Pulls restart this far before the saved cursor: a write's server_at is its transaction's
   * start time, so a slow commit can land just behind a cursor that already moved past it.
   */
  lookbackMs?: number;
}

/** Meta keys owned by sync; signing out clears them with the account's data. */
export const SYNC_META_KEYS = ['syncCursor:decks', 'syncCursor:cards'] as const;

interface LocalRows {
  decks: Deck;
  cards: Card;
}

const toSync = {
  decks: ({ dirty: _dirty, ...deck }: Deck): SyncDeck => deck,
  // Grade history stays on this device.
  cards: ({ dirty: _dirty, history: _history, ...card }: Card): SyncCard => card,
};

const fromStored = {
  decks: ({ serverAt: _serverAt, sample, ...deck }: Stored<'decks'>): Deck => ({ ...deck, ...(sample ? { sample: true } : {}), dirty: 0 }),
  cards: ({ serverAt: _serverAt, ...card }: Stored<'cards'>, local?: Card): Card => ({ ...card, history: local?.history ?? [], dirty: 0 }),
};

/** Fields the user can see; server-only adjustments (a capped updatedAt) don't need a redraw. */
function visiblyDifferent(a: Deck | Card | undefined, b: Deck | Card): boolean {
  if (!a) return b.deletedAt === null;
  const keys = ['deletedAt', 'name', 'front', 'back', 'box', 'dueDay', 'deckId'] as const;
  return keys.some((key) => (a as unknown as Record<string, unknown>)[key] !== (b as unknown as Record<string, unknown>)[key]);
}

function withLock(run: () => Promise<void>): Promise<void> {
  // One sync at a time across this browser's tabs.
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request('lietner-sync', run) : run();
}

/**
 * Local-first sync. IndexedDB stays the source of truth; the server is a mirror.
 * Each run: confirm the account, push unsynced rows (decks before cards), then pull
 * everything stored since the last cursor. Last write wins per row and deletions are final,
 * enforced by the server's triggers and mirrored here when applying pulled rows.
 */
export class SyncEngine {
  private running: Promise<void> | null = null;
  private again = false;
  private status: SyncStatus | null = null;
  /** Rows the server refused, by the updatedAt that was refused; retried once edited or next session. */
  private readonly refused: Record<Table, Map<string, number>> = { decks: new Map(), cards: new Map() };
  private readonly pageSize: number;
  private readonly chunkSize: number;
  private readonly lookbackMs: number;

  constructor(
    private readonly db: Database,
    private readonly remote: Remote,
    private readonly options: SyncOptions = {},
  ) {
    this.pageSize = options.pageSize ?? 1000;
    this.chunkSize = options.chunkSize ?? 200;
    this.lookbackMs = options.lookbackMs ?? 60_000;
  }

  get lastStatus(): SyncStatus | null {
    return this.status;
  }

  /** Runs a sync. Calls during a run queue exactly one more run after it. */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await withLock(() => this.run());
      } while (this.again);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Rows the server refused this session (limits); they stay on this device, unsynced. */
  get refusedCount(): number {
    return this.refused.decks.size + this.refused.cards.size;
  }

  /** Rows changed on this device that the server hasn't accepted yet. */
  async unsyncedCount(): Promise<number> {
    const counts = await Promise.all(TABLES.map((table) => this.db.countFromIndex(table, 'dirty', 1)));
    return counts.reduce((sum, count) => sum + count, 0);
  }

  private setStatus(status: SyncStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.options.onStatus?.(status);
  }

  private async run(): Promise<void> {
    this.setStatus('syncing');
    try {
      const account = await this.remote.checkAccount();
      if (account !== 'ok') {
        this.options.onAccountGone?.(account);
        return;
      }
      let changed = false;
      for (const table of TABLES) changed = (await this.push(table)) || changed;
      for (const table of TABLES) changed = (await this.pull(table)) || changed;
      this.setStatus('synced');
      if (changed) this.options.onChanged?.();
    } catch (error) {
      if (error instanceof RemoteUnavailable) {
        this.setStatus(error.reason);
      } else {
        console.error('Sync failed', error);
        this.setStatus('paused');
      }
    }
  }

  private async push<T extends Table>(table: T): Promise<boolean> {
    // (The cast picks one store for idb's index typing; both stores have the same dirty index.)
    const dirty = (await this.db.getAllFromIndex(table as 'decks', 'dirty', 1)) as Array<LocalRows[T]>;
    const refused = this.refused[table];
    const pending = dirty.filter((row) => refused.get(row.id) !== row.updatedAt);
    let changed = false;
    for (let start = 0; start < pending.length; start += this.chunkSize) {
      const chunk = pending.slice(start, start + this.chunkSize);
      // The version sent, so a row edited again while the request was in flight stays unsynced.
      const sent = new Map(chunk.map((row) => [row.id, row.updatedAt]));
      const payload = chunk.map((row) => (table === 'decks' ? toSync.decks(row as Deck) : toSync.cards(row as Card))) as Array<SyncRows[T]>;
      const { accepted, rejected } = await this.remote.push(table, payload);

      for (const { id, message } of rejected) {
        refused.set(id, sent.get(id)!);
        console.warn(`Sync: server refused ${table} row`, id, message);
      }
      changed = (await this.storeServerVersions(table, accepted, sent)) || changed;

      // Rows neither accepted nor refused lost to a newer version on the server: adopt it.
      const settled = new Set([...accepted.map((row) => row.id), ...rejected.map((row) => row.id)]);
      const skipped = [...sent.keys()].filter((id) => !settled.has(id));
      if (skipped.length) changed = (await this.storeServerVersions(table, await this.remote.fetch(table, skipped), sent)) || changed;
    }
    return changed;
  }

  /** Replaces just-pushed rows with what the server stored, unless the row changed locally meanwhile. */
  private async storeServerVersions<T extends Table>(table: T, rows: Array<Stored<T>>, sent: Map<string, number>): Promise<boolean> {
    if (!rows.length) return false;
    const tx = this.db.transaction(table, 'readwrite');
    let changed = false;
    for (const row of rows) {
      const local = (await tx.store.get(row.id)) as LocalRows[T] | undefined;
      if (!local || local.updatedAt !== sent.get(row.id)) continue;
      const next = table === 'decks' ? fromStored.decks(row as Stored<'decks'>) : fromStored.cards(row as Stored<'cards'>, local as Card);
      changed = visiblyDifferent(local, next) || changed;
      await tx.store.put(next as LocalRows[T]);
    }
    await tx.done;
    return changed;
  }

  private async pull<T extends Table>(table: T): Promise<boolean> {
    const key = `syncCursor:${table}`;
    const saved = (await this.db.get('meta', key)) as Cursor | undefined;
    let after: Cursor | null = saved ? { serverAt: new Date(parseTimestamp(saved.serverAt) - this.lookbackMs).toISOString(), id: '' } : null;
    let newest: Cursor | null = null;
    let changed = false;
    for (;;) {
      const rows = await this.remote.pull(table, after, this.pageSize);
      if (rows.length) {
        changed = (await this.applyPulled(table, rows)) || changed;
        const last = rows[rows.length - 1]!;
        after = newest = { serverAt: last.serverAt, id: last.id };
      }
      if (rows.length < this.pageSize) break;
    }
    // Rows are never hard-deleted, so the last row pulled is at or after the saved cursor.
    if (newest) await this.db.put('meta', newest, key);
    return changed;
  }

  /**
   * Applies rows from the server. A deletion (either side) always wins; otherwise a local
   * unsynced edit newer than the server's version is kept for the next push.
   */
  private async applyPulled<T extends Table>(table: T, rows: Array<Stored<T>>): Promise<boolean> {
    const tx = this.db.transaction(table, 'readwrite');
    let changed = false;
    for (const row of rows) {
      const local = (await tx.store.get(row.id)) as LocalRows[T] | undefined;
      if (local && local.deletedAt !== null) continue;
      if (local && row.deletedAt === null && local.dirty === 1 && local.updatedAt > row.updatedAt) continue;
      const next = table === 'decks' ? fromStored.decks(row as Stored<'decks'>) : fromStored.cards(row as Stored<'cards'>, local as Card | undefined);
      changed = visiblyDifferent(local, next) || changed;
      await tx.store.put(next as LocalRows[T]);
    }
    await tx.done;
    return changed;
  }
}
