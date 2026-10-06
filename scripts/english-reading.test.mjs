import test from 'node:test';
import assert from 'node:assert/strict';
import { editionPublic, eligibleEdition, languageDestination, publishedEditions } from '../src/lib/editions.mjs';

const edition = (id, options = {}) => ({ id, data: { pubDate: new Date(`${id}T00:00:00Z`), draft: false, ...options } });

test('English public flag accepts only the documented true value and otherwise fails closed', () => {
  assert.equal(editionPublic('true'), true);
  for (const value of [undefined, null, '', false, true, 'false', '1', 'TRUE', ' true', 'true ', 'garbage']) {
    assert.equal(editionPublic(value), false, String(value));
  }
});

test('only non-draft date-only identities matching their UTC publication date are eligible', () => {
  assert.equal(eligibleEdition(edition('2026-10-04')), true);
  assert.equal(eligibleEdition(edition('2024-02-29')), true);
  for (const post of [
    edition('2026-10-04', { draft: true }), edition('2026-10-04', { draft: 'false' }),
    edition('unknown'), edition('2026-02-30'), edition('2026-10-04-en'), edition('nested/2026-10-04'),
    edition('2026-10-04', { pubDate: new Date('2026-10-05T00:00:00Z') }),
    edition('2026-10-04', { pubDate: new Date('bad') }), {}, null,
  ]) assert.equal(eligibleEdition(post), false);
  const posts = [edition('2026-10-01'), edition('2026-10-04'), edition('2026-10-03', { draft: true })];
  assert.deepEqual(publishedEditions(posts).map(p => p.id), ['2026-10-04', '2026-10-01']);
  assert.equal(posts[0].id, '2026-10-01');
});

test('edition switching uses an actual eligible counterpart, otherwise its labelled archive', () => {
  const posts = [edition('2026-10-04'), edition('2026-10-03', { draft: true })];
  assert.deepEqual(languageDestination('en', '/en/digests/2026-10-04/', posts), {
    href: '/digests/2026-10-04/', label: 'Russian edition', locale: 'ru',
  });
  for (const path of ['/en/digests/2026-10-03/', '/en/digests/2026-10-02/']) {
    assert.deepEqual(languageDestination('en', path, posts), { href: '/digests/', label: 'Russian archive', locale: 'ru' });
  }
  assert.deepEqual(languageDestination('ru', '/digests/2026-10-04/', posts), {
    href: '/en/digests/2026-10-04/', label: 'English edition', locale: 'en',
  });
  assert.equal(languageDestination('ru', '/digests/2026-10-03/', posts).href, '/en/digests/');
  assert.equal(languageDestination('en', '/en/about/', []).href, '/about/');
  assert.equal(languageDestination('ru', '/support', []).href, '/en/support/');
});
