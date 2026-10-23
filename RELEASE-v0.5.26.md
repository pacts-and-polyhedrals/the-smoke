# The Smoke v0.5.26 — graffiti pieces, characters and presets

Built on v0.5.25 (the capability guard, the Token Builder, stat balance and a GM file for every mission), so it includes everything up to there.

## What's new
The Tag Studio paints proper graffiti pieces, not just tags. Everything is vector art made inside the system, so the decals stay sharp and look the same on every client.

### Sixteen piece styles
Pick them under **Style** in the Tag Studio, next to the five classic tags.

| Group | Styles |
| --- | --- |
| Tags | Street hand, Fat marker |
| Throw-ups | Throw-up (fat and quick), Bubble (puffy) |
| Pieces | Old skool block 3D, Blockbuster roller, Deep 3D, New skool (bounce and flare), Burner (full colour), Straight letter |
| Wild | Wildstyle (arrows and locks), Semi-wild (sharp), Spikes |
| Stencils and paint | Stencil, Drip (wet paint), Fat cap (sprayed) |

Each style has its own letters, outline, cloud and keyline, 3D, fill and finishing touches:
- **Fills:** fade, two-tone, stripes, bubbles, stars, drop-top, bricks, flames and cracks. Pick them under **Piece → Fill**.
- **Wildstyle:** curved arrows grow out of the letters, with spikes and cuts.
- **Long names:** two-word names of eight letters or more go on two lines, so NIGHT MARKET or RED THREAD stays big enough to read.

### The roll decides the finish
Classic tags work as before. For pieces:
- **Proper Mess:** shaky, patchy (the wall shows through) and running.
- **Bad Luck** and **Just About:** plainer, with no 3D or cloud.
- **Sorted:** the full style.
- **Smashed It:** adds shine and sparkles.
- **Legendary:** adds a glow and a crown.

A player can't fake the crown. The GM rebuilds every painted piece from the design and the roll, as before.

### Twenty-three graffiti characters
Hand-drawn cartoon figures that stand beside the letters, on the left or the right. They take the piece's colours.
- **Writers:** the b-boy, the b-girl, the hooded writer, the can man, the Hackney pigeon, the urban fox, the crowned skull, and **the d20** (Asmo's own).
- **One per faction:**
  - The Chainring's cog
  - Dead Air's boombox
  - The Lea Boys' staffy
  - The Velvet Circuit's masks
  - The Towpath Union's canal duck
  - The Glasshouse cat burglar
  - The Backroom ace
  - The Night Market lantern
  - The Borough Mutual teapot
  - The Lantern Desk night owl
  - Meridian's fat cat
  - The Red Thread spider
- **Radio:** the mic, the record and the selector, plus the boombox.

### Ninety presets
Use the **Presets** gallery under the preview. Pick a set, then click a piece to load it. You can change anything after loading it, and where you're painting stays the same.
- **ASMO** in all sixteen styles, mostly gold and crimson, with the d20 on the big pieces.
- **2CB** in all sixteen styles, in acid green and purple, with the b-girl, fox, pigeon, selector and can man.
- **Every faction:** three pieces each (a full piece with its character, a throw-up and a tag) in its own colours. A faction preset also picks that faction's tag identity, but only if the character has unlocked it.
- **The stations on the dial:** two shout-outs each for Point Blank FM, Rude FM, Vision Radio UK, Flex FM, Supreme FM and Radio Caroline UK. They use the names in our own lettering, with no station logos. There are also two for the rival **Static Kings**.
- **Street:** THE SMOKE, HACKNEY, E8, BOW, LONDON, NO COMMENT, LEGIT, KING.

The art for every preset ships in `assets/graffiti/presets/`. Each faction's tag pack also now has its six quality images in `assets/graffiti/svg/<faction>/`. The catalogue pointed at those files before, but they didn't exist.

## Fonts
The letters are vector outlines of fifteen open-licensed fonts, stored as path data. No font files are shipped and none are loaded at runtime. They are SIL Open Font License 1.1 or Apache 2.0, and every one is credited in `GRAFFITI-FONT-LICENCES.md`.

## Existing worlds
- **Saved tags.** Saved tags and painted decals are unchanged.
- **First GM login.** The GM-only Street Commissions journal gets a paragraph on the new styles and presets. Pages you have edited are left alone.
- **Letters.** The piece letters (about 0.8 MB) load the first time the Tag Studio opens, and on the GM before a painted piece is redrawn.

## Publish
1. Back up your world.
2. Create a GitHub release on `pacts-and-polyhedrals/the-smoke` tagged **`v0.5.26`**, marked **Latest**.
3. Upload two separate assets: `the-smoke-v0.5.26.zip` and `system.json`.
4. Update in Forge/Foundry through the existing manifest URL. Players should reload their page.

## Checked
- **Tests:** 66 automated suites pass, including the new `graffiti-pieces` suite. It renders every style at every finish with characters and long names, plus the worst case a player can ask for. It also checks that the shipped art matches the engine and that only known keys get through.
- **End to end:** the 42-commission run now paints classic tags and pieces through the GM.
- **Tag Studio:** the template compiles, every control can be scrolled to, and it was checked in a browser.
- **Not covered:** this is not a live Foundry run.
