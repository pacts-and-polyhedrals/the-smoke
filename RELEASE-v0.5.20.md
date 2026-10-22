# The Smoke v0.5.20 — Police Decisions and Living Vehicle Crews

**Baseline:** User-provided `the-smoke-v0.5.19.zip` (21 October 2026). No older system build or compendium was substituted. This release preserves its police reinforcement work, escape circles, combat speed dice, maps, missions, radio, UI and all existing binary art.

## Police choices roll correctly again

- The police decision in chat now blocks a response only for an *unresolved hit on the specific character or their current vehicle in the same combat*. An old unresolved card from a different combat, or an attack on another actor on the map, no longer prevents **Talk your way out / Make a break / Surrender / Resist** from operating.
- Real outstanding hits still require Take Hit or Dodge first. The blocker names the affected person and the exact chat card.
- **Reset/restart recovery:** Foundry keeps old chat cards after combat is deleted. An obsolete police stop is now cleared along with its chat prompt; leftover HIT cards linked to a deleted encounter no longer block new police decisions. A press on a legacy deleted-combat decision is rejected and disabled without rolling or damaging anyone. This reproduces the case where resetting combat made the buttons work again.
- All police results continue through the existing Moves, Wheels and Front roll pipeline, including success escape opportunities. No fake rolls or auto-decisions were introduced.

## No automatic chase-round deadlock

- Auto/assisted requests that reach `combat.begin` after the round has already started now return a harmless, explicit skip. Manual Begin still warns if used before a round finishes.
- On upgrade, the known stale `Finish this round before beginning another` chase autopilot error is cleared without resetting current combatants, speed dice or turn state.

## All moving ambient motors have an actual crew

- **Black cabs:** real Cabbie NPC and fare. **Minicabs:** private-hire driver and passenger.
- **Buses:** driver and three represented passengers. **Delivery vans/bikes:** couriers. Ice-cream van: vendor. Motorcycles/mopeds: riders. Other ordinary traffic: local motorists.
- **Police cars, carriers and ARVs:** drivers and appropriate police response officers. Police bikes: motorcycle officers. Helicopter: pilot and observer. Ambulances: paramedics. Fire engines: fire crew.
- These people are real NPC token documents using role-appropriate existing London character types, not an invented name on the vehicle or a random bystander spawned during theft.
- NPC occupants automatically take a mapped seat and move **in the same token update** as their vehicle in free-roam traffic, pursuits, chase traffic phases and helicopter turns; they do not lag one movement behind.
- Cars with only autonomous NPC riders still travel normally. A PC boarding a seat stops automatic traffic control; an existing player driver is never overwritten. Duplicate setup attempts are coalesced.
- Successful carjacks pull the actual seated driver and fare into the street; responding officers step out of the existing police vehicle instead of appearing as extra doubles.
- Existing traffic is seeded on scene entry. A GM manually driving a non-parked NPC motor on a street can seed its crew on movement. Parked/stolen/player-owned vehicles are not populated unexpectedly. Real ambient seat links survive travel between street scenes.
- Despawning a background vehicle cleans up its synthetic riders. Previous v0.5.19 traffic physics, collision and chase modes remain in effect.

## Changes and tests

Changes are confined to gameplay modules for police/chase/traffic/boarding/transit, this documentation, release metadata and targeted regression tests; no world or compendium packs were rebuilt. `tests/police-chat-recovery.test.mjs` and `tests/vehicle-ambient-crew.test.mjs` supplement the original suite. The chat test covers unrelated hits, actual current hits, automatic chase round races, the delete-and-restart sequence, and legacy orphaned police decisions. The existing traffic test now checks actual pilot tokens and same-batch seat movement. Full source and extracted-package test logs are provided separately to the developer, not bundled.

**Live acceptance after updating Forge:**

1. In a copy of a world, start a police stop while another NPC on the same scene has an unresolved hit. Choose *Talk your way out*. You should get a real Front roll, not the unrelated attack error. Resolve a hit that is actually aimed at the talking character before trying again.
2. Complete one chase round in automatic mode and watch the next one start without `Finish this round...` interrupting the chase assistant. Confirm existing speed dice and GM decision gates remain intact.
3. Enter a London street map and inspect a moving black cab: a cabbie and fare should be among its real token occupants. A bus should have a driver and passengers, a police unit should have officers, and an NPAS helicopter should have its pilot and observer.
4. Let traffic move; the occupants must move with the car in the *same* animation, not a step behind. Move a vehicle across maps and check its crew still comes with it.
5. Carjack a cab: the original cabbie and passenger should exit. Board with a PC and confirm the vehicle is no longer autonomous.
6. Verify all existing Shop, Radio, Mission Board, Tag Studio, combat and Map Transit paths before updating your main world.

This archive has not been tested in the user's live Forge world; back up the world and run these tests with a GM and a player client.
