> **v0.5.5 packaging update:** this distribution has corrected `manifest` + `download` fields matching its separate GitHub release assets. Publish both files as a NEW `v0.5.5` release; then use the existing Forge manifest URL. The old v0.5.4 uploaded manifest lacked these links. Full live Forge acceptance remains pending.

# THE SMOKE 0.5.5 — Audit-to-Implementation Matrix

**Prepared:** 19 October 2026  ·  **Base package:** v0.5.3 downloadable ZIP  ·  **Behavioural reference:** v0.5.0  ·  **Status:** manifest-ready GitHub release ZIP (publication and live Forge tests still pending), **not production/live-verified**.

## Executive result

The changes described in the original audit have been implemented in a separate, complete system copy; original v0.5.3 and v0.5.0 release archives remain untouched. **28 isolated automated suites pass** against the actual candidate modules and data using Foundry document/hook/socket stand-ins. This covers core rules, progression, maps, missions, traffic, shopping, theft, dice prompts and chase-specific defects. It does **not** prove a working live GM + player canvas, browser token menu events, or Forge synchronization. A true production sign-off requires the 24 manual acceptance scenarios below.

**What was NOT done:** The GitHub repository or its already-published v0.5.3 release have not been modified. GitHub source/tag provenance therefore remains to be reconciled before a public version. The Forge task-status HTTP 500 error is a host/API problem not proven fixed by client-code changes. Existing Foundry worlds and player saves were not opened or changed here.

## Completed source changes (from the original audit)

| Audit | Implementation in this candidate | Verification / caveat |
| --- | --- | --- |
| **A01 · Auto chase disabled** | `module/world/chase.mjs`: default auto-detection and NPC control restored; one-time chase migration; independent settings for start and control mode. | `chase-decisions`, `chase` pass. One-time migration restores defaults even if a GM preferred manual settings under v0.5.3; re-select Manual after update. |
| **A02 · NPC stopped at Continue** | `module/world/chase.mjs`: Full Auto, Assisted, Manual; Full Auto commits NPC action before one deterministic `combat.next`, begins another round when safe. Error fails closed with visible recovery information. | `full-auto`, `full-auto-blocker`, `chase-decisions` pass; live timing/input tests pending. |
| **A03 · Vehicle gauge disappears** | `module/map/drive-gauge.mjs`, `module/vehicles/travel-meter.mjs`, `module/world/incidents.mjs`: selected free-drive motor shows last/total travelled squares; chase motor shows remaining green/yellow/red; police and civilian route movement measured. | `recovery-contract`, `chase`, `driving` pass; PIXI v14 visual check pending. |
| **A04 · Police freeze on unrelated fight** | `module/world/heat.mjs` and `module/world/traffic.mjs` pause only for an active chase, not all Combats or all police-stop flags. | `chase-ownership`, `traffic` pass. Needs simultaneous ordinary combat/Heat trial. |
| **A05 · Heli stationary** | `module/world/heat.mjs`: once-per-chase-round aerial step with bounded speed, 22-square sight radius, last-known contact and sweeping search. No instant snap to player. | Static inspection and rules tests; aerial movement in rendered Foundry is not verified. |
| **A06 · Recorded roll blocks everyone** | `module/world/chase-state.mjs`: only encounter participants and associated drivers have blocking prompts; messages tracked by combat/target. `module/world/incidents.mjs`: preserves saved outcomes, no reroll/double-damage. GM-only certify/cancel tools added to the console, with audit chat card. | `driving-prompt-resolution`, `full-auto-blocker`, `recovery-contract` pass. Partial-world-write recovery still demands honest GM adjudication. |
| **A07 · Empty vehicle bypass** | `module/world/incidents.mjs`: same synchronous pre-update driving gate for empty and occupied player motors and same committed journey ledger. | `chase-decisions`, `recovery-contract` pass. Drag behaviour on client requires GUI test. |
| **A08 · Police search pretend** | `module/world/chase.mjs` and `module/world/heat.mjs`: police move toward last-known area, route-search without live omniscience; helicopter sight bounded. | Search logic compiled and automated suite passes; actual LOS/terrain and search realism need GM exercise. |
| **A09 · Individual traffic lost** | Configurable **Shared** phase (default for performance) or **Individual** nearby civilian speed dice (maximum 12), each with its own movement tally. | `chase`, `traffic`, `combat-flow` pass; crowded maps / client animation still require stress tests. |
| **A10 · Accidentally hijacks other encounter** | `module/world/chase-state.mjs` and `module/world/chase.mjs`: own chase Combat, scene `chaseCombatId` binding, simultaneous start lock, cleanup. Console prioritises active chase. Ordinary fights untouched. | `chase-ownership` proves two racing starts share one chase and leave the original combat unchanged. |
| **A11 · Bad release provenance** | `system.json` and `data/build-info.json` both **0.5.5**; exact source ZIP checksums regenerated; candidate `manifest` and `download` now correctly point to the v0.5.5 GitHub release and release ZIP. Journals remain at content edition 0.5.3 deliberately. | Candidate checksum and archive integrity verified locally. GitHub release assets and manifest are prepared and byte-verified; publication to GitHub and live Forge acceptance are still outstanding. |
| **A12 · Player token actions hidden** | `module/interaction/player-context.mjs`: player-safe visible non-owned NPC/vehicle menu without owner HUD privileges; optional T + Alt+I/scene-tool fallback. `theft.mjs`: character-owned Graft pickpocket action, rolls consumed only once; GM confirms loot. Vehicle actions filtered by explicit player allowlist. | `recovery-contract`, `player-theft`, old `fence`/boarding tests pass. Right-click event needs two-client Forge test. |

