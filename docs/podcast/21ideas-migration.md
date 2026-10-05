# 21ideas podcast migration preparation

The operator chose to continue the existing 21ideas show (Spotify show ID `1vjCoEDFPYaqKm3HasOZrK`) rather than create a separate daily show. Daily digest episodes retain the title and spoken brand «Доброе утро, биткоинер».

## Archive snapshot

`src/data/podcast/21ideas-archive.json` contains 134 historical episodes extracted from the operator-provided Anchor feed on 2026-10-05. All 134 original episode GUIDs, publication dates, titles, descriptions, enclosure URLs/lengths/types, creators, iTunes summaries, durations, artwork, explicit flags, episode types, and available season/episode numbers are preserved. The source XML SHA256 is recorded. No audio files were downloaded. The prepared route merges this snapshot with new daily episodes; the feed is configured for publication using the operator-approved public contact `bitcoin.translated@gmail.com`. Do not periodically import the old feed after redirecting it: it will point back to our own feed. Refresh the snapshot immediately before migration if Anchor has changed.

The old show is titled `21ideas`, described as «Первый всеобъемлющий подкаст о Биткоине на русском», authored by `Tony Lightning`, language `ru`, category `Education`, non-explicit and episodic. Preserve this identity during the initial move. The existing 3000×3000 JPEG cover was verified and copied to `public/podcasts/21ideas-cover.jpg`; historical audio remains external. New daily episodes use the operator-provided Bitcoin cover at `/podcasts/gm-bitcoiner-cover.png`, resized to 2048×2048 with an opaque background and no redraw. Do not rename the website or change daily digest branding to change the podcast channel title.

## Hosting boundary

The archive declares about 8.19 GiB of audio, including 73 M4A and 61 MP3 enclosures. Our RSS can reference these original remote files while new daily episodes use audio.21ideas.org. This avoids copying old audio to our server, but keeps archive availability dependent on Anchor/Spotify and its CloudFront storage. The original enclosures include Anchor redirect URLs; checking today's availability does not prove post-migration retention. Spotify's migration instructions require importing episodes before redirecting, but do not guarantee indefinite availability of old files for an externally hosted feed. The operator chose to retain these external links and accepted this dependency, declining a support inquiry. A support response is not a cutover prerequisite. Do not delete the old account or episodes. If retention cannot be established, copying roughly 8.19 GiB once is the durable alternative; seek operator approval before doing so.

## Existing directory listings

- Spotify: https://open.spotify.com/show/1vjCoEDFPYaqKm3HasOZrK
- Apple Podcasts: https://podcasts.apple.com/ru/podcast/21ideas/id1584949114
- Fountain/Podcast Index: operator reports the existing show is present; verify the exact listing/feed association before cutover.

All 134 historical enclosures returned successful HEAD responses with matching declared lengths on 2026-10-05. Availability today does not guarantee retention after migration.

## Implementation and release gates

This PR prepares the new feed; it does not redirect Anchor or alter existing directory listings. After merge/deployment, validate the public feed and artwork before the separately approved cutover.

1. Extend the pure podcast builder to merge the static historical archive with validated digest audio. Keep the audio sidecar loader and its strict new-media trust rules unchanged. Preserve historical GUIDs and enclosure bytes/attributes; reject duplicate identities rather than silently dropping archive entries. Keep descriptions, episode/season numbers and original timestamps. Test the mixed feed and XML escaping.
2. Configure channel title/author/category/artwork for the existing 21ideas show, retaining the digest-specific episode descriptions and support line. The public project contact and general cover are approved. Retain the incomplete-identity guard for future invalid configurations.
3. Build and compare all 134 old GUIDs/enclosures/dates to the source, plus the accepted new daily episode. Validate the public feed and media. No production directory change before this passes.
4. Check the existing Fountain/Podcast Index listing and its feed association before creating anything. The source RSS contains no podcast namespace fields; presence in Fountain alone does not confirm value-for-value setup. Preserve known directory identities; sats/payment changes are a separate task.
5. After operator-approved cutover, redirect the old Anchor RSS to https://gm.21ideas.org/podcast.xml through Spotify for Creators. Verify the existing Spotify listing and other subscribed applications receive the next new daily episode without duplicate old episodes. Keep the old account and archive intact.

References: [Spotify migration](https://support.spotify.com/us/creators/article/switching-away-from-spotify-for-creators-with-a-301-redirect/) and [Apple migration and stable GUIDs](https://podcasters.apple.com/support/3965-how-to-change-hosting-providers).

## Prepared-feed verification (2026-10-05)

The built `/podcast.xml` contains 135 unique episodes: the 134 historical records and the accepted 2026-10-05 daily digest. A fresh Anchor XML fetch matched every historical title, description, link, GUID and its attributes, publication date, enclosure attributes, creator and iTunes field. The daily item matches its validated audio sidecar, has its own artwork, dynamic teaser and full text/support URLs. The archive remains a static snapshot.

After deployment, fetch `https://gm.21ideas.org/podcast.xml` and confirm HTTP 200, valid XML, the `21ideas` channel identity, 135 items (or more if another daily episode has been published), all historical GUIDs, and the newest daily enclosure. Confirm both artwork URLs return an opaque square JPEG/PNG of 1400–3000 pixels and the audio responds with the declared MIME type/length and byte-range support. Validate through the existing directory account without submitting a duplicate show. Only then perform the separately approved Anchor redirect. Public deployment checks are pending until this PR is merged and deployed.
