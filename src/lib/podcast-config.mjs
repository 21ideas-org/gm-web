// src/lib/podcast-config.mjs — podcast show identity for /podcast.xml (see docs/ARCHITECTURE.md →
// Podcast feed). Pure ESM so scripts/podcast.test.mjs can import it. The feed is built and advertised
// ONLY when every field passes podcastShowStatus() (src/lib/podcast.mjs); until the human rollout fills
// in `imageUrl` and `ownerEmail` the site simply has no /podcast.xml and no feed link — text builds
// are unaffected. Do not put a personal address here, and do not point `imageUrl` at the 1200×630
// OG card: directories need a square 1400–3000 px JPEG/PNG cover.

import { SITE_NAME, SITE_DESCRIPTION } from '../site-identity.mjs';

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
 * }} PodcastShow
 */

/** @type {Readonly<PodcastShow>} */
export const PODCAST_SHOW = Object.freeze({
  siteOrigin: 'https://gm.21ideas.org', // bare HTTPS origin for the self, digest and support URLs
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  language: 'ru',
  author: SITE_NAME, // org-as-author, like the schema.org Organization
  ownerName: SITE_NAME,
  ownerEmail: '', // ← rollout: project ownership contact (blank ⇒ feed unpublished)
  category: 'News', // Apple Podcasts category text
  imageUrl: '', // ← rollout: square HTTPS cover, 1400–3000 px (blank ⇒ feed unpublished)
});
