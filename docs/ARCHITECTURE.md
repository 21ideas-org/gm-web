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

`SITE_TITLE` (wordmark) is defined in `src/consts.ts`. `SITE_NAME` (editorial name) and
`SITE_DESCRIPTION` are defined once in the pure ESM module `src/site-identity.mjs`, shared by the
podcast modules and re-exported by `src/consts.ts` for Astro consumers. Avoid the spaced form `gm ₿`.

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

`/` · `/listen` · `/digests` · `/digests/[slug]` · `/projects` · `/about` · `/support` · `/tags` · `/tags/[tag]` ·
`/rss.xml` · `/podcast.xml` (only once the show is configured) · `/sitemap-index.xml` · `/news-sitemap.xml` · `/yandex-news.xml` · `/tags-sitemap.xml`
· `/og/*.png` · `robots.txt`.

## Layouts & components

- **`Base.astro`** — root HTML shell: inline theme script → `BaseHead` → `PathStrip` → `Nav` →
  `<slot>` → `Footer`.
- **`Post.astro`** — wraps `Base`, adds the post header (date + clickable topic chips), the
  «Сегодня в истории» rubric (`History.astro`) + prev/next nav. (The Giscus `<Comments />` slot
  exists but is not imported in v1.)

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
  `atom:link`. The separate audio-only `/podcast.xml` is described under **Podcast feed**.
- **IndexNow** — an `indexnow` job in `.github/workflows/deploy.yml` pings the shared
  `api.indexnow.org` endpoint (Yandex + Bing) for new/changed digests after each deploy. The key
  file in `public/` is public by protocol design — not a secret. Google does not participate; it
  relies on the news sitemap instead.

## «Сегодня в истории» (this day in Bitcoin history)

Every digest ends with a collapsible list of historical Bitcoin events whose anniversary matches the
digest's `pubDate` (`src/components/History.astro`). It is a pure function of the date — no bot
involvement — so every past digest picks it up on the next build.

- **Source** — the deployed public Bitcoin Calendar API,
  `https://api.bitcoin-calendar.org/public/v2/events?lang=ru` (no key, no secret). The loader
  `src/lib/history.mjs` fetches it **at build time only, in Node** — nothing is fetched in the
  browser and no runtime service exists. `HISTORY_API_URL` overrides the endpoint for local/test runs.
- **One request per build** — a module-level memoized promise is shared by every prerendered digest
  page: 8-second timeout per attempt, at most one retry after 1 second (transient failures only:
  timeout, network error, 5xx/429), so at most two physical requests per build.
- **Validation & ordering** — the response must be `{ schema, database: { rows }, events: [...] }`
  with `schema` exactly `bitcoin-calendar.public-events.v2` (the versioned public contract). Rows are
  grouped by month-day, the leading emoji prefix is stripped from titles, and same-day events are
  ordered by full historical date ascending. `references` and `media` are kept in the in-memory event
  model as `string[]`, passed through exactly as the API stores them (no trimming, URL parsing, or
  filtering). Neither list is rendered in gm-web; sources are available on the Calendar event page.
  The loader also preserves the stored `url_path` string, or `null` when absent or of the wrong type.
- **Event button** — below the description, inside the same accordion item, the event has one
  «Открыть в Биткоин календаре →» button using the existing `.cta-btn` style. The pure helper
  `src/lib/history-event.mjs` splits description paragraphs and builds the Russian permalink under
  `https://bitcoin-calendar.org/ru/events/`. It validates `url_path` as `/<date>/<slug>/` with a real
  calendar date and a single slug segment, rejecting whitespace-padded slugs, dot segments,
  backslashes and control characters. Date and slug are encoded separately. The path is never
  reconstructed from the title or historical `date`: the stored path's date may differ. Missing or
  invalid paths omit only the button, preserving the event's title and description.
