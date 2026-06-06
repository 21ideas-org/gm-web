import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { renderOgPng } from '../../lib/og';
import { formatRuDate } from '../../lib/date';

const DAY_MS = 86_400_000;

export const getStaticPaths: GetStaticPaths = async () => {
	const posts = await getCollection('digests', p => !p.data.draft);
	return posts.map(post => {
		const covered = new Date(post.data.pubDate.getTime() - DAY_MS);
		return {
			params: { slug: post.id },
			props: {
				title: 'Доброе утро, биткоинер',
				description: post.data.description || `Главные биткоин-новости за ${formatRuDate(covered)} года`,
			},
		};
	});
};

export const GET: APIRoute = async ({ props }) => {
	const { title, description } = props as { title: string; description: string };
	const png = await renderOgPng(title, description);
	return new Response(new Uint8Array(png), {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
};
