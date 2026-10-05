// src/lib/podcast.mjs — pure builder for the podcast RSS feed (/podcast.xml). Consumes the episode
// map from the ONE audio loader (src/lib/audio.mjs — all sidecar validation, URL trust and identity
// de-duplication live there, not here) and the published digest entries the route maps from the
// content collection. No astro:* imports, no I/O, no clock: the same inputs give the same bytes, so
// scripts/podcast.test.mjs can pin the output against a fixture.
//
// Show notes follow the publication-card contract shared with the bot's Telegram card and OG cover:
// brand, the Russian date label (with year), the digest's capitalized `description` teaser verbatim,
// then the canonical digest URL and the support line. Both URLs are assembled here from the trusted
// show config — never taken from digest text.

import { SITE_NAME } from '../site-identity.mjs';
import { selfHostedArchive, renderArchivedEpisode } from './podcast-archive.mjs';

/** @typedef {import('./podcast-config.mjs').PodcastShow} PodcastShow */
/** @typedef {import('./audio.mjs').AudioEpisode} AudioEpisode */
/** @typedef {{ id: string, title: string, description: string, dateLabel: string, draft?: boolean }} PodcastDigest */
/** @typedef {{ digest: PodcastDigest, episode: AudioEpisode }} PodcastItem */

export const PODCAST_BRAND = SITE_NAME;
export const PODCAST_FEED_PATH = '/podcast.xml';
export const PODCAST_FEED_PARAM = 'podcast'; // [feed].xml.js → /podcast.xml

