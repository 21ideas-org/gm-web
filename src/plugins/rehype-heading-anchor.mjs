import { visit, SKIP } from 'unist-util-visit';

// Build-time: turns each topic <h2> and story <h4> into a shareable, self-linking heading.
//   - sets a clean id   (h2 → "<slug>", h4 → "<slug>-<n>" via the injected anchorFor)
//   - injects a dim hash glyph ("##" for topics, "###" for stories — see note below)
//   - wraps the heading's existing children in <a class="head-link" href="#id"> so the whole
//     title is one tap target; the click→copy-no-jump-and-flash behavior lives in Post.astro.
//
// The displayed glyph count is INTENTIONAL and decoupled from the source heading level: the bot
// emits "##"/"####" (H2/H4, skipping H3 for mobile readability), but we render "##"/"###" because
// "two = topic, three = story" reads better and is more compact. Don't "fix" it to match levels.
//
// We set node.properties.id explicitly, so it wins regardless of where Astro's own heading-id step
// runs (rehype-slug semantics skip headings that already have an id). The `slug-n` formula is
// shared with buildTagIndex (tags.ts) via the injected anchorFor, so hub deep-links always resolve.
//
// Options (injected from astro.config so this plugin stays free of the topic registry):
//   topicSlugs: { "<exact Russian H2 text>": "<slug>" }  — from TAGS
//   anchorFor:  (slug, n) => string                       — the shared slug-n formula

function headingText(node) {
	let out = '';
	visit(node, 'text', (t) => {
		out += t.value;
	});
	return out;
}

function glyphSpan(glyph) {
	return {
		type: 'element',
		tagName: 'span',
		properties: { className: ['hgh'], 'aria-hidden': 'true' },
		children: [{ type: 'text', value: glyph }],
	};
}

export function rehypeHeadingAnchor({ topicSlugs = {}, anchorFor = (s, n) => `${s}-${n}` } = {}) {
	return (tree) => {
		let currentSlug; // nearest enclosing mapped topic (undefined under a non-topic H2)
		const counts = new Map(); // slug → stories seen so far in THIS document

		visit(tree, 'element', (node) => {
			if (node.tagName !== 'h2' && node.tagName !== 'h4') return;

			let id, glyph;
			if (node.tagName === 'h2') {
				const slug = topicSlugs[headingText(node).trim()];
				currentSlug = slug; // resets section context; undefined for e.g. «Статистика сети»
				glyph = '##';
				// Non-topic H2 (e.g. «Статистика сети»): keep the decorative "## " prefix it always
				// had, but don't make it a shareable self-link (no slug, no id change).
				if (!slug) {
					node.children = [glyphSpan(glyph), { type: 'text', value: ' ' }, ...node.children];
					return SKIP;
				}
				id = slug;
			} else {
				if (!currentSlug) return; // story under an unmapped section — leave as-is
				const n = (counts.get(currentSlug) ?? 0) + 1;
				counts.set(currentSlug, n);
				id = anchorFor(currentSlug, n);
				glyph = '###';
			}

			node.properties = node.properties ?? {};
			node.properties.id = id;
			node.children = [
				{
					type: 'element',
					tagName: 'a',
					properties: { className: ['head-link'], href: `#${id}` },
					children: [glyphSpan(glyph), { type: 'text', value: ' ' }, ...node.children],
				},
			];

			return SKIP; // don't descend into the rewritten subtree
		});
	};
}
