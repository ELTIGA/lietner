# Security Policy

## Reporting a vulnerability

Please report security issues privately through GitHub's private vulnerability reporting:
**[Report a vulnerability](https://github.com/ELTIGA/lietner/security/advisories/new)**.

Please don't open a public issue for security problems. Include steps to reproduce and the impact you expect. You can expect an acknowledgment within a few days.

## Scope

In scope:

- The web app at https://lietner.app and the code in this repository.
- The Supabase schema, row-level security policies and functions in `supabase/migrations`.

Especially interesting: any way for one account to read or change another account's decks or cards, any way card text reaches telemetry, and anything that defeats the Content-Security-Policy.

Out of scope: denial of service, rate-limit exhaustion of the free email plan, and issues in third-party services (Supabase, Vercel, Google, Resend, Sentry) that should be reported to them.

## Supported versions

Only the version currently deployed at https://lietner.app is supported.
