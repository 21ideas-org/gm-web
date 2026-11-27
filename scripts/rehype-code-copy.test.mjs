import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { rehypeCodeCopy } from '../src/plugins/rehype-code-copy.mjs';
import { rehypeBuyBitcoin } from '../src/plugins/rehype-buy-bitcoin.mjs';
import { renderFeedContent } from '../src/lib/feed.mjs';

const markdown = await createMarkdownProcessor({ rehypePlugins: [rehypeCodeCopy, rehypeBuyBitcoin] });
const fence = (heading, lines, language = '') => [`## ${heading}`, '', '```' + language, ...lines, '```', ''].join('\n');
const stats = [
  ['Статистика сети', 'Замер: 2026-11-27 00:50 UTC', '2026-11-27T00:50:00Z', '27 Ноября 00:50 UTC',
    ['Рынок    $60 657 · +0,23% за 24 ч', 'Сеть     Блок #977 733 · 1 036 EH/s', 'Мемпул   Следующий блок ≈ 2 сат/vB'],
    ['Рынок:    $60 657 · +0,23%', 'Сеть:     Блок #977 733 · 1 036 EH/s', 'Следующий блок: 2 сат/vB']],
  ['Network Stats', 'As of 2026-11-26 10:04 UTC', '2026-11-26T10:04:00Z', 'Nov 26 10:04 UTC',
    ['Market   $60,824 · +3.03% over 24h', 'Network  Block #977,664 · 1,053 EH/s', 'Mempool  Next block ≈ 2 sat/vB'],
    ['Market:   $60,824 · +3.03%', 'Network:  Block #977,664 · 1,053 EH/s', 'Next block: 2 sat/vB']],
];

for (const [heading, originalTime, iso, label, rows, expected] of stats) {
  test(`${heading}: moves the UTC time into the toolbar and formats the rows on the page only`, async () => {
    const source = fence(heading, [originalTime, ...rows], heading === 'Network Stats' ? 'text' : '');
    const { code } = await markdown.render(source);
    assert.ok(code.includes(`<time class="code-time" datetime="${iso}">${label}</time>`));
    const block = /<pre\b[^>]*>([\s\S]*?)<\/pre>/.exec(code)?.[1];
    assert.equal(block.replace(/<[^>]*>/g, ''), expected.join('\n'));
    assert.equal(code.split(label).length, 2, 'the formatted timestamp appears once');
    assert.doesNotMatch(code, /class="code-lang">/);
    assert.equal(code.includes('buy-bitcoin-cta'), heading === 'Статистика сети');
    const feed = renderFeedContent(source);
    assert.ok(feed.includes([originalTime, ...rows].join('\n')));
    assert.ok(!feed.includes(label));
  });
}

test('formats a partial snapshot and leaves older statistics and subsequent code alone', async () => {
  const source = fence('Network Stats', ['As of 2026-11-26 10:04 UTC', 'Network  1,053 EH/s']) + '\n' +
    fence('Technology & Development', ['const step = 1;'], 'js') + '\n' +
    fence('Price & Market', ['As of 2026-11-26 10:04 UTC', 'Market   $60,824 · +3.03% over 24h']);
  const { code } = await markdown.render(source);
  assert.match(code, /Network:  1,053 EH\/s/);
  assert.doesNotMatch(code, /Next block:/);
  assert.equal((code.match(/class="code-time"/g) ?? []).length, 1);
  assert.match(code, /class="code-lang">js<\/span>/);
  assert.match(code, /Market   \$60,824 · \+3\.03% over 24h/);

  const old = await markdown.render(fence('Статистика сети', ['26 ноября 2026', 'РЫНОК', '  Цена  $60 824']));
  assert.match(old.code, /class="code-lang">plaintext/);
  assert.match(old.code, /26 ноября 2026/);
  const invalid = await markdown.render(fence('Network Stats', ['As of 2026-11-31 10:04 UTC', 'Network  1,053 EH/s']));
  assert.doesNotMatch(invalid.code, /<time\b/);
  assert.match(invalid.code, /As of 2026-11-31 10:04 UTC/);
});

test('copy includes the relocated date for statistics and copies ordinary source as before', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(readFileSync(new URL('../src/layouts/Post.astro', import.meta.url), 'utf8'))[1];
  let click;
  let timestamp;
  const copied = [];
  class Element {
    dataset = {};
    closest(selector) {
      if (selector === '.code-copy') return this;
      if (selector === '.code-wrap') return {
        querySelector: selector => selector === 'pre' ? { innerText: 'panel content' } : timestamp,
      };
      return null;
    }
  }
  class HTMLButtonElement extends Element {}
  class HTMLAnchorElement extends Element {}
  runInNewContext(script, {
    document: { addEventListener(_, listener) { click = listener; } }, Element, HTMLButtonElement, HTMLAnchorElement,
    navigator: { clipboard: { writeText(value) { copied.push(value); return Promise.resolve(); } } },
    window: { setTimeout() {} },
  });
  timestamp = { textContent: 'Nov 26 10:04 UTC' };
  click({ target: new HTMLButtonElement() });
  timestamp = null;
  click({ target: new HTMLButtonElement() });
  assert.deepEqual(copied, ['Nov 26 10:04 UTC\npanel content', 'panel content']);
});
