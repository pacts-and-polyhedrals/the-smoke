# The Smoke v0.5.27-rc.1 - systematic combined build

> **0.5.27-rc.2** keeps everything below and fixes the mission automation on top: jobs tick from what the crew do (shared cars, nicked motors, sales, set-up that never blocks), players and the GM can mark steps done, the sat nav goes where the step is, and checkpoints sit where their objectives say. See `RELEASE-v0.5.27-rc.2.md` and the rc.2 section of `IMPLEMENTATION-STATUS.md`.
>
> **0.5.27-rc.3** adds: cash and kit added on a character's token count (character tokens linked, copies folded in), Self-play money and kit through play with full GM control, and Banana Basket phone orders to the flat. See `RELEASE-v0.5.27-rc.3.md`.

**Status: merged test candidate, not an approved production release.** This combines the uploaded **v0.5.26** with the mission/venue/item implementation **v0.5.25-rc.1**, using the complete uploaded **v0.5.24** archive as the immutable approved comparison baseline. No GitHub release, hosted manifest or Forge installation was changed. This merge does not convert inherited partial audit work into completed features.

## What is in the combined build

| Area | Preserved / reconciled result |
|---|---|
| Missions | All 179 missions, 894 located checkpoint contracts, run/object/actor evidence, prerequisites, scaled resources, contribution checks and recovery from the audit branch. All 179 expanded narrative GM files from the new branch are retained. |
| World and venues | All 236 scene documents, 160 venue interiors and 51 approaches; 199 counter profiles; 70 retail, 42 conditional and 48 non-retail interiors. The incoming venue/job destination coverage is retained. |
| Items | **247** catalogue items = 171 original + 67 audit additions + 9 new stat-balancing perks. Condition catalogue remains separately **31** entries. |
| Characters | Token Builder (109 parts, 14 categories, 16 presets), creator integration, persisted recipes, sheet Edit/Randomise, 12 backgrounds and nine new perks. |
| Rep and hires | Hired hands from Rep 13, nine stat-specialist roles, slot progression, Pat's higher-Rep orders and car jobs. |
| Police and controls | Known-face Long Shot talk, Say nothing / Bottle, new chase/driving switches and GM base Guard retained alongside audit contexts and earlier chase/vehicle fixes. |
| Graffiti | Incoming piece renderer, 16 new piece styles, 23 characters, 90 presets and all 78 six-quality static SVG finishes. Existing classic styles, persistent decals, 42 commissions and mission-site placement remain. |
| Guides and NPCs | **29 journals / 328 pages**; 40 basic NPCs including the audit's Big Sal and ARV restraint loadout; 108 campaign cast actors remain in their separate pack. |
| Sheet | On a Roll and Off Your Game are on Street/main stats only; one labeled Blower remains. Token editing and GM Guard controls remain. Header actions use a compact grid rather than five tall rows. |

## How the merge was performed

The complete three trees were extracted independently and hashed. Across **1,598 input paths**, 1,142 were unchanged, 372 were changed/added only by the incoming branch, 58 only by the audit branch, and **26 paths were changed on both sides**. The latter were reconciled by common-ancestor text merge or record identity, not by choosing the higher version number.

JSON collections were merged by stable IDs/names. All item, actor, journal and page IDs from all three inputs remain. Binary LevelDB files were **not** text-merged or blindly copied over each other: the changed items, people and guides packs were rebuilt from the combined canonical records. Every prior root and embedded ID is checked before rebuild. Folder records, metadata and source/pack correspondence were verified. Original artwork from each input is protected by exact SHA-256 checks.

### Overlapping paths and resolution

