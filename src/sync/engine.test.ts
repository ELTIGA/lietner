import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exportBackup, importBackup, parseBackup } from '../data/backup';
import { openDatabase } from '../data/db';
import { Repo, SAMPLE_DECK_ID } from '../data/repo';
import type { SyncStatus } from './engine';
import { SyncEngine } from './engine';
import { FakeRemote } from './fakeRemote';
import type { PushResult, SyncRows, Table } from './remote';

const DAY = 20_000;
const HOUR = 3_600_000;
const START = Date.UTC(2026, 9, 10, 12);
let dbCount = 0;

interface Device {
  repo: Repo;
  engine: SyncEngine;
  statuses: SyncStatus[];
  gone: boolean;
}

async function device(remote: FakeRemote, pageSize?: number): Promise<Device> {
  const repo = new Repo(await openDatabase(`sync-${dbCount++}`));
  const result: Device = { repo, engine: null!, statuses: [], gone: false };
  result.engine = new SyncEngine(repo.db, remote, {
    pageSize,
    onStatus: (status) => result.statuses.push(status),
    onAccountGone: () => (result.gone = true),
  });
  return result;
}

/** Moves the device clock (Date.now) and the server clock together. */
function setClock(remote: FakeRemote, time: number): void {
  vi.setSystemTime(time);
  remote.now = time;
}

async function allCards(repo: Repo) {
  const cards = await repo.db.getAll('cards');
  return cards.filter((card) => card.deletedAt === null);
}

