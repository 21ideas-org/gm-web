// Offline, dep-free tests for the donations ledger updater's PURE pipeline.
// No token, no network — drives buildLedger/checkSanity/projection/serializer
// over synthetic fixtures, each with a FIXED `now`. Run: `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  buildLedger,
  checkSanity,
  findProjectionViolation,
  serializeLedger,
  projectEntry,
  hashId,
  deriveRail,
  isEligible,
  cumulativeSats,
  QUARANTINE_MS,
  ENTRY_KEYS,
} from './update-donations-ledger.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXT = join(HERE, '__fixtures__');
const loadFixture = (name) => JSON.parse(readFileSync(join(FIXT, name), 'utf8'));

// Fixed clock — matches the fixtures' `created` timestamps (all comfortably
// past a 48h quarantine relative to this instant). 2026-06-24T00:00:00Z.
const NOW = Date.UTC(2026, 5, 24, 0, 0, 0);
const EMPTY = { schema: 1, currency: 'USD', excludeIds: [], entries: [] };

const byId = (ledger) => new Map(ledger.entries.map((e) => [e.id, e]));

// ── Compute: tips, fees, rounding ────────────────────────────────────────────

test('basic fixture: self-computed net sats + usdCents (tips, fees, rounding)', () => {
  const fx = loadFixture('payments-basic.json');
  const next = buildLedger(fx.payments, EMPTY, NOW);

  assert.equal(next.entries.length, 4);
  const m = byId(next);

  const a = m.get(hashId('fixt-basic-0001'));
  assert.equal(a.sats, 14000); // no tip/fee
  assert.equal(a.usdCents, 893); // round(893.37) down
  assert.equal(a.ts, new Date(1781857860000).toISOString().slice(0, 10)); // UTC date only (privacy, §6)

  const b = m.get(hashId('fixt-basic-0002'));
  assert.equal(b.sats, 21000); // amount 20000 + tip 1000
  assert.equal(b.usdCents, 1260);

  const c = m.get(hashId('fixt-basic-0003'));
  assert.equal(c.sats, 49700); // amount 50000 − fee 200 − ourfee 100
  assert.equal(c.usdCents, 3043);

  const d = m.get(hashId('fixt-basic-0004'));
  assert.equal(d.sats, 10000);
  assert.equal(d.usdCents, 639); // round(638.55) UP
});

test('basic fixture: cumulative sanity gate passes (Σ sats == incoming.USD.sats)', () => {
  const fx = loadFixture('payments-basic.json');
  const next = buildLedger(fx.payments, EMPTY, NOW);
  assert.equal(cumulativeSats(next), 94700);
  assert.deepEqual(checkSanity(next, fx.incoming), { ok: true });
});

// ── Strict projection ────────────────────────────────────────────────────────

test('strict projection: every entry has EXACTLY the 5 keys', () => {
  const fx = loadFixture('payments-basic.json');
  const next = buildLedger(fx.payments, EMPTY, NOW);
  for (const e of next.entries) {
    assert.deepEqual(Object.keys(e).sort(), [...ENTRY_KEYS].sort());
  }
  assert.equal(findProjectionViolation(next), null);
});

test('projectEntry never spreads source fields (memo/hash/ref/path/with stripped)', () => {
  const dirty = {
    id: 'raw-id-xyz',
    amount: 5000,
    tip: 0,
    fee: 0,
    ourfee: 0,
    created: NOW - QUARANTINE_MS - 1000,
    rate: 60000,
    currency: 'USD',
    confirmed: true,
    memo: 'thanks!',
    hash: 'deadbeef',
    ref: 'ref123',
    path: 'm/0/1',
    with: 'someuser',
  };
  const entry = projectEntry(dirty, NOW);
  assert.deepEqual(Object.keys(entry).sort(), [...ENTRY_KEYS].sort());
  assert.equal(entry.id, hashId('raw-id-xyz')); // hash-only id
});

test('projectEntry stores ts as a UTC date only — no HH:MM:SS (privacy, §6)', () => {
  const row = {
    id: 'x', amount: 5000, tip: 0, fee: 0, ourfee: 0,
    created: 1781857860000, rate: 60000, currency: 'USD', confirmed: true,
  };
  const entry = projectEntry(row, NOW);
  assert.match(entry.ts, /^\d{4}-\d{2}-\d{2}$/); // date only — no time component to fingerprint against
  assert.equal(entry.ts, new Date(1781857860000).toISOString().slice(0, 10));
});

