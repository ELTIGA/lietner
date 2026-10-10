# Deployment

This guide deploys Lietner the way https://lietner.app runs: a static site on Vercel, plus an optional Supabase project for sign-in and sync. Each service is optional:

- **Static site only.** You get a fully working guest-only app (IndexedDB, offline, no accounts).
- **Add Supabase.** Turns on sign-in and sync.
- **Add Sentry.** Turns on crash reports.

## Environment variables

Set these for **production only**. Preview deploys should leave them empty, so previews run guest-only. Google sign-in only works on origins you register anyway.

| Variable | Value | Needed for |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Sign-in and sync |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API keys → publishable key | Sign-in and sync |
| `VITE_GOOGLE_CLIENT_ID` | Web OAuth client ID ([Google sign-in](#google-sign-in)) | Google sign-in |
| `VITE_SENTRY_DSN` | Sentry project DSN | Crash reports |

> **Never** put the Supabase secret or service-role key in Vercel, in `.env` files or in the repository. It bypasses row-level security.

## Your own domain

The production domain appears in a few static files. Replace `lietner.app` in:

- `index.html`: the canonical URL, Open Graph and Twitter tags, and JSON-LD.
- `public/robots.txt` and `public/sitemap.xml`.
- `vercel.json`: the `www` and `*.vercel.app` redirects.
- `privacy.html` and `terms.html`.

## Vercel

1. Import the repository as a new Vercel project. `vercel.json` already sets the build command (`npm run build`), the output directory (`dist`), clean URLs, security headers and asset caching.
2. Add your production domain. Add the `www` subdomain too, which `vercel.json` redirects to the apex domain.
3. Check which `*.vercel.app` hostname Vercel assigned. If it isn't `lietner.vercel.app`, update the `host` value in the second redirect in `vercel.json`.
4. Add the [environment variables](#environment-variables) to the Production environment.
5. Optionally, turn on **Web Analytics**. Production builds already call `inject()`.

The Vercel Git integration builds a preview for every pull request. No other setup is needed.

## Supabase

1. Create a project. Pick the region carefully: it can't be changed later. lietner.app uses `eu-central-1` (Frankfurt).
2. Apply the schema:

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

3. **Authentication → URL configuration**:
   - Set the Site URL to your production URL.
   - Add the same URL to the redirect URLs. No redirect flows are used; this keeps the allow-list tight.
4. **Authentication → Providers → Email**:
   - Enable the email provider.
   - Set the email OTP length to `6` and the OTP expiry to `3600`.
5. **Authentication → Email templates**: set both **Magic Link** and **Confirm signup** to show only the code, never a link. On iOS, links open Safari instead of the installed app.
   - Body: paste `supabase/templates/magic_link.html`. It uses `{{ .Token }}`.
   - Check by sending yourself a code. The email must contain six digits and no link.
6. **Authentication → SMTP settings**: configure a custom SMTP provider. Supabase's built-in sender is only meant for testing.
   - lietner.app sends through Resend from a dedicated subdomain, with SPF, DKIM and DMARC records.
   - Then set **Rate limits → emails per hour** to fit the provider's quota.
   - When a send is refused, the app tells people to use Google or keep studying as a guest.
7. Optionally, **Authentication → Providers → Google**:
   - Enable it and paste the Web client ID under **Client IDs**.
   - Leave **Skip nonce check** off.
   - The app uses the ID-token flow (`signInWithIdToken`), so no client secret or redirect URL is needed.
8. Leave **Settings → API → Max rows** at the default `1000`. The sync engine pulls in pages of 1,000.

To pause new sign-ups without affecting existing accounts or guests, turn off **Allow new users to sign up**. New emails then see "New sign-ups are paused".

## Google sign-in

1. In Google Cloud, go to **APIs & Services → Credentials → Create OAuth client ID** and choose **Web application**.
   - Authorized JavaScript origins: your production URL and `http://localhost:5173`.
   - No redirect URIs.
2. Configure the OAuth consent screen:
   - App name, support email and homepage.
   - Privacy policy URL (`/privacy`) and terms URL (`/terms`).
   - Your domain as an authorized domain. Verify it in Search Console first.
   - Scopes: `openid`, `email` and `profile` only.
3. Put the client ID in `VITE_GOOGLE_CLIENT_ID` and in the Supabase Google provider.

To try Google sign-in against the local stack:

1. Put the client ID in `.env.local`.
2. Set `[auth.external.google] enabled = true` in `supabase/config.toml`.
3. Export `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`.
4. Restart `npx supabase start`.

## Sentry (optional)

1. Create an organization in the data region you want. lietner.app uses the EU region. Then create a Browser JavaScript project.
2. Under **Settings → Security & Privacy**, turn on **Prevent storing of IP addresses**. Leave Session Replay off.
3. Put the DSN in `VITE_SENTRY_DSN`.

The client already turns off every `dataCollection` category and strips anything that could carry card text (see `src/telemetry/scrub.ts`).

## Content-Security-Policy

`vercel.json` ships the policy as `Content-Security-Policy-Report-Only`. To enforce it:

1. Replace `PROJECT_REF` in `vercel.json` with your Supabase project ref. If your Sentry project isn't in the EU region, change the `*.ingest.de.sentry.io` host too.
2. Optionally, append `; report-uri <endpoint>` to collect violation reports. Sentry provides one under **Project Settings → Security Headers**.
3. Use the app for a while: sign in with email and Google, sync, review, go offline.
4. If no violations show up, rename the header key to `Content-Security-Policy`.

## Legal pages

`privacy.html` and `terms.html` are plain-language drafts. Highlighted placeholders (`[OPERATOR NAME]`, `[POSTAL ADDRESS, COUNTRY]`, `[GOVERNING LAW]`, transfer mechanisms and retention periods) must be filled in by whoever operates the deployment. Have someone qualified review both before going live. They are templates, not legal advice.

## Operating notes

- Run `npx supabase db dump -f backup.sql` before every schema migration. The Supabase Free plan has no automatic backups.
- Free Supabase projects pause after a week without database activity. While paused, the app keeps working and shows "Sync paused". Sync resumes once you restore the project.
- Before a release, run the data-loss scenarios covered by the sync tests on real devices: concurrent offline edits, deleting a deck while another device edits it, first sign-in with existing decks, sign-out with unsynced changes, account deletion, and a backend outage.
