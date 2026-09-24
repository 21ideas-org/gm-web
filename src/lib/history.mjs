// src/lib/history.mjs — build-time only (digest pages are prerendered). The «Сегодня в истории» data
// comes from the deployed public Bitcoin Calendar API: ONE memoized Node fetch per build, shared by
// every digest page. Pure ESM (no astro:* imports) so scripts/history.test.mjs can drive it offline.
//
// FAIL-SOFT / NEVER-REJECTS. Digest pages share the bot's publish build lane, so a timeout, network
// error, non-2xx, non-JSON body, or schema drift must never fail the build. Degradation is layered:
// a malformed optional field (references/media) is dropped but the event kept → an invalid row is
// skipped alone → a wholly unavailable response yields {} and every digest silently omits the section.
// The only trace is one bounded `[history] fetch …` stderr line per build (codes + counts, never
// upstream text).

/**
 * references/media are the API's strings exactly as stored (may be blank, padded, non-URL, ftp,
 * Wayback…) — deciding what to link is the consumer's job (gm-bitcoiner#7), not the loader's.
 * @typedef {{
 *   id: string | number | null,
 *   date: string,
 *   title: string,
 *   description: string,
 *   references: string[],
 *   media: string[],
 * }} HistoryEvent
 */
/**
 * @typedef {{
 *   state: 'ok' | 'degraded' | 'unavailable',
 *   reasons: string[],
 *   attempts: number,
 *   httpStatus: number | null,
 *   events: number,
 *   skipped: number,
 *   rows: number | null,
 * }} HistoryStatus
 */
/** @typedef {Record<string, HistoryEvent[]>} HistoryByDay */
/** @typedef {{ byDay: HistoryByDay, status: HistoryStatus }} HistoryResult */

export const HISTORY_API_URL = 'https://api.bitcoin-calendar.org/public/v1/events?lang=ru';
// Versioned public contract: a payload is only accepted when `schema` is exactly this string.
export const HISTORY_SCHEMA = 'bitcoin-calendar.public-events.v1';
export const TIMEOUT_MS = 8000; // per attempt, covering headers + body
export const RETRY_DELAY_MS = 1000;
const MAX_ATTEMPTS = 2; // first try + at most one retry → at most two physical requests per build

// Local/test override (e.g. a fixture server); production needs no env and no secret.
/** @param {Record<string, string | undefined>} env */
export function resolveHistoryUrl(env) {
  return env.HISTORY_API_URL?.trim() || HISTORY_API_URL;
}

// Leading-emoji prefix in the source titles ("🗣️ Сатоши…", "🇸🇻 Принят закон…"): either a flag (two
// Regional_Indicator codepoints) or one Extended_Pictographic base followed by any run of variation
// selectors (U+FE0F) / ZWJ-joined pictographics (U+200D … — family sequences), then the following
// whitespace. A digit- or letter-leading title matches nothing and is left intact.
const EMOJI_PREFIX =
  /^(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\u{FE0F}|\u{200D}\p{Extended_Pictographic})*)\s*/u;

/** @param {string} title */
export function stripEmojiPrefix(title) {
  return title.replace(EMOJI_PREFIX, '').trim();
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

// "YYYY-MM-DD" (optionally followed by a time part) that is a real calendar day → the day string.
/** @param {unknown} v */
function calendarDay(v) {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(2000, mo - 1, d));
  t.setUTCFullYear(y);
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? m[0].slice(0, 10) : null;
}

// Optional string lists (references/media): absent → []; not an array → [] (field issue); non-string
// elements are dropped individually (field issue). Every string element is kept byte-for-byte — no
// trim, URL parse, or filtering — and the event itself is never dropped here.
/**
 * @param {unknown} raw
 * @param {{ issue: boolean }} flag
 * @returns {string[]}
 */
function stringList(raw, flag) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    flag.issue = true;
    return [];
  }
  const out = raw.filter((v) => typeof v === 'string');
  if (out.length !== raw.length) flag.issue = true;
  return out;
}

// One API row → a normalized event, or null when a core field (date/title/description) is unusable.
/** @param {unknown} raw @returns {{ event: HistoryEvent, fieldIssue: boolean } | null} */
function normalizeEvent(raw) {
  if (!isObject(raw)) return null;
  const date = calendarDay(raw.date);
  const title = typeof raw.title === 'string' ? stripEmojiPrefix(raw.title) : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (!date || !title || !description) return null;

  const flag = { issue: false };
  let id = null;
  if (typeof raw.id === 'string' || (typeof raw.id === 'number' && Number.isFinite(raw.id))) id = raw.id;
  else if (raw.id !== undefined && raw.id !== null) flag.issue = true;
  const references = stringList(raw.references, flag);
  const media = stringList(raw.media, flag);
  return { event: { id, date, title, description, references, media }, fieldIssue: flag.issue };
}

/**
 * @param {HistoryStatus['state']} state
 * @param {string[]} reasons
 * @param {Partial<HistoryStatus>} [extra]
 * @returns {HistoryStatus}
 */
const makeStatus = (state, reasons, extra = {}) => ({
  state,
  reasons,
  attempts: 0,
  httpStatus: null,
  events: 0,
  skipped: 0,
  rows: null,
  ...extra,
});

