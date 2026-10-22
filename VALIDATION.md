## v0.5.24 right-click validation

- `node tests/run-all.mjs`: **59/59 suites passed** (58 + `player-right-click.test.mjs`).
- The new test builds a token the way Foundry draws one before the system patches anything, with its right-click handlers held by its interaction manager.
  - Before the fix: a player had no right-click on it.
  - After the fix: the right-click opens the street menu, and Pat's order bike offers Nick it.
  - An NPC-driven car offers Carjack; a police unit doesn't.
  - Installing twice (init, then ready) is safe.
- This is not a live Foundry run. Foundry's own drawing code was modelled, not executed.

## v0.5.23 sat nav, graffiti and sweep validation

- `node tests/run-all.mjs`: **58/58 suites passed**. New: `tagging-missions-e2e`, `satnav-missions`, `jobs-e2e`. Extended: `missions`.
- **Sat nav:** all 179 missions at 1,788 points, in order and with single out-of-order GM ticks: 0 wrong (0.5.21: 112 missions wrong somewhere).
- **Graffiti:** all 42 commissions painted through `graffiti.paint` with Tag Studio's own choices. Every objective ticks, and every commission passes.
  - Shortfall cases each give a clear note: too rough, free paint, not on the job.
  - **Update who's on it** makes the commission available to the added character.
