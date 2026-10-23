# Combined-build status: 0.5.27-rc.3

## What rc.3 changes (2026-10-23)

- **Cash and kit added on a sheet count.**
  - Characters made with Foundry's Create Actor had unlinked tokens, so cash and kit added on a token's own sheet went into a copy that nothing else read.
  - Character tokens are now always linked. At GM login, anything on a copy is moved onto the character first, and the GM is told what moved.
  - Any can called spray paint counts.
- **Money and kit.**
  - The GM always has full control, and the GM Screen can now take kit as well as give it.
  - In Self-play, players' cash, stash and new kit come through play (setting, on by default). Story mode is unchanged.
- **Banana Basket.** Blower orders of high-street stock, delivered to Your Flat:
  - fee and delivery time set by the GM;
  - collected at the flat;
  - cancellable with a refund while on the way;
  - no weapons, ammo, drugs, under-the-counter or Rep-locked stock.
- **Tests:** `tests/resources-and-orders.test.mjs` reproduces the unlinked-token bug and checks every part of the above. All 76 suites pass.


## What rc.2 changes (2026-10-23)

rc.2 fixes the mission automation that rc.1 introduced, after a crew got stuck on CH3 Lights and Sirens ("Get some wheels — fast 1/4", the sat nav stuck at The Arches, "No clear 2 x 4 space in South Hackney & Well Street / Morning Ln", and the GM review that froze the job). See `RELEASE-v0.5.27-rc.2.md`.

