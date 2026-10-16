# Install or upgrade The Smoke v0.4.0

## Local Foundry 14

1. Back up the world, then close it.
2. Extract `the-smoke-v0.4.0.zip` (about 75 MB) into your Foundry User Data folder at `Data/systems/the-smoke/`. The result must be `Data/systems/the-smoke/system.json`, without an extra nested folder.
3. Replace the old system files; keep your worlds in `Data/worlds/`.
4. Restart Foundry and launch a world using The Smoke. Keep optional modules disabled for the first acceptance run.
5. New world: Street Control → **Set up the world**. Existing world (v0.1.0–0.1.3, v0.2.x or v0.3.0): wait for the active GM's upgrade card before players join. Guide pages you have not edited are refreshed (the Venue Register gains its maps); pages you wrote in are left as they are. The upgrade keeps edited actors, notes, ownership and positions, and adds missing content.
6. Run the live checks in VALIDATION.md.

## The Forge, without publishing first

Use the Forge's **Summon Import Wizard** to import the release ZIP as a custom system. If the wizard offers **Install found packages from the Bazaar**, leave it unchecked so an older published copy cannot replace your custom build. Use Foundry 14 and confirm the installed system version reads 0.4.0 before launching the world.

Official Forge instructions:
- https://forums.forge-vtt.com/t/how-to-upload-a-modified-version-of-a-module-system/10510
- https://forums.forge-vtt.com/t/importing-worlds-modules-systems-w-video-tutorial/454

## Publish a manifest-installable GitHub release

The manifest points to `pacts-and-polyhedrals/the-smoke`, tag `v0.4.0`.

1. Update the repository's system files with the contents of the ZIP, at the repository's package root.
2. Create a release tagged `v0.4.0`.
3. Attach both files with these exact names: `the-smoke-v0.4.0.zip` and `system.json`.
4. Publish the release and mark it **Latest** (after the live test run if you prefer). Open both download links to confirm they are reachable.
5. Install or update from this manifest URL:

https://github.com/pacts-and-polyhedrals/the-smoke/releases/latest/download/system.json

That URL only points to this version once its release is uploaded and marked Latest.
