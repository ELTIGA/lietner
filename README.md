# Leitner Desk

A personal Leitner-system flashcard app on a 3D desk (three.js). Five boxes sit on a walnut desk. Each due card lifts out, flips to show the answer, and files itself into the next box, or back into box 1 if you missed it.

Intent and scope: [docs/intent/leitner.md](docs/intent/leitner.md).

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # scheduling, CSV, storage, backup
npm run build    # static site in dist/
```

## How it works

- **Schedule:** boxes 1–5 come due after 1 / 2 / 4 / 8 / 16 days. "Knew it" moves a card up one box. "Missed" sends it to box 1, due tomorrow. Knowing a card in box 5 masters it (★ tray).
- **Cards:** front/back text across multiple decks. Add them in the editor (`E`), or paste or upload CSV/TSV. Two columns, or a header row with `front`/`back`. Anki's plain-text export works.
- **Storage:** IndexedDB in this browser only. Export/import a JSON backup from Settings (⚙).
  Data is tied to the exact URL origin: `npm run dev` (:5173), `npm run preview` (:4173) and any deployed URL each start with an empty database. Study from the same URL every day, and export before switching.
- **Keyboard:** `↵` start · `Space` show answer · `J`/`→` knew · `F`/`←` missed · `S` skip animation · `Esc` end. Pressing a key mid-animation fast-forwards it. Settings has Normal / Fast / Instant speeds.

## Dev helpers

- `?today=3` shifts the app clock forward 3 days (dev server only) to test schedules.
- `window.__leitner` exposes the stage, desk, card actor and app in dev.

## Layout

```
src/domain   pure Leitner logic + calendar-day math (unit tested)
src/data     IndexedDB (idb), repo, CSV parsing, JSON backup
src/scene    three.js stage, desk/boxes/stacks, card actor (gsap timelines), canvas textures
src/ui       DOM overlay: app controller, review session, deck editor, settings
```
