#!/usr/bin/env node
// Donations ledger updater — runs on the VPS, chained into the bot's daily job
// (NOT in CI, never in the site build). Dep-free: Node 22 built-ins only.
//
// It pulls received-payment history from Coinos, self-computes the net credited
// sats + USD cents per donation, projects each row down to exactly
// { id, ts, sats, usdCents, rail } (hash-only, PII-free), dedups against the
// committed append-only ledger, and writes it back atomically — only on full
// success. See plans/donations.hardened.md §2/§3/§4/§9.
//
// ⚠️ The §3 Coinos contract is PROVISIONAL here: Phase 0 (the live contract
// probe) has not been confirmed against the live API as of this writing. The
// load-bearing assumptions encoded below — pagination returns all rows, the
// `amount+tip-fee-ourfee` net formula matches `incoming.USD`, `rate` semantics,
// id stability, `revertedDuplicate` drop, and the `rail` heuristic — must be
// verified by Phase 0 before the real backfill / go-live.
//
// Structure: the parse→filter→compute→project→dedup pipeline and the sanity /
// projection gates are PURE functions (exported, fixture-driven). All I/O
// (fetch, file read/write) is isolated in main() at the bottom and only runs
// when this file is executed directly.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ── Constants ────────────────────────────────────────────────────────────────

const BASE = 'https://coinos.io/api';
const ACCOUNT = 'gmbitcoiner';
const SATS_PER_BTC = 100_000_000;

// Settle delay: append only rows older than this. Coinos can reclassify a row
// as `revertedDuplicate` after the fact and drop it; the quarantine lets that
// settle before we freeze the donation into the append-only ledger (§2).
export const QUARANTINE_MS = 48 * 60 * 60 * 1000; // 48h (≥24–48h, §2)

const FETCH_TIMEOUT_MS = 25_000; // hard per-request timeout (AbortController, §4)
const WALL_MS = 60_000; // overall wall-clock cap — a hang must self-abort (§4)

// Ledger path resolved relative to THIS file (robust to cwd), not process.cwd().
const LEDGER_PATH = fileURLToPath(
  new URL('../src/data/donations-ledger.json', import.meta.url),
);

// The one and only legal entry shape. The runtime projection guard enforces it.
export const ENTRY_KEYS = ['id', 'ts', 'sats', 'usdCents', 'rail'];

// ── Shared helpers ───────────────────────────────────────────────────────────

const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

// THE shared hash. hash-coinos-id.mjs imports this so `excludeIds` always
// matches entry ids byte-for-byte. sha256 hex of the raw id string (no trim
// here — callers trim their own input; rows carry the id verbatim).
export function hashId(rawId) {
  return createHash('sha256').update(String(rawId), 'utf8').digest('hex');
}

// ── Pure pipeline: parse → filter → compute → project → dedup ─────────────────

// Best-effort rail derivation, run BEFORE the source fields are projected away.
// On-chain receives carry an HD derivation `path` (and a txid in `hash`); LN
// carries only a payment hash; bolt12 is indistinguishable from LN at the row
// level → fall back to 'lightning'. PROVISIONAL — confirm against Phase 0 data.
export function deriveRail(row) {
  const path = row?.path;
  if (typeof path === 'string' && path.trim() !== '') return 'onchain';
  return 'lightning';
}

// Is this row a clean, settled USD donation we should record?
export function isEligible(row, now, quarantineMs = QUARANTINE_MS) {
  return (
    num(row?.amount) > 0 &&
    row?.confirmed === true &&
    row?.revertedDuplicate !== true &&
    row?.currency === 'USD' &&
    now - num(row?.created) >= quarantineMs
  );
}

// Net credited sats — matches the aggregate reducer (§3): amount + tip − fee − ourfee.
export function netSats(row) {
  return num(row?.amount) + num(row?.tip) - num(row?.fee) - num(row?.ourfee);
}

