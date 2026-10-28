import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPodcastFeed } from '../src/lib/podcast.mjs';
import { PODCAST_SHOW } from '../src/lib/podcast-config.mjs';

const chapter = {
  number: 1, guid: '21ideas:book:sovereignty-through-math:chapter-1',
  title: 'Book chapter <one>', description: 'Paragraph one.\n\nQuote: <tag> & text.\n\nhttps://21ideas.org/chapter/',
  link: 'https://21ideas.org/chapter/', publishedAt: '2026-10-28T08:00:00Z', published: true,
  mediaVersion: 1, url: 'https://audio.21ideas.org/podcasts/books/sovereignty-through-math/chapter-01.mp3',
  mimeType: 'audio/mpeg', byteLength: 14212894, durationSeconds: 527.860771, sha256: 'a'.repeat(64),
};
const series = {
  id: 'sovereignty-through-math', title: 'Sovereignty Through Mathematics', author: 'Knut Svanholm',
  imageUrl: 'https://gm.21ideas.org/podcasts/books/sovereignty-through-math-cover-v1.png',
  recipients: [{ name: 'BitKorn', address: 'BitKorn@coinos.io', split: 21 }, { name: '21ideas', address: 'gmbitcoiner@coinos.io', split: 79 }],
  chapters: [chapter],
};
const catalog = { version: 1, series: [series] };
const render = (books = catalog, extra = {}) => renderPodcastFeed({
  show: PODCAST_SHOW, digests: [], audio: new Map(), books, asOf: Date.parse('2026-10-28T09:00:00Z'), ...extra,
});

test('a book chapter has its own cover, notes, measured enclosure and 21/79 Lightning Address split', () => {
  const xml = render();
  const item = xml.match(/<item>([\s\S]*?)<\/item>/)?.[1];
  assert.ok(item, 'approved chapter must appear in the feed');
  assert.ok(item.includes('<title>Book chapter &lt;one&gt;</title>'));
  assert.ok(item.includes(`<guid isPermaLink="false">${chapter.guid}</guid>`));
  assert.ok(item.includes(`url="${chapter.url}" length="14212894" type="audio/mpeg"`));
  assert.ok(item.includes('<itunes:duration>528</itunes:duration>'));
  assert.ok(item.includes(`<itunes:image href="${series.imageUrl}"/>`));
  assert.ok(item.includes('<itunes:episode>1</itunes:episode>'));
  assert.ok(item.includes('Quote: &lt;tag&gt; &amp; text.'));
  assert.ok(item.includes('<content:encoded>'));
  assert.ok(item.includes('method="lnaddress"'));
  assert.match(item, /address="BitKorn@coinos\.io" split="21"/);
  assert.match(item, /address="gmbitcoiner@coinos\.io" split="79"/);
  assert.equal((item.match(/<podcast:valueRecipient /g) ?? []).length, 2);
  assert.ok(!item.includes('fountain.fm'));
});

test('unreleased and future chapters remain outside RSS, including at rebuilds before release', () => {
  const future = { ...chapter, number: 2, guid: chapter.guid.replace('chapter-1', 'chapter-2'), url: chapter.url.replace('01.mp3', '02.mp3'), publishedAt: '2026-11-01T08:00:00Z' };
  const draft = { ...future, number: 3, guid: chapter.guid.replace('chapter-1', 'chapter-3'), url: chapter.url.replace('01.mp3', '03.mp3'), publishedAt: chapter.publishedAt, published: false };
  const books = { ...catalog, series: [{ ...series, chapters: [chapter, future, draft] }] };
  assert.equal((render(books).match(/<item>/g) ?? []).length, 1);
  assert.equal((render(books, { asOf: Date.parse(future.publishedAt) }).match(/<item>/g) ?? []).length, 2);
  assert.throws(() => render(books, { asOf: undefined }), /book/i);
});

test('bad destinations, shares, identity, media and duplicate chapters fail before publishing', () => {
  for (const over of [
    { recipients: [{ ...series.recipients[0], split: 20 }, series.recipients[1]] },
    { recipients: [{ ...series.recipients[0], address: 'not-an-address' }, series.recipients[1]] },
    { chapters: [chapter, chapter] },
    ...[{ guid: 'mutable-title' }, { url: chapter.url + '?token=secret' }, { sha256: 'bad' }, { number: 0 }, { publishedAt: '2026-02-30T00:00:00Z' }, { byteLength: 0 }, { durationSeconds: -1 }, { published: 'yes' }].map((change) => ({ chapters: [{ ...chapter, ...change }] })),
  ]) assert.throws(() => render({ ...catalog, series: [{ ...series, ...over }] }), /book/i);
  assert.throws(() => render({ ...catalog, series: [series, series] }), /book/i);
});

test('a book GUID cannot duplicate an existing archive identity', () => {
  const archive = { version: 1, episodes: [{ title: 'Existing', description: '', link: 'https://21ideas.org/existing/', guid: chapter.guid, guidIsPermaLink: 'false', pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT', enclosure: { url: 'https://audio.21ideas.org/existing.mp3', length: '123', type: 'audio/mpeg' }, itunes: {} }] };
  assert.throws(() => render(catalog, { archive }), /duplicate/i);
});

test('adding a chapter preserves existing daily item XML and uses publication time for mixed ordering', () => {
  const id = '2026-10-28';
  const extra = { digests: [{ id, title: 'Daily', dateLabel: '28 октября 2026', description: 'News' }], audio: new Map([[id, { episodeId: id, guid: `gm-audio:${id}`, publishedAt: '2026-10-28T05:00:00Z', url: `https://audio.21ideas.org/podcasts/${id}.mp3`, byteLength: 123, mimeType: 'audio/mpeg', durationSeconds: 20 }]]) };
  const baseline = render(catalog, { ...extra, books: undefined });
  const mixed = render(catalog, extra);
  assert.equal((mixed.match(/<item>/g) ?? []).length, 2);
  assert.ok(!baseline.includes(chapter.guid));
  const daily = baseline.match(/<item>[\s\S]*?<\/item>/)[0];
  assert.ok(mixed.includes(daily));
  assert.ok(mixed.indexOf(chapter.guid) < mixed.indexOf(`gm-audio:${id}`));
});
