const RU_MONTHS_GENITIVE = [
	'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
	'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

// All formatters use UTC fields so a UTC-midnight pubDate isn't shifted across a
// day boundary by the build host's local timezone.

// "DD-MM-YYYY" (e.g. "05-06-2025") — numeric date stamp shown on the site.
export function formatDate(date: Date): string {
	const dd = String(date.getUTCDate()).padStart(2, '0');
	const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
	return `${dd}-${mm}-${date.getUTCFullYear()}`;
}

// "D месяца YYYY" (e.g. "5 июня 2025") — natural Russian, used in the OG cover
// subtitle sentence ("…за 4 июня 2025 года").
export function formatRuDate(date: Date): string {
	return `${date.getUTCDate()} ${RU_MONTHS_GENITIVE[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
