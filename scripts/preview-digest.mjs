import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const markdown = new MarkdownIt();
const escape = markdown.utils.escapeHtml;
const hash = value => createHash('sha256').update(value).digest('hex');

function styles() {
  const fonts = read('src/styles/fonts.css').replace(/url\(\.\.\/assets\/fonts\/web\/([^)]*)\)/g, (_, name) =>
    `url(data:font/woff2;base64,${readFileSync(new URL('src/assets/fonts/web/' + name, root)).toString('base64')})`);
  const paper = readFileSync(new URL('public/textures/newsprint.svg', root)).toString('base64');
  return read('src/styles/global.css').replace("@import './fonts.css';", fonts)
    .replace("url('/textures/newsprint.svg')", `url(data:image/svg+xml;base64,${paper})`) +
    read('scripts/digest-review/styles.css');
}

export function renderDigestPreview(bundle) {
  const { date, format, content, contentSha256, recommendation } = bundle;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof content !== 'string' ||
      !['markdown', 'html'].includes(format) || hash(content) !== contentSha256) throw new Error('Invalid digest preview bundle');
  const html = format === 'markdown' ? markdown.render(content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')) : content;
  let body = sanitizeHtml(html, { allowedTags: [...sanitizeHtml.defaults.allowedTags, 'h4'],
    allowedAttributes: { a: ['href', 'title'] }, allowedSchemes: ['http', 'https'], allowProtocolRelative: false });

  let insertion;
  let heading;
  if (recommendation) {
    const { storyIndex, articleId, url, title, before, anchor, after } = recommendation;
    const destination = new URL(url);
    if (!Number.isInteger(storyIndex) || storyIndex < 0 || destination.origin !== 'https://21ideas.org' ||
        destination.username || destination.password || !/^[a-z0-9-]+$/.test(articleId) ||
        [title, before, anchor, after].some(v => typeof v !== 'string') || !/^\p{L}{1,32}$/u.test(anchor)) throw new Error('Invalid recommendation');
    const headings = [...body.matchAll(/<h4>/g)];
    const start = headings[storyIndex]?.index;
    if (start === undefined) throw new Error('Recommended story is missing from the digest');
    const end = headings[storyIndex + 1]?.index ?? body.length;
    const story = body.slice(start, end);
    const gloss = /^<h4>[\s\S]*?<\/h4>\s*<p>[\s\S]*?<\/p>/.exec(story);
    if (!gloss) throw new Error('Recommended story has no paragraph');
    insertion = start + gloss[0].length;
    heading = start;
  }

  const state = JSON.stringify({ date, contentSha256, recommendation, storageKey: 'gm-digest-review:' + hash(JSON.stringify(bundle)) })
    .replace(/</g, '\\u003c');
  if (recommendation) {
    const editor = `<aside class="reading-note" id="reading-note"><p><span></span><a></a><span></span></p></aside>
<form id="review-form" class="review-form">
<p class="article-title">${escape(recommendation.title)}</p>
<div class="review-fields">
<label>Текст до ссылки<input name="before" maxlength="160"></label>
<label>Глагол-ссылка<input name="anchor" maxlength="32" pattern="[\\p{L}]+" required></label>
<label>Текст после ссылки<textarea name="after" rows="2" maxlength="260"></textarea></label>
</div>
<div class="review-actions">
<button type="submit">Подтвердить</button><button type="button" id="skip">Пропустить</button>
<button type="button" id="save" disabled>Скачать решение</button>
<span id="review-status" role="status"></span>
</div></form>`;
    body = body.slice(0, heading) + '<h4 id="review-story">' + body.slice(heading + '<h4>'.length, insertion) + editor + body.slice(insertion);
  }
  const navigation = recommendation ? '<p><a href="#review-story">К рекомендации ↓</a></p>' : '<p>Для этого выпуска нет рекомендации.</p>';

  return `<!doctype html>
<html lang="ru">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'">
<title>Предпросмотр дайджеста — ${date}</title>
<style>${styles()}</style>
<body>
<main class="digest-review">
<header class="preview-header"><div><p class="preview-kicker">Предпросмотр дайджеста · ${date}</p>
<h1>Доброе утро, биткоинер</h1></div><button type="button" id="theme">Сменить тему</button></header>
${navigation}
<article class="prose">${body}</article>
</main>
<script id="review-data" type="application/json">${state}</script>
<script>${read('scripts/digest-review/editor.js')}</script>
</body></html>
`;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    if (process.argv.length !== 3) throw new Error(`Usage: node ${fileURLToPath(import.meta.url)} <bundle.json>`);
    process.stdout.write(renderDigestPreview(JSON.parse(readFileSync(process.argv[2], 'utf8'))));
  } catch (error) {
    process.stderr.write(`preview-digest: ${error.message}\n`);
    process.exitCode = 1;
  }
}
