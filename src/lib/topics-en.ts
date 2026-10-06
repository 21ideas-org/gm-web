// Display labels mirror gm-bitcoiner/lib/topics.js TOPIC_EN; slugs are the existing RU contract.
export const TOPICS_EN: Record<string, string> = {
  market: 'Price & Market', institutions: 'Institutions & Treasuries', regulation: 'Regulation & Policy',
  lightning: 'Lightning & L2', mining: 'Mining', tech: 'Technology & Development',
  security: 'Security & Privacy', community: 'Community', funds: 'Funds & ETFs', scandals: 'Bitcoin Rap Sheet',
};
export function englishTagsFromHeadings(headings: { depth: number; text: string }[]) {
  return [...new Set(headings.filter(h => h.depth === 2).flatMap(h =>
    Object.entries(TOPICS_EN).filter(([, label]) => label === h.text).map(([slug]) => slug)))];
}
