import { buildTagIndex, TAGS, HUB_MIN_ITEMS } from '../lib/tags';

// Tag sitemap: the /tags index page + per-article hubs that clear HUB_MIN_ITEMS
// (thin hubs are noindex, so they must never appear here). lastmod = newest item
// in the hub. Mirrors news-sitemap.xml/yandex-news.xml as a standalone endpoint —
// the main sitemap stays tag-free (astro.config.mjs filter). Rebuilt daily as
// counts shift, so a hub crossing the floor enters the index on the next build.
const SITE = 'https://gm.21ideas.org';

export async function GET() {
	const idx = await buildTagIndex();
	const hubs = TAGS
		.map((t) => ({ t, items: idx.get(t.slug) ?? [] }))
		.filter(({ items }) => items.length >= HUB_MIN_ITEMS);

	const urls = hubs.map(({ t, items }) => {
		const lastmod = new Date(Math.max(...items.map((i) => i.date.valueOf()))).toISOString();
		return `  <url><loc>${SITE}/tags/${t.slug}/</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.5</priority></url>`;
	});

	// The /tags index is excluded from the main sitemap, so list it here — but only
	// once ≥1 hub qualifies, so the sitemap never points at a page of zero indexable links.
	if (hubs.length) {
		const newest = new Date(Math.max(...hubs.flatMap(({ items }) => items.map((i) => i.date.valueOf())))).toISOString();
		urls.unshift(`  <url><loc>${SITE}/tags/</loc><lastmod>${newest}</lastmod><changefreq>daily</changefreq><priority>0.4</priority></url>`);
	}

	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
	return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
