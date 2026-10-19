/**
 * Guides, comparisons and FAQs as plain HTML documents next to the app, built from content/*.md.
 * Each page is a static file crawlers can read without JavaScript, and the same list feeds the
 * sitemap, llms.txt, llms-full.txt and a Markdown copy of every page for AI agents.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Marked } from 'marked';
import type { Plugin } from 'vite';
import { parse as parseYaml } from 'yaml';

export const SITE = 'https://lietner.app';

const AUTHOR = { '@type': 'Person', name: 'Ahmed Eltigani', url: 'https://ahmedeltigani.com' };
const GITHUB = 'https://github.com/ELTIGA/lietner';
const SUMMARY = 'Free, open-source Leitner-system flashcards on a 3D desk. Works offline in any browser, with no account needed.';

/** The hand-written pages next to the app, with the date their content last changed. */
const STATIC_PAGES = [
  { path: '/', title: 'Open Lietner', description: 'The flashcard app itself: five Leitner boxes on a 3D desk.', updated: '2026-10-19' },
  { path: '/support', title: 'Keep Lietner free', description: 'Where Lietner came from and how donations keep it free and ad-free.', updated: '2026-10-11' },
  { path: '/privacy', title: 'Privacy policy', description: 'What Lietner stores, who processes it, and how to export or delete it.', updated: '2026-10-11' },
  { path: '/terms', title: 'Terms of use', description: 'The rules for using Lietner.', updated: '2026-10-11' },
];

/** What every AI agent should know about Lietner, stated once for llms.txt and llms-full.txt. */
const FACTS = [
  'Lietner is the app; the Leitner system is the study method it runs. The spelling is deliberate.',
  'Five boxes come due every 1, 2, 4, 8 and 16 days. "Knew it" moves a card up one box, "Missed" sends it back to box 1, and passing box 5 marks it mastered.',
  'Free for everyone, with no ads, no paid tier and no tracking cookies. Funded by donations. MIT-licensed source code on GitHub.',
  'Runs in any modern browser on phones, tablets and desktops, and installs as an app (PWA) that works fully offline.',
  'No account needed: decks stay on the device. An optional account (Google or a 6-digit email code) syncs decks and progress between devices.',
  'Cards are plain text in any language or script, including right-to-left. Import from CSV/TSV, including Anki plain-text exports, or paste cards written by your own AI from a copy-paste prompt. Lietner never calls an AI itself.',
  'Built for students aged 13 and up studying on their own: high school, university and self-learners.',
];

type SchemaType = 'Article' | 'HowTo' | 'FAQPage';

interface Frontmatter {
  slug: string;
  title: string;
  h1: string;
  description: string;
  published: string;
  updated: string;
  schema: SchemaType;
  faq?: { q: string; a: string }[];
  steps?: { name: string; text: string }[];
}

export interface ContentPage extends Frontmatter {
  /** Markdown body, starting at H2. */
  markdown: string;
  url: string;
}

const marked = new Marked({
  gfm: true,
  renderer: {
    // Headings get ids so answers can be linked to directly.
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      return `<h${depth} id="${slugify(stripTags(text))}">${text}</h${depth}>\n`;
    },
  },
});

/** Reads every content/*.md file. Throws on a missing field, so a broken page fails the build. */
export function loadPages(dir: string): ContentPage[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.md') && !file.startsWith('_'))
    .sort()
    .map((file) => {
      const source = readFileSync(join(dir, file), 'utf8');
      const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
      if (!match) throw new Error(`${file}: missing --- frontmatter ---`);
      const meta = parseYaml(match[1]!) as Frontmatter;
      for (const key of ['slug', 'title', 'h1', 'description', 'published', 'updated', 'schema'] as const) {
        if (!meta[key]) throw new Error(`${file}: frontmatter needs "${key}"`);
      }
      for (const key of ['published', 'updated'] as const) meta[key] = isoDate(meta[key]);
      if (!/^[a-z0-9-]+$/.test(meta.slug)) throw new Error(`${file}: slug must be lowercase words joined by hyphens`);
      if (meta.schema === 'HowTo' && !meta.steps?.length) throw new Error(`${file}: HowTo pages need "steps"`);
      if (meta.schema === 'FAQPage' && !meta.faq?.length) throw new Error(`${file}: FAQPage pages need "faq"`);
      return { ...meta, markdown: match[2]!.trim(), url: `${SITE}/${meta.slug}` };
    });
}