test('findProjectionViolation catches an extra key and a missing key', () => {
  const extra = {
    entries: [{ id: 'a', ts: 't', sats: 1, usdCents: 1, rail: 'lightning', memo: 'leak' }],
  };
  assert.ok(findProjectionViolation(extra));

  const missing = { entries: [{ id: 'a', ts: 't', sats: 1, usdCents: 1 }] };
  assert.ok(findProjectionViolation(missing));

  const clean = { entries: [{ id: 'a', ts: 't', sats: 1, usdCents: 1, rail: 'lightning' }] };
  assert.equal(findProjectionViolation(clean), null);
});

// ── Filter: non-USD, revertedDuplicate, 0-conf on-chain ──────────────────────

test('mixed fixture: filters out reverted, 0-conf, and non-USD rows', () => {
  const fx = loadFixture('payments-mixed.json');
  const next = buildLedger(fx.payments, EMPTY, NOW);

  assert.equal(next.entries.length, 2);
  const m = byId(next);

  assert.equal(m.get(hashId('fixt-mixed-0001')).sats, 30000);
  assert.equal(m.get(hashId('fixt-mixed-0001')).usdCents, 1860);
  assert.equal(m.get(hashId('fixt-mixed-0002')).sats, 5485); // 5000 + 500 − 10 − 5
  assert.equal(m.get(hashId('fixt-mixed-0002')).usdCents, 343);

  // dropped rows never enter the ledger
  assert.ok(!m.has(hashId('fixt-mixed-0003'))); // revertedDuplicate
  assert.ok(!m.has(hashId('fixt-mixed-0004'))); // 0-conf on-chain
  assert.ok(!m.has(hashId('fixt-mixed-0005'))); // EUR

  // upper-bound gate: 35485 ≤ 55485 (superset)
  assert.deepEqual(checkSanity(next, fx.incoming), { ok: true });
});

// ── Sanity gate failure modes ────────────────────────────────────────────────

