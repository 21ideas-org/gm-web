import test from 'node:test';
import assert from 'node:assert/strict';
import { listeningEpisodes } from '../src/lib/listen.mjs';

const post = (id, draft = false) => ({ id, data: { pubDate: new Date(`${id}T00:00:00Z`), draft } });

test('latest playable episode ignores newer text-only and draft digests and orphan audio', () => {
  const posts = [post('2026-10-04'), post('2026-10-03', true), post('2026-10-02'), post('2026-10-01')];
  const audio = new Map(['2026-10-03', '2026-10-02', '2026-10-01', '2026-09-30'].map(id => [id, { episodeId: id }]));
  assert.deepEqual(listeningEpisodes(posts, audio).map(e => e.post.id), ['2026-10-02', '2026-10-01']);
  assert.equal(posts[0].id, '2026-10-04');
});

test('missing or rejected audio produces an empty listening archive', () => {
  assert.deepEqual(listeningEpisodes([post('2026-10-04')], new Map()), []);
  assert.deepEqual(listeningEpisodes([post('2026-10-04')], new Map([['2026-10-04', { episodeId: '2026-10-03' }]])), []);
});

import { configuredPodcastApps, PODCAST_APPS } from '../src/lib/podcast-apps.mjs';

test('app registry hides empty/unsafe/homepage URLs and deferred services, and orders configured shows', () => {
  const app = id => PODCAST_APPS.find(app => app.id === id);
  const apps = [
    { ...app('spotify'), url: 'https://open.spotify.com/show/verified' },
    { ...app('fountain'), url: 'https://fountain.fm/show/verified' },
    { ...app('apple'), url: 'http://podcasts.apple.com/show/verified' },
    { ...app('boost-me-bitch'), url: 'https://boostmebitch.com/' },
    { ...app('boost-me-bitch'), url: 'https://user:pass@boostmebitch.com/show/verified' },
    { id: 'youtube', name: 'YouTube', url: 'https://youtube.com/show/verified', order: -1 },
  ];
  assert.deepEqual(configuredPodcastApps(apps).map(a => a.id), ['fountain', 'spotify']);
  assert.deepEqual(configuredPodcastApps(PODCAST_APPS.map(app => ({ ...app, url: '' }))), []);
});

const BOOST_URL = 'https://www.boostmebitch.com/?podcast=fbf0dca5-7cff-5518-a776-91ccda2b6612';

test('default registry renders the verified existing show URLs in order', () => {
  assert.deepEqual(configuredPodcastApps().map(({ id, url }) => [id, url]), [
    ['fountain', 'https://fountain.fm/show/chmjnVB1ZkSY3MC2FxY8'],
    ['spotify', 'https://open.spotify.com/show/1vjCoEDFPYaqKm3HasOZrK'],
    ['apple', 'https://podcasts.apple.com/ua/podcast/21ideas/id1584949114'],
    ['boost-me-bitch', BOOST_URL],
  ]);
  assert.equal(configuredPodcastApps().find(app => app.id === 'fountain').description, undefined);
});

test('Boost Me Bitch root URL requires its exact HTTPS host and a podcast UUID', () => {
  const boost = PODCAST_APPS.find(app => app.id === 'boost-me-bitch');
  const uuid = 'fbf0dca5-7cff-5518-a776-91ccda2b6612';
  const accepts = url => configuredPodcastApps([{ ...boost, url }]).length === 1;
  assert.equal(accepts(BOOST_URL), true);
  assert.equal(accepts(`https://boostmebitch.com/?podcast=${uuid}`), true);
  for (const url of [
    'https://www.boostmebitch.com/',
    'https://www.boostmebitch.com/?podcast=',
    'https://www.boostmebitch.com/?podcast',
    'https://www.boostmebitch.com/?podcast=not-a-uuid',
    `https://www.boostmebitch.com/?podcast=${uuid}x`,
    `https://www.boostmebitch.com/?podcast=${uuid}&podcast=${uuid}`,
    `https://www.boostmebitch.com/?episode=${uuid}`,
    'https://www.boostmebitch.com/?utm_source=x',
    `https://boostmebitch.com.example.org/?podcast=${uuid}`,
    `https://example.org/?podcast=${uuid}`,
    `https://cdn.boostmebitch.com/?podcast=${uuid}`,
    `http://www.boostmebitch.com/?podcast=${uuid}`,
    `javascript:alert(1)//www.boostmebitch.com/?podcast=${uuid}`,
    `https://user:pass@www.boostmebitch.com/?podcast=${uuid}`,
    `https://user@www.boostmebitch.com/?podcast=${uuid}`,
  ]) assert.equal(accepts(url), false, url);
  const fountain = PODCAST_APPS.find(app => app.id === 'fountain');
  assert.deepEqual(configuredPodcastApps([
    { ...fountain, url: `https://fountain.fm/?podcast=${uuid}` },
    { ...fountain, url: `https://www.boostmebitch.com/?podcast=${uuid}` },
    { id: 'youtube', name: 'YouTube', url: BOOST_URL, order: -1 },
  ]), []);
});