## What players and GMs should see

### Player — right-click a non-owned parked vehicle

**Board / choose seat**, **Nick it** where locked, **Carjack** if another driver is moving it, **Local services** when contextually available, and the appropriate shift/fence/radio actions. The menu is not a way to view NPC/vehicle actor data, bypass a lock or change ownership. Actions check range, character ownership and vehicle status on the GM leader. An action not relevant to the token is omitted.

### Player — right-click a non-owned visible person

**Talk / approach** or **Attempt pickpocket (Graft)**. The outcome uses a genuine game roll and is consumed once; getting caught affects Heat. A successful lift gives a GM-visible request to adjudicate the NPC's actual possessions, and does not fabricate money or equipment. If another module intercepts the token right-click, press **T** to target, then **Alt+I** or the **Street Actions** scene-control button.

### GM — chase console

**Full Auto** runs NPC movement and advances NPC turns automatically, but never rolls a PC's decision or skips a player's turn. **Assisted** performs an NPC action, then pauses for review. **Manual** leaves NPC control to the GM. Saved dice awaiting review identify the precise token/result and can be GM-certified only after effects have been verified; unrolled obsolete cards can be cancelled. The console reports automation failures instead of entering an infinite retry loop.

## Regression test evidence

28 tests run independently using `node tests/run-all.mjs`. The tests include full-auto NPC handoff, real roll blocker/resume, concurrent chase creation/cleanup, NPC theft security, 36 driving result outcome cases, old prompt recovery, collision/seat movement, road graph traffic, radio, maps, campaign missions, journal backups and initialization.

`tests/TEST-RESULTS.txt` retains the exact per-suite result lines. All **105** project `.mjs` modules and test modules have been checked with `node --check`; all **19** `.json` files have been parsed. The extra `scripts/journals/verify.mjs` integration verifier could **not** execute because the optional developer-only `linkedom` package is absent; the journal sources/compendiums themselves are unchanged from the base, and the existing `journal-upgrade` test passes. This additional verifier remains pending. `SOURCE-CHECKSUMS.sha256` is generated from the final candidate and verified; the complete ZIP must be checked separately after packaging.

## 24 live Foundry/Forge sign-off scenarios

All **24** require manual verification in one cloned world with an active GM and at least two players. The table distinguishes relevant Node evidence from unfinished actual-world acceptance. A Node pass is **not** a live pass.

| Scenario | Test in real world | Automated evidence | Live |
| --- | --- | --- | --- |
| **F01** | Selected empty/occupied vehicle travel measurement while unrelated Combat exists | recovery-contract / chase-ownership | **PENDING** |
| **F02** | Heat triggers automatic chase, console and rings appear | chase / chase-decisions | **PENDING** |
| **F03** | Heat 1–5 spawns proper police and moving units | chase / traffic / rules | **PENDING** |
| **F04** | Player/private + NPC speed dice queue and reveal | combat-flow / chase | **PENDING** |
| **F05** | Two partial vehicle moves measure and deplete same die | driving / recovery-contract | **PENDING** |
| **F06** | Yellow/red thresholds ask Wheels only once each | driving-prompt-resolution | **PENDING** |
| **F07** | Successful evasion clears promptly and Done advances | driving-prompt-resolution | **PENDING** |
| **F08** | Failed evade/PIT/ram applies effects once | driving-prompt-resolution / combat-rules | **PENDING** |
| **F09** | Reconnect with recorded partial result: no reroll or double damage | driving-prompt-resolution | **PENDING** |
| **F10** | Unrelated car prompt does not block chase | recovery-contract | **PENDING** |
| **F11** | Two police cars and motorcycle take consecutive Full Auto turns | full-auto | **PENDING** |
| **F12** | Attack Take Hit/Dodge blocks and then resumes auto chase | full-auto-blocker / combat-flow (partial) | **PENDING** |
| **F13** | Police stop Talk/Run/Surrender/Resist cards | chase-decisions | **PENDING** |
| **F14** | Driver/passenger escape move, boarding, custody | chase-decisions / boarding | **PENDING** |
| **F15** | Helicopter path search and fair loss of contact | static/source test | **PENDING** |
| **F16** | Star-by-star escape / stand-down | chase | **PENDING** |
| **F17** | Unrelated fight coexists with chased player, no combat merge | chase-ownership | **PENDING** |
| **F18** | Three simultaneous occupants track one moving motor on every client | vehicle-boarding / driving | **PENDING** |
| **F19** | Empty controlled vehicle obeys same speed-die budget | chase-decisions | **PENDING** |
| **F20** | Traffic junctions, blue-light response, map edge churn | traffic | **PENDING** |
| **F21** | Cross districts mid-pursuit; riders and chase transfer once | maps-import / satnav (partial) | **PENDING** |
| **F22** | Pause, disconnect, reconnect, save and reload no extra rolls | driving-prompt-resolution (partial) | **PENDING** |
| **F23** | All maps, NPCs, shops, missions, journals + user-edited guide pages | venues / missions / journal-upgrade | **PENDING** |
| **F24** | Complete live client+GM workflow without console/network errors | no live evidence | **PENDING** |

