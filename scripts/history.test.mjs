// Offline tests for the «Сегодня в истории» Calendar API loader (src/lib/history.mjs). Every request
// goes through an injected fetch over synthetic fixtures — never the production endpoint. Run: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  HISTORY_API_URL,
  HISTORY_SCHEMA,
  TIMEOUT_MS,
  RETRY_DELAY_MS,
  createHistoryLoader,
  eventsForDay,
  parseHistoryPayload,
  resolveHistoryUrl,
  stripEmojiPrefix,
} from '../src/lib/history.mjs';

const FIXT = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const loadFixture = (name) => JSON.parse(readFileSync(join(FIXT, name), 'utf8'));

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// A loader wired to a scripted fetch: each physical request consumes the next step (a Response, an
// Error to reject with, or a function returning either). Records calls, sleeps, and log lines.
function harness(steps, opts = {}) {
  const calls = [];
  const sleeps = [];
  const logs = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    const value = typeof step === 'function' ? await step(init) : step;
    if (value instanceof Error) throw value;
    return value;
  };
  const load = createHistoryLoader({
    url: 'http://fixture.test/events',
    fetchImpl,
    sleep: async (ms) => void sleeps.push(ms),
    log: (line) => logs.push(line),
    ...opts,
  });
  return { load, calls, sleeps, logs };
}

const titles = (events) => events.map((e) => e.title);

// ── Healthy response ─────────────────────────────────────────────────────────

test('healthy: groups by MM-DD, strips emoji prefixes, orders by full date ascending', async () => {
  const { load, calls, logs } = harness([json(loadFixture('history-healthy.json'))]);
  const { byDay, status } = await load();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://fixture.test/events');
  assert.equal(status.state, 'ok');
  assert.deepEqual(status.reasons, []);
  assert.equal(status.events, 4);
  assert.equal(status.skipped, 0);

  assert.deepEqual(Object.keys(byDay).sort(), ['09-22', '09-23']);
  // API order is 2015, 2009, 2021 — rendered oldest first; a digit-leading title is left intact.
  assert.deepEqual(titles(byDay['09-23']), [
    'Синтетическое событие A',
    'Синтетическое событие B',
    '21 синтетическое событие C',
  ]);
  assert.deepEqual(titles(byDay['09-22']), ['Синтетическое событие D']); // ZWJ family sequence stripped
  assert.equal(byDay['09-23'][1].description, 'Тестовое описание B.\n\nВторой абзац B.');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^\[history\] fetch ok /);
});

test('healthy: references and media are retained as string[] in the event model', async () => {
  const { load } = harness([json(loadFixture('history-healthy.json'))]);
  const { byDay } = await load();
  const [a, b, c] = byDay['09-23'];
  assert.deepEqual(a, {
    id: 102,
    date: '2009-09-23',
    title: 'Синтетическое событие A',
    description: 'Тестовое описание A.',
    references: ['https://example.org/a'],
    media: [],
  });
  assert.deepEqual(b.references, ['https://example.org/b', 'https://web.archive.org/web/2015/https://example.org/b']);
  assert.deepEqual(b.media, ['https://example.org/b.png']);
  assert.deepEqual([c.references, c.media], [[], []]); // absent optional fields → empty, not degraded
});

test('stripEmojiPrefix: flags, variation selectors, ZWJ sequences; plain titles untouched', () => {
  assert.equal(stripEmojiPrefix('🗣️ Сатоши'), 'Сатоши');
  assert.equal(stripEmojiPrefix('🇸🇻 Принят закон'), 'Принят закон');
  assert.equal(stripEmojiPrefix('👨‍👩‍👧 Семья'), 'Семья');
  assert.equal(stripEmojiPrefix('2009 — генезис'), '2009 — генезис');
  assert.equal(stripEmojiPrefix('Биткоин 🚀'), 'Биткоин 🚀');
});

// ── Memoization: one physical request per build ─────────────────────────────

test('memoized: many consumers (pages) share one physical request and one diagnostic', async () => {
  const { load, calls, logs } = harness([json(loadFixture('history-healthy.json'))]);
  const results = await Promise.all(Array.from({ length: 25 }, () => load()));
  const again = await load();
  assert.equal(calls.length, 1);
  assert.equal(logs.length, 1);
  for (const r of results) assert.equal(r, again); // the very same resolved object
});

