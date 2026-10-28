// Pure, validated book catalog. Audio is self-hosted outside Git; future chapters stay out of RSS.
/** @typedef {{ name: string, address: string, split: number }} BookRecipient */
/** @typedef {{ number: number, guid: string, title: string, description: string, link: string,
 * publishedAt: string, published: boolean, mediaVersion: number, url: string, mimeType: string,
 * byteLength: number, durationSeconds: number, sha256: string }} BookChapter */
/** @typedef {{ id: string, title: string, author: string, imageUrl: string,
 * recipients: BookRecipient[], chapters: BookChapter[] }} BookSeries */
/** @typedef {{ version: number, series: BookSeries[] }} BookCatalog */
/** @typedef {{ series: BookSeries, chapter: BookChapter }} BookEpisode */

const invalid = () => { throw new Error('podcast books: invalid catalog or publication cutoff'); };
/** @param {unknown} value */
const filled = (value) => typeof value === 'string' && value.trim() !== '';
/** @param {unknown} value */
function https(value) {
  if (typeof value !== 'string' || /[\s\u0000-\u001f]/.test(value)) return false;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
/** @param {string} value */
function utcInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
}

/** Validate every record, including drafts, before selecting approved chapters at the explicit cutoff.
 * @param {BookCatalog | undefined} catalog @param {number | undefined} asOf
 * @returns {BookEpisode[]}
 */
export function publishedBookEpisodes(catalog, asOf) {
  if (catalog === undefined) return [];
  if (!catalog || catalog.version !== 1 || !Array.isArray(catalog.series) || !Number.isFinite(asOf)) return invalid();
  const ids = new Set(); const guids = new Set(); const urls = new Set();
  /** @type {BookEpisode[]} */
  const episodes = [];
  for (const series of catalog.series) {
    if (!series || typeof series.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(series.id)
      || ids.has(series.id) || !filled(series.title) || !filled(series.author)
      || typeof series.imageUrl !== 'string' || !new RegExp(`^https://gm\\.21ideas\\.org/podcasts/books/${series.id}-cover-v[1-9]\\d*\\.(?:png|jpg)$`).test(series.imageUrl)
      || !Array.isArray(series.chapters) || !Array.isArray(series.recipients) || !series.recipients.length) return invalid();
    ids.add(series.id);
    const addresses = new Set();
    for (const r of series.recipients) {
      if (!r || !filled(r.name) || typeof r.address !== 'string'
        || !/^[a-z0-9._+-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(r.address)
        || addresses.has(r.address.toLowerCase()) || !Number.isSafeInteger(r.split) || r.split <= 0) return invalid();
      addresses.add(r.address.toLowerCase());
    }
    if (series.recipients.reduce((sum, r) => sum + r.split, 0) !== 100) return invalid();
    for (const chapter of series.chapters) {
      if (!chapter || !Number.isSafeInteger(chapter.number) || chapter.number < 1 || chapter.number > 999
        || chapter.guid !== `21ideas:book:${series.id}:chapter-${chapter.number}` || guids.has(chapter.guid)
        || !filled(chapter.title) || !filled(chapter.description) || !https(chapter.link) || !utcInstant(chapter.publishedAt)
        || typeof chapter.published !== 'boolean' || !Number.isSafeInteger(chapter.mediaVersion) || chapter.mediaVersion < 1
        || chapter.mimeType !== 'audio/mpeg' || !Number.isSafeInteger(chapter.byteLength) || chapter.byteLength <= 0
        || !Number.isFinite(chapter.durationSeconds) || chapter.durationSeconds <= 0
        || typeof chapter.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(chapter.sha256)) return invalid();
      const version = chapter.mediaVersion === 1 ? '' : `-v${chapter.mediaVersion}`;
      const expected = `https://audio.21ideas.org/podcasts/books/${series.id}/chapter-${String(chapter.number).padStart(2, '0')}${version}.mp3`;
      if (chapter.url !== expected || urls.has(chapter.url)) return invalid();
      guids.add(chapter.guid); urls.add(chapter.url);
      if (chapter.published && Date.parse(chapter.publishedAt) <= /** @type {number} */ (asOf)) episodes.push({ series, chapter });
    }
  }
  return episodes;
}

/** @param {BookEpisode} item @param {(value: unknown) => string} escape */
export function renderBookEpisode({ series, chapter: c }, escape) {
  const html = c.description.split(/\n\s*\n/).map((p) => {
    const content = escape(p).replace(/https:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`).replaceAll('\n', '<br>');
    return `<p>${content}</p>`;
  }).join('');
  return [
    '    <item>',
    `      <title>${escape(c.title)}</title>`,
    `      <link>${escape(c.link)}</link>`,
    `      <guid isPermaLink="false">${escape(c.guid)}</guid>`,
    `      <pubDate>${new Date(c.publishedAt).toUTCString()}</pubDate>`,
    `      <description>${escape(c.description)}</description>`,
    `      <content:encoded>${escape(html)}</content:encoded>`,
    `      <enclosure url="${escape(c.url)}" length="${c.byteLength}" type="audio/mpeg"/>`,
    `      <itunes:duration>${Math.max(1, Math.round(c.durationSeconds))}</itunes:duration>`,
    `      <itunes:image href="${escape(series.imageUrl)}"/>`,
    `      <itunes:author>${escape(series.author)}</itunes:author>`,
    `      <itunes:episode>${c.number}</itunes:episode>`,
    '      <itunes:episodeType>full</itunes:episodeType>',
    '      <itunes:explicit>false</itunes:explicit>',
    '      <podcast:value type="lightning" method="lnaddress">',
    ...series.recipients.map((r) => `        <podcast:valueRecipient name="${escape(r.name)}" type="lnaddress" address="${escape(r.address)}" split="${r.split}"/>`),
    '      </podcast:value>',
    '    </item>',
  ].join('\n');
}
