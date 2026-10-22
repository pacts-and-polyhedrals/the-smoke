# The Smoke v0.5.22 — Heat that fits the game, a calmer table, and real buses to paint

Built on the uploaded v0.5.21, so it includes everything up to it (speed dice, scrolling, escape move, police on the combat tracker, real vehicle crews, mission paint canvases).

## 1. The wanted level

### What was going wrong
- **Every attack was a crime of its own.** Each shot added +2 stars, each punch +1, and +1 more if a police officer saw it. Three shots took anyone to five stars.
- **Petty crime stacked.** A carjack was +2, and +3 in front of a patrol. Driving off after it added dangerous driving (+1, or +2 in front of the police). One carjack near a police car could reach four stars, which meant armed police.
- **Killings were never counted.** "Killing someone" was in the table, but nothing reported it. Murder cost no more than a scuffle.
- **The response was big and unbounded.** By star level, the police sent 0, 1, 3, 4, 7 and 10 vehicles, each with officers aboard (0.5.20). There was no limit per map, and when the stars dropped the extra cars stayed.

### What it does now
Each crime raises Heat **up to its own ceiling** and never past it, however often you do it. A police witness adds +1, but only within that ceiling. A lesser crime never lowers your Heat.

| Witnessed crime | Heat |
|---|---|
| Pickpocketing, nicking a bike or car, carjacking, graffiti, dangerous driving | 1★ at most |
| Assault, failing to stop for police | +1★, up to 2★ |
| Assaulting a police officer, stealing a police vehicle | 2★ |
| Firing a gun | at least 2★, up to 3★ (3★ straight away in front of the police) |
| Killing someone | 4★; a second killing brings 5★ |
| Killing a police officer | 5★ |

- **Killings are detected.** A killing counts when a lethal attack drops a person from above 0 Health to 0. Lethal means a gun, a bleed, fire or area weapon, or anything with impact 4 or more. It counts on both damage paths: automatic damage, and **Take hit** on the chat card. Witnesses work the same way as for other crimes. A punch that floors someone is still assault. A **KILLING** card goes to chat. This needs the existing **Combat: witnessed crimes add Heat** setting, which is on by default.
- **Police vehicles by star: 0, 1, 2, 2, 3, 6.**
  - 3★: the helicopter goes up.
  - 4★: one ARV, armed.
  - 5★: roadblocks are set up.
  - New setting: **Heat: most police vehicles on a map** (default **4**). It is a hard ceiling on cars, vans and ARVs; the helicopter and officers on foot don't count towards it. Lower it if your table still feels swamped.
- **Units stand down as the stars drop.** Extra units go back to base when nobody can see them, so you won't see cars blink out in front of you. Units in a fight, parked up, carrying a player, or within 14 squares of a character stay put.
- **Street events can't push you into armed response.** A street-event consequence such as *Someone Recognises You* now brings 2★ at most. The GM's own **Heat +1** button still does exactly what it says.
- **Text updated to match.** The carjack dialog, street-event notes, crime pickers (Street Control, the phone, the GM screen) and the four guide pages with the Heat tables all show the new numbers:
  - Player Guide → *Heat, cash and consequences*
  - Rules Reference → *Heat and losses*
  - Player's Handbook → *Heat and the Police*
  - GM's Book → *Police Response*
- **Existing worlds get the guide pages refreshed once,** when the GM logs in. This only happens if you haven't edited those pages. If you have, they stay as you left them, and the GM gets a note saying which ones were skipped.

## 2. The frozen screen
**I could not reproduce the freeze here**, because there is no live Foundry server to test on. But the code had a clear way to overload the server, and it matches what you saw: the left-hand controls and Foundry's own buttons stopped responding for a couple of minutes, and only a server restart fixed it.

- **Too many writes per second.** Every second, traffic and police each saved their moves. Then every moving vehicle saved its "travel meter" again as a separate write. Since 0.5.20, every vehicle also carries NPC crew.
- **A big police response made it much worse.** At four stars that meant seven or more police vehicles (with officers) plus about six cars of traffic. That is dozens of database writes a second. Once the server falls behind, the backlog only grows, and the interface waits on it.
- **The crew bar added to the load.** The crew bar on the left redrew itself on *every* token move on the map, several times a second with traffic running.

