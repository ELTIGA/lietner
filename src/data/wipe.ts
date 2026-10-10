import type { Database } from './db';

/** Per-device preferences that survive signing out. */
const DEVICE_META = new Set<string>(['speed', 'installHintDismissed']);

/**
 * Removes an account's data from this device (sign-out, account deletion): every deck,
 * card and sync cursor. Shared school computers end up as a clean guest.
 */
export async function wipeAccountData(db: Database): Promise<void> {
  const tx = db.transaction(['decks', 'cards', 'meta'], 'readwrite');
  const meta = tx.objectStore('meta');
  const keys = await meta.getAllKeys();
  await Promise.all([
    tx.objectStore('decks').clear(),
    tx.objectStore('cards').clear(),
    ...keys.filter((key) => !DEVICE_META.has(String(key))).map((key) => meta.delete(key)),
    tx.done,
  ]);
}
