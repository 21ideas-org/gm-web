import { TAGS } from './topics';
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

export const TAGS_EN = TAGS.map(t => ({
  ...t, topic: TOPICS_EN[t.slug], label: TOPICS_EN[t.slug],
  hubTitle: `${TOPICS_EN[t.slug]} — Bitcoin news`,
  hubDesc: `Daily Bitcoin news about ${TOPICS_EN[t.slug].toLowerCase()}, with links to original sources.`,
}));
export const BY_TOPIC_EN = new Map(TAGS_EN.map(t => [t.topic, t]));
