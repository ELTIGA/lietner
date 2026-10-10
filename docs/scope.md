# Product scope

What Lietner is for, the rules it keeps, and what it deliberately leaves out. Read this before proposing a feature: pull requests for anything under [Out of scope](#out-of-scope) will be declined for now.

## What it is

A free, MIT-licensed flashcard app built on the Leitner system, live at https://lietner.app.

- Five boxes sit on a 3D desk. Each due card lifts out of its box and flips to show the answer. Then it flies to the next box, or back to box 1 if you missed it.
- The same desk works on phones, tablets and desktops.
- Optional sign-in syncs decks and progress between your devices.

## Who it's for

Students aged 13 and up studying on their own, mostly on phones: high school, university and self-learners. Anyone of any age can use every feature except sync as a guest, with no account.

## Why

Plain flashcard apps feel flat. Seeing cards move between boxes makes reviewing more fun and makes progress visible.

## Cards

- Plain front/back text in any language or script, including right-to-left.
- Several decks per person. Cards can be:
  - added in the editor;
  - imported from CSV/TSV, including Anki's plain-text export;
  - written by the student's own AI from a copy-paste prompt and pasted back as JSON. Lietner itself never calls an AI.

## Rules

Classic Leitner, unchanged:

- Boxes 1 to 5 come due every 1, 2, 4, 8 and 16 days.
- Cards are self-graded. "Knew it" moves a card up one box; "Missed" sends it back to box 1.
- Passing box 5 means the card is mastered.
- Each session reviews every card that's due.

## Accounts

- Accounts are optional. Sign in with Google or with a 6-digit code sent by email.
- An account exists only to sync your own decks and progress. Nothing is shared or public.
- Accounts require age 13+, or the local digital-consent age where that is higher (up to 16 in parts of the EU).

## Goals

- A student starts a deck on a laptop, reviews on a phone on the bus, and loses nothing.
- A 30–50 card session feels fast on every device. Animations can be sped up or skipped, with keyboard shortcuts on desktop and taps and swipes on touch screens.
- Running costs stay at $0/month on free tiers until donations fund paid plans.

## Constraints

- **No server code beyond SQL.** A static site plus Supabase (auth, and Postgres with row-level security). The backend is SQL migrations only: policies, constraints, triggers and one account-deletion function.
- **Local-first.** IndexedDB stays the source of truth and the server is a sync mirror. The app keeps working offline or while the backend is paused. JSON export and import always stay available.

## Out of scope

- Sharing, classes or a public deck library.
- Images, math, audio or Markdown on cards.
- Reminders and push notifications.
- Stats and streaks.
- Native apps.
- Accounts for under-13s.
- UI languages other than English (strings are centralized for future translations).
- In-app AI generation, meaning Lietner calling an AI itself.
- Configurable boxes or intervals.
- Typed-answer checking.
- Native `.apkg` import.

## Known limitations

- The Supabase Free plan has no automatic backups. Copies on each device are the last-resort recovery.
- Email sign-in is capped by the email provider's free quota. Past the cap, people are pointed to Google sign-in or guest mode.
- A free Supabase project pauses after a week without database activity. Sync stops until it is resumed; the app keeps working.
