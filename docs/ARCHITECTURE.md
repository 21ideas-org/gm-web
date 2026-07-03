# Architecture

Technical reference for the gm_₿ site. For what the project is and how to run it, see the
[README](../README.md).

## Overview

gm_₿ is a static site built with **Astro 7** (`output: 'static'`), deployed to GitHub Pages at
`https://gm.21ideas.org` (custom domain via `public/CNAME`). All routing is file-based under
`src/pages/`, and everything — pages, feeds, sitemaps, OG images — is generated at build time;
there is no server runtime.

Digests are authored by a **separate bot** (not in this repo) that drops a Markdown file into
`src/content/digests/` and pushes; Pages rebuilds and publishes. Keep the content-collection shape
compatible with that bot.

## Naming

- **Wordmark** — `gm_₿` (underscore; canonical). Used in display/chrome: nav, footer, the
  page-`<title>` suffix, the OG path strip. The underscore matches the site's terminal aesthetic.
- **Editorial / publisher name** — «Доброе утро, биткоинер». Used in machine-read metadata
  (`schema.org` `name`, `og:site_name`, RSS/Yandex feed titles) that engines and feed readers
  display literally, and as the OG card title.
- **Plain identifier** — `gm`. Used wherever a glyph can't go: the `gm.21ideas.org` subdomain, the
  `gm-web` repo, social handles. This is the spoken/searchable name.

Defined once in `src/consts.ts` — `SITE_TITLE` (wordmark) and `SITE_NAME` (editorial name). Avoid
the spaced form `gm ₿`.

## Stack

