# gm ₿

Daily, Russian-language, Bitcoin-only news digest — *«Доброе утро, биткоинер»*.
Published as a static site at [gm.21ideas.org](https://gm.21ideas.org), part of the
[21ideas](https://21ideas.org) ecosystem.

Each digest summarizes the previous 24 hours of Bitcoin news. New digests are produced by
a **separate bot** (not in this repo) that writes a Markdown file into
`src/content/digests/`, commits, and pushes — GitHub Pages then rebuilds and publishes
automatically, and the bot announces the published URL to Telegram/Discord.

## Stack

- **[Astro 6](https://astro.build)** — static site generator (`output: 'static'`)
- **MDX** — Markdown content collections
- **@astrojs/sitemap** — sitemap at `/sitemap-index.xml`
- **@astrojs/rss** — RSS feed at `/rss.xml`
- **Shiki** — syntax highlighting via custom dual themes that swap on dark/light toggle
- **Satori + @resvg/resvg-js** — 1200×630 Open Graph cards prerendered at build time
  (`src/lib/og.ts`): per-digest cards at `src/pages/og/[...slug].png.ts`, default card at
  `src/pages/og/default.png.ts`. Fonts (JetBrains Mono) are vendored under `src/assets/fonts/`.

## Commands

| Command               | Action                            |
| :-------------------- | :-------------------------------- |
| `npm install`         | Install dependencies              |
| `npm run dev`         | Dev server at `localhost:4321`    |
| `npm run build`       | Production build to `./dist/`     |
| `npm run preview`     | Preview the production build      |
| `npm run check`       | Type-check (`astro check`)        |

## Content

### `digests`

Files in `src/content/digests/*.md`, conventionally named `YYYY-MM-DD.md`. Frontmatter:

```yaml
title: "gm ₿ — 5 июня 2025"   # used for <title>, the digest index, and RSS
description: "<teaser>"        # teaser → RSS + the bot's Telegram/Discord announcement
pubDate: 2025-06-05            # publish date; the OG cover dates the news to pubDate − 1 day
draft: false                  # optional (default false); drafts are excluded at build time
tags: [сеть, lightning]       # optional; collected but not surfaced in v1
```

> The OG cover uses a **fixed** brand title ("Доброе утро, биткоинер") and a date-stamped
> subtitle derived from `pubDate`; it does not render the `title` frontmatter.

### `projects`

Files in `src/content/projects/*.md` power the 21ideas ecosystem section:
`name`, `description`, `status` (`LIVE` | `WIP` | `ARCHIVED`), optional `url`, optional
`stack`, `featured`, `order`.

## Deployment

Static build deployed to GitHub Pages on push to `main` (see `.github/workflows/`), served
from the custom domain in `public/CNAME` (`gm.21ideas.org`).

## Requirements

Node >= 22.12.0 (see `.nvmrc` / `package.json`).

## License

[MIT](LICENSE)