let remote: FakeRemote;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  remote = new FakeRemote();
  setClock(remote, START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SyncEngine', () => {
  it('copies decks and cards to a second device, without grade history', async () => {
    const a = await device(remote);
    const b = await device(remote);
    const deck = await a.repo.createDeck('Spanish');
    const [card] = await a.repo.addCards(deck.id, [{ front: 'hola', back: 'hello' }], DAY);
    await a.repo.gradeCard(card!.id, true, DAY);

    await a.engine.sync();
    await b.engine.sync();

    expect((await b.repo.listDecks()).map((d) => d.name)).toEqual(['Spanish']);
    const [copy] = await b.repo.listCards(deck.id);
    expect(copy).toMatchObject({ front: 'hola', box: 2, history: [], dirty: 0 });
    expect((await a.repo.getCard(card!.id))!.history).toHaveLength(1);
    expect(JSON.stringify(remote.pushed)).not.toContain('history');
    expect(await a.engine.unsyncedCount()).toBe(0);
    expect(a.statuses).toEqual(['syncing', 'synced']);
  });

  it('two offline devices grading the same card: the later grade wins on both, no duplicates', async () => {
    for (const order of ['earlier first', 'later first'] as const) {
      const server = new FakeRemote();
      setClock(server, START);
      const a = await device(server);
      const b = await device(server);
      const deck = await a.repo.createDeck('D');
      const [card] = await a.repo.addCards(deck.id, [{ front: 'f', back: 'b' }], DAY);
      await a.engine.sync();
      await b.engine.sync();

      setClock(server, START + HOUR);
      await a.repo.gradeCard(card!.id, true, DAY); // box 2
      setClock(server, START + 2 * HOUR);
      await b.repo.gradeCard(card!.id, false, DAY); // box 1, the later grade

      setClock(server, START + 3 * HOUR);
      const [first, second] = order === 'earlier first' ? [a, b] : [b, a];
      await first.engine.sync();
      await second.engine.sync();
      await first.engine.sync();

      for (const dev of [a, b]) {
        const cards = await allCards(dev.repo);
        expect(cards, order).toHaveLength(1);
        expect(cards[0], order).toMatchObject({ box: 1, dirty: 0 });
      }
      expect(server.tables.cards.get(card!.id)!.box).toBe(1);
    }
  });

  it('a deck deleted on one device stays deleted after another device edits its cards offline', async () => {
    const a = await device(remote);
    const b = await device(remote);
    const deck = await a.repo.createDeck('Doomed');
    const [card] = await a.repo.addCards(deck.id, [{ front: 'f', back: 'b' }], DAY);
    await a.engine.sync();
    await b.engine.sync();

    setClock(remote, START + HOUR);
    await a.repo.deleteDeck(deck.id);
    await a.engine.sync();

    setClock(remote, START + 2 * HOUR);
    await b.repo.updateCard(card!.id, { front: 'edited offline', back: 'b' });
    await b.repo.addCards(deck.id, [{ front: 'new offline', back: 'b' }], DAY);
    await b.engine.sync();
    await a.engine.sync();

    for (const dev of [a, b]) {
      expect(await dev.repo.listDecks()).toEqual([]);
      expect(await allCards(dev.repo)).toEqual([]);
    }
    expect([...remote.tables.cards.values()].every((row) => row.deletedAt !== null)).toBe(true);
  });

  it('a device whose clock is a day ahead cannot overwrite newer edits from other devices', async () => {
    const fast = await device(remote);
    const normal = await device(remote);
    const deck = await normal.repo.createDeck('D');
    const [card] = await normal.repo.addCards(deck.id, [{ front: 'v0', back: 'b' }], DAY);
    await normal.engine.sync();
    await fast.engine.sync();

    // The fast device edits at real time START+1h with its clock showing a day later.
    vi.setSystemTime(START + HOUR + 24 * HOUR);
    remote.now = START + HOUR;
    await fast.repo.updateCard(card!.id, { front: 'fast clock', back: 'b' });
    await fast.engine.sync();
    expect((await fast.repo.getCard(card!.id))!.updatedAt).toBe(START + HOUR);

    // Another device edits later in real time.
    setClock(remote, START + 2 * HOUR);
    await normal.engine.sync();
    await normal.repo.updateCard(card!.id, { front: 'later edit', back: 'b' });
    await normal.engine.sync();

    vi.setSystemTime(START + 3 * HOUR + 24 * HOUR);
    remote.now = START + 3 * HOUR;
    await fast.engine.sync();
    expect((await fast.repo.getCard(card!.id))!.front).toBe('later edit');
    expect(remote.tables.cards.get(card!.id)!.front).toBe('later edit');
  });

  it('first sign-in merges guest data into an account by id, without duplicating the sample deck', async () => {
    const sample = [
      { front: 'hola', back: 'hello' },
      { front: 'adiós', back: 'goodbye' },
    ];
    const laptop = await device(remote);
    await laptop.repo.createSampleDeck('Spanish basics', sample, DAY);
    await laptop.repo.createDeck('Biology');
    await laptop.engine.sync();

    const phone = await device(remote);
    await phone.repo.createSampleDeck('Spanish basics', sample, DAY);
    const chem = await phone.repo.createDeck('Chemistry');
    await phone.repo.addCards(chem.id, [{ front: 'H2O', back: 'water' }], DAY);
    await phone.engine.sync();
    await laptop.engine.sync();

    for (const dev of [laptop, phone]) {
      const names = (await dev.repo.listDecks()).map((d) => d.name).sort();
      expect(names).toEqual(['Biology', 'Chemistry', 'Spanish basics']);
      expect(await allCards(dev.repo)).toHaveLength(3);
    }
    expect(remote.tables.decks.get(SAMPLE_DECK_ID)?.sample).toBe(true);
  });

  it('a JSON backup imported while signed in becomes what the server holds', async () => {
    const a = await device(remote);
    const keep = await a.repo.createDeck('Keep');
    const [card] = await a.repo.addCards(keep.id, [{ front: 'old', back: 'b' }], DAY);
    const drop = await a.repo.createDeck('Drop');
    await a.repo.addCards(drop.id, [{ front: 'x', back: 'y' }], DAY);
    await a.engine.sync();
    const backup = parseBackup(JSON.stringify(await exportBackup(a.repo.db)));

    // Things change after the backup was taken...
    setClock(remote, START + HOUR);
    await a.repo.updateCard(card!.id, { front: 'changed later', back: 'b' });
    await a.repo.createDeck('Made later');
    await a.engine.sync();

    // ...and restoring it makes everything match the backup again, on every device.
    setClock(remote, START + 2 * HOUR);
    await importBackup(a.repo.db, { ...backup, decks: backup.decks.filter((d) => d.id === keep.id), cards: backup.cards.filter((c) => c.deckId === keep.id) });
    await a.engine.sync();
    const b = await device(remote);
    await b.engine.sync();

    for (const dev of [a, b]) {
      expect((await dev.repo.listDecks()).map((d) => d.name)).toEqual(['Keep']);
      expect((await allCards(dev.repo)).map((c) => c.front)).toEqual(['old']);
    }
    const liveOnServer = [...remote.tables.decks.values()].filter((d) => d.deletedAt === null).map((d) => d.name);
    expect(liveOnServer).toEqual(['Keep']);
  });

  it('pulls a large account in pages', { timeout: 30_000 }, async () => {
    const a = await device(remote);
    const deck = await a.repo.createDeck('Big');
    await a.repo.addCards(
      deck.id,
      Array.from({ length: 2500 }, (_, i) => ({ front: `f${i}`, back: 'b' })),
      DAY,
    );
    await a.engine.sync();
    const b = await device(remote, 1000);
    await b.engine.sync();
    expect(await b.repo.listCards(deck.id)).toHaveLength(2500);
  });

  it('only pulls what was stored since the last sync (plus a short lookback)', async () => {
    const a = await device(remote);
    const b = await device(remote);
    const deck = await a.repo.createDeck('D');
    const [old] = await a.repo.addCards(deck.id, [{ front: 'old', back: 'b' }], DAY);
    await a.engine.sync();
    await b.engine.sync();

    setClock(remote, START + HOUR);
    const [fresh] = await a.repo.addCards(deck.id, [{ front: 'new', back: 'b' }], DAY);
    await a.engine.sync();
    await b.engine.sync();
    expect((await b.repo.getCard(fresh!.id))?.front).toBe('new');

    // The cursor now sits at the new card: the next pull only re-reads the minute before it.
    setClock(remote, START + 2 * HOUR);
    const pull = vi.spyOn(remote, 'pull');
    await b.engine.sync();
    const pulled = (await Promise.all(pull.mock.results.map((result) => result.value as Promise<Array<{ id: string }>>))).flat().map((row) => row.id);
    expect(pulled).not.toContain(old!.id);
  });

  it('keeps an edit made while its push was in flight', async () => {
    class SlowRemote extends FakeRemote {
      duringPush: (() => Promise<void>) | null = null;
      override async push<T extends Table>(table: T, rows: Array<SyncRows[T]>): Promise<PushResult<T>> {
        const result = await super.push(table, rows);
        const hook = this.duringPush;
        this.duringPush = null;
        await hook?.();
        return result;
      }
    }
    const slow = new SlowRemote();
    setClock(slow, START);
    const a = await device(slow);
    const deck = await a.repo.createDeck('D');
    slow.duringPush = async () => {
      setClock(slow, START + 1000);
      await a.repo.renameDeck(deck.id, 'Renamed mid-push');
    };

    await a.engine.sync();
    expect(await a.repo.db.get('decks', deck.id)).toMatchObject({ name: 'Renamed mid-push', dirty: 1 });
    await a.engine.sync();
    expect(slow.tables.decks.get(deck.id)!.name).toBe('Renamed mid-push');
    expect(await a.engine.unsyncedCount()).toBe(0);
  });

  it('isolates a row the server refuses and syncs the rest', async () => {
    const a = await device(remote);
    const deck = await a.repo.createDeck('D');
    const [good] = await a.repo.addCards(deck.id, [{ front: 'ok', back: 'b' }], DAY);
    // A row that slipped past client checks (e.g. written by an older app version).
    await a.repo.db.put('cards', { ...good!, id: 'too-long', front: 'x'.repeat(1001) });

    await a.engine.sync();
    expect(remote.tables.cards.has(good!.id)).toBe(true);
    expect(remote.tables.cards.has('too-long')).toBe(false);
    expect(a.statuses.at(-1)).toBe('synced');
    // Not retried until edited (or the next session).
    const pushes = remote.pushed.length;
    await a.engine.sync();
    expect(remote.pushed.length).toBe(pushes);
  });

  it('keeps working offline and catches up afterwards', async () => {
    const a = await device(remote);
    remote.offline = true;
    const deck = await a.repo.createDeck('Offline deck');
    await a.engine.sync();
    expect(a.statuses.at(-1)).toBe('offline');
    expect(await a.engine.unsyncedCount()).toBe(1);

    remote.offline = false;
    await a.engine.sync();
    expect(a.statuses.at(-1)).toBe('synced');
    expect(remote.tables.decks.get(deck.id)?.name).toBe('Offline deck');
  });

  it('reports an account deleted elsewhere instead of pushing', async () => {
    const a = await device(remote);
    await a.repo.createDeck('D');
    remote.accountGone = true;
    await a.engine.sync();
    expect(a.gone).toBe(true);
    expect(remote.pushed).toEqual([]);
  });

  it('runs one extra sync when asked during a sync', async () => {
    const a = await device(remote);
    const pushSpy = vi.spyOn(remote, 'checkAccount');
    await Promise.all([a.engine.sync(), a.engine.sync(), a.engine.sync()]);
    expect(pushSpy).toHaveBeenCalledTimes(2);
  });
});
