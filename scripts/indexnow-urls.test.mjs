import test from 'node:test';
import assert from 'node:assert/strict';
import { changedPublicationUrls } from './indexnow-urls.mjs';
const paths = ['src/content/digests/2026-10-04.md', 'src/content/digests-en/2026-10-04.md',
  'src/content/digests-en/2026-10-03.md', 'src/content/digests-en/2026-02-30.md',
  'src/content/digests-en/nested/2026-10-02.md', 'src/content/digests-en/unknown.md', 'src/content/digests-en/2099-01-01.md'];
const page = path => path.endsWith('/2026-10-04/') ? `<html lang="${path.startsWith('/en/') ? 'en' : 'ru'}">` : undefined;
const ru = ['https://gm.21ideas.org/digests/2026-10-04/', 'https://gm.21ideas.org/', 'https://gm.21ideas.org/digests/'];
test('change notifications retain RU URLs and advertise only actual public English output', () => {
  for (const flag of [undefined, 'false', 'TRUE', ' true']) assert.deepEqual(changedPublicationUrls(paths, { englishPublic: flag, page }), ru);
  assert.deepEqual(changedPublicationUrls(paths, { englishPublic: 'true', page }), [
    ru[0], 'https://gm.21ideas.org/en/digests/2026-10-04/', ru[1], ru[2],
    'https://gm.21ideas.org/en/', 'https://gm.21ideas.org/en/digests/',
  ]);
  assert.deepEqual(changedPublicationUrls(paths, { englishPublic: 'true', page: () => undefined }), []);
  assert.deepEqual(changedPublicationUrls([paths[1]], { englishPublic: 'true', page: () => '<html lang="en"><meta name="robots" content="noindex, follow" />' }), []);
  assert.deepEqual(changedPublicationUrls([paths[1]], { englishPublic: 'true', page: () => '<html lang="ru">' }), []);
});
