import type { SupabaseClient } from '@supabase/supabase-js';
import { isAuthApiError, isAuthRetryableFetchError, isAuthSessionMissingError } from '@supabase/supabase-js';

import type { Box } from '../domain/types';
import type { AccountState, Cursor, PushResult, Remote, Stored, SyncCard, SyncDeck, SyncRows, Table } from './remote';
import { parseTimestamp, RemoteUnavailable } from './remote';

const COLUMNS: Record<Table, string> = {
  decks: 'id,name,sample,created_at,updated_at,deleted_at,server_at',
  cards: 'id,deck_id,front,back,box,due_day,created_at,updated_at,deleted_at,server_at',
};

/** Ids per fetch request, to keep URLs short. */
const FETCH_CHUNK = 100;

/** Auth errors meaning this device's session is over for good (signed out everywhere, or revoked). */
const SESSION_ENDED_CODES = new Set(['session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'session_expired', 'bad_jwt', 'no_authorization']);

interface DeckRow {
  id: string;
  name: string;
  sample: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_at: string;
}

interface CardRow {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  box: number;
  due_day: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_at: string;
}

const iso = (ms: number) => new Date(ms).toISOString();
const isoOrNull = (ms: number | null) => (ms === null ? null : iso(ms));
const msOrNull = (value: string | null) => (value === null ? null : parseTimestamp(value));

function toRow(table: Table, row: SyncDeck | SyncCard, userId: string): Record<string, unknown> {
  const common = { user_id: userId, id: row.id, created_at: iso(row.createdAt), updated_at: iso(row.updatedAt), deleted_at: isoOrNull(row.deletedAt) };
  if (table === 'decks') {
    const deck = row as SyncDeck;
    return { ...common, name: deck.name, sample: deck.sample === true };
  }
  const card = row as SyncCard;
  return { ...common, deck_id: card.deckId, front: card.front, back: card.back, box: card.box, due_day: card.dueDay };
}

function fromRow<T extends Table>(table: T, row: DeckRow | CardRow): Stored<T> {
  const common = {
    id: row.id,
    createdAt: parseTimestamp(row.created_at),
    updatedAt: parseTimestamp(row.updated_at),
    deletedAt: msOrNull(row.deleted_at),
    serverAt: row.server_at,
  };
  if (table === 'decks') {
    const deck = row as DeckRow;
    return { ...common, name: deck.name, ...(deck.sample ? { sample: true } : {}) } as unknown as Stored<T>;
  }
  const card = row as CardRow;
  return { ...common, deckId: card.deck_id, front: card.front, back: card.back, box: card.box as Box, dueDay: card.due_day } as unknown as Stored<T>;
}

/** PostgREST reports network failures as status 0 and an outage or a paused project as 5xx. */
function unavailable(status: number, cause: unknown): RemoteUnavailable | null {
  if (status !== 0 && status < 500) return null;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return new RemoteUnavailable(offline ? 'offline' : 'paused', cause);
}

/** Supabase (PostgREST under row-level security) as the sync server for one signed-in account. */
export class SupabaseRemote implements Remote {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async checkAccount(): Promise<AccountState> {
    // getUser() asks the server, unlike getSession(), which trusts the token stored on this device.
    const { data, error } = await this.client.auth.getUser();
    if (!error && data.user) return 'ok';
    if (isAuthApiError(error) && error.code === 'user_not_found') return 'deleted';
    if (isAuthSessionMissingError(error)) return 'signedOut';
    if (isAuthApiError(error) && (SESSION_ENDED_CODES.has(error.code ?? '') || error.status === 401 || error.status === 403)) return 'signedOut';
    if (isAuthRetryableFetchError(error)) throw unavailable(0, error)!;
    throw unavailable(isAuthApiError(error) ? error.status : 0, error) ?? new RemoteUnavailable('paused', error);
  }

  async push<T extends Table>(table: T, rows: Array<SyncRows[T]>): Promise<PushResult<T>> {
    const result: PushResult<T> = { accepted: [], rejected: [] };
    await this.upsert(table, rows, result);
    return result;
  }

  /** Upserts a batch; if the server refuses it, splits it until the refused rows are isolated. */
  private async upsert<T extends Table>(table: T, rows: Array<SyncRows[T]>, result: PushResult<T>): Promise<void> {
    if (!rows.length) return;
    const { data, error, status } = await this.client
      .from(table)
      .upsert(
        rows.map((row) => toRow(table, row, this.userId)),
        { onConflict: 'user_id,id' },
      )
      .select(COLUMNS[table]);
    if (!error) {
      result.accepted.push(...(data as unknown as Array<DeckRow | CardRow>).map((row) => fromRow(table, row)));
      return;
    }
    const down = unavailable(status, error);
    if (down) throw down;
    if (rows.length === 1) {
      result.rejected.push({ id: rows[0]!.id, message: error.message });
      return;
    }
    const half = Math.ceil(rows.length / 2);
    await this.upsert(table, rows.slice(0, half), result);
    await this.upsert(table, rows.slice(half), result);
  }

  async fetch<T extends Table>(table: T, ids: string[]): Promise<Array<Stored<T>>> {
    const rows: Array<Stored<T>> = [];
    for (let start = 0; start < ids.length; start += FETCH_CHUNK) {
      const { data, error, status } = await this.client
        .from(table)
        .select(COLUMNS[table])
        .in('id', ids.slice(start, start + FETCH_CHUNK));
      if (error) throw unavailable(status, error) ?? new RemoteUnavailable('paused', error);
      rows.push(...(data as unknown as Array<DeckRow | CardRow>).map((row) => fromRow(table, row)));
    }
    return rows;
  }

  async pull<T extends Table>(table: T, after: Cursor | null, limit: number): Promise<Array<Stored<T>>> {
    let query = this.client.from(table).select(COLUMNS[table]).order('server_at', { ascending: true }).order('id', { ascending: true }).limit(limit);
    if (after) {
      // Keyset paging; values are quoted because timestamps contain reserved characters (: . +).
      query = query.or(`server_at.gt."${after.serverAt}",and(server_at.eq."${after.serverAt}",id.gt."${after.id}")`);
    }
    const { data, error, status } = await query;
    if (error) throw unavailable(status, error) ?? new RemoteUnavailable('paused', error);
    return (data as unknown as Array<DeckRow | CardRow>).map((row) => fromRow(table, row));
  }
}
