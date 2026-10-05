// Existing 21ideas show identity for /podcast.xml. See docs/podcast/21ideas-migration.md.
// The operator approved the public project email. Square podcast artwork is separate from OG cards.
// Missing or invalid identity fields still suppress feed generation and advertisement.

/**
 * @typedef {{ name: string, type: 'node', address: string, split: number,
 *   customKey?: string, customValue?: string, fee?: boolean }} ArchiveValueRecipient
 * @typedef {{ type: 'lightning', method: 'keysend', suggested: string,
 *   recipients: ArchiveValueRecipient[] }} ArchiveValue
 *
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
 *   archiveValue?: ArchiveValue,
 *   dailyLightningAddress?: string,
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
  dailyLightningAddress: 'gmbitcoiner@coinos.io', // operator-approved 100% recipient for daily GM episodes
  // Existing external split, verified in Fountain and Podcast Index on 2026-10-05.
  // Channel default preserves historical payments; each daily episode overrides it below.
  archiveValue: {
    type: 'lightning',
    method: 'keysend',
    suggested: '0.00000005000',
    recipients: [
      { name: 'tony_lightning@fountain.fm', type: 'node', address: '03b6f613e88bd874177c28c6ad83b3baba43c4c656f56be1f8df84669556054b79', split: 74, customKey: '906608', customValue: '01F4o1zomYItiSp2yxeHhD', fee: false },
      { name: 'bitkorn@fountain.fm', type: 'node', address: '03b6f613e88bd874177c28c6ad83b3baba43c4c656f56be1f8df84669556054b79', split: 21, customKey: '906608', customValue: '01RjOT2ii5o5u9o7UAIxil', fee: false },
      { name: 'Fountain', type: 'node', address: '03b6f613e88bd874177c28c6ad83b3baba43c4c656f56be1f8df84669556054b79', split: 4, customKey: '906608', customValue: '01FOUNTAIN', fee: false },
      { name: 'Podcastindex.org', type: 'node', address: '03ae9f91a0cb8ff43840e3c322c4c61f019d8c1c3cea15a25cfc425ac605e61a4a', split: 1, fee: true },
    ],
  },
});
