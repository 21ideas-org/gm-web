// Shared publication and language-switch contract. No content-layer or environment imports.
/** @param {unknown} value */
export const editionPublic = (value) => value === 'true';

/** @param {any} post */
export function eligibleEdition(post) {
  if (!post || typeof post.id !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(post.id)) return false;
  const date = new Date(`${post.id}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === post.id &&
    post.data?.draft === false && post.data.pubDate instanceof Date &&
    Number.isFinite(post.data.pubDate.valueOf()) && post.data.pubDate.toISOString().slice(0, 10) === post.id;
}

/** @template {{ data: { pubDate: Date } }} T @param {T[]} posts @returns {T[]} */
export function publishedEditions(posts) {
  return posts.filter(eligibleEdition).sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** @param {'ru' | 'en'} locale @param {string} pathname @param {any[]} counterparts */
export function languageDestination(locale, pathname, counterparts) {
  const other = locale === 'en' ? 'ru' : 'en';
  const prefix = other === 'en' ? '/en' : '';
  const path = pathname.replace(/^\/en(?=\/|$)/, '').replace(/\/$/, '') || '/';
  const edition = /^\/digests\/([^/]+)$/.exec(path);
  if (edition) {
    const paired = counterparts.some(post => eligibleEdition(post) && post.id === edition[1]);
    return {
      href: paired ? `${prefix}/digests/${edition[1]}/` : `${prefix}/digests/`,
      label: `${other === 'en' ? 'English' : 'Russian'} ${paired ? 'edition' : 'archive'}`,
      locale: other,
    };
  }
  const destination = (['/', '/digests', '/about', '/support', '/tags'].includes(path) || /^\/tags\/(market|institutions|regulation|lightning|mining|tech|security|community|funds|scandals)$/.test(path)) ? path : '/';
  return { href: `${prefix}${destination === '/' ? '/' : `${destination}/`}`, label: other === 'en' ? 'English' : 'Russian', locale: other };
}

/** English scheduled previews remain private until their publication time. @param {any} post @param {number} [now] */
export function eligibleEnglishEdition(post, now = Date.now()) {
  return eligibleEdition(post) && post.data.pubDate.valueOf() <= now;
}