test('Lightning badges describe app capability independently of show payment setup', () => {
  const apps = PODCAST_APPS.map(app => ({ ...app, url: `https://example.org/shows/${app.id}` }));
  assert.deepEqual(configuredPodcastApps(apps).filter(app => app.lightning).map(app => app.id), ['fountain', 'boost-me-bitch']);
  assert.equal(configuredPodcastApps(apps).find(app => app.id === 'fountain').description, undefined);
});

test('Fountain support copy requires verified payments', () => {
  const app = { ...PODCAST_APPS[0], url: 'https://fountain.fm/show/verified', description: 'Слушай и поддерживай сатами' };
  assert.equal(configuredPodcastApps([app])[0].description, undefined);
  assert.equal(configuredPodcastApps([{ ...app, paymentsVerified: true }])[0].description, 'Слушай и поддерживай сатами');
});

import { listeningReady } from '../src/lib/listen.mjs';
test('all entry points require complete identity and any published playable episode', () => {
  assert.equal(listeningReady(false, 1), false);
  assert.equal(listeningReady(true, 0), false);
  assert.equal(listeningReady(false, 0), false);
  assert.equal(listeningReady(true, 1), true);
});

import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAudioEpisodes, expectedAudioUrl, audioGuid, AUDIO_MEDIA_ORIGIN } from '../src/lib/audio.mjs';
import { podcastShowStatus } from '../src/lib/podcast.mjs';
import { PODCAST_SHOW } from '../src/lib/podcast-config.mjs';

test('shared loader and listening selection reject invalid, mismatched, missing, draft and orphan fixture episodes', () => {
  const root = mkdtempSync(join(tmpdir(), 'gm-listen-'));
  const audioDir = join(root, 'audio');
  const digestsDir = join(root, 'digests');
  mkdirSync(audioDir); mkdirSync(digestsDir);
  const ids = ['2026-10-04', '2026-10-03', '2026-10-02', '2026-10-01', '2026-09-30', '2026-09-29'];
  try {
    for (const id of ids) {
      writeFileSync(join(digestsDir, `${id}.md`), `fixture ${id}`);
      if (id === '2026-10-04') continue; // newest digest is text only
      const sha256 = createHash('sha256').update(`audio ${id}`).digest('hex');
      const raw = {
        version: 1, episodeId: id, guid: audioGuid(id), publishedAt: `${id}T05:00:00Z`,
        coveredDate: new Date(Date.parse(`${id}T00:00:00Z`) - 86400000).toISOString().slice(0, 10),
        digestSha256: createHash('sha256').update(`fixture ${id}`).digest('hex'),
        mediaVersion: 1, url: expectedAudioUrl(AUDIO_MEDIA_ORIGIN, id, 1),
        mimeType: 'audio/mpeg', byteLength: 1234, durationSeconds: 60, sha256,
      };
      if (id === '2026-10-01') raw.digestSha256 = '0'.repeat(64);
      if (id === '2026-09-30') raw.durationSeconds = -1;
      writeFileSync(join(audioDir, `${id}.json`), JSON.stringify(raw));
      if (id === '2026-09-29') rmSync(join(digestsDir, `${id}.md`)); // orphan
    }
    const audio = loadAudioEpisodes({ audioDir, digestsDir, log() {} }).episodes;
    const posts = ids.map(id => post(id, id === '2026-10-03'));
    assert.deepEqual(listeningEpisodes(posts, audio).map(e => e.post.id), ['2026-10-02']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('readiness uses the existing RSS identity validator', () => {
  assert.equal(listeningReady(podcastShowStatus({ ...PODCAST_SHOW, ownerEmail: '' }).complete, 1), false);
  const show = { ...PODCAST_SHOW, ownerEmail: 'podcast@example.org', imageUrl: 'https://gm.21ideas.org/podcast-cover.png' };
  assert.equal(listeningReady(podcastShowStatus(show).complete, 1), true);
  assert.equal(listeningReady(podcastShowStatus(show).complete, 0), false);
});
