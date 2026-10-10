import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';

import { LIMITS } from '../domain/types';
import { exportBackup, importBackup, parseBackup } from './backup';
import { parseCards } from './csv';
import { DB_VERSION, openDatabase } from './db';
import { LimitError, Repo, SAMPLE_DECK_ID, sampleCardId, touch } from './repo';

const DAY = 20_000;
let dbCount = 0;
const dbName = () => `test-${dbCount++}`;
const freshDb = () => openDatabase(dbName());

describe('parseCards', () => {
  it('reads two unnamed columns', () => {
    expect(parseCards('hola,hello\nadiós,goodbye\n')).toEqual({
      cards: [
        { front: 'hola', back: 'hello' },
        { front: 'adiós', back: 'goodbye' },
      ],
      skipped: 0,
      tooLong: 0,
    });
  });

  it('uses front/back headers in any column order', () => {
    expect(parseCards('notes,back,front\nx,uno,one').cards).toEqual([{ front: 'one', back: 'uno' }]);
  });

  it('handles Anki tab export with comment lines and quoted commas', () => {
    const text = '#separator:tab\n#html:false\nperro\tdog, canine\n"gato"\tcat\n';
    expect(parseCards(text).cards).toEqual([
      { front: 'perro', back: 'dog, canine' },
      { front: 'gato', back: 'cat' },
    ]);
  });

  it('counts rows missing a side as skipped', () => {
    expect(parseCards('a,b\nonly\n,empty\n')).toEqual({ cards: [{ front: 'a', back: 'b' }], skipped: 2, tooLong: 0 });
  });

  it('reports sides over the character limit separately', () => {
    const long = 'x'.repeat(LIMITS.sideChars + 1);
    expect(parseCards(`a,b\n${long},c\n`)).toEqual({ cards: [{ front: 'a', back: 'b' }], skipped: 0, tooLong: 1 });
  });
});

describe('database upgrade', () => {
  it('migrates v1 rows: updatedAt = createdAt, no tombstone, marked unsynced', async () => {
    const name = dbName();
    const v1 = await openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore('decks', { keyPath: 'id' });
        db.createObjectStore('cards', { keyPath: 'id' }).createIndex('deckId', 'deckId');
        db.createObjectStore('meta');
      },
    });
    await v1.put('decks', { id: 'd', name: 'Old', createdAt: 111 });
    await v1.put('cards', { id: 'c', deckId: 'd', front: 'f', back: 'b', box: 3, dueDay: DAY, createdAt: 222, history: [] });
    await v1.put('meta', 2, 'speed');
    v1.close();

    const db = await openDatabase(name);
    expect(db.version).toBe(DB_VERSION);
    expect(await db.get('decks', 'd')).toMatchObject({ name: 'Old', updatedAt: 111, deletedAt: null, dirty: 1 });
    expect(await db.get('cards', 'c')).toMatchObject({ box: 3, updatedAt: 222, deletedAt: null, dirty: 1 });
    expect(await db.get('meta', 'speed')).toBe(2);
    expect(await db.countFromIndex('cards', 'dirty', 1)).toBe(1);
  });
});