## Release and rollback gates

- Package **0.5.5** is delivered through the existing GitHub manifest install/update mechanism once the two release assets are published; `INSTALL.md` supplies full steps.
- The downloadable candidate's old journal source (`module/content.mjs` `VERSION='0.5.3'`) is intentional and separate from `game.system.version`: no gratuitous guide refresh should run for existing v0.5.3 worlds.
- Complete F01–F24 in the same cloned candidate, with recorded GM and two player clients. If a live failure appears, retain the captured console/Forge logs, patch a new candidate, and restart its full acceptance cycle.
- The full v0.5.5 ZIP and byte-identical standalone `system.json` are ready for GitHub Releases. The maintainer still must publish both assets on tag v0.5.5 and verify the existing Forge manifest-based Update workflow. That publication step has not happened.

---

## Original audit and repair specification — reference

The original static audit remains appended below for comparison. Its assessment was accurate for **v0.5.3**; statements about the old code being defective are historical and should not be read as the candidate's current state.

## A. Regressions and defects: source-confirmed

### A01 - Automatic chase entry disabled (P0)

- v0.5.0: `module/world/chase.mjs`, `registerChaseSettings()` lines 32-36: `autoChase` and `chaseAuto` both default true.
- v0.5.3: `module/world/chase.mjs` lines 34-39: both default false. `module/world/heat.mjs` lines 141-153 only starts an observed chase if `autoChase` is true.
- v0.5.3: `migrateChasePacing()` lines 348-369 explicitly resets these world settings to false and also turns off `chase.auto` for existing active chases.

**Effect:** a player wanted by police can be driven after in free roam, but the central speed-dice chase is usually never initiated. This also hides chase-only UI. **Plan:** restore optional auto-detection, with an explicit full-auto/assisted/manual mode, preserve deliberate world choices on migration, and give a GM an obvious mode indicator and switch.

### A02 - NPCs no longer have autonomous chase turns (P0)

- v0.5.0 `module/world/chase.mjs` lines 261-285: autopilot rolled NPC speed, revealed dice, executed NPC actions, called `combat.next`, and began subsequent rounds.
- v0.5.3 same module lines 290-347: one NPC action runs and marks its action `review`, then waits for **Continue**; subsequent rounds wait for **Begin round**. The code expressly forbids automatic advancement from a completed NPC action.

**Effect:** police can act when instructed, but the player does not receive an independently advancing police pursuit. **Plan:** create a real Full Auto mode that safely completes one action, checks for unresolved player decisions, advances exactly once, and runs the next eligible NPC action. Player turns never auto-skip; NPCs never outrun unresolved player rolls.

### A03 - Vehicle gauge is present but only renders during the current chase driving action (P0)

- The `module/map/drive-gauge.mjs` file is unchanged between versions. In v0.5.3 lines 23-28, `drawGauge()` requires `chaseOf(canvas.scene)` and `vehicleNow(combat)`. Otherwise the rings and label are cleared.
- The Combat Console similarly builds a gauge only from `vehicleNow(combat)` in `module/apps/combat-console.mjs` lines 45-52.
- Because A01 suppresses chase initiation and A02 pauses it frequently, this can *appear* as removed distance/speed measurement.
- Additionally, AI route movement in `module/world/chase.mjs` uses `smokeTraffic`/`acVehicleCarry` updates which bypass the regular distance-watching path. The AI's gauge tally may not reflect the movement it just performed.

**Plan:** provide two explicit overlays: a selected/piloted vehicle's real-time speed/travel display, and a clearly labelled green/yellow/red **per-action** chase budget with actual remaining squares. Track all actual moves through one authoritative measurement path, including police, player drags, route animation, and relevant forced movements. Update rings/console on state and actor changes.

### A04 - Police motion suppressed by unrelated Combat documents (P0)

- `module/world/chase-state.mjs` lines 4-8: `combatOn(scene)` considers *any* active or leftover Combat document on that scene, not only a Smoke chase.
- `module/world/heat.mjs` lines 259-265: real-time `huntTick()` only runs when there is no `combatOn(scene)` and no `policeStop` anywhere on the scene.
- `module/world/heat.mjs` lines 141-142: `sightTick()` immediately returns under the same broad condition, freezing new sightings, ongoing cooling/sighting logic, and chase entry.
- `module/world/traffic.mjs` lines 206-214 similarly stops the general traffic tick for any scene combat.

