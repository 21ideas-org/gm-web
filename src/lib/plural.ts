// Russian quantitative-noun pluralization. Picks the correct declension for a
// count: the form depends on the last digit, with an override for the "teens"
// (11–14, which always take the genitive plural regardless of last digit).
//
//   plural(n, ['дайджест', 'дайджеста', 'дайджестов'])
//     one → 1, 21, 31…        ("1 дайджест")
//     few → 2-4, 22-24…       ("2 дайджеста")
//     many → 0, 5-20, 25-30…  ("5 дайджестов")
export function plural(n: number, [one, few, many]: [string, string, string]): string {
	const mod10 = Math.abs(n) % 10;
	const mod100 = Math.abs(n) % 100;
	if (mod100 >= 11 && mod100 <= 14) return many;
	if (mod10 === 1) return one;
	if (mod10 >= 2 && mod10 <= 4) return few;
	return many;
}
