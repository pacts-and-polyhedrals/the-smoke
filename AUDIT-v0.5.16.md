# The Smoke v0.5.16 — full-system audit and debug pass

**Input:** `the-smoke-v0_5_15.zip` (v0.5.15, 1,191 files, 77 modules / 1.17 MB of system code, 16 templates, 11 compendium packs).
**Output:** v0.5.16. Every bug below that is marked *Fixed* is fixed in this release and, where it can be exercised outside Foundry, covered by a regression test (`tests/audit-world.test.mjs`, `tests/audit-chase.test.mjs`).
**Not claimed:** a live Foundry 14 / Forge multiplayer run. Everything here was verified against the real system modules with Foundry document stand-ins; see *Live acceptance* at the end.

## 1. How the system was checked

| Check | Result |
|---|---|
| Existing regression suites (`node tests/run-all.mjs`) on the uploaded build | 44 / 44 passing before any change |
| Syntax check of every `.mjs` file (`node --check`) | 134 files, 0 errors |
| ESLint 9 with Foundry globals (undefined names, unreachable code, duplicate keys, unsafe optional chaining, use-before-define, unused code) | 0 real errors. 19 use-before-define hits are all references inside functions (checked one by one: none run during module load). 48 unused imports/variables → 31 dead imports removed, 17 harmless locals left |
| Every static, namespace and dynamic `import` resolves to a real export | 134 files, 0 unresolved |
| Every `systems/the-smoke/…` asset path in code, templates, CSS, data and journals exists (including paths built with template strings) | 670 + 872 (inside packs) paths, 0 missing |
| Every compendium pack opened as LevelDB and every record parsed | 11 packs, 0 bad records, 0 key/id mismatches |
| Compendium links (`@UUID[Compendium.the-smoke…]`) resolve to a real entry/page | 3,600 links, 0 broken |
| Handlebars: every template compiled and rendered with the test contexts; tags balanced; helpers used are registered | 16 templates, 95 renders, 0 errors |
| CSS parsed and every declaration validated | 0 parse errors (7 validator warnings are `min()`/spacing false positives) |
| Language keys used vs `lang/en.json` | 0 missing |
| Foundry v13/v14 API scan (deprecated globals, jQuery in render hooks, v1 Dialog/Application, old chat-message hooks, scene-control shape) | Clean: the system already uses v14 namespaces, ApplicationV2 and HTMLElement hooks throughout |
| Manual code review | Every module read for logic, races, permission holes, request-queue deadlocks and Foundry API misuse |

## 2. Bugs found and fixed

Severity: **High** = breaks play or pays/penalises wrongly in normal use. **Medium** = wrong in common situations, or a player can bypass a rule. **Low** = edge case or polish.

