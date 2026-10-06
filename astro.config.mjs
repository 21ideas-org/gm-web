// @ts-check

import sitemap, { ChangeFreqEnum } from '@astrojs/sitemap';
import { rehypeHeadingIds } from '@astrojs/markdown-remark';
import { defineConfig } from 'astro/config';
import { rehypeCodeCopy } from './src/plugins/rehype-code-copy.mjs';
import { rehypeBuyBitcoin } from './src/plugins/rehype-buy-bitcoin.mjs';
import { rehypeHeadingAnchor } from './src/plugins/rehype-heading-anchor.mjs';
import { TAGS, anchorFor } from './src/lib/topics';
import { editionPublic } from './src/lib/editions.mjs';
import { TOPICS_EN } from './src/lib/topics-en';
import { gmDark, gmLight } from './src/themes/shiki-gm.mjs';

const SITE = 'https://gm.21ideas.org';
const BUILD_ISO = new Date().toISOString();

// Exact RU/EN H2 display text → stable slug, fed to the heading-anchor plugin (kept out of the plugin so it
// stays free of the topic registry). topics.ts is pure (no astro:content), so importing it here
// doesn't drag the content layer into config evaluation.
const TOPIC_SLUGS = Object.fromEntries([...TAGS.map((t) => [t.topic, t.slug]), ...Object.entries(TOPICS_EN).map(([slug, label]) => [label, slug])]);

// https://astro.build/config
export default defineConfig({
	site: SITE,
	base: '/',
	integrations: [
		sitemap({
			// Tag hubs use their own sitemap; private English routes stay unadvertised.
			filter: (page) => !page.includes('/tags') && (editionPublic(process.env.EN_EDITION_PUBLIC) || !new URL(page).pathname.startsWith('/en/')) && !new URL(page).pathname.endsWith('/404/'),
			serialize(item) {
				const m = item.url.match(/\/digests\/(\d{4}-\d{2}-\d{2})\/?$/);
				if (m) {
					// individual digest: lastmod = its publish date
					item.lastmod = `${m[1]}T00:00:00+00:00`;
					item.changefreq = ChangeFreqEnum.MONTHLY; // published digests rarely change
					item.priority = 0.8;
				} else {
					// home + listings: change as new digests land
					item.lastmod = BUILD_ISO;
					item.changefreq =
						[`${SITE}/`, `${SITE}/en/`].includes(item.url) ? ChangeFreqEnum.DAILY : ChangeFreqEnum.WEEKLY;
					item.priority = [`${SITE}/`, `${SITE}/en/`].includes(item.url) ? 1.0 : 0.6;
				}
				return item;
			},
		}),
	],
	markdown: {
		rehypePlugins: [
			// rehypeHeadingIds (Astro's own) MUST run before rehypeHeadingAnchor: it builds the
			// `headings` export that buildTagIndex reads, so it has to see clean heading text before
			// our plugin injects the "##"/"###" glyph (otherwise h.text becomes "## Майнинг" and the
			// topic match fails → empty hubs). Providing it explicitly also stops Astro re-adding it.
			rehypeHeadingIds,
			rehypeCodeCopy,
			rehypeBuyBitcoin,
			[rehypeHeadingAnchor, { topicSlugs: TOPIC_SLUGS, anchorFor }],
		],
		shikiConfig: {
			themes: {
				dark: gmDark,
				light: gmLight,
			},
			defaultColor: 'dark',
		},
	},
});
