# The Smoke v0.5.17 — speed dice and scrolling

Built on v0.5.16. Two reported problems fixed: player speed dice that never came back, and menus that could not be scrolled.

## Speed dice

### What the rules say
- At the start of **every round** each fighter rolls fresh speed dice from their **Moves** die: d4 → 1d6, d6/d8 → 2d6, d10/d12 → 3d6, d20 → 4d6. A driver rolls the better of their own and their vehicle's.
- **Stunned** and **Knackered** each take one die away, minimum one.
- **Down**, **Cuffed** and **surrendered** characters get **no** dice (no actions).
- Each die is one action; the highest die goes first. Dice don't carry over: the GM presses **Begin round** in the Combat Console (Full Auto chases do it themselves) and everyone is dealt fresh dice.

### What was going wrong
Pressing **Surrender** set a switch on the *character* (`system.states.surrendered`). The only thing that ever turned it off was the GM's **End Fight** (flag) button in the Combat Console. Every other way a fight can end left it on:
- a chase called off, or the police losing you;
- the core combat tracker's **End Combat**;
- being **Busted** (custody) or **Wasted** (hospital);
- and a night's **rest** didn't touch it either.

Nothing on the character sheet shows that switch, so the character looked fine, but every new round in every later fight dealt them **0 dice**, and the Console just said **OUT**. Reproduced on the 0.5.16 code: two dice in the first fight; after surrendering, ending the fight and resting, zero in the next.

### What changed
- A surrender now belongs to **the fight it was made in**. It ends when that fight ends (any way at all), when you're taken out of the fight, when you're Busted or Wasted, and after a night's rest. A surrender recorded for another fight never costs you dice.
- **Worlds already stuck:** when the GM loads the world, anyone still marked as surrendered without being in that fight is stood back up (the browser console names them).
- The Console now shows **why** a fighter has no dice — `OUT · SURRENDERED`, `OUT · CUFFED`, `OUT · DOWN` (hover for what clears it) — and `NEXT ROUND` for someone who joined after the reveal, instead of a bare `OUT`.
- Someone who joins while the dice are still being rolled (officers piling out of a van, a unit catching up with the chase) is **dealt in at once**.
- **Stunned now costs a die** as written: stunned part-way through a round, your lowest die still to come is lost (struck through in the Console) — never the one you are acting on, never your last of the round; stunned before the dice are rolled, you roll one fewer. (Before, Stunned wore off at the end of the round before it could ever reduce anything.)
- Not changed, on purpose: **rest keeps cuffs**. A key (untick Cuffed on the sheet), a Hard Graft roll agreed with the GM, or the custody suite (Busted) takes them off. The Console now tells you that is why you're out.

## Scrolling

Checked in a browser against a strict Foundry-style window (content clipped at the frame) at each window's default size and at 520 px and 380 px tall, on every sheet tab, with and without long lists. 0.5.16: 24 renders had content you could not reach. 0.5.17: none.

- **Street Control** (the GM's main menu) had no scrolling at all; its lower sections (the crew, shifts, Heat tables) were cut off on smaller screens.
- **Tag Studio**, the **Shop**'s *Open here* list, the **Mission Board** rail (a long career header could squeeze the mission list to nothing) and the radio presets editor now scroll.
- **Dialogs** — bus and coach seats, local services, travel, targets, welcome and diagnostics — scroll inside themselves and keep OK / Cancel on screen. (A 60-seat bus list used to push its buttons off the screen.)
- **Right-click token menus:** a column that hangs off the top or bottom of the screen slides back onto it; one taller than the screen scrolls just its Smoke buttons, so Foundry's own buttons and pop-out palettes are untouched. Street-action pop-ups stay on screen.
- Every Smoke window can always be scrolled to the end, whatever Foundry's window frame does.

## Files
- `module/combat/rules.mjs` (`speedDiceBlock`, `stunnedDrop`), `module/combat/combat.mjs` (`speedFor`, `surrenderedIn`, `dealIn`, `stunSpeed`, `installCombat`), `module/gameplay.mjs` (fight-end and load-time clean-up, rest), `module/world/heat.mjs` (Busted / Wasted), `module/apps/combat-console.mjs` + `templates/combat-console.hbs` (why you're out, lost dice).
- `styles/the-smoke.css` (0.5.17 scrolling block), `module/apps/fit-menus.mjs` (Token HUD and pop-up fitting, new), `module/interaction/player-context.mjs`, `the-smoke.mjs`.
- Tests: new `tests/speed-dice-refresh.test.mjs`; `tests/combat-flow.test.mjs` fakes now give combatants their fight, as Foundry does.

## Publish
1. Back up your world.
2. Create a GitHub release on `pacts-and-polyhedrals/the-smoke` tagged **`v0.5.17`**, marked **Latest**.
3. Upload two separate assets with these exact names: **`the-smoke-v0.5.17.zip`** and **`system.json`**.
4. Update on Forge through the existing manifest URL: `https://github.com/pacts-and-polyhedrals/the-smoke/releases/latest/download/system.json`.
5. Load the world as GM once (that clears any stuck surrenders), then check live:
   - surrender in a fight, end it from the core tracker (or let a chase end), start a new fight → your dice are back;
   - get Stunned by a taser mid-round → one later die struck through;
   - open Street Control on a laptop-height window and scroll to *Shifts*;
   - right-click a vehicle near the bottom of the screen → every button reachable; open a bus's seats dialog → OK visible.

Journals stay on content edition 0.5.3, so your edited guide pages are not touched.
