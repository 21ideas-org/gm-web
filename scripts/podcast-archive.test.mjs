import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { renderPodcastFeed } from '../src/lib/podcast.mjs';
import { validatePodcastArchive } from '../src/lib/podcast-archive.mjs';
const archive = JSON.parse(readFileSync(new URL('../src/data/podcast/21ideas-archive.json', import.meta.url), 'utf8'));
const show = { siteOrigin: 'https://gm.21ideas.org', title: '21ideas', description: 'Bitcoin podcast', language: 'ru', author: 'Tony Lightning', ownerName: '21ideas', ownerEmail: 'podcast@example.test', category: 'Education', imageUrl: 'https://example.test/cover.jpg' };
const render = (a) => renderPodcastFeed({ show, digests: [], audio: new Map(), archive: a });
test('all 134 historical GUIDs, enclosures, dates and episode metadata survive the new feed', () => {
  assert.equal(validatePodcastArchive(archive).length, 134);
  const xml = render(archive);
  assert.equal((xml.match(/<item>/g) ?? []).length, 134);
  for (const item of archive.episodes) {
    assert.ok(xml.includes(`<guid isPermaLink="false">${item.guid}</guid>`));
    assert.ok(xml.includes(`url="${item.enclosure.url.replaceAll('&', '&amp;')}" length="${item.enclosure.length}" type="${item.enclosure.type}"`));
    assert.ok(xml.includes(`<pubDate>${item.pubDate}</pubDate>`));
    if (item.itunes.episode) assert.ok(xml.includes(`<itunes:episode>${item.itunes.episode}</itunes:episode>`));
  }
});
test('mixed feed includes new digest and full archive, sorted newest first', () => {
  const id = '2026-10-05';
  const xml = renderPodcastFeed({ show, archive, digests: [{ id, title: 'New daily digest', dateLabel: '5 октября 2026', description: 'Daily news' }], audio: new Map([[id, { episodeId: id, guid: `gm-audio:${id}`, publishedAt: `${id}T05:00:00Z`, url: `https://audio.21ideas.org/podcasts/${id}.mp3`, byteLength: 123, mimeType: 'audio/mpeg', durationSeconds: 12 }]]) });
  assert.equal((xml.match(/<item>/g) ?? []).length, 135);
  assert.ok(xml.indexOf('gm-audio:2026-10-05') < xml.indexOf(archive.episodes[0].guid));
});
test('duplicate GUIDs and URLs or invalid metadata fail explicitly rather than dropping archive entries', () => {
  const first = archive.episodes[0];
  assert.throws(() => render({ ...archive, episodes: [first, first] }), /duplicate/i);
  assert.throws(() => render({ ...archive, episodes: [first, { ...first, guid: 'different' }] }), /duplicate/i);
  assert.throws(() => render({ ...archive, episodes: [{ ...first, enclosure: { ...first.enclosure, url: 'javascript:alert(1)' } }] }), /archive/i);
  assert.throws(() => render({ ...archive, episodes: [{ ...first, pubDate: 'invalid' }] }), /archive/i);
});
test('archive XML escapes descriptions and title, keeps original season fields and optional creator', () => {
  const item = { ...archive.episodes[0], title: '<bad>&', description: '<p>Old show & notes</p>', creator: 'A & B', itunes: { ...archive.episodes[0].itunes, season: '2', episode: '4' } };
  const xml = render({ ...archive, episodes: [item] });
  assert.ok(xml.includes('<title>&lt;bad&gt;&amp;</title>'));
  assert.ok(xml.includes('&lt;p&gt;Old show &amp; notes&lt;/p&gt;'));
  assert.ok(xml.includes('<dc:creator>A &amp; B</dc:creator>'));
  assert.ok(xml.includes('<itunes:season>2</itunes:season>'));
});
test('incomplete show still stays unpublished even when historical archive exists', () => {
  assert.equal(renderPodcastFeed({ show: { ...show, ownerEmail: '' }, digests: [], audio: new Map(), archive }), null);
});

test('archive and daily episode identity collisions are rejected', () => {
  const id = '2026-10-05';
  const current = { episodeId: id, guid: archive.episodes[0].guid, publishedAt: `${id}T05:00:00Z`, url: `https://audio.21ideas.org/podcasts/${id}.mp3`, byteLength: 123, mimeType: 'audio/mpeg', durationSeconds: 12 };
  const opts = { show, archive, digests: [{ id, title: 'Daily', dateLabel: '5 октября 2026', description: 'News' }], audio: new Map([[id, current]]) };
  assert.throws(() => renderPodcastFeed(opts), /duplicate/i);
  assert.throws(() => renderPodcastFeed({ ...opts, audio: new Map([[id, { ...current, guid: 'new-guid', url: archive.episodes[0].enclosure.url }]]) }), /duplicate/i);
});

test('historical metadata stays identical to the source snapshot verified during migration', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(archive.episodes)).digest('hex'), '664914f85dd5037f636bf07d6a09d8c5b48b4e1b3a9bdbdf3c7f382e25fe25f5');
});
