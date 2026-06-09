# gm_₿

[![Русский](https://img.shields.io/badge/lang-Русский-blue)](README.md)
[![Deploy](https://github.com/21ideas-org/gm-web/actions/workflows/deploy.yml/badge.svg)](https://github.com/21ideas-org/gm-web/actions/workflows/deploy.yml)
[![Site](https://img.shields.io/website?url=https%3A%2F%2Fgm.21ideas.org&label=gm.21ideas.org&up_color=orange)](https://gm.21ideas.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![gm_₿ home page](docs/main.png)

> **Bitcoin only, signal only — no noise, no shitcoins.**

**gm_₿** — *«Доброе утро, биткоинер»* ("Good morning, Bitcoiner") — a daily, Russian-language,
Bitcoin-only news digest. Every morning, a short summary of the last 24 hours that matters:
the network, mining, Lightning, regulation, institutions. No altcoins, no pumps, no noise.

The site lives at [gm.21ideas.org](https://gm.21ideas.org) and is part of the
[21ideas](https://21ideas.org) ecosystem.

Digests are produced by a **separate bot** (not in this repo): it writes a Markdown file into
`src/content/digests/`, commits, and pushes — GitHub Pages then rebuilds and publishes the site,
and the bot announces the URL to Telegram/Discord.

## Subscribe

- **Telegram** — [@bitcoin21ideas](https://t.me/bitcoin21ideas)
- **RSS** — [gm.21ideas.org/rss.xml](https://gm.21ideas.org/rss.xml)

## Architecture

The tech stack, routing, theming, OG-card generation, and SEO machinery are documented separately —
see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Getting started

Requires Node >= 22.12.0 (pinned in `.nvmrc`).

```sh
git clone https://github.com/21ideas-org/gm-web.git
cd gm-web
nvm use            # picks up the Node version from .nvmrc
npm install
npm run dev        # dev server at localhost:4321
```

## Commands

| Command           | Action                            |
| :---------------- | :-------------------------------- |
| `npm install`     | Install dependencies              |
| `npm run dev`     | Dev server at `localhost:4321`    |
| `npm run build`   | Production build to `./dist/`     |
| `npm run preview` | Preview the production build      |
| `npm run check`   | Type-check (`astro check`)        |

## Content

### `digests`

Files in `src/content/digests/*.md`, conventionally named `YYYY-MM-DD.md`. Frontmatter:

```yaml
title: "Доброе утро, биткоинер — 5 июня 2025"   # used for <title>, the digest index, and RSS
description: "<teaser>"        # teaser → RSS + the bot's Telegram/Discord announcement
pubDate: 2025-06-05            # publish date; the OG cover dates the news to pubDate − 1 day
draft: false                  # optional (default false); drafts are excluded at build time
tags: [сеть, lightning]       # optional; collected but not surfaced in v1
```

> The OG cover uses a **fixed** brand title ("Доброе утро, биткоинер") and a date-stamped subtitle
> derived from `pubDate`; it does not render the `title` frontmatter.

### `projects`

Files in `src/content/projects/*.md` power the 21ideas ecosystem section: `name`, `description`,
`status` (`LIVE` | `WIP` | `ARCHIVED`), optional `url`, `stack`, `featured`, `order`.

## Deployment

Static build deployed to GitHub Pages on push to `main` (see `.github/workflows/`), served from
the custom domain in `public/CNAME` (`gm.21ideas.org`).

## Contributing

Found an error in a digest or on the site? Open an issue or a pull request. Digests are
bot-generated, so content edits are factual corrections; improvements to the site itself (markup,
accessibility, performance, SEO) are welcome as PRs.

## License

- **Code** — [MIT](LICENSE).
- **Digest content** — © the gm_₿ project; not covered by the code license.
