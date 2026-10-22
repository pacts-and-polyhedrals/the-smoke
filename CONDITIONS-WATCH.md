# The Smoke — Conditions now follow the Banana Watch (v0.5.6)

## What the time means

**Timed conditions are measured in in-game Banana Watch minutes, not minutes on a real clock.** The authoritative clock is Foundry's `game.time.worldTime`, shared by the GM and connected players. The Watch's normal in-game display is based on this clock.

- **Pause the game or set Clock speed to 0:** timed conditions stop counting down. Closing Forge or leaving the world offline does not advance them.
- **Set the Watch to x6 or x60:** all timed effects advance at the same accelerated rate as the in-game clock.
- **Use the watch crown to jump 15 minutes, an hour, a day or a week:** all corresponding timed effects catch up automatically. A 3-hour jump can complete both a high and its comedown, rather than starting the comedown three hours late.
- **Use a calendar module:** switch off “The Smoke runs the clock”; calendar-driven world-time updates still advance these conditions.
- **Use Real London Time display mode:** this is a *display-only* clock setting; the in-game world clock is not automatically advanced in that mode. Conditions stay tied to game time. Choose **In-game time** to see their actual countdown on the Banana Watch.

The active GM is responsible for world updates. Players do not gain permission to advance the clock simply because their characters have conditions.

## What is timed

Timed conditions created by consuming drugs, energy drinks, lager and painkillers now save a watch-time deadline. The normal durations used for these effects also apply if a GM/player manually applies one through the character sheet or chat (see table).

| Condition | Duration in Banana Watch time | Next stage |
| --- | --- | --- |
| Blazed (Skunk) | 60 watch minutes | Foggy for 120 |
| Wired (Charlie) | 30 | Crashing for 60 |
| Loved Up (Pills) | 45 | Wrung Out for 90 |
| Numb (Benzos) | 60 | Jittery for 120 |
| Giggling (Nitrous) | 2 | No comedown |
| Pumped (Roids) | 120 | Roid Rage for 240 |
| Buzzing (energy drink) | 30 | None |
| Dutch Courage (lager) | 30 | None |
| Numbed (painkillers) | 60 | None |
| Mullered (multiple lagers) | 240 | None |

Each comedown above also has its own corresponding default duration if applied directly. Taking another hit refreshes its timed high; its existing comedown is removed as before.

**Not automatically timed:** Bruised, Hurt, Bleeding, Broken, Down, Cuffed, Grabbed, Restrained, Burning, Knackered, Shaken, Bricking It, Stunned, Prone, In Pain and Gassed remain governed by their recovery, environment, or combat-round rules. Advancing the watch does not magically heal a broken arm, stop bleeding, or unlock handcuffs. A night of safe rest still removes applicable short-term conditions by the existing Rest action; that Rest action does not itself change the global watch time.

## What players see

- The character sheet's **Rep & Conditions** tab labels each active timed condition with remaining **watch minutes** and a tooltip with the Banana Watch expiry time. The on-screen label updates while the sheet is open.
- Player-only drug visuals also show watch minutes, update as the Watch runs, and move to the correct comedown when the authoritative active GM processes the timer.
- An offline player may temporarily see a stale condition until a GM connects and authoritative updates are processed. Temporary conditions never use the player's browser clock to delete Items.

## Upgrading an existing Forge world

Old versions stored `flags.the-smoke.expiresAt` as an absolute browser-wall-clock timestamp. When the active GM first loads v0.5.6, Smoke converts each remaining timed condition once to `expiresWorldTime` on the Banana Watch. It preserves the duration remaining **at upgrade time** where possible. If a legacy real-time condition already expired while the system was offline, its original remaining game time cannot be reconstructed; it will expire as a legacy condition on the first active-GM sweep. Newly created conditions have no wall-clock expiry.

## Quick live test

1. Set Banana Watch to **In-game time**, rate **0**; start at **09:00**. Give a character Charlie, which applies **Wired** for 30 watch minutes. In the sheet and on the on-screen effect, check the countdown shows 30 watch minutes, due 09:30.
2. Wait a couple of real minutes. The condition must remain, because the Watch is stopped.
3. Advance the Watch **15 minutes**. Wired should have ~15 watch minutes remaining. Advance another 15: Wired must clear and Crashing must begin, due 10:30.
4. Advance an hour: Crashing must clear. On a separate test character, apply Skunk and jump forward three hours in one action: neither Blazed nor Foggy should remain.
5. Apply Giggling directly from a character sheet; it must expire after two watch minutes. Apply Bleeding separately: it must **not** disappear from time alone.
6. Repeat with the game paused, the Watch on x60, a player account connected, and an existing character with saved v0.5.5 timed conditions. Confirm no duplicate transitions and no skipped world updates.

This release was tested with automated Foundry document stand-ins and an extracted ZIP. It has **not been live-tested on Forge with multiple real accounts**; do not replace your production world without a backup and clone.
