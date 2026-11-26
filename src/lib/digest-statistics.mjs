import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: false });
export const networkStatLabels = {
  ru: { price: 'Цена', block: 'Блок', hashrate: 'Хешрейт', fee: 'Комиссия' },
  en: { price: 'Price', block: 'Block', hashrate: 'Hashrate', fee: 'Fee' },
};
const editions = {
  ru: { heading: 'Статистика сети', market: 'Рынок', network: 'Сеть', mempool: 'Мемпул', nextBlock: 'Следующий блок' },
  en: { heading: 'Network Stats', market: 'Market', network: 'Network', mempool: 'Mempool', nextBlock: 'Next block' },
};

const rowValue = (content, label) => content.match(new RegExp(`^${label}[^\\S\\r\\n]+(.+)$`, 'm'))?.[1];

function compactValues(content, { market, network, mempool, nextBlock }, blockLabel) {
  const metrics = rowValue(content, network)?.split(' · ') ?? [];
  const block = metrics.find(value => value.startsWith(`${blockLabel} #`));
  const mempoolValue = rowValue(content, mempool);
  const feePrefix = `${nextBlock} ≈ `;
  return {
    price: rowValue(content, market),
    block: block?.slice(blockLabel.length + 1),
    hashrate: metrics.find(value => value.endsWith(' EH/s')),
    fee: mempoolValue?.startsWith(feePrefix) ? mempoolValue.slice(feePrefix.length) : undefined,
  };
}

/** Read the published network snapshot used by the homepage and masthead. @param {string} [body] @param {'ru' | 'en'} [locale] */
export function digestStatistics(body = '', locale = 'ru') {
  const edition = editions[locale];
  const labels = networkStatLabels[locale];
  const tokens = markdown.parse(body, {});
  let section = '';
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'heading_open' && token.tag === 'h2') section = tokens[i + 1].content;
    if (token.type !== 'fence' || section !== edition.heading) continue;
    const compact = compactValues(token.content, edition, labels.block);
    return Object.entries(labels).flatMap(([key, label]) => {
      const value = compact[key] ?? rowValue(token.content, `  ${label}`);
      return value ? [{ key, label, value }] : [];
    });
  }
  return [];
}
