import { describe, expect, it } from 'vitest';

import { dayNumber, dayToDate } from './day';
import { boxCounts, grade, INTERVALS, isDue, newCard, sessionQueue } from './leitner';
import { MASTERED } from './types';

const DAY = 20_000;
const make = (box: 1 | 2 | 3 | 4 | 5 | 6, dueDay = DAY, id = 'c') => ({
  ...newCard({ front: 'f', back: 'b' }, 'd', DAY, id),
  box,
  dueDay,
});

describe('grade', () => {
  it('promotes one box and schedules by the new box interval', () => {
    for (let box = 1; box <= 4; box++) {
      const next = grade(make(box as 1), true, DAY);
      expect(next.box).toBe(box + 1);
      expect(next.dueDay).toBe(DAY + INTERVALS[box]!);
    }
  });

  it('masters a card known in box 5', () => {
    const next = grade(make(5), true, DAY);
    expect(next.box).toBe(MASTERED);
    expect(isDue(next, DAY + 10_000)).toBe(false);
  });

  it('sends a missed card to box 1, due tomorrow', () => {
    const next = grade(make(4), false, DAY);
    expect(next.box).toBe(1);
    expect(next.dueDay).toBe(DAY + 1);
  });

  it('records history without mutating the input', () => {
    const card = make(2);
    const next = grade(card, true, DAY);
    expect(card.history).toHaveLength(0);
    expect(next.history).toEqual([{ day: DAY, knew: true, from: 2, to: 3 }]);
  });
});

describe('sessionQueue', () => {
  it('includes only due, non-mastered cards ordered by box', () => {
    const cards = [make(3, DAY, 'a'), make(1, DAY - 2, 'b'), make(2, DAY + 1, 'c'), make(MASTERED, 0, 'd'), make(1, DAY, 'e')];
    const queue = sessionQueue(cards, DAY, () => 0.5);
    expect(queue.map((c) => c.id)).toEqual(['b', 'e', 'a']);
  });

  it('new cards are due on their creation day', () => {
    expect(isDue(newCard({ front: ' x ', back: 'y' }, 'd', DAY), DAY)).toBe(true);
  });
});

describe('boxCounts', () => {
  it('counts per box including mastered', () => {
    expect(boxCounts([make(1), make(1), make(MASTERED)])).toMatchObject({ 1: 2, 6: 1 });
  });
});

describe('day', () => {
  it('round-trips and ignores time of day', () => {
    const morning = new Date(2026, 2, 29, 0, 30);
    const night = new Date(2026, 2, 29, 23, 59);
    expect(dayNumber(morning)).toBe(dayNumber(night));
    expect(dayToDate(dayNumber(night)).getDate()).toBe(29);
  });

  it('consecutive dates differ by exactly one across DST', () => {
    expect(dayNumber(new Date(2026, 2, 30)) - dayNumber(new Date(2026, 2, 29))).toBe(1);
    expect(dayNumber(new Date(2026, 9, 26)) - dayNumber(new Date(2026, 9, 25))).toBe(1);
  });
});