| Path | Resolution |
|---|---|
| `CHANGELOG.md` | Both histories retained under a new combined-release entry. |
| `SOURCE-CHECKSUMS.sha256` | Regenerated from the final combined package; never merged stale checksums. |
| `data/build-info.json` | New provenance for all three archives and actual combined counts; explicitly unpublished/test candidate. |
| `data/content.json` | Union of stable item/actor/journal/page IDs; both sets of guide changes reconciled. |
| `data/guide-history.json` | Preserve recognised page hashes from both branch histories and the common ancestor. |
| `data/london-guides.json` | Synchronized to the combined canonical guide content, not an older branch. |
| `data/london-items.json` | 247-item union; both runtime catalogue and compendium source agree. |
| `module/apps/phone.mjs` | Keep hires and chase controls plus scaled mission counts / audit state. |
| `module/content.mjs` | Keep incoming edition backup/migration behaviour and audit imports; stamp combined version. |
| `module/data-models.mjs` | Keep token recipe ObjectField and audit restricted-item fields. |
| `module/world/heat.mjs` | Retain incoming chase toggle handling and audit Ghost cooling. |
| `module/world/incidents.mjs` | Retain driving toggle behaviour, validated contexts and protective equipment effects. |
| `module/world/jobs.mjs` | Retain incoming Rep orders/venue coverage and audit Courier/Cabbie effects. |
| `module/world/pursuit.mjs` | Combine known-face difficulty/Say nothing with validated police roll contexts. |
| `module/world/theft.mjs` | Retain incoming theft changes and audit identity-bound mission receipts. |
| `packs/guides/000018.ldb` | Rebuild the whole compendium from merged canonical documents; verify IDs/embedded records/CRC/readback, not binary overwrite. |
| `packs/guides/MANIFEST-000014` | Rebuild the whole compendium from merged canonical documents; verify IDs/embedded records/CRC/readback, not binary overwrite. |
| `packs/london-items/000005.ldb` | Rebuild the whole compendium from merged canonical documents; verify IDs/embedded records/CRC/readback, not binary overwrite. |
| `packs/london-items/MANIFEST-000002` | Rebuild the whole compendium from merged canonical documents; verify IDs/embedded records/CRC/readback, not binary overwrite. |
| `styles/the-smoke.css` | Preserve both CSS additions; compact combined sheet header without removing actions. |
| `system.json` | Retain branding/registration; stamp 0.5.27-rc.1 and an explicitly unpublished download target. |
| `templates/actor-sheet.hbs` | Main-stat toggles and one Blower; incoming Token Builder, Randomise and GM base Guard. |
| `tests/branding-manifest.test.mjs` | Update only expected combined release version; retain manifest assertions. |
| `tests/branding-release.test.mjs` | Update only expected combined release version; retain branding assertions. |
| `tests/merged-0-1-3.test.mjs` | Retain old subsystem protection and combined content expectations. |
| `the-smoke.mjs` | Register/start both branches: token tools/hires plus mission automation, venues and item safety. |

## Integration repairs beyond a mechanical merge

**New perks and strict item rules.** The incoming nine perks were unknown to the audit's contextual whitelist. Without a bridge they would exist in the catalogue but not be eligible. The combined build adds validated context for theft/hotwiring, nearby pickpocketing, police silence, first-round first-shot use, thrown weapons, persisted mission attempts and genuine GM-authored requests. Arbitrary client-provided tag lists do not grant bonuses. Written circumstances that have no world producer still require the audit's recorded GM approval; this is not a claim that every fiction phrase is automatically understood.

**Last thrown item.** The final thrown item used to be deleted before the roll, removing the trusted weapon record needed to recognise Good Arm. It is now reserved at zero quantity during that roll and removed afterward, including cancellation/error cleanup. This preserves the prior spend-before-roll behaviour rather than making cancelled throws free.

**Mission guide contradictions.** Incoming story files retained old GM/Self-play tick instructions. Their live-rule tables now describe the actual verified checkpoint contracts, mandatory Rep gates and scaled counts. Read-aloud prose, optional scene checks, cast and GM notes are retained. Each of the 179 files has a separate live-contract panel with locations and evidence. CH1's UI captions now say assigned bikes rather than insisting on two when four are required. Its authored two-person dialogue is explicitly an adaptable story example.

