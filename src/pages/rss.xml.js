import { eligibleEdition } from '../lib/editions.mjs';
import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { renderFeedContent } from '../lib/feed.mjs';
import { SITE_DESCRIPTION, SITE_NAME } from '../consts';

export async function GET(context) {
	const posts = (await getCollection('digests', eligibleEdition))
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
			content: renderFeedContent(post.body ?? ''), // → <content:encoded>
			categories: post.data.tags,
		})),
	});
}