**Effect:** an ordinary brawl, stale combat tracker, or one police stop may make all units and traffic across the street appear inert. **Plan:** coordinate one chase-time simulation owner, distinguish a genuine active chase from an ordinary encounter, and pause only involved units and decisions rather than the entire map. Safely resume police/traffic afterward.

### A05 - Helicopter becomes stationary in turn-based chases (P1)

- `module/world/chase.mjs` lines 55-56 exclude the helicopter from Combatant turns, and lines 83-107 only include its present coordinates in escape calculations.
- v0.5.0 chased at end-of-round by jumping the helicopter to four squares behind the suspect (`module/world/chase.mjs` lines 77-90). This prevented genuine escape and was rightly flagged as unfair.
- In v0.5.3, aerial movement is performed by `module/world/heat.mjs` lines 113-136, but that tick is disabled when combat exists.

**Effect:** helicopter remains in the chase distance calculation but does not actually search or fly during the chase. **Plan:** implement a bounded aerial AI action or round phase using real speed, vision, last-known position, sight loss, and search. Do not restore instant teleport/rubber-band chasing.

### A06 - Unrelated or orphaned pending responses block the Combat Console (P0/P1)

- `module/world/chase-state.mjs` lines 64-77: `pendingResponses(combat)` searches **every token on the scene** for driving `prompts`, and pending attack cards for the whole scene; only some police stops are combat-scoped.
- `module/combat/combat.mjs` lines 214-221, 247-269 and `module/world/chase.mjs` lines 315-321 refuse advancement when any pending item exists.
- `module/world/incidents.mjs` lines 83-88 now correctly remove resolved prompt keys with Foundry's `.-=` deletion syntax, rather than merging an empty object. This is a meaningful improvement.
- `module/world/incidents.mjs` lines 125-175 record results, prevent duplicate replay and recover a subset of completed prompts at GM login. However a recorded `status:'review'` or stale `status:'resolving'` still has no full in-console review/repair workflow, and the broad scan can make an unrelated abandoned card block the chase.

**Plan:** scope pending prompts to current combat/chase members and their vehicles, record status and roll UUID, and add a GM-only *review/recover* panel. Safe completion must use the existing saved result exactly once; never invite repeated rolling to bypass a stuck card. Have the console display precisely which token, prompt, status, message and step are blocking, with a deliberate auditable repair choice.

### A07 - Movement validation is inconsistent between occupied and empty vehicles (P1)

- `module/vehicles/vehicle-boarding.mjs` lines 374-387 intercept user movement of occupied vehicles, passes it through GM-authoritative `moveVehicle`, and repositions riders as a unit; this is good and must be retained.
- `module/world/incidents.mjs` lines 259-317 contains turn-specific `gate()` and after-move `watch()` handling for occupied motors.
- `module/world/incidents.mjs` lines 414-427 handles empty-vehicle native drags separately. The native `preUpdateToken` path blocks outstanding prompts but does **not** call the same turn/budget gate before the movement; the watcher runs after the move.

**Effect:** a player-owned empty motor may move beyond its permitted turn distance before it is evaluated, while the equivalent occupied vehicle is constrained. **Plan:** share the same movement service and validation for both, unless the GM intentionally activates a free-position override. Retain rider/token sync and avoid double-counting a vehicle's motion.

### A08 - Police search exists mainly as a message, not route search (P1)

- `module/world/chase.mjs` lines 173-198 follows the wanted character or an intercept point. In searching mode, units more than 14 squares away post a 'Searching the last known area' card and return, without route search movement.
- `module/world/heat.mjs` lines 119-125 has after-chase last-known-position logic, but its sight calculation counts a helicopter as seeing an exposed three-star suspect anywhere on the scene (line 159), regardless of distance.

**Effect:** inconsistent sight and search: sometimes static police, sometimes effectively omniscient spotting. **Plan:** per-unit last-known-position, visual-contact timestamp, bounded patrol/search nodes, natural reacquisition, limited helicopter detection and documented Heat cooling.

### A09 - Civilian traffic turns changed rather than only being fixed (P2 or fidelity choice)

- v0.5.0 `module/world/chase.mjs` lines 50-58 included selected nearby civilian motors as distinct Combatants, each with speed dice.
- v0.5.3 `module/world/chase.mjs` lines 241-274 uses one grouped traffic action; `module/combat/combat.mjs` lines 255-258 appends `@traffic` at the end of the queue. Actual roads, collision-avoidance and yielding are retained.

**Effect:** traffic still moves but no longer has original individual speed-dice turns. **Plan:** provide a performance-conscious Shared Phase option while allowing a strict Original Simulation mode with independently scheduled traffic or individually calculated move budgets. Whichever is used, each car follows road geometry, yields for blues, doesn't clip riders or duplicate cars and remains visible in the console.

