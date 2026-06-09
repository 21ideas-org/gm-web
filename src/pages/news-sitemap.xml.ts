import { getCollection } from 'astro:content';

// Google News sitemap: ONLY digests from the last 48h (Google's hard rule —
// older URLs must drop out). Computed at build time; the daily rebuild keeps
// it fresh. An empty sitemap during a publishing gap yields a benign notice.
const SITE = 'https://gm.21ideas.org';
const PUB_NAME = 'Доброе утро, биткоинер'; // MUST equal the Google News Publisher Center display name

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET() {
	const cutoff = Date.now() - 48 * 3600 * 1000;
	const posts = (await getCollection('digests', (p) => !p.data.draft))
		.filter((p) => p.data.pubDate.valueOf() >= cutoff)
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

	const body = posts
		.map(
			(p) => `
  <url>
    <loc>${SITE}/digests/${p.id}/</loc>
    <news:news>
      <news:publication><news:name>${esc(PUB_NAME)}</news:name><news:language>ru</news:language></news:publication>
      <news:publication_date>${p.data.pubDate.toISOString()}</news:publication_date>
      <news:title>${esc(p.data.title)}</news:title>
    </news:news>
  </url>`,
		)
		.join('');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${body}
</urlset>`;

	return new Response(xml, {
		headers: { 'Content-Type': 'application/xml; charset=utf-8' },
	});
}
