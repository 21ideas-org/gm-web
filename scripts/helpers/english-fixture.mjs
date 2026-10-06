// Small synthetic editions only. Build in an isolated temporary site; never mutate source content.
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { audioGuid, expectedAudioUrl, AUDIO_MEDIA_ORIGIN } from '../../src/lib/audio.mjs';

export const repository = fileURLToPath(new URL('../../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function editionMarkdown(id, locale, { draft = false, pubDate = id } = {}) {
  const title = locale === 'en' ? `GM, bitcoiner — ${id}` : `Доброе утро, биткоинер — ${id}`;
  const body = locale === 'en'
    ? `Intro with [original source](https://example.org/story).\n\n## Technology & Development\n\n#### Synthetic protocol news\n\nA fixture story with a [source](https://example.org/source).\n\n## Price & Market\n\n#### Synthetic market news\n\nAnother fixture story.\n\n## Bitcoin Rap Sheet\n\n#### Synthetic investigation\n\nA final fixture story.\n\n\`\`\`text\nfixture code\n\`\`\`\n`
    : `Синтетическое введение.\n\n## Статистика сети\n\n\`\`\`text\nfixture stats\n\`\`\`\n\n## Технологии и разработка\n\n#### Синтетическая новость\n\n[Источник](https://example.org/source).\n`;
  return `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(locale === 'en' ? `Synthetic English headlines ${id}` : `Синтетический выпуск ${id}`)}\npubDate: ${JSON.stringify(pubDate)}\ndraft: ${draft}\ntags: [tech${locale === 'en' ? ', market, scandals, unknown-future-topic' : ''}]\n---\n\n${body}`;
}
export async function historyFixture() {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ schema: 'bitcoin-calendar.public-events.v2', database: { rows: 1 }, events: [
      { id: 1, date: '2009-10-04', title: 'Синтетическая история', description: 'Тестовое историческое событие.', url_path: '/2009-10-04/fixture/' },
    ] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/events`, requests: () => requests,
    close: () => new Promise(resolve => server.close(resolve)) };
}
export function fixtureSite() {
  const root = mkdtempSync(join(tmpdir(), 'gm-english-'));
  for (const name of ['src', 'public', 'ops-reports', 'astro.config.mjs', 'tsconfig.json', 'package.json']) {
    cpSync(resolve(repository, name), join(root, name), { recursive: true, filter: source =>
      !/\/src\/content\/(?:digests|digests-en)(?:\/|$)/.test(source) && !/\/src\/data\/audio(?:\/|$)/.test(source) });
  }
  symlinkSync(resolve(repository, 'node_modules'), join(root, 'node_modules'), 'dir');
  for (const name of ['digests', 'digests-en']) mkdirSync(join(root, 'src/content', name), { recursive: true });
  mkdirSync(join(root, 'src/data/audio'), { recursive: true });
  for (const id of ['2026-10-04', '2026-10-03', '2026-10-02']) {
    writeFileSync(join(root, 'src/content/digests', `${id}.md`), editionMarkdown(id, 'ru'));
  }
  writeFileSync(join(root, 'src/content/digests/2026-10-05.md'), editionMarkdown('2026-10-05', 'ru', { draft: true }));
  writeFileSync(join(root, 'src/content/digests/unknown.md'), editionMarkdown('unknown', 'ru', { pubDate: '2026-10-06' }));
  const id = '2026-10-04';
  writeFileSync(join(root, `src/data/audio/${id}.json`), JSON.stringify({
    version: 1, episodeId: id, guid: audioGuid(id), publishedAt: `${id}T05:00:00Z`, coveredDate: '2026-10-03',
    digestSha256: sha(readFileSync(join(root, `src/content/digests/${id}.md`))), mediaVersion: 1,
    url: expectedAudioUrl(AUDIO_MEDIA_ORIGIN, id, 1), mimeType: 'audio/mpeg', byteLength: 1234,
    durationSeconds: 60, sha256: sha('synthetic audio metadata; no MP3 exists or is fetched'),
  }));
  return root;
}
export function populateEnglish(root) {
  const dir = join(root, 'src/content/digests-en');
  for (const id of ['2026-10-04', '2026-10-01']) writeFileSync(join(dir, `${id}.md`), editionMarkdown(id, 'en'));
  writeFileSync(join(dir, '2026-10-03.md'), editionMarkdown('2026-10-03', 'en', { draft: true }));
  for (const id of ['unknown', '2026-02-30', '2026-10-04-en', '2026-10-06']) {
    writeFileSync(join(dir, `${id}.md`), editionMarkdown(id, 'en', { pubDate: '2026-10-05' }));
  }
  mkdirSync(join(dir, 'nested'));
  writeFileSync(join(dir, 'nested/2026-10-02.md'), editionMarkdown('2026-10-02', 'en'));
}
export async function buildFixture(root, historyUrl, flag, timezone = 'America/Los_Angeles') {
  const env = { ...process.env, HISTORY_API_URL: historyUrl, TZ: timezone };
  delete env.EN_EDITION_PUBLIC;
  if (flag !== undefined) env.EN_EDITION_PUBLIC = flag;
  // Clear the content cache: each scenario must actually load its own input collection.
  rmSync(join(root, '.astro'), { recursive: true, force: true });
  rmSync(join(root, 'dist'), { recursive: true, force: true });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(repository, 'node_modules/astro/bin/astro.mjs'), 'build'], { cwd: root, env });
    let output = '';
    child.stdout.on('data', data => output += data);
    child.stderr.on('data', data => output += data);
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`Fixture build failed (${code}):\n${output}`)));
  });
}