test('memoized: an unavailable result is also cached — no re-fetch per page', async () => {
  const { load, calls, logs } = harness([new TypeError('fetch failed')]);
  for (let i = 0; i < 10; i++) await load();
  assert.equal(calls.length, 2); // first attempt + one retry, for the whole build
  assert.equal(logs.length, 1);
});

// ── Bounded retry ────────────────────────────────────────────────────────────

test('retry: at most two physical requests, with one 1s pause between them', async () => {
  const { load, calls, sleeps } = harness([new TypeError('fetch failed')]);
  const { byDay, status } = await load();
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [RETRY_DELAY_MS]);
  assert.equal(RETRY_DELAY_MS, 1000);
  assert.equal(status.state, 'unavailable');
  assert.deepEqual(status.reasons, ['network']);
  assert.equal(status.attempts, 2);
  assert.deepEqual(byDay, {});
});

test('retry: a transient 503 followed by a healthy response recovers', async () => {
  const { load, calls } = harness([json({}, 503), json(loadFixture('history-healthy.json'))]);
  const { status } = await load();
  assert.equal(calls.length, 2);
  assert.equal(status.state, 'ok');
  assert.equal(status.attempts, 2);
});

test('retry: a non-transient 404 is not retried', async () => {
  const { load, calls, sleeps } = harness([json({ error: 'nope' }, 404)]);
  const { status } = await load();
  assert.equal(calls.length, 1);
  assert.deepEqual(sleeps, []);
  assert.equal(status.state, 'unavailable');
  assert.deepEqual(status.reasons, ['http_status']);
  assert.equal(status.httpStatus, 404);
});

// ── Transport failures stay inside the boundary ──────────────────────────────