- **Every job plays through by itself.** `tests/mission-playthrough.mjs` plays all 179 jobs the way a crew would: ask the sat nav, go there, do what the objective says, and check the step ticks from that alone. All 179 pass at 1, 2, 3, 4, 5 and 6 players (1,074 runs) and with every street crowded with parked cars (358 runs). The original rc.1 code fails CH3 at four players, CH3's van chase, M05's car and the crowded set-up, as reported. `tests/mission-playthrough.test.mjs` runs 716 of these on every build.
- **Rules.** A shared car counts for everyone in it; a nicked motor counts wherever it was nicked (and any model the job asks for counts, not only the one it placed); a sale counts at the right buyer, not only at Pat's; paint, radio and cargo proofs carry their own place. Set-up never blocks a job: anything it can't place is listed for the GM and the job carries on. Runs saved by older builds keep their progress, and runs frozen by rc.1's review are released on load, with a note in their log.
- **By hand.** A player on the job (Self-play) can mark a ready step done; the GM can mark any step done, reopen it or pass the job. Every change is logged on the run.
- **Sat nav.** It goes to the job's motor (or back to it), the wall to paint, the radio contact or the cargo, and finishes what's at the place the crew are in before driving off.
- **Places.** Every checkpoint was checked against its objective text, the place names the GM file runs each scene at, and the contacts it names (`scripts/missions/fix-contracts.mjs` applies and documents each fix). Fixed: M09 Westfield (was the London Stadium), M12 Big Night (the lock-up behind the Leyton Orient ground, not a betting shop), M11 (save the ledger during the raid, not after), CH5, CH6, CH7, CH8, AD1, AD3, AD8, LB2, TU2, TU8, BB4, MR7 and S04, and all 42 graffiti commissions (each wall's checkpoint is where its paint spot is; the Bow Flyover column is under the flyover). The GM files' "Live mission contract" tables are now generated from the same data.

Still open from the audit: live Foundry/Forge and multiplayer acceptance, native pack loading, and the bespoke scenario work listed below. The simulator drives the real handlers and data in Node, not a browser.

The historical audit ledger below is retained in full. Its 238-item / 272-page / 65-suite figures describe the audit parent, not the merged output. The combined build has 247 items, 29 journals / 328 pages and 74 suites. Its partial/open audit statuses remain unless explicitly corrected in MERGE-REPORT.md. The 78 static SVG finishes are now shipped by the incoming branch.

---

# The Smoke v0.5.25-rc.1 - implementation status

**Development/test candidate, NOT the next approved complete build.** The original v0.5.24 ZIP remains the comparison baseline. This package contains code changes, not just an audit. It does **not** finish every mission, venue and item requirement.

## Verified scope

65 Node suites pass: the original 59 suite files remain, with four release/content expectation updates, plus six new suites. Contract checks cover all 179 missions / 894 checkpoints and 1,074 mission/crew projections. Resource preparation covers 716 simulated mission starts (179 x 1/2/4/6 PCs). Venue tests instantiate 199 counter profiles, including all 160 interiors; there are 238 item entries (171 preserved + 67 additions). These are schema, source and document-simulation tests, **not** 179 complete live play-throughs.

The main-sheet roll-state controls and one Blower button are implemented. Offline DOM/CSS checks cover 800, 520 and 380 pixel heights. No live Foundry sheet update, multiplayer canvas or Forge-hosting test has been performed.

Three compendiums were rebuilt to match source: items, people and guides. Original document IDs are retained; Big Sal and an ARV Handcuffs loadout are added. Independent snapshot parsing, CRC, manifest bounds and source/pack checks run; **native Foundry loading of rebuilt packs is still a release gate**. All remaining packs/maps/art are preserved.

## Release blockers and open work

- Bespoke scenarios: CH3's cross-map moving-van route, full race/escort play-throughs, several career vehicle missions, physical heavy/bulk cargo, and all branch consequences are not complete. A generic successful roll is not proof of those mechanics.
- Crew contribution contracts exist, but not every scenario has received a bespoke workload/transport balance pass. Graffiti supply provisioning and individual radio roles are not complete.
- Counter access and credential issuance exist; physical admission barriers, full transit fares, staffed NPC shift rosters and some legacy service paths remain open.
- Police-search per-drug Heat, all device/job/loadout interactions, authored map locks, fire spread and complete context generation for every perk/outfit promise remain open.
- Native Foundry/Forge loading, pre-existing-world migration, client permissions/synchronization, reconnect and live complete mission play-throughs must pass before promotion.

## Important behaviour changes

Checkpoints tick from what the crew do; a player on the job (Self-play) can mark a ready step done and the GM any step, and every change is logged (rc.2). Existing old runs keep their progress and carry on (rc.2; rc.1 froze them for review). Each enrolled PC needs a contribution. Repeated outfit changes no longer farm Heat. Purchases require actual counters; non-retail venues are contacts, not shops. Situational perks require supported context or recorded GM approval. These restrictions are intentional, but all need acceptance in a cloned world.

Inventory transactions use staged durable receipts and retry recovery. They are **not** database-atomic across multiple Foundry documents. Pending combat hits after an interrupted write stop for GM review rather than risking duplicate damage.

## Every audit issue

Status marked IMPLEMENTED means a code path exists with the stated evidence; it does not mean live sign-off. PARTIAL and OPEN are not completion claims.

| ID | Priority | Issue | Status | Implemented | Remaining |
|---|---|---|---|---|---|
| M-01 | P0 | Cross-mission cargo proof collision | IMPLEMENTED / FOCUSED TESTS | Mission ID, run, participant, serial, actual location and duplicate receipt checks. Same p1 on another mission is rejected. | Concurrent GM/client operation and reconnect live sign-off. |
| M-02 | P0 | All checkpoints auto-tick | IMPLEMENTED / PLAYED THROUGH (rc.2) | 894 checkpoint contracts; all 179 jobs tick from the crew's own actions at 1–6 players. Players on the job (Self-play) can mark a ready step done and the GM any step, with a logged reason. | 349 authored roll checkpoints and 113 choice checkpoints are not proof that all underlying bespoke scenarios are physically simulated. |
| M-03 | P0 | Mission-specific vehicles | PARTIAL | Opening targets and selected scenario vehicles are spawned and identified by run and serial. CH1 has four bikes for four PCs. | Some career scenarios still lack their full vehicle/escort workflow; CH3 moving van is not yet a scripted multi-map route. |
| M-04 | P0 | Party-sized planning | PARTIAL | One-to-six roster, scaled repeatable resources, distinct contribution requirement and support opportunities. | Not a bespoke workload/balance approval for every mission; heavy cargo and transport capacity remain open. |
| M-05 | P0 | Street arrival falsely proves venue task | IMPLEMENTED / FOCUSED TESTS | Exact-map/zone receipts and staged prerequisites replace broad street entry for interactions. | Counter/hotspot geometry needs actual canvas walk-through. |
| M-06 | P0 | Mission actor ownership | IMPLEMENTED / FOCUSED TESTS | Participant ownership and authoritative start/action checks; GM override has a reason. | Foundry document ownership is not a general anti-cheat boundary against an owner editing their actor. |
| M-07 | P1 | Physical cargo exact zones | IMPLEMENTED / STRUCTURAL TESTS | Explicit pickup/delivery anchors on all 112 cargo definitions; dropped cargo stays recoverable without inventing a delivery receipt. | World placement and two-client delivery acceptance. |
| M-08 | P1 | Cargo representation / bulk | PARTIAL | Vehicles can be run-bound physical resources; parcels retain serialised inventory/ground representation. | Heavy/bulk carrying and all special representations are not implemented; a prize-bike case still needs consolidation of vehicle versus parcel. |
| M-09 | P1 | Mission NPC placement | IMPLEMENTED / STRUCTURAL TESTS | Idempotent contact placement for cast associations; missing-contact preflight errors; Big Sal catalogue entry repaired. | Not every contact has bespoke branching dialogue; canvas/access sign-off. |
| M-10 | P1 | Opening locations and branches | PARTIAL | Opening anchors supplied, cafe routing resolved, M12 branch graph and Stretch actions added. | Not every alternative ending or chase scenario is end-to-end verified. |
| M-11 | P1 | Minimum Rep | IMPLEMENTED / CODE CHECKS | Start/status checks use the mission minimum Rep. | Live offer/start checks for mixed-level crews. |
| M-12 | P1 | Vehicle sale/respray identity | IMPLEMENTED / CODE CHECKS | Bound vehicle identity is carried through theft, service and sale events; loans cannot be fenced as targets. | Complete play-through of theft/respray/sale including scene changes. |
| M-13 | P1 | Checkpoint order | IMPLEMENTED / FOCUSED TESTS | Prerequisite graph, optional/excluded branch states and receipt deduplication. | Editorial review of inferred branch choices and parallel paths. |
| M-14 | P1 | Participation and rewards | IMPLEMENTED / FOCUSED TESTS | Nontravel contribution per participant; saved reward receipts prevent repeat cash/XP on retry. | Multi-client reward acceptance and interrupted faction-reward write. |
| M-15 | P1 | Roll-bound proof | IMPLEMENTED / FOCUSED TESTS | Bound attempt/actor/scene/roll; saved results survive chat-write failure without another roll. | An interruption before a roll result is saved may need GM repair. |
| M-16 | P2 | Graffiti crew work and supplies | PARTIAL | Existing graffiti placement/quality/mark protections preserved; contribution tasks added. | Mission-provisioned crew paint supplies and bespoke crew-size artistic objectives remain open. |
| M-17 | P2 | Radio crew work | PARTIAL | Existing verified station actions preserved; participant support tasks and contribution requirement added. | Not a separate station-action role set tailored to every crew size. |
| M-18 | P2 | GM repair and visibility | IMPLEMENTED / CODE CHECKS | Location, prerequisites, contribution gaps and reviewed override paths surfaced. | Full two-client UI and partial-hit recovery usability. |
| M-19 | P2 | Roster changes | PARTIAL | Requirements preserve completed counts, roster/contribution checks update. | Late-join/leave resizing across every scenario and saved world needs acceptance. |
| M-20 | P2 | Whole mission release gate | IMPLEMENTED / PLAYED THROUGH (rc.2) | 1,074 contract projections and 716 resource preparations, plus run/location/identity rejection tests; rc.2 adds 179 full play-throughs at 1–6 players and on crowded streets, following the sat nav. | Node play-throughs on the real handlers, not a live Foundry campaign. |
| V-01 | P0 | All 160 venue interiors lack shop/service menus | IMPLEMENTED / TESTED | 160 interior profiles and physical counters; 48 non-retail venues have no general retail stock. | Live accessibility and room layout review. |
| V-02 | P1 | Corner shop appears anywhere on every street | IMPLEMENTED / TESTED | Twenty street corners use positioned counters; remote street purchases are rejected. | Actual scene geometry/visibility. |
| V-03 | P1 | Existing LDP shops exposed over whole interior | PARTIAL | New commerce counters enforce room/position checks in core interiors. | Some legacy Local services/rest paths retain older availability semantics. |
| V-04 | P1 | Original flat contains Chicken Palace but no food shop | IMPLEMENTED / STRUCTURAL TESTS | Separate Chicken Palace food counter versus private flat services. | Live interaction and private access. |
| V-05 | P1 | No venue-specific range, hours, permissions or stock | IMPLEMENTED / TESTED | Per-counter stock/services, access, closure and optional fictional opening hours. | Hours are game defaults, not researched real venue hours; barrier enforcement is incomplete. |
| V-06 | P1 | Only dealer offers item buy-back | IMPLEMENTED / TESTED | Canonical-price appraisal/pawn/resell and original-item redemption. | Every resale category and interrupted redemption UI needs live acceptance. |
| V-07 | P1 | Shop purchases not mission-coupled to exact venue | IMPLEMENTED / CODE CHECKS | Purchase events include venue, zone, actor, item and operation identity. | Not every mission has an authored purchase condition; some service early-return events need review. |
| I-01 | P0 | Repeat same outfit to remove Heat | IMPLEMENTED / TESTED | Same worn outfit rejected; shared disguise cooldown and authoritative receipt stop repeated Heat farming. | All disguise-fiction outcomes still require individual acceptance. |
| I-02 | P0 | Item-use GM requests not atomic with consumption | IMPLEMENTED / FAILURE-INJECTION TESTS | Possession/proximity/target checks plus inventory and effect receipts; recovery resumes without another spend. | Foundry has no multi-document atomic transaction; this is resumable staged processing, not ACID atomicity. |
| I-03 | P1 | Cable Ties spend split from GM cuff result | IMPLEMENTED / TESTED | Cable Ties are spent by the authority; reusable cuffs attach to and release the actual target. | All arrest/custody paths, especially legacy NPC actors, require live sign-off. |
| I-04 | P1 | Some special weapons do not honor item text | PARTIAL | Broken Bottle effects, Hand Cannon penalty, nearby Flashbang stun, expiring smoke and timed fire areas added. | Fire spread, blast geometry/line-of-sight and interruption before throwable-roll persistence remain open. |
| I-05 | P1 | Outfit perks do not affect roll or access | PARTIAL | Worn outfits can provide one context-filtered bonus; disguise state/cooldown implemented. | Not every access/impersonation circumstance has a world producer; some need explicit GM context approval. |
| I-06 | P1 | Perks can be selected regardless of written when-clause | PARTIAL | Matching stat alone no longer grants every perk; trusted context tags and recorded GM approval added. | Every written perk circumstance is not independently automated or verified. |
| I-07 | P1 | Many tools are text or generic rolls without effect | PARTIAL | Stateful item actions for locks, restraints, masks, scanner, ID, lights and bicycle locks. | All map doors/padlocks are not authored; scanner/ID/transit/device/job integrations remain incomplete. |
| I-08 | P1 | Vehicle Repair Kit lacks described direct repair | IMPLEMENTED / TESTED | Vehicle Repair Kit performs actual two-Body repair at a safe workshop, consumes a kit and advances time. | Live synthetic vehicle actor and damaged tyre cases. |
| I-09 | P1 | Riot Shield and Motorbike Leathers conditional effects missing | IMPLEMENTED / TESTED | Equipped Riot Shield rejects two-handed weapons; equipped leathers reduce rider crash damage. | Full crash/PIT/ram pathways in Foundry. |
| I-10 | P1 | Bonus effect claims beyond perk die not implemented | IMPLEMENTED / CODE CHECKS | Cabbie tip adjustment, Ghost cooling and Courier late-fee protection wired to relevant systems. | Perk-specific complete job/Heat live scenarios. |
| I-11 | P2 | Item state and actor status lack location-scoped access | PARTIAL | Owner/venue/expiry receipts for passes, bookings, fare credits, hire and documents. | An issued pass is not yet an enforced door barrier; transit credits are not a complete fares/boarding simulation. |
| I-12 | P2 | A&E says four hours but does not advance shared clock | IMPLEMENTED / CODE CHECKS | New A&E counter treatment advances four hours of Watch time. | Legacy service bypass path audit and existing world time/pause behaviour. |
| I-13 | P2 | Drugs possession-specific Heat values not honoured | OPEN | Existing drug use/sale retained. | Police-search possession severity still needs explicit per-drug quantity/Heat integration. |
| I-14 | P1 | Use of First Aid Kit cannot directly heal another PC | IMPLEMENTED / TESTED | First Aid Kit targets a nearby teammate, spends a use and applies the result to that target. | Live target selection and all recovery outcomes. |
| V-08 | P1 | New venue stock is not in item catalogue | PARTIAL | All 67 additions are actual catalogue/compendium entries with functional action classes or intentionally descriptive merchandise. | Not all 67 original proposed workflow promises are implemented; credential issuance differs from access enforcement. |
| V-09 | P1 | Restricted/faction venues need actual unlock checks | IMPLEMENTED / TESTED | Faction/active-job/invitation checks revalidated at counter transaction. | Backstage/private physical movement and bespoke memberships are not fully enforced. |
| V-10 | P2 | NPC retail staff not linked to venue sale | PARTIAL | Counter tokens have staffed/closed state; unstaffed purchases rejected. | Named staffing rosters, shifts and real NPC clerk presence are not fully simulated. |
| V-11 | P1 | Shops have infinite stock and no opening hours | IMPLEMENTED / TESTED | Finite daily stock/reservations and optional campaign-hour closures. | Multi-client restock/contention sign-off; not real-world opening times. |
| V-12 | P1 | Unbounded user-defined prices and wrong-category goods risk | IMPLEMENTED / TESTED | Approved stock/category/access and canonical prices for pawn/dealer sale; document issuing is restricted. | Custom items, all legacy price paths and broad owner-edit permissions need ongoing review. |

## All 179 mission records

The machine-readable checkpoint file contains all 894 exact contracts. Each row gives its 0.5.27 play-through status and the places its checkpoints are at now.

### CH1 - On Your Bike
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (1 arrival, 2 event). **Contacts:** 2; **support tasks:** 6.

**Locations:** Haggerston & London Fields / London Fields Lido; The Arches · Pat's Cycles / Loading Yard; The Arches · Pat's Cycles / Pat's Office.

**Resources:** vehicle targets scale=crewMin2

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### CH2 - The Whippet
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (1 arrival, 1 roll, 1 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Bethnal Green / Broadway Market; The Arches · Pat's Cycles / Loading Yard.

**Resources:** vehicle targets scale=1

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### CH3 - Lights and Sirens
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (3 event, 1 choice). **Contacts:** 3; **support tasks:** 6.

**Locations:** Homerton East & Wick Woodland / Wick Rd; South Hackney & Well Street / Morning Ln; The Arches · Pat's Cycles / Loading Yard; The Arches · Pat's Cycles / Pat's Office; Victoria Park & Hackney Wick / Lea Valley Motors.

**Resources:** vehicle targets scale=1; vehicle transport scale=crew

**Remaining:** Moving van is spawned, but multi-map route/deadline simulation is incomplete.

### m04 - Lea Boys
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (1 event, 2 roll). **Contacts:** 0; **support tasks:** 6.

**Locations:** Lea Bridge Social Rooms / Counting Office; The Arches · Pat's Cycles / Loading Yard; The Arches · Pat's Cycles / Workshop Arch.

**Resources:** npc opponents scale=halfCrew

**Remaining:** Gang/encounter state hooks exist; full authored confrontation needs live acceptance.

### m05 - Chop Chop
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Old Ford & Bow / Bow Breakers Yard; Old Ford & Bow / Roman Block.

**Resources:** vehicle targets scale=halfCrew

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### m06 - Uncle's Errand
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (1 arrival, 3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bethnal Green / Uncle's Cafe; Old Ford & Bow / Roman Block.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### m07 - Hot Wheels
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (4 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Haggerston & London Fields / Kwik Spray Bodyshop; Old Ford & Bow / Bow Breakers Yard.

**Resources:** vehicle targets scale=1

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### m08 - Vale
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (2 roll, 1 choice). **Contacts:** 0; **support tasks:** 6.

**Locations:** Custody Suite / Interview Room; Evering Safe Flat / Landing.

**Resources:** npc vale scale=1

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### m09 - Westfield
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 5 (1 roll, 1 arrival, 3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Westfield Stratford City / Concourse; Your Flat / Back Alley; Your Flat / Living Room.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### m10 - The Marshes
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (1 arrival, 1 race, 1 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Hackney Marshes / Hackney Marshes; Hackney Marshes / Homerton Rd.

**Resources:** vehicle transport scale=crew; vehicle rivals scale=halfCrew

**Remaining:** Race gates/rival movement code exists; complete multi-client race not signed off.

### m11 - Raid
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (1 arrival, 4 event, 1 roll). **Contacts:** 0; **support tasks:** 6.

**Locations:** The Arches · Pat's Cycles / Loading Yard; The Arches · Pat's Cycles / Pat's Office; Your Flat / Living Room.

**Resources:** npc pat scale=1

**Remaining:** Escort transfer is proximity-bound; driving/scene-transition acceptance needed.

### m12 - Big Night
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (1 arrival, 2 roll, 1 choice, 3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Leyton & Ruckholt / Leyton Orient FC; Leyton Orient stadium / Loading Apron; The Arches · Pat's Cycles / Loading Yard; The Arches · Pat's Cycles / Pat's Office.

**Resources:** npc stretch scale=1

**Remaining:** Alternative branch code exists; full finale economics/consequences not signed off.

### CH4 - The Frame Room
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Clifden Crew Garage / Vehicle Bay; Hackney Marshes Centre / Foyer; Oddments Lockup / Invoice Office.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Recoverable bike fleet still needs bespoke resource/workflow authoring.

### CH5 - The Borrowed Winner
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 6; **support tasks:** 6.

**Locations:** Goldsmiths Riding Workshop / Club Office; Kingsland Courier Arch / Dispatch Hatch; Lee Valley VeloPark / Foyer; Lee Valley VeloPark / Training Hall; Leyton Orient stadium / Foyer; The Kenton / Public Bar.

**Resources:** vehicle prize-bike scale=1

**Remaining:** Unique prize bike and parcel representations need reconciliation.

### CH6 - The Shop That Was Already Sold
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Clapton Union Rooms / Entrance Hall; Essex Dry Goods / Shop Front; Orchard Lease Office / Front Counter; Stoke Newington Town Hall / Lobby.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### CH7 - Who Runs the Arches
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (5 roll, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Lea Bridge Social Rooms / Boxing Room; Lea Bridge Social Rooms / Counting Office; MOTH Club / Entrance Foyer; Roman Exchange / Front Stall; Tern Wharf Dispatch / Front Office; The Arches · Pat's Cycles / Pat's Office.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### CH8 - Keys to the Arches
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (2 choice, 1 roll, 2 arrival, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Chainring Storehouse / Office; Clifden Crew Garage / Vehicle Bay; Glasshouse Saleroom / Foyer; Meridian Sales Pavilion / Account Office; Meridian Sales Pavilion / Welcome Desk.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### AD1 - Borrowed Speakers
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (2 event, 2 roll). **Contacts:** 3; **support tasks:** 6.

**Locations:** Backspin Studio / Live Room; Cafe OTO / Entrance Bar; Queensbridge Sound Store / Speaker Hall; Round Chapel / Event Hall.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### AD2 - The Missing Hour
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (1 dialogue, 3 roll, 1 choice, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Abney Books / Shop Front; Englefield Listening Flat / Record Cupboard; Rio Cinema / Foyer; Signature Brew Haggerston / Taproom.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### AD3 - Two Stages One Van
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Hoxton Hall / Foyer; North Echo Rehearsal Rooms / Reception; The Lauriston / Public Bar; Union Chapel / Entrance Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Full one-van/two-stages crew logistics remains incomplete.

### AD4 - Pay to Play
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (1 dialogue, 3 roll, 1 choice, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Backspin Studio / Record-shop Front; Lea Bridge Social Rooms / Counting Office; The Eagle / Public Bar; The Shacklewell Arms / Entrance Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### AD5 - Somebody Else's Voice
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Grow Hackney / Entrance Bar; Silt Listening Bunker / Tape Cupboard; Wallis Tape Rooms / Lobby.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### AD6 - Open Channel Loud Mouths
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Newington Green Meeting House / Porch; Sadler's Wells East / Foyer; The Old Church / Porch.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### AD7 - Nia Sets the Terms
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 5 (1 dialogue, 3 roll, 1 choice). **Contacts:** 4; **support tasks:** 6.

**Locations:** Approach Recovery Rooms / Reception; Evering Safe Flat / Landing; Willow Cabin / Porch.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### AD8 - The Whole City Listening
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Bridge Nine Broadcast Garage / Equipment Store; London Stadium / Foyer; Round Chapel / Event Hall; Round Chapel / Foyer; The View Tube / Counter.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LB1 - Rent in Arrears
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Lea Bridge Social Rooms / Counting Office; Shepherdess Coin Rooms / Public Room; The Gun / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LB2 - Stretch Wants His Cut
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Old Ford & Bow / Bow Breakers Yard; Orient Night Shed / Cold Cage; Orient Night Shed / Dispatch Window; The Princess of Wales / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LB3 - The Larch Job
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Blue Hour Basement / Entrance Bar; Larch Cold Store / Reception; The Crooked Billet / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LB4 - Halo With Teeth
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Approach Recovery Rooms / Reception; Homerton A&E / Triage; Larch Cold Store / Reception; The Spread Eagle / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LB5 - The Boy Who Kept Receipts
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (1 dialogue, 2 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Custody Suite / Interview Room; The Coach and Horses / Public Bar; The Red Lion / Public Bar; Well Street Loan Office / Front Counter.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LB6 - Terms From Above
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** De Beauvoir Block / Reception; North Park Hospitality Lodge / Foyer; Quayline Records Suite / Reception.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LB7 - Who Speaks for the Lea Boys
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Hackney Marshes North Pavilion / Foyer; Lea Bridge Social Rooms / Counting Office; MOTH Club / Entrance Foyer; York Hall / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LB8 - The Price of a Patch
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (1 dialogue, 2 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Carpenters Breakfast Club / Dining Room; Clapton Union Rooms / Entrance Hall; Meridian Sales Pavilion / Welcome Desk; Roman Exchange / Front Stall.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### VC1 - The Sound Went Missing
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Blue Hour Basement / Entrance Bar; Howling Hops Tank Bar / Taproom; Queensbridge Sound Store / Hire Counter.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### VC2 - No Guest List for the Missing
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (3 roll, 1 dialogue, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Dalston Superstore / Entrance Foyer; Oslo Hackney / Entrance Bar; Theatre Royal Stratford East / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### VC3 - Cash Before Curtain
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (5 roll, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Clapton Country Club / Foyer; Hackney Empire / Foyer; Leyton Great Hall / Lobby; The Eagle / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### VC4 - The Last Good Batch
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Approach Recovery Rooms / Reception; Larch Cold Store / Reception; Number 90 / Entrance Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### VC5 - A Set for Nobody
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Englefield Listening Flat / Record Cupboard; North Echo Rehearsal Rooms / Reception; The Shacklewell Arms / Entrance Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### VC6 - The Sponsor Behind the Sponsor
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (3 roll, 1 dialogue, 1 choice, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** North Park Hospitality Lodge / Foyer; The Baring / Public Bar; The Empress / Public Bar; The Stratford hotel / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### VC7 - Last Dance Before the Sale
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** 3 Mills Studios / Reception; ABBA Arena / Foyer; EartH / Entrance Bar; Sadler's Wells East / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### VC8 - Who Owns the Night
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Blue Hour Basement / Entrance Bar; Bridge Nine Broadcast Garage / Equipment Store; London Stadium / Foyer; Marshgate Delivery Depot / Reception.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TU1 - The Wrong Case
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Hackney City Farm / Reception; Kingsland Courier Arch / Dispatch Hatch; Tern Wharf Dispatch / Front Office.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TU2 - The Van and the Debt
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (3 roll, 1 dialogue, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Barge East / Deck Saloon; Barge East / Mooring Landing; Chainring Storehouse / Office; Old Ford & Bow / Bow Breakers Yard.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Debt van scenario needs fully bound recovery/escort logic.

### TU3 - The Driver Who Wasn't There
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** New Spitalfields Market administration / Reception; Orient Way railway depot / Reception; The Adam and Eve / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TU4 - The Route Book
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (2 roll, 1 arrival, 1 dialogue, 1 choice, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** HBC Community Centre / Reception; Orient Night Shed / Dispatch Window; The Duke of Wellington / Public Bar; The Narrowboat / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TU5 - Not the Person in the Photograph
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Bethnal Green Library / Entrance; Hub67 / Reception; Lee Valley Hockey and Tennis Centre / Foyer; London Aquatics Centre / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TU6 - The Contract That Eats the Route
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Meridian Sales Pavilion / Welcome Desk; Temple Mills International Depot / Reception; The Baring / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TU7 - Four Loads One Customer
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Marshgate Delivery Depot / Reception; New Spitalfields Market produce hall / Trade Entrance; The View Tube / Counter.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TU8 - The City Still Has to Move
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 5 (2 roll, 2 event, 1 choice). **Contacts:** 3; **support tasks:** 6.

**Locations:** Bridge Nine Broadcast Garage / Van Bay; Homerton A&E / Triage; Pudding Mill Lane DLR station / Street Entrance; Tern Wharf Dispatch / Dispatch Room; Tern Wharf Dispatch / Front Office.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### GE1 - The Wrong Provenance
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 5 (3 roll, 1 arrival, 1 choice). **Contacts:** 3; **support tasks:** 6.

**Locations:** Glasshouse Saleroom / Foyer; Lee Valley VeloPark / Foyer; The Highbury Barn Tavern / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### GE2 - The Coat With the Appointment
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Rosemary Branch Theatre / Foyer; Sebright Arms / Entrance Bar; Sutton House / Entrance Hall; The Scolt Head / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### GE3 - The House Clearance
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Estorick Collection / Foyer; Split Second Archive / Catalogue Room; St Mary's New Church / Porch.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### GE4 - Loaned and Lost
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Glasshouse Saleroom / Foyer; The Trampery Fish Island Village / Reception; Young V&A / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### GE5 - A Picture of the Wrong Night
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (3 roll, 1 dialogue, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Quayline Records Suite / Reception; The Stratford hotel / Foyer; Victoria Miro / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### GE6 - An Auction for Empty Homes
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (1 dialogue, 2 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Essex Dry Goods / Shop Front; Glasshouse Saleroom / Foyer; Leyton Great Hall / Lobby; Orchard Lease Office / Front Counter.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### GE7 - The Collection That Can Speak
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Forman's Fish Island / Foyer; Nunnery Gallery / Foyer; The House Mill / Entrance; Wallis Tape Rooms / Lobby.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### GE8 - What Is Worth Keeping
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 2; **support tasks:** 6.

**Locations:** Glasshouse Saleroom / Foyer; Split Second Archive / Catalogue Room; V&A East Museum / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BB1 - A Small Balance
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (1 dialogue, 3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Shepherdess Coin Rooms / Public Room; The Auld Shillelagh / Public Bar; The Leyton Engineer / Public Bar; Third Half Bookroom / Front Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BB2 - The Wrong Winner
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Hackney Marshes North Pavilion / Foyer; Leyton Orient Supporters Club / Entrance Foyer; Score Leisure Centre / Foyer; The Elderfield / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BB3 - Cash on the Guest List
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Blue Hour Basement / Entrance Bar; De Beauvoir Block / Reception; The Alwyne Castle / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BB4 - A Result Before the Race
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** St Paul's West Hackney / Porch; The Leyton Star / Public Bar; Third Half Bookroom / Betting Room; Timber Lodge / Counter.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BB5 - Your Name in Someone Else's Book
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Custody Suite / Interview Room; De Beauvoir Deli / Shop Front; Well Street Loan Office / Front Counter.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BB6 - Land on Credit
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (2 roll, 1 dialogue, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Meridian Sales Pavilion / Welcome Desk; Quayline Records Suite / Reception; The Talbot / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BB7 - The Final Account
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Marshgate Delivery Depot / Reception; The House Mill / Entrance; Third Half Bookroom / Front Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BB8 - The House Changes Hands
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (2 roll, 1 arrival, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** North Park Hospitality Lodge / Foyer; The Rose and Crown / Public Bar; Third Half Bookroom / Front Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### NM1 - Stall Seventeen
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 2; **support tasks:** 6.

**Locations:** New Spitalfields Market produce hall / Trade Entrance; Roman Exchange / Front Stall; The Princess of Wales / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### NM2 - One Box Two Buyers
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (2 roll, 1 dialogue, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Queensbridge Sound Store / Hire Counter; Vortex Jazz Club / Entrance Bar; Wilton Way Deli and Wines / Shop Front.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### NM3 - Everything Must Go
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (2 roll, 1 dialogue, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Clapton Library / Entrance; Oddments Lockup / Invoice Office; The Canonbury Tavern / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### NM4 - Protection by Post
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** The Crooked Billet / Public Bar; The Lord Morpeth / Public Bar; Wickside Print Shop / Shop Counter.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### NM5 - The Borrowed Exhibition
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (1 dialogue, 1 roll, 1 arrival, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Sutton House / Entrance Hall; The Approach Tavern and Gallery / Foyer; The Trampery Fish Island Village / Reception.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### NM6 - The Market That Sold Itself
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Carpenters Breakfast Club / Dining Room; Essex Dry Goods / Shop Front; St Paul Old Ford / Porch.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### NM7 - A Night to Trade
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** CRATE Brewery / Taproom; Clissold House / Entrance Hall; Rio Cinema / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### NM8 - Who Gets a Place at the Table
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Roman Exchange / Front Stall; Saint Martha House / Advice Room; V&A East Museum / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BM1 - A Meal and a Receipt
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (2 event, 1 roll, 1 choice). **Contacts:** 2; **support tasks:** 6.

**Locations:** HBC Community Centre / Reception; Saint Martha House / Advice Room; Your Flat / Living Room.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BM2 - Benefit Night Rain Check
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Hackney Empire / Foyer; Haggerston Community Centre / Reception; Leyton Jubilee Park pavilion / Foyer; St Paul's West Hackney / Porch.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BM3 - The Signatures Upstairs
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Dalston CLR James Library / Entrance; Roman Rooms Printworks / Front Counter; St John of Jerusalem / Porch.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BM4 - After the Batch
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Approach Recovery Rooms / Reception; Homerton A&E / Triage; The Spread Eagle / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BM5 - The Homes on the List
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Carpenters Breakfast Club / Dining Room; Clapton Union Rooms / Entrance Hall; White Post Workers Rooms / Entrance Hall.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BM6 - Who Can Promise a Home
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (1 dialogue, 2 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Essex Dry Goods / Shop Front; Hackney Town Hall / Lobby; Newington Green Meeting House / Porch.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BM7 - A Witness Chooses a Door
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 5 (2 roll, 1 dialogue, 2 choice). **Contacts:** 4; **support tasks:** 6.

**Locations:** Evering Safe Flat / Landing; St Mary Bow Church / Porch; Willow Cabin / Porch; Your Flat / Living Room.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### BM8 - The Neighbourhood Gets a Vote
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Carpenters Breakfast Club / Dining Room; St John of Jerusalem / Porch; Stoke Newington Town Hall / Lobby; V&A East Museum / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LD1 - The Bait Bike
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (3 roll, 1 choice). **Contacts:** 2; **support tasks:** 6.

**Locations:** Custody Suite / Interview Room; Lantern Case Flat / Interview Room; The Duke of Richmond / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LD2 - The Uniform in the Photograph
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (1 dialogue, 3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Custody Suite / Interview Room; East Cross Security Compound / Reception; The Castle Cinema / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LD3 - A Report With No Visit
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Hackney Town Hall / Lobby; Highbury Leisure Centre / Foyer; New Spitalfields Market administration / Reception; UCL East Marshgate / Public Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LD4 - Someone Else's Property
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (2 roll, 1 dialogue, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Clapton Library / Entrance; Custody Suite / Interview Room; Forman's Fish Island / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LD5 - The Person Behind the File
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (1 dialogue, 2 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Approach Recovery Rooms / Reception; Homerton A&E / Triage; Pudding Mill Lane DLR station / Street Entrance.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LD6 - The Inspector's Other Employer
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Lantern Case Flat / Interview Room; The Stratford hotel / Foyer; Victoria Miro / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LD7 - Four Notices Before Midnight
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** East Cross Security Compound / Reception; Marshgate Delivery Depot / Reception; Meridian Sales Pavilion / Welcome Desk.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### LD8 - A Case That Survives Its Witnesses
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 2; **support tasks:** 6.

**Locations:** Custody Suite / Interview Room; Hackney Town Hall / Lobby; Lantern Case Flat / Interview Room.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### MR1 - The Missing Survey Case
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 5 (1 roll, 1 dialogue, 2 event, 1 choice). **Contacts:** 3; **support tasks:** 6.

**Locations:** East Cross Security Compound / Reception; Highbury Leisure Centre / Foyer; People's Park Tavern / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### MR2 - The Model Apartment
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Estorick Collection / Foyer; Oddments Lockup / Invoice Office; Westfield Stratford City / Customer Desk.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### MR3 - An Invoice for a Driver
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** East Cross Security Compound / Reception; Orient Way railway depot / Reception; The De Beauvoir Arms / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### MR4 - The Report and the Door
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (2 roll, 2 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Orchard Lease Office / Front Counter; Roman Rooms Printworks / Front Counter; Wickside Print Shop / Shop Counter.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### MR5 - Vacant on Paper
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Carpenters Breakfast Club / Dining Room; Essex Dry Goods / Shop Front; White Post Workers Rooms / Entrance Hall.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### MR6 - Buy the Frequency
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (2 roll, 1 dialogue, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Backspin Studio / Record-shop Front; Newington Green Meeting House / Porch; Signorelli at Stratford Cross / Counter.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### MR7 - The Quiet Hour
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (3 roll, 2 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** East Cross Security Compound / Reception; London Stadium / Foyer; Marshgate Delivery Depot / Reception; Meridian Sales Pavilion / Welcome Desk.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### MR8 - The City on the Brochure
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Carpenters Breakfast Club / Dining Room; Meridian Sales Pavilion / Welcome Desk; Quayline Records Suite / Reception; Stoke Newington Town Hall / Lobby.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RT1 - The Empty Slot
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (1 dialogue, 3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Abney Park Chapel / Porch; Dalston CLR James Library / Entrance; Split Second Archive / Catalogue Room; St Peter de Beauvoir / Porch.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RT2 - The Watch After Midnight
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (2 roll, 2 dialogue, 1 choice, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Clapton Library / Entrance; Hub67 / Reception; The Clapton Hart / Public Bar; The Prince Arthur / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RT3 - A Photograph Without a Caption
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Museum of the Home / Foyer; Sutton House / Entrance Hall; The Wenlock Arms / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RT4 - The Night That Repeated
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 5; **support tasks:** 6.

**Locations:** Grow Hackney / Entrance Bar; Hackney Picturehouse / Foyer; Silt Listening Bunker / Tape Cupboard; Wallis Tape Rooms / Lobby.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RT5 - Six Addresses Before the Trouble
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Clapton Union Rooms / Entrance Hall; Orchard Lease Office / Front Counter; Roman Rooms Printworks / Front Counter.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RT6 - The Woman Who Chose to Vanish
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (2 roll, 1 dialogue, 1 choice). **Contacts:** 3; **support tasks:** 6.

**Locations:** Evering Safe Flat / Landing; Homerton A&E / Triage; Willow Cabin / Porch.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RT7 - Who Holds the Original
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 2; **support tasks:** 6.

**Locations:** Quayline Records Suite / Reception; Split Second Archive / Catalogue Room; V&A East Museum / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RT8 - A Record of What Happened
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 7 (4 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Bridge Nine Broadcast Garage / Equipment Store; Hackney Town Hall / Lobby; Split Second Archive / Catalogue Room; The House Mill / Entrance.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S01 - The Voice at the Book Club
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** St Mary's New Church / Porch; The Old Church / Porch; The Rose and Crown / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S02 - The Alarm Before the Song
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Abney Books / Shop Front; Abney Park Chapel / Porch; The Shacklewell Arms / Entrance Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S03 - The Wrong Brother on the Boat
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (1 dialogue, 2 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** The Clapton Hart / Public Bar; The Elderfield / Public Bar; The Princess of Wales / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S04 - The Dog at the Fundraiser
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 8 (3 roll, 1 choice, 4 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Hackney Marshes North Pavilion / Foyer; Leyton Jubilee Park pavilion / Club Room; Leyton Jubilee Park pavilion / Foyer; New Spitalfields Market produce hall / Trade Entrance.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S05 - The Missing Mascot
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (2 roll, 1 arrival, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Leyton Orient Supporters Club / Entrance Foyer; Leyton Orient stadium / Foyer; The Coach and Horses / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S06 - The Cat in the Catalogue
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Estorick Collection / Foyer; Newington Green Meeting House / Porch; The Canonbury Tavern / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S07 - The Silent Set
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Cafe OTO / Entrance Bar; Dalston Superstore / Entrance Foyer; Vortex Jazz Club / Entrance Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S08 - The Chicken Palace Key
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (2 roll, 1 dialogue, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Oslo Hackney / Entrance Bar; The Castle Cinema / Foyer; Your Flat / Living Room.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S09 - The Projector Belongs to Both of Us
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** HBC Community Centre / Reception; Hub67 / Reception; The Kenton / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S10 - The Sponsor Who Never Arrived
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (1 dialogue, 2 roll, 1 choice). **Contacts:** 3; **support tasks:** 6.

**Locations:** Lee Valley Hockey and Tennis Centre / Foyer; The Leyton Star / Public Bar; Timber Lodge / Counter.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S11 - The Painting That Keeps Coming Back
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** De Beauvoir Deli / Shop Front; The De Beauvoir Arms / Public Bar; The Scolt Head / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S12 - The Wedding Dubplate
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Englefield Listening Flat / Record Cupboard; The Prince Arthur / Public Bar; Wilton Way Deli and Wines / Shop Front.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S13 - Big Sal on the Poster
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (4 roll, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** The Gun / Public Bar; The Lauriston / Public Bar; Wickside Print Shop / Shop Counter.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S14 - The Passenger Paid Twice
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (2 roll, 1 arrival, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Barge East / Deck Saloon; Grow Hackney / Entrance Bar; People's Park Tavern / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S15 - The Lucky Jacket
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Theatre Royal Stratford East / Foyer; V&A East Museum / Foyer; Westfield Stratford City / Customer Desk.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S16 - The Cabinet and the Debt
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Rosemary Branch Theatre / Foyer; Shepherdess Coin Rooms / Public Room; The Wenlock Arms / Public Bar.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S17 - The Riding Contest
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Goldsmiths Riding Workshop / Club Office; Haggerston Community Centre / Reception; Signature Brew Haggerston / Taproom.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S18 - The Funeral for a Living Cabbie
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (1 dialogue, 3 roll, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** Bethnal Green Library / Entrance; St John on Bethnal Green / Porch; Viktor Wynd Museum / Foyer.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S19 - The Bell in the Wrong Crate
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (3 roll, 1 choice, 2 event). **Contacts:** 3; **support tasks:** 6.

**Locations:** Forman's Fish Island / Foyer; Nunnery Gallery / Foyer; Roman Exchange / Front Stall.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### S20 - The Film with the Missing Van
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (2 roll, 1 dialogue, 1 choice, 2 event). **Contacts:** 4; **support tasks:** 6.

**Locations:** 3 Mills Studios / Reception; Marshgate Delivery Depot / Reception; Pudding Mill Lane DLR station / Street Entrance.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-INTRO-01 - First Can
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 1 (1 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Hackney Central & Homerton / Homerton High St 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-INTRO-02 - Walls Have Ears
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 2 (2 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Haggerston & London Fields / Haggerston Rd 1; Haggerston Park & Hackney Rd / Queensbridge Rd 1.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-INTRO-03 - The Last Bus Home
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 2 (2 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Haggerston & London Fields / Lansdowne Dr & Richmond; Victoria Park & Hackney Wick / East Cross Route (A12) 4.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-INTRO-04 - A Name That Travels
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bow Flyover & Mill Meads / East Cross Route (A12) 3; Clapton / Lea Bridge Rd 4; Stratford & the Stadium / Carpenters Rd 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-CH-01 - The Arches Signal
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 2 (2 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Hackney Central & Homerton / Homerton High St 2; Hackney Central & Homerton / Homerton High St 4.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-CH-02 - Spokes Across Hackney
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Clapton / Lea Bridge Rd 4; Highbury & Albion Rd / Albion Rd 1; Old Ford & Bow / Roman Rd 1.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-CH-03 - Pat Owns the Route
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (4 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Hackney Central & Homerton / Clarence Rd; Hackney Marshes / Orient Way 3; Victoria Park & Hackney Wick / East Cross Route (A12) 4.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-AD-01 - Get the Signal Out
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 2 (2 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Dalston / Amhurst Rd 1; Haggerston Park & Hackney Rd / Queensbridge Rd 1.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-AD-02 - The Frequency Run
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Haggerston Park & Hackney Rd / Hoxton St 2; Stoke Newington & Shacklewell / Amhurst Rd 3; Stratford & the Stadium / Carpenters Rd 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-AD-03 - No Dead Air Tonight
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (4 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bow Flyover & Mill Meads / Marshgate Lane 2; Hackney Marshes / Orient Way 2; Stratford & the Stadium / Carpenters Rd 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-LB-01 - Moth Leaves a Sign
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 2 (2 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Clapton / Lea Bridge Rd 4; Leyton & Ruckholt / Orient Way & Ruckholt.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-LB-02 - Reeds by the Water
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Clapton / Lea Bridge Rd 4; Hoxton West & the Canal / Eagle Wharf Rd 2; Victoria Park & Hackney Wick / East Cross Route (A12) 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-LB-03 - Stretch Out the Borough
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (4 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Hackney Marshes / Millfields Rd; Homerton East & Wick Woodland / East Cross Route (A12) 6; Olympic Park North / East Cross Route (A12) 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-VC-01 - Tonight Only
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 2 (2 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Dalston / Kingsland High & Balls Pond; Hackney Central & Homerton / Lower Clapton & Amhurst.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-VC-02 - The Velvet Trail
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Canonbury & Newington Green / Highbury Grove 2; Dalston / Dalston Ln 1; Hoxton West & the Canal / East Rd 1.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-VC-03 - Full House Full City
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (4 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bow Flyover & Mill Meads / East Cross Route (A12) 3; Haggerston & London Fields / Lansdowne Dr & Richmond; Stratford & the Stadium / Westfield Ave 4.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-TU-01 - Tern Marks the Drop
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 2 (2 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Haggerston & London Fields / Haggerston Rd 1; Hoxton West & the Canal / Eagle Wharf Rd 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-TU-02 - Under the Bridges
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Clapton / Lea Bridge Rd 4; Old Ford & Bow / Old Ford Rd 2; Victoria Park & Hackney Wick / East Cross Route (A12) 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-TU-03 - Last Van Standing
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (4 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bow Flyover & Mill Meads / Marshgate Lane 1; Hackney Marshes / Orient Way 3; Stratford & the Stadium / Carpenters Rd 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-GE-01 - Wren Signs His Work
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 2 (2 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Canonbury & Newington Green / Canonbury & St Paul's; Canonbury & Newington Green / Highbury Grove 1.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-GE-02 - The Missing Shard
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** De Beauvoir / De Beauvoir Rd 2; Haggerston Park & Hackney Rd / Queensbridge Rd 1; Highbury & Albion Rd / Highbury Park 4.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-GE-03 - The Prism Line
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (4 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bow Flyover & Mill Meads / East Cross Route (A12) 3; Olympic Park North / East Cross Route (A12) 2; Stratford & the Stadium / Westfield Ave 4.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-BB-01 - Odds on the Wall
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 2 (2 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Hoxton West & the Canal / East Rd 1; Leyton & Ruckholt / East Cross Route (A12) 5.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-BB-02 - Across the Book
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** De Beauvoir / De Beauvoir & Englefield; Hackney Marshes / Millfields Rd; Leyton & Ruckholt / High Rd Leyton 1.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-BB-03 - The Bookies Countermark
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (4 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Clapton / Lea Bridge Rd 4; Hackney Central & Homerton / Lower Clapton & Amhurst; Homerton East & Wick Woodland / East Cross Route (A12) 6.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-NM-01 - Follow the Lantern
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 2 (2 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Hackney Marshes / Homerton Rd; Old Ford & Bow / Old Ford Rd 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-NM-02 - Two Buyers No Map
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bethnal Green / Approach Rd 1; Haggerston Park & Hackney Rd / Queensbridge Rd 1; Leyton & Ruckholt / Orient Way & Ruckholt.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-NM-03 - Market After Midnight
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (4 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bow Flyover & Mill Meads / Marshgate Lane 1; Hackney Marshes / Orient Way 3; Victoria Park & Hackney Wick / East Cross Route (A12) 4.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-BM-01 - Mutual Aid Mural
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 2 (2 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bethnal Green / Sewardstone & Old Ford; Homerton East & Wick Woodland / Waterden Rd.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-BM-02 - A Different Kind of Notice
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Clapton / Northwold & Upper Clapton; South Hackney & Well Street / Lauriston Rd 1; Stoke Newington & Shacklewell / Stoke Newington Church St.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-BM-03 - A Borough Remembers
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (4 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Canonbury & Newington Green / Highbury Grove 2; De Beauvoir / De Beauvoir & Englefield; Hackney Central & Homerton / Clarence Rd.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-LD-01 - The Lantern Code
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 2 (2 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bethnal Green / Approach Rd 1; De Beauvoir / De Beauvoir Rd 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-LD-02 - Between the Lines
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Hackney Central & Homerton / Homerton High St 4; South Hackney & Well Street / Mare & Richmond; Stoke Newington & Shacklewell / Amhurst Rd 3.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-LD-03 - A Light in the Wrong Place
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (4 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bow Flyover & Mill Meads / Marshgate Lane 2; Hackney Marshes / Orient Way 2; Stratford & the Stadium / Carpenters Rd 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-MR-01 - Meridian Says Welcome
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 2 (2 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Highbury & Albion Rd / Highbury Park 4; Stratford & the Stadium / Westfield Ave 4.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-MR-02 - New Boundary New Banner
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Canonbury & Newington Green / Highbury Grove 1; Old Ford & Bow / Old Ford Rd 1; South Hackney & Well Street / Mare & Richmond.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-MR-03 - The Golden Route
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (4 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bow Flyover & Mill Meads / East Cross Route (A12) 3; Homerton East & Wick Woodland / East Cross Route (A12) 6; Olympic Park North / East Cross Route (A12) 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-RT-01 - The Red Thread Begins
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 2 (2 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** De Beauvoir / De Beauvoir Rd 2; Stoke Newington & Shacklewell / Stoke Newington Church St.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-RT-02 - Stitches on the Map
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 3 (3 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bethnal Green / Approach Rd 1; Canonbury & Newington Green / Canonbury & St Paul's; Haggerston & London Fields / Downham Rd 1.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-RT-03 - The Thread Cannot Break
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 4 (4 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bow Flyover & Mill Meads / East Cross Route (A12) 3; Hackney Marshes / Orient Way 3; Hoxton West & the Canal / Eagle Wharf Rd 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-CITY-01 - From Lea to Bow
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (6 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bow Flyover & Mill Meads / East Cross Route (A12) 3; Dalston / Amhurst Rd 1; Highbury & Albion Rd / Albion Rd 1; Stratford & the Stadium / Carpenters Rd 2; Victoria Park & Hackney Wick / East Cross Route (A12) 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### TG-CITY-02 - Nothing Stays Painted
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 6 (6 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bethnal Green / Approach Rd 1; Clapton / Lea Bridge Rd 4; De Beauvoir / De Beauvoir Rd 2; Hackney Marshes / Orient Way 3; Hoxton West & the Canal / Eagle Wharf Rd 2.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RW-POINT-01 - Point Blank: Spread the Signal
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 1 (1 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Hoxton West & the Canal / Eagle Wharf Block.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RW-POINT-02 - Point Blank: Hold the Frequency
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 1 (1 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Hoxton West & the Canal / Eagle Wharf Block.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RW-RUDEF-01 - Rude FM: Spread the Signal
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 1 (1 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Haggerston & London Fields / Dalston Block.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RW-RUDEF-02 - Rude FM: Hold the Frequency
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 1 (1 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Haggerston & London Fields / Dalston Block.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RW-VISIO-01 - Vision Radio UK: Spread the Signal
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 1 (1 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Dalston / Shacklewell Block 3.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RW-VISIO-02 - Vision Radio UK: Hold the Frequency
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 1 (1 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Dalston / Shacklewell Block 3.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RW-FLEXF-01 - Flex FM: Spread the Signal
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 1 (1 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Hackney Central & Homerton / Clarence Block.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RW-FLEXF-02 - Flex FM: Hold the Frequency
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 1 (1 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Hackney Central & Homerton / Clarence Block.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RW-SUPRE-01 - Supreme FM: Spread the Signal
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 1 (1 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bethnal Green / Broadway Market.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RW-SUPRE-02 - Supreme FM: Hold the Frequency
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 1 (1 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bethnal Green / Broadway Market.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RW-RADIO-01 - Radio Caroline: Spread the Signal
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 1 (1 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bow Flyover & Mill Meads / Marshgate Block.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

### RW-RADIO-02 - Radio Caroline: Hold the Frequency
**Status:** Played through end to end by the 0.5.27 simulator at 1–6 players and on crowded streets (sat nav, then the action, then the tick); live Foundry sign-off still pending. **Checkpoints:** 1 (1 event). **Contacts:** 0; **support tasks:** 6.

**Locations:** Bow Flyover & Mill Meads / Marshgate Block.

**Resources:** No bespoke vehicle/person resource group; inspect the separate cargo/contact definitions.

**Remaining:** Review each concrete encounter, branch consequence, resource need and route against the narrative; generic interaction contracts do not certify the complete scenario.

## All 160 venue records

| Code | Venue | Type | Retail | Profile keys | Status / remaining |
|---|---|---|---|---|---|
| BF1 | ABBA Arena | theatre | Yes | venue-bf1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BF2 | The View Tube | cafe | Yes | venue-bf2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BF3 | The House Mill | mill | No | venue-bf3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BF4 | 3 Mills Studios | studio | Conditional | venue-bf4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BF5 | UCL East Marshgate | rooms | No | venue-bf5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BF6 | Pudding Mill Lane DLR station | station | Conditional | venue-bf6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BF7 | Marshgate Delivery Depot | depot | No | venue-bf7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BF8 | Carpenters Breakfast Club | rooms | Yes | venue-bf8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BG1 | Young V&A | gallery | Conditional | venue-bg1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BG2 | The Approach Tavern and Gallery | gallery | Conditional | venue-bg2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BG3 | York Hall | sports | Conditional | venue-bg3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BG4 | St John on Bethnal Green | church | No | venue-bg4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BG5 | Bethnal Green Library | library | No | venue-bg5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BG6 | Viktor Wynd Museum | gallery | Conditional | venue-bg6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BG7 | Lantern Case Flat | flat | No | venue-bg7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| BG8 | Approach Recovery Rooms | rooms | No | venue-bg8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CG1 | Newington Green Meeting House | church | No | venue-cg1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CG2 | Estorick Collection | gallery | Conditional | venue-cg2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CG3 | The Canonbury Tavern | pub | Yes | venue-cg3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CG4 | Union Chapel | music | Yes | venue-cg4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CG5 | The Alwyne Castle | pub | Yes | venue-cg5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CG6 | Highbury Leisure Centre | sports | Conditional | venue-cg6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CG7 | Glasshouse Saleroom | gallery | Conditional | venue-cg7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CG8 | Quayline Records Suite | rooms | No | venue-cg8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CL1 | Clapton Library | library | No | venue-cl1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CL2 | The Princess of Wales | pub | Yes | venue-cl2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CL3 | The Crooked Billet | pub | Yes | venue-cl3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CL4 | The Clapton Hart | pub | Yes | venue-cl4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CL5 | Clapton Country Club | rooms | Conditional | venue-cl5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CL6 | The Elderfield | pub | Yes | venue-cl6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CL7 | Lea Bridge Social Rooms | money | No | venue-cl7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| CL8 | Clapton Union Rooms | flat | No | venue-cl8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DA1 | Rio Cinema | cinema | Yes | venue-da1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DA2 | Cafe OTO | music | Yes | venue-da2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DA3 | Dalston Superstore | club | Yes | venue-da3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DA4 | Vortex Jazz Club | music | Yes | venue-da4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DA5 | EartH | music | Yes | venue-da5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DA6 | Dalston CLR James Library | library | No | venue-da6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DA7 | Backspin Studio | studio | Conditional | venue-da7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DA8 | Blue Hour Basement | club | Yes | venue-da8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DB1 | St Peter de Beauvoir | church | No | venue-db1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DB2 | De Beauvoir Deli | shop | Yes | venue-db2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DB3 | De Beauvoir Block | rooms | No | venue-db3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DB4 | The De Beauvoir Arms | pub | Yes | venue-db4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DB5 | The Scolt Head | pub | Yes | venue-db5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DB6 | The Talbot | pub | Yes | venue-db6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DB7 | Split Second Archive | rooms | No | venue-db7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| DB8 | Essex Dry Goods | depot | Conditional | venue-db8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HB1 | Clissold House | rooms | No | venue-hb1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HB2 | The Old Church | church | No | venue-hb2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HB3 | St Mary's New Church | church | No | venue-hb3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HB4 | The Highbury Barn Tavern | pub | Yes | venue-hb4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HB5 | Stoke Newington Town Hall | civic | No | venue-hb5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HB6 | The Rose and Crown | pub | Yes | venue-hb6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HB7 | Oddments Lockup | depot | No | venue-hb7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HB8 | Orchard Lease Office | rooms | No | venue-hb8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HC1 | Hackney Empire | theatre | Yes | venue-hc1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HC2 | Round Chapel | rooms | Conditional | venue-hc2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HC3 | Sutton House | rooms | No | venue-hc3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HC4 | Oslo Hackney | music | Yes | venue-hc4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HC5 | MOTH Club | club | Yes | venue-hc5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HC6 | The Castle Cinema | cinema | Yes | venue-hc6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HC7 | Chainring Storehouse | rooms | Conditional | venue-hc7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HC8 | Clifden Crew Garage | rooms | Conditional | venue-hc8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HM1 | Hackney Marshes North Pavilion | sports | Conditional | venue-hm1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HM2 | New Spitalfields Market produce hall | depot | Conditional | venue-hm2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HM3 | New Spitalfields Market administration | rooms | No | venue-hm3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HM4 | Orient Way railway depot | depot | No | venue-hm4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HM5 | Temple Mills International Depot | depot | No | venue-hm5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HM6 | Leyton Jubilee Park pavilion | sports | Conditional | venue-hm6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HM7 | Orient Night Shed | depot | No | venue-hm7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HM8 | Silt Listening Bunker | studio | No | venue-hm8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HR1 | Museum of the Home | gallery | Conditional | venue-hr1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HR2 | Hoxton Hall | theatre | Yes | venue-hr2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HR3 | Signature Brew Haggerston | brewery | Yes | venue-hr3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HR4 | Haggerston Community Centre | rooms | Conditional | venue-hr4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HR5 | Hackney City Farm | rooms | Conditional | venue-hr5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HR6 | Sebright Arms | music | Yes | venue-hr6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HR7 | Queensbridge Sound Store | studio | Conditional | venue-hr7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HR8 | Goldsmiths Riding Workshop | sports | Conditional | venue-hr8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HX1 | The Wenlock Arms | pub | Yes | venue-hx1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HX2 | The Eagle | pub | Yes | venue-hx2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HX3 | Rosemary Branch Theatre | theatre | Yes | venue-hx3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HX4 | Victoria Miro | gallery | Conditional | venue-hx4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HX5 | The Narrowboat | pub | Yes | venue-hx5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HX6 | The Baring | pub | Yes | venue-hx6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HX7 | Tern Wharf Dispatch | depot | No | venue-hx7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| HX8 | Shepherdess Coin Rooms | money | Conditional | venue-hx8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LF1 | London Fields Lido | sports | Conditional | venue-lf1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LF2 | The Prince Arthur | pub | Yes | venue-lf2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LF3 | The Duke of Richmond | pub | Yes | venue-lf3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LF4 | The Spurstowe Arms | pub | Yes | venue-lf4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LF5 | The Duke of Wellington | pub | Yes | venue-lf5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LF6 | Wilton Way Deli and Wines | shop | Yes | venue-lf6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LF7 | Kingsland Courier Arch | depot | No | venue-lf7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LF8 | Englefield Listening Flat | flat | No | venue-lf8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LY1 | Leyton Orient stadium | stadium | Yes | venue-ly1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LY2 | Leyton Orient Supporters Club | club | Conditional | venue-ly2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LY3 | The Leyton Engineer | pub | Yes | venue-ly3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LY4 | Leyton Great Hall | civic | No | venue-ly4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LY5 | Score Leisure Centre | sports | Conditional | venue-ly5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LY6 | The Coach and Horses | pub | Yes | venue-ly6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LY7 | Third Half Bookroom | money | Conditional | venue-ly7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| LY8 | Larch Cold Store | depot | No | venue-ly8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| OF1 | St Mary Bow Church | church | No | venue-of1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| OF2 | Nunnery Gallery | gallery | Conditional | venue-of2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| OF3 | The Lord Morpeth | pub | Yes | venue-of3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| OF4 | St Paul Old Ford | church | No | venue-of4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| OF5 | The Trampery Fish Island Village | rooms | No | venue-of5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| OF6 | Forman's Fish Island | rooms | Conditional | venue-of6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| OF7 | Roman Exchange | shop | Yes | venue-of7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| OF8 | Roman Rooms Printworks | print | Conditional | venue-of8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ON1 | Lee Valley VeloPark | sports | Conditional | venue-on1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ON2 | Lee Valley Hockey and Tennis Centre | sports | Conditional | venue-on2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ON3 | Timber Lodge | cafe | Yes | venue-on3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ON4 | The Stratford hotel | rooms | Conditional | venue-on4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ON5 | Signorelli at Stratford Cross | cafe | Yes | venue-on5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ON6 | The Leyton Star | pub | Yes | venue-on6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ON7 | North Echo Rehearsal Rooms | studio | Conditional | venue-on7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ON8 | North Park Hospitality Lodge | rooms | Conditional | venue-on8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| SN1 | Abney Park Chapel | church | No | venue-sn1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| SN2 | Abney Books | shop | Yes | venue-sn2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| SN3 | The Auld Shillelagh | pub | Yes | venue-sn3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| SN4 | The Red Lion | pub | Yes | venue-sn4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| SN5 | The Shacklewell Arms | music | Yes | venue-sn5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| SN6 | St Paul's West Hackney | church | No | venue-sn6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| SN7 | Saint Martha House | rooms | No | venue-sn7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| SN8 | Evering Safe Flat | flat | No | venue-sn8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ST1 | Westfield Stratford City | stadium | Yes | venue-st1-food, venue-st1-clothes, venue-st1-phones, venue-st1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ST2 | London Stadium | stadium | Yes | venue-st2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ST3 | London Aquatics Centre | sports | Conditional | venue-st3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ST4 | Theatre Royal Stratford East | theatre | Yes | venue-st4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ST5 | Sadler's Wells East | theatre | Yes | venue-st5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ST6 | V&A East Museum | gallery | Conditional | venue-st6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ST7 | Meridian Sales Pavilion | rooms | No | venue-st7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| ST8 | Bridge Nine Broadcast Garage | studio | No | venue-st8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| VW1 | Barge East | boat | Yes | venue-vw1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| VW2 | CRATE Brewery | brewery | Yes | venue-vw2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| VW3 | Howling Hops Tank Bar | brewery | Yes | venue-vw3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| VW4 | Grow Hackney | music | Yes | venue-vw4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| VW5 | Number 90 | club | Yes | venue-vw5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| VW6 | People's Park Tavern | pub | Yes | venue-vw6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| VW7 | Wallis Tape Rooms | studio | No | venue-vw7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| VW8 | White Post Workers Rooms | rooms | No | venue-vw8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WS1 | Hackney Town Hall | civic | No | venue-ws1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WS2 | Hackney Picturehouse | cinema | Yes | venue-ws2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WS3 | The Gun | pub | Yes | venue-ws3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WS4 | The Lauriston | pub | Yes | venue-ws4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WS5 | St John of Jerusalem | church | No | venue-ws5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WS6 | The Empress | pub | Yes | venue-ws6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WS7 | Wickside Print Shop | print | Yes | venue-ws7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WS8 | Well Street Loan Office | money | Yes | venue-ws8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WW1 | Hackney Marshes Centre | sports | Conditional | venue-ww1 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WW2 | HBC Community Centre | rooms | Conditional | venue-ww2 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WW3 | The Adam and Eve | pub | Yes | venue-ww3 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WW4 | The Spread Eagle | pub | Yes | venue-ww4 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WW5 | The Kenton | pub | Yes | venue-ww5 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WW6 | Hub67 | rooms | Conditional | venue-ww6 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WW7 | Willow Cabin | flat | No | venue-ww7 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |
| WW8 | East Cross Security Compound | rooms | No | venue-ww8 | Profile/counter/access and stock validated in document simulation. Actual map accessibility, counter placement and multiplayer UI sign-off; named staff schedules and physical admission barriers not complete. |

## All 238 item records

| Item | Type | Status | Implemented | Remaining |
|---|---|---|---|---|
| Fists | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Knuckle Duster | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Bike Chain | weapon | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Broken Bottle | weapon | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Snooker Cue | weapon | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | "Snaps easily" has no break check. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Claw Hammer | weapon | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | "Cheap door Graft one band easier" not represented in door/lock interact handler. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Cricket Bat | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Baseball Bat | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Crowbar | weapon | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | No context-specific door/shutter bypass action. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Golf Club | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Kitchen Knife | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Lock Knife | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Zombie Knife | weapon | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | Being visibly carried/drawn does not automatically call the police by this item identity. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Machete | weapon | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | Drawing attention on visible brandish is narrative rather than witnessed police trigger. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Fire Axe | weapon | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | "Through a door in one swing" does not activate a door destruction mechanic. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Pocket .22 | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Converted Pistol | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Polymer Nine | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Service Revolver | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Hand Cannon | weapon | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Machine Pistol | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Micro SMG | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Police SMG | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Sawn-off Shotgun | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Pump Shotgun | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Farmer's Double | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Air Rifle | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Hunting Rifle | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Kalash | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Police Carbine | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Brick | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Firework Rocket | weapon | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | Narrative distraction/ambient crowd response not automatic. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Petrol Bomb | weapon | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | Misses never create a fire surface; no burning-area timer/spread from explosion. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Smoke Grenade | weapon | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | No visible timed smoke cloud/expiry or auto-cover cleanup; cover may persist. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Frag Grenade | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Area is centred on struck token rather than a selected ground impact point. |
| Flashbang | weapon | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Taser | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| CS Spray | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Extendable Baton | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Rocket Launcher | weapon | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | No explicit possession/GM-only restriction once player has launcher; point-target blast unsupported. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| .22 Rounds | ammo | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Never-sale police-only types must remain restricted; quantity and gun matching require tests. |
| 9mm Rounds | ammo | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Never-sale police-only types must remain restricted; quantity and gun matching require tests. |
| .38 Rounds | ammo | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Never-sale police-only types must remain restricted; quantity and gun matching require tests. |
| .50 Rounds | ammo | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Never-sale police-only types must remain restricted; quantity and gun matching require tests. |
| 12-Gauge Shells | ammo | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Never-sale police-only types must remain restricted; quantity and gun matching require tests. |
| 7.62 Rounds | ammo | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Never-sale police-only types must remain restricted; quantity and gun matching require tests. |
| .308 Rounds | ammo | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Never-sale police-only types must remain restricted; quantity and gun matching require tests. |
| Air Rifle Pellets | ammo | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Never-sale police-only types must remain restricted; quantity and gun matching require tests. |
| Taser Cartridges | ammo | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Never-sale police-only types must remain restricted; quantity and gun matching require tests. |
| CS Canister | ammo | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Never-sale police-only types must remain restricted; quantity and gun matching require tests. |
| 5.56 Rounds | ammo | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Never-sale police-only types must remain restricted; quantity and gun matching require tests. |
| Rocket | ammo | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Never-sale police-only types must remain restricted; quantity and gun matching require tests. |
| Puffer Jacket | armour | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Only last equipped armour applies; confirm intended equipment slot restriction in UI. |
| Leather Jacket | armour | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Only last equipped armour applies; confirm intended equipment slot restriction in UI. |
| Motorbike Leathers | armour | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Stab Vest | armour | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Only last equipped armour applies; confirm intended equipment slot restriction in UI. |
| Bulletproof Vest | armour | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Only last equipped armour applies; confirm intended equipment slot restriction in UI. |
| Police Body Armour | armour | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Only last equipped armour applies; confirm intended equipment slot restriction in UI. |
| Riot Shield | armour | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Bolt Cutters | gear | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | Door and cheap padlock interactions are not supported by item action. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Angle Grinder | gear | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Relay Box | gear | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Key Programmer | gear | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | Description promises clean start/no hotwire, but shares same combined theft/hotwire interaction. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Slim Jim | gear | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Screwdriver Set | gear | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Lock Picks | gear | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | Carried tool not consumed by lock-target logic; no map door/padlock action giving promised one-band silent bonus. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Hacksaw | gear | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | Padlock/chain sawing is not an interactive door/prop action. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Toolkit | gear | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Jerry Can | gear | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Spare Plates | gear | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Spray Paint | gear | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Bike frame painting is not the same as graffiti target painting; wording could mislead. |
| Burner Phone | gear | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | No equipment/alias number identity, blocking or disposable contact profile. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Police Scanner | gear | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | Promised police-detection die upgrade and helicopter alert are not connected to police sighting. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Binoculars | gear | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | "Casing job one band easier" not applied to investigation/mission check TN. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Torch | gear | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Cable Ties | gear | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Duct Tape | gear | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No restraint/tie-up action even though Cable Ties separately do this. |
| Fake ID | gear | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | No persistent ID disguise/one-step-up police ID check modifier. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Oyster Card | gear | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | No transit fare/tap check or ticket requirement. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Balaclava | gear | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Bike Lock | gear | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Skunk | drug | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Use/sale retained; possession-specific police-search Heat remains open. |
| Charlie | drug | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Use/sale retained; possession-specific police-search Heat remains open. |
| Pills | drug | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Use/sale retained; possession-specific police-search Heat remains open. |
| Benzos | drug | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Use/sale retained; possession-specific police-search Heat remains open. |
| Nitrous | drug | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Use/sale retained; possession-specific police-search Heat remains open. |
| Roids | drug | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Use/sale retained; possession-specific police-search Heat remains open. |
| First Aid Kit | consumable | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Bandages | consumable | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Most apply to self when used from inventory; verify resource timing and intended team targeting. |
| Painkillers | consumable | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Most apply to self when used from inventory; verify resource timing and intended team targeting. |
| Energy Drink | consumable | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Most apply to self when used from inventory; verify resource timing and intended team targeting. |
| Cans of Lager | consumable | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Most apply to self when used from inventory; verify resource timing and intended team targeting. |
| Bottle of Water | consumable | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Most apply to self when used from inventory; verify resource timing and intended team targeting. |
| Cigarettes | consumable | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Most apply to self when used from inventory; verify resource timing and intended team targeting. |
| Meal Deal | consumable | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Most apply to self when used from inventory; verify resource timing and intended team targeting. |
| Chicken & Chips | consumable | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Most apply to self when used from inventory; verify resource timing and intended team targeting. |
| Kebab | consumable | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Most apply to self when used from inventory; verify resource timing and intended team targeting. |
| Full English | consumable | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Most apply to self when used from inventory; verify resource timing and intended team targeting. |
| Pie & Mash | consumable | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Most apply to self when used from inventory; verify resource timing and intended team targeting. |
| Tracksuit | outfit | PARTIAL | Common outfit Heat exploit fixed; worn and contextual bonus paths added. | Full advertised disguise/access/police-specific behaviour needs context producers and live acceptance. |
| Black Hoodie & Mask | outfit | PARTIAL | Common outfit Heat exploit fixed; worn and contextual bonus paths added. | Full advertised disguise/access/police-specific behaviour needs context producers and live acceptance. |
| Hi-Vis & Hard Hat | outfit | PARTIAL | Common outfit Heat exploit fixed; worn and contextual bonus paths added. | Full advertised disguise/access/police-specific behaviour needs context producers and live acceptance. |
| Delivery Rider Jacket | outfit | PARTIAL | Common outfit Heat exploit fixed; worn and contextual bonus paths added. | Full advertised disguise/access/police-specific behaviour needs context producers and live acceptance. |
| Smart Suit | outfit | PARTIAL | Common outfit Heat exploit fixed; worn and contextual bonus paths added. | Full advertised disguise/access/police-specific behaviour needs context producers and live acceptance. |
| Football Shirt | outfit | PARTIAL | Common outfit Heat exploit fixed; worn and contextual bonus paths added. | Full advertised disguise/access/police-specific behaviour needs context producers and live acceptance. |
| Paramedic Uniform | outfit | PARTIAL | Common outfit Heat exploit fixed; worn and contextual bonus paths added. | Full advertised disguise/access/police-specific behaviour needs context producers and live acceptance. |
| Police Uniform | outfit | PARTIAL | Common outfit Heat exploit fixed; worn and contextual bonus paths added. | Full advertised disguise/access/police-specific behaviour needs context producers and live acceptance. |
| Bike Thief | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Getaway Driver | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Local Knowledge | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Silver Tongue | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Parkour | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Brawler | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Cabbie | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Medic | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Wheelie King | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Grease Monkey | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Steady Hand | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Spray and Pray | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Dirty Fighter | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Leg It | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Hard as Nails | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Night Owl | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Grass Radar | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Blag Merchant | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Wide Boy | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Proper Nutter | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Cool Head | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Ghost | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Courier | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Blue Light Runner | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Ex-Old Bill | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Fixer | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Police Baton | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Compact Pistol | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| ARV Carbine | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Conducted-Energy Device | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Thrown Brick | weapon | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No item-specific discrepancy verified beyond any separate exception. |
| Ballistic Vest | armour | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Only last equipped armour applies; confirm intended equipment slot restriction in UI. |
| Heavy Work Jacket | armour | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Only last equipped armour applies; confirm intended equipment slot restriction in UI. |
| Cordless Angle Grinder | gear | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Screwdriver | gear | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. |  Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Paramedic Bag | gear | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | No kit check for patient gameplay; advertised job use not verified. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Firefighter Kit | gear | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | No protection flag or gear prerequisite wired to fire-job interaction. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| Cheap Smartphone | gear | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | Inventory phone does not alter capabilities or data plan. |
| Service Radio | gear | PARTIAL / OPEN INTEGRATION | Existing functionality preserved; selected action/effect paths added where supported. | No radio-required session/dispatcher action. Some new code addresses this gap, but the whole advertised workflow is not certified. |
| D-Lock | gear | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Hi-Vis Vest | gear | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No disguise/worn state; situational benefits remain GM adjudication per description. |
| Cycle Helmet | gear | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Courier Backpack | gear | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. | No carrying-capacity/proof bonus; no explicit promise of one. |
| Handcuffs | gear | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Vehicle Repair Kit | gear | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Spare Clothes | gear | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Pocket Torch | gear | IMPLEMENTED / TARGETED CODE OR TEST COVERAGE | New item-specific rule/action path, using authoritative receipts where applicable. | Live Foundry acceptance remains required; see related audit issue for any wider integration limits. |
| Fictional Show Plates | gear | PRESERVED / EXISTING COVERAGE | Original catalogue identity/asset and core implementation retained. |  |
| Bike Messenger | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Hard to Shift | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Estate Runner | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Locksmith | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Street Reader | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Steady Hands | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Stare Them Down | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Door Staff | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| First Responder | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| The Knowledge | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Local Face | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Rally Driver | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Crowd Work | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Iron Stomach | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Quiet Feet | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Dead Calm | perk | CONTEXT-GATED / FULL TRIGGER ACCEPTANCE OPEN | Perk selection is context-filtered; GM can record a scoped approval for unmodelled fiction. | Validate each when-clause in actual gameplay; generic tag matching is not a full situational rules implementation. |
| Access Permit | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Antique Lot | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Appointment Slip | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Appraisal Slip | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Art Postcard | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Art Print | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Auction Catalogue | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Auction Lot | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Band Merch | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Bet Receipt | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Brewery Tour Ticket | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: admission. <p>Issued to this character for this venue. Present at the venue counter to start 120 minutes of front-of-house admission. Does not grant backstage, staff or mission access. One admission; non-transferable.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Cinema Ticket | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: admission. <p>Issued to this character for this venue. Present at the venue counter to start 240 minutes of front-of-house admission. Does not grant backstage, staff or mission access. One admission; non-transferable.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Cloakroom Ticket | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Club Scarf | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Club Wristband | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: admission. <p>Issued to this character for this venue. Present at the venue counter to start 360 minutes of front-of-house admission. Does not grant backstage, staff or mission access. One admission; non-transferable.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Collector Coin | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Delivery Manifest | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Donation Receipt | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Equipment Hire Voucher | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: hire. <p>A named equipment-hire checkout contract. Use the counter Hire action: the deposit, exact issued asset and due time are recorded. This blank catalogue voucher is not a free item or vehicle.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Event Entry Ticket | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: admission. <p>Issued to this character for this venue. Present at the venue counter to start 240 minutes of front-of-house admission. Does not grant backstage, staff or mission access. One admission; non-transferable.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Event Programme | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Evidence Folder | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Facility Day Pass | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: admission. <p>Issued to this character for this venue. Present at the venue counter to start 720 minutes of front-of-house admission. Does not grant backstage, staff or mission access. One admission; non-transferable.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Faction Supply Voucher | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Farm Entry Ticket | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: admission. <p>Issued to this character for this venue. Present at the venue counter to start 240 minutes of front-of-house admission. Does not grant backstage, staff or mission access. One admission; non-transferable.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Flyer Bundle | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Gig Ticket | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: admission. <p>Issued to this character for this venue. Present at the venue counter to start 360 minutes of front-of-house admission. Does not grant backstage, staff or mission access. One admission; non-transferable.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Heritage Entry Ticket | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: admission. <p>Issued to this character for this venue. Present at the venue counter to start 240 minutes of front-of-house admission. Does not grant backstage, staff or mission access. One admission; non-transferable.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Hot Meal | consumable | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: consume. <p>One serving. Use once; restores 2 Health, capped at your maximum. Does not clear police Heat.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Hotel Room Booking | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: booking. <p>Paid reservation for this named venue and character. Activate at reception for 720 minutes of access. Hotel/room bookings enable a timed rest at this venue; a studio pass admits to the studio, not a free rest.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Library Card | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Loading Docket | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| London Street Guide | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Match Ticket | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: admission. <p>Issued to this character for this venue. Present at the venue counter to start 240 minutes of front-of-house admission. Does not grant backstage, staff or mission access. One admission; non-transferable.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Medical Referral | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Meeting Invitation | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Mooring Event Ticket | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: admission. <p>Issued to this character for this venue. Present at the venue counter to start 240 minutes of front-of-house admission. Does not grant backstage, staff or mission access. One admission; non-transferable.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Museum Ticket | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: admission. <p>Issued to this character for this venue. Present at the venue counter to start 240 minutes of front-of-house admission. Does not grant backstage, staff or mission access. One admission; non-transferable.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Notebook | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Packing Materials | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Paperback | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Pastry | consumable | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: consume. <p>One serving. Use once; restores 1 Health, capped at your maximum. Does not clear police Heat.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Pawn Ticket | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Photocopy Credit | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: copy. <p>One prepaid photocopy. At the issuing counter, choose an owned document. The copy preserves its source and is labelled a copy; it does not duplicate a unique mission hand-in, key or ticket.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Popcorn | consumable | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: consume. <p>One serving. Use once; restores 0 Health, capped at your maximum. Does not clear police Heat.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Poster Run | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Produce Crate | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Programme | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Property Dossier | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Pub Meal | consumable | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: consume. <p>One serving. Use once; restores 2 Health, capped at your maximum. Does not clear police Heat.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Recording Media | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Records Request | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Repair Parts | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: repairParts. <p>One set of vehicle-repair parts. Used by the repair-item action for 2 Body on a successful Graft check at a safe location. Consumed once; no restoration of destroyed vehicles.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Room Booking | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: booking. <p>Paid reservation for this named venue and character. Activate at reception for 720 minutes of access. Hotel/room bookings enable a timed rest at this venue; a studio pass admits to the studio, not a free rest.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Safehouse Key | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Sandwich | consumable | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: consume. <p>One serving. Use once; restores 1 Health, capped at your maximum. Does not clear police Heat.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Shoes | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: merchandise. <p>Physical merchandise with no automatic stat, access or mission-completion bonus.</p> | Intentional physical merchandise; no automatic stat or mission bonus. |
| Shopping Receipt | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Show Ticket | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: admission. <p>Issued to this character for this venue. Present at the venue counter to start 240 minutes of front-of-house admission. Does not grant backstage, staff or mission access. One admission; non-transferable.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Single Fare Ticket | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: fare. <p>One prepaid fare, valid for this character and departure station. Redeem at the station counter for a fare receipt; does not teleport the character or bypass travel rules.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Soft Drink | consumable | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: consume. <p>One serving. Use once; restores 0 Health, capped at your maximum. Does not clear police Heat.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Spare Inner Tube | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: innerTube. <p>One bicycle inner tube. Fit to an adjacent bicycle with a flat: a successful Graft check and ten Watch minutes remove one flat. Consumed once.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Studio Session Pass | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: booking. <p>Paid reservation for this named venue and character. Activate at reception for 120 minutes of access. Hotel/room bookings enable a timed rest at this venue; a studio pass admits to the studio, not a free rest.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Tea or Coffee | consumable | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: consume. <p>One serving. Use once; restores 0 Health, capped at your maximum. Does not clear police Heat.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Travel Credit | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: travelCredit. <p>Ten pounds of prepaid transit balance. Activate at the issuing station to add GBP 10 to your character transit balance once. This does not provide unrestricted fast travel.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Venue Wristband | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: admission. <p>Issued to this character for this venue. Present at the venue counter to start 360 minutes of front-of-house admission. Does not grant backstage, staff or mission access. One admission; non-transferable.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
| Visitor Pass | gear | NEW CATALOGUE ITEM / SERVICE CONTRACT | Action class: issued. <p>Issued by a validated venue service, authorised GM or mission action, not for ordinary sale. Its recorded issuer, owner, source and mission/run (when relevant) determine its meaning. The item name alone never completes a job or grants entry.</p> | Native compendium and live service acceptance; admission/fare/issued-document contracts do not by themselves enforce barriers, routes or mission evidence. |
