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
 *   archiveValueOverrides?: Record<string, ArchiveValue>,
 *   dailyLightningAddress?: string,
 * }} PodcastShow
 */

// The original four-way split applies only to these twelve book episodes.
// Use stable GUIDs from the frozen archive, never title matching at runtime.
/** @type {ArchiveValue} */
const PRICE_OF_TOMORROW_VALUE = {
  type: 'lightning',
  method: 'keysend',
  suggested: '0.00000005000',
  recipients: [
    { name: 'tony_lightning@fountain.fm', type: 'node', address: '03b6f613e88bd874177c28c6ad83b3baba43c4c656f56be1f8df84669556054b79', split: 74, customKey: '906608', customValue: '01F4o1zomYItiSp2yxeHhD', fee: false },
    { name: 'bitkorn@fountain.fm', type: 'node', address: '03b6f613e88bd874177c28c6ad83b3baba43c4c656f56be1f8df84669556054b79', split: 21, customKey: '906608', customValue: '01RjOT2ii5o5u9o7UAIxil', fee: false },
    { name: 'Fountain', type: 'node', address: '03b6f613e88bd874177c28c6ad83b3baba43c4c656f56be1f8df84669556054b79', split: 4, customKey: '906608', customValue: '01FOUNTAIN', fee: false },
    { name: 'Podcastindex.org', type: 'node', address: '03ae9f91a0cb8ff43840e3c322c4c61f019d8c1c3cea15a25cfc425ac605e61a4a', split: 1, fee: true },
  ],
};
const PRICE_OF_TOMORROW_GUIDS = [
  '6564a203-3ccc-4174-a30c-2fc3670ca877',
  '6cd75e73-a871-44ad-b412-498b36f94a60',
  '80e6022d-9a6a-4096-80f6-01fdc6838fe7',
  'c755aae8-1c62-478e-88ec-150c9b7b252d',
  '257ecddf-b0fe-42e8-b691-ebe32421eead',
  '3f4ee78f-e2d5-423a-ae45-67fea1fe0e00',
  'a042ae17-9295-46b7-ae6d-2378701bac78',
  'cfe9e03c-bf69-44db-bb5e-42b00a10a02c',
  '663e69e2-4c41-4e67-9f4f-96836ddbe9ca',
  'f0d33f98-67d1-43e7-8b90-b61e7dfbf847',
  'aa4361e8-0d8e-4cb3-a8f0-f2d550913009',
  'a74a4612-5eda-4dc9-a3ea-59f55cf36249',
];

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
  archiveValue: {
    ...PRICE_OF_TOMORROW_VALUE,
    // The book narrator's 21 shares return to the owner outside this book series.
    recipients: [{ ...PRICE_OF_TOMORROW_VALUE.recipients[0], split: 95 }, ...PRICE_OF_TOMORROW_VALUE.recipients.slice(2)],
  },
  archiveValueOverrides: Object.fromEntries(PRICE_OF_TOMORROW_GUIDS.map((guid) => [guid, PRICE_OF_TOMORROW_VALUE])),
});
