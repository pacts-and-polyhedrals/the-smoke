# THE SMOKE v0.5.8 — Graffiti decals, territory, mission progress

## What was implemented

- **Placeable graffiti:** Drop the ready-made **Paintable Surface** actor from Actors onto a map. The token automatically gets a unique site ID and road/zone name (`Mare Street 1`, `Mare Street 2`, ...). The GM also has a **Paint Spots** tool: click the tool, then click anywhere on the map to create the next automatically named marker. There is no mission picker or manual site assignment for free paint.
- **Player action:** Right-click a paint marker, bus or train → **Tag surface / spray**, or target one with **T**, then Alt+I (fallback). Tag Studio opens with that surface selected. GM right-click works too; Shift + right-click on a marker invokes the normal token controls. Players cannot author map markers or edit tiles.
- **Real world decals:** A Graft roll creates an SVG in Foundry's persistent system storage. The active GM creates a locked, visible Tile with a permanent, authenticated record on the Scene. The supplied file is a vector SVG with transparent background. Moving vehicle-tag decals follow their vehicle token; the carrying token stores the decal so it can render after a cross-scene token transfer.
- **Paint charges:** Every Spray Paint gear item provides 6 uses per can; stacking works by opening another can once the previous one is spent. A paint attempt costs a real charge when placed, including imperfect attempts.
- **Clock & Heat:** Painting advances the **Banana Watch** by an outcome- and surface-dependent number of *game* minutes (not wall-clock time). Approved walls don't add Heat. Police within detection reach and explicitly crowded/exposed unapproved sites can witness and add graffiti Heat.
- **Territory:** Visible marks score 0/0/1/2/3/5 points for the six existing outcomes. New graffiti at a site covers the previous image and switches the site's faction/crew presence. A territory scoreboard appears in Tag Studio and the Mission Board's faction view. Scores are not separate Renown: they record who holds marked ground right now.
- **Reputation:** Strong and exceptional marks can award one Street Rep to the artist on a *new* site, never repeatedly by repainting it. Mission completion pays the normal crew fee, XP, Street Rep where specified, faction Renown and Influence exactly once.
- **42 tagging missions:** Included as a separate new Mission Board group **Tags & Territory**. Each target site has an event-verified paint objective and its specified minimum quality. Quality bonuses demand marks at distinct sites. Repeating the same attempt/mark/site cannot double-tick mission progress.
- **Repair:** GM can call `game.smoke.graffiti.repair()` from the browser console if a decal tile was accidentally removed. It re-renders the recorded artwork without rerolling, charging paint or changing scores.

## GM: automatic mission canvases and free-paint markers (v0.5.21)

1. On any scene, find **Paintable Surface** under Actors and drag it onto a wall, bridge, shutter or courtyard you want to make paintable. The token will automatically be named for the street/zone, e.g. `Morning Lane 1`. It is unique to that map.
2. **Or use Token controls → Paint Spots**. Click it, then click the map once. The system creates the auto-named marker there without another dialog. Press Escape to cancel.
3. Players standing beside it simply **right-click → Tag surface / spray**. The marker needs no mission assignment for ordinary graffiti and territory play.
4. **Mission canvases now appear automatically.** Starting an active tagging mission places its named mission target markers next to the associated street venue, and later arrivals/imports repair any that were missing. Earlier GM-authored markers stay where you put them. To fix missing ones without restarting, use **Mission Board → Repair / prepare mission canvases** or `await game.smoke.graffiti.repairMissionSpots()`.
5. **Buses and trains** with vehicle Actors need no extra marker: right-click the actual visible vehicle. Other vehicles require an explicitly marked spot.
6. **Bus mission sites (v0.5.22)** get a real parked, locked, out-of-service bus at the kerb, named after the site, instead of a marker. An unpainted 0.5.21 marker at a bus site is swapped automatically; painted ones are kept. The three train sites still use markers.
7. **Sat nav and Tag Studio (v0.5.23).**
   - **Sat nav:** Directions goes to each commission site's actual surface, in order, including sites with no venue door. Ticking an objective by hand moves it to the next site.
   - **Tag Studio:** it opens on the nearest surface a job still needs, picks the commission and its tag, and says what quality it needs.
   - **Feedback:** a paint that doesn't count says why.
   - **Crew:** use Mission Board → **Update who's on it** to add a character to a running commission.
