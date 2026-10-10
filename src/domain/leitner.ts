import type { Box, Card, CardDraft } from './types';
import { BOX_COUNT, MASTERED } from './types';

/** Days until next review after landing in box n (index n - 1). */
export const INTERVALS = [1, 2, 4, 8, 16] as const;

export function newCard(draft: CardDraft, deckId: string, day: number, id: string = crypto.randomUUID()): Card {
  return {
    id,
    deckId,
    front: draft.front.trim(),
    back: draft.back.trim(),
    box: 1,
    dueDay: day,
    createdAt: Date.now(),
    history: [],
  };
}

export function isDue(card: Card, day: number): boolean {
  return card.box !== MASTERED && card.dueDay <= day;
}

export function nextBox(box: Box, knew: boolean): Box {
  if (!knew) return 1;
  return Math.min(box + 1, MASTERED) as Box;
}

export function grade(card: Card, knew: boolean, day: number): Card {
  const to = nextBox(card.box, knew);
  // Finite sentinel: Infinity would serialize to null in JSON backups.
  const dueDay = to === MASTERED ? Number.MAX_SAFE_INTEGER : day + intervalFor(to);
  return {
    ...card,
    box: to,
    dueDay,
    history: [...card.history, { day, knew, from: card.box, to }],
  };
}

function intervalFor(box: Box): number {
  // Missed cards (box 1) come back tomorrow; promoted cards use their box interval.
  return INTERVALS[Math.min(box, BOX_COUNT) - 1] ?? 1;
}

/** Due cards ordered by box (lowest first), shuffled within each box. */
export function sessionQueue(cards: Card[], day: number, random: () => number = Math.random): Card[] {
  const due = cards.filter((card) => isDue(card, day));
  const keyed = due.map((card) => ({ card, key: random() }));
  keyed.sort((a, b) => a.card.box - b.card.box || a.key - b.key);
  return keyed.map(({ card }) => card);
}

export function boxCounts(cards: Card[]): Record<Box, number> {
  const counts: Record<Box, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const card of cards) counts[card.box]++;
  return counts;
}
