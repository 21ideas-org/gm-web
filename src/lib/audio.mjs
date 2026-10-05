// src/lib/audio.mjs — build-time only. Reads the per-episode audio sidecars src/data/audio/{episodeId}.json
// (v1 contract, written by the bot; MP3s live on the dedicated audio host, never in Git) and returns the
// normalized episodes whose record matches a digest Markdown file byte-for-byte. The ONE shared
// loader for the digest-page player and any later podcast-feed consumer. Pure ESM (no astro:*
// imports) so scripts/audio.test.mjs can drive it offline. MP3s are never fetched or read.
//
// FAIL-SOFT / NEVER-THROWS. Digest pages share the bot's publish build lane, so a missing directory,
// unreadable file, bad JSON, invalid field, untrusted URL, orphan (no matching digest) or mismatched
// record only hides that episode's player. Diagnostics are `[audio] …` stderr lines carrying the
// sidecar file name (when it is a well-formed episode name) and a fixed reason code — never record
// contents. Consumers look episodes up by published (non-draft) digest id; a record for a draft is
// loaded but simply never looked up.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * @typedef {{
 *   episodeId: string,
 *   guid: string,
 *   publishedAt: string,
 *   coveredDate: string,
 *   digestSha256: string,
 *   mediaVersion: number,
 *   url: string,
 *   mimeType: string,
 *   byteLength: number,
 *   durationSeconds: number,
 *   sha256: string,
 * }} AudioEpisode
 */
/** @typedef {{ files: number, valid: number, skipped: number, reasons: string[] }} AudioStatus */
/** @typedef {{ episodes: Map<string, AudioEpisode>, status: AudioStatus }} AudioResult */
/** @typedef {{ ok: true, episode: AudioEpisode } | { ok: false, reason: string }} AudioParse */

export const AUDIO_RECORD_VERSION = 1;
// Approved public media origin + path prefix; the final URL is {origin}/podcasts/{episodeId}.mp3, or
// {origin}/podcasts/{episodeId}-v{N}.mp3 (N ≥ 2) for a later distinct take of the same day. The MP3 host
// is separate from this GitHub Pages site. Change the origin here (or pass `mediaOrigin`) — it must stay
// a bare HTTPS origin.
export const AUDIO_MEDIA_ORIGIN = 'https://audio.21ideas.org';
export const AUDIO_MEDIA_PATH_PREFIX = '/podcasts/';
export const AUDIO_MIME_TYPES = Object.freeze(['audio/mpeg']);
export const AUDIO_GUID_PREFIX = 'gm-audio:';
export const AUDIO_DATA_DIR = 'src/data/audio';
export const DIGESTS_DIR = 'src/content/digests';
const MAX_SIDECAR_BYTES = 64 * 1024; // a v1 record is well under 1 KiB

const SHA256_HEX = /^[0-9a-f]{64}$/;
const SIDECAR_NAME = /^(\d{4}-\d{2}-\d{2})\.json$/;

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

// Strict "YYYY-MM-DD" that is a real calendar day.
/** @param {unknown} v @returns {v is string} */
function isCalendarDay(v) {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return t.toISOString().slice(0, 10) === v;
}

// Strict UTC instant "YYYY-MM-DDTHH:MM:SS[.sss]Z" that round-trips (rejects 2026-02-30, 24:00, offsets).
/** @param {unknown} v @returns {v is string} */
function isUtcInstant(v) {
  if (typeof v !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)) return false;
  const t = Date.parse(v);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 19) === v.slice(0, 19);
}

/** @param {string} episodeId */
export const audioGuid = (episodeId) => `${AUDIO_GUID_PREFIX}${episodeId}`;

// The media file version: 1 is the plain date name, N ≥ 2 a later distinct take ("-vN", never padded).
/** @param {unknown} v @returns {v is number} */
const isMediaVersion = (v) => Number.isSafeInteger(v) && /** @type {number} */ (v) >= 1;

/** @param {string} origin @param {string} episodeId @param {number} mediaVersion */
export const expectedAudioUrl = (origin, episodeId, mediaVersion) =>
  `${origin}${AUDIO_MEDIA_PATH_PREFIX}${episodeId}${mediaVersion === 1 ? '' : `-v${mediaVersion}`}.mp3`;

/** @param {string} origin */
function isBareHttpsOrigin(origin) {
  try {
    const u = new URL(origin);
    return u.protocol === 'https:' && u.origin === origin;
  } catch {
    return false;
  }
}

