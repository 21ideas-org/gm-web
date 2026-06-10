import { getCollection, render } from 'astro:content';

// The gm-web half of the contract in plans/tags.md §3 (mirrors gm-bitcoiner/lib/topics.js and
// prompts/digest.select.md §3). Keyed by slug (stable URL token); `topic` is the exact Russian H2
// the bot emits; `label` is the short chip text; `hubTitle`/`hubDesc` are the keyword-rich Russian
// strings that drive ranking on the hub page.
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

const BY_SLUG = new Map(TAGS.map((t) => [t.slug, t]));
const BY_TOPIC = new Map(TAGS.map((t) => [t.topic, t]));
const IGNORED_HEADINGS = new Set(['Статистика сети']); // the stats panel H2 is not a topic

export function tagBySlug(slug: string): TagDef | undefined {
	return BY_SLUG.get(slug);
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

export interface NewsRef {
	slug: string;       // tag slug
	ru_title: string;   // the H4 headline text
	anchor: string;     // Astro-generated heading id → deep-link target
	digestId: string;   // e.g. '2026-06-10'
	date: Date;
}

// Parse every digest's heading tree into slug → news items. Each H4 (headline) inherits the nearest
// preceding H2 (its topic). Anchors come straight from Astro's generated heading ids, so deep links
// always match the rendered page. Pure parse — no model. Items are newest-first.
//
// Memoized: built once per build, shared by all consumers ([tag].astro getStaticPaths,
// tags/index.astro, tags-sitemap.xml.ts — 3+ calls otherwise). In dev a digest edit could serve a
// stale index until the module reloads — acceptable (digests change via the bot's pushes, not
// local edits).
let _index: Promise<Map<string, NewsRef[]>> | undefined;

export function buildTagIndex(): Promise<Map<string, NewsRef[]>> {
	return (_index ??= computeTagIndex());
}

async function computeTagIndex(): Promise<Map<string, NewsRef[]>> {
	const digests = (await getCollection('digests', (p) => !p.data.draft))
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

	const index = new Map<string, NewsRef[]>();
	for (const entry of digests) {
		const { headings } = await render(entry);
		const digestSlugs: string[] = []; // heading-derived, document order (= the bot's group order)
		let current: TagDef | undefined;
		for (const h of headings) {
			if (h.depth === 2) {
				current = BY_TOPIC.get(h.text);
				if (current && !digestSlugs.includes(current.slug)) digestSlugs.push(current.slug);
				if (!current && !IGNORED_HEADINGS.has(h.text)) {
					console.warn(`[tags] unmapped H2 ${JSON.stringify(h.text)} in ${entry.id} — items untagged`);
				}
			} else if (h.depth === 4 && current) {
				const list = index.get(current.slug) ?? [];
				if (!index.has(current.slug)) index.set(current.slug, list);
				list.push({ slug: current.slug, ru_title: h.text, anchor: h.slug, digestId: entry.id, date: entry.data.pubDate });
			}
		}
		// Drift detector (the §2 claim): frontmatter tags (bot-written, Phase A) and heading-derived
		// slugs both derive from the same g.topic in the same order, so they must match exactly. A
		// mismatch means the two halves of the §3 contract (gm-bitcoiner/lib/topics.js vs this
		// registry) have drifted — e.g. a slug renamed on one side only, which the unmapped-H2
		// warning cannot see. Empty frontmatter (pre-Phase-A digests without Phase E backfill) is
		// skipped — nothing to compare.
		const fm = entry.data.tags;
		if (fm.length && (fm.length !== digestSlugs.length || fm.some((t, i) => t !== digestSlugs[i]))) {
			console.warn(`[tags] ${entry.id}: frontmatter tags [${fm.join(', ')}] ≠ heading-derived [${digestSlugs.join(', ')}] — §3 contract drift?`);
		}
	}
	return index;
}

// Item counts per slug (drives the index page + the indexability gate).
export async function tagItemCounts(): Promise<Map<string, number>> {
	const idx = await buildTagIndex();
	return new Map([...idx].map(([slug, items]) => [slug, items.length]));
}
