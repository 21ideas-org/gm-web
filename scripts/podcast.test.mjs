// Offline tests for the podcast feed builder (src/lib/podcast.mjs). Episodes come from the shared
// audio-sidecar loader run over a throwaway digests/ + audio/ tree — no MP3 is fetched or read and
// no media host or podcast directory is contacted. Run: `npm test` or `node --test scripts/podcast.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadAudioEpisodes } from '../src/lib/audio.mjs';
import {
  PODCAST_BRAND,
  escapeXml,
  podcastEpisodes,
  podcastFeedPaths,
  podcastShowStatus,
  renderPodcastFeed,
  showNotes,
} from '../src/lib/podcast.mjs';
import { PODCAST_SHOW } from '../src/lib/podcast-config.mjs';

const FIXT = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'podcast');
const EXPECTED_FEED = readFileSync(join(FIXT, 'feed.xml'), 'utf8');
const MEDIA = 'https://media.fixture.test';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const md = (id) => `---\ntitle: "Доброе утро, биткоинер"\npubDate: ${id}\n---\n\nФикстура ${id}.\n`;

/** A complete show identity (fixture-only contact/artwork, never a real address). */
const SHOW = Object.freeze({
  siteOrigin: 'https://gm.21ideas.org',
  title: 'Доброе утро, биткоинер',
  description: 'Биткоин-онли дайджесты & <новости>',
  language: 'ru',
  author: 'Доброе утро, биткоинер',
  ownerName: 'Доброе утро, биткоинер',
  ownerEmail: 'podcast@example.test',
  category: 'News',
  imageUrl: 'https://cdn.fixture.test/cover-3000.jpg',
});

const HOSTILE_TEASER = `Цена > $100 000 & <b>«рост»</b> "кавычки" 'апостроф' ]]> конец\u0007`;

/** A valid v1 sidecar for `id` matching the Markdown bytes `md(id)`. */
function record(id, over = {}) {
  const hash = over.sha256 ?? id.slice(-1).repeat(64);
  return {
    version: 1,
    episodeId: id,
    guid: `gm-audio:${id}`,
    publishedAt: `${id}T05:00:00Z`,
    coveredDate: '2026-09-01',
    digestSha256: sha256(md(id)),
    url: `${MEDIA}/podcasts/${id}/${hash}.mp3`,
    mimeType: 'audio/mpeg',
    byteLength: 1000,
    durationSeconds: 60,
    sha256: hash,
    ...over,
  };
}

