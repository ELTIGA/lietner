import { describe, expect, it } from 'vitest';

import { exportBackup, importBackup, parseBackup } from './backup';
import { parseCards } from './csv';
import { openDatabase } from './db';
import { Repo } from './repo';

const DAY = 20_000;
let dbCount = 0;
const freshDb = () => openDatabase(`test-${dbCount++}`);

describe('parseCards', () => {
  it('reads two unnamed columns', () => {
    expect(parseCards('hola,hello\nadiós,goodbye\n')).toEqual({
      cards: [
        { front: 'hola', back: 'hello' },
        { front: 'adiós', back: 'goodbye' },
      ],
      skipped: 0,
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
    expect(parseCards('a,b\nonly\n,empty\n')).toEqual({ cards: [{ front: 'a', back: 'b' }], skipped: 2 });
  });
});

describe('Repo', () => {
  it('creates decks and cards, grades, and deletes a deck with its cards', async () => {
    const repo = new Repo(await freshDb());
    const deck = await repo.createDeck(' Spanish ');
    expect(deck.name).toBe('Spanish');
    const [card] = await repo.addCards(deck.id, [{ front: 'a', back: 'b' }, { front: 'c', back: 'd' }], DAY);
    await repo.gradeCard(card!, true, DAY);
    const cards = await repo.listCards(deck.id);
    expect(cards.map((c) => [c.front, c.box])).toEqual([
      ['a', 2],
      ['c', 1],
    ]);
    await repo.deleteDeck(deck.id);
    expect(await repo.listDecks()).toEqual([]);
    expect(await repo.listCards(deck.id)).toEqual([]);
  });
});

describe('backup', () => {
  it('round-trips through JSON into a fresh database', async () => {
    const source = await freshDb();
    const repo = new Repo(source);
    const deck = await repo.createDeck('D');
    const [card] = await repo.addCards(deck.id, [{ front: 'x', back: 'y' }], DAY);
    for (let i = 0; i < 5; i++) await repo.gradeCard((await repo.listCards(deck.id))[0]!, true, DAY);
    expect(card).toBeDefined();

    const json = JSON.stringify(await exportBackup(source));
    const target = await freshDb();
    await new Repo(target).createDeck('will be replaced');
    await importBackup(target, parseBackup(json));

    const restored = await exportBackup(target);
    const original = await exportBackup(source);
    expect(restored.decks).toEqual(original.decks);
    expect(restored.cards).toEqual(original.cards);
    expect(restored.cards[0]!.box).toBe(6);
  });

  it('rejects foreign JSON', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow(/Not a Lietner backup/);
  });

  it('rejects cards with an impossible box', () => {
    const card = { id: 'c', deckId: 'd', front: 'f', back: 'b', box: 7, dueDay: 1 };
    const json = JSON.stringify({ format: 'leitner-3d-backup', version: 1, decks: [{ id: 'd', name: 'D' }], cards: [card] });
    expect(() => parseBackup(json)).toThrow(/Not a Lietner backup/);
  });
});
