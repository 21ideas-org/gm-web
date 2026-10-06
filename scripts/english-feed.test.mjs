import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFeedHtml, renderFeedContent } from '../src/lib/feed.mjs';
test('English full feed content preserves headings, images, code and original sources', () => {
  const html = renderFeedContent('## Technology & Development\n\n#### News\n\n[Source](https://example.org/source)\n\n![Chart](https://example.org/chart.png)\n\n```text\nexample code\n```');
  assert.match(html, /<h2>Technology &amp; Development<\/h2>/);
  assert.match(html, /<h4>News<\/h4>/);
  assert.match(html, /href="https:\/\/example.org\/source"/);
  assert.match(html, /<img src="https:\/\/example.org\/chart.png" alt="Chart"/);
  assert.match(html, /<pre><code>example code/);
});
test('feed sanitizer rejects executable tags, handlers and dangerous links while keeping source text', () => {
  const html = sanitizeFeedHtml('<h2>Bitcoin</h2><script>alert(1)</script><iframe src="https://example.org"></iframe><img src="https://example.org/chart.png" onerror="alert(1)"><a href="javascript:alert(1)">Unsafe</a><a href="https://example.org/source">Original source</a>');
  assert.doesNotMatch(html, /<script|iframe|onerror|javascript:/);
  assert.match(html, /<h2>Bitcoin<\/h2>/);
  assert.match(html, /<a>Unsafe<\/a>/);
  assert.match(html, /href="https:\/\/example.org\/source">Original source/);
  assert.match(html, /<img src="https:\/\/example.org\/chart.png"/);
});
