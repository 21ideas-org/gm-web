import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchNetworkStats, initializeNetworkStats } from '../src/lib/network-stats.mjs';

const payloads = {
  '/api/v1/prices': { USD: 83073 },
  '/api/blocks/tip/height': 972398,
  '/api/v1/mining/hashrate/3d': { currentHashrate: 1.048e21 },
  '/api/v1/fees/recommended': { halfHourFee: 1 },
};
const response = value => ({ ok: true, text: async () => String(value), json: async () => value });

test('reads the four public metrics without credentials and formats their actual units', async () => {
  const calls = [];
  const data = await fetchNetworkStats(async (url, options) => {
    calls.push({ url, options });
    return response(payloads[new URL(url).pathname]);
  });
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => new URL(call.url).origin === 'https://mempool.space' && call.options.credentials === 'omit'));
  const plain = value => value.replace(/[\u00a0\u202f]/g, ' ');
  assert.equal(plain(data.price), '$83 073');
  assert.equal(plain(data.block), '#972 398');
  assert.equal(plain(data.hashrate), '1 048 EH/s');
  assert.equal(data.fee, '1 сат/vB');
});

test('formats the same live metrics with English numbers and fee units', async () => {
  const data = await fetchNetworkStats(async url => response(payloads[new URL(url).pathname]), undefined, 'en');
  assert.deepEqual(data, { price: '$83,073', block: '#972,398', hashrate: '1,048 EH/s', fee: '1 sat/vB' });
  const fractional = await fetchNetworkStats(async url => response(new URL(url).pathname.includes('fees')
    ? { halfHourFee: 1.25 } : payloads[new URL(url).pathname]), undefined, 'en');
  assert.equal(fractional.fee, '1.25 sat/vB');
});

test('does not publish a mixed live snapshot when an endpoint fails', async () => {
  await assert.rejects(fetchNetworkStats(async url => new URL(url).pathname.includes('fees')
    ? { ok: false, status: 429 }
    : response(payloads[new URL(url).pathname])), /429/);
});

test('rejects missing, nonnumeric, and impossible values while accepting zero fees', async () => {
  for (const invalid of [{ USD: null }, { USD: '83073' }, { USD: -1 }]) {
    await assert.rejects(fetchNetworkStats(async url => response(new URL(url).pathname === '/api/v1/prices' ? invalid : payloads[new URL(url).pathname])), /Invalid/);
  }
  const data = await fetchNetworkStats(async url => response(new URL(url).pathname.includes('fees') ? { halfHourFee: 0 } : payloads[new URL(url).pathname]));
  assert.equal(data.fee, '0 сат/vB');
});

for (const locale of ['ru', 'en']) test(`${locale}: pauses hidden polling and stops the live indicator on failure without losing the last data`, async t => {
  class Element {
    dataset = {};
    textContent = '';
    title = '';
    hidden = false;
  }
  const status = new Element();
  const label = Object.assign(new Element(), { textContent: locale === 'en' ? 'October 21, 2026' : '21 октября 2026' });
  const dot = Object.assign(new Element(), { hidden: true });
  const fields = ['price', 'block', 'hashrate', 'fee'].map(key => Object.assign(new Element(), { getAttribute: () => key }));
  const nodes = { '[data-stats-status]': status, '[data-stats-label]': label, '[data-stats-dot]': dot };
  const root = Object.assign(new Element(), { isConnected: true, querySelector: selector => nodes[selector], querySelectorAll: () => fields });
  root.dataset.statsLocale = locale;
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const previousElement = globalThis.HTMLElement;
  const previousDocument = globalThis.document;
  globalThis.HTMLElement = Element;
  globalThis.document = doc;
  t.after(() => { globalThis.HTMLElement = previousElement; globalThis.document = previousDocument; });
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-10-21T12:00:00Z') });
  let requests = 0;
  let fail = false;
  t.mock.method(globalThis, 'fetch', async url => {
    requests++;
    return fail ? { ok: false, status: 429 } : response(payloads[new URL(url).pathname]);
  });
  const settled = () => new Promise(resolve => setImmediate(resolve));

  initializeNetworkStats(root);
  await settled();
  assert.equal(requests, 4);
  assert.equal(status.dataset.state, 'live');
  assert.equal(label.textContent, 'live');
  assert.equal(dot.hidden, false);
  assert.match(status.title, locale === 'en' ? /Updated/ : /Обновлено/);
  assert.equal(fields[3].textContent, locale === 'en' ? '1 sat/vB' : '1 сат/vB');
  const lastValues = fields.map(field => field.textContent);

  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  t.mock.timers.tick(120_000);
  await settled();
  assert.equal(requests, 4, 'a hidden tab makes no further requests');

  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  t.mock.timers.tick(0);
  await settled();
  assert.equal(requests, 8, 'returning to the tab refreshes expired data');

  fail = true;
  t.mock.timers.tick(60_000);
  await settled();
  assert.equal(status.dataset.state, 'stale');
  assert.equal(dot.hidden, true);
  assert.deepEqual(fields.map(field => field.textContent), lastValues);
  assert.equal(label.textContent, locale === 'en' ? 'update unavailable' : 'нет обновления');
  assert.match(status.title, locale === 'en' ? /Last updated/ : /Последнее обновление/);
  t.mock.timers.tick(60_000);
  await settled();
  assert.equal(requests, 12, 'failed refreshes back off instead of retrying every minute');
});
