// src/lib/finances.ts — build-time only (the /support page is prerendered). Memoized: read once per build.
//
// FAIL-SOFT / NEVER-THROW. This runs in the shared digest-publish build lane: a digest push rebuilds the
// whole site (including /support), so an unparseable ledger, a malformed/drifted ops-report frontmatter,
// or a missing file must `console.warn` + degrade to an empty/partial model — never throw and block a
// digest. Mirrors src/lib/history.ts (every read/parse is wrapped; a bad input is skipped, not fatal).
//
// Both sources are read via `fs` from `resolve(process.cwd(), …)` — NOT a static import — so the ledger
// (which lives under src/, served nowhere) stays out of dist/. Same convention as history.ts / og.ts.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SERVER_USD_PER_MONTH, FINANCES_START } from '../consts';

export type MonthRow = {
  month: string; // "2026-06" (UTC)
  costUsd: number; // tokenUsd + serverUsd
  tokenUsd: number; // Σ top-level cost_usd from ops-reports in that month
  serverUsd: number; // SERVER_USD_PER_MONTH
  donationsUsd: number; // Σ entries' usdCents/100 for the month window (pinned, immutable)
  donationsSats: number; // Σ ledger entries' sats for the month window
  reportDays: number; // distinct UTC days in the month with an ops-report present
  missingDays: number; // launch-clamped (trackedUTCdays − reportDays), never negative — "reported cost" honesty
};

export type Finances = {
  months: MonthRow[]; // FINANCES_START … current month, ascending
  current: MonthRow; // the current UTC month (the only growing row)
  totals: {
    costUsd: number;
    donationsUsd: number;
    donationsSats: number;
    netUsd: number; // donationsUsd − costUsd (negative = deficit)
  };
  builtAt: string; // build timestamp → page-wide "обновлено" stamp
  lastDonationTs: string | null; // newest included ledger entry ts → last-donation recency, NOT sync health
};

const MS_PER_DAY = 86_400_000;
// UTC day number since the epoch. Date.UTC(...) lands on an exact midnight (a multiple of MS_PER_DAY),
// so the floor is exact and a difference of two indices is an exact whole-day count.
const dayIndex = (ms: number): number => Math.floor(ms / MS_PER_DAY);

const monthKey = (y: number, mIdx0: number): string => `${y}-${String(mIdx0 + 1).padStart(2, '0')}`;

let cache: Finances | null = null;

type CostBucket = { tokenUsd: number; days: Set<string> };

// Glob ops-reports/daily/*.md, summing the TOP-LEVEL cost_usd per UTC month and tracking distinct report
// dates. Also derives the first-ever-report day (the launch-month clamp anchor) from the actual files —
// never hardcoded.
function readCost(): { byMonth: Map<string, CostBucket>; firstReportDay: number | null } {
  const byMonth = new Map<string, CostBucket>();
  let firstReportDay: number | null = null;

  const dir = resolve(process.cwd(), 'ops-reports/daily');
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch (err) {
    console.warn('[finances] failed to list ops-reports/daily — token cost treated as $0:', err);
    return { byMonth, firstReportDay };
  }

  for (const f of files) {
    try {
      const raw = readFileSync(resolve(dir, f), 'utf8');
      // Line-anchored fence: the report BODY contains |------| markdown tables, so a loose match would
      // overrun. Capture only the leading JSON block between the first `---` pair.
      const m = raw.match(/^---$\r?\n([\s\S]*?)\r?\n^---$/m);
      if (!m) {
        console.warn(`[finances] no frontmatter fence in ${f} — skipped`);
        continue;
      }
      // JSON.parse reads the TOP-LEVEL cost_usd only. Each passes[] entry also carries a cost_usd, but
      // those are nested — structured parsing never double-counts the way a regex sum would.
      const fm = JSON.parse(m[1]) as { date?: unknown; cost_usd?: unknown };
      const date = typeof fm.date === 'string' ? fm.date : null;
      if (!date) {
        console.warn(`[finances] ${f} has no top-level "date" — skipped`);
        continue;
      }
      const month = date.slice(0, 7); // "YYYY-MM"
      const cost = Number(fm.cost_usd) || 0; // a failed/quiet_day run may have null/0/absent cost_usd
      const bucket = byMonth.get(month) ?? { tokenUsd: 0, days: new Set<string>() };
      bucket.tokenUsd += cost;
      bucket.days.add(date); // distinct UTC report dates → reportDays
      byMonth.set(month, bucket);

      const ms = Date.parse(`${date}T00:00:00Z`);
      if (!Number.isNaN(ms)) {
        const di = dayIndex(ms);
        if (firstReportDay === null || di < firstReportDay) firstReportDay = di;
      }
    } catch (err) {
      console.warn(`[finances] failed to parse ops-report ${f} — skipped:`, err);
    }
  }

  return { byMonth, firstReportDay };
}

