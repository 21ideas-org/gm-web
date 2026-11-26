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

test('reads all four metrics from three compact rows in both languages', () => {
  const ru = '## Статистика сети\n\n```\nЗамер: 2026-11-24 00:55 UTC\nРынок    $64 850 · +2,00% за 24 ч\nСеть     Блок #976 041 · 1 033 EH/s\nМемпул   Следующий блок ≈ 2,25 сат/vB\n```';
  const en = '## Network Stats\n\n```\nAs of 2026-11-24 00:55 UTC\nMarket   $64,850 · +2.00% over 24h\nNetwork  Block #976,041 · 1,033 EH/s\nMempool  Next block ≈ 2.25 sat/vB\n```';
  assert.deepEqual(digestStatistics(ru), [
    { key: 'price', label: 'Цена', value: '$64 850 · +2,00% за 24 ч' },
    { key: 'block', label: 'Блок', value: '#976 041' },
    { key: 'hashrate', label: 'Хешрейт', value: '1 033 EH/s' },
    { key: 'fee', label: 'Комиссия', value: '2,25 сат/vB' },
  ]);
  assert.deepEqual(digestStatistics(en, 'en'), [
    { key: 'price', label: 'Price', value: '$64,850 · +2.00% over 24h' },
    { key: 'block', label: 'Block', value: '#976,041' },
    { key: 'hashrate', label: 'Hashrate', value: '1,033 EH/s' },
    { key: 'fee', label: 'Fee', value: '2.25 sat/vB' },
  ]);
});

test('reads compact rows with independently missing metrics', () => {
  const ru = '## Статистика сети\n\n```\nЗамер: 2026-11-24 00:55 UTC\nРынок    $64 850\nСеть     Блок #976 041\n```';
  const en = '## Network Stats\n\n```\nAs of 2026-11-24 00:55 UTC\nNetwork  933 EH/s\nMempool  Next block ≈ 0 sat/vB\n```';
  assert.deepEqual(digestStatistics(ru), [
    { key: 'price', label: 'Цена', value: '$64 850' },
    { key: 'block', label: 'Блок', value: '#976 041' },
  ]);
  assert.deepEqual(digestStatistics(en, 'en'), [
    { key: 'hashrate', label: 'Hashrate', value: '933 EH/s' },
    { key: 'fee', label: 'Fee', value: '0 sat/vB' },
  ]);
});

test('handles an empty edition or an edition without a published snapshot', () => {
  assert.deepEqual(digestStatistics(), []);
  assert.deepEqual(digestStatistics('## Сообщество\n\n#### Новость\n\nТекст новости.'), []);
  assert.deepEqual(digestStatistics(undefined, 'en'), []);
});