/**
 * Trust check for a record's media URL: it must equal exactly {origin}/podcasts/{episodeId}.mp3
 * (mediaVersion 1) or {origin}/podcasts/{episodeId}-v{mediaVersion}.mp3. Returns null when trusted,
 * else a reason code. The exact-string comparison is the real gate (it also rejects dot segments,
 * percent-encoding, backslashes, case/port variants, zero-padded or mismatched versions); the earlier
 * steps only pick a precise diagnostic.
 * @param {unknown} url
 * @param {{ origin: string, episodeId: string, mediaVersion: unknown }} opts
 * @returns {string | null}
 */
export function checkAudioUrl(url, { origin, episodeId, mediaVersion }) {
  if (!isBareHttpsOrigin(origin)) return 'config_origin';
  if (typeof url !== 'string' || /[\s\u0000-\u001f\u007f]/.test(url)) return 'url_invalid';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'url_invalid';
  }
  if (parsed.username || parsed.password || /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(url)) return 'url_credentials';
  if (parsed.origin !== origin) return 'url_origin';
  if (parsed.search || url.includes('?')) return 'url_query';
  if (parsed.hash || url.includes('#')) return 'url_fragment';
  if (!isCalendarDay(episodeId) || !isMediaVersion(mediaVersion)) return 'url_path';
  return url === expectedAudioUrl(origin, episodeId, mediaVersion) ? null : 'url_path';
}

/**
 * Validate one parsed sidecar against its file-name episode id and the sha256 of the digest
 * Markdown bytes (null when no digest exists → orphan). Pure; never throws.
 * @param {unknown} raw
 * @param {{ episodeId: string, digestSha256: string | null, mediaOrigin?: string }} ctx
 * @returns {AudioParse}
 */
export function parseAudioRecord(raw, { episodeId, digestSha256, mediaOrigin = AUDIO_MEDIA_ORIGIN }) {
  const fail = (/** @type {string} */ reason) => /** @type {AudioParse} */ ({ ok: false, reason });
  if (!isObject(raw)) return fail('not_object');
  if (raw.version !== AUDIO_RECORD_VERSION) return fail('version');
  if (!isCalendarDay(raw.episodeId)) return fail('episode_id');
  if (raw.episodeId !== episodeId) return fail('episode_mismatch');
  if (raw.guid !== audioGuid(episodeId)) return fail('guid');
  if (!isUtcInstant(raw.publishedAt)) return fail('published_at');
  // Publication and covered dates are distinct; the digest covers an earlier day.
  if (!isCalendarDay(raw.coveredDate) || raw.coveredDate >= episodeId) return fail('covered_date');
  if (typeof raw.digestSha256 !== 'string' || !SHA256_HEX.test(raw.digestSha256)) return fail('digest_sha256');
  if (typeof raw.mimeType !== 'string' || !AUDIO_MIME_TYPES.includes(raw.mimeType)) return fail('mime_type');
  if (!Number.isSafeInteger(raw.byteLength) || /** @type {number} */ (raw.byteLength) <= 0) return fail('byte_length');
  if (typeof raw.durationSeconds !== 'number' || !Number.isFinite(raw.durationSeconds) || raw.durationSeconds <= 0) {
    return fail('duration');
  }
  if (typeof raw.sha256 !== 'string' || !SHA256_HEX.test(raw.sha256)) return fail('sha256');
  // Which file of the day the URL names; the MP3 hash above stays integrity metadata, not the name.
  if (!isMediaVersion(raw.mediaVersion)) return fail('media_version');
  const urlReason = checkAudioUrl(raw.url, { origin: mediaOrigin, episodeId, mediaVersion: raw.mediaVersion });
  if (urlReason) return fail(urlReason);
  if (digestSha256 === null) return fail('orphan');
  if (raw.digestSha256 !== digestSha256) return fail('digest_hash_mismatch');
  return {
    ok: true,
    episode: {
      episodeId,
      guid: raw.guid,
      publishedAt: raw.publishedAt,
      coveredDate: raw.coveredDate,
      digestSha256: raw.digestSha256,
      mediaVersion: raw.mediaVersion,
      url: /** @type {string} */ (raw.url),
      mimeType: raw.mimeType,
      byteLength: /** @type {number} */ (raw.byteLength),
      durationSeconds: raw.durationSeconds,
      sha256: raw.sha256,
    },
  };
}

