// Pure topic registry — the gm-web half of the contract in plans/tags.md §3 (mirrors
// gm-bitcoiner/lib/topics.js and prompts/digest.select.md §3). Kept free of `astro:content` so it
// can be imported from astro.config.mjs (to feed the rehype-heading-anchor plugin) without dragging
// the content layer into config evaluation. The content-layer queries live in ./tags.ts, which
// re-exports everything here so existing `../lib/tags` imports keep resolving.
//
// Keyed by slug (stable URL token); `topic` is the exact Russian H2 the bot emits; `label` is the
// short chip text; `hubTitle`/`hubDesc` are the keyword-rich Russian strings that drive ranking on
// the hub page.
export interface TagDef {
	slug: string;
	topic: string;
	label: string;
	hubTitle: string;
	hubDesc: string;
}

export const TAGS: TagDef[] = [
	{ slug: 'market',       topic: 'Цена и рынок',                      label: 'рынок',          hubTitle: 'Биткоин: цена и рынок',                 hubDesc: 'Новости о цене биткоина и динамике рынка — день за днём.' },
	{ slug: 'institutions', topic: 'Институционалы и казначейства',     label: 'институционалы', hubTitle: 'Институционалы и биткоин-казначейства',  hubDesc: 'Корпорации, фонды и государства, наращивающие биткоин-резервы.' },
	{ slug: 'regulation',   topic: 'Регулирование и политика',         label: 'регулирование', hubTitle: 'Регулирование биткоина',                hubDesc: 'Законы, политика и регулирование биткоина.' },
	{ slug: 'lightning',    topic: 'Lightning и L2',                    label: 'второй слой',    hubTitle: 'Lightning Network и L2',                hubDesc: 'Новости Lightning Network и решений второго уровня.' },
	{ slug: 'mining',       topic: 'Майнинг',                           label: 'майнинг',        hubTitle: 'Биткоин-майнинг',                       hubDesc: 'Оборудование, энергетика, хешрейт, пулы.' },
	{ slug: 'tech',         topic: 'Технологии и разработка',          label: 'технологии',     hubTitle: 'Технологии и разработка биткоина',      hubDesc: 'Протокол, разработка и технологические обновления.' },
	{ slug: 'security',     topic: 'Безопасность и приватность',       label: 'безопасность',   hubTitle: 'Безопасность и приватность биткоина',   hubDesc: 'Угрозы, уязвимости и приватность.' },
	{ slug: 'community',    topic: 'Сообщество',                        label: 'сообщество',     hubTitle: 'Биткоин-сообщество',                    hubDesc: 'Люди, культура и события биткоин-сообщества.' },
	{ slug: 'funds',        topic: 'Инвестпродукты',                    label: 'фонды и ETF',    hubTitle: 'Биткоин-ETF и инвестпродукты',          hubDesc: 'Биткоин-ETF, фонды и инвестиционные продукты.' },
	{ slug: 'scandals',     topic: 'Интриги, скандалы, расследования', label: 'расследования',  hubTitle: 'Биткоин: расследования и происшествия', hubDesc: 'Преступления, аресты, мошеннические схемы и расследования.' },
];

// Indexability floor: a hub below this many items renders but is noindex + omitted from the
// tags sitemap (thin-content hygiene). Per-article counting clears this within days.
export const HUB_MIN_ITEMS = 5;

export const BY_SLUG = new Map(TAGS.map((t) => [t.slug, t]));
export const BY_TOPIC = new Map(TAGS.map((t) => [t.topic, t]));
export const IGNORED_HEADINGS = new Set(['Статистика сети']); // the stats panel H2 is not a topic

export function tagBySlug(slug: string): TagDef | undefined {
	return BY_SLUG.get(slug);
}

// Per-story in-page anchor: topic slug + 1-based position among that topic's stories within a
// single digest, in document order (e.g. `mining-1`, `mining-2`). The single source of truth for
// the formula: rehype-heading-anchor.mjs sets the matching `id` on the rendered <h4>, and
// buildTagIndex (tags.ts) emits the same string for hub deep-links, so the two always agree.
// Topic <h2> anchors are just the bare slug (`mining`) — set directly by the plugin, not here.
// Positional by design: stable only because a published digest is immutable (the bot writes it
// once); inserting a story into an already-shared digest would shift later numbers.
export function anchorFor(slug: string, n: number): string {
	return `${slug}-${n}`;
}

// Topic slugs present in a digest's heading tree, in document order (drives the digest chips —
// derived from structure so chips work on every digest with zero frontmatter backfill).
export function tagsFromHeadings(headings: { depth: number; text: string }[]): string[] {
	const out: string[] = [];
	for (const h of headings) {
		if (h.depth !== 2) continue;
		const def = BY_TOPIC.get(h.text);
		if (def && !out.includes(def.slug)) out.push(def.slug);
	}
	return out;
}
