---
slug: import-anki-deck
title: "Import an Anki Deck Into Lietner (CSV or Text)"
h1: "Import an Anki deck into Lietner"
description: "Move an Anki deck to Lietner in minutes: export Notes in Plain Text from Anki, untick HTML, and import the .txt file. Step by step, with what carries over."
published: 2026-10-19
updated: 2026-10-19
schema: HowTo
steps:
  - name: "Open the export dialog in Anki"
    text: "In Anki on a computer, choose File > Export."
  - name: "Choose Notes in Plain Text"
    text: "Set the export format to Notes in Plain Text (.txt) and pick the deck you want to move."
  - name: "Untick HTML and extra columns"
    text: "Untick Include HTML and media references. Leave Include deck name, Include note type name and Include unique identifier unticked. Include tags can stay as it is."
  - name: "Save the file"
    text: "Select Export and save the .txt file somewhere you can find it."
  - name: "Open the deck editor in Lietner"
    text: "Open lietner.app, create a deck for the cards, and open the deck editor with Edit deck. On a new, empty deck, select the link that says \"or add cards by hand\"."
  - name: "Import the file"
    text: "Expand Import JSON, CSV or Anki text export, choose the .txt file with the file picker, check the count of cards ready, and select Import."
faq:
  - q: "Can Lietner open .apkg files?"
    a: "No. Lietner reads text, not Anki's package format. Export the deck from Anki on a computer as Notes in Plain Text instead."
  - q: "Will my Anki review history come across?"
    a: "No. Lietner doesn't read Anki's scheduling, so every imported card starts in box 1 and is due today. Cards you know well will climb out of the low boxes quickly."
  - q: "What about cloze and image cards?"
    a: "They won't work well. Lietner cards are plain text, so cloze notes arrive with their `{{c1::...}}` markers and images are left out. Rewrite those cards as plain question-and-answer pairs, or keep them in Anki."
  - q: "Can I import a CSV file that didn't come from Anki?"
    a: "Yes. Any comma- or tab-separated file with the front in the first column and the back in the second works. A header row is optional; Lietner recognises headers like front and back, question and answer, or term and definition."
---

## How do I import an Anki deck into Lietner?

Export the deck from Anki desktop as **Notes in Plain Text (.txt)** with **Include HTML and media references** unticked. Then, in Lietner, open the deck editor, expand **Import JSON, CSV or Anki text export**, choose the file and select **Import**. Your cards arrive in box 1, ready to review. It takes about two minutes.

The numbered steps on this page cover the short version. The rest of this page explains each setting, what carries over, and what doesn't.

## Which Anki export settings should I use?

Anki's plain-text export writes each note on one line, with fields separated by tabs ([Anki manual: Exporting](https://docs.ankiweb.net/exporting.html), checked 19 October 2026). In recent versions of Anki desktop, the dialog shows a few checkboxes ([option names](https://github.com/ankitects/anki/blob/main/ftl/core/exporting.ftl) and defaults ([dialog layout](https://github.com/ankitects/anki/blob/main/qt/aqt/forms/exporting.ui), [dialog code](https://github.com/ankitects/anki/blob/main/qt/aqt/import_export/exporting.py)) in Anki's source code, checked 19 October 2026). Here's what to do with each:

| Anki option | Default | What to do | Why |
|---|---|---|---|
| Include HTML and media references | On | **Untick** | Lietner cards are plain text. With this on, tags like bold and line breaks, and sound file names, end up in your cards as raw code. |
| Include tags | On | Either | Tags go in a column after your fields, which Lietner ignores. |
| Include deck name | Off | Leave off | It adds a column before your fields, so the deck name would become the front of every card. |
| Include note type name | Off | Leave off | Same problem: an extra column before your fields. |
| Include unique identifier | Off | Leave off | Same problem: an extra column before your fields. |

Anki also writes a few lines at the top of the file that start with #, such as #separator:tab. Lietner skips those lines, so you don't need to delete them.

## How does Lietner read the file?

Lietner takes the **first column as the front** of each card and the **second column as the back**. Anything after that, like tags or a third field, is ignored. It works out whether the file uses tabs, commas, semicolons or pipes on its own.

For a Basic note, that's exactly right: Front becomes the front, Back becomes the back. A few things are worth knowing:

- **Notes with more than two fields.** Only the first two come across. If your note type puts the answer in a later field, rearrange the fields in Anki first, or edit the cards in Lietner afterwards.
- **"Basic (and reversed card)" notes** become one card in Lietner, front to back. There's no automatic reverse card.
- **Empty fields.** A row with no front or no back is skipped, and Lietner tells you how many.
- **Long fields.** Each side can hold up to 1,000 characters. Longer rows are skipped and counted, so you can shorten them in Anki and import again.

Before you select **Import**, Lietner shows how many cards are ready and how many rows it skipped, so you can check the numbers first.

## What doesn't carry over from Anki?

To be upfront about it:

- **Scheduling.** Your intervals, ease and review history stay in Anki. Every card starts fresh in box 1, due today, and moves through [the five Leitner boxes](/leitner-system) from there.
- **Images, audio and video.** Lietner cards are text only.
- **Cloze deletions.** The `{{c1::...}}` markers come through as plain text. Rewrite cloze notes as questions, or leave them in Anki.
- **Formatting.** Bold, colours, lists and maths markup become plain text.
- **.apkg files.** Lietner can't open them. Use the plain-text export instead.

If most of your deck is images, cloze or audio, Anki is the better home for it. Our page on [Lietner as an Anki alternative](/anki-alternative) is honest about who should stay.

## Can I import a big Anki deck?

Yes, within Lietner's limits: up to 5,000 cards in total, across up to 100 decks. If your Anki collection is bigger than that, move one subject at a time, starting with whatever you're studying now.

Keep in mind that all imported cards land in box 1 and are due on the same day. For a deck of a few hundred cards, consider splitting it into smaller decks, or importing a chapter at a time, so your first session isn't a wall of cards.

## What if my file isn't from Anki?

The same importer reads any CSV or TSV file. Put the front in the first column and the back in the second. A header row is optional: Lietner recognises front/back, question/answer, term/definition, word/meaning and q/a, and uses those columns wherever they are. Quizlet exports work the same way, as described on the [Quizlet alternative page](/quizlet-alternative). You can also skip files entirely and [let your own AI write the cards](/ai-flashcards).

Ready to move a deck? [Open Lietner](/) and follow the steps on this page.
