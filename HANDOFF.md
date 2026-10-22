# The Smoke v0.5.24 — handoff note (player right-click)

- `installPlayerInteractions()` must run at **init**. Foundry's interaction manager holds a token's `_canHUD` and `_onClickRight` from the moment the token is drawn, and the first map is drawn before `ready`.
  - It patches `foundry.canvas.placeables.Token`, a replacement in `CONFIG.Token.objectClass`, and (in tests) a plain global `Token`.
  - It re-arms already-drawn tokens' `mouseInteractionManager.permissions/callbacks.clickRight` on install and on every `canvasReady`.
- `theft.mjs`:
  - `carjackable(vt)` = moving traffic, or a Street Life NPC (ambient crew) at the wheel of a non-police motor.
  - The Carjack action, the carjack handler, the nick handler and the boarding gate all use it.

---

# The Smoke v0.5.23 — handoff note (sat nav, graffiti choices, sweep)

- **Sat nav** (`map/satnav.mjs`):
  - `missionTarget` handles cargo through `cargoTarget` (parcel token, else pickup; handover once held) and graffiti through `paintSiteTarget` (surface token, else the `missionPaintPosition` kerb).
  - When nothing open has a place, it walks back to the last placed objective before the first open one.
  - `zonePlace` resolves a block on a street map, venue or interior.
  - `tests/satnav-missions.test.mjs` checks every mission; run it after changing mission data.
- **Paint choices** (`graffiti/paint-choices.mjs`, pure):
  - `paintChoices` picks Tag Studio's surface, commission, tag and hint.
  - `paintShortfall` explains a paint that didn't count; `graffiti.paint` returns it as `note`.
- **Missions** (`world/missions.mjs`):
  - `mission.crew` changes `actorIds` of an active mission (runner permission).
  - `crewWhereabouts` ticks map objectives at start; a `createToken` hook ticks them for directly placed characters (transit already fires `smokeTransit`).
- **Objective wording:** tagging objective texts are player-facing; the `auto` rules are unchanged.

---

# The Smoke v0.5.22 — handoff note (Heat ladder, lag guards, mission buses)

- **Heat:** `CRIMES` entries carry `heat`, optional `min` (floor) and `cap` (ceiling). `heatAfterCrime` raises Heat to at least `min`, adds the police +1 (not for crimes with `min ≥ 4`), clamps to `cap`, and never lowers it. Show crimes with `crimeHeatText(c)`. Add a crime there, not in the guides by hand: `scripts/journals/rules.mjs` builds the table from it (`CRIME_LADDER`, `policeSent()`).
- **Killings:** `reportKill(attacker, targetToken, {before, lethal, seen, byPolice})` in combat.mjs. Call it after any damage path that can take a person to 0 (auto damage in `combat.hit`; `combat.resolve` in gameplay.mjs).
- **Response:** `policeResponse(stars)` gives the per-star wish list. `respondNow` stops at the `policeMaxUnits` setting (ground units only). `scaleBack(scene)` runs after Heat changes and sends home unseen, free, unparked extras.
- **Loops:** wrap any new per-second loop with `slowGuard.resting(name)` / `slowGuard.took(name, ms, intervalMs)`. Write vehicle moves with `withMeters(scene, updates, source)` in one batch, never a second write per vehicle. Crew bar hooks must ignore tokens that are not PCs or carrying PCs.
- **Mission buses:** `parkMissionBus` in graffiti/runtime.mjs; the bus token carries the site's `tagSpot` flags plus `missionProp`. `parkedAlong` (mission-placements.mjs) puts a vehicle at the kerb, along the road.
- **Guides:** `refreshShippedPages(pick)` in content.mjs refreshes chosen pages between guide editions without touching GM edits. Old fingerprints go into `data/guide-history.json`. Migration 4 uses it for the Heat pages.

---

# The Smoke v0.5.18 — handoff note (escape move)

