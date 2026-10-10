/**
 * The sync engine against a real local Supabase stack (row-level security, triggers, PostgREST).
 * Run with `npm run test:integration` after `npx supabase start`; skipped otherwise.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exportBackup, importBackup, parseBackup } from '../data/backup';
import { openDatabase } from '../data/db';
import { Repo } from '../data/repo';
import { SyncEngine } from './engine';
import { SupabaseRemote } from './supabaseRemote';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const url = env.API_URL;
const publishableKey = env.PUBLISHABLE_KEY;
const secretKey = env.SECRET_KEY;
const DAY = 20_000;
let dbCount = 0;

describe.skipIf(!url || !publishableKey || !secretKey)('sync against local Supabase', () => {
  let admin: SupabaseClient;
  const users: string[] = [];

  async function account(): Promise<{ email: string; password: string; id: string }> {
    const email = `sync-${crypto.randomUUID()}@test.dev`;
    const password = crypto.randomUUID();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(data.user.id);
    return { email, password, id: data.user.id };
  }

  async function device(credentials: { email: string; password: string }) {
    const client = createClient(url!, publishableKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword(credentials);
    if (error) throw error;
    const repo = new Repo(await openDatabase(`integration-${dbCount++}`));
    let gone: string | null = null;
    const engine = new SyncEngine(repo.db, new SupabaseRemote(client, data.user.id), { onAccountGone: (state) => (gone = state) });
    return { client, repo, engine, gone: () => gone };
  }

  beforeAll(() => {
    admin = createClient(url!, secretKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  });

  afterAll(async () => {
    for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  });

  it('round-trips decks and cards between two devices of one account', async () => {
    const credentials = await account();
    const laptop = await device(credentials);
    const phone = await device(credentials);
    const deck = await laptop.repo.createDeck('Español');
    const [card] = await laptop.repo.addCards(deck.id, [{ front: 'mañana 😀', back: 'tomorrow' }], DAY);
    await laptop.repo.gradeCard(card!.id, true, DAY);
    await laptop.engine.sync();
    await phone.engine.sync();

    expect(await phone.repo.listDecks()).toMatchObject([{ id: deck.id, name: 'Español', dirty: 0 }]);
    expect(await phone.repo.getCard(card!.id)).toMatchObject({ front: 'mañana 😀', box: 2, dueDay: card!.dueDay + 2, history: [] });
    expect(laptop.engine.lastStatus).toBe('synced');
  });

  it('the later of two conflicting edits wins, whichever device syncs first', async () => {
    const credentials = await account();
    const a = await device(credentials);
    const b = await device(credentials);
    const deck = await a.repo.createDeck('D');
    const [card] = await a.repo.addCards(deck.id, [{ front: 'v0', back: 'b' }], DAY);
    await a.engine.sync();
    await b.engine.sync();

    await a.repo.updateCard(card!.id, { front: 'earlier', back: 'b' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await b.repo.updateCard(card!.id, { front: 'later', back: 'b' });
    await b.engine.sync();
    await a.engine.sync(); // A's older edit is skipped by the server; A adopts the newer one.

    expect((await a.repo.getCard(card!.id))!.front).toBe('later');
    expect(await a.engine.unsyncedCount()).toBe(0);
  });

  it('deleting a deck on one device removes its cards everywhere, even ones edited offline', async () => {
    const credentials = await account();
    const a = await device(credentials);
    const b = await device(credentials);
    const deck = await a.repo.createDeck('Doomed');
    const [card] = await a.repo.addCards(deck.id, [{ front: 'f', back: 'b' }], DAY);
    await a.engine.sync();
    await b.engine.sync();

    await a.repo.deleteDeck(deck.id);
    await a.engine.sync();
    await b.repo.updateCard(card!.id, { front: 'edited offline', back: 'b' });
    await b.repo.addCards(deck.id, [{ front: 'added offline', back: 'b' }], DAY);
    await b.engine.sync();

    expect(await b.repo.listDecks()).toEqual([]);
    const { data } = await b.client.from('cards').select('id, deleted_at');
    expect(data!.length).toBe(2);
    expect(data!.every((row) => row.deleted_at !== null)).toBe(true);
  });

  it('pages through more rows than one request returns', async () => {
    const credentials = await account();
    const a = await device(credentials);
    const deck = await a.repo.createDeck('Big');
    await a.repo.addCards(
      deck.id,
      Array.from({ length: 1500 }, (_, i) => ({ front: `f${i}`, back: 'b' })),
      DAY,
    );
    await a.engine.sync();
    const b = await device(credentials);
    await b.engine.sync();
    expect(await b.repo.listCards(deck.id)).toHaveLength(1500);
  }, 60_000);

  it('accounts never see each other, even with identical ids', async () => {
    const one = await device(await account());
    const two = await device(await account());
    await one.repo.createSampleDeck('Spanish', [{ front: 'hola', back: 'hello' }], DAY);
    await two.repo.createSampleDeck('Spanish', [{ front: 'hola', back: 'hello' }], DAY);
    await one.repo.renameDeck('sample-es', 'Mine');
    await one.engine.sync();
    await two.engine.sync();
    expect((await two.repo.listDecks()).map((d) => d.name)).toEqual(['Spanish']);
    const { data } = await two.client.from('decks').select('name');
    expect(data).toEqual([{ name: 'Spanish' }]);
  });

  it('a JSON backup imported while signed in becomes what the server holds', async () => {
    const credentials = await account();
    const a = await device(credentials);
    const keep = await a.repo.createDeck('Keep');
    const [card] = await a.repo.addCards(keep.id, [{ front: 'as backed up', back: 'b' }], DAY);
    await a.engine.sync();
    const backup = parseBackup(JSON.stringify(await exportBackup(a.repo.db)));

    await a.repo.updateCard(card!.id, { front: 'changed later', back: 'b' });
    await a.repo.createDeck('Made later');
    await a.engine.sync();

    await importBackup(a.repo.db, backup);
    await a.engine.sync();
    const { data: decks } = await a.client.from('decks').select('name').is('deleted_at', null);
    const { data: cards } = await a.client.from('cards').select('front').is('deleted_at', null);
    expect(decks).toEqual([{ name: 'Keep' }]);
    expect(cards).toEqual([{ front: 'as backed up' }]);
  });

  it('clearing site data and signing in again restores everything, deletions included', async () => {
    const credentials = await account();
    const before = await device(credentials);
    const deck = await before.repo.createDeck('Biology');
    const [kept, gone] = await before.repo.addCards(
      deck.id,
      [
        { front: 'kept', back: 'b' },
        { front: 'gone', back: 'b' },
      ],
      DAY,
    );
    await before.repo.gradeCard(kept!.id, true, DAY);
    await before.repo.deleteCard(gone!.id);
    await before.engine.sync();

    // A fresh database on the same browser: what a user gets after clearing site data.
    const after = await device(credentials);
    await after.engine.sync();
    expect((await after.repo.listDecks()).map((d) => d.name)).toEqual(['Biology']);
    expect((await after.repo.listCards(deck.id)).map((c) => [c.front, c.box])).toEqual([['kept', 2]]);
    expect(await after.repo.getCard(gone!.id)).toBeNull();
  });

  it('deleting the account removes every row and other devices learn it at their next sync', async () => {
    const credentials = await account();
    const a = await device(credentials);
    const b = await device(credentials);
    const deck = await a.repo.createDeck('D');
    await a.repo.addCards(deck.id, [{ front: 'f', back: 'b' }], DAY);
    await a.engine.sync();
    await b.engine.sync();

    const { error } = await a.client.rpc('delete_account');
    expect(error).toBeNull();
    const counts = await Promise.all(
      (['decks', 'cards'] as const).map(async (table) => {
        const { count } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('user_id', users.at(-1)!);
        return count;
      }),
    );
    expect(counts).toEqual([0, 0]);

    await b.engine.sync();
    expect(b.gone()).toBe('deleted');
  });
});