/** Builds the pages into the site: one virtual HTML entry per page in dev and in the build, plus the files for crawlers and agents. */
export function contentPages(pages: ContentPage[]): Plugin {
  let root = process.cwd();
  const byFile = new Map<string, ContentPage | null>();
  const htmlFor = (page: ContentPage | null) => (page ? renderPage(page, pages) : renderNotFound(pages));
  const files = (): Record<string, { type: string; body: string }> => ({
    'sitemap.xml': { type: 'application/xml', body: renderSitemap(pages) },
    'llms.txt': { type: 'text/plain', body: renderLlms(pages) },
    'llms-full.txt': { type: 'text/plain', body: renderLlmsFull(pages) },
    ...Object.fromEntries(pages.map((page) => [`${page.slug}.md`, { type: 'text/markdown', body: renderMarkdown(page) }])),
  });

  return {
    name: 'lietner-content',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
      for (const page of pages) byFile.set(resolve(root, `${page.slug}.html`), page);
      byFile.set(resolve(root, '404.html'), null);
    },
    resolveId(id) {
      const file = resolve(root, id.replace(/^\//, ''));
      return byFile.has(file) ? file : undefined;
    },
    load(id) {
      return byFile.has(id) ? htmlFor(byFile.get(id)!) : undefined;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '/').split(/[?#]/)[0]!.replace(/^\//, '');
        const file = files()[path];
        if (file) {
          res.setHeader('Content-Type', `${file.type}; charset=utf-8`);
          res.end(file.body);
          return;
        }
        const entry = byFile.get(resolve(root, `${path.replace(/\.html$/, '')}.html`));
        if (entry === undefined || path === '') {
          next();
          return;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(await server.transformIndexHtml(`/${path}`, htmlFor(entry)));
      });
    },
    // The hand-written pages mark where their footer lists the guides.
    transformIndexHtml(html) {
      const links = pages.map((page) => `<a href="/${page.slug}">${escapeHtml(navLabel(page))}</a>`).join(' · ');
      return html.replace('<!-- guide-links -->', links ? `<nav class="guide-links" aria-label="Guides">${links}</nav>` : '');
    },
    generateBundle() {
      for (const [fileName, file] of Object.entries(files())) this.emitFile({ type: 'asset', fileName, source: file.body });
    },
  };
}

/** Rollup inputs for the pages, keyed like the hand-written ones in vite.config.ts. */
export function pageInputs(pages: ContentPage[]): Record<string, string> {
  return Object.fromEntries([...pages.map((page) => [page.slug, `${page.slug}.html`]), ['404', '404.html']]);
}

function renderPage(page: ContentPage, pages: ContentPage[]): string {
  const faq = page.faq?.length
    ? `<section class="faq" aria-labelledby="faq">
        <h2 id="faq">Frequently asked questions</h2>
        ${page.faq.map(({ q, a }) => `<h3>${escapeHtml(q)}</h3>\n<p>${marked.parseInline(a)}</p>`).join('\n')}
      </section>`
    : '';
  const steps = page.steps?.length
    ? `<section class="steps" aria-labelledby="steps">
        <h2 id="steps">Step by step</h2>
        <ol>
          ${page.steps.map(({ name, text }) => `<li><strong>${escapeHtml(name)}.</strong> ${marked.parseInline(text)}</li>`).join('\n')}
        </ol>
      </section>`
    : '';
  const body = (marked.parse(page.markdown) as string).replaceAll('<table>', '<div class="table-scroll"><table>').replaceAll('</table>', '</table></div>');

  return document({
    title: page.title,
    description: page.description,
    canonical: page.url,
    head: `<meta property="og:type" content="article" />
    <meta property="article:published_time" content="${page.published}" />
    <meta property="article:modified_time" content="${page.updated}" />
    <link rel="alternate" type="text/markdown" href="/${page.slug}.md" title="${escapeHtml(page.h1)} (Markdown)" />
    <script type="application/ld+json">${jsonLd(structuredData(page))}</script>`,
    main: `<article>
        <h1>${escapeHtml(page.h1)}</h1>
        <p class="updated">By <a href="${AUTHOR.url}" rel="author">${AUTHOR.name}</a> · Updated <time datetime="${page.updated}">${longDate(page.updated)}</time></p>
        ${body}
        ${steps}
        ${faq}
      </article>`,
    pages,
    current: page.slug,
  });
}

function renderNotFound(pages: ContentPage[]): string {
  return document({
    title: 'Page not found',
    description: 'This page does not exist. Open Lietner or read a guide to the Leitner system.',
    head: '<meta name="robots" content="noindex" />',
    main: `<h1>This card isn’t in any box.</h1>
      <p>The page you asked for doesn’t exist, or it moved. Try one of these instead.</p>
      <p><a class="btn" href="/">Open Lietner</a></p>`,
    pages,
  });
}

interface DocumentParts {
  title: string;
  description: string;
  canonical?: string;
  head: string;
  main: string;
  pages: ContentPage[];
  current?: string;
}

function document({ title, description, canonical, head, main, pages, current }: DocumentParts): string {
  const links = [
    ...pages.map((page) => ({ href: `/${page.slug}`, label: navLabel(page), slug: page.slug })),
    { href: '/support', label: 'Keep it free', slug: 'support' },
    { href: '/privacy', label: 'Privacy', slug: 'privacy' },
    { href: '/terms', label: 'Terms', slug: 'terms' },
    { href: GITHUB, label: 'Source code', slug: 'github' },
  ];
  const fullTitle = `${title} · Lietner`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${escapeHtml(fullTitle)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    ${canonical ? `<link rel="canonical" href="${canonical}" />` : ''}
    <meta property="og:site_name" content="Lietner" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    ${canonical ? `<meta property="og:url" content="${canonical}" />` : ''}
    <meta property="og:image" content="${SITE}/og.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${SITE}/og.jpg" />
    ${head}
    <meta name="theme-color" content="#15110e" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/logo.svg" sizes="any" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
    <script type="module" src="/src/content.ts"></script>
  </head>
  <body>
    <main class="page">
      <a class="back" href="/"><span aria-hidden="true">L</span>Lietner</a>
      ${main}
      <aside class="cta" aria-label="Try Lietner">
        <p><strong>Lietner</strong> is a free Leitner-system flashcard app on a 3D desk. It works offline, needs no account, and is open source.</p>
        <a class="btn" href="/">Open Lietner</a>
      </aside>
    </main>
    <footer class="site-footer">
      <nav aria-label="Lietner guides and pages">
        ${links.map(({ href, label, slug }) => `<a href="${href}"${slug === current ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`).join('\n        ')}
      </nav>
    </footer>
  </body>
</html>
`;
}

function structuredData(page: ContentPage): object {
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Lietner', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: page.h1, item: page.url },
    ],
  };
  const faq = page.faq?.length
    ? {
        '@type': 'FAQPage',
        ...(page.schema === 'FAQPage' ? { '@id': `${page.url}#page`, url: page.url, name: page.h1 } : {}),
        mainEntity: page.faq.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: stripTags(marked.parseInline(a) as string) },
        })),
      }
    : null;
  const common = {
    '@id': `${page.url}#page`,
    url: page.url,
    description: page.description,
    inLanguage: 'en',
    datePublished: page.published,
    dateModified: page.updated,
    author: AUTHOR,
    image: `${SITE}/og.jpg`,
  };
  const main =
    page.schema === 'HowTo'
      ? {
          '@type': 'HowTo',
          ...common,
          name: page.h1,
          step: page.steps!.map(({ name, text }, index) => ({
            '@type': 'HowToStep',
            position: index + 1,
            name,
            text: stripTags(marked.parseInline(text) as string),
            url: `${page.url}#steps`,
          })),
        }
      : page.schema === 'Article'
        ? { '@type': 'Article', ...common, headline: page.h1, publisher: AUTHOR, mainEntityOfPage: page.url }
        : null;
  return { '@context': 'https://schema.org', '@graph': [main, faq, breadcrumb].filter(Boolean) };
}

