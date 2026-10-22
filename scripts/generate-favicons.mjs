// Regenerate browser icons from the same vector used by the homepage stamp.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { sunStampSvg } from '../src/lib/sun-stamp.mjs';

const lightInk = '#a13c26';
const darkInk = '#e6bc8e';
const publicFile = name => new URL(`../public/${name}`, import.meta.url);
const mark = sunStampSvg('ink', 'favicon')
  .replace(' class="ink-stamp sun-stamp"', '')
  .replace(' aria-hidden="true" focusable="false"', '');
const svg = mark.replace('<defs>', `<title>gm_₿</title>
  <style>svg { color: ${lightInk}; } @media (prefers-color-scheme: dark) { svg { color: ${darkInk}; } }</style>
  <defs>`);
await writeFile(publicFile('favicon.svg'), svg.replace(/[\t ]+$/gm, '') + '\n');

// Tiny raster fallbacks keep the silhouette crisp; texture remains in the SVG.
const rasterMark = mark
  .replace(/ filter="url\(#[^"]+-wear\)"/g, '')
  .replace('<defs>', `<style>svg { color: ${lightInk}; }</style><defs>`);
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(Buffer.from(rasterMark)).resize(size, size).png().toBuffer()));
await writeFile(publicFile('favicon-16x16.png'), images[0]);
await writeFile(publicFile('favicon-32x32.png'), images[1]);

// ICO directory followed by one PNG frame for each supported size.
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = size;
  directory[entry + 1] = size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(images[index].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
}
await writeFile(publicFile('favicon.ico'), Buffer.concat([directory, ...images]));
await sharp(Buffer.from(mark.replace('<defs>', `<style>svg { color: ${lightInk}; }</style><defs>`)))
  .resize(152, 152)
  .extend({ top: 14, bottom: 14, left: 14, right: 14, background: '#eae1cc' })
  .flatten({ background: '#eae1cc' })
  .png()
  .toFile(fileURLToPath(publicFile('apple-touch-icon.png')));

console.log('Generated SVG, PNG, ICO and Apple touch icons from the ink sun stamp.');
