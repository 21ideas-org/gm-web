// Offline tests for the audio-sidecar loader (src/lib/audio.mjs). Every case builds a throwaway
// digests/ + audio/ tree in a temp dir from synthetic fixtures — no MP3 is fetched or read, and no
// production media host is contacted. Run: `npm test` or `node --test scripts/audio.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  AUDIO_MEDIA_ORIGIN,
  audioGuid,
  checkAudioUrl,
  expectedAudioUrl,
  formatAudioDuration,
  formatAudioSize,
  isoDuration,
  loadAudioEpisodes,
  parseAudioRecord,
} from '../src/lib/audio.mjs';

const FIXT = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'audio');
const DIGEST_BYTES = readFileSync(join(FIXT, '2026-10-04.md'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const MP3_HASH = sha256('synthetic mp3 bytes — never fetched');
const ORIGIN = 'https://media.fixture.test';

/** A valid v1 record for `episodeId` whose digest hash matches `digestBytes`. */
function record(episodeId = '2026-10-04', digestBytes = DIGEST_BYTES, over = {}) {
  const hash = over.sha256 ?? MP3_HASH;
  return {
    version: 1,
    episodeId,
    guid: `gm-audio:${episodeId}`,
    publishedAt: `${episodeId}T05:00:00Z`,
    coveredDate: '2026-10-03',
    digestSha256: sha256(digestBytes),
    url: `${ORIGIN}/podcasts/${episodeId}/${hash}.mp3`,
    mimeType: 'audio/mpeg',
    byteLength: 4855585,
    durationSeconds: 303.4,
    sha256: hash,
    ...over,
  };
}

/**
 * Lays out a site tree: `digests` maps episode id → Markdown bytes; `sidecars` maps a file name →
 * an object (JSON-serialized) or a raw string written verbatim. Returns a loader run over it.
 */
function site({ digests = { '2026-10-04': DIGEST_BYTES }, sidecars = {}, noAudioDir = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gm-audio-'));
  const digestsDir = join(root, 'digests');
  const audioDir = join(root, 'audio');
  mkdirSync(digestsDir);
  if (!noAudioDir) mkdirSync(audioDir);
  for (const [id, bytes] of Object.entries(digests)) writeFileSync(join(digestsDir, `${id}.md`), bytes);
  for (const [name, body] of Object.entries(sidecars)) {
    writeFileSync(join(audioDir, name), typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  }
  const logs = [];
  const result = loadAudioEpisodes({ audioDir, digestsDir, mediaOrigin: ORIGIN, log: (l) => logs.push(l) });
  return { ...result, logs };
}

// ── Valid record ─────────────────────────────────────────────────────────────

test('valid matching record is exposed as a normalized episode', () => {
  const { episodes, status, logs } = site({ sidecars: { '2026-10-04.json': record() } });
  assert.deepEqual([...episodes.keys()], ['2026-10-04']);
  assert.deepEqual(episodes.get('2026-10-04'), {
    episodeId: '2026-10-04',
    guid: 'gm-audio:2026-10-04',
    publishedAt: '2026-10-04T05:00:00Z',
    coveredDate: '2026-10-03',
    digestSha256: sha256(DIGEST_BYTES),
    url: `${ORIGIN}/podcasts/2026-10-04/${MP3_HASH}.mp3`,
    mimeType: 'audio/mpeg',
    byteLength: 4855585,
    durationSeconds: 303.4,
    sha256: MP3_HASH,
  });
  assert.deepEqual(status, { files: 1, valid: 1, skipped: 0, reasons: [] });
  assert.deepEqual(logs, ['[audio] sidecars ok=1 skipped=0']);
});

test('unknown extra fields are tolerated but not exposed', () => {
  const { episodes } = site({ sidecars: { '2026-10-04.json': record(undefined, undefined, { extra: 'x' }) } });
  assert.equal(episodes.get('2026-10-04')?.['extra'], undefined);
  assert.equal(episodes.size, 1);
});

test('digest hash is over the original Markdown bytes (BOM + CRLF kept, not normalized text)', () => {
  const raw = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(DIGEST_BYTES.toString('utf8').replace(/\n/g, '\r\n'))]);
  const normalized = Buffer.from(raw.toString('utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n'));
  const ok = site({ digests: { '2026-10-04': raw }, sidecars: { '2026-10-04.json': record('2026-10-04', raw) } });
  assert.equal(ok.episodes.size, 1);
  const bad = site({ digests: { '2026-10-04': raw }, sidecars: { '2026-10-04.json': record('2026-10-04', normalized) } });
  assert.equal(bad.episodes.size, 0);
  assert.deepEqual(bad.status.reasons, ['digest_hash_mismatch']);
});

// ── Missing / orphaned / unreadable ──────────────────────────────────────────

test('missing audio directory or no sidecars: empty, silent, never throws', () => {
  const a = site({ noAudioDir: true });
  assert.equal(a.episodes.size, 0);
  assert.deepEqual(a.logs, []);
  const b = site();
  assert.equal(b.episodes.size, 0);
  assert.deepEqual(b.logs, []);
});

test('non-JSON files in the audio directory are ignored', () => {
  const { episodes, status, logs } = site({ sidecars: { '.gitkeep': '', 'README.md': '# notes' } });
  assert.equal(episodes.size, 0);
  assert.equal(status.files, 0);
  assert.deepEqual(logs, []);
});

test('orphan record (no matching digest Markdown) is skipped with a diagnostic', () => {
  const { episodes, status, logs } = site({ digests: {}, sidecars: { '2026-10-04.json': record() } });
  assert.equal(episodes.size, 0);
  assert.deepEqual(status.reasons, ['orphan']);
  assert.ok(logs.includes('[audio] skip 2026-10-04.json: orphan'));
  assert.ok(logs.includes('[audio] sidecars ok=0 skipped=1'));
});

test('bad JSON is skipped; a valid sibling still loads', () => {
  const other = Buffer.from(DIGEST_BYTES.toString('utf8').replace('4 октября', '5 октября'));
  const { episodes, status, logs } = site({
    digests: { '2026-10-04': DIGEST_BYTES, '2026-10-05': other },
    sidecars: {
      '2026-10-04.json': readFileSync(join(FIXT, 'bad-json.json'), 'utf8'),
      '2026-10-05.json': record('2026-10-05', other, { coveredDate: '2026-10-04' }),
    },
  });
  assert.deepEqual([...episodes.keys()], ['2026-10-05']);
  assert.deepEqual(status.reasons, ['bad_json']);
  assert.ok(logs.includes('[audio] skip 2026-10-04.json: bad_json'));
});

test('non-object JSON and oversized files are skipped', () => {
  const r = site({ sidecars: { '2026-10-04.json': '[1, 2, 3]' } });
  assert.deepEqual(r.status.reasons, ['not_object']);
  const big = site({ sidecars: { '2026-10-04.json': JSON.stringify({ ...record(), pad: 'x'.repeat(70_000) }) } });
  assert.deepEqual(big.status.reasons, ['too_large']);
});

test('invalid sidecar file names are skipped without echoing the name', () => {
  const { episodes, status, logs } = site({
    sidecars: { 'latest.json': record(), '2026-13-01.json': record(), '2026-10-4.json': record() },
  });
  assert.equal(episodes.size, 0);
  assert.deepEqual(status.reasons, ['bad_filename']);
  assert.equal(status.skipped, 3);
  assert.ok(logs.every((l) => !l.includes('latest')));
});

// ── Field validation (pure) ──────────────────────────────────────────────────

const ctx = { episodeId: '2026-10-04', digestSha256: sha256(DIGEST_BYTES), mediaOrigin: ORIGIN };
const reason = (over, omit) => {
  const r = record(undefined, undefined, over);
  if (omit) delete r[omit];
  const res = parseAudioRecord(r, ctx);
  return res.ok ? 'ok' : res.reason;
};

test('every v1 field is required', () => {
  for (const f of ['version', 'episodeId', 'guid', 'publishedAt', 'coveredDate', 'digestSha256', 'url', 'mimeType', 'byteLength', 'durationSeconds', 'sha256']) {
    assert.notEqual(reason({}, f), 'ok', `missing ${f} must be rejected`);
  }
  assert.equal(reason({}), 'ok');
});

test('version and mime type must be supported', () => {
  assert.equal(reason({ version: 2 }), 'version');
  assert.equal(reason({ version: '1' }), 'version');
  assert.equal(reason({ mimeType: 'audio/ogg' }), 'mime_type');
  assert.equal(reason({ mimeType: 'AUDIO/MPEG' }), 'mime_type');
});

test('identity: episode id must match file name and guid must be the stable v1 guid', () => {
  assert.equal(reason({ episodeId: '2026-10-05' }), 'episode_mismatch');
  assert.equal(reason({ guid: 'gm-audio:2026-10-05' }), 'guid');
  assert.equal(reason({ guid: 'https://gm.21ideas.org/digests/2026-10-04/' }), 'guid');
  assert.equal(audioGuid('2026-10-04'), 'gm-audio:2026-10-04');
});

test('dates: real UTC publication instant and a real covered date before the episode', () => {
  assert.equal(reason({ publishedAt: '2026-10-04' }), 'published_at');
  assert.equal(reason({ publishedAt: '2026-10-04T05:00:00+04:00' }), 'published_at');
  assert.equal(reason({ publishedAt: '2026-02-30T05:00:00Z' }), 'published_at');
  assert.equal(reason({ publishedAt: 1759554000000 }), 'published_at');
  assert.equal(reason({ publishedAt: '2026-10-04T05:00:00.123Z' }), 'ok');
  assert.equal(reason({ coveredDate: '2026-10-32' }), 'covered_date');
  assert.equal(reason({ coveredDate: '2026-10-04' }), 'covered_date');
  assert.equal(reason({ coveredDate: '2026-10-05' }), 'covered_date');
  assert.equal(reason({ coveredDate: '2026-10-02' }), 'ok');
});

test('byte length and duration must be positive numbers of the right kind', () => {
  for (const v of [0, -1, 1.5, '4855585', Number.NaN, 2 ** 53]) assert.equal(reason({ byteLength: v }), 'byte_length', String(v));
  for (const v of [0, -3, '303.4', Number.POSITIVE_INFINITY, null]) assert.equal(reason({ durationSeconds: v }), 'duration', String(v));
});

test('hashes must be 64 lowercase hex characters; digest hash must match the Markdown bytes', () => {
  assert.equal(reason({ sha256: MP3_HASH.toUpperCase(), url: expectedAudioUrl(ORIGIN, '2026-10-04', MP3_HASH.toUpperCase()) }), 'sha256');
  assert.equal(reason({ sha256: 'abc' }), 'sha256');
  assert.equal(reason({ digestSha256: 'not-a-hash' }), 'digest_sha256');
  assert.equal(reason({ digestSha256: sha256('other digest') }), 'digest_hash_mismatch');
});

// ── URL trust ────────────────────────────────────────────────────────────────

test('media URL must be exactly <origin>/podcasts/<episodeId>/<sha256>.mp3', () => {
  const ok = `${ORIGIN}/podcasts/2026-10-04/${MP3_HASH}.mp3`;
  const opts = { origin: ORIGIN, episodeId: '2026-10-04', sha256: MP3_HASH };
  assert.equal(checkAudioUrl(ok, opts), null);
  assert.equal(expectedAudioUrl(ORIGIN, '2026-10-04', MP3_HASH), ok);

  const cases = {
    url_origin: [
      `https://evil.test/podcasts/2026-10-04/${MP3_HASH}.mp3`,
      `http://media.fixture.test/podcasts/2026-10-04/${MP3_HASH}.mp3`,
      `https://media.fixture.test:8443/podcasts/2026-10-04/${MP3_HASH}.mp3`,
      `https://media.fixture.test.evil.test/podcasts/2026-10-04/${MP3_HASH}.mp3`,
    ],
    url_credentials: [`https://user:pw@media.fixture.test/podcasts/2026-10-04/${MP3_HASH}.mp3`, `https://user@media.fixture.test/podcasts/2026-10-04/${MP3_HASH}.mp3`],
    url_query: [`${ok}?x=1`, `${ok}?`],
    url_fragment: [`${ok}#t=10`, `${ok}#`],
    url_path: [
      `${ORIGIN}/podcasts/2026-10-05/${MP3_HASH}.mp3`,
      `${ORIGIN}/podcasts/2026-10-04/${sha256('other')}.mp3`,
      `${ORIGIN}/podcasts/x/../2026-10-04/${MP3_HASH}.mp3`,
      `${ORIGIN}/podcasts/2026-10-04/%2e%2e/2026-10-04/${MP3_HASH}.mp3`,
      `${ORIGIN}/media/2026-10-04/${MP3_HASH}.mp3`,
      `${ORIGIN}/podcasts/2026-10-04/${MP3_HASH}.MP3`,
      `${ORIGIN}//podcasts/2026-10-04/${MP3_HASH}.mp3`,
      `${ORIGIN}/podcasts\\2026-10-04\\${MP3_HASH}.mp3`,
    ],
    url_invalid: ['not a url', '', ` ${ok}`, `/podcasts/2026-10-04/${MP3_HASH}.mp3`],
  };
  for (const [code, urls] of Object.entries(cases)) {
    for (const u of urls) assert.equal(checkAudioUrl(u, opts), code, u);
  }
  assert.equal(checkAudioUrl(42, opts), 'url_invalid');
});

test('the configured origin must itself be a bare HTTPS origin', () => {
  const url = `http://media.fixture.test/podcasts/2026-10-04/${MP3_HASH}.mp3`;
  assert.equal(checkAudioUrl(url, { origin: 'http://media.fixture.test', episodeId: '2026-10-04', sha256: MP3_HASH }), 'config_origin');
  assert.equal(checkAudioUrl(url, { origin: 'https://media.fixture.test/base', episodeId: '2026-10-04', sha256: MP3_HASH }), 'config_origin');
});

test('the approved production origin is the default', () => {
  assert.equal(AUDIO_MEDIA_ORIGIN, 'https://gm.21ideas.org');
  const res = parseAudioRecord(
    record(undefined, undefined, { url: `https://gm.21ideas.org/podcasts/2026-10-04/${MP3_HASH}.mp3` }),
    { episodeId: '2026-10-04', digestSha256: sha256(DIGEST_BYTES) },
  );
  assert.equal(res.ok, true);
  assert.equal(parseAudioRecord(record(), { episodeId: '2026-10-04', digestSha256: sha256(DIGEST_BYTES) }).ok, false);
});

// ── Unique identity across records ───────────────────────────────────────────

test('conflicting identity (same MP3 hash on two episodes) rejects both', () => {
  const other = Buffer.from(DIGEST_BYTES.toString('utf8').replace('4 октября', '5 октября'));
  const { episodes, status } = site({
    digests: { '2026-10-04': DIGEST_BYTES, '2026-10-05': other },
    sidecars: {
      '2026-10-04.json': record(),
      '2026-10-05.json': record('2026-10-05', other, { coveredDate: '2026-10-04' }),
    },
  });
  assert.equal(episodes.size, 0);
  assert.deepEqual(status.reasons, ['duplicate_identity']);
  assert.equal(status.skipped, 2);
});

test('mismatched record (sidecar for another episode under this name) is skipped', () => {
  const { episodes, status } = site({ sidecars: { '2026-10-04.json': record('2026-10-05') } });
  assert.equal(episodes.size, 0);
  assert.deepEqual(status.reasons, ['episode_mismatch']);
});

// ── Display helpers ──────────────────────────────────────────────────────────

test('duration formatting for the player label and machine-readable datetime', () => {
  assert.equal(formatAudioDuration(303.4), '5:03');
  assert.equal(formatAudioDuration(59.6), '1:00');
  assert.equal(formatAudioDuration(3723), '1:02:03');
  assert.equal(isoDuration(303.4), 'PT5M3S');
  assert.equal(isoDuration(3723), 'PT1H2M3S');
  assert.equal(formatAudioSize(4855585), '4,6 МБ');
});
