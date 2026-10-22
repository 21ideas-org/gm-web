const BASE = 'https://mempool.space';
const INTERVAL = 60_000;
const locales = {
  ru: { language: 'ru-RU', feeUnit: 'сат/vB', updated: 'Обновлено', lastUpdated: 'Последнее обновление', unavailable: 'нет обновления' },
  en: { language: 'en-US', feeUnit: 'sat/vB', updated: 'Updated', lastUpdated: 'Last updated', unavailable: 'update unavailable' },
};

/** @param {typeof fetch} [fetcher] @param {AbortSignal} [signal] @param {'ru' | 'en'} [locale] */
export async function fetchNetworkStats(fetcher = fetch, signal, locale = 'ru') {
  const { language, feeUnit } = locales[locale];
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 0 });
  const feeNumber = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  const paths = ['/api/v1/prices', '/api/blocks/tip/height', '/api/v1/mining/hashrate/3d', '/api/v1/fees/recommended'];
  const [prices, heightText, mining, fees] = await Promise.all(paths.map(async path => {
    const response = await fetcher(BASE + path, { signal, credentials: 'omit', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Network statistics HTTP ${response.status}`);
    return path.endsWith('/height') ? response.text() : response.json();
  }));
  const height = /^\d+$/.test(heightText.trim()) ? Number(heightText) : NaN;
  if (typeof prices.USD !== 'number' || !Number.isFinite(prices.USD) || prices.USD <= 0 ||
      !Number.isSafeInteger(height) || height <= 0 ||
      typeof mining.currentHashrate !== 'number' || !Number.isFinite(mining.currentHashrate) || mining.currentHashrate <= 0 ||
      typeof fees.halfHourFee !== 'number' || !Number.isFinite(fees.halfHourFee) || fees.halfHourFee < 0) {
    throw new Error('Invalid network statistics');
  }
  return {
    price: '$' + number.format(prices.USD),
    block: '#' + number.format(height),
    hashrate: number.format(mining.currentHashrate / 1e18) + ' EH/s',
    fee: feeNumber.format(fees.halfHourFee) + ' ' + feeUnit,
  };
}

/** Enhance the published snapshot only after a complete, valid live update. @param {HTMLElement} root */
export function initializeNetworkStats(root) {
  if (root.dataset.statsInitialized) return;
  const status = root.querySelector('[data-stats-status]');
  const label = root.querySelector('[data-stats-label]');
  const dot = root.querySelector('[data-stats-dot]');
  if (!(status instanceof HTMLElement) || !(label instanceof HTMLElement) || !(dot instanceof HTMLElement)) return;
  const snapshotLabel = label.textContent;
  const snapshotTitle = status.title;
  const locale = root.dataset.statsLocale === 'en' ? 'en' : 'ru';
  const text = locales[locale];
  const time = timestamp => new Date(timestamp).toLocaleTimeString(text.language);
  let timer;
  let controller;
  let pending = false;
  let failures = 0;
  let lastAttempt = 0;
  let lastUpdate = 0;
  root.dataset.statsInitialized = 'true';

  async function refresh() {
    if (pending || document.hidden || !root.isConnected) return;
    pending = true;
    lastAttempt = Date.now();
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const values = await fetchNetworkStats(fetch, controller.signal, locale);
      if (!root.isConnected || document.hidden) return;
      root.querySelectorAll('[data-stat-field]').forEach(field => {
        const value = values[field.getAttribute('data-stat-field')];
        if (value !== undefined) field.textContent = value;
      });
      lastUpdate = Date.now();
      failures = 0;
      root.dataset.updatedAt = new Date(lastUpdate).toISOString();
      status.dataset.state = 'live';
      label.textContent = 'live';
      status.title = `mempool.space · ${text.updated} ${time(lastUpdate)}`;
      dot.hidden = false;
    } catch {
      if (document.hidden) return;
      failures++;
      status.dataset.state = lastUpdate ? 'stale' : 'snapshot';
      label.textContent = lastUpdate ? text.unavailable : snapshotLabel;
      status.title = lastUpdate ? `${text.lastUpdated}: ${time(lastUpdate)}` : snapshotTitle;
      dot.hidden = true;
    } finally {
      controller.abort();
      clearTimeout(timeout);
      pending = false;
      if (!document.hidden && root.isConnected) timer = setTimeout(refresh, INTERVAL * Math.min(2 ** failures, 5));
    }
  }

  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (document.hidden) controller?.abort();
    else if (!pending) {
      const delay = Math.max(0, INTERVAL - (Date.now() - lastAttempt));
      timer = setTimeout(refresh, delay);
    }
  });
  refresh();
}
