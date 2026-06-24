// Brand naming — keep usage consistent (see docs/ARCHITECTURE.md → Naming):
//   SITE_TITLE — the wordmark, for display/chrome (page-title suffix, nav, footer, OG strip).
//   SITE_NAME  — the editorial / publisher name, for machine-read metadata (schema.org,
//                og:site_name, RSS/Yandex feed titles) that engines and readers show literally.
export const SITE_TITLE = 'gm_₿';
export const SITE_NAME = 'Доброе утро, биткоинер';
export const SITE_DESCRIPTION = 'Биткоин-онли дайджесты';

// Financial-transparency page (/support). The wallet address consts live with the page (Phase 2);
// these two feed the build-time reader src/lib/finances.ts only.
export const SERVER_USD_PER_MONTH = 5; // all-in infra, flat — added to each month's token cost.
export const FINANCES_START = '2026-06'; // first month tracked (UTC) — display window only.
