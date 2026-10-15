# The Smoke · v0.1.2

A London crime sandbox for Foundry VTT 14, by Pacts & Polyhedrals.

This release consolidates the uploaded v0.1.1 game with the earlier tested fixes. It preserves the uploaded pregens and all 25 map images. It adds the missing service, recovery, progression and upgrade workflows.

## Start

Install the release ZIP as the system `the-smoke`. In a new world, open **Street Control → Set up the world**. Assign the pregens to players. Setup imports all 25 scenes, 72 authored actors, 90 equipment/perk/condition items, and eight journals containing 45 pages. New worlds begin in **Your Flat**; Pat, Spanner and Kez are at The Arches. Starter job vehicles are on Hackney Central.

In an existing v0.1.0/v0.1.1 world, the active GM runs the upgrade automatically on login. Existing character stats, resources, notes, equipment, ownership and scene positions are preserved. Missing reference content is added. Back up the world before upgrading.

## Play

Click a stat to roll. Temporary Hustle and perks improve a target fixed before those benefits. Wheels uses the driven vehicle’s Performance and Handling. Target a foe, use a weapon, and let the target or GM take the hit or Dodge. Each attack and treatment resolves once.

Right-click a vehicle to board and choose an exact seat. The vehicle and its riders move together and cross maps together. The driver controls that physical vehicle; shared catalogue templates retain their original permissions.

Open **The Blower** from the scene controls or Alt+B for shifts and calls. Taxi, police/ANPR, ambulance, fire, courier, bus and Pat’s bike orders all have complete workflows. Pausing shifts offer expiry, patient deterioration and every job deadline together.

Use **Local services** on a character sheet or token controls. A respray clears Heat and changes plates for £100, clothes remove one star for £25, and garage repairs cost £10 per missing Body. Prices are configurable. Location, police sight, the quoted price and pocket cash are checked before a purchase. Stash is protected.

First aid restores 2 Health and removes Bleeding/Hurt once per injury. A safehouse rest restores Health/Hustle and clears short-term conditions. Broken still needs A&E and a week of fictional recovery, after which the GM removes it. Combat automatically handles Bleeding, reactions, Stunned and the three-round Down countdown. A Proper Mess staying conscious, or three rounds without aid, causes Wasted.

The GM awards advances in Street Control. Spend them from Identity, within the Rep stage’s die cap.

## Installation and validation

See [INSTALL.md](INSTALL.md) and [VALIDATION.md](VALIDATION.md). The release ZIP has `system.json` at its root. No reference system or optional module is required.

85 automated rules and workflow tests, eight compendium audits, asset/link checks and six Chromium interface previews are included in the source validation. These use Foundry stand-ins; a licensed live Foundry 14 / Forge acceptance run remains outstanding. No `verified` compatibility claim is made.

The manifest targets [pacts-and-polyhedrals/the-smoke](https://github.com/pacts-and-polyhedrals/the-smoke), tag `v0.1.2`. The files must be uploaded to that release before its manifest URL installs this version. This build did not publish the release.