// USD cents pinned at receipt from the row's `rate` (integers only, §3).
export function usdCentsOf(sats, rate) {
  return Math.round((sats / SATS_PER_BTC) * num(rate) * 100);
}

// Strict projection: CONSTRUCT the entry — never spread the unprojected row.
export function projectEntry(row, now) {
  const sats = netSats(row);
  return {
    id: hashId(String(row.id)),
    ts: new Date(num(row.created)).toISOString(),
    sats,
    usdCents: usdCentsOf(sats, row.rate),
    rail: deriveRail(row),
  };
}

// (payments[], existingLedger, now) -> next ledger. Pure. Append-only:
// existing entries are never modified or removed; excluded/known rows are not
// re-appended; quarantine compares row.created to the injected `now`.
export function buildLedger(payments, existingLedger, now, quarantineMs = QUARANTINE_MS) {
  const prev = existingLedger ?? {};
  const existingEntries = Array.isArray(prev.entries) ? prev.entries : [];
  const excludeIds = Array.isArray(prev.excludeIds) ? prev.excludeIds : [];
  const excluded = new Set(excludeIds);
  const known = new Set(existingEntries.map((e) => e.id));

  const entries = [...existingEntries];
  for (const row of Array.isArray(payments) ? payments : []) {
    if (!isEligible(row, now, quarantineMs)) continue;
    const id = hashId(String(row.id));
    if (excluded.has(id)) continue; // honor excludeIds (hashed)
    if (known.has(id)) continue; // dedup
    known.add(id);
    entries.push(projectEntry(row, now));
  }

  return {
    schema: prev.schema ?? 1,
    currency: prev.currency ?? 'USD',
    excludeIds, // passed through untouched (operator-managed)
    entries,
  };
}

// ── Pure gates ───────────────────────────────────────────────────────────────

// Cumulative ledger sats, honoring excludeIds (the scope `incoming` start=0 covers).
export function cumulativeSats(ledger) {
  const excluded = new Set(Array.isArray(ledger?.excludeIds) ? ledger.excludeIds : []);
  return (Array.isArray(ledger?.entries) ? ledger.entries : []).reduce(
    (s, e) => (excluded.has(e.id) ? s : s + num(e.sats)),
    0,
  );
}

// Sanity gate (§3 steps 4–5): an UPPER bound — catches over-counting only.
//  - any non-USD `incoming` key with nonzero sats → fail (never fold currencies);
//  - cumulative ledger sats must not EXCEED incoming.USD.sats (a superset).
// Returns { ok, reason }.
export function checkSanity(ledger, incoming) {
  const agg = incoming ?? {};
  for (const [cur, v] of Object.entries(agg)) {
    if (cur === 'USD') continue;
    if (num(v?.sats) !== 0) {
      return { ok: false, reason: `non-USD incoming key "${cur}" is nonzero (${num(v?.sats)} sats)` };
    }
  }
  const incomingUsdSats = num(agg.USD?.sats);
  const ours = cumulativeSats(ledger);
  if (ours > incomingUsdSats) {
    return {
      ok: false,
      reason: `cumulative ledger sats ${ours} exceed incoming.USD.sats ${incomingUsdSats}`,
    };
  }
  return { ok: true };
}

// Runtime projection guard (privacy, §2): returns the first entry whose key set
// is not EXACTLY ENTRY_KEYS, else null. Any extra key (memo/hash/ref/path/with)
// must block the write.
export function findProjectionViolation(ledger) {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];
  for (const e of entries) {
    const keys = Object.keys(e);
    if (keys.length !== ENTRY_KEYS.length || !ENTRY_KEYS.every((k) => k in e)) {
      return e;
    }
  }
  return null;
}

// ── Deterministic serializer ─────────────────────────────────────────────────