type DonBucket = { usdCents: number; sats: number };

// Read BOTH donation sources — the programmatic Coinos ledger and the manual pre-history file —
// bucketing INCLUDED entries by UTC month. Money stays integer (usdCents, sats) until display;
// lastDonationTs is the newest included entry's ts across both. Every read/parse is fail-soft.
function readDonations(): { byMonth: Map<string, DonBucket>; lastDonationTs: string | null } {
  const byMonth = new Map<string, DonBucket>();
  let lastDonationTs: string | null = null;
  let lastMs = -Infinity;

  // Bucket one entry (shape { ts, sats, usdCents }) into byMonth + track recency. Shared by both
  // sources so a manual entry and a Coinos entry are treated byte-for-byte identically downstream.
  const add = (e: { ts?: unknown; sats?: unknown; usdCents?: unknown }, src: string): void => {
    const ts = typeof e.ts === 'string' ? e.ts : null;
    if (!ts) {
      console.warn(`[finances] ${src} entry missing ts — skipped`);
      return;
    }
    const ms = Date.parse(ts);
    if (Number.isNaN(ms)) {
      console.warn(`[finances] ${src} entry has unparseable ts "${ts}" — skipped`);
      return;
    }
    const d = new Date(ms);
    const month = monthKey(d.getUTCFullYear(), d.getUTCMonth());
    const bucket = byMonth.get(month) ?? { usdCents: 0, sats: 0 };
    bucket.usdCents += Number(e.usdCents) || 0;
    bucket.sats += Number(e.sats) || 0;
    byMonth.set(month, bucket);
    if (ms > lastMs) {
      lastMs = ms;
      lastDonationTs = ts; // newest INCLUDED entry (either source) → donation recency, NOT sync health (§2)
    }
  };

  // 1) Programmatic Coinos ledger — append-only, hash ids, excludeIds honored (§2/§9).
  try {
    const raw = readFileSync(resolve(process.cwd(), 'src/data/donations-ledger.json'), 'utf8');
    const root = (JSON.parse(raw) ?? {}) as { excludeIds?: unknown; entries?: unknown };
    const exclude = new Set<string>(
      Array.isArray(root.excludeIds) ? root.excludeIds.filter((x): x is string => typeof x === 'string') : [],
    );
    const entries: unknown[] = Array.isArray(root.entries) ? root.entries : [];
    for (const r of entries) {
      if (!r || typeof r !== 'object') continue;
      const e = r as { id?: unknown; ts?: unknown; sats?: unknown; usdCents?: unknown };
      if (typeof e.id === 'string' && exclude.has(e.id)) continue; // honor excludeIds (both hashed)
      add(e, 'ledger');
    }
  } catch (err) {
    console.warn('[finances] failed to read donations-ledger.json — programmatic donations treated as empty:', err);
  }

  // 2) Manual pre-history (OPTIONAL) — personal-address + pre-USD receipts, hand-converted to USD.
  //    Display-only: NEVER read by the updater or its sanity gate (foreign/converted sats would false-fail
  //    §3). No excludeIds / no dedup vs (1): manual holds provenances the Coinos ledger structurally cannot.
  try {
    const raw = readFileSync(resolve(process.cwd(), 'src/data/donations-manual.json'), 'utf8');
    const root = (JSON.parse(raw) ?? {}) as { entries?: unknown };
    const entries: unknown[] = Array.isArray(root.entries) ? root.entries : [];
    for (const r of entries) {
      if (!r || typeof r !== 'object') continue;
      add(r as { ts?: unknown; sats?: unknown; usdCents?: unknown }, 'manual');
    }
  } catch (err) {
    // Absent file is normal (the manual ledger is optional) → silent; only a present-but-broken file warns.
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.warn('[finances] donations-manual.json unreadable/unparseable — manual donations skipped:', err);
    }
  }

  return { byMonth, lastDonationTs };
}

