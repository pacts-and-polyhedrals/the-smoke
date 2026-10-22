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
