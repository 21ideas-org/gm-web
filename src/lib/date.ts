const RU_MONTHS_GENITIVE = [
	'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
	'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

// Nominative case — for a STANDALONE month name ("июнь 2026"), unlike the genitive
// above which is for "5 июня". Used by the /support coverage-block headings (§5.4).
const RU_MONTHS_NOMINATIVE = [
	'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
	'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

// All formatters use UTC fields so a UTC-midnight pubDate isn't shifted across a
// day boundary by the build host's local timezone.

// "DD-MM-YYYY" (e.g. "05-06-2025") — numeric date stamp shown on the site.
export function formatDate(date: Date): string {
	const dd = String(date.getUTCDate()).padStart(2, '0');
	const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
	return `${dd}-${mm}-${date.getUTCFullYear()}`;
}

// "DD.MM.YYYY" (e.g. "05.06.2025") — dotted date stamp shown in the OG card's top-right corner.
export function formatDotDate(date: Date): string {
	const dd = String(date.getUTCDate()).padStart(2, '0');
	const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
	return `${dd}.${mm}.${date.getUTCFullYear()}`;
}

// "D месяца YYYY" (e.g. "5 июня 2025") — natural Russian, used in the OG cover
// subtitle sentence ("…за 4 июня 2025 года").
export function formatRuDate(date: Date): string {
	return `${date.getUTCDate()} ${RU_MONTHS_GENITIVE[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// "D месяца" (e.g. "5 июня") — short day+month, no year. Used for adjacent-post nav labels,
// where consecutive daily digests make the year redundant.
export function formatRuDayMonth(date: Date): string {
	return `${date.getUTCDate()} ${RU_MONTHS_GENITIVE[date.getUTCMonth()]}`;
}

// "месяц YYYY" (e.g. "июнь 2026") — standalone month + year, NOMINATIVE case. Used in the
// /support coverage-block headings ("этот месяц · июнь 2026"). UTC fields, like the others here.
export function formatRuMonth(date: Date): string {
	return `${RU_MONTHS_NOMINATIVE[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// "MM-DD" (e.g. "06-21") — the anniversary key into historyByDay() (src/lib/history.ts). UTC
// fields, like every formatter here, so the digest's own calendar day is used (no host-timezone
// day shift); pubDate is UTC-midnight (bot writes YYYY-MM-DD, zod coerces to …T00:00:00Z).
export function formatMonthDay(date: Date): string {
	const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(date.getUTCDate()).padStart(2, '0');
	return `${mm}-${dd}`;
}
