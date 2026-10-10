# Lietner

**Leitner-system flashcards on a 3D desk.** Free, open source, works offline, no account needed.

**[lietner.app](https://lietner.app)**

<!-- Demo GIF: docs/demo.gif (added before launch) -->

Five boxes sit on a walnut desk. Each due card lifts out, flips to show the answer, and files itself into the next box, or back into box 1 if you missed it. The same desk works on phones, tablets and desktops. Sign in (optional) to sync decks and progress between your devices.

## How the Leitner system works

- New cards start in **box 1**. Boxes 1 to 5 come due every **1, 2, 4, 8 and 16 days**.
- You grade yourself. **Knew it** moves a card up one box. **Missed** sends it back to box 1, due tomorrow.
- Knowing a card in box 5 **masters** it (the ★ tray). Each session reviews every card that's due.

Cards you know well come back rarely; cards you struggle with come back often. That's spaced repetition, with no algorithm to tune.

## Features

- Plain front/back text in any language or script, including right-to-left.
- Several decks. Add cards in the editor or import CSV/TSV, including Anki's plain-text export.
- Keyboard shortcuts on desktop (`↵` start, `Space` show answer, `J`/`→` knew, `F`/`←` missed, `Z` undo, `S` skip animation, `Esc` end). Tap to flip and swipe to grade on touch screens.
- Normal, Fast and Instant animation speeds.
- Installable app that works fully offline.
- JSON export and import of everything.

## Privacy

- **Guest mode** (no account) keeps everything in your browser's IndexedDB. Nothing about your cards leaves the device.
- **Signing in** (Google, or a 6-digit code sent by email; 13+ only) syncs your decks and progress to a database in the EU (Supabase, Frankfurt). Nothing is shared or public. Grade history never leaves the device.
- Aggregate, cookieless page-view counts (Vercel Web Analytics) and crash reports with card text removed (Sentry, EU) help keep the app working. No ads, no data sales.
- You can export everything as JSON and delete your account from Settings at any time.

Full details: [Privacy policy](https://lietner.app/privacy) · [Terms](https://lietner.app/terms).

## Local development

```bash
npm install
npm run dev       # http://localhost:5173, guest mode
npm test          # unit tests: scheduling, CSV, storage, backup, sync
npm run build     # typecheck + static site in dist/
npm run test:e2e  # Playwright: desktop Chrome, emulated iPhone and iPad
```

### Sync and sign-in locally

Sync uses [Supabase](https://supabase.com). The CLI runs a local stack in Docker:

```bash
npx supabase start    # first run downloads the Docker images
npx supabase status   # shows the API URL and publishable key
cp .env.example .env.local   # paste the URL and key, then restart npm run dev
npx supabase test db  # row-level security and trigger tests
```

Email codes sent by the local stack appear in the local mail catcher at http://127.0.0.1:54324. Google sign-in needs a real OAuth client ID and only works on `localhost:5173` and production.

Without any `VITE_SUPABASE_*` variables the app runs guest-only, which is also how preview deploys run.

### Dev helpers

- `?today=3` shifts the app clock forward 3 days (dev server only) to test schedules.
- `window.__leitner` exposes the stage, desk, card actor and app in dev.
- Data is tied to the URL origin: `npm run dev` (:5173), `npm run preview` (:4173) and lietner.app each have their own database.

### Layout

```
src/domain   pure Leitner logic and calendar-day math (unit tested)
src/data     IndexedDB (idb), repo, CSV parsing, JSON backup
src/sync     sync engine (local-first, last write wins per row) and the Supabase remote
src/auth     Supabase session, Google ID-token sign-in
src/scene    three.js stage, desk, boxes, card actor (gsap timelines), canvas textures
src/ui       DOM overlay: app controller, review session, editor, dialogs, settings
supabase     SQL migrations (tables, row-level security, triggers) and pgTAP tests
```

Intent and scope: [docs/intent/leitner.md](docs/intent/leitner.md). Launch tasks: [docs/launch-checklist.md](docs/launch-checklist.md).

## Support Lietner

Lietner is free and costs nothing to run until it outgrows the free tiers. If it helps you study, consider [sponsoring it](https://github.com/sponsors/ELTIGA) <!-- TODO(owner): confirm GitHub Sponsors or Ko-fi link -->.

## License

[MIT](LICENSE). The animation library [GSAP](https://gsap.com) is used under its own [Standard License](https://gsap.com/standard-license).
