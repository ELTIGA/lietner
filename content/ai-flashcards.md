---
slug: ai-flashcards
title: "Make Flashcards From a PDF or Notes With ChatGPT"
h1: "AI flashcards from your notes, with ChatGPT, Claude or Gemini"
description: "Turn a PDF, slides or notes into about 30 flashcards with your own AI. Copy Lietner's free prompt, answer three questions, and paste the cards back."
published: 2026-10-19
updated: 2026-10-19
schema: HowTo
steps:
  - name: "Create a deck in Lietner"
    text: "Open lietner.app and create a deck. A new, empty deck shows the starter sheet with the prompt."
  - name: "Copy the prompt"
    text: "Select Copy prompt on the starter sheet. If your browser blocks copying, select the prompt text and copy it yourself."
  - name: "Paste it into your AI with your material"
    text: "Open ChatGPT, Claude, Gemini or another AI chat. Paste the prompt and attach your PDF, slides or notes, or paste the text in."
  - name: "Answer the three questions"
    text: "The AI asks about scope, depth and difficulty, each with lettered options. Reply with something like 1b 2a 3c, or in your own words."
  - name: "Copy the AI's code block"
    text: "The AI replies with one JSON code block of about 30 cards. Copy the whole block."
  - name: "Paste the cards into Lietner"
    text: "Back in Lietner, paste the block into Cards from your AI and select Import cards. The cards go into box 1, due today."
  - name: "Check the cards, then review"
    text: "Skim the cards in the deck editor and delete or fix any that are wrong. Then select Start review."
faq:
  - q: "Does Lietner send my notes to an AI?"
    a: "No. Lietner never calls an AI. You paste the prompt and your notes into an AI you choose, so your material goes to that AI's provider under its terms, not to Lietner."
  - q: "Which AI works best?"
    a: "Any chat AI that can read your material and reply with a code block should work, including ChatGPT, Claude and Gemini. If your AI can't open files, paste the text of your notes instead."
  - q: "Can I get more than 30 cards?"
    a: "Yes. Ask the AI for more, or run the prompt again for another chapter and import the new block too. Lietner holds up to 5,000 cards in total."
  - q: "Can I add AI cards to a deck that already has cards?"
    a: "Yes. Open the deck editor, expand Import JSON, CSV or Anki text export, paste the AI's code block, and select Import. To see the prompt again, create a new empty deck."
  - q: "Are AI-written flashcards accurate?"
    a: "Usually, but not always. AIs can get facts wrong or stray beyond your material. Skim the cards before you study them, and fix or delete anything that doesn't match your notes."
---

## How do I make flashcards from a PDF or notes with AI?

Copy a ready-made prompt from Lietner, paste it into ChatGPT, Claude, Gemini or any chat AI along with your PDF or notes, and answer three quick questions. The AI writes about 30 question-and-answer cards as a block of text. Paste that block back into Lietner and your deck is ready to study in a few minutes.

Lietner itself never talks to an AI. You use the AI you already have, and Lietner just reads the cards it writes.

## What is the prompt?

Here it is in full. The easiest way to get it is the **Copy prompt** button in Lietner, which always has the current version, but you can copy it from here too.

```text
I want to study the material I've attached (or will paste) with flashcards in Lietner, a Leitner-box flashcard app. Help me make about 30 cards.

Step 1. If I haven't attached or pasted any material yet, ask me for it and stop there.

Step 2. Read the material, then ask me these three questions in ONE message, numbered 1 to 3. Give each question 3 or 4 lettered options that fit this specific material (for example, its real chapter or section names). I'll reply like "1b 2a 3c" or in my own words. Don't write any cards yet.
1. Scope: which part should the cards cover (one chapter or section, several, or all of it)?
2. Depth: big-picture ideas and key terms, or specific details (names, dates, numbers, steps)?
3. Difficulty: beginner, intermediate, or exam-level?

Step 3. After I answer, write about 30 cards that match my answers:
- One fact or idea per card. The front is a question; the back is a short answer (aim for under 200 characters, never over 1,000).
- Plain text only: no Markdown, LaTeX, HTML or images. Write maths in words or Unicode (x², √, π).
- Use the same language as the material unless I ask otherwise.
- No duplicate cards.

Reply with exactly one JSON code block in this shape, and nothing else:
{"deck": "Short deck name", "cards": [{"front": "Question", "back": "Answer"}]}
```

## Why does the prompt ask questions first?

Because "make flashcards from this" is too vague. A 40-page chapter could become 30 cards on the big ideas or 30 cards on dates and names, and only you know which one your exam needs. The three questions pin that down:

- **Scope:** which chapters or sections to cover. The AI offers options using your material's real section names.
- **Depth:** big-picture ideas and key terms, or specific details.
- **Difficulty:** beginner, intermediate, or exam-level.

You can answer in a few characters ("1b 2a 3c") or in a sentence ("just chapter 4, details, exam-level").

## Why does the prompt ask for one fact per card?

Short cards are easier to grade honestly. If a card asks for three things and you remember two, it's hard to say whether you "knew it". One fact per card keeps the answer clear-cut, and that matters in [the Leitner system](/leitner-system), where a miss sends a card back to box 1.

The other rules keep cards readable. Lietner shows plain text in any language, so the prompt asks for no Markdown, LaTeX or images, and for maths written in words or Unicode symbols. Each side can hold up to 1,000 characters, but short answers work best.

## What does the AI's reply look like?

One block of JSON, like this:

```json
{"deck": "Cell biology, chapter 3", "cards": [
  {"front": "What is the main job of the mitochondria?", "back": "Producing most of the cell's ATP through cellular respiration."},
  {"front": "Which organelle holds the cell's DNA?", "back": "The nucleus."}
]}
```

You don't need to read or edit it. Copy the whole block, including the braces. Lietner ignores any chatter the AI adds around the code block, and if the block got cut off, it tells you instead of importing half a deck. When you paste into a new deck's starter sheet and kept the default deck name, Lietner renames the deck to the one the AI suggests.

## What if something goes wrong?

- **"That doesn't look like the cards block."** The paste was incomplete or wasn't the code block. Copy the AI's whole code block again. If the reply was very long and got cut off, ask the AI to "continue the JSON" or to write fewer cards.
- **The AI wrote cards before asking the questions.** Reply with your answers anyway, and ask it to rewrite the cards to match.
- **Some rows were skipped.** Lietner skips cards that are missing a front or back, or that are longer than 1,000 characters a side, and tells you how many.
- **A card is wrong.** Open the deck editor and fix the text right there, or delete the card.

## Is it fine to study cards an AI wrote?

Yes, with one habit: check them. The prompt tells the AI to stick to your material, but AIs can still make mistakes. A quick skim in the deck editor before your first review catches most problems. And because every card starts in box 1, you'll see each one again soon, which is a good moment to spot anything that looks off.

Ready? [Open Lietner](/), create a deck, and select **Copy prompt**.