- **Fail-soft, never fatal** — digest pages share the bot's publish build, so nothing here can fail
  the build. Degradation is layered: a malformed optional field (references/media that isn't an
  array) becomes `[]` and a non-string element inside one is dropped; a non-string `url_path` becomes
  `null`. The event is kept; an invalid row (bad date, blank title/description) is skipped alone;
  `database.rows` differing from `events.length` is reported as `rows_mismatch` while every valid event
  still renders. A timeout, network error, non-2xx, non-JSON body, or schema mismatch makes the whole
  source unavailable, and every digest **silently omits the section** — no reader-facing error text.
- **Diagnostics** — exactly one `[history] fetch <ok|degraded|unavailable> …` line on stderr per
  build, carrying only fixed reason codes and counts (never upstream error text). There is no public
  status route and no Actions annotation.
- **Recovery** — the site is static, so an outage is baked into the pages built during it. Recovery
  is simply the next successful build (e.g. the next digest push or a manual re-run of the deploy
  workflow); every digest regains the section then.
- **Rollout** — deploy Calendar API v2 and expose `/public/v2/events` through the public proxy/cache
  with the same protections as v1 before releasing this gm-web consumer. Verify an unauthenticated
  200 response, the v2 schema and populated `url_path` fields at the public origin. V1 remains
  available to existing consumers; deploying gm-web before v2 is available would omit the history
  section during builds.