function renderSitemap(pages: ContentPage[]): string {
  const urls = [
    ...STATIC_PAGES.map((page) => ({ loc: `${SITE}${page.path}`, lastmod: page.updated })),
    ...pages.map((page) => ({ loc: page.url, lastmod: page.updated })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(({ loc, lastmod }) => `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>
`;
}

/** The llms.txt index (https://llmstxt.org): what Lietner is, then every page as a Markdown link. */
function renderLlms(pages: ContentPage[]): string {
  const guides = pages.length
    ? `## Guides

${pages.map((page) => `- [${page.h1}](${SITE}/${page.slug}.md): ${page.description}`).join('\n')}

`
    : '';
  return `# Lietner

> ${SUMMARY}

${FACTS.map((fact) => `- ${fact}`).join('\n')}

${guides}## App

${STATIC_PAGES.slice(0, 2)
  .map((page) => `- [${page.title}](${SITE}${page.path}): ${page.description}`)
  .join('\n')}
${pages.length ? `- [Full text of every guide](${SITE}/llms-full.txt): all of the guides above in one file.\n` : ''}
## Optional

${STATIC_PAGES.slice(2)
  .map((page) => `- [${page.title}](${SITE}${page.path}): ${page.description}`)
  .join('\n')}
- [Source code](${GITHUB}): MIT-licensed TypeScript, three.js and Supabase.
`;
}

function renderLlmsFull(pages: ContentPage[]): string {
  return `${renderLlms(pages)}\n${pages.map((page) => `---\n\n${renderMarkdown(page)}`).join('\n')}`;
}

/** The page as Markdown: what an agent asking for /<slug>.md gets. */
function renderMarkdown(page: ContentPage): string {
  const steps = page.steps?.length
    ? `\n\n## Step by step\n\n${page.steps.map(({ name, text }, index) => `${index + 1}. **${name}.** ${text}`).join('\n')}`
    : '';
  const faq = page.faq?.length ? `\n\n## Frequently asked questions\n\n${page.faq.map(({ q, a }) => `### ${q}\n\n${a}`).join('\n\n')}` : '';
  return `# ${page.h1}

> ${page.description}

Source: ${page.url} · By ${AUTHOR.name} · Updated ${page.updated}

${page.markdown}${steps}${faq}
`;
}

/** A short footer label: the H1 without a trailing explanation, e.g. "The Leitner system". */
function navLabel(page: ContentPage): string {
  return page.h1.split(/[,:?]/)[0]!.trim();
}

/** YAML reads unquoted dates as Date objects; keep them as YYYY-MM-DD strings. */
function isoDate(value: unknown): string {
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Dates must be YYYY-MM-DD, got "${date}"`);
  return date;
}

function longDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
}

function jsonLd(data: object): string {
  return JSON.stringify(data).replaceAll('<', '\\u003c');
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