test('checkSanity fails on an UNEXPECTED nonzero non-USD incoming key', () => {
  const r = checkSanity(EMPTY, { USD: { sats: 0 }, EUR: { sats: 5 } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /unexpected non-USD/);
});

test('checkSanity tolerates a KNOWN non-USD key (GEL) but still fails a new one (EUR)', () => {
  // GEL is pre-USD history, recorded manually elsewhere — its permanent presence
  // in `incoming` must NOT fail the gate (else every run false-fails).
  assert.deepEqual(checkSanity(EMPTY, { USD: { sats: 0 }, GEL: { sats: 18456 } }), { ok: true });
  // …but a genuinely new fiat still trips the tripwire.
  const r = checkSanity(EMPTY, { USD: { sats: 0 }, GEL: { sats: 18456 }, EUR: { sats: 5 } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /EUR/);
});

test('checkSanity fails when cumulative ledger sats EXCEED incoming.USD.sats', () => {
  const ledger = { excludeIds: [], entries: [{ id: 'x', ts: 't', sats: 100, usdCents: 1, rail: 'lightning' }] };
  const r = checkSanity(ledger, { USD: { sats: 50 } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /exceed/);
});

// ── Quarantine boundary (injected clock) ─────────────────────────────────────

test('quarantine boundary: row at the threshold is in, just-inside is out', () => {
  const mk = (id, created) => ({
    id,
    amount: 7000,
    tip: 0,
    fee: 0,
    ourfee: 0,
    created,
    rate: 60000,
    currency: 'USD',
    confirmed: true,
    memo: '',
    hash: '',
    ref: '',
    path: '',
  });
  const atThreshold = mk('q-at', NOW - QUARANTINE_MS); // now − created == delay → eligible (≥)
  const justInside = mk('q-inside', NOW - QUARANTINE_MS + 60_000); // too recent → excluded

  assert.equal(isEligible(atThreshold, NOW), true);
  assert.equal(isEligible(justInside, NOW), false);

  const next = buildLedger([atThreshold, justInside], EMPTY, NOW);
  assert.equal(next.entries.length, 1);
  assert.ok(byId(next).has(hashId('q-at')));
  assert.ok(!byId(next).has(hashId('q-inside')));
});

// ── Garbage created / negative net (inline synthetic rows) ──────────────────

test('isEligible rejects a string/garbage created (must not freeze ts=1970)', () => {
  const row = {
    id: 'g-created',
    amount: 7000,
    tip: 0,
    fee: 0,
    ourfee: 0,
    created: '2026-06-20T00:00:00Z', // ISO string — num() coerces to 0
    rate: 60000,
    currency: 'USD',
    confirmed: true,
  };
  assert.equal(isEligible(row, NOW), false);
  assert.equal(buildLedger([row], EMPTY, NOW).entries.length, 0);
});

test('isEligible rejects a negative net (fee > amount must not freeze sats<0)', () => {
  const row = {
    id: 'g-negative',
    amount: 100,
    tip: 0,
    fee: 500,
    ourfee: 0,
    created: NOW - QUARANTINE_MS - 1000,
    rate: 60000,
    currency: 'USD',
    confirmed: true,
  };
  assert.equal(isEligible(row, NOW), false);
  assert.equal(buildLedger([row], EMPTY, NOW).entries.length, 0);
});

// ── excludeIds (hashed) ──────────────────────────────────────────────────────

test('excludeIds: a hashed id is never appended', () => {
  const fx = loadFixture('payments-basic.json');
  const existing = { ...EMPTY, excludeIds: [hashId('fixt-basic-0001')] };
  const next = buildLedger(fx.payments, existing, NOW);

  assert.equal(next.entries.length, 3);
  assert.ok(!byId(next).has(hashId('fixt-basic-0001')));
  assert.deepEqual(next.excludeIds, [hashId('fixt-basic-0001')]); // passed through
});

test('cumulativeSats subtracts an excluded EXISTING entry', () => {
  const ledger = {
    excludeIds: ['x'],
    entries: [
      { id: 'x', ts: 't1', sats: 100, usdCents: 1, rail: 'lightning' },
      { id: 'y', ts: 't2', sats: 50, usdCents: 1, rail: 'lightning' },
    ],
  };
  assert.equal(cumulativeSats(ledger), 50);
});

// ── Append-only & idempotency ────────────────────────────────────────────────

test('idempotent rerun: no new payments + no boundary crossing → byte-identical', () => {
  const fx = loadFixture('payments-basic.json');
  const first = buildLedger(fx.payments, EMPTY, NOW);
  const s1 = serializeLedger(first);

  // rerun against the result with the SAME payments and SAME now
  const second = buildLedger(fx.payments, first, NOW);
  const s2 = serializeLedger(second);

  assert.equal(second.entries.length, first.entries.length); // no dupes
  assert.equal(s1, s2); // byte-identical zero diff
});

test('append-only: existing entries are preserved; only new rows append', () => {
  const fx = loadFixture('payments-basic.json');
  const first = buildLedger(fx.payments.slice(0, 2), EMPTY, NOW); // A, B
  const second = buildLedger(fx.payments, first, NOW); // + C, D
  assert.equal(first.entries.length, 2);
  assert.equal(second.entries.length, 4);
  // the original two survive unchanged
  for (const e of first.entries) {
    assert.deepEqual(byId(second).get(e.id), e);
  }
});

// ── Serializer determinism ───────────────────────────────────────────────────

test('serializer sorts by ts and keeps the committed ledger in canonical form byte-for-byte', () => {
  // Re-serializing the *actual* committed ledger must reproduce it exactly (key order,
  // ts/id sort, 2-space indent, trailing newline). This survives new donation rows —
  // unlike comparing against an EMPTY serialization, which only held for the initial seed.
  const seed = readFileSync(join(HERE, '..', 'src', 'data', 'donations-ledger.json'), 'utf8');
  assert.equal(serializeLedger(JSON.parse(seed)), seed);

  const unsorted = {
    schema: 1,
    currency: 'USD',
    excludeIds: [],
    entries: [
      { id: 'b', ts: '2026-06-02T00:00:00.000Z', sats: 2, usdCents: 2, rail: 'lightning' },
      { id: 'a', ts: '2026-06-01T00:00:00.000Z', sats: 1, usdCents: 1, rail: 'lightning' },
    ],
  };
  const out = JSON.parse(serializeLedger(unsorted));
  assert.deepEqual(out.entries.map((e) => e.id), ['a', 'b']); // ascending by ts
});

// ── Rail derivation (inline synthetic rows — never in __fixtures__) ──────────

test('deriveRail: on-chain by path presence, else lightning (bolt12 → lightning)', () => {
  // synthetic, obviously-fake values — live in the test, not __fixtures__
  assert.equal(deriveRail({ path: 'bc1qsyntheticexampleaddressxxxxxx' }), 'onchain');
  assert.equal(deriveRail({ path: '', hash: 'syntheticln-payment-hash' }), 'lightning');
  assert.equal(deriveRail({}), 'lightning');
});

// ── Fixture lint: no donor PII may ever be committed ─────────────────────────

test('fixture-lint: no committed fixture payment row carries PII', () => {
  const PII = ['memo', 'hash', 'ref', 'path', 'with'];
  const files = readdirSync(FIXT).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 0, 'expected fixtures to lint');

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(FIXT, file), 'utf8'));
    const rows = Array.isArray(data?.payments) ? data.payments : [];
    rows.forEach((row, i) => {
      for (const key of PII) {
        const v = row[key];
        const nonEmpty = typeof v === 'string' ? v.trim() !== '' : v != null;
        assert.ok(
          !nonEmpty,
          `${file} payments[${i}].${key} must be blank in a committed fixture (got ${JSON.stringify(v)})`,
        );
      }
    });
  }
});