- **[Astro 7](https://astro.build)** — static site generator (`output: 'static'`)
- **@astrojs/markdown-remark** — supplies `rehypeHeadingIds` to the Markdown pipeline (digests are
  plain Markdown content collections; the heading-anchor and tag plugins build on its heading ids).
  A direct dependency because Astro 7 no longer hoists it
- **@astrojs/sitemap** — sitemap at `/sitemap-index.xml` (per-URL `lastmod`; tag hubs are covered
  by a separate `/tags-sitemap.xml` instead)
- **@astrojs/rss** — full-content RSS feed at `/rss.xml`
- **markdown-it + sanitize-html** — render digest Markdown to HTML for the RSS and Yandex feeds
- **Shiki** — syntax highlighting via custom dual themes that swap on dark/light toggle
- **Satori + @resvg/resvg-js** — 1200×630 Open Graph cards prerendered at build time (`src/lib/og.ts`)

## Routing

`/` · `/digests` · `/digests/[slug]` · `/projects` · `/about` · `/support` · `/tags` · `/tags/[tag]` ·
`/rss.xml` · `/sitemap-index.xml` · `/news-sitemap.xml` · `/yandex-news.xml` · `/tags-sitemap.xml`
· `/og/*.png` · `robots.txt`.

## Layouts & components

- **`Base.astro`** — root HTML shell: inline theme script → `BaseHead` → `PathStrip` → `Nav` →
  `<slot>` → `Footer`.
- **`Post.astro`** — wraps `Base`, adds the post header (date + clickable topic chips) + prev/next
  nav. (The Giscus `<Comments />` slot exists but is not imported in v1.)

## Content collections (`src/content.config.ts`)

- **`digests`** — `glob` over `src/content/digests/*.md`. Fields: `title`, `description`, `pubDate`,
  `draft` (default `false`, filtered at query time), `tags` (default `[]`, the digest's topic slugs
  in section order). Filenames `YYYY-MM-DD.md`.
- **`projects`** — the 21ideas ecosystem section: `name`, `description`, `status`
  (`LIVE | WIP | ARCHIVED`), optional `url`, `stack`, `featured`, `order`.

Draft posts are excluded at the collection-query level, not the file level.

## Theme

Follows the system preference. CSS `:root` holds the dark tokens; `:root[data-theme="light"]` the
light tokens. An inline `<script>` in `Base.astro` resolves the theme before first paint, with the
precedence: explicit toggle (`localStorage.theme`) → system (`prefers-color-scheme`) → light
fallback. Styling is plain CSS only (no framework), all in `src/styles/global.css`; custom
properties (`--accent`, `--green`, `--muted`, …) are the design-token system.

## Code blocks & syntax highlighting

Shiki dual themes live in `src/themes/shiki-gm.mjs` (`gm-dark` / `gm-light`), wired in
`astro.config.mjs`. `src/plugins/rehype-code-copy.mjs` wraps each Markdown `<pre>` in a `.code-wrap`
with a language label + copy button; the delegated click handler lives at the bottom of `Post.astro`.

## OG images

1200×630 PNGs prerendered via Satori + `@resvg/resvg-js`; template in `src/lib/og.ts` (plain object
trees, no JSX). JetBrains Mono is vendored under `src/assets/fonts/`. The card is light-themed
regardless of site theme. Two endpoints: `src/pages/og/[...slug].png.ts` (per digest, fixed brand
title + date-stamped subtitle) and `src/pages/og/default.png.ts` (fallback).

## SEO & discoverability

- **Meta** — `BaseHead.astro` emits `robots` (`max-image-preview:large`…), `og:locale`,
  `og:site_name`, `og:type` (`article` on digests), `article:*`, and the public Yandex verification
  token.
- **Structured data** — JSON-LD `@graph` built in `src/lib/schema.ts`: `NewsMediaOrganization` +
  `WebSite` site-wide, `NewsArticle` + `BreadcrumbList` per digest.
- **Sitemap** — `@astrojs/sitemap` with per-URL `lastmod`/`changefreq`/`priority`; `/tags` pages
  are kept out of the main sitemap and covered by the dedicated `/tags-sitemap.xml` instead.
  (Use `ChangeFreqEnum`, not bare strings — bare strings fail `npm run check`.)
- **Topic hubs** — `/tags` (index) + `/tags/[tag]` (per-article hubs). Built at build time by
  parsing each digest's heading tree (`src/lib/tags.ts`): every `#### ` headline inherits its
  enclosing `## ` topic, mapped to a stable slug via a ten-topic registry; hub rows deep-link to
  the headline's anchor inside its digest. The same registry drives the topic chips on each digest
  and the frontmatter `tags` the bot writes (which feed RSS `<category>`). Hubs below an
  item floor render `noindex, follow` and stay out of `/tags-sitemap.xml`; qualifying hubs are
  listed there with `lastmod` = newest item.
- **News feeds** — Google News sitemap at `/news-sitemap.xml` (rolling 48-hour window) and a Yandex
  fresh-content RSS feed at `/yandex-news.xml` (full `<yandex:full-text>`). Both render digest
  Markdown to HTML via `markdown-it` + `sanitize-html`.
- **RSS** — `/rss.xml` carries full `<content:encoded>`, `<language>ru-ru</language>`, and a self
  `atom:link`.
- **IndexNow** — an `indexnow` job in `.github/workflows/deploy.yml` pings the shared
  `api.indexnow.org` endpoint (Yandex + Bing) for new/changed digests after each deploy. The key
  file in `public/` is public by protocol design — not a secret. Google does not participate; it
  relies on the news sitemap instead.

## Donations & finances

The `/support` page (`src/pages/support.astro` + `src/lib/finances.ts`) renders the project's
per-month running cost against donations, from `FINANCES_START` (`src/consts.ts`). `finances.ts` runs
at build time, is memoized, and is **fail-soft** — a missing or malformed input degrades to an
empty/partial model and never throws, because the page shares the daily digest-publish build. Money
is kept as integer sats + USD cents until display.

Donations come from two committed, build-time sources under `src/data/` (read via `fs`, so they are
never served), merged in `readDonations()`:

- **`donations-ledger.json`** — the programmatic ledger, refreshed **manually via a local CLI**
  (`scripts/update-donations-ledger.mjs`), not by CI or any bot. It pulls received-payment history
  from Coinos, self-computes net sats + USD value, and records each donation projected down to
  exactly `{id, ts, sats, usdCents, rail}` — hash-only, free of any donor PII, with timestamps
  stored as a UTC date only (never an exact time), since the repo is public. Append-only, with a
  strict projection guard, a cumulative sanity gate, and an offline unit-test suite (`npm test`, run
  on pull requests). Only **USD** payments are recorded.
- **`donations-manual.json`** — a small, hand-curated, display-only ledger for donations the
  programmatic updater can't represent (e.g. donations to a personal lightning address, or receipts
  predating the account's switch to USD, converted by hand). Same entry shape; never read by the
  updater or its gates.

## Build & deploy

`npm run build` → static output in `dist/`. Pushing to `main` triggers
`.github/workflows/deploy.yml` (build → lychee internal-link check → deploy to GitHub Pages), then
the `indexnow` job. CI gates that every change must pass: `npm ci`, `npm run check`, `npm run
build`, and the lychee internal-link check.
