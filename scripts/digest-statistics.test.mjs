import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { digestStatistics } from '../src/lib/digest-statistics.mjs';

test('reads the published network snapshot without rewriting its numbers or units', () => {
  const source = readFileSync(new URL('../src/content/digests/2026-10-21.md', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('\n---\n', 4) + 5);
  assert.deepEqual(digestStatistics(body), [
    { key: 'price', label: 'Цена', value: '$83 073  (+1.89%)' },
    { key: 'block', label: 'Блок', value: '#972 398' },
    { key: 'hashrate', label: 'Хешрейт', value: '1 048 EH/s' },
    { key: 'fee', label: 'Комиссия', value: '1 сат/vB' },
  ]);
});

test('ignores matching labels in other sections and omits unavailable fields', () => {
  const body = '## Технологии и разработка\n\n```\n  Блок  #123\n```\n\n## Статистика сети\n\n```\n  Блок  #972 398\n  TX    51 038\n```';
  assert.deepEqual(digestStatistics(body), [{ key: 'block', label: 'Блок', value: '#972 398' }]);
});

test('reads the English edition snapshot with stable metric keys and English labels', () => {
  const source = readFileSync(new URL('../src/content/digests-en/2026-10-20.md', import.meta.url), 'utf8');
  assert.deepEqual(digestStatistics(source, 'en'), [
    { key: 'price', label: 'Price', value: '$81,502  (-1.44%)' },
    { key: 'block', label: 'Block', value: '#972,296' },
    { key: 'hashrate', label: 'Hashrate', value: '1,046 EH/s' },
    { key: 'fee', label: 'Fee', value: '1 sat/vB' },
  ]);
  assert.deepEqual(digestStatistics(source, 'ru'), []);
});

test('handles an empty edition or an edition without a published snapshot', () => {
  assert.deepEqual(digestStatistics(), []);
  assert.deepEqual(digestStatistics('## Сообщество\n\n#### Новость\n\nТекст новости.'), []);
  assert.deepEqual(digestStatistics(undefined, 'en'), []);
});
