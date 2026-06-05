import type { APIRoute } from 'astro';
import { renderOgPng } from '../../lib/og';

export const GET: APIRoute = async () => {
	const png = await renderOgPng(
		'Доброе утро, биткоинер',
		'Ежедневные биткоин-онли дайджесты у вашего цифрового порога.',
	);
	return new Response(new Uint8Array(png), {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
};