- **Jobs:** taxi, courier, ambulance, fire, bus, police (disturbance, ANPR, pursuit) and Pat's order, from callout to pay-out.
- **Fuzz:** 90 handlers × player/GM × empty/stale payloads; 3 crashes fixed, 0 left. All Foundry hook listeners called with bare documents: no system errors (only the test environment's missing `HTMLElement`).
- **Static:** all 83 modules import; handlers, settings, hooks and template buttons cross-referenced; mission, site, vehicle and venue data checked. ESLint: no new problems. Templates: 16 compiled, 95 renders.
- **Not a live Foundry run.**

## v0.5.22 Heat, stability and bus validation

- `node tests/run-all.mjs`: **55/55 suites passed** (52 + `heat-scaling`, `heat-guides`, `slow-guard`; `chase`, `requests` and `tagging-mission-canvas` updated to the new rules).
- **Heat ladder:** every crime's ceiling, police witnesses, repeated petty crime, the old carjack-then-drive-off route (now 1★), gunfire capped at 3★, and killings at 4★/5★.
- **Police response:** 0/1/2/2/3/6 vehicles by star; at 5★ on a test map, 4 vehicles plus the helicopter. Dropping to 2★ sends 3 unseen units home; a car within sight of a character stays.
- **Killings:** checked on both damage paths. A fist knockout is not a killing.
- **Slow guard:** two long steps in a row rest the loop for 15 s, with one GM card.
- **Guides:** pack and JSON are equal for all 270 pages, with text fingerprints matching. In a mock world the migration refreshes an untouched page and a page from an older release, keeps a GM-edited page, and runs once.
- **Bus sites:** each gets a 2×6 parked, locked bus on the road; a 0.5.21 marker is swapped.
- **The freeze was not reproduced** (there is no live Foundry server here); the fixes target the write load found in the code.
- ESLint on the changed files: no new problems. Templates: 16 compiled, 95 renders. Imports: 0 unresolved.

## v0.5.19 reinforcements validation

- `node tests/run-all.mjs`: **49/49 suites passed** (48 + `police-reinforcements.test.mjs`; `audit-chase.test.mjs` updated to the new rule).
- Reproduced on the 0.5.18 code first, in the same harness: with an ordinary fight on, the police unit hunting the fighter was still in the real-time driving list and was not added to the fight when the round began. On 0.5.19: it joins at Begin round with dice; a unit dispatched mid-round joins the tracker at once as NEXT ROUND and never moves in real time; next round it is dealt dice; on its go it drives closer, and once close two officers get out and join while the car parks and leaves the tracker; in a chase, a unit dispatched while dice are being rolled is dealt dice that round, however far away; a unit after somebody outside the chase keeps driving and stays off the tracker.
- ESLint on the changed files: no new problems. Templates: 16 compiled, 95 renders. Imports: 0 unresolved.

## v0.5.18 escape-move validation

- `node tests/run-all.mjs`: **48/48 suites passed** (47 + `escape-move.test.mjs`; `chase-decisions.test.mjs` updated).
- Reproduced on the 0.5.17 code first, with the same chase harness: pressing the escape card's button before moving ended the opening ("still in sight") and the next drag was refused with "Wait for your own turn"; a drag made *before* pressing it did move. On 0.5.18 the drag moves the escaper out of turn through the real token-update path, a drag past six squares stops at six and ends the escape, Done before moving is refused for players, and another character's open police card no longer blocks the escaper.
- The map ring was exercised with a stand-in canvas (radius = squares left, centred on the escaper). ESLint on the changed files: no new problems. Templates: 16 compiled, 95 renders. Imports: 0 unresolved.

## v0.5.17 speed dice & scrolling validation

- `node tests/run-all.mjs`: **47/47 suites passed** (46 existing + `speed-dice-refresh.test.mjs`). Per-suite results are in `tests/TEST-RESULTS.txt`.
- The stuck-surrender bug was reproduced on the 0.5.16 release code before the fix: 2 speed dice in the first fight; after surrendering, ending the fight from the core tracker and resting, 0 in the next fight. The new suite checks every way a fight can end, rest, Busted, Wasted, saves already stuck from 0.5.16, Cuffed, late arrivals and Stunned.
- Scrolling, in headless Chromium with a strict Foundry-style frame (window content clipped): all 16 window templates, every context in `tests/template-contexts.mjs`, every sheet tab, with and without long lists, at the default size, 520 px and 380 px tall — 0.5.16: 24 renders with unreachable content (Street Control, Tag Studio, Shop rail); 0.5.17: 0. Dialogs (60-seat bus list; services with a forced tall height) and Token HUD columns (vehicle at the bottom edge, GM buttons, small screen) — 0.5.16: 4 of 5 cases with unreachable buttons; 0.5.17: all reachable.
- ESLint on the changed files: 0 problems. Templates: 16 compiled, 95 renders. Imports: 0 unresolved.
- Still not a live Foundry/Forge run: see the checks at the end of RELEASE-v0.5.17.md.

## v0.5.16 audit validation

- `node tests/run-all.mjs`: **46/46 suites passed** (44 existing + `audit-world.test.mjs` and `audit-chase.test.mjs`). Per-suite results are in `tests/TEST-RESULTS.txt`.
- Static checks across all 134 JavaScript files: `node --check`, ESLint 9 with Foundry globals (0 real errors), import/export resolution (0 unresolved), 1,542 asset paths in code, data and packs (0 missing), 11 LevelDB packs opened and every record parsed, 3,600 compendium links (0 broken), 16 templates / 95 renders, CSS parse (0 errors), language keys (0 missing). Details and every finding: AUDIT-v0.5.16.md.
- The mission double-payment bug was reproduced against the v0.5.15 code (paid twice) before the fix; the new test fails on that code and passes on 0.5.16.
- Still not a live Foundry/Forge multiplayer run: see the acceptance list in AUDIT-v0.5.16.md.

## v0.5.6 supplemental validation — conditions and mission property

- `node tests/run-all.mjs`: **32/32 suites passed** on the development source, including `watch-conditions.test.mjs`, `mission-props-transit.test.mjs`, `mission-property-catalogue.test.mjs`, and chase/police integration tests. Re-run after the ZIP is extracted; results are preserved in `tests/TEST-RESULTS.txt`.
- `watch-conditions.test.mjs` specifically verifies stopped watch vs wall-time jump, paced countdown, high→comedown transition, no repeated updates, fast-forward catch-up through multiple timed stages, permanence of physical conditions, manual-sheet effects, matching published item durations, one-time conversion of legacy timers, and a Foundry world-time update hook.
- A passing test suite is **not** a live Foundry/Forge multiplayer verification. Complete `CONDITIONS-WATCH.md` and `MISSIONS.md` test instructions in a cloned world before promotion.

---

# Validation · The Smoke v0.5.3

## Completed checks

The live-reported stuck-success bug was reproduced before the fix using Foundry-style object merging: a successful automatic evasion still left one open prompt. The new driving-prompt suite now passes automatic/manual resolution, actual chat-hook handling, explicit flag deletion, 36 outcome combinations across yellow/red driving, green/red evasions, PIT saves and ram defences, movement and Console gates, concurrent/repeated damage protection, failure of the final deletion, preservation of an outcome needing GM review, completed-button clicks, actor matching and recovery of old saved checks without rerolling or repeating damage. Chase stand-ins now reproduce the server’s merge/deletion semantics.


- **23 automated suites** pass with the actual system modules and Foundry document/socket/hook stand-ins. Per-suite results are in `tests/TEST-RESULTS.txt`.
- Journal upgrade coverage checks GM-only backups of edited shipped pages, aborting replacement if backup creation fails, stable page IDs, renamed-page matching, preserving user-created notes, style-only changes, and idempotent same-edition setup. The older venue suite also checks preservation of subsequent local edits.
- `node scripts/journals/verify.mjs` checks **27 journals / 270 pages**, **3,600 guide links**, **297 LevelDB records**, all **31 conditions**, **33 Rep levels**, every library item and motor, and current mechanical summaries for all **125 missions**. Both JSON sources and the prebuilt compendium match page for page, including ownership and flags. All page image paths exist. Public guide links stay within public journals.
- All **265 original page IDs** remain present. Five new reference pages use deterministic IDs. Rebuilding the guide content twice produces identical HTML.
- Chromium rendered every page at **1100px and 390px** viewport widths: **540 page layouts**, with no document-width overflow or missing images. Tables scroll within their panels on narrow screens. Screenshots of the welcome, conditions, chase, mission and phone-handout pages were inspected; table contrast and numbered-list spacing were corrected.
- Every project JavaScript module passes `node --check`; JSON files parse. Developer node_modules are excluded from the release.
- The full release ZIP is built with its root `system.json`, modules, templates, styles, JSON data, maps, art and compendiums. Packaging verifies CRCs, extracts every file, compares source hashes and verifies the manifest. The saved downloadable copy is read back and checked before delivery. A previous truncated ZIP is superseded by this release.

The chase regression suites cover real convoy movement and native player-owned vehicle drags in ordinary travel, automatic/manual evasions, movement and response locks, prompts older than an hour, one-time automation-default migration, Story/Self-play permissions, shared traffic batches, one finite escape opportunity, zero-star resolution, custody after failed stops, crime-aware armed enforcement, incoming-hit gates, cancellation during the reading delay and duplicate Done clicks. Existing coverage also checks ram responses before damage, PITs, crashes, fire and star-by-star escape.

## Live acceptance still required

There is no licensed Foundry 14 / Forge server or real multi-user canvas in this environment. Chromium checks the bundled journal HTML/CSS, not Foundry's journal editor or its actual document permissions. Compatibility declares minimum 14 without a verified-live claim.

1. In a copied older world, log in as active GM, wait for the 0.5.3 upgrade card and open Guide Index. Confirm all journal styles, current rules and cross-links. Edit a shipped page and add a custom page before upgrading: verify the edited text is in a GM-only Backup journal and the custom page remains.
2. Import a guide from the compendium in a new test world and compare its text/style with the setup-created copy. Check GM-only mission and venue entries from a player account.
3. Board a driver and passenger, drive through a parked motor and check the automatic Wheels/incident result. Disable automatic evasion and resolve the manual card.
4. Start a chase in Story and Self-play. Confirm separate police/PC entries, one shared traffic phase, Continue after each NPC action, all pending responses holding the queue and Begin round waiting at round end.
5. Test a successful talk response and its one foot/vehicle escape move; test a failed ordinary stop and custody; test a high-Heat recorded gun crime and the answerable armed response. Surrender must still go to custody.
6. Resolve a police ram, PIT save and Take hit/Dodge before advancing. Pause or turn Assist off during its delay; verify later actions do not run themselves.
7. Stay clear for successive rounds to lose stars to zero. Cross a district boundary after resolving cards and confirm a destination-map chase with a new round.

8. In the existing affected world, keep its successful driving roll and restart as GM. Confirm the completed pending lock is removed with Health/Body and dice unchanged. Repeat yellow/red checks, evasions, PITs and ram saves; Done/Continue must become available after each answer.
