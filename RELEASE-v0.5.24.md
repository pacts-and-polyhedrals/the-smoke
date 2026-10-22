# The Smoke v0.5.24 — players can right-click every vehicle (Nick it / Carjack)

Built on v0.5.23 (sat nav on every mission, graffiti feedback, the full sweep) and v0.5.22, so it includes both.

## What was going wrong
- **As the GM** you could right-click any vehicle and see Nick it / Carjack.
- **As a player**, right-clicking some vehicles did nothing at all. Pat's order bikes were the worst affected.

**The cause.** Foundry gives every token its right-click behaviour at the moment it draws the token on the map. Normally only the token's owner gets a menu. The Smoke adds its own street menu for players (Board, Nick it, Carjack, Tag, Pick-pocket), but it was installed too late: at the end of loading, *after* the first map had been drawn. So:
- **Already on the map when the world loaded** (Pat's chained-up bikes, parked cars and chained bikes): these kept Foundry's owner-only right-click. Players got nothing.
- **Arrived later** (new traffic, police) or **on a map you crossed into**: these worked. That's why it looked random.
- **The GM** owns every token, so they always got Foundry's own menu, which carries the same actions.

## What it does now
- The players' street menu is installed at the very start of loading, before any map is drawn, so every token gets it.
- Any token already drawn is switched over too, as a safety net. That covers a module that replaces the token class, or a page reloaded mid-game.
- Pat's order bikes, parked cars and chained bikes offer **Nick it** to players again. Moving traffic offers **Carjack**.
- **New:** a car the GM put on the map with a Londoner driving it (not moving traffic) also offers **Carjack**. Before, you couldn't nick it (it has a driver) or carjack it (it isn't traffic). Police units with their crew aboard still can't be carjacked.

You still need your character right next to the vehicle (Muscle/Front for a carjack, Graft for a lock). Pat's bikes still pay out when you ride them to The Arches.

## Files
- `module/interaction/player-context.mjs`: install at init, patch Foundry's Token class (and a module's replacement), re-arm tokens already drawn.
- `the-smoke.mjs`: install call added at init.
- `module/world/theft.mjs`: `npcAtWheel`, `carjackable`.
- New test: `tests/player-right-click.test.mjs`.

## Publish
1. Back up your world.
2. Create a GitHub release on `pacts-and-polyhedrals/the-smoke` tagged **`v0.5.24`**, marked **Latest**.
3. Upload two separate assets: **`the-smoke-v0.5.24.zip`** and **`system.json`**.
4. Update on Forge through `https://github.com/pacts-and-polyhedrals/the-smoke/releases/latest/download/system.json`.
5. Check live:
   - As a player, reload the page on a map with Pat's tipped-off bikes or parked cars.
   - Right-click one straight away. You should see the street menu with **Nick it**.
   - Stand next to it and nick it.