| ID | Sev. | Where | What was wrong | Fix | Test |
|---|---|---|---|---|---|
| M1 | High | `world/missions.mjs`, `world/mission-props.mjs` | The mission state is one world setting, but it was read-modify-written from several unsynchronised paths (map arrival, sales, jobs, purchases, cargo, graffiti, radio war, the board). Two of the crew crossing into a mission's map together fired two events at once; both could pass the mission, **paying everyone's cash, XP, Rep and Renown twice** with two MISSION PASSED cards. Other overlaps silently lost ticks or cargo updates. | One queue (`withMissionState`) for every write, always starting from a fresh read. Cargo writes merge only their own parcels. | Reproduced on the old code (paid £100 instead of £50); passes now |
| H1 | High | `world/heat.mjs`, `world/chase.mjs` | During a chase the hunt timer skipped the **whole map**: police units not in the chase (spawned when Heat rose mid-chase, or further off) froze for the rest of the chase, and nothing ever added them to it. | Only the chase's own units (and the helicopter, which moves once a round) wait for their turns; every other unit keeps driving. At the end of each round, units that have reached the chase join it (`joinReinforcements`). | ✓ |
| P1 | High | `world/pursuit.mjs` | A chase on a map cancelled **every** character move on it and demanded "your own turn" — characters not in the chase (other players, bystanders) could not move at all until it ended. | Only the people in the chase, or someone under a police stop, are held to the chase's turns. | ✓ |
| I1 | High | `world/incidents.mjs` | An unanswered driving card blocked the vehicle everywhere, even out on the street, and the only tools to clear one live in the chase Combat Console. A manual evasive card (auto-roll off, or the auto-roll failed because the driver was Down) or a result waiting for GM review **stranded that vehicle permanently**. | Outside a chase an open card never stops the motor; it resolves whenever it is rolled. A late crash result only "stops it dead" at the impact if the vehicle hasn't moved since (no teleporting back). New GM button on the vehicle sheet: **Clear stuck checks** (no reroll, no damage). | ✓ |
| RQ1 | Medium | `gm/requests.mjs` | When several players answered one roll request at once (teamwork especially), each answer read the card, waited on hazard effects, then wrote it back — **answers were lost**, the teamwork total never appeared, and a lost answer could be rolled again (taking hazard damage twice). A roll could also be recorded against a character it didn't belong to. | Answers to one card are processed one at a time from a fresh read; a roll only answers for its own character, only for characters and stats the GM asked for. | ✓ |
| R1 | Medium | `dice/roll.mjs` | A player's roll made on the leader passed every client option through, including `cardExtra` (raw HTML placed in a **GM-authored** chat card — buttons included), whispers and state handling. | Remote rolls keep only the options a player legitimately sets; the Combat Console's escaped notes list is the only HTML allowed. A second (non-leader) GM keeps whispers. | ✓ |
| R2 | Low | `dice/roll.mjs` | A remote roll replaced the token the caller named with the first token of that actor on the viewed map — wrong seat / driver context for multi-token actors. | The caller's scene and token are kept; only missing ones are filled in. | — |
| R3 | Low | `dice/roll.mjs` | Not enough Hustle for a remote roll: the warning appeared on the GM's screen and the player's roll silently did nothing. | The player gets the error. | — |
| IT1 | Medium | `world/items.mjs` | The cable-ties handler cuffed **any** actor for any user: no check of Grabbed/Down/surrendered, reach, or that the user's character carries cable ties. | All three checked on the leader (the GM is exempt). | ✓ |
| IT2 | Medium | `world/items.mjs` | Toolkit repairs trusted the outcome a client said it rolled — "exceptional success" restored a vehicle to full. | The leader reads the repair's own roll message, checks it matches the character and vehicle, and uses it once. | ✓ |
| C5 | Medium | `world/chase.mjs` | Self-play players could start and run a chase but only the GM could end it. | Whoever may run the chase may end it; the card names who called it off. | ✓ |
| N3 | Medium | `world/net.mjs` | Every world action runs in one queue; a single action that never finished (a lost reply, a write that hangs) froze **all** later actions for the session. | After 45 s the queue lets the next action through (the slow one keeps running) and logs which one stalled. | ✓ |
| J4 | Medium | `world/jobs.mjs` | The 2-second job clock queued a new tick every 2 s even while the last was still running, so slow ticks piled up in the world queue ahead of player actions. | One tick at a time. | — |
| V3 | Medium | `vehicles/vehicle-boarding.mjs` | Every vehicle a player drove (each nicked traffic car, every taxi) got its own world Actor that was never deleted — the Actors directory filled with orphans over a campaign. | Driven-vehicle actors go in *The Smoke — Driven Vehicles*; when no token anywhere uses one (and it isn't folded up and carried), it is deleted. Map crossings never trigger it. | ✓ |
| H3 | Medium | `world/heat.mjs`, `world/shops.mjs`, `world/items.mjs` | "Which token is this character?" took the first token on any map, so a stale token left on another map could send police to the wrong map, make Wasted/Busted move the wrong token, or make a shop think you weren't there. | One shared lookup (`actorToken`): the actor's own token, then the map an owner is viewing, then the GM's view, then the active scene. | ✓ |
| CC1 | Medium | `apps/combat-console.mjs`, `world/chase.mjs` | Street Life updates every car's route position every second; each update redrew the open Combat Console and woke the chase autopilot. | Traffic/travel-meter updates are ignored; other redraws are batched. | ✓ |
| I9 | Low | `world/incidents.mjs` | Any player could ask the leader to set any vehicle on fire. | Only the GM, or a vehicle already at 0 Body. | ✓ |
| C10 | Low | `world/chase.mjs`, `combat/combat.mjs` | A public TRAFFIC PHASE card every round. | Whispered to the GM. | — |
| T1 | Low | `world/traffic.mjs` | Pedestrians froze for the whole chase (cars move in the traffic phase by design). | Pedestrians keep walking. | — |
| D1 | Low | `documents.mjs` | The wound counter (which stops first aid being reused) was written as a flat key into a possibly expanded change object. | Written in the same shape as the rest of the change; never overwrites a caller's value. | — |
| D2 | Low | `documents.mjs` | Using a weapon from an unlinked NPC's sheet could attack from another token of the same actor. | Uses that NPC's own token, then a selected token. | — |
| N2 | Low | `world/net.mjs` | A notification with an unknown level threw an error. | Falls back to info. | ✓ |
| G1 | Low | `graffiti/runtime.mjs` | A GM-hidden paint spot could be tagged by sending its id. | Refused for players. | — |
| ST1 | Low | `radio/studio.mjs` | A scheduled broadcast showed "On air at Banana Watch 1234567 seconds". | Shows the Banana Watch day and time. | ✓ |
| K1 | Low | `combat/combat.mjs` | An unknown cover value on a target crashed the attack dialog. | Ignored. | — |
| U1 | Low | `content.mjs` | The upgrade card still said chase automation starts **off** (true for 0.5.1 only). | Text matches current behaviour. | — |
| B1 | Low | `scripts/journals/rules.mjs` | Tier range for the top Rep tier was computed as `NaN \|\| 33`. | Explicit. Same output. | — |

## 3. Improvements added

- **Lock players' progress fields** (new world setting, off by default): players can't type new values into their own cash, stash, XP, Rep, Rep level, stats, advances or Health/Hustle maximums; those change through play or the GM. Story fields stay editable. (A UI lock for tables that want it, not a security boundary.)
- **Clear stuck checks** on the vehicle sheet (GM) — works anywhere, not just in a chase.
- **Reinforcements** join a running chase at the end of a round instead of waiting it out.
- Driven-vehicle actors are kept in their own folder and tidied up.
- 31 dead imports removed; two new regression suites (46 suites total).

## 4. Checked and deliberately left as they are

| Item | Why |
|---|---|
| Players' requests carry their own user id, and Foundry gives no trusted sender on system sockets. A player using the browser console could claim to be someone else. | A Foundry platform limit. Rolls that matter (driving checks, theft, graffiti, radio war, repairs now) are verified from the leader-made roll message, which a client can't forge. |
| Combat hits and speed dice are rolled on the player's client and reported. | Same trust model as Foundry's own dice. Changing it means moving all combat rolls to the leader — a design change, not a bug fix. |
| Police spot and start chases on their own by default; upgrading from 0.5.3 switches that back on once. | The 0.5.4 recovery made this deliberate (it had been the main regression report). GMs can switch it off: *Chases: start turn-based pursuits automatically*. |
| Job clocks run on real time; conditions run on the Banana Watch. | Job deadlines are meant as real-time pressure; documented in CONDITIONS-WATCH.md. |
| Rest advances the shared Banana Watch by 8 hours for everyone. | Deliberate in 0.5.14. |
| Guides stay on journal edition 0.5.3. | No guide text contradicts these fixes, so the journals and the Guides pack are unchanged (no backup/refresh cycle for your edited pages). |

## 5. Live acceptance for 0.5.16 (Forge, GM + one player)

1. **Street movement during a chase:** with a chase running, move a second player's character who is *not* in it — it moves freely. Raise a wanted character's Heat mid-chase: the new units drive toward the chase and join it at the end of the round once they are within 40 squares.
2. **Stuck card:** turn off *Driving: roll evasive manoeuvres automatically*, drive over a parked car outside a chase, then keep driving — the car moves; roll the card later and the car is not teleported back. Open the vehicle sheet as GM: **Clear stuck checks** clears any leftover.
3. **Missions:** move two crew members onto a mission's destination map in one crossing — one MISSION PASSED card, each paid once.
4. **Teamwork:** post a teamwork request to two players; have both press their buttons together — both results and the team average appear.
5. **Self-play:** in Self-play, a player in a chase can end it from the Combat Console.
6. **Housekeeping:** nick and drive a parked car, get out, then delete its token as GM — its actor disappears from *The Smoke — Driven Vehicles* (a car that crosses to another map keeps its actor).
7. Re-run the existing radio, graffiti, mission-cargo and rest checks from INSTALL.md / RADIO.md.
