// The bot writes the stats heading and its fenced panel before the first news
// section. Insert the site-only link during rendering so published and future
// digests get the same CTA without changing their Markdown or feed content.
export function rehypeBuyBitcoin() {
	return (tree) => {
		const children = tree.children ?? [];
		for (let i = 0; i < children.length - 1; i++) {
			const heading = children[i];
			if (heading.type !== 'element' || heading.tagName !== 'h2') continue;
			if (heading.children?.map((child) => child.value ?? '').join('').trim() !== 'Статистика сети') continue;
			let panelIndex = i + 1;
			while (children[panelIndex]?.type === 'text' && !children[panelIndex].value.trim()) panelIndex++;
			const panel = children[panelIndex];
			if (!panel) continue;
			if (panel.type !== 'element' || panel.tagName !== 'div' || !panel.properties?.className?.includes('code-wrap')) continue;

			children.splice(panelIndex + 1, 0, {
				type: 'element',
				tagName: 'p',
				properties: { className: ['buy-bitcoin-cta'] },
				children: [{
					type: 'element',
					tagName: 'a',
					properties: { className: ['cta-btn', 'cta-btn--accent'], href: '/buy-bitcoin/' },
					children: [
						{ type: 'text', value: 'купить биткоин ' },
						{
							type: 'element',
							tagName: 'span',
							properties: { className: ['arrow'], 'aria-hidden': 'true' },
							children: [{ type: 'text', value: '→' }],
						},
					],
				}],
			});
			break;
		}
	};
}
