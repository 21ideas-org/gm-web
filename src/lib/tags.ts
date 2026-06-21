import { getCollection, render } from 'astro:content';
import { BY_TOPIC, IGNORED_HEADINGS, anchorFor, type TagDef } from './topics';

// The pure topic registry (TagDef, TAGS, HUB_MIN_ITEMS, tagBySlug, tagsFromHeadings, anchorFor)
// lives in ./topics — kept import-free of `astro:content` so astro.config can pull it in. This
// module adds the build-time content-layer queries and re-exports the registry so existing
// `../lib/tags` consumers keep resolving unchanged.
export { TAGS, HUB_MIN_ITEMS, tagBySlug, tagsFromHeadings, anchorFor } from './topics';
export type { TagDef } from './topics';

export interface NewsRef {
	slug: string;       // tag slug
	ru_title: string;   // the H4 headline text
	anchor: string;     // in-page deep-link target — `slug-n` (mirrors the rendered <h4> id)
	digestId: string;   // e.g. '2026-06-10'
	date: Date;
}

// Parse every digest's heading tree into slug → news items. Each H4 (headline) inherits the nearest
// preceding H2 (its topic) and gets a `slug-n` anchor (its 1-based position among that topic's
// stories in the digest). rehype-heading-anchor.mjs sets the identical id on the rendered <h4>
// via the same anchorFor(), so these deep links always match the page. Pure parse — no model.
// Items are newest-first.
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
		const counts = new Map<string, number>(); // per-topic story counter within THIS digest
		let current: TagDef | undefined;
		for (const h of headings) {
			if (h.depth === 2) {
				current = BY_TOPIC.get(h.text);
				if (current && !digestSlugs.includes(current.slug)) digestSlugs.push(current.slug);
				if (!current && !IGNORED_HEADINGS.has(h.text)) {
					console.warn(`[tags] unmapped H2 ${JSON.stringify(h.text)} in ${entry.id} — items untagged`);
				}
			} else if (h.depth === 4 && current) {
				const n = (counts.get(current.slug) ?? 0) + 1;
				counts.set(current.slug, n);
				const list = index.get(current.slug) ?? [];
				if (!index.has(current.slug)) index.set(current.slug, list);
				list.push({ slug: current.slug, ru_title: h.text, anchor: anchorFor(current.slug, n), digestId: entry.id, date: entry.data.pubDate });
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