describe('Repo', () => {
  it('creates decks and cards, grades, and deletes a deck with its cards as tombstones', async () => {
    const repo = new Repo(await freshDb());
    const deck = await repo.createDeck(' Spanish ');
    expect(deck.name).toBe('Spanish');
    const [card] = await repo.addCards(
      deck.id,
      [
        { front: 'a', back: 'b' },
        { front: 'c', back: 'd' },
      ],
      DAY,
    );
    await repo.gradeCard(card!.id, true, DAY);
    const cards = await repo.listCards(deck.id);
    expect(cards.map((c) => [c.front, c.box])).toEqual([
      ['a', 2],
      ['c', 1],
    ]);

    await repo.deleteDeck(deck.id);
    expect(await repo.listDecks()).toEqual([]);
    expect(await repo.listCards(deck.id)).toEqual([]);
    // Tombstones stay behind, unsynced, so the deletion can reach the server.
    expect(await repo.db.get('decks', deck.id)).toMatchObject({ deletedAt: expect.any(Number), dirty: 1 });
    const stored = await repo.db.getAllFromIndex('cards', 'deckId', deck.id);
    expect(stored.every((c) => c.deletedAt !== null && c.dirty === 1)).toBe(true);
  });

  it('hides deleted cards and refuses to grade them', async () => {
    const repo = new Repo(await freshDb());
    const deck = await repo.createDeck('D');
    const [card] = await repo.addCards(deck.id, [{ front: 'a', back: 'b' }], DAY);
    await repo.deleteCard(card!.id);
    expect(await repo.listCards(deck.id)).toEqual([]);
    expect(await repo.gradeCard(card!.id, true, DAY)).toBeNull();
    expect(await repo.countCards()).toBe(0);
  });

  it('grades the stored version, keeping edits made after the caller read the card', async () => {
    const repo = new Repo(await freshDb());
    const deck = await repo.createDeck('D');
    const [card] = await repo.addCards(deck.id, [{ front: 'old', back: 'b' }], DAY);
    await repo.updateCard(card!.id, { front: 'new', back: 'b' });
    const graded = await repo.gradeCard(card!.id, true, DAY);
    expect(graded).toMatchObject({ front: 'new', box: 2 });
  });

  it('keeps updatedAt increasing even when the clock goes backwards', () => {
    const row = { updatedAt: 5_000, deletedAt: null, dirty: 0 as const };
    expect(touch(row, row, 1_000).updatedAt).toBe(5_001);
    expect(touch(row, row, 9_000)).toMatchObject({ updatedAt: 9_000, dirty: 1 });
  });

  it('undoes a grade as a new edit', async () => {
    const repo = new Repo(await freshDb());
    const deck = await repo.createDeck('D');
    const [card] = await repo.addCards(deck.id, [{ front: 'a', back: 'b' }], DAY);
    const graded = await repo.gradeCard(card!.id, true, DAY);
    const restored = await repo.restoreGrade(card!);
    expect(restored).toMatchObject({ box: 1, dueDay: DAY, history: [] });
    expect(restored!.updatedAt).toBeGreaterThan(graded!.updatedAt);
  });

  it('enforces the per-account limits', async () => {
    const repo = new Repo(await freshDb());
    const deck = await repo.createDeck('D');
    await expect(repo.addCards(deck.id, [{ front: 'x'.repeat(LIMITS.sideChars + 1), back: 'b' }], DAY)).rejects.toBeInstanceOf(LimitError);
    // Code points, not UTF-16 units: 1,000 emoji fit.
    await expect(repo.addCards(deck.id, [{ front: '😀'.repeat(LIMITS.sideChars), back: 'b' }], DAY)).resolves.toHaveLength(1);

    const many = Array.from({ length: LIMITS.cards }, (_, i) => ({ front: `f${i}`, back: 'b' }));
    await expect(repo.addCards(deck.id, many, DAY)).rejects.toMatchObject({ kind: 'cards' });

    for (let i = 1; i < LIMITS.decks; i++) await repo.createDeck(`D${i}`);
    await expect(repo.createDeck('one too many')).rejects.toMatchObject({ kind: 'decks' });
  });

  it('gives the sample deck fixed ids, unless a deleted copy holds them', async () => {
    const repo = new Repo(await freshDb());
    const drafts = [
      { front: 'hola', back: 'hello' },
      { front: 'adiós', back: 'goodbye' },
    ];
    const first = await repo.createSampleDeck('Spanish', drafts, DAY);
    expect(first).toMatchObject({ id: SAMPLE_DECK_ID, sample: true });
    expect((await repo.listCards(first.id)).map((c) => c.id)).toEqual([sampleCardId(0), sampleCardId(1)]);

    await repo.deleteDeck(first.id);
    const second = await repo.createSampleDeck('Spanish', drafts, DAY);
    expect(second.id).not.toBe(SAMPLE_DECK_ID);
    expect(second.sample).toBe(true);
  });

  it('notifies listeners after writes', async () => {
    const repo = new Repo(await freshDb());
    let calls = 0;
    repo.onChange(() => calls++);
    const deck = await repo.createDeck('D');
    await repo.addCards(deck.id, [{ front: 'a', back: 'b' }], DAY);
    expect(calls).toBe(2);
  });
});

