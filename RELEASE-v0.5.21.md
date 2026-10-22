# THE SMOKE v0.5.21 — Mission Paint Canvas Recovery

Based directly on **the-smoke-v0.5.20.zip** (all 951 existing art assets and 40 compendium files retained). No world data, journals, existing painted tiles, police/chase mechanics or mission rewards were reset.

## The bug

Graffiti mission data already listed 54 named surfaces across 20 street maps, but mission activation never materialised those mission-specific Paintable Surface tokens. A surface appeared only if it had previously been placed or authored by the GM. This made later tagging commissions appear empty, despite being active.

## The fix

- **Start an active tagging mission:** Spawn its missing named paint canvas tokens at map-accurate venue/door anchors or road-side fallback positions, including on pre-existing imported scenes.
- **Enter/import a street map:** Repair any missing markers for active tagging missions on that map (also works when players travel without the GM viewing the destination).
- **Return after a deletion:** Missing canvas tokens reappear without restarting the mission, resetting progress, spending paint or changing reputation.
- **Multiple missions / repeated visits:** Reuse existing tagged sites. Never duplicate or move manually placed originals.
- **GM button:** Mission Board → Tags & Territory → select active commission → **Repair / prepare mission canvases**. This also imports its target street scenes when needed.
- **GM console alternative:** `await game.smoke.graffiti.repairMissionSpots()` to restore across existing active-world maps, or `await game.smoke.graffiti.prepareMissionSpots('tg-intro-03')` to prepare one named commission.

Of the 57 catalogue sites, 54 are referenced by current missions. All 57 have a valid candidate on their mapped street. 51 use explicit mapped venue/door anchors; the remaining six do not have an exact venue anchor and are tagged as approximate for possible GM adjustment.

### Important: how players tag

Players can right-click the visible mission marker and choose **Tag surface**. They still need to stand nearby, have Spray Paint gear and succeed on a real Graft roll. A mission only advances if its own named surface and required quality match the objective; no arbitrary marker can spoof this.

### Live Forge check

Back up your test world and install v0.5.21. On the GM client, start **First Can** and check the Morning Lane surface; start **Walls Have Ears** and enter Haggerston and Hackney Road; start **The Last Bus Home** and visit Haggerston and Victoria Park. Each target should be visible without dragging an actor. Right-click, paint and verify mission credit. Deliberately delete one mission marker and use **Repair / prepare mission canvases**; it should return with no duplicate. Confirm an ordinary PC or vehicle token can still be dragged onto a map.

Automated tests cover the extracted ZIP, but live Forge client rendering and network latency have not been observed here.