8. All 57 catalogue sites now have deterministic, road-accessible placement plans. The 54 sites used by the 42 commissions are automatically placed when those missions are active. 51 catalogue sites are anchored to an actual mapped venue or door; six without an exact venue anchor use an approximate roadside position you can adjust. Casual auto-named walls remain independent, and only matching named mission sites count for the associated commission. Transport commissions can use their named canvas or an appropriate real vehicle when the mission site uniquely matches.
9. Accidentally removed a decal? GM: `await game.smoke.graffiti.repair()` on the scene, without another charge or roll.

**Important:** The game still needs an active GM client to author shared world changes; players don't need the GM to narrate or tick the steps. Free paint cannot spoof mission evidence. No real train fleet or schedule has been created.

## Player: Tag a location

1. Buy/find a real **Spray Paint** gear item (6 charges) and stand beside a marker or bus/train.
2. **Right-click the marker or vehicle → Tag Surface**. It opens Tag Studio with that location already selected. Choose a design and, if the right mission is active at this exact named location, the commission appears automatically. Leave the commission blank for free territory paint.
3. Stand near the hotspot, on foot. Press **Spray surface**. The existing Smoke Graft dice roll resolves to one of six art-quality versions.
4. If the result is good enough for a mission objective, that specific target completes automatically. Otherwise return and repaint with another charge.
5. Your actual graffiti stays as a **Tile decal**. It is not just a notification or a checkbox. It may be replaced by later tags or restored by the GM if its Tile is missing.

### Difficulty and time

- Approved practice walls: **Easy Graft**.
- Unauthorised walls/shutters: **Medium Graft**.
- Buses, trains, bridges and overpasses: **Hard Graft**.
- Paint time: **2–7 Banana Watch minutes** depending on quality, plus a small surface-type cost. No real-world timers.

### Note on tag artwork

The master Tag Studio now generates genuine **SVG glyph outlines** for five handstyle/throwie/marker/block/bubble presets. The geometry is derived from openly licensed typefaces, stored as SVG paths; **no actual font files or external URLs are bundled**. Every user-designed graffiti SVG therefore renders the same when embedded as a Foundry Tile, even offline. A Graft roll determines one of six effect tiers, and sponsors get trusted preset words from the GM. Full custom *freehand stroke drawing* and the 13 illustrated faction motifs remain future art-production work. See `GRAFFITI-FONT-LICENCES.md`.

## Persistence and authorisation

- Only the active GM may save paint files, create Tiles, write Scene graffiti records, award rep or modify the Banana Watch.
- Player requests must match a live Graft-roll ChatMessage associated with the exact actor, user, map, target, difficulty and unique attempt ID.
- The GM server regenerates the SVG from allowlisted styling values; it never accepts an arbitrary uploaded SVG or client-supplied roll grade as a world asset.
- The package manifest includes `persistentStorage: true` so user-created tag artwork is intended to survive system updates.
- Repeated network requests for the same painted attempt return the saved record without additional charges or rewards.

## Current limits to live-test on Forge

- The FilePicker persistent SVG upload and its Tile texture rendering on **your specific Forge account** have not been live-tested from this environment. A fallback data-directory uploader is included.
- Token transfer/vehicle decal following is implemented but the end-to-end Forge scene-transfer animation needs multiplayer verification.
- For active **missions**, named canvas markers are placed and recovered automatically beside the mapped venue/road. Six unanchored catalogue sites are approximately positioned and clearly flagged for optional GM adjustment. For **free graffiti**, drag an actor or use the click-to-drop paint tool as before.
- A permanently missing or disabled GM client means players can design/export tags but cannot make authoritative world changes (same as mission property in Self-play).
