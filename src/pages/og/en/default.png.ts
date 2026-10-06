import type { APIRoute } from 'astro';
import { renderOgPng } from '../../../lib/og';

export const GET: APIRoute = async () => {
	const png = await renderOgPng(
		'GM, bitcoiner',
		'Your daily Bitcoin-only news digest, with original sources.',
		undefined,
		'en',
	);
	return new Response(new Uint8Array(png), {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
};
