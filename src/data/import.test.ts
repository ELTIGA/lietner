import { describe, expect, it } from 'vitest';

import { LIMITS } from '../domain/types';
import { parseImport } from './import';

describe('parseImport', () => {
  it('reads the starter prompt JSON with a deck name', () => {
    const text = '{"deck": "Cells", "cards": [{"front": "Powerhouse?", "back": "Mitochondria"}, {"front": "Makes proteins?", "back": "Ribosome"}]}';
    expect(parseImport(text)).toEqual({
      cards: [
        { front: 'Powerhouse?', back: 'Mitochondria' },
        { front: 'Makes proteins?', back: 'Ribosome' },
      ],
      skipped: 0,
      tooLong: 0,
      deckName: 'Cells',
    });
  });

  it('reads a bare array', () => {
    expect(parseImport('[{"front": "uno", "back": "one"}]')).toEqual({ cards: [{ front: 'uno', back: 'one' }], skipped: 0, tooLong: 0 });
  });

  it('takes the JSON out of a code fence and ignores chatter around it', () => {
    const text = 'Here are your cards:\n\n```json\n{"deck": " Verbs ", "cards": [{"front": "ser", "back": "to be"}]}\n```\n\nWant more?';
    expect(parseImport(text)).toMatchObject({ cards: [{ front: 'ser', back: 'to be' }], deckName: 'Verbs' });
  });

  it('finds unfenced JSON after a sentence', () => {
    expect(parseImport('Sure! [{"front": "a", "back": "b"}] Enjoy.').cards).toEqual([{ front: 'a', back: 'b' }]);
  });

  it('reports broken or cut-off JSON instead of reading it as CSV', () => {
    expect(parseImport('{"deck": "Cells", "cards": [{"front": "a", "back": "b"},')).toEqual({ cards: [], skipped: 0, tooLong: 0, error: 'badJson' });
    expect(parseImport('{"deck": "Cells"}').error).toBe('badJson');
  });

  it('counts cards missing a side as skipped and over-long ones as too long', () => {
    const long = 'x'.repeat(LIMITS.sideChars + 1);
    const text = JSON.stringify([{ front: 'a', back: 'b' }, { front: 'only' }, 'not a card', { front: long, back: 'c' }]);
    expect(parseImport(text)).toEqual({ cards: [{ front: 'a', back: 'b' }], skipped: 2, tooLong: 1 });
  });

  it('accepts question/answer keys, any case, and numbers', () => {
    expect(parseImport('[{"Question": "2 + 2", "ANSWER": 4}]').cards).toEqual([{ front: '2 + 2', back: '4' }]);
  });

  it('passes CSV through to parseCards', () => {
    expect(parseImport('front,back\nf(x) = [x],floor\nhola,hello\n')).toEqual({
      cards: [
        { front: 'f(x) = [x]', back: 'floor' },
        { front: 'hola', back: 'hello' },
      ],
      skipped: 0,
      tooLong: 0,
    });
  });

  it('reads CSV inside a code fence', () => {
    expect(parseImport('```csv\nuno,one\ndos,two\n```').cards).toEqual([
      { front: 'uno', back: 'one' },
      { front: 'dos', back: 'two' },
    ]);
  });
});
