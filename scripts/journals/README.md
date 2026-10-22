Build the guides from the implemented rules and the preserved campaign fiction:

```
npm ci --prefix scripts/journals
node scripts/journals/build.mjs
node scripts/journals/verify.mjs
node tests/run-all.mjs
```

`rules.mjs` imports the numeric rules tables used by the game. `pages.mjs` replaces rule chapters in place. `build.mjs` preserves journal/page IDs, wraps all pages in the mission/Blower style, adds navigation and current Mission Board summaries, and writes identical text to both JSON sources and the LevelDB Guides pack. Do not run the build against an open Foundry pack. Close the world first.

The runtime upgrade backs up GM-edited shipped pages before a new guide edition replaces them. User-created pages remain in their journals. Same-edition setup preserves later GM edits. Backups are GM-only and are completed before edited originals are touched.

`verify.mjs` checks source/pack equality, every guide UUID and image path, public/GM link boundaries, HTML structure, all 31 conditions, all 33 Rep levels, every library item and motor, and mechanical summaries for all 125 missions. Developer dependencies are not included in release ZIPs.
