/** Leitner boxes 1–5; 6 means the card graduated out of box 5. */
export type Box = 1 | 2 | 3 | 4 | 5 | 6;

export const BOX_COUNT = 5;
export const MASTERED: Box = 6;

/** Per-account limits, mirrored by database constraints and triggers. */
export const LIMITS = {
  /** Characters (code points) per card side. */
  sideChars: 1000,
  deckName: 80,
  cards: 5000,
  decks: 100,
} as const;

/** Bookkeeping that lets rows sync: last edit time, tombstone, and an unsynced-change flag. */
export interface SyncFields {
  /** Epoch ms of the last edit; after a sync, the server's (clock-capped) value. */
  updatedAt: number;
  /** Epoch ms of deletion. Deleted rows stay as tombstones so the deletion can sync. */
  deletedAt: number | null;
  /** 1 while the row has local changes the server hasn't accepted yet. A number so it can be indexed. */
  dirty: 0 | 1;
}

export interface Deck extends SyncFields {
  id: string;
  name: string;
  createdAt: number;
  /** The built-in sample deck, so a first sign-in can tell real data from the sample. */
  sample?: boolean;
}

export interface GradeEvent {
  day: number;
  knew: boolean;
  from: Box;
  to: Box;
}

export interface Card extends SyncFields {
  id: string;
  deckId: string;
  front: string;
  back: string;
  box: Box;
  /** Local calendar day number (see day.ts) on which the card is next due. */
  dueDay: number;
  createdAt: number;
  /** Grade log. Stays on this device: it is never synced. */
  history: GradeEvent[];
}

export type CardDraft = Pick<Card, 'front' | 'back'>;

/** Length in code points, matching Postgres char_length(). */
export function charLength(text: string): number {
  return Array.from(text).length;
}
