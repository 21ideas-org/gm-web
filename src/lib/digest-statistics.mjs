import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: false });
const editions = {
  ru: { heading: 'Статистика сети', labels: { price: 'Цена', block: 'Блок', hashrate: 'Хешрейт', fee: 'Комиссия' } },
  en: { heading: 'Network Stats', labels: { price: 'Price', block: 'Block', hashrate: 'Hashrate', fee: 'Fee' } },
};

/** Read the published network snapshot used by the homepage and masthead. @param {string} [body] @param {'ru' | 'en'} [locale] */
export function digestStatistics(body = '', locale = 'ru') {
  const { heading, labels } = editions[locale];
  const tokens = markdown.parse(body, {});
  let section = '';
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'heading_open' && token.tag === 'h2') section = tokens[i + 1].content;
    if (token.type !== 'fence' || section !== heading) continue;
    return Object.entries(labels).flatMap(([key, label]) => {
      const value = token.content.match(new RegExp(`^  ${label}\\s+(.+)$`, 'm'))?.[1];
      return value ? [{ key, label, value }] : [];
    });
  }
  return [];
}
