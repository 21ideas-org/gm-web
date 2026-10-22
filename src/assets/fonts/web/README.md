# Browser fonts

Self-hosted WOFF2 files used by `src/styles/fonts.css`. Astro fingerprints these assets at build
time. The Latin, Latin Extended, Cyrillic and Cyrillic Extended subsets retain the upstream
`unicode-range` declarations, so browsers download only the subsets used on a page.

Downloaded from the Google Fonts CSS API on 2026-10-22:

| Family | Google Fonts asset version | Styles and weights | Upstream |
| --- | --- | --- | --- |
| IBM Plex Sans | v23 | Normal and italic, variable 400–700 | https://github.com/IBM/plex |
| IBM Plex Serif | v20 | Normal 600 and 700, italic 700 | https://github.com/IBM/plex |
| JetBrains Mono | v24 | Normal variable 400–700, italic 400 | https://github.com/JetBrains/JetBrainsMono |

All three families use SIL Open Font License 1.1; the original notices are included in the
adjacent `*-OFL.txt` files, obtained from `google/fonts/ofl/<family>/OFL.txt`. Font binaries are
unmodified. The separate TTF files one directory above remain the build-time OG image fonts.

To update, request the listed styles from `https://fonts.googleapis.com/css2` with a modern
browser user agent, download the referenced WOFF2 files for these four subsets, and update the
matching rules in `src/styles/fonts.css`. Keep the license notices with the binaries. Check
Russian and English pages, italic and bold text, and local font responses after updating.
