import { getCollection } from 'astro:content';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

// Yandex "Latest and most important news" RSS feed (Webmaster → Display in
// search → Upload feed). RSS 2.0 + xmlns:yandex, each item carries the COMPLETE
// digest text in <yandex:full-text>. Spec: title ≤200 chars, link ≤243 ASCII,
// pubDate RFC-822, feed ≤10 MB, channel updates ≥ weekly. See plans/seo.md §E.
const md = new MarkdownIt();
const SITE = 'https://gm.21ideas.org';

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Markdown digests use h2 headings, code blocks and (occasionally) images.
// sanitize-html's defaults drop h1/h2/img — keep them so the full text survives.
const clean = (html: string) =>
	sanitizeHtml(html, {
		allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'img']),
		allowedAttributes: {
			...sanitizeHtml.defaults.allowedAttributes,
			img: ['src', 'alt', 'title'],
		},
	});

export async function GET() {
	const posts = (await getCollection('digests', (p) => !p.data.draft))
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
		.slice(0, 50);

	const items = posts
		.map((p) => {
			const html = clean(md.render(p.body ?? ''));
			return `
    <item>
      <title>${esc(p.data.title)}</title>
      <link>${SITE}/digests/${p.id}/</link>
      <pubDate>${p.data.pubDate.toUTCString()}</pubDate>
      <yandex:full-text><![CDATA[${html}]]></yandex:full-text>
    </item>`;
		})
		.join('');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:yandex="http://news.yandex.ru" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Доброе утро, биткоинер</title>
    <link>${SITE}/</link>
    <description>Ежедневные биткоин-онли дайджесты на русском</description>
    <language>ru</language>${items}
  </channel>
</rss>`;

	return new Response(xml, {
		headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
	});
}