History used to be read from a committed SQLite file (`src/data/events_ru.db` via `better-sqlite3`,
the project's only native dependency). Both were removed when the loader moved to the API.

## Audio edition (digest player)

A digest page shows a compact native audio player (`src/components/AudioPlayer.astro`, rendered by
`Post.astro` under the header) only when a valid sidecar exists for it. Pages without one are
unchanged. MP3s are never committed, fetched or read by the build; they live on a separate audio
host (`https://audio.21ideas.org`, the 21ideas box). The site itself stays on GitHub Pages at
`https://gm.21ideas.org`; its DNS, pages and feed URLs do not change.

- **Sidecar** — `src/data/audio/{episodeId}.json` (outside the content collection, so the digest
  Markdown/schema the bot writes is untouched). v1 fields: `version` (1), `episodeId`
  (`YYYY-MM-DD`, must equal the file name and an existing `src/content/digests/{episodeId}.md`),
  `guid` (exactly `gm-audio:{episodeId}`), `publishedAt` (UTC `…T…Z`), `coveredDate` (real date
  before the episode), `digestSha256` (sha256 of the digest file's **original bytes**),
  `mediaVersion` (positive integer: which file of that day the URL names), `url`, `mimeType`
  (`audio/mpeg`), `byteLength` (positive integer), `durationSeconds` (positive), `sha256` (MP3
  hash, 64 lowercase hex — integrity metadata, not part of the file name). Unknown extra fields are
  ignored.
- **Trusted URL** — must be exactly `https://audio.21ideas.org/podcasts/{episodeId}.mp3` when
  `mediaVersion` is 1, or `…/podcasts/{episodeId}-v{mediaVersion}.mp3` for a later distinct take of
  the same day (`-v2`, `-v3`, … — no zero padding, no `-v1`). The date is the episode (publication)
  date, never the covered day. `AUDIO_MEDIA_ORIGIN` in `src/lib/audio.mjs` is the trusted origin (the
  configured value must be a bare HTTPS origin). Other origins (including `gm.21ideas.org`),
  ports/schemes, credentials, queries, fragments, traversal, encoded/variant paths, a version that
  disagrees with the URL, and the superseded `/podcasts/{episodeId}/{sha256}.mp3` layout are
  rejected. A guid/URL/hash shared by two records rejects both.
- **Immutable files, immutable sidecars** — each published MP3 URL is immutable on the audio host;
  a new distinct take gets a new `-vN` name rather than overwriting one. That naming rule does
  **not** make published sidecars or digests replaceable: both stay create-only, and there is no
  automatic re-generation or back-fill of an already published day.
- **One loader** — `src/lib/audio.mjs`: `loadAudioEpisodes()` (pure, injectable dirs/origin/log),
  memoized `audioEpisodes()` (`Map<episodeId, AudioEpisode>`) and `audioForDigest(id)`. The
  podcast feed consumes the same map, looked up by published (non-draft) digest ids.
- **Fail-soft** — a missing directory is silent; an invalid, orphaned, unreadable or mismatched
  sidecar is skipped with `[audio] skip <file>: <reason>` plus one `[audio] sidecars ok=N skipped=M`
  line on stderr. It never fails the build.
- **Player** — `<audio controls preload="none">` with an accessible label, duration
  (`<time datetime="PT…">`) and a direct MP3 download link with its size (the `download` attribute is
  only a hint on the cross-origin audio host; the readable date file name is what users get). Offline tests:
  `node --test scripts/audio.test.mjs` (also part of `npm test`).

## Podcast feed (`/podcast.xml`)

The channel continues the existing **21ideas** podcast; its identity is independent of the daily
digest brand. `src/data/podcast/21ideas-archive.json` is a frozen import of the historical Anchor
episodes. `src/lib/podcast-archive.mjs` validates and renders that archive; the feed merges it with
new sidecar-backed digest episodes, newest first. Original GUIDs, enclosure types/lengths,
dates, descriptions and iTunes episode metadata are retained. `src/data/podcast/21ideas-media.json`
is a complete verified GUID-keyed mapping to self-hosted archive files; only enclosure URLs change.
The original source URLs stay in the frozen snapshot. Missing, duplicate, mismatched or untrusted
mappings fail explicitly. Historical audio is not subject to the new digest loader's duration limits. Duplicate archive or
archive/digest identities fail the build rather than silently lose episodes. Migration steps and
server route and migration checks are in `docs/podcast/21ideas-migration.md`.

A separate RSS 2.0 + iTunes feed of the audio episodes; `/rss.xml` stays the full-text feed and is
unchanged. Builder: `src/lib/podcast.mjs` (pure, deterministic); route: `src/pages/[feed].xml.js`.

- **Episodes** — published (non-draft) digests whose own validated episode is in the shared
  `audioEpisodes()` map (all sidecar validation, URL trust and guid/URL/hash de-duplication stay in
  `src/lib/audio.mjs`). Drafts, digests without audio, and orphan/invalid/mismatched/conflicting
  records never produce an item. Newest first by `publishedAt`. Per item: `guid` (`gm-audio:{id}`,
  `isPermaLink="false"`; never derived from the MP3 file name or version), RFC 822 `pubDate` from the
  sidecar's UTC `publishedAt`, `enclosure` (sidecar `url` — `…/podcasts/{id}.mp3` or `…-vN.mp3` —
  `byteLength`, `mimeType`), `itunes:duration` (whole measured seconds), the digest
  title, and the canonical digest `link`.
- **Show notes** — built in code from the publication-card fields, in this order:
  `Доброе утро, биткоинер — {date}`, using the `formatRuDate` label (with year — the spoken no-year rule is
  speech-only), the digest `description` (the bot's capitalized Telegram/cover teaser, verbatim),
  `Текстовая версия со ссылками на источники:` plus `https://gm.21ideas.org/digests/{id}/`, and `Поддержите создание «Доброе утро, биткоинер»:
  https://gm.21ideas.org/support/`. Both URLs come from `siteOrigin` in the config, never from digest
  text; no exchange link. `<description>` is plain text with blank-line paragraphs;
  `<content:encoded>` is the HTML variant whose links show the full URL as their text. All text is
  XML-escaped and XML-illegal characters are dropped.
- **Show config** — `PODCAST_SHOW` in `src/lib/podcast-config.mjs`: `siteOrigin` (bare HTTPS
  origin), `title`, `description`, `language`, `author`, `ownerName`, `ownerEmail` (ownership
  contact), `category` (Apple category text), `imageUrl` (HTTPS `.jpg`/`.png`, square 1400–3000 px —
  not the 1200×630 `/og/` card). `ownerEmail` uses the operator-approved public project contact. The existing
  3000×3000 show cover is served from `/podcasts/21ideas-cover.jpg`; optional `episodeImageUrl`
  supplies `/podcasts/gm-bitcoiner-cover.png` for new digest episodes only. Historical episode
  artwork is preserved. An invalid configured episode cover suppresses feed publication.
  Optional `guid` preserves the verified existing Podcast Index UUIDv5 across hosting moves;
  invalid configured GUIDs also suppress publication. The Podcast Namespace funding tag points to
  `/support/`. `archiveValue` defines the archive default at 95/4/1; `archiveValueOverrides` preserves
  the original 74/21/4/1 split only for the twelve book GUIDs;
  `dailyLightningAddress` overrides them per daily episode with one Coinos recipient at 100%.
  Invalid payment config suppresses publication. Payment routing and compatibility limits are
  documented in `docs/podcast/21ideas-migration.md`.
- **Unadvertised until complete** — `podcastShowStatus()` lists missing/untrusted fields. While any
  is missing, `getStaticPaths()` returns no path, so the build emits **no** `/podcast.xml`, and
  `BaseHead.astro` omits the feed's `<link rel="alternate">`. Text builds are unaffected. Once
  complete, the feed is built and advertised automatically; validate the first live feed with
  platform tooling. Directory submission (Apple Podcasts, Spotify) is a separate human step.
- **Tests** — `node --test scripts/podcast.test.mjs` (also part of `npm test`): byte-exact fixture
  `scripts/__fixtures__/podcast/feed.xml`, excluded-record cases, GUID/order stability, hostile
  text, show-note contract, and complete production/fixture configurations and invalid-identity guards. Archive tests in
  `scripts/podcast-archive.test.mjs` cover historical metadata preservation and identity collisions.

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

## Listening page

`/listen/` is the permanent audio landing page; `/digests/{episodeId}/` remains the canonical
episode URL. It reuses `audioEpisodes()` and the progressively enhanced custom `AudioPlayer.astro`,
showing all published digests with matching validated audio as newest-first cards. Each card has
a date without terminal prefixes, a player, a tree of verified show links and a text/source button.
Stable `episode-{episodeId}` fragments resolve to cards; clicking a date copies its full URL without
scrolling, with success/error feedback and the address bar as the clipboard-failure fallback.
No media is fetched at build time; every player keeps `preload="none"`. Missing audio renders a
usable text-digest fallback.

`src/lib/listen-state.ts` shares the page state with navigation, the homepage audio action, and
the compact digest subscription block. Subscription actions require `podcastShowStatus()` from
the podcast RSS implementation to accept the show identity and at least one published playable
episode; a newer text-only digest does not hide them. `/rss.xml` remains the text feed.

`src/lib/podcast-apps.mjs` owns the typed app registry: Fountain, Spotify, Apple Podcasts and
Boost Me Bitch, each configured with the existing 21ideas show URL. Only safe HTTPS show URLs
render; homepages are rejected except Boost Me Bitch's `/?podcast={uuid}` show format on its own
host. Show links are independent of RSS readiness; episode-specific external URLs are deferred.
Fountain and Boost Me Bitch have inline Tabler Bolt badges with a Lightning-capability tooltip on
hover, focus and tap. These describe the app, not our payment setup; Fountain support copy still
requires explicitly verified payments. YouTube is deferred. `PodcastApps.astro` shares these links
between the landing page and digest pages.
`PodcastFeed.astro` provides text/audio RSS copy actions styled like the homepage subscription
buttons; failed copying reveals a selectable URL, and success/failure is announced accessibly.
