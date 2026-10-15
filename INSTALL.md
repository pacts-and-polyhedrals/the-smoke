# Install or upgrade The Smoke v0.1.2

## Local Foundry 14

1. Back up the world, then close it.
2. Extract `the-smoke-v0.1.2.zip` into your Foundry User Data folder at `Data/systems/the-smoke/`. The result must be `Data/systems/the-smoke/system.json`, without an extra nested folder.
3. Replace the old system files; keep your worlds in `Data/worlds/`.
4. Restart Foundry and launch a world using The Smoke. Keep optional modules disabled for the first acceptance run.
5. New world: Street Control → Set up the world. Existing world: wait for the active GM’s upgrade notice before players join. The upgrade preserves edited actor data and adds missing content.
6. Run the live checks in VALIDATION.md.

## The Forge, without publishing first

Use the Forge’s **Summon Import Wizard** to import the release ZIP as a custom system. If the wizard offers **Install found packages from the Bazaar**, leave it unchecked so an older published copy cannot replace your custom build. Use Foundry 14 and confirm the installed system version reads 0.1.2 before launching the world.

Official Forge instructions:
- https://forums.forge-vtt.com/t/how-to-upload-a-modified-version-of-a-module-system/10510
- https://forums.forge-vtt.com/t/importing-worlds-modules-systems-w-video-tutorial/454

This build has not been installed into a live Forge account. Complete VALIDATION.md in a test world before a scheduled campaign.

## Publish a manifest-installable GitHub release

The prepared manifest points to `pacts-and-polyhedrals/the-smoke`, tag `v0.1.2`. The connected account had read-only repository access during this build, so no repository files or releases were changed.

1. Update the repository’s system files from the source bundle’s `the-smoke/` directory, preserving that directory’s contents at the repository’s package root.
2. Create a release tagged `v0.1.2`.
3. Attach both files, with these exact names: `the-smoke-v0.1.2.zip` and `system.json`.
4. Publish the release after the live test run. Open both download links to confirm the assets are reachable.
5. Install/update from this manifest URL:

https://github.com/pacts-and-polyhedrals/the-smoke/releases/latest/download/system.json

That URL will only point to this version after its release is uploaded and selected as latest. A ChatGPT file link is not a Foundry manifest URL.