**Upgrade guard.** The original 48-feature v0.5.24 archive gate is unchanged. The incoming 1,725-trace capability snapshot remains unchanged as an additional guard; 79 incoming capability probes plus eight audit/merge protections give **87** probes. `node scripts/capabilities.mjs` updates documentation only. An optional proposal is written to a different file, never silently replacing an approved baseline.

## Verification and limits

The three inputs were tested first: **59 suites** on v0.5.24, **65** on the audit candidate, **66** on v0.5.26. Their union contains **72 distinct suite files**; all remain. Two new integration/preservation suites bring the combined total to **74 passing suites** in the working build. The final ZIP receives the full v0.5.24 gate separately; its exact result and archive hash are in the companion verification report.

Tests include 1,074 mission/crew contract projections, 716 simulated preflights, 199 counter profiles, item failure-injection/retry checks, token compositions, hires, all incoming graffiti tests and a byte-level comparison of all incoming artwork. These are Node/document simulations, not 179 successful live campaign play-throughs.

The compact sheet was rendered as an offline Chromium fixture for player and GM at 800, 520 and 380-pixel heights. Both main-stat toggles are reachable, there is one Blower, token controls are present and the base Guard field is GM-only. Foundry icons and live application/document behaviour are not certified by that fixture.

The three rebuilt compendiums pass source equality, duplicate-ID checks, embedded-ID retention, snapshot readback, CRC32C, manifest size/bounds and sequence ordering. Native Foundry loading is still **NOT RUN**.

## Inherited open work - not hidden by the merge

The audit implementation ledger remains authoritative for unfinished bespoke mission scenarios: CH3's cross-map moving-van route, full race/escort behaviour, some career vehicles, heavy cargo and seats, branch consequences, detailed per-person graffiti/radio workload and supplies. Likewise, physical admission barriers, complete transit fares, named staff shifts, per-drug police-search Heat, some device/job contexts and fire/line-of-sight edge cases are not all complete.

The incoming art does resolve the previous absence of the 78 static SVG finishes. Thirteen legacy **WebP export template strings** still point to unbuilt optional raster exports; the runtime uses the shipped SVG/piece engine, not these strings. Three railway targets remain markers rather than train vehicles. No existing world was available for migration or two-client acceptance.

Do not mistake feature-preservation checks for proof that every inherited feature is bug-free. The merged package is a test candidate until its live checklist is signed off. Keep the original v0.5.24 baseline and backups of whichever branch is currently installed.

## Testing and rollback

Use **INSTALL-CANDIDATE.md**, then **LIVE-ACCEPTANCE.md**, in a separate Foundry test instance with a copied world. A cloned world in the same instance still shares its installed system. Back up world data/media and the exact currently installed system; an upgrade can change saved data, so rollback means restoring both, not merely swapping system files.

Do not upload this RC as GitHub Latest or update your production game from its proposed download URL. No publication has occurred. Do not regenerate guides with the old branch-specific source generators: `data/content.json` and the synchronized `data/london-guides.json` are the combined canonical outputs. `python scripts/release/rebuild_packs.py` verifies them against the built packs; `--write` is for an offline backed-up build tree only.

## Input provenance

| Input | Bytes | SHA-256 |
|---|---:|---|
| `the-smoke-v0.5.24.zip` | 83,512,826 | `eb9af5ecff5f8fc8a5b1b6194fa7adcf09944bc153e58ff8a4bce673a43f91fe` |
| `the-smoke-v0.5.25-rc.1.zip` | 83,705,422 | `16cb49073c9abbb13e38f7c833d32d00e3d577d26dac5bd4406f5b0d68a14bc9` |
| `the-smoke-v0.5.26.zip` | 87,070,904 | `f1e94917d3f0c72b04c9c99b88780e0c40eb37012274d41d6be7d8744a326ec5` |
