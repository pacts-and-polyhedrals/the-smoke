# The Smoke v0.5.25 — nothing lost on upgrade, a token builder, every stat earns its keep, a GM file for every mission

Built on v0.5.24 (players can right-click every vehicle), so it includes everything up to there.

## Why this release
Features kept going missing as the system was upgraded, and had to be asked for again. This release went back through every older build, put back what had gone, and added a guard so it can't quietly happen again. On top of that it adds the Token Builder, balances the nine stats, uses every place in London, gives every mission a proper GM file and rewrites the character, stats and Rep guides.

## What had gone missing, and is back
Every build from 0.1.3 to 0.5.24 was compared with the current code, data, templates and assets.
- **Chase and driving switches** on the Blower and in Street Control (from 0.5.1). The GM can turn automatic sight chases, the chase mode, chase traffic, automatic evading and automatic driving checks on and off. In Self-play, so can any player with a character. Changes are announced in chat.
- **Driving checks that roll themselves** (from 0.5.1) for yellow/red pushes and PIT saves, now its own setting (off by default). Evasive manoeuvres still roll themselves by default. Chases started by a police sighting end if you switch automatic chases off; chases someone started by hand carry on.
- **GM-editable base Guard** on the character sheet (from 0.1.3).

## Rep unlocks that were only labels, now real
- **Rep 3:** Pat offers bigger orders (four bikes, three mopeds or scramblers, two proper motorbikes).
- **Rep 9:** Pat's **car jobs**: a hatchback, a Range Ruler, an estate and a van, or something with a badge. You deliver them to **Bow Breakers Yard** on Roman Road, not The Arches.
- **Rep 13 (Top Boy): hired hands.** Open the Crew card on the Blower and pay the fee. There are nine types, one for each stat: Muscle, Minder, Runner, Wheelman, Shooter, Locksmith, Lookout, Talker, Old Head. Each arrives next to your token as an NPC your player runs, with kit and a token dressed for the job. You can keep 2 hands at Rep 13, 3 from Rep 20 and 4 from Rep 27.
- **Known to police 3:** they know your face. Talking your way out of a stop is a Long Shot.
- **New at every stop: Say nothing.** Roll Bottle: Medium at 1★, Hard at 2★, a Long Shot higher. On a success the stop is over, one star comes off and they won't pull you again for a minute. It is never offered against armed crime.

## Token Builder
- **Where it is.** Step 7 of the Character Creator, plus **Build/Edit token** and **Randomise token** at the top of every character sheet. The GM can use it for NPCs.
- **What you build from.** 109 layered top-down parts in the house style, across 14 categories: build, skin, hair, headwear, face, top, jacket, bottoms, shoes, gloves, faction trim, neck, bag and in hand. There are three builds, eight skin tones and a palette for each clothing colour.
- **Presets.** 16 in all: 11 for players, plus police officer, bobby, paramedic, cabbie and firefighter for NPCs.
- **Other controls.** Randomise, New clothes, Reset and a ring colour.
- **Saving.** The picture is saved as the token everywhere the character is placed, and as the portrait if they don't have one. Hired hands get a token built for the job.

## Every stat earns its keep
- **Twelve backgrounds.** Scaffolder (Grit) and Door Staff (Bottle) are new, so every stat is somebody's best. Getaway Kid's spare d6 moved from Bottle to Aim.
- **Nine new perks**, so every stat has at least five: Shoulder Charge, Heavy Lifting, Second Wind, Long Shift, Good Arm, Quick Draw, Hotwire Kid, Light Fingers, Poker Face.
- **GM Screen.** New quick checks for Aim and Muscle: Throw It, Take Out the Tyres, Kill the Lights, Sling It Over.
- **Mission checks.** Across the 179 mission files, each stat gets 9.8–12.2% of the checks.
- **Locked in by a test.** `tests/stat-balance.test.mjs` fails the build if any stat drops below 8% or above 14%. It also fails if a stat loses its background, its perks, its hired hand, its GM checks or its system rolls.

## Every place used
All 160 venues are mission stops. Every venue's street door is somewhere jobs go: fares, parcels, patients, fires and fights. All 47 landmarks are fare and delivery destinations.

## A GM file for every mission
All 179 missions have a full GM file, in the East London voice. Each one has:
- a brief and read-aloud boxes;
- scene-by-scene running notes, with the checks and what happens on a pass or a fail;
- a who's-who of the cast, with look, manner, wants and a line;
- DM notes.

The 125 story and local-case pages are expanded in place. Two new GM-only journals hold the 42 **Street Commissions** and the 12 **Radio Wars** jobs. The radio journal says plainly that the stations are real broadcasters, used only for their live streams, and that every contact, crew and event is invented. The radio play steps now name the real menu (**Work this radio contact**) and actions (**Put the word about**, **Defend the airwaves**).

## Guides rewritten from the rules
These pages are now generated from the rules code, so they can't drift from the game:
- **Player's Handbook → Making a Character:** the eight wizard steps, all twelve backgrounds, starting numbers, story ideas and the Token Builder.
- **Player's Handbook → Your Stats:** what each stat is for and where the game rolls it, the perks for each, derived numbers and the mission-check share.
- **Player's Handbook → Rep and Levelling:** XP, tiers, the level-up wizard, milestones, all 33 levels, unlocks, Pat's orders by Rep, and hired hands.
- **Player Guide → Make a new face:** the short version.
- **GM's Book → Rewards and XP:** the live unlock table, 179 jobs, and new notes on hired hands, chase settings and calling for the right stat.

Also fixed: the Quick build now sets Health from Grit (8 + Grit modifier), the same as the creator. Before, it was always 10.

## The capability guard
- **The list.** `tests/capability-manifest.mjs` names all 76 things the system has been asked to do since 0.1.0, with probes that prove each one is still there.
- **The fingerprint.** `tests/capability-baseline.json` records every handler, setting, API, template button and data record that 0.5.24 had.
- **The test.** `tests/capabilities.test.mjs` fails if any of them disappears without being moved to the "retired on purpose" list.
- **The readable list.** `CAPABILITIES.md` is the same list for people to read.
- **Adding a feature.** Add it to the manifest, then run `node scripts/capabilities.mjs`.

## Existing worlds
- **Journals.** The first time the GM logs in, the guides upgrade. The two new mission-file journals and the nine new perks are added. Mission pages and guide pages you haven't edited are replaced with the new versions.
- **Pages you edited.** In the Player's Handbook, Player Guide and GM's Book, every page you edited is copied into a GM-only journal first, then replaced. That journal is called "Backup · <journal> · before 0.5.25". Your own extra pages stay where they are.
- **Characters.** Nothing to migrate. Old characters can build a token from their sheet.
- **Hands.** Hired hands go in an Actors folder called "The Smoke — Hired Hands".

## Publish
1. Back up your world.
2. Create a GitHub release on `pacts-and-polyhedrals/the-smoke` tagged **`v0.5.25`**, marked **Latest**.
3. Upload two separate assets: `the-smoke-v0.5.25.zip` and `system.json`.
4. Update in Forge/Foundry through the existing manifest URL (`releases/latest/download/system.json`). Players should reload their page.

## Checked
- 65 automated suites pass, including the six new ones: `capabilities`, `stat-balance`, `token-builder`, `hires`, `chase-settings` and `venue-coverage`.
- **Templates:** all compile.
- **Imports:** every module imports.
- **Compendiums:** packs match the shipped JSON, and every compendium link and asset reference resolves.
- **Sat nav:** finds the right map on every mission.
- **Not covered:** this is not a live Foundry run.
