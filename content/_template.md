---
# Copy this file to content/<slug>.md. Files starting with "_" are skipped.
slug: example-page                 # URL path: https://lietner.app/example-page
title: "Example page title"        # <title> and og:title, about 50-60 characters (" · Lietner" is added)
h1: "The example, explained"       # The visible heading; the footer link uses the part before any comma or colon
description: "One honest sentence of 120-160 characters that says what the page answers and why it helps."
published: 2026-10-19
updated: 2026-10-19                # Bump when the content changes: feeds dateModified and the sitemap's lastmod
schema: Article                    # Article | HowTo | FAQPage
faq:                               # Optional. Shown at the end of the page and as FAQPage structured data
  - q: "A question people actually ask?"
    a: "A direct answer in one to three sentences. Inline **Markdown** and [links](/leitner-system) work."
steps:                             # Required for HowTo pages. Shown as a numbered list before the FAQ
  - name: "Short step name"
    text: "What to do in this step."
---

Body in Markdown, starting at H2 (the H1 comes from the frontmatter). Answer the page's main question
in the first paragraph, phrase H2s as the questions people ask, and link sources for every outside fact.

## A question this section answers?

Text, lists and tables.