const EPISODE_ID = /^\d{4}-\d{2}-\d{2}$/;
const LANGUAGE = /^[a-z]{2}(?:-[a-z]{2})?$/i;
const SHOW_GUID = /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const EPISODE_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const LIGHTNING_ADDRESS = /^[a-z0-9._+-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;.]+(?:\.[^\s@<>"',;.]+)+$/;
// Characters XML 1.0 forbids outright (C0 controls except tab/LF/CR, lone surrogates, U+FFFE/U+FFFF).
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const XML_ENTITIES = /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' });

/** Escape text for an XML element or attribute value; XML-illegal characters are dropped. @param {unknown} s */
export const escapeXml = (s) => String(s ?? '').replace(XML_ILLEGAL, '').replace(/[&<>"']/g, (c) => XML_ENTITIES[c]);

/** @param {unknown} v */
const filled = (v) => typeof v === 'string' && v.trim() !== '';

/** @param {unknown} origin */
function isBareHttpsOrigin(origin) {
  if (typeof origin !== 'string') return false;
  try {
    const u = new URL(origin);
    return u.protocol === 'https:' && u.origin === origin;
  } catch {
    return false;
  }
}

/** HTTPS JPEG/PNG cover that is not the 1200×630 OG card. @param {unknown} url */
function isCoverUrl(url) {
  if (typeof url !== 'string' || /[\s\u0000-\u001f\u007f]/.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && /\.(?:jpe?g|png)$/i.test(u.pathname) && !u.pathname.startsWith('/og/');
  } catch {
    return false;
  }
}

/** Validate the existing keysend routing before publishing it. @param {unknown} value */
function isArchiveValue(value) {
  const v = /** @type {import('./podcast-config.mjs').ArchiveValue | null} */ (value);
  return !!v && v.type === 'lightning' && v.method === 'keysend'
    && typeof v.suggested === 'string' && /^0\.\d{1,16}$/.test(v.suggested) && Number(v.suggested) > 0
    && Array.isArray(v.recipients) && v.recipients.length > 0
    && v.recipients.every((r) => r && filled(r.name) && r.type === 'node'
      && typeof r.address === 'string' && /^(?:02|03)[a-f0-9]{64}$/i.test(r.address)
      && Number.isSafeInteger(r.split) && r.split > 0
      && (r.fee === undefined || typeof r.fee === 'boolean')
      && ((r.customKey === undefined && r.customValue === undefined)
        || (typeof r.customKey === 'string' && /^\d+$/.test(r.customKey) && filled(r.customValue))));
}

/** Archive default or book-specific override. @param {import('./podcast-config.mjs').ArchiveValue} value @param {string} indent */
function archiveValueXml(value, indent = '    ') {
  return [
    `${indent}<podcast:value type="lightning" method="keysend" suggested="${escapeXml(value.suggested)}">`,
    ...value.recipients.map((r) => {
      const custom = r.customKey === undefined ? '' : ` customKey="${escapeXml(r.customKey)}" customValue="${escapeXml(r.customValue)}"`;
      const fee = r.fee === undefined ? '' : ` fee="${r.fee}"`;
      return `${indent}  <podcast:valueRecipient name="${escapeXml(r.name)}" type="node" address="${escapeXml(r.address)}" split="${r.split}"${custom}${fee}/>`;
    }),
    `${indent}</podcast:value>`,
  ].join('\n');
}

/**
 * Which show-identity fields are missing or untrusted. The feed is published and advertised only
 * when `complete` is true. Never throws.
 * @param {Partial<PodcastShow> | undefined} show
 * @returns {{ complete: boolean, missing: string[] }}
 */
export function podcastShowStatus(show) {
  const s = show ?? {};
  /** @type {[string, boolean][]} */
  const checks = [
    ['siteOrigin', isBareHttpsOrigin(s.siteOrigin)],
    ['title', filled(s.title)],
    ['description', filled(s.description)],
    ['language', typeof s.language === 'string' && LANGUAGE.test(s.language)],
    ['author', filled(s.author)],
    ['ownerName', filled(s.ownerName)],
    ['ownerEmail', typeof s.ownerEmail === 'string' && EMAIL.test(s.ownerEmail)],
    ['category', filled(s.category)],
    ['imageUrl', isCoverUrl(s.imageUrl)],
    ['episodeImageUrl', s.episodeImageUrl === undefined || isCoverUrl(s.episodeImageUrl)],
    ['guid', s.guid === undefined || (typeof s.guid === 'string' && SHOW_GUID.test(s.guid))],
    ['archiveValue', s.archiveValue === undefined || isArchiveValue(s.archiveValue)],
    ['archiveValueOverrides', s.archiveValueOverrides === undefined || (s.archiveValue !== undefined
      && s.archiveValueOverrides !== null && typeof s.archiveValueOverrides === 'object' && !Array.isArray(s.archiveValueOverrides)
      && Object.entries(s.archiveValueOverrides).every(([guid, value]) => EPISODE_UUID.test(guid) && isArchiveValue(value)))],
    ['dailyLightningAddress', s.dailyLightningAddress === undefined || (typeof s.dailyLightningAddress === 'string' && LIGHTNING_ADDRESS.test(s.dailyLightningAddress))],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([key]) => key);
  return { complete: missing.length === 0, missing };
}

/** getStaticPaths() for src/pages/[feed].xml.js: no path (no file) until the show is complete. @param {Partial<PodcastShow> | undefined} show */
export const podcastFeedPaths = (show) => (podcastShowStatus(show).complete ? [{ params: { feed: PODCAST_FEED_PARAM } }] : []);

/** @param {string} siteOrigin @param {string} episodeId */
export function digestUrl(siteOrigin, episodeId) {
  if (!isBareHttpsOrigin(siteOrigin) || !EPISODE_ID.test(episodeId)) throw new Error('podcast: untrusted digest URL input');
  return `${siteOrigin}/digests/${episodeId}/`;
}

/** @param {string} siteOrigin */
export const supportUrl = (siteOrigin) => `${siteOrigin}/support/`;

const SUPPORT_LEAD = `Поддержите создание «${PODCAST_BRAND}»:`;

/** Teaser as one line (the bot writes it capitalized; it is not rewritten). @param {unknown} s */
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Plain-text show notes; paragraphs separated by blank lines.
 * @param {{ siteOrigin: string, episodeId: string, dateLabel: string, teaser: string }} opts
 */
export function showNotes({ siteOrigin, episodeId, dateLabel, teaser }) {
  const t = oneLine(teaser);
  return [
    `${PODCAST_BRAND} — ${oneLine(dateLabel)}`,
    ...(t ? [t] : []),
    `Текстовая версия со ссылками на источники:\n${digestUrl(siteOrigin, episodeId)}`,
    `${SUPPORT_LEAD}\n${supportUrl(siteOrigin)}`,
  ].join('\n\n');
}

/**
 * HTML variant of the same notes (<content:encoded>); every link shows its full URL as its text.
 * @param {{ siteOrigin: string, episodeId: string, dateLabel: string, teaser: string }} opts
 */
export function showNotesHtml({ siteOrigin, episodeId, dateLabel, teaser }) {
  const t = oneLine(teaser);
  const link = (/** @type {string} */ url) => `<a href="${escapeXml(url)}">${escapeXml(url)}</a>`;
  return [
    `<p>${escapeXml(PODCAST_BRAND)} — ${escapeXml(oneLine(dateLabel))}</p>`,
    ...(t ? [`<p>${escapeXml(t)}</p>`] : []),
    `<p>Текстовая версия со ссылками на источники:<br>${link(digestUrl(siteOrigin, episodeId))}</p>`,
    `<p>${escapeXml(SUPPORT_LEAD)}<br>${link(supportUrl(siteOrigin))}</p>`,
  ].join('');
}

/**
 * Published (non-draft) digests that have their own validated audio episode, newest first
 * (publishedAt, then episode id — independent of input order).
 * @param {{ digests: PodcastDigest[], audio: Map<string, AudioEpisode> }} opts
 * @returns {PodcastItem[]}
 */
export function podcastEpisodes({ digests, audio }) {
  /** @type {PodcastItem[]} */
  const items = [];
  for (const digest of digests) {
    if (digest.draft || !EPISODE_ID.test(digest.id)) continue;
    const episode = audio.get(digest.id);
    if (!episode || episode.episodeId !== digest.id) continue;
    items.push({ digest, episode });
  }
  const key = (/** @type {PodcastItem} */ i) => Date.parse(i.episode.publishedAt);
  return items.sort((a, b) => key(b) - key(a) || (a.digest.id < b.digest.id ? 1 : a.digest.id > b.digest.id ? -1 : 0));
}

/**
 * The full podcast RSS 2.0 + iTunes document, or null when the show identity is incomplete.
 * @param {{ show: Partial<PodcastShow> | undefined, digests: PodcastDigest[], audio: Map<string, AudioEpisode>, archive?: import('./podcast-archive.mjs').PodcastArchive, archiveMedia?: import('./podcast-archive.mjs').ArchiveMediaManifest }} opts
 * @returns {string | null}
 */
export function renderPodcastFeed({ show, digests, audio, archive, archiveMedia }) {
  if (!show || !podcastShowStatus(show).complete) return null;
  const s = /** @type {PodcastShow} */ (show);
  const historical = selfHostedArchive(archive, archiveMedia);
  const current = podcastEpisodes({ digests, audio });
  const guids = new Set(historical.map((e) => e.guid));
  const urls = new Set(historical.map((e) => e.enclosure.url));
  for (const { episode } of current) {
    if (guids.has(episode.guid) || urls.has(episode.url)) throw new Error('podcast archive: duplicate identity with daily episode');
    guids.add(episode.guid); urls.add(episode.url);
  }
  const items = current.map(({ digest, episode }) => {
    const notes = { siteOrigin: s.siteOrigin, episodeId: digest.id, dateLabel: digest.dateLabel, teaser: digest.description };
    return [
      '    <item>',
      `      <title>${escapeXml(digest.title)}</title>`,
      `      <link>${escapeXml(digestUrl(s.siteOrigin, digest.id))}</link>`,
      `      <guid isPermaLink="false">${escapeXml(episode.guid)}</guid>`,
      `      <pubDate>${new Date(episode.publishedAt).toUTCString()}</pubDate>`,
      `      <description>${escapeXml(showNotes(notes))}</description>`,
      `      <content:encoded>${escapeXml(showNotesHtml(notes))}</content:encoded>`,
      `      <enclosure url="${escapeXml(episode.url)}" length="${episode.byteLength}" type="${escapeXml(episode.mimeType)}"/>`,
      `      <itunes:duration>${Math.max(1, Math.round(episode.durationSeconds))}</itunes:duration>`,
      ...(s.episodeImageUrl ? [`      <itunes:image href="${escapeXml(s.episodeImageUrl)}"/>`] : []),
      '      <itunes:episodeType>full</itunes:episodeType>',
      '      <itunes:explicit>false</itunes:explicit>',
      ...(s.dailyLightningAddress ? [
        '      <podcast:value type="lightning" method="lnaddress">',
        `        <podcast:valueRecipient name="${escapeXml(PODCAST_BRAND)}" type="lnaddress" address="${escapeXml(s.dailyLightningAddress)}" split="100"/>`,
        '      </podcast:value>',
      ] : []),
      '    </item>',
    ].join('\n');
  });
  const ordered = [
    ...items.map((xml, i) => ({ xml, publishedAt: Date.parse(current[i].episode.publishedAt), guid: current[i].episode.guid })),
    ...historical.map((e) => {
      const override = s.archiveValueOverrides && Object.hasOwn(s.archiveValueOverrides, e.guid) ? s.archiveValueOverrides[e.guid] : undefined;
      return { xml: renderArchivedEpisode(e, escapeXml, override ? archiveValueXml(override, '      ') : undefined), publishedAt: Date.parse(e.pubDate), guid: e.guid };
    }),
  ].sort((a, b) => b.publishedAt - a.publishedAt || (a.guid < b.guid ? 1 : a.guid > b.guid ? -1 : 0));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:podcast="https://podcastindex.org/namespace/1.0">',
    historical.length ? '  <channel xmlns:dc="http://purl.org/dc/elements/1.1/">' : '  <channel>',
    `    <title>${escapeXml(s.title)}</title>`,
    `    <link>${escapeXml(`${s.siteOrigin}/`)}</link>`,
    `    <description>${escapeXml(s.description)}</description>`,
    `    <language>${escapeXml(s.language)}</language>`,
    `    <atom:link href="${escapeXml(`${s.siteOrigin}${PODCAST_FEED_PATH}`)}" rel="self" type="application/rss+xml"/>`,
    ...(s.guid ? [`    <podcast:guid>${escapeXml(s.guid)}</podcast:guid>`] : []),
    `    <podcast:funding url="${escapeXml(supportUrl(s.siteOrigin))}">Поддержать подкаст</podcast:funding>`,
    ...(s.archiveValue ? [archiveValueXml(s.archiveValue)] : []),
    `    <itunes:author>${escapeXml(s.author)}</itunes:author>`,
    '    <itunes:owner>',
    `      <itunes:name>${escapeXml(s.ownerName)}</itunes:name>`,
    `      <itunes:email>${escapeXml(s.ownerEmail)}</itunes:email>`,
    '    </itunes:owner>',
    `    <itunes:image href="${escapeXml(s.imageUrl)}"/>`,
    `    <itunes:category text="${escapeXml(s.category)}"/>`,
    '    <itunes:explicit>false</itunes:explicit>',
    '    <itunes:type>episodic</itunes:type>',
    ...ordered.map((i) => i.xml),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
