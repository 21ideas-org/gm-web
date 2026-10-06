import { eligibleEnglishEdition } from '../../../lib/editions.mjs';
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { renderOgPng } from '../../../lib/og';
import { formatEditionDate } from '../../../lib/date';

const DAY_MS = 86_400_000;

export const getStaticPaths: GetStaticPaths = async () => {
	const posts = await getCollection('digests-en', post => eligibleEnglishEdition(post));
	return posts.map(post => {
		const covered = new Date(post.data.pubDate.getTime() - DAY_MS);
		return {
			params: { slug: post.id },
			props: {
				title: post.data.title,
				description: post.data.description || `Bitcoin news for ${formatEditionDate(covered, 'en')}`,
				stamp: formatEditionDate(post.data.pubDate, 'en'),
			},
		};
	});
};

export const GET: APIRoute = async ({ props }) => {
	const { title, description, stamp } = props as { title: string; description: string; stamp: string };
	const png = await renderOgPng(title, description, stamp, 'en');
	return new Response(new Uint8Array(png), {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
};
