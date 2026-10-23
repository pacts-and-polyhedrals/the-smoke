# Install only in a test instance / cloned world

## Status

This is **0.5.27-rc.3** (rc.1 plus the mission fixes in `RELEASE-v0.5.27-rc.2.md` and the cash, kit and Banana Basket changes in `RELEASE-v0.5.27-rc.3.md`), **an audit-implementation candidate**. It is not the approved complete release. `IMPLEMENTATION-STATUS.md` lists the implemented, partial and open requirements. Keep **v0.5.24** as the approved comparison baseline.

No GitHub commit, tag, release, hosted manifest or Forge installation was changed. The manifest's versioned download URL is a proposed publication target; it has **not** been published. Do not use it as an installation link.

## Before testing

1. Stop the live campaign and back up its full world data and media, plus the exact currently installed system (which may be v0.5.26 or either parent candidate). Keep the approved v0.5.24 ZIP independently as the comparison baseline.
2. Prefer a separate Foundry test instance. A cloned world in the same instance still shares the installed system with other worlds; do not launch production worlds against this candidate.
3. With the test instance stopped, extract this archive into its `Data/systems/the-smoke/` folder. `system.json` must sit directly in that folder, not inside a second nested folder. For hosted deployment, use the host's supported package-upload workflow on the test game, not the un-published URL.
4. Start the test instance in Foundry v14, open the cloned world as GM, and inspect startup errors. Do not discard the original data if migration or compendium loading fails.
5. Open the items, people and guides compendiums first. These three packs were rebuilt and structurally validated offline; native Foundry loading is not yet certified.
6. Follow `LIVE-ACCEPTANCE.md` with a GM and separate player browser session. Existing active missions keep their progress and carry on; a job rc.1 froze for GM review is released when the world loads, with a note in its log.

## What is visibly different

On a Roll / Off Your Game are on the **Street/main stats** tab. The sheet has one **Blower** button, sized for its label. The mission board displays required locations/actions and contribution gaps. Named counter tokens open location-specific shop/service menus. Some previously permissive actions now reject invalid context rather than silently granting a bonus.

## Rollback

Stop the test instance. Restore both the backed-up world and the approved v0.5.24 system. Do not treat replacing only system files as a guaranteed reversal of saved-world changes. Never overwrite the original baseline ZIP or its hash snapshot with this candidate.

## Build evidence

The companion engineering/evidence ZIP contains the full comparison report, baseline hashes, retained regression checker, test logs, snapshot-verification results, new test sources and source diff. Node/document tests are not a substitute for multiplayer Foundry/Forge acceptance.

## Combined-branch checks

Verify Token Builder save/reopen and generated image persistence, hired hands, new police controls, graffiti presets and pieces, alongside mission receipts, local counters and item recovery. Source/guide migration retains custom edits via backups and leaves user-added pages intact; test this on the copied world. See MERGE-REPORT.md for the combined counts and inheritance limits.
