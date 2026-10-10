# Contributing to Lietner

Thanks for helping. Lietner is a small, solo-maintained project, so focused pull requests are the easiest to review and merge.

## Before you start

- Check the [statement of intent](docs/intent/leitner.md). Features listed under "Out of scope for launch" (sharing, images, stats, reminders, configurable intervals and so on) will be declined for now.
- For anything bigger than a bug fix, open an issue first so we can agree on the approach.
- Security problems: please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Development

```bash
npm install
npm run dev          # http://localhost:5173, guest mode
npm test             # unit tests (vitest)
npm run build        # typecheck + production build
npm run test:e2e     # Playwright (installs browsers on first run: npx playwright install)
```

Sync and sign-in need a local Supabase stack (Docker required):

```bash
npx supabase start   # first run downloads the images
npx supabase status  # copy the API URL and publishable key into .env.local (see .env.example)
npx supabase test db # row-level security and trigger tests (pgTAP)
```

## Guidelines

- TypeScript, strict mode, no framework. DOM is built with the small `h()` helper in `src/ui/dom.ts`.
- Every user-visible string goes in `src/strings.ts`.
- Keep the domain logic in `src/domain` pure and unit tested.
- IndexedDB is the source of truth; the server is a mirror. Never make the app depend on the network to work.
- Never rename the IndexedDB database (`leitner-3d`) or the backup format string (`leitner-3d-backup`): existing users' data depends on them.
- Card text must never reach telemetry. If you add logging, make sure it can't include card content.
- Add or update tests with your change. `npm run build` and `npm test` must pass.

## Translations

The UI is English-only at launch, but every string lives in `src/strings.ts` so translations can be added later. Open an issue if you'd like to help.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
