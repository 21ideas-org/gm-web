// Pure presentation for «Сегодня в истории»: use the stored Calendar permalink,
// never derive a slug or replace its date with the event's historical date.

/** @param {unknown} value @returns {string | null} */
export function calendarEventUrl(value) {
  if (typeof value !== 'string' || /[\\\u0000-\u001f\u007f]/u.test(value)) return null;
  const match = /^\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/$/.exec(value);
  if (!match) return null;
  const [, date, slug] = match;
  if (slug.trim() !== slug || slug === '.' || slug === '..') return null;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(2000, month - 1, day));
  parsed.setUTCFullYear(year);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  try {
    return `https://bitcoin-calendar.org/ru/events/${encodeURIComponent(date)}/${encodeURIComponent(slug)}`;
  } catch {
    return null; // Malformed Unicode must not break the digest build.
  }
}

/** @param {{ title: string, description: string, url_path?: unknown }} event */
export function historyEventView(event) {
  return {
    title: event.title,
    paragraphs: event.description.split(/\n{2,}/),
    eventUrl: calendarEventUrl(event.url_path),
  };
}
