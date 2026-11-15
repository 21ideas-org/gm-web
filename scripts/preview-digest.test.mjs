import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { renderDigestPreview } from './preview-digest.mjs';

const content = '# Intro\n\n## Topic\n\n#### First\n\nFirst news.\n\n#### Second\n\nSecond news.\n\n#### Third\n\nThird news.';
const recommendation = { storyIndex: 1, articleId: 'passphrase-strength', url: 'https://21ideas.org/passphrase/',
  title: 'Test & title', before: 'На 21ideas', anchor: 'объясняем', after: ', как работают парольные фразы.' };
const bundle = { date: '2026-11-10', format: 'markdown', content, recommendation,
  contentSha256: createHash('sha256').update(content).digest('hex') };

test('the preview inserts one editor and callout directly below the chosen story', () => {
  const html = renderDigestPreview(bundle);
  assert.equal((html.match(/<aside class="reading-note"/g) || []).length, 1);
  assert.match(html, /<h4 id="review-story">Second<\/h4>\s*<p>Second news\.<\/p><aside class="reading-note"/);
  assert.match(html, /Test &amp; title/);
  assert.match(html, /<form id="review-form"/);
  assert.match(html, /<h4>Third<\/h4>/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /Глагол-ссылка<input name="anchor" maxlength="32" pattern="\[\\p\{L\}\]\+"/);
});

test('quiet, stale and invalid preview inputs do not expose a review action', () => {
  assert.doesNotMatch(renderDigestPreview({ ...bundle, recommendation: null }), /<form id="review-form"/);
  assert.throws(() => renderDigestPreview({ ...bundle, content: 'changed' }), /Invalid digest/);
  assert.throws(() => renderDigestPreview({ ...bundle, recommendation: { ...recommendation, storyIndex: 7 } }), /missing/);
  assert.throws(() => renderDigestPreview({ ...bundle, recommendation: { ...recommendation, url: 'https://invalid.test' } }), /Invalid recommendation/);
  assert.throws(() => renderDigestPreview({ ...bundle, recommendation: { ...recommendation, anchor: 'длинная ссылка' } }), /Invalid recommendation/);
});

test('historical HTML and editor text cannot introduce markup into the page', () => {
  const saved = '<h4>News</h4><p onmouseover="bad()">Text<script>bad()</script></p>';
  const html = renderDigestPreview({ ...bundle, format: 'html', content: saved,
    contentSha256: createHash('sha256').update(saved).digest('hex'),
    recommendation: { ...recommendation, storyIndex: 0, before: '</script><img src=x>' } });
  assert.doesNotMatch(html, /onmouseover=|<script>bad\(\)|<img src=x>/);
  assert.match(html, /<h4 id="review-story">News<\/h4><p>Text<\/p><aside/);
});
