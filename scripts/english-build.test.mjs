import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { changedPublicationUrls } from './indexnow-urls.mjs';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import sanitizeHtml from 'sanitize-html';
import { runInNewContext } from 'node:vm';
import { fixtureSite, populateEnglish, qualifyRussianHub, buildFixture, historyFixture } from './helpers/english-fixture.mjs';

const html = (root, path) => readFileSync(join(root, 'dist', path, 'index.html'), 'utf8');
const allHtml = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? allHtml(join(directory, entry.name)) : entry.name.endsWith('.html') ? [join(directory, entry.name)] : []);
const visible = html => sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
const switchLink = html => {
  const link = /<a\b[^>]*class="language-switch"[^>]*>/.exec(html)?.[0];
  if (!link) return undefined;
  return [/\bhref="([^"]+)"/.exec(link)?.[1], /\baria-label="([^"]+)"/.exec(link)?.[1]];
};
const internalLinks = html => [...html.matchAll(/\b(?:href|src)="(\/[^" ]*)"/g)].map(match => match[1]);

function validateEnglish(root, isPublic, populated) {
  assert.ok(existsSync(join(root, 'dist/en/rss.xml')), 'English text feed is built');
  const paths = ['', 'digests', 'about', 'support', '404', 'tags', ...['community', 'funds', 'institutions', 'lightning', 'market', 'mining', 'regulation', 'scandals', 'security', 'tech'].map(slug => `tags/${slug}`), ...(populated ? ['digests/2026-10-04', 'digests/2026-10-01'] : [])];
  assert.equal(allHtml(join(root, 'dist/en')).length, paths.length);
  for (const path of paths) {
    const page = html(root, `en/${path}`);
    assert.match(page, /<html lang="en"/);
    assert.match(page, /aria-label="(?:Switch to dark theme|Toggle theme)"/);
    assert.match(page, /aria-label="Primary navigation"/);
    assert.match(page, new RegExp(`<meta name="robots" content="${isPublic && path !== '404' && (!path.startsWith('tags/') || (populated && path === 'tags/tech')) ? 'index, follow' : 'noindex, follow'}`));
    assert.doesNotMatch(visible(page), /[А-Яа-яЁё]/u, `Russian visible text at ${path}`);
    assert.doesNotMatch(page, /aria-label="[^"]*[А-Яа-яЁё]/u, `Russian a11y text at ${path}`);
    assert.doesNotMatch(page, /<audio\b|audio\.21ideas\.org|podcast\.xml|bitcoin-calendar/);
    assert.doesNotMatch(page, /href="\/(?:en\/)?(?:listen|projects|buy-bitcoin)(?:\/|")/);
    for (const url of internalLinks(page)) {
      const path = url.split('#')[0];
      assert.ok(existsSync(join(root, 'dist', path)) || existsSync(join(root, 'dist', path, 'index.html')), `Broken link ${url}`);

    }
  }
  const errorPage = html(root, 'en/404');
  assert.match(visible(errorPage), /The page you requested could not be found/);
  assert.match(errorPage, /href="\/en\/digests\/"/);
  const inlineScripts = page => [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const redirect = inlineScripts(html(root, '')).find(script => script.includes("location.replace('/en/404/"));
  // The redirect belongs to the shared host 404, not normal home/navigation pages.
  assert.equal(redirect, undefined);
  const host404 = readFileSync(join(root, 'dist/404.html'), 'utf8');
  const redirectScript = inlineScripts(host404).find(script => script.includes("location.replace('/en/404/"));
  assert.ok(redirectScript);
  for (const path of ['/en', '/en/missing', '/en/digests/2026-10-09/']) {
    let destination;
    runInNewContext(redirectScript, { location: { pathname: path, search: '?token=do-not-forward', replace(url) { destination = url; } }, encodeURIComponent });
    assert.equal(destination, `/en/404/?path=${encodeURIComponent(path)}`);
  }
  for (const path of ['/missing', '/en/404', '/en/404/']) {
    let redirected = false;
    runInNewContext(redirectScript, { location: { pathname: path, replace() { redirected = true; } }, encodeURIComponent });
    assert.equal(redirected, false);
  }
  const pathScript = inlineScripts(errorPage).find(script => script.includes("querySelectorAll('.req-path')"));
  const hostilePath = '/en/<img src=x onerror=alert(1)>';
  const labels = [{ textContent: '' }, { textContent: '' }];
  runInNewContext(pathScript, { location: { pathname: '/en/404/', search: `?path=${encodeURIComponent(hostilePath)}` },
    document: { documentElement: { lang: 'en' }, querySelectorAll() { return labels; } }, URLSearchParams });
  assert.deepEqual(labels.map(label => label.textContent), [hostilePath, hostilePath]);
  const archive = html(root, 'en/digests');
  assert.equal(switchLink(archive)?.[0], '/digests/');
  if (populated) {
    assert.match(archive, /2 editions/);
    assert.ok(archive.indexOf('digests/2026-10-04/') < archive.indexOf('digests/2026-10-01/'));
    assert.deepEqual(switchLink(html(root, 'en/digests/2026-10-04')), ['/digests/2026-10-04/', 'Russian edition']);
    assert.deepEqual(switchLink(html(root, 'en/digests/2026-10-01')), ['/digests/', 'Russian archive']);
    const edition = html(root, 'en/digests/2026-10-04');
    assert.match(edition, /4 October 2026/);
    assert.match(edition, /aria-label="Breadcrumbs"/);
    assert.match(edition, /aria-label="Edition topics"/);
    const chips = /<div\b([^>]*\bclass="tag-chips tag-chips--static"[^>]*)>([\s\S]*?)<\/div>/.exec(edition);
    assert.ok(chips, 'EN topic chips use the wrapping informational group');
    assert.doesNotMatch(chips[1], /data-scroller/);
    assert.match(chips[2], /href="\/en\/tags\/tech\/"/);
    assert.match(edition, /aria-label="Adjacent editions"/);
    for (const [slug, label] of [['tech', 'Technology &amp; Development'], ['market', 'Price &amp; Market'], ['scandals', 'Bitcoin Rap Sheet']]) {
      assert.ok(edition.includes(`#${label}`), label);
      assert.ok(edition.includes(`id="${slug}"`));
      assert.ok(edition.includes(`id="${slug}-1"`));
      assert.ok(edition.includes(`href="#${slug}-1"`));
    }
    assert.match(edition, /aria-label="Copy code"/);
    assert.match(edition, /href="\/en\/digests\/2026-10-01\/"/);
  } else {
    assert.match(archive, /No English editions have been published yet/);
    assert.match(html(root, 'en'), /No English editions have been published yet/);
  }
  validateDiscovery(root, isPublic, populated);
  const ruSupport = html(root, 'support');
  const enSupport = html(root, 'en/support');
  assert.match(enSupport, /gmbitcoiner@coinos\.io/);
  assert.match(enSupport, /aria-label="Copy ⚡ lightning address"/);
  // Shared raw addresses and exact ledger numbers, rather than a second finance dataset.
  const wallets = page => [...page.matchAll(/<pre class="code-block"><code>([^<]+)<\/code><\/pre>/g)].map(match => match[1]);
  const amounts = page => [...page.matchAll(/<td[^>]*>([^<]+)<\/td>/g)].map(match => match[1]).filter(value => value !== 'TOTAL' && value !== 'ИТОГО');
  assert.deepEqual(wallets(enSupport), wallets(ruSupport));
  assert.deepEqual(amounts(enSupport), amounts(ruSupport));
  for (const file of ['rss.xml', 'yandex-news.xml', 'llms.txt', 'podcast.xml', ...(!isPublic ? ['sitemap-0.xml', 'news-sitemap.xml', 'tags-sitemap.xml'] : [])]) {
    assert.doesNotMatch(readFileSync(join(root, 'dist', file), 'utf8'), /gm\.21ideas\.org\/en\//, `${file} leaked English discovery`);
  }
}
const alternateLinks = page => [...page.matchAll(/<link rel="alternate" hreflang="(ru|en)" href="([^"]+)"/g)].map(m => [m[1], m[2]]);
function validateDiscovery(root, isPublic, populated) {
  const dist = join(root, 'dist');
  const xmlCheck = spawnSync('python3', ['-c', 'import sys, pathlib, xml.etree.ElementTree as ET; [ET.parse(p) for p in pathlib.Path(sys.argv[1]).rglob("*.xml")]', dist], { encoding: 'utf8' });
  assert.equal(xmlCheck.status, 0, xmlCheck.stderr);
  const feed = readFileSync(join(dist, 'en/rss.xml'), 'utf8');
  assert.match(feed, /<language>en-US<\/language>/);
  assert.match(feed, /<title>GM, bitcoiner<\/title>/);
  assert.match(feed, /https:\/\/gm.21ideas.org\/en\/rss.xml/);
  const items = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
  assert.equal(items.length, isPublic && populated ? 2 : 0);
  if (items.length) {
    assert.match(items[0], /https:\/\/gm.21ideas.org\/en\/digests\/2026-10-04\//);
    assert.match(items[0], /<pubDate>Sun, 04 Oct 2026 00:00:00 GMT<\/pubDate>/);
    assert.match(items[0], /Technology &amp;amp; Development/);
    assert.match(items[0], /https:\/\/example.org\/source/);
    assert.match(items[0], /Synthetic protocol fourth/);
    assert.doesNotMatch(items[0], /onerror=|<script|href=&quot;javascript:|[А-Яа-яЁё]/u);
  }
  const news = readFileSync(join(dist, 'news-sitemap.xml'), 'utf8');
  if (isPublic && populated) {
    assert.match(news, /<loc>https:\/\/gm.21ideas.org\/en\/digests\/2026-10-04\/<\/loc>/);
    assert.match(news, /<news:name>GM, bitcoiner<\/news:name><news:language>en<\/news:language>/);
    assert.match(news, /<news:publication_date>2026-10-04T00:00:00.000Z<\/news:publication_date>/);
  } else assert.doesNotMatch(news, /\/en\//);
  assert.doesNotMatch(news, /\/en\/digests\/2026-10-01\/|2099/);
  const ruFeed = readFileSync(join(dist, 'rss.xml'), 'utf8');
  assert.match(ruFeed, /<language>ru-ru<\/language>/);
  assert.match(ruFeed, /Доброе утро, биткоинер/);
  assert.doesNotMatch(ruFeed, /Synthetic protocol|\/en\//);
  const sitemap = readFileSync(join(dist, 'sitemap-0.xml'), 'utf8');
  const tagmap = readFileSync(join(dist, 'tags-sitemap.xml'), 'utf8');
  if (isPublic) {
    assert.match(sitemap, /https:\/\/gm.21ideas.org\/en\/about\//);
    if (populated) {
      assert.match(sitemap, /https:\/\/gm.21ideas.org\/en\/digests\/2026-10-04\//);
      assert.match(tagmap, /<loc>https:\/\/gm.21ideas.org\/en\/tags\/tech\/<\/loc><lastmod>2026-10-04T00:00:00.000Z/);
    }
  }
  assert.doesNotMatch(tagmap, /\/en\/tags\/market\/|<loc>https:\/\/gm.21ideas.org\/tags\/tech\//);
  assert.doesNotMatch(sitemap, /\/tags\/|\/404\/|2099|unknown|\/en\/digests\/2026-10-03\//);
  for (const path of ['', 'digests', 'about', 'support', 'tags']) {
    const expected = isPublic ? [['ru', `https://gm.21ideas.org/${path ? `${path}/` : ''}`], ['en', `https://gm.21ideas.org/en/${path ? `${path}/` : ''}`]] : [];
    assert.deepEqual(alternateLinks(html(root, path)), expected);
    assert.deepEqual(alternateLinks(html(root, `en/${path}`)), expected);
  }
  assert.deepEqual(alternateLinks(html(root, 'en/404')), []);
  assert.deepEqual(alternateLinks(html(root, 'en/tags/tech')), [], 'RU tech hub is thin independently');
  const enHome = html(root, 'en');
  assert.equal(enHome.includes('type="application/rss+xml"'), isPublic);
  assert.match(enHome, /https:\/\/gm.21ideas.org\/og\/en\/default.png/);
  const ld = page => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(page)[1])['@graph'];
  const website = ld(enHome).find(n => n['@type'] === 'WebSite');
  assert.equal(website.name, 'GM, bitcoiner');
  assert.equal(website.inLanguage, 'en-US');
  assert.equal(website.url, 'https://gm.21ideas.org/en/');
  assert.equal(ld(enHome).find(n => n['@type'] === 'NewsMediaOrganization').name, 'GM, bitcoiner');
  if (populated) {
    const page = html(root, 'en/digests/2026-10-04');
    const article = ld(page).find(n => n['@type'] === 'NewsArticle');
    assert.equal(article.inLanguage, 'en-US');
    assert.equal(article.headline, 'GM, bitcoiner — 2026-10-04');
    assert.equal(article.url, 'https://gm.21ideas.org/en/digests/2026-10-04/');
    assert.deepEqual(article.image, ['https://gm.21ideas.org/og/en/2026-10-04.png']);
    assert.equal(article.datePublished, '2026-10-04T00:00:00.000Z');
    assert.equal(article.articleSection, 'Bitcoin');
    const pair = isPublic ? [['ru', 'https://gm.21ideas.org/digests/2026-10-04/'], ['en', article.url]] : [];
    assert.deepEqual(alternateLinks(page), pair);
    assert.deepEqual(alternateLinks(html(root, 'digests/2026-10-04')), pair);
    assert.deepEqual(alternateLinks(html(root, 'en/digests/2026-10-01')), []);
    assert.deepEqual(alternateLinks(html(root, 'digests/2026-10-03')), []);
    const hub = html(root, 'en/tags/tech');
    assert.match(hub, /Synthetic protocol fourth/);
    for (const link of internalLinks(hub).filter(l => l.startsWith('/en/digests/') && l.includes('#'))) {
      const [path, anchor] = link.split('#');
      assert.ok(html(root, path).includes(`id="${anchor}"`), `Broken heading ${link}`);
    }
    assert.match(hub, /#tech-4/);
    assert.doesNotMatch(hub, /Unmapped story|Синтетическая/u);
    assert.deepEqual(switchLink(hub), ['/tags/tech/', 'Russian']);
    const png = readFileSync(join(dist, 'og/en/2026-10-04.png'));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
    assert.notDeepEqual(png, readFileSync(join(dist, 'og/2026-10-04.png')));
  }
  const changed = ['2026-10-04', '2026-10-03', '2026-10-06', '2099-01-01', 'unknown'].map(id => `src/content/digests-en/${id}.md`);
  const notifications = changedPublicationUrls(changed, { englishPublic: isPublic ? 'true' : undefined,
    page: path => existsSync(join(dist, path, 'index.html')) ? html(root, path) : undefined,
  });
  assert.deepEqual(notifications, isPublic && populated ? ['https://gm.21ideas.org/en/digests/2026-10-04/', 'https://gm.21ideas.org/en/', 'https://gm.21ideas.org/en/digests/'] : []);
  assert.ok(!existsSync(join(dist, 'en/digests/2099-01-01/index.html')));
  assert.ok(!existsSync(join(dist, 'og/en/2099-01-01.png')));
}
function validateRussian(root, isPublic, populated) {
  const routeInventory = allHtml(join(root, 'dist')).map(path => relative(join(root, 'dist'), path)).filter(path => !path.startsWith('en/'));
  assert.deepEqual(routeInventory.sort(), ['404.html', 'about/index.html', 'buy-bitcoin/index.html', 'digests/2026-10-02/index.html', 'digests/2026-10-03/index.html', 'digests/2026-10-04/index.html', 'digests/index.html', 'index.html', 'listen/index.html', 'projects/index.html', 'support/index.html', 'tags/index.html', ...['community', 'funds', 'institutions', 'lightning', 'market', 'mining', 'regulation', 'scandals', 'security', 'tech'].map(slug => `tags/${slug}/index.html`)].sort());
  const post = html(root, 'digests/2026-10-04');
  assert.match(post, /<html lang="ru"/);
  assert.match(post, /04-10-2026/);
  assert.match(post, /4 октября 2026/);
  assert.match(post, /Сегодня в истории/);
  assert.match(post, /Синтетическая история/);
  assert.match(post, /<audio\b/);
  assert.match(post, /preload="none"/);
  assert.match(post, /class="audio-toggle"/);
  assert.match(post, /href="\/tags\/tech"/);
  assert.match(post, /href="\/rss.xml"/);
  assert.match(post, /href="\/listen\/"/);
  assert.match(html(root, 'listen'), /id="episode-2026-10-04"/);
  assert.match(html(root, ''), /подписаться/);
  const podcast = readFileSync(join(root, 'dist/podcast.xml'), 'utf8');
  assert.match(podcast, /<guid isPermaLink="false">gm-audio:2026-10-04<\/guid>/);
  assert.match(podcast, /https:\/\/audio.21ideas.org\/podcasts\/2026-10-04.mp3/);
  assert.match(podcast, /https:\/\/gm.21ideas.org\/digests\/2026-10-04\//);
  for (const pagePath of ['', 'digests', 'digests/2026-10-04', 'about', 'support', 'listen']) {
    assert.equal(Boolean(switchLink(html(root, pagePath))), isPublic, `Unexpected RU promotion at ${pagePath}`);
  }
  if (isPublic) {
    assert.deepEqual(switchLink(post), populated ? ['/en/digests/2026-10-04/', 'English edition'] : ['/en/digests/', 'English archive']);
    assert.deepEqual(switchLink(html(root, 'digests/2026-10-03')), ['/en/digests/', 'English archive']);
  }
  assert.ok(!existsSync(join(root, 'dist/digests/2026-10-05/index.html')));
  assert.ok(!existsSync(join(root, 'dist/digests/unknown/index.html')));
}

test('isolated EN/RU builds cover empty, published, draft, malformed, missing-pair and public/private editions', { timeout: 180000 }, async t => {
  const root = fixtureSite();
  const history = await historyFixture();
  try {
    const scenarios = [
      { name: 'empty default private', populated: false },
      { name: 'populated default private', populated: true },
      { name: 'malformed flag stays private', populated: true, flag: 'TRUE' },
      { name: 'explicit public', populated: true, flag: 'true', public: true, timezone: 'Pacific/Kiritimati' },
    ];
    for (const scenario of scenarios) {
      await t.test(scenario.name, async () => {
        if (scenario.name === 'populated default private') populateEnglish(root);
        const before = history.requests();
        const output = await buildFixture(root, history.url, scenario.flag, scenario.timezone);
        assert.equal(history.requests() - before, 1, 'RU history is fetched once per build; EN does not trigger additional calls');
        assert.match(output, /\[history\] fetch ok/);
        validateEnglish(root, Boolean(scenario.public), scenario.populated);
        validateRussian(root, Boolean(scenario.public), scenario.populated);
      });
    }
    await t.test('reciprocal public hub pair after both independent floors qualify', async () => {
      qualifyRussianHub(root);
      await buildFixture(root, history.url, 'true');
      const expected = [['ru', 'https://gm.21ideas.org/tags/tech/'], ['en', 'https://gm.21ideas.org/en/tags/tech/']];
      for (const path of ['tags/tech', 'en/tags/tech']) {
        assert.deepEqual(alternateLinks(html(root, path)), expected);
        assert.match(html(root, path), /<meta name="robots" content="index, follow/);
      }
      const sitemap = readFileSync(join(root, 'dist/tags-sitemap.xml'), 'utf8');
      assert.match(sitemap, /<loc>https:\/\/gm.21ideas.org\/tags\/tech\/<\/loc>/);
      assert.match(sitemap, /<loc>https:\/\/gm.21ideas.org\/en\/tags\/tech\/<\/loc>/);
      assert.deepEqual(alternateLinks(html(root, 'en/tags/market')), []);
    });
  } finally {
    await history.close();
    if (process.env.GM_EN_KEEP_FIXTURE === 'true') t.diagnostic(`Retained synthetic preview: ${root}/dist`);
    else rmSync(root, { recursive: true, force: true });
  }
});