- `pursuit.mjs`: `finishEscape(t, s, combat)` ends an escape move (one place for the card, search and chase-end check). `chase.respond` *finish* refuses players who haven't moved; `chase.footMove` lets the escaper move whatever the dice say, clamps an over-long drag to whole squares, and finishes when under one square is left. `finishEscapeWhenSettled(pilot)` does the same for a vehicle once its move has settled (called from `watch` in incidents.mjs); the vehicle gate clamps the escape drive like the red line.
- `drive-gauge.mjs`: `footReach(scene)` returns the escape (or on-foot current die) ring to draw; it takes priority over the vehicle rings while an escape is open.

---

# The Smoke v0.5.17 — developer handoff (speed dice & scrolling)

- **Speed dice:** `speedFor(combatant)` (combat.mjs) returns `{count, why}`; `beginRound` stores both on `flags.the-smoke.speed` with every key reset (`results`, `lost`, `stunned`, …) so nothing survives Foundry's flag merge. The Console's `outLabel` shows the `why`.
- **Surrender is per fight:** `combat.surrender` also writes `flags.the-smoke.surrenderedIn = combat.id`; `surrenderedIn(actor, combat)` is what costs dice. It is cleared on `deleteCombat`/`deleteCombatant` (gameplay.mjs), rest, Busted and Wasted, and by `clearStaleSurrenders()` when the GM loads the world. Code that reads the raw `system.states.surrendered` (cuffing, police choices, chase wanted lists) relies on that clean-up.
- **Late joiners / Stunned:** hooks in `installCombat()` queue `combat.dealIn` (createCombatant) and `combat.stunned` (a Stunned condition item created) through the world queue, so they never race a Done or a reveal. `R.stunnedDrop` picks the die to lose.
- **Scrolling:** the 0.5.17 block at the end of `styles/the-smoke.css` (window content always scrollable; Street Control, Tag Studio, rails; dialogs scoped by `body.smoke-system`, which the system adds at init). `module/apps/fit-menus.mjs` groups Smoke Token HUD buttons into `.smoke-hud-group` (display: contents until it must scroll), slides overhanging columns onto the screen, and `keepOnScreen` for pop-ups. New HUD buttons only need a `control-icon smoke-…` class to be included.

---

# The Smoke v0.5.16 — developer handoff (audit release)

Read **AUDIT-v0.5.16.md** first: it lists every finding, the fix, and what was left alone on purpose. Code-level notes for whoever works on it next:

- **Mission state:** never `game.settings.set(NS,'missions',…)` directly. Use `withMissionState(st => …)` from `module/world/missions.mjs` (one queue, fresh read; return `NO_WRITE` to skip the write). `missionEvent`, the mission handlers and `mission-props` all go through it. Don't call `missionEvent` or another `withMissionState` from inside a mutator (it would wait on itself).
- **Request queue:** `dispatch` in `module/world/net.mjs` lets the next action through if one stalls past `QUEUE_STALL_MS` (45 s; `setQueueStallMs` for tests). Handlers must still never `await request()` for work that runs on the leader.
- **Tokens in play:** use `actorToken(actor, {userId})` from `module/world/spawn.mjs` instead of "first token with this actorId".
- **Chases:** `huntingUnits(scene)` (heat.mjs) decides which police drive in real time (0.5.19: none hunting anyone in a fight or chase on that map); `joinReinforcements(combat)` (chase.mjs) puts them on the tracker — from `beginRound`, at chase round end, and from `enlistDispatched` when Heat sends more units. `inChase(combat, token)` (pursuit.mjs) decides whose moves are held to the chase. `blockingPrompts(vt)` (incidents.mjs) decides which driving cards stop a vehicle — only cards of the chase now running. `chaseRelevantFlags(changes)` filters token updates worth waking the console/autopilot for.
- **Remote rolls:** `remoteRollOptions` (dice/roll.mjs) is the allowlist of options a player's client may send; add new roll options there if a player-side caller needs them.
- **Driven vehicles:** `removeOrphanDedicatedActor` (vehicle-boarding.mjs) deletes a driven vehicle's own actor when no token uses it (not on `acTransit`, not while folded and carried).
- New suites: `tests/audit-world.test.mjs`, `tests/audit-chase.test.mjs`. Journals/packs untouched; content edition stays 0.5.3.

