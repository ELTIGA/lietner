/** Leitner boxes 1–5; 6 means the card graduated out of box 5. */
export type Box = 1 | 2 | 3 | 4 | 5 | 6;

export const BOX_COUNT = 5;
export const MASTERED: Box = 6;

export interface Deck {
  id: string;
  name: string;
  createdAt: number;
}

export interface GradeEvent {
  day: number;
  knew: boolean;
  from: Box;
  to: Box;
}

export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  box: Box;
  /** Local calendar day number (see day.ts) on which the card is next due. */
  dueDay: number;
  createdAt: number;
  history: GradeEvent[];
}

export type CardDraft = Pick<Card, 'front' | 'back'>;