// "YYYY-MM" → {y, mIdx0}; null if malformed. Defensive — a bad FINANCES_START must not throw.
function parseMonth(s: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { y: Number(m[1]), m: mo - 1 };
}

export function getFinances(): Finances {
  if (cache) return cache;

  const now = new Date();
  const builtAt = now.toISOString();
  // Today's UTC calendar day, as a day index — the upper clamp for the tracked window.
  const todayDay = dayIndex(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const { byMonth: costByMonth, firstReportDay } = readCost();
  const { byMonth: donByMonth, lastDonationTs } = readDonations();

  // Window: FINANCES_START … current UTC month, ascending. Clamp a malformed/future start to the current
  // month so `current` is always a valid, present row (and the loop runs ≥ once).
  const cur = { y: now.getUTCFullYear(), m: now.getUTCMonth() };
  const curIdx = cur.y * 12 + cur.m;
  let start = parseMonth(FINANCES_START) ?? cur;
  if (start.y * 12 + start.m > curIdx) start = cur;

  const months: MonthRow[] = [];
  for (let idx = start.y * 12 + start.m; idx <= curIdx; idx++) {
    const y = Math.floor(idx / 12);
    const m = idx % 12;
    const month = monthKey(y, m);

    const cost = costByMonth.get(month);
    const tokenUsd = cost?.tokenUsd ?? 0;
    const reportDays = cost?.days.size ?? 0;

    // missingDays — launch-clamped: the tracked window is the UTC days in
    //   [max(month start, first-ever-report day), min(month end, today)].
    // Without the lower clamp, the launch month (first ops-report 2026-06-07) would falsely report
    // pre-launch days as "без отчёта". With no reports at all, firstReportDay is null → tracked = 0.
    const monthStartDay = dayIndex(Date.UTC(y, m, 1));
    const monthLastDay = dayIndex(Date.UTC(y, m + 1, 1)) - 1;
    const trackedStartDay = firstReportDay === null ? Infinity : Math.max(monthStartDay, firstReportDay);
    const trackedEndDay = Math.min(monthLastDay, todayDay);
    const trackedDays = trackedEndDay >= trackedStartDay ? trackedEndDay - trackedStartDay + 1 : 0;
    const missingDays = Math.max(0, trackedDays - reportDays);

    const don = donByMonth.get(month);
    const donationsUsd = (don?.usdCents ?? 0) / 100;
    const donationsSats = don?.sats ?? 0;

    months.push({
      month,
      costUsd: tokenUsd + SERVER_USD_PER_MONTH,
      tokenUsd,
      serverUsd: SERVER_USD_PER_MONTH,
      donationsUsd,
      donationsSats,
      reportDays,
      missingDays,
    });
  }

  const current = months[months.length - 1];

  // Totals = Σ of the visible rows, so the table's «ИТОГО» line always equals the sum of what's shown.
  const totals = months.reduce(
    (acc, r) => {
      acc.costUsd += r.costUsd;
      acc.donationsUsd += r.donationsUsd;
      acc.donationsSats += r.donationsSats;
      return acc;
    },
    { costUsd: 0, donationsUsd: 0, donationsSats: 0, netUsd: 0 },
  );
  totals.netUsd = totals.donationsUsd - totals.costUsd;

  return (cache = { months, current, totals, builtAt, lastDonationTs });
}
