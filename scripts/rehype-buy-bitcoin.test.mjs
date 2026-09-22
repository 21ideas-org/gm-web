import assert from 'node:assert/strict';
import test from 'node:test';
import { rehypeBuyBitcoin } from '../src/plugins/rehype-buy-bitcoin.mjs';

const element = (tagName, children = [], properties = {}) => ({ type: 'element', tagName, properties, children });
const text = (value) => ({ type: 'text', value });

test('places one buy link after the stats panel and before news', () => {
	const tree = { type: 'root', children: [
		element('p', [text('gm')]),
		text('\n'),
		element('h2', [text('Статистика сети')]),
		text('\n'),
		element('div', [element('pre')], { className: ['code-wrap'] }),
		text('\n'),
		element('h2', [text('Майнинг')]),
	] };

	rehypeBuyBitcoin()(tree);
	const index = tree.children.findIndex((child) => child.properties?.className?.includes('buy-bitcoin-cta'));
	assert.equal(index, 5);
	assert.equal(tree.children[index].children[0].properties.href, '/buy-bitcoin/');
	assert.equal(tree.children[index].children[0].children[0].value.trim(), 'купить биткоин');
	assert.equal(tree.children.filter((child) => child.properties?.className?.includes('buy-bitcoin-cta')).length, 1);
});

test('leaves unrelated Markdown and a missing stats panel alone', () => {
	const tree = { type: 'root', children: [
		element('h2', [text('Статистика сети')]),
		text('\n'),
		element('p', [text('No panel')]),
	] };
	rehypeBuyBitcoin()(tree);
	assert.equal(tree.children.length, 3);
});
