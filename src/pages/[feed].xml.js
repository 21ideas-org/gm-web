// /podcast.xml — the podcast RSS feed (audio episodes only; /rss.xml stays the full-text feed).
// A dynamic route so that, while the show identity in src/lib/podcast-config.mjs is incomplete,
// getStaticPaths() returns no path and the build emits no file at all (and BaseHead advertises nothing).
import { getCollection } from 'astro:content';
import { audioEpisodes } from '../lib/audio.mjs';
import { formatRuDate } from '../lib/date';
import archive from '../data/podcast/21ideas-archive.json';
import { PODCAST_SHOW } from '../lib/podcast-config.mjs';
import { podcastFeedPaths, renderPodcastFeed } from '../lib/podcast.mjs';

export const getStaticPaths = () => podcastFeedPaths(PODCAST_SHOW);

export async function GET() {
	const digests = (await getCollection('digests', (p) => !p.data.draft)).map((p) => ({
		id: p.id,
		title: p.data.title,
		description: p.data.description, // the capitalized teaser of the Telegram card / OG cover
		dateLabel: formatRuDate(p.data.pubDate),
		draft: p.data.draft,
	}));
	const xml = renderPodcastFeed({ show: PODCAST_SHOW, digests, audio: audioEpisodes(), archive });
	return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
