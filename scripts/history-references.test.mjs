// Offline tests for the «Сегодня в истории» source-link presentation (src/lib/history-references.mjs):
// references: string[] → [{ href, label }], mirroring the Calendar Telegram formatter but HTTP(S)-only.
// Run: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyEventView, referenceLinks } from '../src/lib/history-references.mjs';

test('normal URL: href unchanged, label is the hostname', () => {
  assert.deepEqual(referenceLinks(['https://bitcoin.org/bitcoin.pdf']), [
    { href: 'https://bitcoin.org/bitcoin.pdf', label: 'bitcoin.org' },
  ]);
  assert.deepEqual(referenceLinks(['http://example.org:8080/a?b=c#d']), [
    { href: 'http://example.org:8080/a?b=c#d', label: 'example.org' },
  ]);
});

test('leading www. is stripped from the label only', () => {
  assert.deepEqual(referenceLinks(['https://www.coindesk.com/x']), [
    { href: 'https://www.coindesk.com/x', label: 'coindesk.com' },
  ]);
});

test('archive URL: href kept as the archived URL, label from the embedded original + (архив)', () => {
  const href = 'https://web.archive.org/web/20090131115053/http://www.bitcoin.org/';
  assert.deepEqual(referenceLinks([href]), [{ href, label: 'bitcoin.org (архив)' }]);
  const http = 'http://WEB.archive.org/web/2015/https://example.org/b';
  assert.deepEqual(referenceLinks([http]), [{ href: http, label: 'example.org (архив)' }]);
});

test('archive timestamp modifier flags (id_, im_, *) are recognized', () => {
  for (const ts of ['20240207194838id_', '20240207194838im_', '2024*', '']) {
    const href = `https://web.archive.org/web/${ts}/https://www.example.com/page`;
    assert.deepEqual(referenceLinks([href]), [{ href, label: 'example.com (архив)' }], ts);
  }
});

test('duplicate hostnames and source order are preserved', () => {
  const refs = [
    'https://b.example/1',
    'https://a.example/1',
    'https://www.b.example/2',
    'https://web.archive.org/web/1/https://a.example/3',
  ];
  assert.deepEqual(
    referenceLinks(refs).map((l) => l.label),
    ['b.example', 'a.example', 'b.example', 'a.example (архив)'],
  );
});

test('surrounding whitespace is trimmed from the href', () => {
  assert.deepEqual(referenceLinks(['  https://example.org/a \n']), [
    { href: 'https://example.org/a', label: 'example.org' },
  ]);
  assert.deepEqual(referenceLinks([' https://web.archive.org/web/2010/http://example.org/ok\n']), [
    { href: 'https://web.archive.org/web/2010/http://example.org/ok', label: 'example.org (архив)' },
  ]);
});

test('empty and whitespace-only entries are skipped', () => {
  assert.deepEqual(referenceLinks(['', '   ', '\n\t']), []);
});

test('non-HTTP(S) schemes are skipped: ftp, mailto, javascript, data, file', () => {
  assert.deepEqual(
    referenceLinks([
      'ftp://example.org/x',
      'mailto:satoshi@example.org',
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,hi',
      'file:///etc/passwd',
    ]),
    [],
  );
});

test('invalid and bare URLs are skipped', () => {
  assert.deepEqual(
    referenceLinks(['не ссылка', 'example.org', 'bitcoin', 'https://', 'http://exa mple.org', '//example.org/x']),
    [],
  );
});

test('archive with a malformed or non-HTTP(S) embedded original is skipped', () => {
  assert.deepEqual(
    referenceLinks([
      'https://web.archive.org/web/2015/',
      'https://web.archive.org/web/2015/example.org',
      'https://web.archive.org/web/2015/https://',
      'https://web.archive.org/web/2015/ftp://example.org/x',
      'https://web.archive.org/web/2015/javascript:alert(1)',
      'https://web.archive.org/web/',
    ]),
    [],
  );
});

test('a web.archive.org URL outside /web/ is not a snapshot and links as an ordinary host', () => {
  assert.deepEqual(referenceLinks(['https://web.archive.org/']), [
    { href: 'https://web.archive.org/', label: 'web.archive.org' },
  ]);
});

test('non-canonical web.archive.org forms (port, user@, backslashes) link as ordinary hosts, like the bot', () => {
  const refs = [
    'https://web.archive.org:443/web/2015/https://bitcoin.org/',
    'https://user@web.archive.org/web/2015/https://bitcoin.org/',
    'https:\\\\web.archive.org\\web\\2015\\https://bitcoin.org/',
  ];
  assert.deepEqual(
    referenceLinks(refs.map((r) => ` ${r}\n`)),
    refs.map((href) => ({ href, label: 'web.archive.org' })),
  );
});

test('lookalike archive hosts are ordinary hosts, not archives', () => {
  const refs = [
    'https://web.archive.org.example.com/web/2015/https://bitcoin.org/',
    'https://notweb.archive.org/web/2015/https://bitcoin.org/',
    'https://archive.org/web/2015/https://bitcoin.org/',
  ];
  assert.deepEqual(referenceLinks(refs), [
    { href: refs[0], label: 'web.archive.org.example.com' },
    { href: refs[1], label: 'notweb.archive.org' },
    { href: refs[2], label: 'archive.org' },
  ]);
});

test('empty or missing list yields no links', () => {
  assert.deepEqual(referenceLinks([]), []);
  assert.deepEqual(referenceLinks(undefined), []);
});

test('event view: invalid references never remove the title or description', () => {
  const event = {
    id: 1,
    date: '2013-09-23',
    title: 'T',
    description: 'Первый абзац.\n\nВторой абзац.',
    references: ['ftp://example.org/x', 'не ссылка', '  ', '', 'https://web.archive.org/web/1/nope'],
    media: [],
  };
  assert.deepEqual(historyEventView(event), {
    title: 'T',
    paragraphs: ['Первый абзац.', 'Второй абзац.'],
    sources: [],
  });
});

test('event view: valid references become sources; no references renders as before', () => {
  const base = { id: 1, date: '2009-01-03', title: 'Генезис', description: 'Блок 0.', media: [] };
  assert.deepEqual(historyEventView({ ...base, references: [] }), {
    title: 'Генезис',
    paragraphs: ['Блок 0.'],
    sources: [],
  });
  assert.deepEqual(historyEventView({ ...base, references: ['bad', 'https://www.bitcoin.org/'] }).sources, [
    { href: 'https://www.bitcoin.org/', label: 'bitcoin.org' },
  ]);
});
