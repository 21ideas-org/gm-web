// Existing 21ideas show identity for /podcast.xml. See docs/podcast/21ideas-migration.md.
// The operator approved the public project email. Square podcast artwork is separate from OG cards.
// Missing or invalid identity fields still suppress feed generation and advertisement.

/**
 * @typedef {{
 *   siteOrigin: string,
 *   title: string,
 *   description: string,
 *   language: string,
 *   author: string,
 *   ownerName: string,
 *   ownerEmail: string,
 *   category: string,
 *   imageUrl: string,
 *   episodeImageUrl?: string,
 *   guid?: string,
 * }} PodcastShow
 */

/** @type {Readonly<PodcastShow>} */
export const PODCAST_SHOW = Object.freeze({
  guid: 'fbf0dca5-7cff-5518-a776-91ccda2b6612', // existing Podcast Index/Fountain identity; preserve across hosting moves
  siteOrigin: 'https://gm.21ideas.org', // bare HTTPS origin for the self, digest and support URLs
  title: '21ideas',
  description: 'Первый всеобъемлющий подкаст о Биткоине на русском',
  language: 'ru',
  author: 'Tony Lightning', // preserve the existing show's author during migration
  ownerName: '21ideas',
  ownerEmail: 'bitcoin.translated@gmail.com', // operator-approved public ownership contact
  category: 'Education', // Apple Podcasts category text
  imageUrl: 'https://gm.21ideas.org/podcasts/21ideas-cover.jpg', // existing 21ideas cover, verified 3000×3000 JPEG
  episodeImageUrl: 'https://gm.21ideas.org/podcasts/gm-bitcoiner-cover.png',
});