test('timeout: 8s default; a hung request is aborted and retried once, then unavailable', async () => {
  assert.equal(TIMEOUT_MS, 8000);
  let aborted = 0;
  const hang = (init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => {
        aborted++;
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  const { load, calls } = harness([hang], { timeoutMs: 20 });
  const { byDay, status } = await load();
  assert.equal(calls.length, 2);
  assert.equal(aborted, 2);
  assert.equal(status.state, 'unavailable');
  assert.deepEqual(status.reasons, ['timeout']);
  assert.deepEqual(byDay, {});
});

test('timeout: bounded even if the fetch implementation ignores the abort signal', async () => {
  const { load, calls } = harness([() => new Promise(() => {})], { timeoutMs: 20 });
  const { status } = await load();
  assert.equal(calls.length, 2);
  assert.deepEqual(status.reasons, ['timeout']);
});

test('refusal: a real connection-refused request degrades to unavailable/network', async () => {
  // Port 9 (discard) on loopback is closed on any normal dev/CI host → ECONNREFUSED.
  const logs = [];
  const load = createHistoryLoader({
    url: 'http://127.0.0.1:9/public/v1/events?lang=ru',
    sleep: async () => {},
    log: (line) => logs.push(line),
  });
  const { byDay, status } = await load();
  assert.equal(status.state, 'unavailable');
  assert.deepEqual(status.reasons, ['network']);
  assert.equal(status.attempts, 2);
  assert.deepEqual(byDay, {});
  assert.equal(logs.length, 1);
});

test('non-JSON: an HTML error page body is unavailable/non_json', async () => {
  const html = new Response('<html>502 Bad Gateway</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  const { load } = harness([html]);
  const { byDay, status } = await load();
  assert.equal(status.state, 'unavailable');
  assert.deepEqual(status.reasons, ['non_json']);
  assert.deepEqual(byDay, {});
});

test('schema mismatch: wrong envelope shapes are unavailable/schema_mismatch', () => {
  const healthy = loadFixture('history-healthy.json');
  assert.equal(HISTORY_SCHEMA, 'bitcoin-calendar.public-events.v1');
  assert.equal(healthy.schema, HISTORY_SCHEMA);
  const { schema: _omit, ...noSchema } = healthy;
  const bad = [
    null,
    [],
    'events',
    noSchema, // missing schema
    { ...healthy, schema: null },
    { ...healthy, schema: 1 },
    { ...healthy, schema: ['bitcoin-calendar.public-events.v1'] },
    { ...healthy, schema: { id: 'bitcoin-calendar.public-events.v1' } },
    { ...healthy, schema: 'bitcoin-calendar.public-events.v2' },
    { ...healthy, schema: 'bitcoin-calendar.public-events.v1 ' },
    { ...healthy, schema: 'BITCOIN-CALENDAR.PUBLIC-EVENTS.V1' },
    { ...healthy, schema: '' },
    { schema: HISTORY_SCHEMA, events: [] },
    { schema: HISTORY_SCHEMA, database: { rows: 0 } },
    { schema: HISTORY_SCHEMA, database: { rows: 1 }, events: {} },
    { schema: HISTORY_SCHEMA, database: { rows: '1' }, events: [] },
    { schema: HISTORY_SCHEMA, database: { rows: -1 }, events: [] },
    { schema: HISTORY_SCHEMA, database: null, events: [] },
  ];
  for (const body of bad) {
    const { byDay, status } = parseHistoryPayload(body);
    assert.equal(status.state, 'unavailable', JSON.stringify(body));
    assert.deepEqual(status.reasons, ['schema_mismatch'], JSON.stringify(body));
    assert.deepEqual(byDay, {});
  }
});

test('never rejects: a throwing fetch implementation is contained', async () => {
  const { load } = harness([], {
    fetchImpl: () => {
      throw new Error('boom');
    },
  });
  const { status } = await load();
  assert.equal(status.state, 'unavailable');
  assert.deepEqual(status.reasons, ['network']);
});

// ── Field → row degradation ──────────────────────────────────────────────────

test('partial: malformed optional fields keep the core event; invalid rows are skipped alone', async () => {
  const { load, logs } = harness([json(loadFixture('history-partial.json'))]);
  const { byDay, status } = await load();

  assert.equal(status.state, 'degraded');
  assert.deepEqual(status.reasons, ['rows_mismatch', 'invalid_rows', 'invalid_fields']);
  assert.equal(status.events, 2);
  assert.equal(status.skipped, 5);
  assert.equal(status.rows, 9);

  assert.deepEqual(Object.keys(byDay), ['09-23']);
  const [older, newer] = byDay['09-23'];
  assert.equal(older.title, 'Синтетическое событие с частично валидными ссылками');
  assert.equal(older.description, 'Второе описание.');
  // Non-string elements dropped; every string passes through byte-for-byte (whitespace, empty, ftp,
  // non-URL, Wayback) — deciding what to link is the consumer's job (gm-bitcoiner#7).
  assert.deepEqual(older.references, [
    'ftp://example.org/x',
    'не ссылка',
    '  ',
    '',
    ' https://web.archive.org/web/2010/http://example.org/ok\n',
  ]);
  assert.deepEqual(older.media, []); // "nope" is not an array
  assert.equal(newer.title, 'Синтетическое событие со сломанными ссылками');
  assert.deepEqual(newer.references, []); // "not-an-array"
  assert.deepEqual(newer.media, ['  https://example.org/ok.png  ', 'javascript:alert(1)']);

  assert.equal(logs.length, 1);
  assert.match(logs[0], /^\[history\] fetch degraded /);
});

test('references/media: string[] passthrough; only non-arrays and non-string elements mark invalid_fields', () => {
  const row = (extra) => ({ date: '2013-09-23', title: 'T', description: 'D', ...extra });
  const parse = (extra) => parseHistoryPayload({ schema: HISTORY_SCHEMA, database: { rows: 1 }, events: [row(extra)] });

  const odd = ['', '  ', ' x ', 'ftp://a', 'not a url', 'https://web.archive.org/web/1/http://a'];
  const clean = parse({ references: odd, media: [...odd] });
  assert.equal(clean.status.state, 'ok'); // any string is valid, however odd
  assert.deepEqual(clean.byDay['09-23'][0].references, odd);
  assert.deepEqual(clean.byDay['09-23'][0].media, odd);

  for (const [extra, refs, media] of [
    [{ references: 'x' }, [], []],
    [{ media: { url: 'https://a' } }, [], []],
    [{ references: [1, ' a ', null, {}, [], true, ''] }, [' a ', ''], []],
    [{ media: [{ url: 'https://a' }, 'https://b'] }, [], ['https://b']],
  ]) {
    const { byDay, status } = parse(extra);
    assert.equal(status.state, 'degraded', JSON.stringify(extra));
    assert.deepEqual(status.reasons, ['invalid_fields']);
    assert.deepEqual(byDay['09-23'][0].references, refs);
    assert.deepEqual(byDay['09-23'][0].media, media);
    assert.equal(byDay['09-23'][0].title, 'T'); // core event preserved
  }
});

test('rows_mismatch: database.rows ≠ events.length degrades but every valid event renders', () => {
  const body = { ...loadFixture('history-healthy.json'), database: { rows: 505 } };
  const { byDay, status } = parseHistoryPayload(body);
  assert.equal(status.state, 'degraded');
  assert.deepEqual(status.reasons, ['rows_mismatch']);
  assert.equal(status.events, 4);
  assert.equal(byDay['09-23'].length, 3);
  assert.equal(byDay['09-22'].length, 1);
});

test('all rows invalid: no events at all is unavailable (section omitted everywhere)', () => {
  const { byDay, status } = parseHistoryPayload({
    schema: HISTORY_SCHEMA,
    database: { rows: 1 },
    events: [{ date: 'x' }],
  });
  assert.equal(status.state, 'unavailable');
  assert.deepEqual(status.reasons, ['invalid_rows', 'no_events']);
  assert.deepEqual(byDay, {});
});

// ── Section omission ─────────────────────────────────────────────────────────

test('empty day: a day without events yields [] so the section is omitted', async () => {
  const { load } = harness([json(loadFixture('history-healthy.json'))]);
  const { byDay } = await load();
  assert.deepEqual(eventsForDay(byDay, '09-21'), []);
  assert.equal(eventsForDay(byDay, '09-23').length, 3);
  assert.deepEqual(eventsForDay({}, '09-23'), []); // unavailable build → every digest omits it
  assert.deepEqual(eventsForDay(byDay, '__proto__'), []);
});

// ── Diagnostics & configuration ──────────────────────────────────────────────

test('diagnostic: one bounded line with codes/counts only — never upstream error text', async () => {
  const secret = 'upstream-secret-detail ' + 'x'.repeat(5000);
  const cases = [
    [new TypeError(secret)],
    [new Response(secret, { status: 500 })],
    [new Response(secret, { status: 200 })],
    [json({ schema: HISTORY_SCHEMA, database: { rows: 1 }, events: [{ date: secret, title: secret, description: secret }] })],
    [json({ schema: secret, database: { rows: 0 }, events: [] })],
  ];
  for (const steps of cases) {
    const { load, logs } = harness(steps);
    await load();
    assert.equal(logs.length, 1);
    assert.match(logs[0], /^\[history\] fetch (ok|degraded|unavailable)( [a-z_]+=[a-z0-9_,]+)*$/);
    assert.ok(!logs[0].includes('secret'));
    assert.ok(logs[0].length <= 200);
  }
});

test('endpoint: production default needs no secret; override via option or HISTORY_API_URL', () => {
  assert.equal(HISTORY_API_URL, 'https://api.bitcoin-calendar.org/public/v1/events?lang=ru');
  assert.equal(resolveHistoryUrl({}), HISTORY_API_URL);
  assert.equal(resolveHistoryUrl({ HISTORY_API_URL: '  ' }), HISTORY_API_URL);
  assert.equal(resolveHistoryUrl({ HISTORY_API_URL: 'http://localhost:8080/e' }), 'http://localhost:8080/e');
});

test('request: plain GET with an Accept header and no credentials', async () => {
  const { load, calls } = harness([json(loadFixture('history-healthy.json'))]);
  await load();
  const { init } = calls[0];
  assert.equal(init.method ?? 'GET', 'GET');
  assert.equal(init.headers.accept, 'application/json');
  assert.equal(Object.keys(init.headers).some((h) => /auth|key|token/i.test(h)), false);
});
