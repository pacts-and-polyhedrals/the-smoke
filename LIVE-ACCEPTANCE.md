# Live acceptance - all boxes intentionally unsigned

**Candidate:** 0.5.27-rc.3. **Approved baseline:** 0.5.24. Run on copied data in an isolated test instance. Record Foundry version, modules, browser, user roles, world copy, console errors and actual outcomes. Do not sign a scenario using GM ticks as a substitute for its real action.

## Gate 1 - loading and migration

- [ ] All ten compendiums open natively; three rebuilt packs show 247 items, 40 people and 328 guide pages across 29 guides. Original linked entries still resolve.
- [ ] Existing PCs, inventories, maps, map pins, ownership, journal edits, graffiti art, clocks and settings are retained. New content is added once, not duplicated after reload.
- [ ] A mission already running (including one rc.1 froze for review) carries on with its progress after loading rc.2, without republishing rewards or wiping progress; its log says it was carried over.
- [ ] Both clients can load the world and switch maps without startup errors, duplicated timers or long freezes.

## Gate 2 - requested sheet changes

- [ ] On a Roll and Off Your Game appear next to main stats only, save correctly and synchronize to the other client.
- [ ] Correct roll consumes the appropriate state once, including retry/reconnect after a saved roll.
- [ ] Exactly one Blower control opens the existing phone; radio and guide controls remain.
- [ ] Tabs and all controls remain reachable in short windows.

## Gate 3 - missions, by actual crew size

- [ ] CH3 with four players: all four get into one car at The Arches and "Get some wheels" completes; the sat nav then goes to the van; nicking it, bringing it back and dealing with Stretch tick in turn. Repeat on a crowded Morning Lane (the job still sets up).
- [ ] A character made with Create Actor: after GM login its token is linked; kit and cash the GM added on the token's sheet are on the character (chat card), the Tag Studio finds the Spray Paint, the shop sees the cash. A new character dragged out is linked.
- [ ] Self-play: a player can't type cash or drop kit onto their own sheet (the field says why); the GM can, in both modes; GM Screen Give and Take kit work.
- [ ] Banana Basket: order Spray Paint from Pat's on the Blower, wait the Watch hour (or GM: deliver now), collect at Your Flat; away from the flat it says go there; cancelling on the way refunds.
- [ ] Mark done: a player on the job (Self-play) marks a ready step done and cannot reopen it or skip ahead; the GM marks any step done, reopens it and passes the job; each shows in the run's log.
- [ ] Sat nav on M09 (Westfield Stratford City), M12 (the lock-up behind the Leyton Orient ground) and a graffiti commission (each wall in turn) goes where the objective says, and finishes what's at the current place first.
- [ ] CH1: four players produce four distinct bikes, actual theft checks and sales of those same bikes; everyone contributes; reward pays once. Repeat for one/two/six players.
- [ ] Two active missions with prop ID p1: pickup/drop/reclaim/delivery credits only the correct mission/run, at the correct place.
- [ ] A distant street token cannot complete a room interaction, buy at a counter, heal a remote PC or claim an unrelated mission receipt.
- [ ] NPCs and resources spawn on their target maps, survive GM/player map changes, and do not duplicate after reconnect.
- [ ] Support tasks, prerequisite order, meaningful dialogue and alternative choices match the actual story. Do not sign a generic roll as a complete simulated chase/escort/vehicle scene.
- [ ] Chase-to-mission transfer preserves the same vehicle/occupants/serial; route and destination logic match the mission. CH3's van drives its route across three maps; check that following and nicking it works in a live session.
- [ ] Race with real crew and rivals; all checkpoints; losses/ties/restart; no control of opponents; no artificial race completion.
- [ ] Escort: near/far NPC, dead NPC, walking versus boarded vehicle, cross-map transitions and interrupted transfer.
- [ ] All branch endings and costs, win/fail consequences, payouts, partial payout recovery and late roster changes.
- [ ] Repeat authored scenarios in each faction and all local cases. Full scenario coverage remains open; contract/preflight tests alone are insufficient.

## Gate 4 - counters and services

