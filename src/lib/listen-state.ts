import { eligibleEdition } from '../lib/editions.mjs';
import { getCollection } from 'astro:content';
import { audioEpisodes } from './audio.mjs';
import { listeningEpisodes, listeningReady } from './listen.mjs';
import { configuredPodcastApps } from './podcast-apps.mjs';
import { PODCAST_SHOW } from './podcast-config.mjs';
import { podcastShowStatus, PODCAST_FEED_PATH } from './podcast.mjs';

let memo: ReturnType<typeof buildListeningState> | undefined;
async function buildListeningState() {
  const posts = await getCollection('digests', eligibleEdition);
  const episodes = listeningEpisodes(posts, audioEpisodes());
  const ready = listeningReady(podcastShowStatus(PODCAST_SHOW).complete, episodes.length);
  return { episodes, ready, apps: configuredPodcastApps(), feedUrl: ready ? `${PODCAST_SHOW.siteOrigin}${PODCAST_FEED_PATH}` : undefined };
}
export function listeningState() { return memo ??= buildListeningState(); }
