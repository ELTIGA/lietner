import Papa from 'papaparse';

import type { CardDraft } from '../domain/types';
import { charLength, LIMITS } from '../domain/types';

export interface CsvResult {
  cards: CardDraft[];
  /** Rows missing a front or back. */
  skipped: number;
  /** Rows with a side longer than LIMITS.sideChars. */
  tooLong: number;
}

/** Column headers (and JSON keys, see import.ts) accepted for each side. */
export const FRONT_HEADERS = ['front', 'question', 'term', 'word', 'q'];
export const BACK_HEADERS = ['back', 'answer', 'definition', 'meaning', 'a'];

/**
 * Parses comma- or tab-separated text (Anki's plain-text export included).
 * Uses a front/back header when present, otherwise the first two columns.
 * Anki `#key:value` comment lines are ignored.
 */
export function parseCards(text: string): CsvResult {
  const cleaned = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('#'))
    .join('\n');
  const { data } = Papa.parse<string[]>(cleaned, { skipEmptyLines: 'greedy', delimitersToGuess: [',', '\t', ';', '|'] });

  let rows = data;
  let frontIndex = 0;
  let backIndex = 1;
  const header = rows[0]?.map((cell) => cell.trim().toLowerCase());
  if (header) {
    const front = header.findIndex((cell) => FRONT_HEADERS.includes(cell));
    const back = header.findIndex((cell) => BACK_HEADERS.includes(cell));
    if (front !== -1 && back !== -1) {
      frontIndex = front;
      backIndex = back;
      rows = rows.slice(1);
    }
  }

  return collectCards(rows.map((row): [string, string] => [row[frontIndex]?.trim() ?? '', row[backIndex]?.trim() ?? '']));
}

/** Sorts trimmed front/back pairs into cards, rows missing a side, and rows that are too long. */
export function collectCards(pairs: Iterable<readonly [string, string]>): CsvResult {
  const cards: CardDraft[] = [];
  let skipped = 0;
  let tooLong = 0;
  for (const [front, back] of pairs) {
    if (!front || !back) skipped++;
    else if (charLength(front) > LIMITS.sideChars || charLength(back) > LIMITS.sideChars) tooLong++;
    else cards.push({ front, back });
  }
  return { cards, skipped, tooLong };
}