### A10 - Multiple combatants, traffic and existing combat handling (P1)

- `module/world/chase.mjs` lines 45-69 takes `combatOn(scene)` and adds wanted characters and police to it. A previously existing ordinary scene Combat may be repurposed with a `chase` flag rather than opened as a distinct encounter.
- `module/world/chase-state.mjs` lines 4-8 retrieves the first active/available scene combat; multiple combats could hide the actual chase or select the wrong queue.

**Plan:** use an explicit authoritative scene `chaseCombatId`, fail safely or migrate a plain fight in a controlled way, and never silently convert an unrelated combat. Cleanup ended/empty/stale chases and preserve classic combat data.

### A11 - Deployment provenance is inconsistent (P1)

- Downloadable v0.5.3 ZIP correctly says `system.json` version `0.5.3` and `module/content.mjs` version `0.5.3`.
- The v0.5.3 ZIP's `data/build-info.json` reports `0.5.1`.
- The `pacts-and-polyhedrals/the-smoke` repository source at `main` and tagged `v0.5.3` has `system.json` version `0.4.0`, not the downloadable archive's code. The release asset is therefore not a transparent checkout of its tagged tree.

**Plan:** make a release candidate only from a committed, tested source tree; ensure Git tag, manifest, ZIP, build-info, changelog and checksums refer to the same immutable commit and release version. Assert this in CI. Retain an explicit rollback package and do not overwrite an already published asset silently.

## B. Module-by-module system audit

**Interpretation:** 'unchanged + tested' means there is no *new file-level regression* apparent from this comparison and the existing Node tests pass; it does **not** mean that Forge live testing has been completed.

| Area | Comparison | Assessment | Required check/action |
| --- | --- | --- | --- |
| System bootstrap and Foundry v14 registration | `the-smoke.mjs` modified to install pursuit, migration and prompt recovery | New startup hooks introduce cross-system dependencies | Verify game ready, one leader, no duplicate timers, no exceptions on world startup/reload |
| Manifest and release | Manifest archive 0.5.3, GitHub source/tag and build-info out of sync | Release provenance defect | Align build-info, source tag, manifest ZIP URL and checksums |
| Core resolution: nine stats, exploding dice, difficulty, Hustle | `module/rules/core.mjs`, `dice/formula.mjs`, `dice/roll.mjs` unchanged | No file-level regression identified; rule tests pass | Run UI rolls with PC/GM in Forge, validate result flags and post-roll hooks |
| Character actor models, sheets, conditions | Data-models, sheet templates and conditions module unchanged; documents modified for crime flags | Generally preserved | Validate down, medical recovery, Condition indicators, ownership permissions |
| Character creator and levelling | Creator/levelling/advancement code unchanged | Existing tests pass | Test create/advance/sheet reopen with migrated world |
| Speed-dice combat/queue | `module/combat/combat.mjs` changed | Pending gates can block, `@traffic` changed timing | Player/NPC initiative, reveal, Dodge/hit, Done, next round, double-click protection |
| Combat damage, ammo, injuries and police attacks | `module/combat/rules.mjs` unchanged; Combat handler modified | Mechanics remain; action/response gating needs live validation | Hit/miss, armour, take-hit/dodge, splash, reaction, auto damage, action ownership |
| Vehicle models and controls | Vehicle abilities, movement, seat math unchanged | Data broadly preserved | All vehicle speed classes, handling, flats, tyre attacks, lights, damage and destruction |
| Boarding, piloting and riders | `vehicle-boarding.mjs` changed for settling moves | Stronger single authoritative update, but must test race conditions | Board from HUD, choose seat, one/multiple riders, leave, switch, moving convoy, player spectators |
| Speed gauge and distance | Gauge file unchanged; activation depends on chase | User-visible regression via pacing/start settings | Persistent selected-vehicle measure + per-turn chase band UI; all movement sources accounted |
| Driving checks, evasive manoeuvres, crash, PIT/ram | `incidents.mjs` heavily modified | Duplicate-roll protection improved; orphan/pending recovery incomplete | Success/failure all outcome classes, no duplicate incident damage, green/yellow/red/collision stop |
| Wanted Heat/dispatch | `heat.mjs` changed | Dispatch remains, hunt and sight ticks broadly suppressed | 1-5 stars, ANPR, units by tier, cooldown, response time and re-dispatch |
| Police decisions and arrest | New `pursuit.mjs` | Talk/run/surrender/fight are real handlers but can globally freeze map | Test all decisions, player response, escape move, custody, repeated clicks, resisting |
| Police vehicle AI | `chase.mjs`, `heat.mjs` modified | Main autonomy regression | Independently driving units, interceptions, yellow/red, PIT, ram, armed fire, officers out |
| Helicopter | `chase.mjs` AI changed | Not mobile during chase | Explicit aerial schedule, legitimate visibility, search and fair escape |
| Traffic and pedestrians | `traffic.mjs` modified; `traffic-core` unchanged | Free-roam blocked by any combat; traffic phase simplified | Movement, road priority, avoiding car overlap, map edges, signals, blue lights, pedestrians |
| Road graph, sat-nav and maps | Roads and satnav unchanged; `map-transit.mjs` changed | Navigation tests pass; cross-district pursuit is new risk | Routes, correct street edges, scene loading, last-known pursuit across map |
| Vehicle/scene transitions | `map-transit.mjs` now remaps/deletes chase combatants | Needed safety improvements with multiple asynchronous effects | Move vehicle plus all passengers together; preserve Heat without duplicate units |
| Shops, services, theft, inventory | Core modules unchanged | Existing rule and shop tests pass | Quick smoke test purchase/sell/steal, stolen-vehicle flags, A&E, police arrest outcomes |
| Missions, factions, jobs, map venues | Jobs, missions and location datasets primarily unchanged | Content largely preserved | Quest hooks, triggers, reputation, progress, spawn/map availability |
| Radio, mobile phone, communication | Radio and phone modules unchanged | No source-level regression | Handset and in-car radio, station switching, message studio, reconnection |
| Journals and guides | `module/content.mjs` changed; journal generator added | Edit-preserving upgrade is a positive change | Verify all shipped guide pages, old GM edits/backups, blank pages, link/navigation/access |
| Assets, imagery and compendiums | Almost all files unchanged | No broad content deletion apparent | Visual spot check of vehicle tokens, maps, NPCs, journals, loading paths |
| Forge multiplayer, sockets and networking | `module/world/net.mjs` unchanged, but new async workflows rely on it | Node tests cannot prove multi-client behavior | Test leader election, GM-only writes, packet ordering, temporary disconnect/reconnect |

