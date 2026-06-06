import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const COLORS = {
	bg: '#0a0a0c',
	text: '#e6e6ea',
	muted: '#8a8a96',
	dim: '#44444f',
	border: '#2a2a33',
	accent: '#ffb000',
};

let fontCache: { regular: Buffer; bold: Buffer } | null = null;

async function loadFonts() {
	if (fontCache) return fontCache;
	// This endpoint only runs at build time (prerendered), so the CWD is the project root.
	const root = process.cwd();
	const [regular, bold] = await Promise.all([
		readFile(resolve(root, 'src/assets/fonts/JetBrainsMono-Regular.ttf')),
		readFile(resolve(root, 'src/assets/fonts/JetBrainsMono-Bold.ttf')),
	]);
	fontCache = { regular, bold };
	return fontCache;
}

// Titles render on a single line (Satori doesn't wrap the title text), so size to
// fit the 1024px content width. The brand title "Доброе утро, биткоинер" (22 chars)
// lands at 70px.
function titleFontSize(title: string): number {
	const len = title.length;
	if (len <= 14) return 88;
	if (len <= 24) return 70;
	if (len <= 34) return 50;
	return 44;
}

type Node = {
	type: string;
	props: Record<string, unknown> & { children?: unknown };
};

function el(type: string, props: Record<string, unknown> & { children?: unknown }): Node {
	return { type, props };
}

function template(title: string, description: string): Node {
	const titleSize = titleFontSize(title);

	// Scanlines layer (replaces ::before)
	const scanlines = el('div', {
		style: {
			position: 'absolute',
			top: 0,
			left: 0,
			right: 0,
			bottom: 0,
			backgroundImage:
				'repeating-linear-gradient(to bottom, rgba(230,230,234,0.08) 0px, rgba(230,230,234,0.08) 1px, transparent 1px, transparent 2px)',
		},
	});

	// Vignette layer (replaces ::after)
	const vignette = el('div', {
		style: {
			position: 'absolute',
			top: 0,
			left: 0,
			right: 0,
			bottom: 0,
			backgroundImage:
				'radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.65) 100%)',
		},
	});

	const topStrip = el('div', {
		style: {
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'space-between',
			fontSize: 20,
			color: COLORS.dim,
			letterSpacing: 0.4,
			paddingBottom: 22,
			borderBottom: `1px solid ${COLORS.border}`,
		},
		children: [
			el('div', {
				style: { display: 'flex' },
				children: '[ ~/gm_₿ ]',
			}),
			el('div', {
				style: { display: 'flex', color: COLORS.muted, fontSize: 18 },
				children: 'og-image · 1200×630',
			}),
		],
	});

	// Title — single line, no logo mark (dropped in card v1).
	const lockup = el('div', {
		style: {
			display: 'flex',
			fontFamily: 'JetBrainsMono',
			fontWeight: 700,
			fontSize: titleSize,
			lineHeight: 1.05,
			letterSpacing: -titleSize * 0.01,
			color: COLORS.text,
			overflow: 'hidden',
		},
		children: title,
	});

	const subhead = el('div', {
		style: {
			display: 'flex',
			fontFamily: 'JetBrainsMono',
			fontWeight: 400,
			fontSize: 34,
			lineHeight: 1.3,
			color: COLORS.text,
			letterSpacing: 0.17,
		},
		children: [
			el('span', {
				style: { color: COLORS.accent, marginRight: 14 },
				children: '>',
			}),
			el('span', {
				style: { display: 'flex', flex: 1 },
				children: description,
			}),
		],
	});

	const content = el('div', {
		style: {
			display: 'flex',
			flexDirection: 'column',
			flex: 1,
			justifyContent: 'center',
			gap: 28,
		},
		children: [lockup, subhead],
	});

	const bottomStrip = el('div', {
		style: {
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'space-between',
			paddingTop: 22,
			borderTop: `1px solid ${COLORS.border}`,
			fontSize: 18,
			color: COLORS.muted,
		},
		children: [
			el('div', {
				style: { display: 'flex', color: COLORS.dim, letterSpacing: 0.36 },
				children: 'gm_₿ v1.0.0 MIT',
			}),
			el('div', {
				style: { display: 'flex', color: COLORS.muted },
				children: 'github · telegram · rss',
			}),
		],
	});

	// Foreground content stack — wraps strips + content so it sits above scanlines/vignette.
	const foreground = el('div', {
		style: {
			position: 'absolute',
			top: 48,
			left: 88,
			right: 88,
			bottom: 48,
			display: 'flex',
			flexDirection: 'column',
		},
		children: [topStrip, content, bottomStrip],
	});

	return el('div', {
		style: {
			width: 1200,
			height: 630,
			display: 'flex',
			backgroundColor: COLORS.bg,
			color: COLORS.text,
			fontFamily: 'JetBrainsMono',
			position: 'relative',
			overflow: 'hidden',
		},
		children: [scanlines, vignette, foreground],
	});
}

export async function renderOgPng(title: string, description: string): Promise<Buffer> {
	const { regular, bold } = await loadFonts();
	const svg = await satori(template(title, description) as unknown as never, {
		width: 1200,
		height: 630,
		fonts: [
			{ name: 'JetBrainsMono', data: regular, weight: 400, style: 'normal' },
			{ name: 'JetBrainsMono', data: bold, weight: 700, style: 'normal' },
		],
	});
	const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
	return png;
}
