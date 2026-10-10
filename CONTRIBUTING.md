# Contributing to Lietner

Thanks for helping. Lietner is a small project with a single maintainer, so focused pull requests are the easiest to review and merge.

## Before you start

- Read the [product scope](docs/scope.md). Features listed under "Out of scope" (sharing, images, stats, reminders, configurable intervals and so on) will be declined for now.
- For anything bigger than a bug fix, open an issue first so we can agree on the approach.
- Report security problems through [SECURITY.md](SECURITY.md), not in a public issue.
- [docs/architecture.md](docs/architecture.md) explains how the code is organized and how sync works.

## Setup

You need Node.js 22.12 or later (`nvm use` picks the version in `.nvmrc`) and npm.

```bash
npm install
npm run dev          # http://localhost:5173, guest mode
```

Sync and sign-in need a local Supabase stack, which runs in Docker:

```bash
npx supabase start   # the first run downloads the images
npx supabase status  # copy the API URL and publishable key into .env.local (see .env.example)
```

## Before you open a pull request

Run the same checks CI runs:

```bash
npm run lint         # Biome: lint and formatting (npm run format fixes most issues)
npm run typecheck
npm test
npm run build
npm run test:e2e     # first run: npx playwright install chromium webkit
```

If you touched `supabase/` or `src/sync/`, also run the following against the local stack:

```bash
npm run test:db
npm run test:integration
```

## Code guidelines

- **Language and DOM.** TypeScript in strict mode, with no UI framework. Build DOM with the `h()` helper in `src/ui/dom.ts`.
- **Formatting.** Biome handles formatting and import order, so don't hand-format. Configure your editor to format on save with Biome, or run `npm run format`.
- **Strings.** Every user-visible string goes in `src/strings.ts`.
- **Domain logic.** Keep the code in `src/domain` pure and unit tested.
- **Local-first.** IndexedDB is the source of truth and the server is a mirror. Never make the app depend on the network to work.
- **Stable names.** Never rename the IndexedDB database (`leitner-3d`) or the backup format string (`leitner-3d-backup`). Existing users' data depends on them.
- **Privacy.** Card text must never reach telemetry or logs. If you add logging, make sure it can't include card content.
- **Tests.** Add or update tests along with your change.
- **Comments.** Document the *why*: a non-obvious constraint, a browser quirk, a data-safety rule. Don't restate what the code says.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org):

```
feat(sync): retry with backoff while the backend is paused

- Optional body: what changed and why, wrapped at about 100 columns
```

- Common types are `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `style`, `build`, `ci` and `chore`.
- Scopes usually name the area: `sync`, `data`, `scene`, `ui`, `mobile`, `pwa`, `account` or `import`.
- Keep each commit focused on one change, and write the subject in the imperative mood.
- If a commit only reformats code, add its hash to `.git-blame-ignore-revs`.

## Translations

The UI is English-only for now. Every string lives in `src/strings.ts`, so translations can be added later. Open an issue if you'd like to help.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
