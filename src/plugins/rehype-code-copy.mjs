import { visit } from 'unist-util-visit';

// Wraps every block <pre> emitted by Shiki in a .code-wrap container with a
// toolbar: a language label or statistics timestamp, plus a copy button.

const statsHeadings = new Map([['Статистика сети', 'ru'], ['Network Stats', 'en']]);
const statsDates = {
	ru: new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }),
	en: new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
};

function compactStats(code, parent, index) {
	if (parent.type !== 'root') return;
	const heading = parent.children.slice(0, index).findLast(node => node.type !== 'text' || node.value.trim());
	if (heading?.tagName !== 'h2') return;
	const title = heading.children.map(node => node.value ?? '').join('').trim();
	const locale = statsHeadings.get(title);
	if (!locale) return;

	let source = '';
	visit(code, 'text', node => { source += node.value; });
	const [first, ...lines] = source.trimEnd().split('\n');
	const en = locale === 'en';
	const prefix = en ? 'As of ' : 'Замер: ';
	if (!first.startsWith(prefix)) return;
	const timestamp = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC$/.exec(first.slice(prefix.length));
	if (!timestamp) return;
	const [, day, time] = timestamp;
	const iso = `${day}T${time}:00Z`;
	const date = new Date(iso);
	if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 16) !== iso.slice(0, 16)) return;

	const market = en ? 'Market' : 'Рынок';
	const network = en ? 'Network' : 'Сеть';
	const mempool = en ? 'Mempool' : 'Мемпул';
	const nextBlock = en ? 'Next block' : 'Следующий блок';
	const feePrefix = `${nextBlock} ≈ `;
	const rows = [];
	for (const line of lines) {
		const match = /^(\S+)[ \t]+(.+)$/.exec(line);
		if (!match) return;
		const [, label, value] = match;
		if (label === market) rows.push(`${market}:`.padEnd(10) + value.replace(en ? / over 24h$/ : / за 24 ч$/, ''));
		else if (label === network) rows.push(`${network}:`.padEnd(10) + value);
		else if (label === mempool && value.startsWith(feePrefix)) rows.push(`${nextBlock}: ${value.slice(feePrefix.length)}`);
		else return;
	}

	const dayMonth = statsDates[locale].format(date).replace(/\p{L}/u, letter => letter.toUpperCase());
	return { iso, label: `${dayMonth} ${time} UTC`, text: rows.join('\n') };
}

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
			const stats = ['', 'plaintext', 'text'].includes(lang) ? compactStats(code, parent, index) : undefined;
			if (stats) code.children = [{ type: 'text', value: stats.text }];

			// The span renders even when empty: the toolbar uses
			// justify-content: space-between, so the copy button would
			// shift left without a left-side element.
			const toolbarChildren = [
				stats ? {
					type: 'element',
					tagName: 'time',
					properties: { className: ['code-time'], dateTime: stats.iso },
					children: [{ type: 'text', value: stats.label }],
				} : {
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