// Pure: a parsed JSON body → events grouped by month-day ("MM-DD", the formatMonthDay key), each day
// ordered by full historical date ascending (stable for equal dates), plus a status. Never throws.
/** @param {unknown} body @returns {HistoryResult} */
export function parseHistoryPayload(body) {
  if (
    !isObject(body) ||
    body.schema !== HISTORY_SCHEMA ||
    !Array.isArray(body.events) ||
    !isObject(body.database) ||
    !Number.isSafeInteger(body.database.rows) ||
    /** @type {number} */ (body.database.rows) < 0
  )
    return { byDay: {}, status: makeStatus('unavailable', ['schema_mismatch']) };

  const rows = /** @type {number} */ (body.database.rows);
  /** @type {HistoryByDay} */
  const byDay = {};
  let events = 0;
  let skipped = 0;
  let fieldIssues = 0;
  for (const raw of body.events) {
    const n = normalizeEvent(raw);
    if (!n) {
      skipped++;
      continue;
    }
    events++;
    if (n.fieldIssue) fieldIssues++;
    (byDay[n.event.date.slice(5)] ??= []).push(n.event);
  }
  for (const day of Object.values(byDay)) day.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const reasons = [];
  if (rows !== body.events.length) reasons.push('rows_mismatch');
  if (skipped) reasons.push('invalid_rows');
  if (fieldIssues) reasons.push('invalid_fields');
  if (events === 0) reasons.push('no_events');
  const state = events === 0 ? 'unavailable' : reasons.length ? 'degraded' : 'ok';
  return { byDay: events ? byDay : {}, status: makeStatus(state, reasons, { events, skipped, rows }) };
}

// The anniversary lookup History.astro renders; [] means "omit the section".
/** @param {HistoryByDay} byDay @param {string} monthDay @returns {HistoryEvent[]} */
export function eventsForDay(byDay, monthDay) {
  return Object.hasOwn(byDay, monthDay) ? byDay[monthDay] : [];
}

// Bounded, fixed-vocabulary diagnostic: reason codes + counts only, never upstream text.
/** @param {HistoryStatus} s */
export function formatDiagnostic(s) {
  let line = `[history] fetch ${s.state}`;
  if (s.reasons.length) line += ` reasons=${s.reasons.join(',')}`;
  line += ` attempts=${s.attempts}`;
  if (s.httpStatus !== null) line += ` http=${s.httpStatus}`;
  line += ` events=${s.events} skipped=${s.skipped}`;
  if (s.rows !== null) line += ` rows=${s.rows}`;
  return line;
}

class AttemptTimeout extends Error {}

/**
 * One physical request, hard-bounded by timeoutMs even if fetchImpl ignores the abort signal.
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 * @param {number} timeoutMs
 * @returns {Promise<{ ok: true, body: unknown, httpStatus: number } | { ok: false, reason: string, retry: boolean, httpStatus: number | null }>}
 */
async function attempt(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AttemptTimeout());
    }, timeoutMs);
  });
  /** @type {number | null} */
  let httpStatus = null;
  const work = (async () => {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    httpStatus = res.status;
    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      return { ok: false, reason: 'http_status', retry: res.status >= 500 || res.status === 429, httpStatus };
    }
    const text = await res.text();
    try {
      return { ok: true, body: JSON.parse(text), httpStatus };
    } catch {
      return { ok: false, reason: 'non_json', retry: false, httpStatus };
    }
  })();
  try {
    return /** @type {any} */ (await Promise.race([work, timeout]));
  } catch (err) {
    const timedOut = err instanceof AttemptTimeout || controller.signal.aborted;
    return { ok: false, reason: timedOut ? 'timeout' : 'network', retry: true, httpStatus };
  } finally {
    clearTimeout(timer);
    work.catch(() => {}); // a late rejection from an abandoned attempt must stay silent
  }
}

/**
 * A memoized loader: the first call starts the (at most two) physical requests; every later call —
 * one per prerendered digest page — shares the same promise. It never rejects, and logs exactly once.
 * @param {{
 *   url?: string,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   retryDelayMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   log?: (line: string) => void,
 * }} [options]
 * @returns {() => Promise<HistoryResult>}
 */
export function createHistoryLoader(options = {}) {
  const {
    url = resolveHistoryUrl(process.env),
    fetchImpl = (input, init) => fetch(input, init),
    timeoutMs = TIMEOUT_MS,
    retryDelayMs = RETRY_DELAY_MS,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    log = (line) => console.warn(line),
  } = options;

  /** @type {Promise<HistoryResult> | null} */
  let memo = null;

  /** @returns {Promise<HistoryResult>} */
  async function run() {
    /** @type {HistoryResult} */
    let result;
    try {
      let attempts = 0;
      let r;
      for (;;) {
        attempts++;
        r = await attempt(url, fetchImpl, timeoutMs);
        if (r.ok || !r.retry || attempts >= MAX_ATTEMPTS) break;
        await sleep(retryDelayMs);
      }
      result = r.ok ? parseHistoryPayload(r.body) : { byDay: {}, status: makeStatus('unavailable', [r.reason]) };
      result.status.attempts = attempts;
      result.status.httpStatus = r.httpStatus;
    } catch {
      result = { byDay: {}, status: makeStatus('unavailable', ['internal']) };
    }
    try {
      log(formatDiagnostic(result.status));
    } catch {
      // logging must not break the build either
    }
    return result;
  }

  return () => (memo ??= run());
}

/** @type {(() => Promise<HistoryResult>) | null} */
let buildLoader = null;

// The per-build singleton History.astro consumes: module state persists across all prerendered
// pages of one `astro build`, so this is one fetch (+ ≤1 retry) and one diagnostic per build.
/** @returns {Promise<HistoryByDay>} */
export async function historyByDay() {
  buildLoader ??= createHistoryLoader();
  return (await buildLoader()).byDay;
}
