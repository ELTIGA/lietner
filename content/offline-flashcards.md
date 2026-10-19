---
slug: offline-flashcards
title: "Offline Flashcard App With No Account Needed"
h1: "Flashcards that work offline, with no account"
description: "Lietner is a free flashcard app that works offline and needs no account. How to install it on iPhone, Android, Windows and Mac, and where your cards live."
published: 2026-10-19
updated: 2026-10-19
schema: Article
faq:
  - q: "Does Lietner work without internet?"
    a: "Yes. After your first visit, Lietner keeps a copy of itself on your device. Reviewing, adding cards, importing and exporting all work with no connection. Only sign-in and sync need the internet."
  - q: "Do I have to install Lietner to use it offline?"
    a: "No. It works offline in a normal browser tab once you've opened it. Installing it adds an icon to your home screen or desktop and opens it in its own window. On iPhone and iPad, installing also protects your cards from Safari's storage clean-up."
  - q: "Is it a real app from the App Store?"
    a: "No. Lietner is a web app you install from your browser. There are no App Store or Google Play versions, and you don't need them."
  - q: "What happens to my cards if I clear my browser data?"
    a: "As a guest, your cards live only in your browser, so clearing site data deletes them. Export a backup from Settings now and then, or sign in so your decks are also kept in your account."
  - q: "Can I use Google sign-in in the installed iPhone app?"
    a: "It can fail inside the installed app on iPhone. Use the 6-digit email code instead; Lietner shows that tip if Google sign-in fails there."
---

## Is there a flashcard app that works offline with no account?

Yes. Lietner is a free flashcard app that runs in your browser, works fully offline after your first visit, and never asks you to sign up. Your decks stay on your device. You can install it to your home screen or desktop like an app, and turn on sync later if you want your cards on more than one device.

It uses [the Leitner system](/leitner-system): five boxes that bring back hard cards often and easy cards rarely.

## How does Lietner work offline?

Lietner is a progressive web app. The first time you open it, your browser saves a copy of the app. After that it loads with no connection, whether you're on a plane, underground, or just out of data.

Everything you do as a guest happens on your device:

- your decks, cards and progress are stored in your browser's own database (IndexedDB);
- nothing about your cards is sent to Lietner;
- reviewing, adding and editing cards, importing files and exporting backups all work offline.

If your device can't run the 3D desk (some older browsers don't support WebGL), Lietner switches to a simpler text mode that works the same way.

## How do I install Lietner on iPhone or iPad?

Use Safari ([Apple: Turn a website into an app in Safari on iPhone](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios), checked 19 October 2026). **Already have decks in Safari?** Export a backup first (Settings → **Export JSON**) or sign in, because the Home Screen app may start empty. The section on moving your cards, further down, explains how.

1. Open lietner.app in Safari.
2. Tap the More button (⋯), then **Share**. With some tab layouts, the Share button is right in the toolbar.
3. Scroll down and tap **Add to Home Screen**. If it's missing, tap **Edit Actions** at the bottom of the list and add it.
4. Make sure **Open as Web App** is on, then tap **Add**.

**Why this matters on iPhone and iPad.** Safari can delete a website's stored data after seven days of Safari use without visiting the site. Apps added to the Home Screen aren't part of Safari and keep their own count, based on how often you use them ([WebKit blog](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/), March 2020, checked 19 October 2026). That's why Lietner shows a reminder in Safari: installing it is the best way to keep your cards safe.

## How do I install Lietner on Android?

Use Chrome ([Google Chrome Help: Use progressive web apps](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid), checked 19 October 2026):

1. Open lietner.app in Chrome.
2. Tap More (⋮) on the right of the address bar.
3. Tap **Install and create shortcut**, then **Install**, and follow the prompts.

Lietner then opens from its own icon, like any other app.

## How do I install Lietner on Windows, Mac, Linux or a Chromebook?

**Chrome** ([Google Chrome Help](https://support.google.com/chrome/answer/9658361), checked 19 October 2026): open lietner.app and select **Install** at the right of the address bar. Or open the More menu (⋮), choose **Cast, save, and share**, then **Install page as app…**.

**Microsoft Edge** ([Microsoft Learn: PWAs in Edge](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps-chromium/ux), checked 19 October 2026): select the **App available** icon in the address bar, then **Install**.

**Safari on a Mac** (macOS Sonoma 14 or later; [Apple: Use Safari web apps on Mac](https://support.apple.com/en-us/104996), checked 19 October 2026): choose **File > Add to Dock**, or select Share in the toolbar and choose **Add to Dock**. Then select **Add**. As on iPhone, export a backup or sign in first if you already have decks in Safari.

**Firefox and other browsers:** you can simply keep Lietner open in a tab or bookmark it. It still works offline once it has loaded.

## Will my cards follow me into the installed app?

Not always. The installed app may start with its own, separate storage. Apple says a Safari web app on the Mac shares no website data with Safari, for example. If you've already made decks in a browser tab, move them over before you rely on the installed app:

- **Sign in,** and your decks sync into the installed app when you sign in there too; or
- **Export a backup** in the tab (Settings → **Export JSON**), then in the installed app use Settings → **Import JSON…**. Import replaces everything in that copy of Lietner, so do it before you add new cards there.

## What if I want my cards on more than one device?

Sign in. It's optional, and it exists only to sync your own decks and progress between your devices; nothing is shared or public. You can sign in with Google or with a 6-digit code sent to your email. Accounts are for people aged 13 and over.

Synced decks are stored in a database in the EU (Supabase, Dublin), as described in the [privacy policy](/privacy). Your grade history, the record of each "Knew it" or "Missed", stays on each device. Changes you make offline sync the next time you're online. Lietner keeps working on each device even if the sync server is unreachable.

## How do I keep my cards safe as a guest?

Guest cards live only in that browser on that device. They're gone if you clear the site's data, uninstall the browser, or lose the phone. Three habits help:

- install Lietner on iPhone and iPad, for the reason above;
- export a JSON backup from Settings every so often;
- or sign in, so your account holds a copy too.

Ready to study anywhere? [Open Lietner](/). There's nothing to sign up for.
