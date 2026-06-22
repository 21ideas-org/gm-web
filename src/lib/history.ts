// src/lib/history.ts — build-time only (digest pages are prerendered). Memoized: opened once per build.
import Database from 'better-sqlite3';
import { resolve } from 'node:path';

type Event = { title: string; description: string };
type Row = { md: string; title: string | null; description: string | null };

let cache: Record<string, Event[]> | null = null;

// Leading-emoji prefix in the source titles ("🗣️ Сатоши…", "🇸🇻 Принят закон…"): either a flag (two
// Regional_Indicator codepoints) or one Extended_Pictographic base followed by any run of variation
// selectors (U+FE0F) / ZWJ-joined pictographics (U+200D … — family sequences), then the following
// whitespace. A digit- or letter-leading title matches nothing and is left intact.
const EMOJI_PREFIX =
  /^(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u;

// Group the curated events by month-day ("MM-DD") so a digest can look up its anniversary in O(1).
// Never hard-fails the build: the bot's digest pushes share this build lane (plans/testing.md), so a
// DB/SQL error must surface in the log (console.warn) but still produce {} — every digest then just
// renders no rubric, mirroring the `[tags] unmapped H2` drift-detector policy.
export function historyByDay(): Record<string, Event[]> {
  if (cache) return cache;
  const out: Record<string, Event[]> = {};
  try {
    // resolve(process.cwd(), …) — the repo's build-time file-read convention (cf. src/lib/og.ts fonts).
    // NOT import.meta.url: modules are bundled at build, so import.meta.url won't point at src/data/.
    const db = new Database(resolve(process.cwd(), 'src/data/events_ru.db'), { readonly: true });
    const rows = db
      .prepare("SELECT strftime('%m-%d', date) AS md, title, description FROM events ORDER BY md, date")
      .all() as Row[];
    db.close();
    // Silent-failure guard: committed DB has 505 rows — zero means a real problem (missing file, bad
    // query). Warn loud, like the `[tags] unmapped H2` detector; don't throw (shared bot-publish lane).
    if (rows.length === 0)
      console.warn('[history] events_ru.db returned 0 rows — rubric will be empty on every digest');
    for (const r of rows) {
      // Defensive: schema allows NULL title/description (today 0, but the DB is hand-edited going
      // forward). Drop incomplete rows so a future null can't crash the build at render time. Strip
      // the source's leading emoji prefix (editorial decision — see plans/history-rubric.md §8.2).
      const title = r.title?.replace(EMOJI_PREFIX, '').trim();
      const description = r.description?.trim();
      if (!title || !description) continue;
      (out[r.md] ??= []).push({ title, description });
    }
  } catch (err) {
    console.warn('[history] failed to read events_ru.db — rubric disabled this build:', err);
  }
  return (cache = out);
}
