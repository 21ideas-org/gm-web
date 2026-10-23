import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repository = fileURLToPath(new URL('../', import.meta.url));
// The renderer is TypeScript; use Node 22's built-in loader without changing the test runner.
function render(...args) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module'], {
    cwd: repository,
    env: { ...process.env, OG_TEST_ARGS: JSON.stringify(args) },
    input: `
      const localFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        if (!String(url).startsWith('data:')) throw new Error('OG rendering must not require network access');
        return localFetch(url, options);
      };
      const { renderOgPng } = await import('./src/lib/og.ts');
      process.stdout.write(await renderOgPng(...JSON.parse(process.env.OG_TEST_ARGS)));
    `,
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr.toString());
  assert.equal(result.stdout.subarray(1, 4).toString(), 'PNG');
  return result.stdout;
}

const region = (png, top, height) => sharp(png)
  .extract({ left: 0, top, width: 1200, height }).removeAlpha().raw().toBuffer();

async function sameRegion(first, next, top, height) {
  const [a, b] = await Promise.all([region(first, top, height), region(next, top, height)]);
  assert.equal(a.length, b.length);
  // Adaptive PNG palettes can slightly change RGB values in otherwise identical regions.
  return a.every((value, index) => Math.abs(value - b[index]) <= 8);
}

test('English issue dates change the header while keeping the wordmark and summary stable', async () => {
  const description = 'Your daily Bitcoin-only news digest, with original sources.';
  const first = render('GM, bitcoiner — October 22, 2026', description, '22 October 2026', 'en');
  const next = render('GM, bitcoiner — October 23, 2026', description, '23 October 2026', 'en');
  const metadata = await sharp(first).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  assert.ok(!await sameRegion(first, next, 0, 108), 'Issue date is visible in the header');
  assert.ok(await sameRegion(first, next, 108, 522), 'Issue date is not duplicated in the wordmark');
});

test('long Cyrillic summaries leave the footer visible and unchanged', async () => {
  const short = render('Доброе утро, биткоинер', 'Главные биткоин-новости за сутки.', '22.10.2026');
  const long = render('Доброе утро, биткоинер', 'Биткоин, технологии, майнинг и Lightning. '.repeat(30), '22.10.2026');
  assert.ok(!await sameRegion(short, long, 294, 250), 'Summary content is rendered');
  assert.ok(await sameRegion(short, long, 564, 66), 'Summary does not obscure the footer');
});
