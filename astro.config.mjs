// @ts-check

import mdx from '@astrojs/mdx';
import sitemap, { ChangeFreqEnum } from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { rehypeCodeCopy } from './src/plugins/rehype-code-copy.mjs';
import { gmDark, gmLight } from './src/themes/shiki-gm.mjs';

const SITE = 'https://gm.21ideas.org';
const BUILD_ISO = new Date().toISOString();

// https://astro.build/config
export default defineConfig({
	site: SITE,
	base: '/',
	integrations: [
		mdx(),
		sitemap({
			filter: (page) => !page.includes('/tags'), // main sitemap stays tag-free; hubs ride tags-sitemap.xml (never lists a noindex thin hub)
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
						item.url === `${SITE}/` ? ChangeFreqEnum.DAILY : ChangeFreqEnum.WEEKLY;
					item.priority = item.url === `${SITE}/` ? 1.0 : 0.6;
				}
				return item;
			},
		}),
	],
	markdown: {
		rehypePlugins: [rehypeCodeCopy],
		shikiConfig: {
			themes: {
				dark: gmDark,
				light: gmLight,
			},
			defaultColor: 'dark',
		},
	},
});
