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
      const args = JSON.parse(process.env.OG_TEST_ARGS);
      if (args[2] === null) args[2] = undefined;
      process.stdout.write(await renderOgPng(...args));
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

async function inkBounds(png, top, height, threshold = 160) {
  const data = await region(png, top, height);
  const xs = [], ys = [];
  for (let index = 0; index < data.length; index += 3) {
    if ((data[index] + data[index + 1] + data[index + 2]) / 3 >= threshold) continue;
    const pixel = index / 3;
    xs.push(pixel % 1200);
    ys.push(top + Math.floor(pixel / 1200));
  }
  if (!xs.length) return undefined;
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

test('undated site covers center the address and tagline with space above the wordmark', async () => {
  for (const [locale, title, description] of [
    ['ru', 'Доброе утро, биткоинер', 'Ежедневные биткоин-онли дайджесты\nу вашего цифрового порога'],
    ['en', 'GM, bitcoiner', 'Your daily Bitcoin-only news digest, delivered to your digital doorstep.'],
  ]) {
    const png = render(title, description, undefined, locale);
    const header = await inkBounds(png, 0, 108);
    assert.ok(header, `${locale}: site address is visible`);
    assert.ok(header.left > 350 && header.right < 850, `${locale}: header contains only the centered site address`);
    assert.ok(Math.abs((header.left + header.right) / 2 - 600) < 4, `${locale}: site address is centered`);
    assert.equal(await inkBounds(png, 120, 70), undefined, `${locale}: wordmark is lower on the cover`);
    const tagline = await inkBounds(png, 354, 236);
    assert.ok(tagline, `${locale}: tagline is visible`);
    assert.ok(Math.abs((tagline.left + tagline.right) / 2 - 600) < 8, `${locale}: tagline is centered horizontally`);
    assert.ok(Math.abs((tagline.top + tagline.bottom) / 2 - 472) < 12, `${locale}: tagline is centered vertically`);
    assert.ok(tagline.bottom - tagline.top > 85, `${locale}: tagline uses larger lettering`);
    assert.equal(await inkBounds(png, 560, 70, 190), undefined, `${locale}: cover has no footer rule or caption`);
  }
});