## C. Recovery architecture

### C1. One authoritative chase controller

One GM leader owns the simulation; the scene explicitly records its active chase/combat ID. Each combat action has an immutable `(combatId, roundId, actionId)`. An NPC action has states **ready -> running -> awaiting_player (when needed) -> settled -> advanced**, with a separate **needs_GM_review** if a deterministic result could not be applied. Every action is idempotent: the same action ID cannot run twice or advance twice.

There are three configured modes:

1. **Full Auto**: automatically start eligible chases; roll NPC dice; move police, traffic and helicopter; resolve NPC-only effects; advance resolved NPC actions without clicks; automatically create the next round only when required player inputs and previous action completions are accounted for. Never skip a player turn or auto-answer a PC's Dodge, driving check, or police stop.
2. **Assisted**: run one NPC action on request, present outcome, wait for Continue. This is approximately the v0.5.3 style, but with visible blockers and deterministic state.
3. **Manual**: GM controls NPC actions and advances the console; movement/roll validations still apply.

`autoChase` (detect and start pursuit) is **separate** from the action progression mode. A world migration must not silently overwrite the GM's chosen mode. Failed or stale states remain recoverable without a roll being repeated.

### C2. A durable roll/incident transaction

Each driving/pursuit/attack prompt holds a unique ID, target actor and token, action ID, created-at time, exact source roll ID, saved outcome, and effect application markers. The initiating client returns the roll in one standard format; ChatMessage hook or direct auto-roll can both reconcile against this record. The applying GM writes an idempotent incident result and finally clears the prompt key. If the sequence fails, the console shows **Saved roll, apply pending effect** or **GM review**, never **Roll again**.

The pending gate checks only relevant participants, vehicles and combat-linked chat cards; it does not read orphaned responses from other encounters as chase blockers. End-chase, scene transfer, busted, dead vehicle, and abandoned combat clean up their own action state and preserve a readable audit trail.

### C3. Unified vehicle movement and measurement

Create one movement accounting service shared by on-canvas player dragging, the authoritative rider-carry update, police route animations, civilians, collision displacement and escape moves. Store move source, start/end points, grid units, current action, distance total, handling band and processed-check markers. Apply the same limits before committing any user-controlled move; allow explicit GM Alt free reposition without counting it.

The **chase gauge** shows green/yellow/red range with 'used / remaining' squares and check status, and follows the current driver/vehicle. A **free-drive indicator** shows the selected/controlled vehicle's current movement and class/speed even when the chase is not active; it should not suggest that normal travel is limited by a speed die. Provide units and a GM setting to show/hide overlays. AI-owned vehicle movement also updates the measurement shown for its own die.

### C4. Police pursuit and Heat simulation

- Police response spawns units by star level without duplicating the same unit on each tick.
- Real-time police drive on road graph until a turn-based chase actually owns their actions. Existing unrelated combat must not freeze the city.
- In chase, each vehicle/officer has a budget and intended target, road navigation, handling checks, interception logic, PIT/ram/armed response, and completion trigger.
- Helicopters operate on a bounded aerial schedule; have visual search conditions, not instantaneous repositioning or omniscient tracking.
- Police stops affect only the appropriate suspect/pursuit. Other units may continue unless explicitly blocked by a player-facing decision.
- End-of-round escape compares visible, moving units, uses genuine last-known-position search, reduces one Heat star under rule conditions, and returns to free roam without ghost combat records.

