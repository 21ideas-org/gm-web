import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { SITE_DESCRIPTION, SITE_NAME } from '../consts';

const md = new MarkdownIt();

// Digests use h2 headings, code blocks and (rarely) images; sanitize-html's
// defaults drop h1/h2/img — keep them so <content:encoded> carries the full text.
const clean = (html) =>
	sanitizeHtml(html, {
		allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'img']),
		allowedAttributes: {
			...sanitizeHtml.defaults.allowedAttributes,
			img: ['src', 'alt', 'title'],
		},
	});

export async function GET(context) {
	const posts = (await getCollection('digests', p => !p.data.draft))
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
	return rss({
		title: SITE_NAME,
		description: SITE_DESCRIPTION,
		site: context.site,
		xmlns: { atom: 'http://www.w3.org/2005/Atom' },
		customData: `<language>ru-ru</language><atom:link href="${context.site}rss.xml" rel="self" type="application/rss+xml" />`,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate,
			link: `/digests/${post.id}/`,
			content: clean(md.render(post.body ?? '')), // → <content:encoded>
			categories: post.data.tags,
		})),
	});
}
