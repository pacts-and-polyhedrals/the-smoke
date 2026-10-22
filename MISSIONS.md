# The Smoke — Mission property and self-play (v0.5.6)

## What is new

Of 125 campaign missions, 111 now include **actual physical mission property** (112 distinct types, 119 separately collectable units). Each of these has mandatory automatic **collect** and **deliver** objectives. The remaining 14 missions centre on vehicle theft, racing, fights, social decisions, or escorting people; they should be played through the existing vehicle/person systems and are not turned into carryable gear.

New player-facing play guides appear on the Mission Board for all 111 property missions. Narrative objectives still involve player judgement and may be ticked by the crew in Self-play. The original authored journal content is not overwritten or downgraded.

## Borrowed Speakers — the hands-on sequence

1. Start **AD1 Borrowed Speakers** in the Mission Board. In Story mode, your GM starts it. In Self-play, an eligible player starts it. Two separate **Dead Air speaker flight case** props spawn automatically on **Queensbridge Sound Store (LDV-HR7)** in the **Speaker Hall (HR7.2)**.
2. Travel to the shop; look for both named flight case tokens. Get your character beside each, right-click → **Collect mission property**. If another module suppresses right-click, target the case with **T** and press **Alt+I**, or use Mission Board → Collect. Both cases become **gear items** carried by the relevant characters.
3. You can **Drop** a case from its inventory item or the Mission Board: the case reappears as a token at the carrier's current position. Either party member on that mission can pick it up again. Collection is recorded per unit, never inferred from entering a map.
4. Follow the text and story objectives: investigate the replacement booking at Cafe OTO and make arrangements at Backspin Studio, following the in-game play guide. Non-physical conversations and decisions remain player/GM adjudicated.
5. Take **both** cases to **Round Chapel (LDV-HC2)** and step into the **Event Hall (HC2.2)**. Select the case gear item → **Deliver / hand over**, or select Deliver from the Mission Board. The delivery objective advances only when each individual case has been handed over in the correct room. If one case is missing or left behind, the mission cannot pass.

A note about the heavy speaker cases: they are explicitly described as vehicle-sized, but a vehicle-capacity/weight sub-system is not yet enforced. This build tracks actual possession and room-specific delivery, not the physical load limit of a van.

## General property actions

- Property appears on the correct map when the mission starts. On old active mission saves, missing property is prepared by the active GM on login. Object names identify their mission in Street Actions.
- **Collect** requires a participating character and physical proximity. It is a leader-GM-validated action: NPC token ownership is never transferred to the player.
- **Carry** is a real embedded character item with a mission ID, run ID and parcel serial. Carried property follows that character's actor inventory between maps.
- **Drop** removes that item and creates a visible, persistent scene token. Other participating crew members may pick it up. You can drop on different maps, not just the original collection point.
- **Deliver** works only for the recorded current carrier on the designated map. Where the job specifies a room/zone, you must enter that area. Delivery consumes that item and records the serial as delivered. Duplicate deliveries are refused.
- **Objective counters** advance on actual collect/deliver actions, once per serialized item. Physical objectives cannot be ticked manually by players to bypass carrying the object. GM overrides remain for exceptional recovery.
- **Recovery:** a GM can select *Repair missing mission property* on the Mission Board. Lost world tokens can respawn; accidentally deleted held inventory items are returned only to their recorded carrier. Reset/failed missions clean up the current run's props and carried items.

## Maps and manual exits

When using the **Go to next map** action, an exit is now accepted if the token's footprint overlaps it, or the token is within approximately one grid square of it. This fixes narrow-door/large-vehicle false negatives. The automatic building transition still requires the token's centre to actually enter the marked doorway, avoiding unintended teleports. A refusal reports the nearest mapped exit and the distance from the token's **footprint**, not just its centre.

The duplicated police roadblock check on a vehicle crossing was removed: only one check should run for that crossing.

## Permissions and limitations

- World scene imports, token spawning and authoritative mission-state changes **require an online active GM Foundry client**. **Self-play** means players do not need an actively narrating GM; it does **not** currently provide an offline/headless game-master server.
- Vehicles remain vehicles: missions focused on stealing, driving or selling bikes/cars should use the existing vehicle theft, boarding and delivery systems rather than pocket-sized props.
- Escorting people and contested conversation outcomes remain narrative/person interactions; this release does **not** implement fully autonomous NPC dialogue, remote GM approvals or a generic escort AI.
- Other than the speaker job and Uncle's envelope, many new portable props are placed in the primary accessible room of their appropriate venue. Exact room-specific handovers exist only where authored; map-wide venue delivery still validates the map and actual item possession.
- This release candidate is **not live-tested** on Forge with two player accounts. Back up and clone your world before production installation.

## Validation

Run `node tests/run-all.mjs`. Of particular interest: `mission-property-catalogue.test.mjs`, `mission-props-transit.test.mjs`, `missions.test.mjs`, `venues.test.mjs`, `satnav.test.mjs`, the chase and player-menu tests and `release-manifest.test.mjs`. A separately published release requires matching full ZIP `the-smoke-v0.5.6.zip` and `system.json` GitHub assets.

## Timed conditions and the in-game Watch

Temporary conditions from drugs, drink and medicine now use Banana Watch **game time**. They no longer expire just because the real-world session takes a break. The GM can advance world time from the Watch's crown to age effects across a job, but merely moving across a map or completing a mission does **not** automatically advance world time unless another system explicitly does so. See `CONDITIONS-WATCH.md` for supported timer transitions, overlays, and existing-save migration.
