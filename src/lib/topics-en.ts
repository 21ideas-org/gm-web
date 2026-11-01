import { TAGS } from './topics';
// Display labels mirror gm-bitcoiner/lib/topics.js TOPIC_EN; slugs are the existing RU contract.
export const TOPICS_EN: Record<string, string> = {
  market: 'Price & Market', institutions: 'Institutions & Treasuries', regulation: 'Regulation & Policy',
  lightning: 'Lightning & L2', mining: 'Mining', tech: 'Technology & Development',
  security: 'Security & Privacy', community: 'Community', funds: 'Funds & ETFs', scandals: 'Bitcoin Rap Sheet',
};
const TOPIC_DESCRIPTIONS_EN: Record<string, string> = {
  market: 'Bitcoin price, trading volumes, liquidations and market trends.',
  institutions: 'Corporate and government Bitcoin holdings: purchases, sales and treasury strategies.',
  regulation: 'Bitcoin laws, taxation, court rulings and public policy.',
  lightning: 'Lightning Network and other Bitcoin L2 solutions: payments, wallets and updates.',
  mining: 'Bitcoin mining hardware, hashrate, difficulty, energy and mining pools.',
  tech: 'Bitcoin Core, protocol updates, developer proposals and software tools.',
  security: 'Vulnerabilities, wallet and node security, key protection and privacy.',
  community: 'People, projects, conferences and culture in the Bitcoin community.',
  funds: 'Bitcoin ETFs and other investment products: launches, inflows and outflows.',
  scandals: 'Bitcoin-related fraud, theft, investigations and criminal cases.',
};

export function englishTagsFromHeadings(headings: { depth: number; text: string }[]) {
  return [...new Set(headings.filter(h => h.depth === 2).flatMap(h =>
    Object.entries(TOPICS_EN).filter(([, label]) => label === h.text).map(([slug]) => slug)))];
}

export const TAGS_EN = TAGS.map(t => ({
  ...t, topic: TOPICS_EN[t.slug], label: TOPICS_EN[t.slug],
  hubTitle: `${TOPICS_EN[t.slug]} — Bitcoin news`,
  hubDesc: TOPIC_DESCRIPTIONS_EN[t.slug],
}));
export const BY_TOPIC_EN = new Map(TAGS_EN.map(t => [t.topic, t]));
