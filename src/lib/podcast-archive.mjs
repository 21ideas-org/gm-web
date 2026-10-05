// The frozen historical snapshot retains original identity and media URLs for auditing.
// This path is separate from new digest sidecars: their trusted-media rules stay unchanged.

/** @typedef {{ title: string, description: string, link: string, guid: string, guidIsPermaLink: string, pubDate: string, enclosure: {url: string, length: string, type: string}, creator?: string, itunes: Record<string, string> }} ArchivedEpisode */
/** @typedef {{ version: number, episodes: ArchivedEpisode[] }} PodcastArchive */

const invalid = () => { throw new Error('podcast archive: invalid metadata'); };
/** @param {unknown} s */
const text = (s) => typeof s === 'string' && s.trim() !== '' && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(s);
/** @param {unknown} s */
function https(s) {
  if (!text(s)) return false;
  try { const u = new URL(/** @type {string} */ (s)); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}

/** Reject malformed or duplicate historical records instead of silently losing old episodes.
 * @param {PodcastArchive | undefined} archive
 * @returns {ArchivedEpisode[]}
 */
export function validatePodcastArchive(archive) {
  if (archive === undefined) return [];
  if (!archive || archive.version !== 1 || !Array.isArray(archive.episodes)) return invalid();
  const guids = new Set(); const urls = new Set();
  for (const e of archive.episodes) {
    if (!e || !text(e.title) || typeof e.description !== 'string' || !https(e.link) || !text(e.guid)
      || !['true', 'false'].includes(e.guidIsPermaLink) || !text(e.pubDate) || !Number.isFinite(Date.parse(e.pubDate))
      || !e.enclosure || !https(e.enclosure.url) || typeof e.enclosure.length !== 'string' || !/^[1-9]\d*$/.test(e.enclosure.length)
      || !Number.isSafeInteger(Number(e.enclosure.length)) || !['audio/mpeg', 'audio/x-m4a', 'audio/mp4'].includes(e.enclosure.type)
      || !e.itunes || typeof e.itunes !== 'object' || Array.isArray(e.itunes)) return invalid();
    if (guids.has(e.guid) || urls.has(e.enclosure.url)) throw new Error('podcast archive: duplicate identity');
    guids.add(e.guid); urls.add(e.enclosure.url);
    for (const [key, val] of Object.entries(e.itunes)) {
      if (!['summary', 'explicit', 'duration', 'episodeType', 'season', 'episode', 'imageUrl'].includes(key) || typeof val !== 'string') return invalid();
      if (key === 'imageUrl' && !https(val)) return invalid();
    }
    if (e.creator !== undefined && typeof e.creator !== 'string') return invalid();
  }
  return [...archive.episodes];
}

/** @param {ArchivedEpisode} item @param {(s: unknown) => string} escape */
export function renderArchivedEpisode(item, escape) {
  const lines = [
    '    <item>',
    `      <title>${escape(item.title)}</title>`,
    `      <description>${escape(item.description)}</description>`,
    `      <link>${escape(item.link)}</link>`,
    `      <guid isPermaLink="${item.guidIsPermaLink}">${escape(item.guid)}</guid>`,
    `      <pubDate>${escape(item.pubDate)}</pubDate>`,
    `      <enclosure url="${escape(item.enclosure.url)}" length="${item.enclosure.length}" type="${escape(item.enclosure.type)}"/>`,
  ];
  if (item.creator !== undefined) lines.push(`      <dc:creator>${escape(item.creator)}</dc:creator>`);
  for (const [key, value] of Object.entries(item.itunes)) {
    lines.push(key === 'imageUrl'
      ? `      <itunes:image href="${escape(value)}"/>`
      : `      <itunes:${key}>${escape(value)}</itunes:${key}>`);
  }
  return [...lines, '    </item>'].join('\n');
}

/** @typedef {{ guid: string, sourceUrl: string, url: string, byteLength: number, mimeType: string, sha256: string }} ArchiveMedia */
/** @typedef {{ version: number, episodes: ArchiveMedia[] }} ArchiveMediaManifest */

/** Apply a complete, verified media migration without modifying the frozen source snapshot.
 * Only enclosure URLs change; GUIDs and original enclosure lengths/types remain intact.
 * @param {PodcastArchive | undefined} archive
 * @param {ArchiveMediaManifest | undefined} media
 * @returns {ArchivedEpisode[]}
 */
export function selfHostedArchive(archive, media) {
  const episodes = validatePodcastArchive(archive);
  if (media === undefined) return episodes;
  const fail = () => { throw new Error('podcast archive media: invalid or incomplete mapping'); };
  if (!media || media.version !== 1 || !Array.isArray(media.episodes) || media.episodes.length !== episodes.length) return fail();
  const originals = new Map(episodes.map((e) => [e.guid, e]));
  const mapping = new Map(); const urls = new Set();
  for (const entry of media.episodes) {
    const original = entry && originals.get(entry.guid);
    if (!original || mapping.has(entry.guid) || urls.has(entry.url)
      || entry.sourceUrl !== original.enclosure.url || entry.byteLength !== Number(original.enclosure.length)
      || entry.mimeType !== original.enclosure.type || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || typeof entry.url !== 'string'
      || !/^https:\/\/audio\.21ideas\.org\/podcasts\/archive\/\d{4}-\d{2}-\d{2}(?:-v(?:[2-9]|[1-9]\d+))?\.(?:mp3|m4a)$/.test(entry.url)
      || !entry.url.endsWith(entry.mimeType === 'audio/mpeg' ? '.mp3' : '.m4a')) return fail();
    mapping.set(entry.guid, entry.url); urls.add(entry.url);
  }
  return episodes.map((episode) => ({ ...episode, enclosure: { ...episode.enclosure, url: mapping.get(episode.guid) } }));
}
