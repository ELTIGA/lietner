import { LIMITS } from '../domain/types';
import type { AccountState, Cursor, PushResult, Remote, Stored, SyncCard, SyncDeck, SyncRows, Table } from './remote';
import { RemoteUnavailable } from './remote';

type AnyStored = Stored<'decks'> | Stored<'cards'>;

/**
 * In-memory stand-in for one account on the server, applying the same write rules as the
 * SQL triggers in supabase/migrations: clock cap, last write wins, final deletions,
 * deck-to-card cascade and live-row limits. Used by the sync tests.
 */
export class FakeRemote implements Remote {
  readonly tables: { decks: Map<string, Stored<'decks'>>; cards: Map<string, Stored<'cards'>> } = { decks: new Map(), cards: new Map() };
  /** Server clock in epoch ms. */
  now = Date.now();
  offline = false;
  accountGone = false;
  /** Every payload pushed, for asserting what leaves the device. */
  readonly pushed: Array<{ table: Table; rows: unknown[] }> = [];
  private tick = 0;
  /** Live rows per table during one push, for the limit checks. */
  private liveCount = { decks: 0, cards: 0 };

  async checkAccount(): Promise<AccountState> {
    this.ensureOnline();
    return this.accountGone ? 'deleted' : 'ok';
  }

  async push<T extends Table>(table: T, rows: Array<SyncRows[T]>): Promise<PushResult<T>> {
    this.ensureOnline();
    this.pushed.push({ table, rows: structuredClone(rows) });
    const accepted: AnyStored[] = [];
    const rejected: Array<{ id: string; message: string }> = [];
    this.liveCount = { decks: this.live('decks'), cards: this.live('cards') };
    for (const row of rows) {
      const result = table === 'decks' ? this.writeDeck(row as SyncDeck) : this.writeCard(row as SyncCard);
      if (typeof result === 'string') rejected.push({ id: row.id, message: result });
      else if (result) accepted.push(result);
    }
    return { accepted: structuredClone(accepted) as unknown as Array<Stored<T>>, rejected };
  }

  async fetch<T extends Table>(table: T, ids: string[]): Promise<Array<Stored<T>>> {
    this.ensureOnline();
    const store = this.tables[table] as unknown as Map<string, Stored<T>>;
    return structuredClone(ids.flatMap((id) => store.get(id) ?? []));
  }

  async pull<T extends Table>(table: T, after: Cursor | null, limit: number): Promise<Array<Stored<T>>> {
    this.ensureOnline();
    const rows = [...(this.tables[table] as unknown as Map<string, Stored<T>>).values()]
      .filter((row) => !after || row.serverAt > after.serverAt || (row.serverAt === after.serverAt && row.id > after.id))
      .sort((a, b) => (a.serverAt === b.serverAt ? (a.id < b.id ? -1 : 1) : a.serverAt < b.serverAt ? -1 : 1));
    return structuredClone(rows.slice(0, limit));
  }

  private ensureOnline(): void {
    if (this.offline) throw new RemoteUnavailable('offline');
  }

  /** Each write gets a distinct, increasing server time, like separate transactions. */
  private stamp(): string {
    this.tick = Math.max(this.tick + 1, this.now);
    return new Date(this.tick).toISOString();
  }

  /** The shared trigger rules; null means the write was skipped. */
  private guard<T extends AnyStored>(existing: T | undefined, row: T): T | null {
    row.updatedAt = Math.min(row.updatedAt, this.now);
    if (row.deletedAt !== null) row.deletedAt = Math.min(row.deletedAt, this.now);
    if (existing) {
      if (existing.deletedAt !== null) return null;
      if (row.deletedAt === null && row.updatedAt <= existing.updatedAt) return null;
    }
    row.serverAt = this.stamp();
    return row;
  }

  private writeDeck(input: SyncDeck): Stored<'decks'> | string | null {
    if ([...input.name].length > LIMITS.deckName) return 'check_violation';
    const existing = this.tables.decks.get(input.id);
    if (!existing && input.deletedAt === null && this.liveCount.decks >= LIMITS.decks) return 'LIMIT_DECKS';
    const row = this.guard(existing, { ...structuredClone(input), sample: input.sample ?? false, serverAt: '' } as Stored<'decks'>);
    if (!row) return null;
    if (row.deletedAt !== null) row.name = '';
    if (!existing && row.deletedAt === null) this.liveCount.decks++;
    this.tables.decks.set(row.id, row);
    if (row.deletedAt !== null && existing?.deletedAt === null) {
      for (const card of this.tables.cards.values()) {
        if (card.deckId === row.id && card.deletedAt === null) {
          Object.assign(card, { deletedAt: row.deletedAt, updatedAt: row.updatedAt, front: '', back: '', serverAt: this.stamp() });
        }
      }
    }
    return row;
  }

  private writeCard(input: SyncCard): Stored<'cards'> | string | null {
    if ([...input.front].length > LIMITS.sideChars || [...input.back].length > LIMITS.sideChars) return 'check_violation';
    const deck = this.tables.decks.get(input.deckId);
    if (!deck) return 'foreign_key_violation';
    const existing = this.tables.cards.get(input.id);
    if (!existing && input.deletedAt === null && this.liveCount.cards >= LIMITS.cards) return 'LIMIT_CARDS';
    const row = this.guard(existing, { ...structuredClone(input), serverAt: '' } as Stored<'cards'>);
    if (!row) return null;
    if (row.deletedAt === null && deck.deletedAt !== null) row.deletedAt = this.now;
    if (row.deletedAt !== null) Object.assign(row, { front: '', back: '' });
    if (!existing && row.deletedAt === null) this.liveCount.cards++;
    this.tables.cards.set(row.id, row);
    return row;
  }

  private live(table: Table): number {
    return [...this.tables[table].values()].filter((row) => row.deletedAt === null).length;
  }
}
