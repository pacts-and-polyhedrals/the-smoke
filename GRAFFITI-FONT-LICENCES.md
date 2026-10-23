# The Smoke — Graffiti Lettering Credits & Licence Review

The new five SVG lettering styles are **vector outlines** from the open-licensed fonts below. The system package includes derived `<path>` coordinates in `module/graffiti/glyph-outlines.mjs`. It does **not** include, expose or redistribute the original font binaries, and the final SVG decal does **not** load any external font service.

| Tag Studio style | Source typeface | Typeface author / copyright | Source licence | Public reference |
| --- | --- | --- | --- | --- |
| Handstyle · Quick Script | Lobster Two Italic | Pablo Impallari, Igino Marini (2011) | SIL Open Font License 1.1 | https://www.1001fonts.com/lobster-two-font.html |
| Bubble · Fat Cap | Lobster Two Bold | Pablo Impallari, Igino Marini (2011) | SIL Open Font License 1.1 | https://www.1001fonts.com/lobster-two-font.html |
| Throwie · Heavy Paint | Noto Sans Display Black | Google LLC / Noto project contributors (2012–2020) | SIL Open Font License 1.1 | https://github.com/notofonts/latin-greek-cyrillic |
| Blockbuster · Stencil | DejaVu Sans Bold | Bitstream Inc. and DejaVu contributors (2003 onward) | Bitstream Vera License with DejaVu changes in public domain | https://dejavu-fonts.github.io/ |
| Needle · Marker | Comic Neue Bold Italic | Craig Rozynski, Hrant Papazian, Brandon Schoech (2014–2016) | SIL Open Font License 1.1 | https://www.1001fonts.com/comic-neue-font.html |

SIL OFL 1.1: https://openfontlicense.org/open-font-license-official-text/ 

Bitstream Vera licence: https://dejavu-fonts.github.io/License.html

**Bitstream notice:** Copyright (c) 2003 by Bitstream, Inc. All Rights Reserved. Bitstream Vera is a trademark of Bitstream, Inc. DejaVu changes are in the public domain. The Bitstream licence permits reproduction and derivative use with its copyright and trademark notices preserved. SVG glyph artwork in The Smoke is not a new font file.

## 1001Fonts licensing caution

The website is a brilliant **visual reference** but the label "free for commercial use" doesn't necessarily grant permission to bundle/distribute the original font binary in another app. In particular, its default FFC licence does not permit publishing the font files without permission. For any future font addition, verify that **the individual font** is under an OFL, Apache or equivalently redistributable licence before creating the glyph outlines or adding it to Smoke.

This build uses an offline, self-contained vector approach precisely so later Forge updates, browsers and installed artwork can't revert to Arial or lose a custom font. The five styles are adapted graphic lettering, not the original families distributed as font software.

## Piece styles (0.5.26)

The piece engine (`module/graffiti/pieces.mjs`) draws throw-ups, bubbles, block letters, 3D, new skool, wildstyle and the rest from **vector outlines** of these open-licensed fonts, stored as path coordinates in `data/graffiti-letters.json`. No font files are shipped and no font is loaded at runtime. The arrows, spikes, drips, 3D, fills, clouds, highlights and characters are drawn by The Smoke itself.

| Piece style | Source typeface | Designer | Licence | Source |
| --- | --- | --- | --- | --- |
| Tag · Street hand | Sedgwick Ave Display | Kevin Burke, Google | SIL Open Font License 1.1 | Google Fonts, via the Fontsource npm package |
| Tag · Fat marker | Permanent Marker | Font Diner | Apache License 2.0 | Google Fonts, via the Fontsource npm package |
| Throw-up · Fat & quick | Cherry Bomb One | Satsuyako | SIL Open Font License 1.1 | Google Fonts, via the Fontsource npm package |
| Bubble · Puffy | Sniglet ExtraBold | Haley Fiege | SIL Open Font License 1.1 | Google Fonts, via the Fontsource npm package |
| Old Skool · Block 3D | Bungee | David Jonathan Ross | SIL Open Font License 1.1 | Google Fonts, via the Fontsource npm package |
| Blockbuster · Roller | Bowlby One | Vernon Adams | SIL Open Font License 1.1 | Google Fonts, via the Fontsource npm package |
| 3D · Deep block; Wildstyle · Arrows & locks | Russo One | Jovanny Lemonad | SIL Open Font License 1.1 | Google Fonts, via the Fontsource npm package |
| New Skool · Bounce & flare | Knewave | Tyler Finck | SIL Open Font License 1.1 | Google Fonts, via the Fontsource npm package |
| Burner · Full colour | Shrikhand | Jonny Pinhorn | SIL Open Font License 1.1 | Google Fonts, via the Fontsource npm package |
| Semi-Wild · Sharp | Squada One | Joe Prince | SIL Open Font License 1.1 | Google Fonts, via the Fontsource npm package |
| Spikes · Beastly | Rubik Beastly | NaN, Luke Prowse (Rubik) | SIL Open Font License 1.1 | Google Fonts, via the Fontsource npm package |
| Stencil · Cut plate | Wallpoet | Lars Berggren | SIL Open Font License 1.1 | Google Fonts, via the Fontsource npm package |
| Drip · Wet paint | Rubik Wet Paint | NaN, Luke Prowse (Rubik) | SIL Open Font License 1.1 | Google Fonts, via the Fontsource npm package |
| Fat Cap · Sprayed | Rubik Spray Paint | NaN, Luke Prowse (Rubik) | SIL Open Font License 1.1 | Google Fonts, via the Fontsource npm package |
| Straight Letter · Clean | Londrina Solid Black | Marcelo Magalhães | SIL Open Font License 1.1 | Google Fonts, via the Fontsource npm package |

Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0

Each font's licence was checked in its package metadata (`license` field of the Fontsource package) before outlining. The graffiti characters are original drawings made for The Smoke.