### C5. Keep traffic and transitions consistent

Allow a GM preference for individual original speed-dice civilian turns versus a shared performance-friendly traffic phase. Both must move cars according to road graph and vehicle speed, obey obstruction and right-of-way, handle red lights/blue lights and only despawn at correct exits. Players entering a formerly AI traffic car remove it from ambient traffic; crossing a map with passengers transfers the whole convoy. Pursuers enter the next linked district through a reproducible approach rather than an arbitrary teleport.

## D. Repair sequence, with no feature sacrifice

### Stage 0 - Freeze and reproduce

- Copy v0.5.0 and v0.5.3 into protected versioned regression fixtures; back up the actual game world before touching installed files.
- Capture two Foundry sessions (GM + non-GM client) and sample trace logs for the exact observed stuck evasive roll, lost gauge, absent police movement, and Forge 500 network response.
- Add failing tests for **all** defects A01-A11 before changes. Instrument action, roll, prompt and movement IDs.

**Exit:** reproducible baseline, no active-world mutation, and at least one automated check that fails for each confirmed regression.

### Stage 1 - Unblock rolls and turns safely

- Separate `pendingResponses` into chase-specific prompts; implement the prompt lifecycle and GM recovery UI; make `combat.next` commit exactly once.
- For NPC actions, settle only after all effects, animation and player responses are accounted for.
- Test all die outcomes and an interrupted write with a saved roll. Preserve no-reroll guarantees.

**Exit:** successful evade/YELLOW/RED checks remove their prompt and release the console; failure applies once; forced reload/reconnect never duplicates damage or discards a recorded result.

### Stage 2 - Restore measurement and vehicle move invariants

- Re-enable gauge and selected-vehicle travel UI, use one movement accounting service for both empty and occupied motors and for NPC route travel, and repair HUD/console refresh.
- Preserve rider sync, footprint, collision checks, traffic yielding and valid GM reposition override.

**Exit:** exactly matching consumed distance in map rings, console and stored token state after any supported move; each band triggers at most one check per action.

### Stage 3 - Restore genuine police/traffic autonomy

- Distinguish free-roam police, turn-based police, officers, helicopter and traffic explicitly.
- Reinstate full-autopilot loop with action IDs and player-decision gates. Don't transplant the v0.5.0 loop verbatim: its unconditional auto-advance was the source of the unresolved-roll risk.
- Remove blanket `combatOn` suppression for unrelated units and allow valid scene state transitions. Give users a Full Auto switch in the console.

**Exit:** after a player finishes a die, all NPCs with a turn complete actions on their own; PC turns wait indefinitely if necessary; gameplay proceeds without clicking Continue for each police car.

### Stage 4 - Repair pursuit realism and cross-map travel

- Add real last-known-area searches, sight/LOS behavior, aerial pursuit, roadblock and escape resolution; restore synchronized district transitions.
- Audit police stop, arrest, resisting, wanted Heat levels 1-5, traffic ownership, damage, PIT and ramming.

**Exit:** police physically pursue, can lose the trail, can catch/arrest appropriately, and survive map changes without duplication or freezing.

### Stage 5 - Whole-system regression pass

- Verify all originally unchanged mechanics from Section B with the exact release candidate, not just source tests.
- Import content into a clean world and upgrade a cloned older world; confirm journals, map links, inventory, quests, radio, shops, permissions and visual assets.
- Confirm test result output and syntax validation, plus two-client Foundry v14 manual flows.

**Exit:** no regression elsewhere; v0.5.0 behavior is covered by a repeatable contract.

### Stage 6 - Reproducible release

- Update the actual GitHub source and build-info to match the ZIP; publish from an immutable source commit, not an out-of-sync tag.
- Regenerate assets and manifests with one build script; compare SHA256 hashes. Version increment only when the acceptance suite passes.
- Install a versioned release candidate in a **clone** of the Forge world first, retaining a rollback ZIP and backup. Do not use the live game for iterative debugging.

**Exit:** Git tag/source, packaged system.json, build-info and released ZIP are all traceably the same version; no data loss.

## E. Acceptance tests - required before declaring 'fully functional'

