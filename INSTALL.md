**v0.5.24 update:** Back up the world. Upload `the-smoke-v0.5.24.zip` and `system.json` as two separate assets on GitHub release `v0.5.24`, mark Latest, and update Forge via the existing manifest. Players should reload their page after the update. See `RELEASE-v0.5.24.md`.

**v0.5.23 update:** Back up the world. Upload `the-smoke-v0.5.23.zip` and `system.json` as two separate assets on GitHub release `v0.5.23`, mark Latest, and update Forge via the existing manifest. Nothing in the world needs migrating: running missions keep their progress, and the sat nav picks up the new routing at once. See `RELEASE-v0.5.23.md`.

**v0.5.22 update:** Back up the world. Upload `the-smoke-v0.5.22.zip` and `system.json` as two separate assets on GitHub release `v0.5.22`, mark Latest and update Forge via the existing manifest. On the first GM login, the four Heat guide pages refresh if you haven't edited them; a GM note lists any that were kept. If the table still feels crowded, lower **Settings → Heat: most police vehicles on a map**. If a **SLOW DOWN** card appears, also lower **Street Life: moving cars per map** or raise **seconds between traffic moves**. See `RELEASE-v0.5.22.md`.

**v0.5.21 update:** Back up the world. Upload `the-smoke-v0.5.21.zip` and `system.json` as two separate assets on GitHub release `v0.5.21`, mark Latest and update Forge via the existing manifest. Start or revisit an active graffiti commission: its mission paint canvas appears on the target street automatically. If a marker has been lost, the GM can open Mission Board → **Repair / prepare mission canvases** to restore targets on all the mission maps. Placeholders for sites without exact street addresses are flagged approximate and can be moved by the GM. See `RELEASE-v0.5.21.md`.

**v0.5.20 update:** Back up your world. Create release `v0.5.20` marked **Latest** with two separate assets `the-smoke-v0.5.20.zip` and `system.json`; use the same existing releases/latest/download/system.json manifest in Forge. Start in a test-world copy: verify police Talk now rolls despite an unrelated hit, auto chase rounds advance, a moving taxi has a seated cabbie and fare, and a carjack ejects the real NPCs. No compendiums were rebuilt; see RELEASE-v0.5.20.md.

**v0.5.19 update:** Back up your world. Create release `v0.5.19` (marked Latest) with two separate assets, `the-smoke-v0.5.19.zip` and `system.json`, and update through the existing releases/latest/download/system.json manifest URL. Nothing to migrate: police already on a map join a fight or chase at its next *Begin round*. Journals and compendiums are unchanged.

**v0.5.18 update:** Back up your world. Create release `v0.5.18` (marked Latest) with two separate assets, `the-smoke-v0.5.18.zip` and `system.json`, and update through the existing releases/latest/download/system.json manifest URL. Nothing to migrate. Journals and compendiums are unchanged.

**v0.5.17 update:** Back up your world. Create release `v0.5.17` (marked Latest) with two separate assets, `the-smoke-v0.5.17.zip` and `system.json`, and update through the existing releases/latest/download/system.json manifest URL. Nothing to migrate by hand: when the GM loads the world, anyone left marked as surrendered from an earlier fight is stood back up automatically. Journals and compendiums are unchanged.

**v0.5.16 update:** Back up your world. Create release `v0.5.16` (marked Latest) with two separate assets, `the-smoke-v0.5.16.zip` and `system.json`, and update through the existing releases/latest/download/system.json manifest URL. Nothing to migrate: journals and compendiums are unchanged. After updating, run the live acceptance list at the end of [AUDIT-v0.5.16.md](AUDIT-v0.5.16.md) (chase with a bystander character, a stuck evasive card, two crew finishing a mission together, a teamwork request).

**v0.5.15 beta update:** Create release `v0.5.15` containing two separate assets: `the-smoke-v0.5.15.zip` and `system.json`. Use the existing releases/latest/download/system.json manifest URL. Back up your world first. After update: test two accounts (player sees only in-game studio request actions; GM sees real contact links and the new Studio Inbox), send and privately reply, schedule an announcement, advance Banana Watch by resting eight hours. See RADIO.md and BETA-LEGAL-CHECKLIST.md.

**v0.5.14 update:** Back up your world. Publish `the-smoke-v0.5.14.zip` and standalone `system.json` as separate GitHub release assets tagged `v0.5.14`, then update Forge through the existing manifest URL. The release repairs token drop/drag and adds 8-hour Watch rests, six radio-war contacts and twelve radio-war missions. See [RADIO-WARS.md](RADIO-WARS.md).

# The Smoke v0.5.9 — Foundry / Forge installation and update

## Keep the existing manifest URL

`https://github.com/pacts-and-polyhedrals/the-smoke/releases/latest/download/system.json`

This is the *same* workflow as before, not the Import Wizard.

1. Back up your live world; preferably test the update in a clone.
2. Create a **new** GitHub release of `pacts-and-polyhedrals/the-smoke`, tagged **`v0.5.9`**. Make it a normal release, not a prerelease, so that `releases/latest` finds it.
3. Upload two assets separately, preserving the exact filenames: **`the-smoke-v0.5.9.zip`** and **`system.json`**.
4. Publish. Verify the release asset URL `https://github.com/pacts-and-polyhedrals/the-smoke/releases/download/v0.5.9/the-smoke-v0.5.9.zip` and the existing manifest URL both resolve.
5. Update The Smoke in Forge using the same manifest/install path. Restart the Foundry server if necessary.
6. Verify the system reports v0.5.9, the mint diamond logo appears in the Foundry system description and the branded Setup/world images render. Check the Blower, GM Screen, Mission Board and Tag Studio headers.
7. Perform a gameplay smoke test (vehicle movement, player Street Actions, one mission delivery, a graffiti placement) to check nothing else changed.

## About the package imagery

The original website logos and graphics are bundled locally in `assets/branding`. Images displayed in the manifest before installation use the existing public `the-smoke-web` GitHub repository; no additional release assets are necessary.

Foundry's `background` property is a *default for newly created worlds*. An existing world's own welcome/join-page background does not change automatically.

If an independently customised Forge Bazaar store listing continues to show the old description or screenshots, edit the product's separate details through the Forge Creator Dashboard. Forge allows overrides to those fields independent of `system.json`.

This patch changes the branding and listing. It is not a live Forge verification or a published release. The module/content journal edition stays on its intended independent version.
