// Presentation of «Сегодня в истории» event references as source links (gm-bitcoiner#7). Pure, no I/O —
// the loader (history.mjs) passes references through verbatim; deciding what to link happens here.
// Mirrors the Calendar Telegram formatter (hostname label minus `www.`, Wayback snapshots labelled from
// the archived original + « (архив)», order and duplicates preserved), tightened to HTTP(S)-only:
// anything unparseable, non-HTTP(S), or an archive without a valid original is skipped, never thrown.

const ARCHIVE_HOST = 'web.archive.org';
// Snapshot detection runs on the raw text, like the bot: only the canonical `http(s)://web.archive.org/web/`
// prefix counts. Parser-equivalent forms (explicit port, user@, backslashes) stay ordinary links.
const ARCHIVE_PREFIX_RE = /^https?:\/\/web\.archive\.org\/web\//i;
const ARCHIVE_RE = /^https?:\/\/web\.archive\.org\/web\/[^/]*\/(https?:\/\/.+)$/i;

/** Parse an absolute http(s) URL with a hostname, or null. */
function httpUrl(s) {
  let url;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.hostname ? url : null;
}

const hostLabel = (url) => url.hostname.replace(/^www\./, '');

/**
 * references → [{ href, label }] in source order; invalid entries are dropped.
 * @param {unknown} references
 * @returns {{ href: string, label: string }[]}
 */
export function referenceLinks(references) {
  if (!Array.isArray(references)) return [];
  const links = [];
  for (const raw of references) {
    if (typeof raw !== 'string') continue;
    const href = raw.trim();
    const url = href && httpUrl(href);
    if (!url) continue;
    // Only the exact host is Wayback; lookalikes (web.archive.org.example.com) fall through as ordinary.
    if (url.hostname === ARCHIVE_HOST && ARCHIVE_PREFIX_RE.test(href)) {
      const original = httpUrl(ARCHIVE_RE.exec(href)?.[1] ?? '');
      if (original) links.push({ href, label: `${hostLabel(original)} (архив)` });
      continue;
    }
    links.push({ href, label: hostLabel(url) });
  }
  return links;
}

/**
 * The render model for one event: title, description paragraphs, and source links.
 * @param {{ title: string, description: string, references?: unknown }} event
 */
export function historyEventView(event) {
  return {
    title: event.title,
    // A single-paragraph description yields one paragraph.
    paragraphs: event.description.split(/\n{2,}/),
    sources: referenceLinks(event.references),
  };
}
