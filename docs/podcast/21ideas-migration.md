# 21ideas podcast migration preparation

The operator chose to continue the existing 21ideas show (Spotify show ID `1vjCoEDFPYaqKm3HasOZrK`) rather than create a separate daily show. Daily digest episodes retain the title and spoken brand «Доброе утро, биткоинер».

## Archive snapshot

`src/data/podcast/21ideas-archive.json` contains 134 historical episodes extracted from the operator-provided Anchor feed on 2026-10-05. All 134 original episode GUIDs, publication dates, titles, descriptions, enclosure URLs/lengths/types, creators, iTunes summaries, durations, artwork, explicit flags, episode types, and available season/episode numbers are preserved. The source XML SHA256 is recorded. The original snapshot remains unchanged; a separate verified media mapping now moves audio enclosure URLs to our server. The prepared route merges this snapshot with new daily episodes; the feed is configured for publication using the operator-approved public contact `bitcoin.translated@gmail.com`. Do not periodically import the old feed after redirecting it: it will point back to our own feed. Refresh the snapshot immediately before migration if Anchor has changed.

The old show is titled `21ideas`, described as «Первый всеобъемлющий подкаст о Биткоине на русском», authored by `Tony Lightning`, language `ru`, category `Education`, non-explicit and episodic. Preserve this identity during the initial move. The existing 3000×3000 JPEG cover was verified and copied to `public/podcasts/21ideas-cover.jpg`; historical audio has been copied to our server without transcoding. New daily episodes use the operator-provided Bitcoin cover at `/podcasts/gm-bitcoiner-cover.png`, resized to 2048×2048 with an opaque background and no redraw. Do not rename the website or change daily digest branding to change the podcast channel title.

## Hosting boundary

The operator approved copying the complete historical audio archive before the Anchor redirect. All 134 original files (8,790,659,333 bytes: 73 M4A and 61 MP3) are stored at `/srv/media/static/podcasts/archive/` on box-21ideas. Filenames use the original UTC publication date with `-v2`, `-v3`, etc. for multiple episodes on the same date; extensions and bytes are unchanged. All declared lengths matched, ffprobe found valid audio streams/durations, and SHA-256 values were recorded in `/srv/media/podcast-archive-manifest.json`.

`src/data/podcast/21ideas-media.json` maps each original GUID and source URL to its verified `https://audio.21ideas.org/podcasts/archive/…` enclosure. The builder requires a complete, unique mapping with matching original size/type and a SHA-256; only the enclosure URL changes. The frozen source snapshot retains original metadata and URLs for auditing. Disabling the mapping deliberately would restore the original URLs; do not do this after cutover without rechecking their availability.

The nginx archive location is recorded in `docs/podcast/audio-archive.nginx.conf` and installed in the audio TLS virtual host. It serves immutable MP3/M4A names with the original MIME types and byte-range support; directory listings, temporary files and other paths remain denied. The daily MP3 route is unchanged. To roll back the server change, restore `/etc/nginx/sites-available/audio.21ideas.org.conf.before-archive-20261005`, run `nginx -t`, then reload nginx. This removes archive access, so only roll back before deploying the migrated RSS or after restoring the old URLs.

One pre-existing metadata discrepancy was found: `2022-01-10.m4a` advertises 1219 seconds in the old RSS but ffprobe measures 1195.085011 seconds. Re-fetching its original enclosure produced exactly the downloaded SHA-256 and size. Keep the original audio and metadata; this discrepancy is unrelated to migration. Do not delete the old Spotify account or episodes during cutover.

## Existing directory listings

- Spotify: https://open.spotify.com/show/1vjCoEDFPYaqKm3HasOZrK
- Apple Podcasts: https://podcasts.apple.com/ru/podcast/21ideas/id1584949114
- Fountain/Podcast Index: operator reports the existing show is present; verify the exact listing/feed association before cutover.

The original enclosures were checked before download. Verify all 134 new public URLs with HEAD and `Range: bytes=0-63`: declared size/type must match and the 206 response must equal the local file prefix.

## Implementation and release gates

This PR prepares the new feed; it does not redirect Anchor or alter existing directory listings. After merge/deployment, validate the public feed and artwork before the separately approved cutover.

1. Extend the pure podcast builder to merge the static historical archive with validated digest audio. Keep the audio sidecar loader and its strict new-media trust rules unchanged. Preserve historical GUIDs and media bytes/lengths/types; reject duplicate identities rather than silently dropping archive entries. Keep descriptions, episode/season numbers and original timestamps. Test the mixed feed and XML escaping.
2. Configure channel title/author/category/artwork for the existing 21ideas show, retaining the digest-specific episode descriptions and support line. The public project contact and general cover are approved. Retain the incomplete-identity guard for future invalid configurations.
3. Build and compare all 134 GUIDs/dates/metadata to the source, allowing only the mapped enclosure URLs to change, plus the accepted new daily episode. Validate the public feed and media. No production directory change before this passes.
4. Check the existing Fountain/Podcast Index listing and its feed association before creating anything. The source RSS contains no podcast namespace fields; presence in Fountain alone does not confirm value-for-value setup. Preserve known directory identities; sats/payment changes are a separate task.
5. After operator-approved cutover, redirect the old Anchor RSS to https://gm.21ideas.org/podcast.xml through Spotify for Creators. Verify the existing Spotify listing and other subscribed applications receive the next new daily episode without duplicate old episodes. Keep the old account and archive intact.

