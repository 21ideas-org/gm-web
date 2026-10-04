import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyEventView } from '../src/lib/history-event.mjs';

const event = {
  title: 'Событие', date: '2008-10-31', description: 'Первый абзац.\n\nВторой абзац.',
  url_path: '/2008-11-01/bitcoin-whitepaper-published/', references: ['https://example.org/source'],
};

test('event view links the stored path independently of the historical date and sources', () => {
  assert.deepEqual(historyEventView(event), {
    title: event.title, paragraphs: ['Первый абзац.', 'Второй абзац.'],
    eventUrl: 'https://bitcoin-calendar.org/ru/events/2008-11-01/bitcoin-whitepaper-published',
  });
  assert.equal(historyEventView({ ...event, references: [] }).eventUrl, historyEventView(event).eventUrl);
});

test('logical slug characters are encoded as one route segment, like the Calendar site', () => {
  assert.equal(historyEventView({ ...event, url_path: '/2000-02-29/тест %?#/' }).eventUrl,
    'https://bitcoin-calendar.org/ru/events/2000-02-29/%D1%82%D0%B5%D1%81%D1%82%20%25%3F%23');
});

test('missing or invalid paths omit the button without losing event text', () => {
  for (const url_path of [undefined, null, 1, '', 'bad', 'https://evil.org/x', '//evil.org/x',
    '/2001-02-29/slug/', '/2000-02-30/slug/', '/2008-11-01/./', '/2008-11-01/../',
    '/2008-11-01/a/b/', '/2008-11-01/a\\b/', '/2008-11-01/ padded /', '/2008-11-01/a\n/',
    '/2008-11-01/a/\n', '/2008-11-01/\ud800/']) {
    const view = historyEventView({ ...event, url_path });
    assert.equal(view.eventUrl, null, String(url_path));
    assert.equal(view.title, event.title);
    assert.deepEqual(view.paragraphs, ['Первый абзац.', 'Второй абзац.']);
  }
});
