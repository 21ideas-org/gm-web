import type { Locale } from './locale';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import satori, { type Font } from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { sunStampSvg } from './sun-stamp.mjs';

// Light-theme paper, text, rules and stamp ink from global.css, regardless of site theme.
const COLORS = {
	bg: '#eae1cc',
	text: '#292b24',
	muted: '#626151',
	border: '#aaa58f',
	accent: '#a13c26',
};

let fontCache: Promise<Font[]> | undefined;

function loadFonts(): Promise<Font[]> {
	// Prerendered endpoints run at build time with the project root as CWD.
	fontCache ??= Promise.all(([
		{ name: 'IBM Plex Serif', file: 'IBMPlexSerif-Bold.ttf', weight: 700, style: 'normal' },
		{ name: 'IBM Plex Serif', file: 'IBMPlexSerif-BoldItalic.ttf', weight: 700, style: 'italic' },
		{ name: 'IBM Plex Sans', file: 'IBMPlexSans-Regular.ttf', weight: 400, style: 'normal' },
		{ name: 'JetBrains Mono', file: 'JetBrainsMono-Regular.ttf', weight: 400, style: 'normal' },
	] as const).map(async ({ name, file, weight, style }) => ({
		name, weight, style,
		data: await readFile(resolve(process.cwd(), 'src/assets/fonts', file)),
	})));
	return fontCache;
}

type Style = Record<string, unknown>;
type Node = {
	type: string;
	props: Record<string, unknown> & { children?: unknown };
};

function box(style: Style, children?: unknown): Node {
	return { type: 'div', props: { style: { display: 'flex', ...style }, children } };
}

function text(value: string, style: Style = {}): Node {
	return box({ fontFamily: 'IBM Plex Sans', fontWeight: 400, ...style }, value);
}

function mono(value: string, style: Style = {}): Node {
	return text(value, { fontFamily: 'JetBrains Mono', letterSpacing: 0.6, ...style });
}

function rule(top: number, double = false): Node {
	return box({
		position: 'absolute', left: 56, top, width: 1088,
		height: double ? 7 : 1,
		borderTop: `${double ? 3 : 1}px solid ${double ? COLORS.text : COLORS.border}`,
		...(double ? { borderBottom: `1px solid ${COLORS.text}` } : {}),
	});
}

const sun = `data:image/svg+xml;base64,${Buffer.from(
	sunStampSvg('ink', 'og-sun').replaceAll('currentColor', COLORS.accent),
).toString('base64')}`;

function template(title: string, description: string, stamp: string | undefined, locale: Locale): Node {
	const ru = locale === 'ru';
	// English edition titles also contain the issue date; it has its own header field.
	const brandTitle = title.split(' — ')[0];
	const parts = brandTitle.match(/^(.*?,)\s+(.+)$/);
	const titleStyle = { fontFamily: 'IBM Plex Serif', fontWeight: 700, fontSize: 80, flexShrink: 0 };
	const wordmark = parts
		? [text(parts[1], titleStyle), text(parts[2], { ...titleStyle, fontStyle: 'italic' })]
		: [text(brandTitle, titleStyle)];

	return box({
		width: 1200, height: 630, position: 'relative', overflow: 'hidden',
		backgroundColor: COLORS.bg, color: COLORS.text, fontFamily: 'IBM Plex Sans',
	}, [
		box({
			position: 'absolute', left: 56, top: 28, width: 1088,
			alignItems: 'baseline', justifyContent: 'space-between',
		}, [
			mono('gm.21ideas.org', { fontSize: 34, color: COLORS.muted }),
			text(stamp || (ru ? 'БИТКОИН-ОНЛИ' : 'BITCOIN ONLY'), {
				fontSize: 44, color: COLORS.accent, letterSpacing: 0.6,
			}),
		]),
		rule(108),
		box({
			position: 'absolute', left: 56, top: 150, alignItems: 'baseline', gap: 20,
			fontFamily: 'IBM Plex Serif', fontWeight: 700, fontSize: 80,
			lineHeight: 1.03, letterSpacing: -3.4,
		}, [
			{ type: 'img', props: {
				src: sun, width: 116, height: 116,
				style: { position: 'absolute', right: -144, top: -15, width: 116, height: 116 },
			} },
			...wordmark,
		]),
		rule(264, true),
		text(description, {
			display: 'block',
			position: 'absolute', left: 58, top: 294, width: 1084,
			fontSize: 38, lineHeight: 1.24, letterSpacing: -0.3,
			// Keep even unusually long future summaries above the footer.
			lineClamp: 5,
		}),
		rule(564),
		mono(ru ? 'ЕЖЕДНЕВНЫЙ БИТКОИН-ДАЙДЖЕСТ' : 'YOUR DAILY BITCOIN DIGEST', {
			position: 'absolute', left: 56, top: 582, width: 1088,
			justifyContent: 'center', color: COLORS.muted, fontSize: 19,
		}),
	]);
}

export async function renderOgPng(
	title: string,
	description: string,
	stamp?: string,
	locale: Locale = 'ru',
): Promise<Buffer> {
	const fonts = await loadFonts();
	let svg = await satori(template(title, description, stamp, locale) as unknown as never, {
		width: 1200, height: 630, fonts,
	});
	// Subtle, deterministic newsprint grain over the local fonts and vector stamp.
	svg = svg.replace('</svg>', '<defs><filter id="paper-grain"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" seed="21" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs><rect width="1200" height="630" filter="url(#paper-grain)" opacity=".07" style="mix-blend-mode:multiply"/></svg>');
	const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
	return sharp(png).png({ palette: true, colours: 128, dither: 0, compressionLevel: 9 }).toBuffer();
}
