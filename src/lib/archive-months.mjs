/** @template {{ data: { pubDate: Date } }} T @param {T[]} posts */
export function archiveMonths(posts) {
  /** @type {Map<string, { key: string; posts: T[] }>} */
  const months = new Map();
  for (const post of [...posts].sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())) {
    const key = post.data.pubDate.toISOString().slice(0, 7);
    const group = months.get(key);
    if (group) group.posts.push(post);
    else months.set(key, { key, posts: [post] });
  }
  return [...months.values()];
}

const monthName = (key, locale) => new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ru-RU', {
  month: 'long', timeZone: 'UTC',
}).format(new Date(`${key}-01T00:00:00Z`));

/** @param {string} key @param {'ru' | 'en'} [locale] @param {number} [referenceYear] */
export function archiveMonthLabel(key, locale = 'ru', referenceYear = new Date(Date.now()).getUTCFullYear()) {
  const name = monthName(key, locale);
  return key.slice(0, 4) === String(referenceYear) ? name : `${name} ${key.slice(2, 4)}`;
}

/** @param {string} key @param {'ru' | 'en'} [locale] */
export function archiveMonthTitle(key, locale = 'ru') {
  return `${monthName(key, locale)} ${key.slice(0, 4)}`;
}