---

# The Smoke v0.5.3 — driving-response hotfix

All driving prompt kinds now explicitly remove their completed token flag. The old whole-object update merged an empty map into the existing flags, retaining the answered prompt and blocking both movement and the Combat Console. Tests previously replaced those objects wholesale and missed the live Foundry behaviour; chase tests now merge them as Foundry does.

A result is recorded before its outcome is applied. Concurrent duplicate resolutions share one task; an already-applied result can finish deletion without reapplying damage. Errors during outcome application remain gated for GM review. Failed token deletion is not caught as a failed automatic roll and does not offer fresh dice. Completed chat buttons stay disabled.

On active GM login, recoverCompletedPrompts checks saved prompt/roll IDs, vehicle UUID, kind, stat and actor, or an existing completion marker. It only releases completed legacy locks, without rerolling, moving tokens or repeating damage. Unanswered checks and new outcomes requiring GM review remain pending. The same utility is available as game.smoke.incidents.recoverCompletedPrompts() for the active GM.

The regression suite checks 36 chase outcome cases, actual chat-hook completion, both movement and Done gates, independent pending prompts, actor matching, repeated damage, final-write failure, completed-button clicks and safe legacy recovery. See VALIDATION.md and tests/TEST-RESULTS.txt.

The system release is 0.5.3; the existing journal edition stays 0.5.2 so a code hotfix does not archive/rewrite the GM's new journal edits. Both JSON sources and the Guides compendium retain their 270 matching pages. GitHub distribution requires release tag v0.5.3 with both system.json and the-smoke-v0.5.3.zip attached.

---

# The Smoke v0.5.2

This release includes the v0.5.1 chase fixes and a complete journal refresh. All **27 journals / 270 pages** use the same dark panels, mono text, accent colours, readable tables and phone cards as the missions and Blower. Pages have previous/next navigation, a rules index and an edition footer. Existing journal and page IDs are retained; the five new pages have deterministic IDs.

## Current rules

Sixty-three rule chapters have been rewritten against the implementation. The guides cover creation, dice and teamwork, combat, reactions and cover, all 31 conditions, Down and first aid, service prices and restrictions, item use and drugs, the 33-level Rep ladder, missions and faction standing, every shift, vehicle movement/collisions/fire, and the Blower/radio/sat nav/crew bar/watch.

The obsolete three-job starter's fixed bonuses and five-stage Rep awards are replaced by the actual opening Mission Board jobs. All 125 missions have a current mechanical summary generated from their gates, objectives and reward definitions. Crew fees are distinguished from per-head awards. Fictional favours, access rights and pressure fronts are explicitly GM decisions.

The police-shift gap mini-game is documented separately from wanted-player Console chases. The latter have opt-in automation, a shared civilian traffic phase, separate police/PC turns, and gates for every decision and round. A successful stop roll removes one star and permits one finite vehicle/foot opening; failure leads to custody or an answerable armed response when the recorded crime warrants it. See CHASES.md.

## Sources and world upgrades

`data/content.json`, `data/london-guides.json` and `packs/guides` contain identical current HTML. The prebuilt Guides compendium has been rebuilt as a real LevelDB database, closed, reopened and compared record by record.

`updateGuide` refreshes styling even when the words have not changed. A new edition backs up edited shipped pages into GM-only journals before overwriting those original pages. If creating a backup fails, those originals are not touched. Extra user-created pages survive; running setup again in the same edition preserves subsequent local edits. Original world page IDs and renamed-page aliases prevent duplicate imports.

## Build and checks

Runtime tests: `node tests/run-all.mjs`. Journal build and verification: see `scripts/journals/README.md`. Build dependencies are development-only; do not copy node_modules into the release. The system runs without them.

See VALIDATION.md for checks performed and the remaining live Foundry acceptance run. The ZIP must have its root `system.json`, pass a full CRC read and extract successfully before distribution. A saved/downloaded copy must be checked too; a previous delivery was truncated and is superseded by this release.