References: [Spotify migration](https://support.spotify.com/us/creators/article/switching-away-from-spotify-for-creators-with-a-301-redirect/) and [Apple migration and stable GUIDs](https://podcasters.apple.com/support/3965-how-to-change-hosting-providers).

## Podcasting 2.0 identity and funding

The feed declares the Podcast Namespace and publishes the existing show GUID
`fbf0dca5-7cff-5518-a776-91ccda2b6612` from `PODCAST_SHOW.guid`. This UUID was confirmed
on 2026-10-05 in the public Fountain show data (`_guid`, with RSS now pointing to
`https://gm.21ideas.org/podcast.xml`) and the BoostMeBitch public directory response
(`podcastGuid`, Podcast Index ID 4255963, Apple ID 1584949114). Preserve it on future
hosting moves; do not derive another UUID from the new feed URL. Episode GUIDs are
independent and unchanged. A missing optional show GUID is omitted; a configured
invalid UUIDv5 follows the existing incomplete-identity guard.

`podcast:funding` links to the canonical `/support/` page. That page already exposes
the project Lightning Address `gmbitcoiner@coinos.io`. Funding is a support-page link;
actual Lightning routing is specified separately by the value blocks below.

### Payment migration boundary

On 2026-10-05 both public directory responses agreed on the current external keysend
split: `tony_lightning@fountain.fm` 74 shares, `bitkorn@fountain.fm` 21,
Fountain 4, and Podcastindex.org 1 (marked as a fee). These are existing recipient
settings, not new fees introduced by this change. The deployed RSS originally had
no value block. The operator approved preserving these archive splits and routing
100% of each daily GM episode to `gmbitcoiner@coinos.io`.

`PODCAST_SHOW.archiveValue` reproduces the exact existing keysend recipients,
shares, custom routing records, fee flags and suggested rate at channel level.
Each validated daily digest audio item has its own `method="lnaddress"` value block,
with one `type="lnaddress"` recipient and `split="100"`, from
`PODCAST_SHOW.dailyLightningAddress`. Daily blocks contain no Fountain/Bitkorn
recipients or additional fee splits. Historical items remain unchanged and inherit
the channel default. Do not remove that default during future configuration changes.
Invalid configured payment destinations follow the incomplete-identity guard.

The public Coinos LNURL-pay endpoint for `gmbitcoiner` returned a valid `payRequest`,
minimum 1 sat, and a 512-character comment allowance. Its corresponding keysend
lookup returned HTTP 404. This confirms address discovery, not successful payment
receipt or universal podcast-app support. No invoice was requested and no payment
was sent during these checks. Never use the shared Coinos node pubkey as a replacement
for account-specific routing data.

After deployment, verify the chosen apps honor the episode-level override and support
LNURL/invoice payments for `lnaddress` recipients. A keysend-only app cannot pay this
Coinos address through the unavailable keysend lookup; do not advertise universal
payment support or mark app payments verified before a real authorized payment test.
Fountain documents external wallets and a separate 1% Boost Bot split for dashboard
analytics. The operator chose 100% Coinos for daily episodes, so no Boost Bot share is
added. The four historical recipients are retained exactly. Keep NWC secrets out of
the public feed and repository.

Sources: [Fountain show](https://fountain.fm/show/chmjnVB1ZkSY3MC2FxY8),
[BoostMeBitch directory record](https://www.boostmebitch.com/api/by-guid?guid=fbf0dca5-7cff-5518-a776-91ccda2b6612),
[Coinos LNURL discovery](https://coinos.io/.well-known/lnurlp/gmbitcoiner),
[Podcast GUID](https://podcasting2.org/docs/podcast-namespace/tags/guid),
[funding](https://podcasting2.org/docs/podcast-namespace/tags/funding),
[Lightning Address payment metadata](https://podcasting2.org/docs/podcast-namespace/examples/value/metadata),
and [Fountain external wallets](https://support.fountain.fm/article/86-can-i-run-my-own-node-using-the-fountain-podcaster-wallet).

## Prepared-feed verification (2026-10-05)

The built `/podcast.xml` contains 135 unique episodes: the 134 historical records and the accepted 2026-10-05 daily digest. A fresh Anchor XML fetch matched every historical title, description, link, GUID and its attributes, publication date, enclosure attributes, creator and iTunes field. The daily item matches its validated audio sidecar, has its own artwork, dynamic teaser and full text/support URLs. The archive remains a static snapshot.

After deployment, fetch `https://gm.21ideas.org/podcast.xml` and confirm HTTP 200, valid XML, the `21ideas` channel identity, 135 items (or more if another daily episode has been published), all historical GUIDs, and the newest daily enclosure. Confirm both artwork URLs return an opaque square JPEG/PNG of 1400–3000 pixels and the audio responds with the declared MIME type/length and byte-range support. Validate through the existing directory account without submitting a duplicate show. Only then perform the separately approved Anchor redirect. The initial feed and both covers were verified publicly after PR #47 deployed. Deployment checks for the new self-hosted enclosure URLs in the feed remain pending until this follow-up PR is merged and deployed.

## Self-hosted audio verification (2026-10-05)

All 134 new public enclosures passed HEAD with the expected size/MIME and `Range: bytes=0-63` with HTTP 206 and a byte-identical local prefix. The existing daily MP3 remains available; archive directory listings, unknown names and `.part` files return 404. The final built feed was compared to the deployed feed from PR #47: the same 135 GUIDs in the same order, exactly 134 replaced enclosure URLs, and every other item field unchanged. Verification passed with 101 tests, Astro check (no errors/warnings), production build and offline link checks. After this PR deploys, recheck the public RSS uses these enclosure URLs before confirming the Anchor redirect.
