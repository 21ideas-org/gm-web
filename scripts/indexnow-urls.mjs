// Pure notification selector: no network or deployment invocation.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editionPublic } from '../src/lib/editions.mjs';
const SITE = 'https://gm.21ideas.org';

/** @param {string[]} paths @param {{ englishPublic?: unknown, page: (path: string) => string | undefined }} options */
export function changedPublicationUrls(paths, { englishPublic, page }) {
  const urls = new Set();
  const locales = new Set();
  for (const path of paths) {
    const match = /^src\/content\/(digests|digests-en)\/(\d{4}-\d{2}-\d{2})\.md$/.exec(path);
    if (!match) continue;
    const [, collection, id] = match;
    const date = new Date(`${id}T00:00:00Z`);
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== id) continue;
    const en = collection === 'digests-en';
    if (en && !editionPublic(englishPublic)) continue;
    const prefix = en ? '/en' : '';
    const route = `${prefix}/digests/${id}/`;
    const html = page(route);
    if (!html || (en && (!html.includes('<html lang="en"') || /<meta name="robots" content="noindex/.test(html)))) continue;
    urls.add(`${SITE}${route}`);
    locales.add(prefix);
  }
  for (const prefix of locales) {
    urls.add(`${SITE}${prefix}/`);
    urls.add(`${SITE}${prefix}/digests/`);
  }
  return [...urls];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const urls = changedPublicationUrls(readFileSync(0, 'utf8').split('\n'), {
    englishPublic: process.env.EN_EDITION_PUBLIC,
    page(route) {
      const file = join('dist', route, 'index.html');
      return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    },
  });
  process.stdout.write(urls.join('\n') + (urls.length ? '\n' : ''));
}
