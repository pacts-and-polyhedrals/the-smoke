# The Smoke v0.5.19 — more stars mid-fight: police join the combat tracker

Built on v0.5.18, so it includes 0.5.17 (speed dice, scrolling) and 0.5.18 (escape move).

## What was going wrong
When Heat went up during a turn-based fight (a shot fired, a cop assaulted), the new units were placed on the map, and then the police driver moved **every police unit on the map every second, in real time**, while the fighters waited for their speed dice. Cars piled in between turns. In a chase, the units already in it waited for their dice, but any unit that wasn't (including the new ones) kept driving in real time until it got close, and only then joined at the end of a round. In an ordinary fight, police cars never went on the tracker at all. Reproduced on 0.5.18: with a fight on, the unit hunting the fighter was still driving in real time and never joined the fight.

## What it does now
- **While a fight or chase is on, police hunting someone in it go on its combat tracker.** That covers units already on the map and units dispatched when the stars go up. They move only on their own speed dice, never in between turns.
  - Dispatched **while the dice are being rolled**: dealt in straight away, so they roll this round.
  - Dispatched **after the reveal**: on the tracker as **NEXT ROUND** and dealt in when the next round begins.
  - The dispatch card says "*n* join the fight/chase on the combat tracker and roll speed dice …". **Begin round** also picks up any police who have arrived since, so nobody is missed.
- **In an ordinary fight**, a police car on the tracker takes its go like this (the GM presses **Police AI** on its turn, or **Done** to skip it): it drives in along the roads, and once it's within about six squares, **two officers get out** (armed officers at 4★) and join the fight on foot. The car parks up and leaves the tracker.
- **In a chase**, every unit hunting someone in the chase is on the tracker however far away it is, and closes in on its own dice.
- Unchanged: units hunting somebody **outside** every fight keep driving in real time. The helicopter is never on the tracker; it moves once a round in a chase and now holds station over a fight.

## Files
`module/world/heat.mjs` (`huntingUnits`, `combatFor`, `enlistDispatched`), `module/world/chase.mjs` (`joinReinforcements` for fights and chases, `policeUnitInFight`), `module/combat/combat.mjs` (Begin round deals in new police; Police AI on a police car), `CHASES.md`. Tests: new `tests/police-reinforcements.test.mjs`; `tests/audit-chase.test.mjs` updated.

## Publish
1. Back up your world.
2. Create a GitHub release on `pacts-and-polyhedrals/the-smoke` tagged **`v0.5.19`**, marked **Latest**.
3. Upload two separate assets: **`the-smoke-v0.5.19.zip`** and **`system.json`**.
4. Update on Forge through `https://github.com/pacts-and-polyhedrals/the-smoke/releases/latest/download/system.json`.
5. Check live:
   - Start a fight, then raise a character's Heat mid-round. The new units should appear on the Combat Console as NEXT ROUND and stay put.
   - Begin the next round: they get dice. On a car's turn, press Police AI; it drives in, then its officers get out.
   - Do the same during a chase while the dice are being rolled: the new unit gets dice that round.
