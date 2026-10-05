// Pure listening-page selection. Audio validation belongs exclusively to audio.mjs.
/**
 * @template {{ id: string, data: { draft?: boolean, pubDate: Date } }} T
 * @param {T[]} digests
 * @param {Map<string, import('./audio.mjs').AudioEpisode>} audio
 */
export function listeningEpisodes(digests, audio) {
  return digests
    .filter(post => !post.data.draft && audio.get(post.id)?.episodeId === post.id)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
    .map(post => ({ post, audio: audio.get(post.id) }));
}

/** @param {boolean} identityComplete @param {number} episodeCount */
export const listeningReady = (identityComplete, episodeCount) => identityComplete && episodeCount > 0;