Fixes:
- **One write per tick.** Traffic and police moves, including their travel meters, are now saved as one batch per tick instead of one write per vehicle.
- **The crew bar only reacts to player characters** and vehicles carrying them, and only redraws when what it shows has actually changed.
- **Fewer police,** at most 4 vehicles per map by default (see above).
- **New safety valve.** If a traffic or police step takes too long twice in a row (more than 1.5 seconds, or 1.5× its interval), that loop rests for 15 seconds so everything can catch up. The GM gets a whispered **SLOW DOWN** card at most once every 10 minutes, saying which loop paused and which settings to turn down:
  - **Street Life: moving cars per map**
  - **Street Life: seconds between traffic moves**
  - **Heat: most police vehicles on a map**

If it happens again, please note what was on screen (stars, how many police, whether a chase was on) and copy any red errors from the browser console (F12).

## 3. Bus tagging missions use a real bus
The four bus sites are now **real out-of-service buses**, parked at the kerb on the site's side of the road and named after the site:
- London Fields stationary bus
- Leyton Orient supporter shuttle bus
- Waterden Road parked bus
- VeloPark shuttle bus

Each bus is a 2×6 Clippermaster, parked and locked. It is not part of Street Life traffic, so it won't drive off. Right-click the bus → **Tag surface / spray** as usual; the paint stays on the bus.

In worlds already running 0.5.21, an unpainted marker at a bus site is swapped for the bus the next time the map syncs. Markers you have already painted stay, so no paint is lost. **The three train sites are still markers:** there is no train or DLR vehicle in the library yet.

## Files
- **Heat ladder and response:** `module/config.mjs` (crime ceilings, `crimeHeatText`, 4★/5★ descriptions) and `module/rules/core.mjs` (`heatAfterCrime`, `policeResponse`).
- **Police on the map:** `module/world/heat.mjs` (police ceiling, `scaleBack`, batched hunt moves).
- **Killings:** `module/combat/combat.mjs` (`reportKill`, lethal hits) and `module/gameplay.mjs` (Take hit path).
- **Street events and text:** `module/gm/requests.mjs` (street-event Heat cap), `module/gm/catalogue.mjs`, `module/world/theft.mjs`, `module/apps/phone.mjs`, `module/apps/gm-screen.mjs`, `templates/street-control.hbs`.
- **Lag fixes:** `module/world/slow-guard.mjs` (new), `module/world/traffic.mjs`, `module/vehicles/travel-meter.mjs` (`withMeters`) and `module/apps/crew-bar.mjs`.
- **Buses:** `module/graffiti/runtime.mjs` and `module/graffiti/mission-placements.mjs` (`parkedAlong`).
- **Guides:**
  - Guide text: `data/content.json`, `data/london-guides.json`, `packs/guides`, `data/guide-history.json`.
  - Generator: `scripts/journals/rules.mjs`.
  - One-time refresh for existing worlds: `module/content.mjs` (`refreshShippedPages`, migration 4).
- **Tests:**
  - New: `heat-scaling`, `heat-guides`, `slow-guard`.
  - Updated: `chase`, `requests`, `tagging-mission-canvas`.

## Publish
1. Back up your world.
2. Create a GitHub release on `pacts-and-polyhedrals/the-smoke` tagged **`v0.5.22`**, marked **Latest**.
3. Upload two separate assets: **`the-smoke-v0.5.22.zip`** and **`system.json`**.
4. Update on Forge through `https://github.com/pacts-and-polyhedrals/the-smoke/releases/latest/download/system.json`.
5. Check live:
   - **Petty crime:** nick a car in front of a patrol and drive off. It should stay at 1★.
   - **Shooting:** shoot someone without killing them. You should get 2★ (3★ if police saw it).
   - **Killing:** kill someone. You should get 4★ and see the KILLING card.
   - **Police numbers:** at 5★, count the police vehicles. There should be no more than 4.
   - **Standing down:** drop to 2★. Extra units should leave when out of sight.
   - **Bus missions:** start a bus tagging commission. A parked bus should be at the site.