// One serializer for backfill AND incremental append: sorted by ts (id as
// tiebreak), stable key order, integers, NO in-file timestamp — so an unchanged
// run is a byte-identical zero diff (§4).
export function serializeLedger(ledger) {
  const entries = [...(Array.isArray(ledger?.entries) ? ledger.entries : [])]
    .sort((a, b) =>
      a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )
    .map((e) => ({
      id: e.id,
      ts: e.ts,
      sats: e.sats,
      usdCents: e.usdCents,
      rail: e.rail,
    }));
  const out = {
    schema: ledger?.schema ?? 1,
    currency: ledger?.currency ?? 'USD',
    excludeIds: Array.isArray(ledger?.excludeIds) ? ledger.excludeIds : [],
    entries,
  };
  return JSON.stringify(out, null, 2) + '\n';
}

// ── I/O (only exercised when run directly) ───────────────────────────────────

function readLedger(path) {
  // A failed read must NOT silently start fresh — that would discard history /
  // overcount. Throw → main() leaves the file untouched and exits non-zero.
  const raw = readFileSync(path, 'utf8');
  const j = JSON.parse(raw);
  return {
    schema: j.schema ?? 1,
    currency: j.currency ?? 'USD',
    excludeIds: Array.isArray(j.excludeIds) ? j.excludeIds : [],
    entries: Array.isArray(j.entries) ? j.entries : [],
  };
}

function writeLedgerAtomic(path, ledger) {
  const data = serializeLedger(ledger);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path); // atomic on POSIX — committed file is always whole
}

async function fetchJson(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const token = process.env.COINOS_TOKEN;
  if (!token || !token.trim()) {
    console.error(
      '[donations] COINOS_TOKEN missing/empty — leaving ledger untouched, exiting non-zero.',
    );
    process.exitCode = 1;
    return;
  }

  // Overall wall-clock cap: a hang must self-abort, never block the digest job.
  const wallTimer = setTimeout(() => {
    console.error(`[donations] wall-clock cap (${WALL_MS}ms) exceeded — aborting.`);
    process.exit(1);
  }, WALL_MS);
  wallTimer.unref();

  try {
    // Profile-currency guard (cheap insurance, §4): must be USD.
    const profile = await fetchJson(
      `${BASE}/users/${ACCOUNT}`,
      { headers: { Accept: 'application/json' } },
      FETCH_TIMEOUT_MS,
    );
    if (profile?.currency !== 'USD') {
      throw new Error(`profile currency is "${profile?.currency}", expected "USD"`);
    }

    const now = Date.now();
    const data = await fetchJson(
      `${BASE}/payments?received=true&start=0&end=${now}`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      },
      FETCH_TIMEOUT_MS,
    );

    const payments = Array.isArray(data?.payments) ? data.payments : [];
    const incoming = data?.incoming ?? {};

    const existing = readLedger(LEDGER_PATH);
    const next = buildLedger(payments, existing, now);

    const sanity = checkSanity(next, incoming);
    if (!sanity.ok) {
      throw new Error(`sanity gate failed: ${sanity.reason}`);
    }

    const violation = findProjectionViolation(next);
    if (violation) {
      throw new Error(
        `projection guard failed: entry has keys [${Object.keys(violation).join(', ')}]`,
      );
    }

    const before = (() => {
      try {
        return readFileSync(LEDGER_PATH, 'utf8');
      } catch {
        return null;
      }
    })();
    const after = serializeLedger(next);

    if (before === after) {
      console.log('[donations] no change — ledger already up to date.');
    } else {
      writeLedgerAtomic(LEDGER_PATH, next);
      console.log(`[donations] ledger updated (${next.entries.length} entries).`);
    }
    clearTimeout(wallTimer);
  } catch (err) {
    clearTimeout(wallTimer);
    console.error(
      `[donations] refresh failed (${err?.message ?? err}) — ledger left untouched.`,
    );
    process.exitCode = 1;
  }
}

// Run only when invoked directly; importing this module (helper / tests) is a no-op.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
