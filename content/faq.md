---
slug: faq
title: "Lietner FAQ: Free, Offline, No Account"
h1: "Questions about Lietner"
description: "Is Lietner free? Does it work offline? Do you need an account? Where are cards stored? Answers to common questions, including why it's spelled that way."
published: 2026-10-19
updated: 2026-10-19
schema: FAQPage
faq:
  - q: "Is Lietner free?"
    a: "Yes. Every feature is free, with no ads, no paywall and no premium tier. Lietner is open source under the MIT licence and runs on donations. If it helps you study, you can chip in on the [support page](/support), but you never have to."
  - q: "Why is it spelled Lietner?"
    a: "The study method is the Leitner system, named after Sebastian Leitner. The app is spelled Lietner. It started as a typo, and Ahmed, who made Lietner, decided to keep it. If you were searching for the Leitner system, you're in the right place."
  - q: "Do I need an account?"
    a: "No. Open lietner.app and start studying as a guest; every feature except sync works without signing in. An account is only for syncing your own decks and progress between devices."
  - q: "Does Lietner work offline?"
    a: "Yes. After your first visit, Lietner keeps a copy of itself on your device and works with no connection. You can also install it to your home screen or desktop like an app. If you're signed in, changes made offline sync when you're back online."
  - q: "Where are my cards stored?"
    a: "As a guest, your decks and progress stay in your browser's storage (IndexedDB) on your device and are never sent to Lietner. If you sign in, your decks and cards are also stored in a database in the EU (Supabase, Dublin) so they can sync. Your grade history never leaves the device either way."
  - q: "How do I sign in?"
    a: "With Google, or with a 6-digit code sent to your email. Accounts are for people aged 13 or older, or the minimum age for online services where you live if that's higher."
  - q: "Can I use Lietner on my phone and my laptop?"
    a: "Yes. The same desk works on phones, tablets and computers. Sign in on each device to keep your decks and progress in sync."
  - q: "How does Lietner schedule my cards?"
    a: "With the classic Leitner system. Five boxes come due every 1, 2, 4, 8 and 16 days. Knew it moves a card up a box; Missed sends it back to box 1. Knowing a card in box 5 masters it."
  - q: "Can I change the boxes or intervals?"
    a: "No. Five boxes with fixed intervals is the whole idea, so there's nothing to configure and nothing to get wrong."
  - q: "Can I import my Anki decks?"
    a: "Yes, through Anki's plain-text export. In Anki, export your deck as Notes in Plain Text with HTML turned off, then import the .txt file in Lietner's deck editor. Anki's .apkg files aren't supported, and review history doesn't carry over: imported cards start in box 1. The [Anki import guide](/import-anki-deck) has every step."
  - q: "Can I import from Quizlet?"
    a: "Yes, for sets you created. On the Quizlet website, open the set, choose Export, copy the text, and paste it into Lietner's import box. Tab-separated and comma-separated text both work."
  - q: "Does Lietner use AI?"
    a: "Lietner never calls an AI itself. Instead it gives you a ready-made prompt. You paste it into your own AI (ChatGPT, Claude, Gemini or another) with your notes, and paste back the cards it writes. See [how to make flashcards with your own AI](/ai-flashcards)."
  - q: "Which languages can I study?"
    a: "Any. Cards are plain text in any language or script, including right-to-left scripts like Arabic and Hebrew. The app's own buttons and menus are in English for now."
  - q: "Can I add images, audio or formulas to cards?"
    a: "No. Cards are text only, with up to 1,000 characters per side. For maths, write symbols in Unicode (x², √, π) or in words."
  - q: "How many cards can I have?"
    a: "Up to 5,000 cards across up to 100 decks."
  - q: "Can I share decks with friends or a class?"
    a: "No. Nothing in Lietner is shared or public, and there are no classes or deck library. Your account exists only to sync your own decks. If a friend wants the same cards, the easiest way is to share the notes and the AI prompt so they can make their own deck."
  - q: "Are there reminders, streaks or stats?"
    a: "No. Lietner shows how many cards are due today and when the next review is, and keeps the rest out of your way."
  - q: "Does Lietner have keyboard shortcuts?"
    a: "Yes. Enter starts a review, Space shows the answer, J or → marks Knew it, F or ← marks Missed, Z undoes the last grade, S skips an animation, and Esc ends the session. On touch screens, tap to flip and swipe to grade."
  - q: "How do I back up or delete my data?"
    a: "Settings → Export JSON downloads all your decks and cards. If you have an account, Settings → Delete account deletes it and everything in it from the server straight away."
  - q: "Is there an app in the App Store or Google Play?"
    a: "No. Lietner is a web app you can install from your browser, and it works offline once installed. There are no native store apps."
  - q: "Is Lietner open source?"
    a: "Yes, under the MIT licence. The code is [on GitHub](https://github.com/ELTIGA/lietner), and bug reports and focused pull requests are welcome."
---

## What is Lietner, in one paragraph?

Lietner is a free flashcard app built on the Leitner system. Five boxes sit on a 3D desk; cards you know climb to the next box and come back less often, and cards you miss drop back to box 1. It works offline, needs no account, has no ads, and runs in any modern browser on phones, tablets and computers.

The answers below cover the questions people ask most. If you want the method itself, read [how the Leitner system works](/leitner-system). If you'd rather just try it, [open Lietner](/): on your first visit you can load a 25-card Spanish sample deck.

## Where can I find more detail?

- [Make flashcards with your own AI](/ai-flashcards)
- [Import an Anki deck](/import-anki-deck)
- [Use Lietner offline, with no account](/offline-flashcards)
- [How Lietner compares with Anki and Quizlet](/compare)
- [Privacy policy](/privacy) and [Terms](/terms)

## How do I get in touch?

Email hello@lietner.app with questions, bug reports or ideas. Security issues are best reported privately, as described in the project's security policy on GitHub.
