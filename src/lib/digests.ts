import { getCollection } from 'astro:content';
import { eligibleEnglishEdition, publishedEditions } from './editions.mjs';
import { formatEditionDayMonth } from './date';
import type { Locale } from './locale';
export async function publishedDigests(locale: Locale) {
  const posts = publishedEditions(await getCollection(locale === 'en' ? 'digests-en' : 'digests'));
  return locale === 'en' ? posts.filter(post => eligibleEnglishEdition(post)) : posts;
}

export async function editionPaths(locale: Locale) {
  const posts = await publishedDigests(locale);
  const navLabel = (post: typeof posts[number]) => ({ id: post.id, label: formatEditionDayMonth(post.data.pubDate, locale) });
  return posts.map((post, i) => ({ params: { slug: post.id }, props: {
    post, locale,
    prevPost: posts[i + 1] ? navLabel(posts[i + 1]) : undefined,
    nextPost: posts[i - 1] ? navLabel(posts[i - 1]) : undefined,
  } }));
}
