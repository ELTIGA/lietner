import type { CsvResult } from './csv';
import { BACK_HEADERS, collectCards, FRONT_HEADERS, parseCards } from './csv';

export interface ImportResult extends CsvResult {
  /** Deck name suggested by a JSON import (the starter prompt asks the AI for one). */
  deckName?: string;
  /** The text looked like JSON but didn't parse into a list of cards. */
  error?: 'badJson';
}

/** The first Markdown code fence, with or without a language tag. */
const FENCE = /```[\w-]*[^\S\n]*\n?([\s\S]*?)```/;
/** Where JSON cards start: an object with a key, or an array of objects. Plain CSV rarely contains either. */
const JSON_START = /\{\s*"|\[\s*\{/;

/**
 * Reads pasted cards: JSON as the AI starter prompt asks for it (`{"deck", "cards": [{front, back}]}`
 * or a bare array), tolerating a code fence and chatter around it, otherwise CSV/TSV via parseCards.
 * Broken JSON is reported, never re-read as CSV, so a cut-off AI reply can't import garbage rows.
 */
export function parseImport(text: string): ImportResult {
  const body = FENCE.exec(text)?.[1] ?? text;
  const start = body.search(JSON_START);
  if (start === -1) return parseCards(body);

  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  let value: unknown;
  try {
    value = JSON.parse(end > start ? body.slice(start, end + 1) : body.slice(start));
  } catch {
    return badJson();
  }

  const items: unknown[] | null = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.cards) ? value.cards : null;
  if (!items) return badJson();
  const result: ImportResult = collectCards(items.map((item): [string, string] => (isRecord(item) ? [side(item, FRONT_HEADERS), side(item, BACK_HEADERS)] : ['', ''])));
  const deckName = isRecord(value) && typeof value.deck === 'string' ? value.deck.trim() : '';
  if (deckName) result.deckName = deckName;
  return result;
}

function badJson(): ImportResult {
  return { cards: [], skipped: 0, tooLong: 0, error: 'badJson' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The first text or number under one of `keys`, matched case-insensitively. */
function side(item: Record<string, unknown>, keys: readonly string[]): string {
  for (const [key, value] of Object.entries(item)) {
    if (keys.includes(key.trim().toLowerCase()) && (typeof value === 'string' || typeof value === 'number')) return String(value).trim();
  }
  return '';
}
