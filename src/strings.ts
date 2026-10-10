/**
 * Every user-visible string in one place, ready for community translations.
 * Interpolated strings are functions; keep sentences whole so translators can reorder them.
 */

import { LIMITS } from './domain/types';

const numberFormat = new Intl.NumberFormat('en');
const pluralRules = new Intl.PluralRules('en');

/** "1 card", "5,000 cards". */
export function plural(count: number, one: string, other = `${one}s`): string {
  return `${numberFormat.format(count)} ${pluralRules.select(count) === 'one' ? one : other}`;
}

export const t = {
  appName: 'Lietner',
  brandMark: 'L',

  topbar: {
    deck: 'Deck',
    editDeck: 'Edit deck',
    newDeck: 'New deck',
    settings: 'Settings',
  },

  home: {
    empty: 'This deck is empty. Add cards to start.',
    due: (count: number) => `${plural(count, 'card')} due today`,
    caughtUp: (when: string) => `All caught up. Next review ${when}.`,
    allMastered: 'Every card mastered.',
    meta: (total: number, mastered: number) => `${plural(total, 'card')} · ${numberFormat.format(mastered)} mastered`,
    startReview: 'Start review',
    addCards: 'Add cards',
  },

  welcome: {
    eyebrow: 'Spaced repetition, on a desk',
    title: 'Five boxes. Cards climb when you know them, fall back when you don’t.',
    deckNamePlaceholder: 'Deck name, e.g. Spanish verbs',
    deckNameLabel: 'Deck name',
    defaultDeckName: 'My first deck',
    create: 'Create deck',
    sample: 'or load a 25-card Spanish sample deck',
    sampleDeckName: 'Spanish basics',
  },

  newDeck: {
    title: 'New deck',
    label: 'Deck name',
    create: 'Create',
  },

  untitledDeck: 'Untitled deck',

  day: {
    today: 'today',
    tomorrow: 'tomorrow',
    inDays: (days: number) => `in ${days} days`,
    on: (date: string) => `on ${date}`,
  },

  review: {
    progress: (index: number, total: number) => `${index} / ${total}`,
    end: 'End',
    showAnswer: 'Show answer',
    knew: 'Knew it',
    missed: 'Missed',
    hint: 'Press any key mid-animation to skip it · ',
    hintSkip: ' skips',
    complete: 'Session complete',
    reviewed: (count: number) => (count ? `${plural(count, 'card')} reviewed` : 'Nothing reviewed'),
    statKnew: 'Knew',
    statMissed: 'Missed',
    statMastered: 'Mastered',
    next: (count: number, when: string) => `Next: ${plural(count, 'card')} ${when}`,
    backToDesk: 'Back to desk',
  },

  card: {
    question: 'Q.',
    answer: 'A.',
    box: (box: number) => `BOX ${box}`,
  },

  editor: {
    label: 'Deck editor',
    deckName: 'Deck name',
    close: 'Close editor',
    addHeading: 'Add a card',
    frontPlaceholder: 'Front (question)',
    backPlaceholder: 'Back (answer)',
    front: 'Front',
    back: 'Back',
    addCard: 'Add card',
    importSummary: 'Import CSV / Anki text export',
    importHint: 'Two columns, or a header row with front and back. Comma or tab separated.',
    importPlaceholder: 'Paste CSV or tab-separated rows: front, back',
    importText: 'CSV text',
    importFile: 'CSV file',
    import: 'Import',
    importReady: (cards: number, skipped: number, tooLong: number) =>
      [
        `${plural(cards, 'card')} ready`,
        skipped && `${plural(skipped, 'row')} skipped (missing front or back)`,
        tooLong && `${plural(tooLong, 'row')} skipped (over ${numberFormat.format(LIMITS.sideChars)} characters)`,
      ]
        .filter(Boolean)
        .join(', ') + '.',
    imported: (count: number) => `Imported ${plural(count, 'card')} into box 1.`,
    cardCount: (count: number) => plural(count, 'card'),
    noCards: 'No cards yet.',
    mastered: 'Mastered',
    box: (box: number) => `Box ${box}`,
    deleteCard: (front: string) => `Delete card ${front}`,
    deleteDeck: 'Delete deck',
    deleteDeckTitle: 'Delete deck?',
    deleteDeckConfirm: (name: string, cards: number) => `Delete “${name}” and all ${plural(cards, 'card')}? This cannot be undone.`,
  },

  settings: {
    title: 'Settings',
    close: 'Close settings',
    speed: 'Animation speed',
    speedNormal: 'Normal',
    speedFast: 'Fast',
    speedInstant: 'Instant',
    backup: 'Backup',
    backupHint: 'Progress lives only in this browser. Export regularly.',
    exportJson: 'Export JSON',
    importJson: 'Import JSON…',
    backupFile: 'Backup file',
    exported: (decks: number, cards: number) => `Exported ${plural(decks, 'deck')}, ${plural(cards, 'card')}.`,
    importTitle: 'Replace everything?',
    importConfirm: (decks: number, cards: number) =>
      `Replace all current decks and progress with this backup (${plural(decks, 'deck')}, ${plural(cards, 'card')})?`,
    importAction: 'Replace',
    restored: 'Backup restored.',
    importFailed: 'Import failed.',
    keyboard: 'Keyboard',
    shortcuts: {
      start: 'Start review',
      reveal: 'Show answer',
      knew: 'Knew it',
      missed: 'Missed',
      skip: 'Skip animation',
      edit: 'Edit deck',
      escape: 'End session / close',
    },
    backupFilename: (date: string) => `lietner-backup-${date}.json`,
  },

  dialog: {
    cancel: 'Cancel',
    ok: 'OK',
    delete: 'Delete',
  },

  limits: {
    sideChars: `Each side of a card can have up to ${numberFormat.format(LIMITS.sideChars)} characters.`,
    cards: `You've reached the limit of ${numberFormat.format(LIMITS.cards)} cards. Delete some to add more.`,
    decks: `You've reached the limit of ${numberFormat.format(LIMITS.decks)} decks.`,
  },

  errors: {
    notBackup: 'Not a Lietner backup file.',
    backupTooNew: (version: number) => `Backup version ${version} is newer than this app supports.`,
    startFailed: 'Could not start: this browser may block IndexedDB or WebGL.',
    saveFailed: 'Couldn’t save that change. Please try again.',
  },
} as const;