- [ ] Public, conditional/faction and non-retail venue examples; 48 non-retail venues never offer general stock.
- [ ] Counter geometry is accessible; unstaffed/closed/far/wrong-venue requests fail; optional campaign hours and restock behave correctly.
- [ ] Two players purchase the last stock at once; reusing an operation ID on another actor does not bypass stock.
- [ ] Failed debit/item issue/reconnect recovers once. No second charge or missing purchased item.
- [ ] Pawn/redeem returns the original item and custom flags; rental return verifies the exact asset and damage; no replay money.
- [ ] Treatment advances four Watch hours; room rest requires the correct booking and duration. Check legacy Local services paths separately.
- [ ] Admission, backstage movement, real clerk shifts and transport fares: do not sign off until the remaining barrier/route implementation exists.

## Gate 5 - items/combat

- [ ] Refuel, plates and kit: actual item, nearby correct vehicle, charge once; failed write recovery; deleted/moved target.
- [ ] First Aid Kit on another player's down/bleeding PC: correct target and charges, failure/success, no unrelated healing.
- [ ] Ties consume once; cuffs are reusable and attached to the actual held/down/stunned/surrendered person. Police and ARV arrest still work with actual kit.
- [ ] Outfit no-op/repeated switching cannot reduce Heat; masks and uniform consequences follow actual observation.
- [ ] Each perk and outfit when-clause gives a bonus only in its circumstances; record GM approvals for unmodelled fiction.
- [ ] Shield/two-handed restriction; motorcycle leathers across actual crashes/PIT/ram; Hand Cannon d4 penalty.
- [ ] Broken Bottle damaging hit and break; Flashbang nearby targets; smoke visibility/gas/fresh-air/round-time expiry; petrol hit/miss fire.
- [ ] Interrupted attack damage stops for GM review; review checks the actual partial effects rather than replaying damage.
- [ ] Open item promises (search drug Heat, authored locks, full scanner/ID/device/job/transit interactions, fire spread) implemented before their specific sign-off.

## Gate 6 - preserved whole game

- [ ] Automatic police and helicopter, reinforcements, full-auto chase, resolved driving prompts, distance gauge and traffic phase.
- [ ] Boarding, seat menus, atomic rider movement, NPC drivers and player right-click on pre-existing tokens.
- [ ] All job shifts, Banana Watch, drugs/conditions, radio stations/radio wars, graffiti commissions/decals/buses, sat nav and transitions.
- [ ] Character creation, advancement, milestones, damage reactions, surrender reset and existing scroll fixes.

## Promotion decision

- [ ] No P0/P1 open workflow needed by the campaign.
- [ ] Required live acceptance completed with evidence.
- [ ] Source commit, tag, release ZIP, manifest, build-info and checksums correspond.
- [ ] User explicitly approves this complete build as the next baseline. **Not approved by this package.**

## Gate 8 - incoming branch plus audit integration

- [ ] Create a new PC with the eight-step creator and save a layered token; edit and randomise from the existing sheet, reload, move maps and check other clients see the same token.
- [ ] Hire and dismiss an eligible hand; verify cash, kit, ownership, slots and its token. Hired NPCs do not silently become enrolled PCs or multiply mission rewards.
- [ ] Use Pat's Rep 3 orders and Rep 9 car jobs; do not let an unrelated order or sale satisfy a run-bound mission target.
- [ ] Known-face police talk remains Long Shot; Say nothing uses Bottle and valid context. Chase/driving switches keep their saved choices.
- [ ] New perks are unavailable on unrelated rolls, work in a suitable world/mission/GM-request context, and consume GM approval once. Good Arm works with the last thrown item; Quick Draw is not repeatable after an earlier shot.
- [ ] Paint a preset and custom piece; quality, paint use, Watch, persistent decal and commission receipts behave together.
- [ ] Read one opening, faction, local, graffiti and radio GM file; the expanded story is present and its live rules match the actual Board. No normal player checkbox completion.
- [ ] Edited shipped guide pages are backed up before edition replacement, custom added pages remain, IDs and links resolve, and a second reload does not create another set of entries.
- [ ] Test simultaneous GM/player actions and reconnect across both systems; finish the inherited bespoke scenarios before approving their audit rows.
