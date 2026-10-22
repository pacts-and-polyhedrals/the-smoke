# The Smoke v0.5.13 — Live-radio repair

**Scope:** radio preset and player repair. All other v0.5.12 features, content, maps, campaigns, 3-level Rep milestones, and graffiti remain unchanged.

## What changed

- CodeSouth.FM: removes a historically listed direct stream that produced Retry failures in Forge. Adds **Open live player** using the station's official website.
- Esencia Urbana: replaces the website-only/non-interactive entry with an in-game **Open live player** control for its official listening page.
- Both: open an independent Foundry listening window with station controls. Also offer **Open in browser** in case the site blocks third-party frames or audio.
- Normal direct-stream stations still use Smoke's native HTML5 receiver with volume, mute, vehicle follow, and Stop listening.
- One-time migration repairs the old CodeSouth stream in existing worlds but preserves any direct stream manually supplied by the GM; intentionally deleted stations stay deleted.
- GM Radio Directory editor now supports an optional official live-player URL and validates HTTPS addresses.

**Live-compatibility limitation:** No currently working native HTTPS MP3/AAC stream was independently verified for CodeSouth.FM or Esencia Urbana. Their official-player integrations cannot guarantee that the broadcaster's website allows iframe embedding in Forge, or that native in-car volume control works. The explicit external browser action is the reliable fallback. A confirmed station audio URL entered in Edit Presets restores Smoke's same native audio controls as the six original presets.

## Publication

1. Create tag `v0.5.13` on `pacts-and-polyhedrals/the-smoke` GitHub Releases.
2. Upload the full `the-smoke-v0.5.13.zip` and separate `system.json` assets, unchanged.
3. Publish it as latest. Forge updates using the same manifest:
   `https://github.com/pacts-and-polyhedrals/the-smoke/releases/latest/download/system.json`
4. Back up and update a test/clone world, then try each station from a player browser.

## Acceptance checklist (Forge, unverified locally)

- Update from v0.5.12; ensure both stations appear.
- CodeSouth Listen displays Open live player, not Retry; click and play the official broadcaster inside the window if framing is permitted; otherwise use Open in browser.
- Esencia Urbana Listen likewise opens the live-player window instead of doing nothing.
- Close the window; tune one of the original six and verify native radio volume and playback.
- With a player occupying a vehicle passenger seat, tune through the driver's station; verify the listener behaviour is appropriate to that station type.
- Rejoin/restart the game and verify GM custom presets remain intact.