/** @param {unknown} err */
const isMissing = (err) => isObject(err) && (err.code === 'ENOENT' || err.code === 'ENOTDIR');

/**
 * Scan `audioDir` for {episodeId}.json sidecars and validate each against `digestsDir/{episodeId}.md`
 * (hashing the file's original bytes). Synchronous, never throws.
 * @param {{ audioDir: string, digestsDir: string, mediaOrigin?: string, log?: (line: string) => void }} opts
 * @returns {AudioResult}
 */
export function loadAudioEpisodes({ audioDir, digestsDir, mediaOrigin = AUDIO_MEDIA_ORIGIN, log = (l) => console.warn(l) }) {
  /** @type {Map<string, AudioEpisode>} */
  const episodes = new Map();
  /** @type {AudioStatus} */
  const status = { files: 0, valid: 0, skipped: 0, reasons: [] };
  const skip = (/** @type {string} */ label, /** @type {string} */ reason) => {
    status.skipped++;
    if (!status.reasons.includes(reason)) status.reasons.push(reason);
    log(`[audio] skip ${label}: ${reason}`);
  };

  let names;
  try {
    names = readdirSync(audioDir);
  } catch (err) {
    if (!isMissing(err)) log('[audio] sidecars unavailable: read_error');
    return { episodes, status };
  }

  for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
    status.files++;
    const m = SIDECAR_NAME.exec(name);
    if (!m || !isCalendarDay(m[1])) {
      skip('<invalid name>', 'bad_filename');
      continue;
    }
    const episodeId = m[1];
    let raw;
    try {
      const path = join(audioDir, name);
      const st = statSync(path);
      if (!st.isFile()) {
        skip(name, 'not_file');
        continue;
      }
      if (st.size > MAX_SIDECAR_BYTES) {
        skip(name, 'too_large');
        continue;
      }
      raw = readFileSync(path, 'utf8');
    } catch {
      skip(name, 'read_error');
      continue;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      skip(name, 'bad_json');
      continue;
    }
    /** @type {string | null} */
    let digestSha256 = null;
    try {
      digestSha256 = createHash('sha256').update(readFileSync(join(digestsDir, `${episodeId}.md`))).digest('hex');
    } catch (err) {
      if (!isMissing(err)) {
        skip(name, 'digest_unreadable');
        continue;
      }
    }
    const res = parseAudioRecord(data, { episodeId, digestSha256, mediaOrigin });
    if (res.ok) episodes.set(episodeId, res.episode);
    else skip(name, res.reason);
  }

  // Unique identity: a guid, URL or MP3 hash shared by two records is a conflict — neither is trusted.
  /** @type {Map<string, string[]>} */
  const owners = new Map();
  for (const e of episodes.values()) {
    for (const key of [`guid:${e.guid}`, `url:${e.url}`, `sha256:${e.sha256}`]) {
      owners.set(key, [...(owners.get(key) ?? []), e.episodeId]);
    }
  }
  const conflicted = new Set([...owners.values()].filter((ids) => ids.length > 1).flat());
  for (const id of [...conflicted].sort()) {
    episodes.delete(id);
    skip(`${id}.json`, 'duplicate_identity');
  }

  status.valid = episodes.size;
  if (status.files > 0) log(`[audio] sidecars ok=${status.valid} skipped=${status.skipped}`);
  return { episodes, status };
}

/** @type {AudioResult | undefined} */
let memo;

/** Memoized build-wide episodes from the repo's src/data/audio + src/content/digests. */
export function audioEpisodes() {
  memo ??= loadAudioEpisodes({
    audioDir: resolve(process.cwd(), AUDIO_DATA_DIR),
    digestsDir: resolve(process.cwd(), DIGESTS_DIR),
  });
  return memo.episodes;
}

/** @param {string} digestId @returns {AudioEpisode | undefined} */
export const audioForDigest = (digestId) => audioEpisodes().get(digestId);

/** 303.4 → "5:03", 3723 → "1:02:03" (rounded to whole seconds). @param {number} seconds */
export function formatAudioDuration(seconds) {
  const s = Math.round(seconds);
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** 303.4 → "PT5M3S" (for <time datetime>). @param {number} seconds */
export function isoDuration(seconds) {
  const s = Math.round(seconds);
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${sec || (!h && !m) ? `${sec}S` : ''}`;
}

/** 4855585 → "4,6 МБ" (Russian decimal comma). @param {number} bytes */
export function formatAudioSize(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`;
}
