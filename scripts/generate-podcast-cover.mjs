// Export the website's vector stamp on its light-theme background for podcast RSS.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { sunStampSvg } from '../src/lib/sun-stamp.mjs';

const css = await readFile(new URL('../src/styles/global.css', import.meta.url), 'utf8');
const lightTheme = css.match(/:root\[data-theme="light"\]\s*\{([^}]+)\}/)?.[1] ?? '';
const color = name => {
  const value = lightTheme.match(new RegExp(`--${name}:\\s*(#[a-f0-9]{6})\\s*;`, 'i'))?.[1];
  if (!value) throw new Error(`Missing light-theme color: --${name}`);
  return value;
};
const background = color('bg');
const ink = color('stamp-ink');
const mark = sunStampSvg('ink', 'podcast-cover')
  .replace('<defs>', `<style>svg { color: ${ink}; }</style><defs>`);
const output = new URL('../public/podcasts/gm-bitcoiner-sun-stamp-light-v1.png', import.meta.url);

// Render from the vector, keeping the print texture and generous margins at full size.
await sharp(Buffer.from(mark))
  .resize(2400, 2400)
  .extend({ top: 300, bottom: 300, left: 300, right: 300, background })
  .flatten({ background })
  .removeAlpha()
  .withMetadata({ density: 72 })
  .png({ compressionLevel: 9 })
  .toFile(fileURLToPath(output));

console.log(`Generated ${fileURLToPath(output)} (3000×3000, ${ink} on ${background}).`);
