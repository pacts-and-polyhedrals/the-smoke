# THE SMOKE — Foundry / Forge description and original website art (v0.5.9)

Brand supplied by **Pacts & Polyhedrals**: `The-Smoke-Original-Logo-Branding-Pack-v1.0(1).zip`. The artwork in this package is the **original mint diamond / pink diamond brand**, not the separate neon-pink mockups. All SVG and PNG files are copied unmodified; assets are renamed only to remove spaces for web paths.

## Where it appears

| Foundry / Forge surface | Source artwork | Installed relative path |
|---|---|---|
| System setup media & new-world background | City Is The Board landscape | `assets/branding/graphics/city-is-the-board.png` |
| Package media gallery | The Chainring cycle poster | `assets/branding/graphics/chainring-poster.png` |
| Package media gallery | The Blower social square | `assets/branding/graphics/blower-promo.png` |
| World setup dialog & first-run chat | full horizontal transparent logo | `assets/branding/logos/logo-horizontal.png` |
| GM Screen / Tag Studio / Blower | transparent emblem | `assets/branding/logos/symbol.png` |
| Street Control title | full horizontal logo | `assets/branding/logos/logo-horizontal.png` |
| Street Control collapsible artwork gallery | all 3 graphics | `assets/branding/graphics/` |
| Mission Board | wordmark-only logo | `assets/branding/logos/wordmark.png` |
| Character Creator | full horizontal logo + Chainring poster | `assets/branding/logos/logo-horizontal.png` and `assets/branding/graphics/chainring-poster.png` |

The remaining logo variants, favicon, and editable SVG versions are bundled for future branded headers, external pages, and exports. Original brand-kit instructions and contact sheet are also included.

## Foundry / Forge listing description

You're in Hackney, mate. Morning Lane, E8. Rent's due, your Blower's buzzing, and Auntie Pat's got a little favour to ask. You've got a bike, a few quid if you're lucky, and a crew to look after. No one's handing you a fortune. You've got to graft for it.

Work the borough your way. Run deliveries, shift nicked motors, take a taxi or bus shift, chase a payday, or do a job for someone whose hands are best kept clean. Twenty linked street maps, 160 mapped venues, proper traffic, pirate radio and a whole lot of wrong 'uns make London feel like it carries on without you. And when things get loud, the filth turn up. Five stars of Heat ain't a badge of honour if you can't shake 'em.

Make your name. Spray the crew's mark on walls, bridges and buses, build territory, earn Renown across twelve rival factions, and find out who's got your back when it all goes sideways. Your jobs, money, favours and trouble follow you across the city; the Banana Watch keeps the hours, and the Mission Board keeps the score.

Start beneath the arches on Morning Lane. Take the long way round or put your foot down. London won't wait for you.

The Smoke is a street-level London crime tabletop roleplaying system for Foundry VTT, made by Pacts & Polyhedrals.

## Important deployment details

- **Manifest stays the same:** `https://github.com/pacts-and-polyhedrals/the-smoke/releases/latest/download/system.json`.
- Release tag **`v0.5.9`**; ZIP filename **`the-smoke-v0.5.9.zip`**. Upload ZIP and standalone `system.json` as *separate assets* to the GitHub release.
- `background` is a **default banner for newly created worlds**. An existing world's separate join-page background will not automatically be replaced; adjust that world via World Configuration if desired. The installed system package artwork and in-game headers update normally.
- Foundry and Forge need different image paths before/after installation. The `setup` and default world background use installed package paths. The `icon`, `cover`, and `screenshot` media URLs use a **verified commit-pinned public source** in the official Smoke website repository, so Forge can retrieve them before this system is installed. The listing description itself contains the real horizontal logo and City graphic as HTML images. Some package browsers may only display their supported media types.
- These assets are byte-identical to the artwork already present in `pacts-and-polyhedrals/the-smoke-web` at commit `bf186f7a1249e7c5e7234723c0a26eee59ee6074`. Their SHA checks are in `tests/branding-manifest.test.mjs`.
- Original filenames are kept under `assets/branding/logos` and `assets/branding/graphics`, alongside short-name aliases used by the Foundry templates.
- This is not published on GitHub and has not been tested in a live Forge GM/player game.


## Images on the INSTALL and PRE-INSTALL listing

The `system.json` `description` itself includes the original dark horizontal wordmark and the City Is The Board artwork in HTML, so the Foundry package's details view can show the images alongside the new East London prose. The `media` array also now specifies an original `icon`, a `cover`, and three original visual previews.

**Forge/Bazaar package browsers must load images before installing the ZIP.** Local paths such as `systems/the-smoke/assets/...` may not exist yet. This release therefore uses already published, public Smoke website images on GitHub for the pre-install `icon`, `cover`, `screenshot` entries and the inline images in the description. These are pinned to website source commit `bf186f7a1249e7c5e7234723c0a26eee59ee6074`; Git blob checks verified they match the uploaded original branding ZIP.

The `setup` entry and `background` still reference local files bundled in the full ZIP, as does the in-game UI. Only **two assets** are needed for the game-system release: the complete ZIP and `system.json`. No manual upload of the website image files is required.

The web-hosted original images used by the package:

- Original symbol favicon: `https://raw.githubusercontent.com/pacts-and-polyhedrals/the-smoke-web/bf186f7a1249e7c5e7234723c0a26eee59ee6074/assets/brand/logos/The-Smoke-Corrected-Favicon.png`
- Full horizontal logo: `https://raw.githubusercontent.com/pacts-and-polyhedrals/the-smoke-web/bf186f7a1249e7c5e7234723c0a26eee59ee6074/assets/brand/logos/The-Smoke-Full-Logo-Horizontal-Dark.png`
- City Is The Board cover: `https://raw.githubusercontent.com/pacts-and-polyhedrals/the-smoke-web/bf186f7a1249e7c5e7234723c0a26eee59ee6074/assets/brand/graphics/01-The-City-Is-The-Board-Landscape.png`
- The Chainring poster: `https://raw.githubusercontent.com/pacts-and-polyhedrals/the-smoke-web/bf186f7a1249e7c5e7234723c0a26eee59ee6074/assets/brand/graphics/02-The-Chainring-Cycle-Poster.png`
- The Blower social square: `https://raw.githubusercontent.com/pacts-and-polyhedrals/the-smoke-web/bf186f7a1249e7c5e7234723c0a26eee59ee6074/assets/brand/graphics/03-The-Blower-Social-Square.png`

**Forge Bazaar creator overrides:** The Forge's creator instructions say the Bazaar product description and its icon/cover/screenshots can be edited in the Creator Dashboard. Existing customised Bazaar listings may retain those overrides even after a manifest update. Use the Creator Dashboard if the marketplace listing does not reflect the new manifest; the installed Foundry package and its own Setup gallery are updated from the new release either way.
