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
    menu: 'Menu',
    donate: 'Donate',
    donateLabel: 'Donate to keep Lietner free',
  },

  home: {
    due: (count: number) => `${plural(count, 'card')} due today`,
    caughtUp: (when: string) => `All caught up. Next review ${when}.`,
    allMastered: 'Every card mastered.',
    meta: (total: number, mastered: number) => `${plural(total, 'card')} · ${numberFormat.format(mastered)} mastered`,
    startReview: 'Start review',
  },

  starter: {
    title: 'Before you start, let an AI write your cards.',
    copyStep: 'Copy the prompt',
    copyHint:
      'Paste it into your favourite AI (ChatGPT, Claude, Gemini…) and attach the book, PDF or notes you want to study. It asks you three quick questions, then writes about 30 cards.',
    copyPrompt: 'Copy prompt',
    copied: 'Copied ✓',
    copyFailed: 'Your browser blocked copying. Select the prompt below and copy it yourself.',
    promptLabel: 'Prompt',
    pasteStep: 'Paste the AI’s reply',
    pasteHint: 'Copy its whole code block and paste it here.',
    pasteLabel: 'Cards from your AI',
    pastePlaceholder: '{"deck": "…", "cards": [ … ]}',
    import: 'Import cards',
    byHand: 'or add cards by hand',
    discard: 'Discard this empty deck',
    badJson: 'That doesn’t look like the cards block. Copy the AI’s whole code block and try again.',
    /** Copied to the clipboard and pasted into the student's own AI, so it stays in English with straight quotes. */
    prompt: `I want to study the material I've attached (or will paste) with flashcards in Lietner, a Leitner-box flashcard app. Help me make about 30 cards.

Step 1. If I haven't attached or pasted any material yet, ask me for it and stop there.

Step 2. Read the material, then ask me these three questions in ONE message, numbered 1 to 3. Give each question 3 or 4 lettered options that fit this specific material (for example, its real chapter or section names). I'll reply like "1b 2a 3c" or in my own words. Don't write any cards yet.
1. Scope: which part should the cards cover (one chapter or section, several, or all of it)?
2. Depth: big-picture ideas and key terms, or specific details (names, dates, numbers, steps)?
3. Difficulty: beginner, intermediate, or exam-level?

Step 3. After I answer, write about 30 cards that match my answers:
- One fact or idea per card. The front is a question; the back is a short answer (aim for under 200 characters, never over ${numberFormat.format(LIMITS.sideChars)}).
- Plain text only: no Markdown, LaTeX, HTML or images. Write maths in words or Unicode (x², √, π).
- Use the same language as the material unless I ask otherwise.
- No duplicate cards.

Reply with exactly one JSON code block in this shape, and nothing else:
{"deck": "Short deck name", "cards": [{"front": "Question", "back": "Answer"}]}`,
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
    undo: 'Undo',
    graded: (box: number) => (box === 6 ? 'Mastered ★' : box === 1 ? 'Back to box 1' : `Moved to box ${box}`),
    questionText: (front: string) => `Question: ${front}`,
    answerText: (back: string) => `Answer: ${back}`,
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
    importSummary: 'Import JSON, CSV or Anki text export',
    importHint: 'JSON cards from an AI, or two columns (a header row with front and back is optional). Comma or tab separated.',
    importPlaceholder: 'Paste JSON cards, or CSV rows: front, back',
    importText: 'Cards to import',
    importFile: 'Import file',
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
    backupHintSignedIn: 'Your decks sync to your account. A JSON backup is still a good extra copy.',
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
      undo: 'Undo last grade',
      escape: 'End session / close',
    },
    backupFilename: (date: string) => `lietner-backup-${date}.json`,
  },

  account: {
    signIn: 'Sign in',
    signInTitle: 'Sign in to sync',
    signInIntro: 'Sync your decks and progress between your devices. Optional: everything works without an account.',
    ageLabel: 'I’m 13 or older (or the minimum age for online services where I live).',
    ageRequired: 'Please confirm your age first.',
    or: 'or',
    googleNeedsAge: 'Tick the box above to continue with Google.',
    googleUnavailable: 'Google sign-in didn’t load. Try the email code instead.',
    googleIosApp: 'Google sign-in can fail inside the installed iPhone app. Use the email code instead.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    sendCode: 'Email me a code',
    sending: 'Sending…',
    codeSent: (email: string) => `We sent a 6-digit code to ${email}. It expires in an hour.`,
    codeLabel: '6-digit code',
    verify: 'Sign in',
    verifying: 'Signing in…',
    otherEmail: 'Use a different email',
    resend: 'Send a new code',
    legal: 'By signing in you agree to the',
    terms: 'Terms',
    privacy: 'Privacy policy',
    and: 'and',
    errors: {
      emailCap: 'We can’t send more email codes today. Sign in with Google, or keep studying as a guest: nothing is lost.',
      signupsPaused: 'New sign-ups are paused for now. Existing accounts and guest mode keep working.',
      badCode: 'That code is wrong or has expired. Check it, or send a new one.',
      badEmail: 'That email address doesn’t look right.',
      offline: 'Can’t reach the sync server. Check your connection, or keep studying as a guest.',
      generic: 'Sign-in didn’t work. Please try again.',
      tooMany: 'Too many attempts. Wait a minute and try again.',
    },
    mergeTitle: 'Add this device’s decks?',
    mergeBody: (local: number) =>
      `This account already has decks. Add the ${plural(local, 'deck')} on this device to it? Decks are matched by ID, so nothing is duplicated or lost.`,
    mergeConfirm: 'Add to account',
    mergeCancel: 'Cancel sign-in',
    signedIn: (email: string) => `Signed in as ${email}`,
    signOut: 'Sign out',
    signOutTitle: 'Sign out?',
    signOutBody: 'Your decks stay in your account. This device forgets them until you sign in again.',
    signOutUnsynced: (count: number) =>
      `${plural(count, 'change')} on this device ${count === 1 ? 'hasn’t' : 'haven’t'} synced yet, probably because you’re offline. Signing out removes ${count === 1 ? 'it' : 'them'}. Export a backup first, or sign out anyway?`,
    signOutAnyway: 'Sign out anyway',
    exportFirst: 'Export JSON first',
    deleteAccount: 'Delete account',
    deleteTitle: 'Delete your account?',
    deleteBody:
      'This permanently deletes your account and every deck and card in it, from the server and from this device. Other signed-in devices sign out at their next sync. It can’t be undone.',
    deleteConfirm: 'Delete my account',
    deleted: 'Your account and its data were deleted.',
    deleteFailed: 'Couldn’t delete the account. Check your connection and try again.',
    goneDeleted: 'This account was deleted on another device, so this device was signed out.',
    goneSignedOut: 'Your session ended, so this device was signed out.',
    goneUnsyncedTitle: 'Signed out',
    goneUnsynced: (count: number) =>
      `${plural(count, 'change')} on this device never reached your account. Export ${count === 1 ? 'it' : 'them'} before ${count === 1 ? 'it’s' : 'they’re'} removed?`,
    removeNow: 'Remove them',
    signInAgain: 'Sign in again',
    signedOutToast: 'Signed out. This device is back to guest mode.',
    welcome: (email: string) => `Signed in as ${email}. Syncing…`,
    section: 'Account',
    guestHint: 'Sign in to sync your decks between devices. Everything works without an account too.',
  },

  sync: {
    synced: 'Synced',
    syncing: 'Syncing…',
    offline: 'Offline',
    paused: 'Sync paused',
    refused: (count: number) => `${plural(count, 'change')} couldn’t sync: an account limit was reached`,
  },

  pwa: {
    updateReady: 'A new version of Lietner is ready.',
    reload: 'Reload',
    installTitle: 'Keep your cards safe on iPhone and iPad',
    installBody:
      'Safari can clear a website’s data when you haven’t visited for a week. Add Lietner to your Home Screen to keep your cards: tap Share, then Add to Home Screen.',
    installDismiss: 'Got it',
  },

  footer: {
    label: 'About Lietner',
    privacy: 'Privacy',
    terms: 'Terms',
    source: 'Source',
    support: 'Support',
    builtBy: 'Built with love by',
    author: 'Ahmed Eltigani',
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
