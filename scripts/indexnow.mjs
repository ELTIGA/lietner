#!/usr/bin/env node
// Tells IndexNow (Bing, which feeds ChatGPT search and Copilot, plus Yandex and others) to
// re-crawl every URL in the live sitemap. Run it after a deploy that adds or changes pages,
// once the deploy is live: it reads the deployed sitemap, not dist/.
//
//   npm run indexnow
//   npm run indexnow -- --dry-run    (print the payload, send nothing)
//
// The key is the name of public/<key>.txt, served at https://lietner.app/<key>.txt so the
// search engines can check the ping comes from the site owner. SITE overrides the origin.
//
// To automate it: a GitHub Actions workflow triggered `on: deployment_status`, guarded by
// `github.event.deployment_status.state == 'success'` and
// `github.event.deployment.environment == 'Production'`, can check out the repo and run
// `node scripts/indexnow.mjs` (Vercel reports deployments to GitHub). It needs no secrets.
// It would ping on every production deploy, though, not only ones that change pages.

import { readdir } from 'node:fs/promises';

const site = process.env.SITE || 'https://lietner.app';
const dryRun = process.argv.includes('--dry-run');

const files = await readdir(new URL('../public/', import.meta.url));
const keyFile = files.find((file) => /^[0-9a-f]{32}\.txt$/.test(file));
if (!keyFile) fail('No IndexNow key file (public/<32 hex>.txt) found.');
const key = keyFile.slice(0, -'.txt'.length);
const keyLocation = `${site}/${keyFile}`;

const sitemapResponse = await fetch(`${site}/sitemap.xml`);
if (!sitemapResponse.ok) fail(`${site}/sitemap.xml returned ${sitemapResponse.status}.`);
const sitemap = await sitemapResponse.text();
const urlList = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((match) => match[1]);
if (!urlList.length) fail(`${site}/sitemap.xml has no <loc> entries.`);

const body = { host: new URL(site).host, key, keyLocation, urlList };
if (dryRun) {
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

const keyResponse = await fetch(keyLocation);
if (!keyResponse.ok || (await keyResponse.text()).trim() !== key) {
  fail(`${keyLocation} does not serve the key yet. Deploy first, then run this again.`);
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});
// 200 and 202 both mean accepted; 202 means the key is still being validated.
if (response.status !== 200 && response.status !== 202) {
  fail(`IndexNow returned ${response.status}: ${await response.text()}`);
}
console.log(`IndexNow accepted ${urlList.length} URLs (${response.status}).`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
