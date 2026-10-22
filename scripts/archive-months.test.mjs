import assert from 'node:assert/strict';
import test from 'node:test';
import { archiveMonths, archiveMonthLabel, archiveMonthTitle } from '../src/lib/archive-months.mjs';

const post = id => ({ id, data: { pubDate: new Date(`${id}T00:00:00Z`) } });

test('groups published editions by UTC month, newest first, without changing the input', () => {
  const posts = ['2026-12-30', '2027-01-01', '2026-12-31', '2026-10-04'].map(post);
  const groups = archiveMonths(posts);
  assert.deepEqual(groups.map(group => [group.key, group.posts.map(post => post.id)]), [
    ['2027-01', ['2027-01-01']],
    ['2026-12', ['2026-12-31', '2026-12-30']],
    ['2026-10', ['2026-10-04']],
  ]);
  assert.deepEqual(posts.map(post => post.id), ['2026-12-30', '2027-01-01', '2026-12-31', '2026-10-04']);
  assert.deepEqual(archiveMonths([]), []);
});

test('month labels omit the current year and distinguish every previous year', () => {
  assert.equal(archiveMonthLabel('2026-01', 'ru', 2026), 'январь');
  assert.equal(archiveMonthLabel('2026-02', 'ru', 2026), 'февраль');
  assert.equal(archiveMonthLabel('2026-01', 'ru', 2027), 'январь 26');
  assert.equal(archiveMonthLabel('2026-02', 'ru', 2028), 'февраль 26');
  assert.equal(archiveMonthLabel('2027-01', 'ru', 2028), 'январь 27');
  assert.equal(archiveMonthLabel('2028-01', 'ru', 2028), 'январь');
});

test('English month labels and full page titles use the same publication months', () => {
  assert.equal(archiveMonthLabel('2026-10', 'en', 2026), 'October');
  assert.equal(archiveMonthLabel('2026-10', 'en', 2028), 'October 26');
  assert.equal(archiveMonthLabel('2027-01', 'en', 2028), 'January 27');
  assert.equal(archiveMonthTitle('2026-10', 'en'), 'October 2026');
  assert.equal(archiveMonthTitle('2026-10', 'ru'), 'октябрь 2026');
});
