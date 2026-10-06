import { eligibleEnglishEdition } from '../../lib/editions.mjs';
import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { renderFeedContent } from '../../lib/feed.mjs';
import { EN_EDITION_PUBLIC } from '../../lib/locale';

export async function GET(context) {
	const posts = EN_EDITION_PUBLIC ? (await getCollection('digests-en', post => eligibleEnglishEdition(post)))
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()) : [];
	return rss({
		title: 'GM, bitcoiner',
		description: 'Daily Bitcoin-only news digest in English',
		site: new URL('en/', context.site),
		xmlns: { atom: 'http://www.w3.org/2005/Atom' },
		customData: `<language>en-US</language><atom:link href="${context.site}en/rss.xml" rel="self" type="application/rss+xml" />`,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate,
			link: `/en/digests/${post.id}/`,
			content: renderFeedContent(post.body ?? ''), // → <content:encoded>
			categories: post.data.tags,
		})),
	});
}