describe('backup', () => {
  it('round-trips through JSON into a fresh database', async () => {
    const source = await freshDb();
    const repo = new Repo(source);
    const deck = await repo.createDeck('D');
    const [card] = await repo.addCards(deck.id, [{ front: 'x', back: 'y' }], DAY);
    for (let i = 0; i < 5; i++) await repo.gradeCard(card!.id, true, DAY);

    const json = JSON.stringify(await exportBackup(source));
    const target = await freshDb();
    await new Repo(target).createDeck('will be replaced');
    await importBackup(target, parseBackup(json));

    const restored = await exportBackup(target);
    const original = await exportBackup(source);
    const content = (backup: typeof original) => backup.cards.map(({ updatedAt: _, ...rest }) => rest);
    expect(restored.decks.map((d) => d.name)).toEqual(['D']);
    expect(content(restored)).toEqual(content(original));
    expect(restored.cards[0]!.box).toBe(6);
    expect(restored.cards[0]!.history).toHaveLength(5);
  });

  it('exports live rows only, without sync bookkeeping', async () => {
    const db = await freshDb();
    const repo = new Repo(db);
    const deck = await repo.createDeck('D');
    const [keep, drop] = await repo.addCards(
      deck.id,
      [
        { front: 'keep', back: 'b' },
        { front: 'drop', back: 'b' },
      ],
      DAY,
    );
    await repo.deleteCard(drop!.id);
    const backup = await exportBackup(db);
    expect(backup.cards.map((c) => c.id)).toEqual([keep!.id]);
    expect(backup.cards[0]).not.toHaveProperty('dirty');
    expect(backup.cards[0]).not.toHaveProperty('deletedAt');
  });

  it('import tombstones local rows missing from the backup and writes backup rows as fresh edits', async () => {
    const db = await freshDb();
    const repo = new Repo(db);
    const kept = await repo.createDeck('Kept');
    const gone = await repo.createDeck('Gone');
    const [goneCard] = await repo.addCards(gone.id, [{ front: 'g', back: 'g' }], DAY);
    const backup = parseBackup(JSON.stringify({ ...(await exportBackup(db)), decks: [{ id: kept.id, name: 'Kept' }], cards: [] }));
    const before = Date.now();

    await importBackup(db, backup);
    expect((await repo.listDecks()).map((d) => d.name)).toEqual(['Kept']);
    expect(await db.get('decks', gone.id)).toMatchObject({ deletedAt: expect.any(Number), dirty: 1 });
    expect(await db.get('cards', goneCard!.id)).toMatchObject({ deletedAt: expect.any(Number), dirty: 1 });
    expect((await db.get('decks', kept.id))!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('gives rows new ids when the backup matches a local tombstone', async () => {
    const db = await freshDb();
    const repo = new Repo(db);
    const deck = await repo.createDeck('D');
    const [card] = await repo.addCards(deck.id, [{ front: 'a', back: 'b' }], DAY);
    const backup = parseBackup(JSON.stringify(await exportBackup(db)));
    await repo.deleteDeck(deck.id);

    await importBackup(db, backup);
    const [restored] = await repo.listDecks();
    expect(restored!.id).not.toBe(deck.id);
    const cards = await repo.listCards(restored!.id);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.id).not.toBe(card!.id);
    expect(cards[0]!.front).toBe('a');
  });

  it('accepts v1 files without timestamps and drops cards whose deck is missing', () => {
    const json = JSON.stringify({
      format: 'leitner-3d-backup',
      version: 1,
      decks: [{ id: 'd', name: 'D' }],
      cards: [
        { id: 'c', deckId: 'd', front: 'f', back: 'b', box: 2, dueDay: 1 },
        { id: 'orphan', deckId: 'nope', front: 'f', back: 'b', box: 1, dueDay: 1 },
      ],
    });
    const backup = parseBackup(json);
    expect(backup.cards.map((c) => c.id)).toEqual(['c']);
    expect(backup.cards[0]).toMatchObject({ history: [], createdAt: expect.any(Number), updatedAt: expect.any(Number) });
  });

  it('rejects foreign JSON', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow(/Not a Lietner backup/);
  });

  it('rejects cards with an impossible box', () => {
    const card = { id: 'c', deckId: 'd', front: 'f', back: 'b', box: 7, dueDay: 1 };
    const json = JSON.stringify({ format: 'leitner-3d-backup', version: 1, decks: [{ id: 'd', name: 'D' }], cards: [card] });
    expect(() => parseBackup(json)).toThrow(/Not a Lietner backup/);
  });

  it('rejects backups over the limits', () => {
    const card = { id: 'c', deckId: 'd', front: 'x'.repeat(LIMITS.sideChars + 1), back: 'b', box: 1, dueDay: 1 };
    const json = JSON.stringify({ format: 'leitner-3d-backup', version: 1, decks: [{ id: 'd', name: 'D' }], cards: [card] });
    expect(() => parseBackup(json)).toThrow(/characters/);
  });
});
