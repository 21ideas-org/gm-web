/** @typedef {'fountain' | 'apple' | 'spotify' | 'boost-me-bitch'} PodcastAppId */
/** @typedef {{ id: PodcastAppId, name: string, url: string, order: number, description?: string, paymentsVerified?: boolean, lightning?: boolean }} PodcastApp */
// Only verified show URLs from directory rollout belong here. Empty URLs render nothing.
/** @type {ReadonlyArray<PodcastApp>} */
export const PODCAST_APPS = Object.freeze([
  { id: 'fountain', name: 'Fountain', url: 'https://fountain.fm/show/chmjnVB1ZkSY3MC2FxY8', order: 0, lightning: true },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com/show/1vjCoEDFPYaqKm3HasOZrK', order: 1 },
  { id: 'apple', name: 'Apple Podcasts', url: 'https://podcasts.apple.com/ua/podcast/21ideas/id1584949114', order: 2 },
  { id: 'boost-me-bitch', name: 'Boost Me Bitch', url: 'https://www.boostmebitch.com/?podcast=fbf0dca5-7cff-5518-a776-91ccda2b6612', order: 3, lightning: true },
]);
const IDS = new Set(PODCAST_APPS.map(app => app.id));
const BOOST_HOSTS = new Set(['boostmebitch.com', 'www.boostmebitch.com']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Boost Me Bitch addresses shows only as `/?podcast={uuid}` on its own host.
/** @param {PodcastAppId} id @param {URL} url */
const isBoostShowUrl = (id, url) => id === 'boost-me-bitch' && BOOST_HOSTS.has(url.hostname) && !url.port
  && !url.hash && [...url.searchParams.keys()].join() === 'podcast' && UUID.test(url.searchParams.get('podcast') ?? '');
/** @param {ReadonlyArray<PodcastApp>} apps @returns {PodcastApp[]} */
export function configuredPodcastApps(apps = PODCAST_APPS) {
  return apps.filter(app => {
    if (!IDS.has(app.id) || !app.url || /[\s\u0000-\u001f\u007f]/.test(app.url)) return false;
    try {
      const url = new URL(app.url);
      return url.protocol === 'https:' && !url.username && !url.password
        && (url.pathname !== '/' || isBoostShowUrl(app.id, url));
    } catch { return false; }
  }).sort((a, b) => a.order - b.order).map(app => ({
    ...app,
    description: app.id === 'fountain'
      ? (app.paymentsVerified === true ? 'Слушай и поддерживай сатами' : undefined)
      : app.description,
  }));
}
