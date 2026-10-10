# Changelog

All notable changes to Lietner are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

First public release, planned as 0.1.0.

### Added

- **Leitner desk.** Five boxes on a three.js desk with 1/2/4/8/16-day intervals and a mastered tray. Each due card lifts out, flips, and files itself into the next box or back to box 1.
- **Phones and tablets.**
  - A portrait desk layout.
  - Tap to flip, and swipe right or left to grade.
  - One-step undo.
  - Haptic feedback where supported.
  - Safe-area insets, plus an editor that stays above the on-screen keyboard.
- **Decks and cards.**
  - Several decks, in plain text in any script, including right-to-left.
  - CSV/TSV import, including Anki's plain-text export.
  - A starter sheet that turns a copy-paste prompt for your own AI into JSON cards.
- **Local-first storage.** IndexedDB holds tombstones, monotonic edit times and per-account limits. JSON export and import cover everything.
- **Optional account.** Sign in with a 6-digit email code or with Google. Sync is local-first with last write wins per row, enforced by row-level security and SQL triggers in Supabase.
  - Signing out wipes account data from the device.
  - Deleting the account offers an export first.
- **Offline.**
  - An installable PWA with self-hosted fonts that works fully offline as a guest.
  - A text mode for browsers without WebGL.
- **Accessibility.**
  - Card text is mirrored to an `aria-live` region.
  - In-app dialogs trap and restore focus.
  - Contrast meets WCAG 2.2 AA.
- **Privacy-preserving telemetry.** Cookieless page views, plus crash reports with card text scrubbed.
- **Security.** Security headers and a Content-Security-Policy (report-only at first).
- **Project infrastructure.**
  - Privacy policy and terms pages.
  - CI with unit, database, integration and end-to-end tests.
  - Biome linting and formatting.

[Unreleased]: https://github.com/ELTIGA/lietner/commits/main
