// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { rehypeCodeCopy } from './src/plugins/rehype-code-copy.mjs';
import { gmDark, gmLight } from './src/themes/shiki-gm.mjs';

// https://astro.build/config
export default defineConfig({
	site: 'https://gm.21ideas.org',
	base: '/',
	integrations: [mdx(), sitemap()],
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
