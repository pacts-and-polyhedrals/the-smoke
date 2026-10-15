# Validation · The Smoke v0.1.2

## Completed checks

- 85 rules and workflow tests pass: the original 67 checks plus 18 added regressions for services, first aid, recovery, progression, migration, map folders, native Health edits, Pat orders, cross-scene driving and socket replies.
- All runtime JavaScript modules pass `node --check`.
- Eight real LevelDB compendiums open, with every embedded Level, Item and Journal Page resolving.
- 25 scene backgrounds and their dimensions match the packaged images. Every street is reachable from Hackney; links and services resolve.
- All bundled asset references resolve. Both branches’ equipment and the uploaded pregens are retained.
- Six templates render in Chromium: character, conditions, equipment, vehicle, Blower and Street Control. No broken images or horizontal overflow at the checked sizes. Their screenshots and machine-readable results are in the source bundle.
- The release ZIP uses the root package layout and passes CRC validation.

## What the automated checks establish

Workflow tests invoke the actual system modules against minimal stand-ins for Foundry fields, documents, hooks, sockets and application frames. Dice totals in workflow tests are deterministic; the probability mathematics has separate tests. The tests cover the recorded bugs, all seven job types and the upgrade from an edited v0.1.1 world.

These checks do not run Foundry’s licensed server, native canvas, document validation or a real multi-user network. Chromium previews render the actual templates and CSS outside Foundry. No licensed Foundry installation or Forge test session was available. The manifest therefore declares minimum 14 and does not claim a verified version.

## Live acceptance · GM plus two player accounts

Use a separate test world with optional modules disabled.

1. Install/update the package and confirm version 0.1.2. Check startup for native validation or application errors.
2. Run setup twice. Confirm 25 scenes, 72 authored actors, 90 world items and eight journals without duplicate imports. Confirm the overview, four ordered street rows and four interiors.
3. On a copy of a v0.1.1 world, edit a PC’s cash, Health, notes and ownership, leave two riders aboard a vehicle, then upgrade. Confirm the edits, seats and assignments survive, the shared vehicle template loses only its recorded temporary grants, and the driver controls only their dedicated vehicle.
4. Assign Jaz and Femi to separate player accounts. Confirm sheet editing, item drops, conditions, reload, phone filtering and private GM/mission guides. Change the GM’s viewed map and roll Wheels from a player’s vehicle on another map.
5. Spend the last shared Hustle point from two clients. Fire the last round twice. Confirm only one succeeds in each case. Confirm temporary bonuses keep the issued target.
6. Attack a targeted foe. Resolve Take hit or Dodge once, then choose at most one condition for a hit. Try a condition after a successful Dodge. Test empty ammunition and native Health-bar updates.
7. Give first aid, try applying it twice, rest at the flat, and spend an advance. Check Bleeding at turn end, Stunned expiry, reaction reset, three Down rounds and a Proper Mess staying conscious. Confirm Wasted/Busted relocation, cash costs and stash protection.
8. Board two riders. Drag, rotate and move the vehicle. Change seats, use cages, exit, cross map edges and enter interiors. Confirm occupants move in the same update and regain their original footprint on exit.
9. Use respray, clothes and repair services. Check location, displayed price, insufficient pocket cash, police sight, new plates, preserved stolen status and repaired Body.
10. Complete taxi, ANPR/arrest/custody, patient/A&E, fire, courier, bus and Pat-order loops. Cross a map with a fare, patient and prisoner; check cleanup and pay. Fill the ambulance or cage first and confirm loading/arrest cannot advance falsely.
11. Pause with an offered call and a deteriorating patient. Reload while paused, resume, and confirm the phone and all deadlines move together. Decline another driver’s call and clear Street Life with an active target present.
12. Raise Heat through five stars, test the roadblock before crossing, and lose police through normal cooling. Confirm a resprayed stolen car does not immediately re-trigger its old ANPR marker.

Record the exact click sequence and console stack for a native platform failure. GitHub release upload also remains pending because repository access was read-only.
