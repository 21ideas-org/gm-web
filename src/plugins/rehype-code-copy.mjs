import { visit } from 'unist-util-visit';

// Wraps every block <pre> emitted by Shiki in a .code-wrap container with a
// toolbar: language label (left) + copy button (right). The button has no
// state attached; the click handler in Post.astro reads pre.innerText at
// click time, so the raw source isn't duplicated into the HTML.

export function rehypeCodeCopy() {
	return (tree) => {
		visit(tree, 'element', (node, index, parent) => {
			if (!parent || typeof index !== 'number') return;
			if (node.tagName !== 'pre') return;

			const code = node.children?.find(
				(c) => c.type === 'element' && c.tagName === 'code'
			);
			if (!code) return;

			// Shiki sets data-language on the <pre> and drops language-* from
			// <code>. Fall through to the original code className for the
			// case where syntax highlighting is off.
			const preProps = node.properties ?? {};
			const codeClasses = Array.isArray(code.properties?.className)
				? code.properties.className
				: [];
			const langClass = codeClasses.find(
				(c) => typeof c === 'string' && c.startsWith('language-')
			);
			const lang =
				preProps.dataLanguage ||
				(langClass ? langClass.slice('language-'.length) : '') ||
				'';

			// The span renders even when empty: the toolbar uses
			// justify-content: space-between, so the copy button would
			// shift left without a left-side element.
			const toolbarChildren = [
				{
					type: 'element',
					tagName: 'span',
					properties: { className: ['code-lang'] },
					children: lang ? [{ type: 'text', value: lang }] : [],
				},
				{
					type: 'element',
					tagName: 'button',
					properties: {
						type: 'button',
						className: ['code-copy'],
						'aria-label': 'Copy code',
					},
					children: [{ type: 'text', value: 'copy' }],
				},
			];

			const wrap = {
				type: 'element',
				tagName: 'div',
				properties: { className: ['code-wrap'] },
				children: [
					{
						type: 'element',
						tagName: 'div',
						properties: { className: ['code-toolbar'] },
						children: toolbarChildren,
					},
					node,
				],
			};

			parent.children[index] = wrap;
		});
	};
}
