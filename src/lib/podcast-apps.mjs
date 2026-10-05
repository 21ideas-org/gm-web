/** @typedef {'fountain' | 'apple' | 'spotify' | 'boost-me-bitch'} PodcastAppId */
/** @typedef {{ id: PodcastAppId, name: string, url: string, order: number, description?: string, paymentsVerified?: boolean, lightning?: boolean }} PodcastApp */
// Only verified show URLs from directory rollout belong here. Empty URLs render nothing.
/** @type {ReadonlyArray<PodcastApp>} */
export const PODCAST_APPS = Object.freeze([
  { id: 'fountain', name: 'Fountain', url: '', order: 0, lightning: true },
  { id: 'spotify', name: 'Spotify', url: '', order: 1 },
  { id: 'apple', name: 'Apple Podcasts', url: '', order: 2 },
  { id: 'boost-me-bitch', name: 'Boost Me Bitch', url: '', order: 3, lightning: true },
]);
const IDS = new Set(PODCAST_APPS.map(app => app.id));
/** @param {ReadonlyArray<PodcastApp>} apps @returns {PodcastApp[]} */
export function configuredPodcastApps(apps = PODCAST_APPS) {
  return apps.filter(app => {
    if (!IDS.has(app.id) || !app.url || /[\s\u0000-\u001f\u007f]/.test(app.url)) return false;
    try {
      const url = new URL(app.url);
      return url.protocol === 'https:' && !url.username && !url.password && url.pathname !== '/';
    } catch { return false; }
  }).sort((a, b) => a.order - b.order).map(app => ({
    ...app,
    description: app.id === 'fountain'
      ? (app.paymentsVerified === true ? 'Слушай и поддерживай сатами' : undefined)
      : app.description,
  }));
}