| ID | Test | Pass criterion |
| --- | --- | --- |
| F01 | Start free roam with a selected player car and an ordinary combat record elsewhere | Travel measurement is visible for selected car; no unrelated scene combat freezes police |
| F02 | Gain Heat and enter police sight while driving | A chase starts automatically when enabled; console and gauge appear |
| F03 | Police Heat 1-5 in free roam | Appropriate units spawn and physically travel along the streets without GM manual dragging |
| F04 | Roll speed dice GM + two players | NPC roll once; PC results private until reveal; all entries and traffic mode correct |
| F05 | Make two partial player vehicle moves in one die | Measured distance accumulates correctly; rings shrink; turn cap enforced |
| F06 | Cross green->yellow->red thresholds | Medium and Hard checks requested once each as the rules require |
| F07 | Succeed on evasive manoeuvre | Saved result applies, flag disappears, and Done advances immediately when otherwise clear |
| F08 | Fail on evade/PIT/ram | Correct crash, spin, damage and lost action exactly once; no duplicate damage on reload |
| F09 | Complete/interrupt/reconnect during roll resolution | Correct result saved and recoverable without rolling again or skipping incidents |
| F10 | Leave an unrelated incomplete prompt on a different car | Current chase is not blocked by that unrelated prompt |
| F11 | Two police cars and a motorcycle in Full Auto | They drive along real road paths, obey turn budgets and complete their actions without clicking Continue |
| F12 | NPC attack forces player Take Hit or Dodge | Auto simulation pauses *only for that choice*; resumes after resolution; never attacks twice |
| F13 | Police stop: talk, run, surrender and fight | Each card has one valid response; no duplicate stop; scene recovers correctly |
| F14 | Run away on foot and by commandeering a car | Correct finite escape movement, boarding permissions, and turn recovery |
| F15 | Helicopter in an active chase | Moves fairly on a bounded trajectory, can search, does not teleport or freeze |
| F16 | Lose police in successive rounds | One Heat star drops at a time under defined visibility/range rule; all units finally stand down |
| F17 | Scene with active unrelated fight and independent wanted driver | Combat stays intact; police/traffic are not globally frozen; no accidental combat merging |
| F18 | Move occupied vehicle with two passengers | Driver/vehicle/passengers remain synchronized on GM and all player clients, including animations |
| F19 | Drag empty player-owned car off-turn | Same turn/limit rules apply as occupied cars; invalid movement never commits |
| F20 | Traffic at junctions, blue lights and map edges | Cars follow traced lanes, yield safely, stay out of occupied vehicles and despawn only at boundaries |
| F21 | Cross district boundary during a police pursuit | Party/riders and Heat transfer together; source combat ends; destination chase activates once |
| F22 | GM pause, client disconnect, GM reconnect, saved combat | No automatic extra rolls, skipped actions, orphan blockers or duplicate unit dispatch |
| F23 | Import all compendiums into clean and upgraded worlds | Maps, vehicle actors, 27 guides, shop assets, missions and edited GM pages persist |
| F24 | Release candidate on Forge Foundry v14 with 1 GM + 2 players | All above cases pass without blocking UI, mismatched permissions or unhandled console errors |

**Minimum sign-off:** F01-F24 all pass on the same immutable candidate build, with video or logs of F07-F12 and F17-F22. Node test success alone is not a release pass.

## F. What to retain, what to restore, and what not to do

### Retain from v0.5.3

- Explicit Foundry `.-=` prompt-key deletion; saved roll results and duplicate click suppression.
- The concept of deferred action completion until a player resolves a real decision.
- GM-authoritative movement for occupied cars and passengers; strict escape budgets.
- Road-following NPC vehicle trajectories, non-teleport aerial intent, traffic road avoidance, editable guide backups, and most added regression tests.

### Restore from v0.5.0's functioning contract

- Automatic pursuit activation when enabled.
- Automatic NPC speed-dice rolling and action progression (with new player-decision safety guards).
- Clearly visible vehicle movement measurement during the actual driving experience.
- A police simulation in which multiple units act as independent threats, with no GM action required for every police car.
- The ability to represent civilian cars individually if original speed-dice fidelity is required.

### Never use as a 'quick fix'

- Deleting all unresolved prompt flags just to advance the console: this loses genuine pending outcomes.
- Replaying an already rolled hazard on reconnect: this can double-apply crash or attack damage.
- Blindly restoring v0.5.0's autopilot next-turn loop: it can auto-skip unresolved player decisions.
- Restoring helicopter teleport-on-round-end: it defeats fair escape gameplay.
- Publishing a new ZIP without reconciling tagged repository source and Forge acceptance results.

## G. Recommended first engineering changes

1. Introduce a dedicated `chase-controller` state machine and a scoped pending-prompt selector. Make it observable from GM diagnostics.
2. Repair prompt lifecycle, GM review and `combat.next` idempotency. Build automated failure injection for asynchronous roll resolution.
3. Make `autoChase` and `NPC action mode` independent settings; add Full Auto without bypassing player choices.
4. Restore gauge accessibility and unify movement measurement for player, NPC and free-drive motors.
5. Refactor `combatOn`/Heat/traffic ownership and helicopter turn updates, then add realistic search behavior.
6. Complete the multi-client, cross-map and release-pipeline acceptance suite before public update.

**Conclusion:** The v0.5.3 source is salvageable, and the majority of Smoke is preserved. What is *not* currently established is a fully functional end-to-end chase in Forge. The recovery should treat movement measurement, prompt settlement and police automation as one coordinated system, with explicit release gates and no silent loss of older features.
