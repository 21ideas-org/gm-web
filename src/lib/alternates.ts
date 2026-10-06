import { EN_EDITION_PUBLIC, type Locale } from './locale';
import { publishedDigests } from './digests';
import { buildTagIndex, HUB_MIN_ITEMS } from './tags';

// Metadata advertises a pair only when both pages are eligible for public discovery.
export async function pageAlternates(pathname: string) {
  if (!EN_EDITION_PUBLIC) return [];
  const path = pathname.replace(/^\/en(?=\/|$)/, '').replace(/\/$/, '') || '/';
  const edition = /^\/digests\/(\d{4}-\d{2}-\d{2})$/.exec(path);
  const hub = /^\/tags\/([^/]+)$/.exec(path);
  if (edition) {
    const posts = await Promise.all([publishedDigests('ru'), publishedDigests('en')]);
    if (!posts.every(list => list.some(p => p.id === edition[1]))) return [];
  } else if (hub) {
    const indexes = await Promise.all([buildTagIndex('ru'), buildTagIndex('en')]);
    if (!indexes.every(index => (index.get(hub[1])?.length ?? 0) >= HUB_MIN_ITEMS)) return [];
  } else if (!['/', '/digests', '/about', '/support', '/tags'].includes(path)) return [];
  return (['ru', 'en'] as Locale[]).map(locale => ({ locale,
    href: `${locale === 'en' ? '/en' : ''}${path === '/' ? '/' : `${path}/`}`,
  }));
}