/** Lays out digests + sidecars in a temp dir and returns the shared loader's episode map. */
function loadAudio({ digests, sidecars }) {
  const root = mkdtempSync(join(tmpdir(), 'gm-podcast-'));
  mkdirSync(join(root, 'digests'));
  mkdirSync(join(root, 'audio'));
  for (const [id, bytes] of Object.entries(digests)) writeFileSync(join(root, 'digests', `${id}.md`), bytes);
  for (const [name, body] of Object.entries(sidecars)) {
    writeFileSync(join(root, 'audio', name), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return loadAudioEpisodes({
    audioDir: join(root, 'audio'),
    digestsDir: join(root, 'digests'),
    mediaOrigin: MEDIA,
    log: () => {},
  }).episodes;
}

/** Collection-shaped digest entries, as the route maps them (`dateLabel` = formatRuDate(pubDate)). */
const digest = (id, dateLabel, description, draft = false) => ({
  id,
  title: `Доброе утро, биткоинер — ${dateLabel}`,
  description,
  dateLabel,
  draft,
});

// The fixture scenario: two good episodes plus every kind of record that must not become an item.
function scenario() {
  const ids = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'];
  const digests = Object.fromEntries(ids.map((id) => [id, md(id)]));
  const audio = loadAudio({
    digests,
    sidecars: {
      '2026-10-04.json': record('2026-10-04', { sha256: '4'.repeat(64), byteLength: 4855585, durationSeconds: 303.4 }),
      '2026-10-03.json': record('2026-10-03', {
        sha256: '3'.repeat(64),
        publishedAt: '2026-10-03T05:00:12.5Z',
        byteLength: 12000000,
        durationSeconds: 1799.6,
      }),
      '2026-10-05.json': record('2026-10-05'), // valid audio, but the digest is a draft
      '2026-10-07.json': record('2026-10-07'), // orphan: no digest Markdown
      '2026-10-02.json': record('2026-10-02', { digestSha256: 'f'.repeat(64) }), // digest bytes mismatch
      '2026-10-01.json': '{ not json', // bad sidecar
      '2026-09-30.json': record('2026-09-30', { mimeType: 'audio/ogg' }), // invalid field
      '2026-09-29.json': record('2026-09-29', { sha256: '9'.repeat(64) }), // duplicate MP3 identity…
      '2026-09-28.json': record('2026-09-28', { sha256: '9'.repeat(64) }), // …with this one
      // 2026-10-06 is published but has no sidecar at all
    },
  });
  const entries = [
    digest('2026-10-03', '3 октября 2026', 'Майнеры продают меньше, а сеть растёт'),
    digest('2026-10-04', '4 октября 2026', HOSTILE_TEASER),
    digest('2026-10-05', '5 октября 2026', 'Черновик', true),
    digest('2026-10-06', '6 октября 2026', 'Без аудио'),
    digest('2026-10-02', '2 октября 2026', 'Хэш не совпал'),
    digest('2026-10-01', '1 октября 2026', 'Битый JSON'),
    digest('2026-09-30', '30 сентября 2026', 'Неверный тип'),
    digest('2026-09-29', '29 сентября 2026', 'Дубликат'),
    digest('2026-09-28', '28 сентября 2026', 'Дубликат'),
  ];
  return { audio, digests: entries };
}

// ── Feed output ──────────────────────────────────────────────────────────────

test('configured feed matches the fixture byte-for-byte (formatting, order, escaping)', () => {
  const { audio, digests } = scenario();
  assert.equal(renderPodcastFeed({ show: SHOW, digests, audio }), EXPECTED_FEED);
});

test('drafts, missing, orphan, mismatched, invalid, bad-JSON and duplicate audio never become items', () => {
  const { audio, digests } = scenario();
  const ids = podcastEpisodes({ digests, audio }).map((e) => e.digest.id);
  assert.deepEqual(ids, ['2026-10-04', '2026-10-03']);
  const xml = renderPodcastFeed({ show: SHOW, digests, audio });
  for (const id of ['2026-10-07', '2026-10-06', '2026-10-05', '2026-10-02', '2026-10-01', '2026-09-30', '2026-09-29', '2026-09-28']) {
    assert.ok(!xml.includes(id), `${id} leaked into the feed`);
  }
  assert.equal(xml.match(/<item>/g).length, 2);
  assert.equal(xml.match(/<enclosure /g).length, 2);
});

test('an episode needs both a published digest and its own audio record', () => {
  const audio = loadAudio({ digests: { '2026-10-04': md('2026-10-04') }, sidecars: { '2026-10-04.json': record('2026-10-04') } });
  assert.equal(podcastEpisodes({ digests: [], audio }).length, 0);
  assert.equal(podcastEpisodes({ digests: [digest('2026-10-04', '4 октября 2026', 'x', true)], audio }).length, 0);
  // A map entry keyed under another digest id is never trusted for this one.
  const swapped = new Map([['2026-10-05', audio.get('2026-10-04')]]);
  assert.equal(podcastEpisodes({ digests: [digest('2026-10-05', '5 октября 2026', 'x')], audio: swapped }).length, 0);
});

test('GUIDs and enclosure URLs are stable and unique; timestamps and sizes come from the sidecar', () => {
  const a = scenario();
  const b = scenario();
  const first = renderPodcastFeed({ show: SHOW, digests: a.digests, audio: a.audio });
  const second = renderPodcastFeed({ show: SHOW, digests: [...b.digests].reverse(), audio: b.audio });
  assert.equal(first, second, 'input order must not change the output');
  const guids = [...first.matchAll(/<guid isPermaLink="false">([^<]+)<\/guid>/g)].map((m) => m[1]);
  assert.deepEqual(guids, ['gm-audio:2026-10-04', 'gm-audio:2026-10-03']);
  const urls = [...first.matchAll(/<enclosure url="([^"]+)" length="(\d+)" type="audio\/mpeg"\/>/g)];
  assert.equal(new Set(urls.map((m) => m[1])).size, 2);
  assert.ok(urls.every((m) => m[1].startsWith(`${MEDIA}/podcasts/`)));
  assert.deepEqual(urls.map((m) => m[2]), ['4855585', '12000000']);
  assert.match(first, /<pubDate>Sat, 03 Oct 2026 05:00:12 GMT<\/pubDate>/);
});

test('hostile digest text cannot break out of XML', () => {
  const audio = loadAudio({ digests: { '2026-10-04': md('2026-10-04') }, sidecars: { '2026-10-04.json': record('2026-10-04') } });
  const evil = { ...digest('2026-10-04', '4 октября 2026', HOSTILE_TEASER), title: '</title><item>x</item>&\u0000￾' };
  const xml = renderPodcastFeed({ show: SHOW, digests: [evil], audio });
  assert.ok(!xml.includes('<b>') && !xml.includes(']]>') && !xml.includes('<item>x'));
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/.test(xml), 'no XML-illegal characters');
  assert.ok(!/&(?!(?:amp|lt|gt|quot|apos);)/.test(xml), 'every ampersand starts an entity');
  assert.match(xml, /<title>&lt;\/title&gt;&lt;item&gt;x&lt;\/item&gt;&amp;<\/title>/);
});

test('escapeXml escapes markup and drops XML-illegal characters', () => {
  assert.equal(escapeXml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
  assert.equal(escapeXml('a\u0000b\u0008c\td\ne￿\uD800f'), 'abc\td\nef');
});

// ── Show notes ───────────────────────────────────────────────────────────────

test('show notes: brand, dated label with year, teaser, canonical digest URL, then the support line', () => {
  const notes = showNotes({ siteOrigin: SHOW.siteOrigin, episodeId: '2026-10-04', dateLabel: '4 октября 2026', teaser: 'Биткоин снова растёт' });
  assert.equal(
    notes,
    [
      'Доброе утро, биткоинер',
      '4 октября 2026',
      '',
      'Биткоин снова растёт',
      '',
      'https://gm.21ideas.org/digests/2026-10-04/',
      '',
      'Поддержите создание «Доброе утро, биткоинер»: https://gm.21ideas.org/support/',
    ].join('\n'),
  );
  assert.equal(PODCAST_BRAND, 'Доброе утро, биткоинер');
  assert.ok(!/обменник|buy-bitcoin|exchange/i.test(notes));
});

test('show-note URLs are built from trusted config, never from digest text', () => {
  const notes = showNotes({
    siteOrigin: SHOW.siteOrigin,
    episodeId: '2026-10-04',
    dateLabel: '4 октября 2026',
    teaser: 'Смотрите https://evil.example/digests/2026-10-04/',
  });
  const lines = notes.split('\n');
  assert.equal(lines[5], 'https://gm.21ideas.org/digests/2026-10-04/');
  assert.equal(lines.at(-1), 'Поддержите создание «Доброе утро, биткоинер»: https://gm.21ideas.org/support/');
  assert.throws(() => showNotes({ siteOrigin: SHOW.siteOrigin, episodeId: '../x', dateLabel: 'x', teaser: 'x' }));
});

// ── Show configuration / rollout ─────────────────────────────────────────────

test('complete fixture config advertises exactly one /podcast.xml path', () => {
  assert.deepEqual(podcastShowStatus(SHOW), { complete: true, missing: [] });
  assert.deepEqual(podcastFeedPaths(SHOW), [{ params: { feed: 'podcast' } }]);
});

test('the committed config is incomplete until rollout: no feed, no path, no throw', () => {
  const status = podcastShowStatus(PODCAST_SHOW);
  assert.equal(status.complete, false);
  assert.ok(status.missing.includes('imageUrl') && status.missing.includes('ownerEmail'));
  assert.deepEqual(podcastFeedPaths(PODCAST_SHOW), []);
  const { audio, digests } = scenario();
  assert.equal(renderPodcastFeed({ show: PODCAST_SHOW, digests, audio }), null);
  assert.equal(PODCAST_SHOW.title, PODCAST_BRAND);
  assert.equal(PODCAST_SHOW.siteOrigin, 'https://gm.21ideas.org');
});

test('incomplete or untrusted show identity keeps the feed unadvertised', () => {
  const bad = {
    title: '',
    description: ' ',
    language: 'русский',
    author: undefined,
    ownerName: '',
    ownerEmail: 'not-an-email',
    category: '',
    imageUrl: 'http://cdn.fixture.test/cover.jpg',
    siteOrigin: 'https://gm.21ideas.org/path',
  };
  for (const [key, value] of Object.entries(bad)) {
    const status = podcastShowStatus({ ...SHOW, [key]: value });
    assert.deepEqual(status, { complete: false, missing: [key] }, key);
    assert.deepEqual(podcastFeedPaths({ ...SHOW, [key]: value }), [], key);
  }
  // The 1200×630 OG card is not a podcast cover.
  assert.deepEqual(podcastShowStatus({ ...SHOW, imageUrl: 'https://gm.21ideas.org/og/default.png' }).missing, ['imageUrl']);
  assert.deepEqual(podcastShowStatus(undefined).complete, false);
});
