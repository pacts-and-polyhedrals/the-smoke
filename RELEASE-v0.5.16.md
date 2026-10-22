# The Smoke v0.5.16 — full-system audit and debug release

Built from the v0.5.15 ZIP. Every module was audited; 27 bugs were fixed and four improvements added. The full findings table, the checks that were run and what was deliberately left alone are in **AUDIT-v0.5.16.md**; the player-facing summary is in CHANGELOG.md.

Highlights:
- Missions can no longer be passed (and paid) twice by events arriving together.
- A chase no longer freezes characters and police that aren't part of it; reinforcements join it.
- Unanswered driving cards no longer strand vehicles outside a chase; GMs can clear stuck checks from the vehicle sheet.
- Teamwork/roll-request answers are all recorded when players roll together.
- Leader-side checks on remote rolls, cable ties, toolkit repairs, fire and hidden paint spots.

## Publish

1. Back up your world (test on a clone if you can).
2. Create a new GitHub release on `pacts-and-polyhedrals/the-smoke` tagged **`v0.5.16`**, as a normal release marked **Latest**.
3. Upload the two assets separately with these exact names: **`the-smoke-v0.5.16.zip`** and **`system.json`**.
4. Update The Smoke on Forge through the existing manifest URL: `https://github.com/pacts-and-polyhedrals/the-smoke/releases/latest/download/system.json`.
5. Restart the world and run the live acceptance list at the end of AUDIT-v0.5.16.md.

Journals stay on content edition 0.5.3, so your edited guide pages are not touched by this update.
