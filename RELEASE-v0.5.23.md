# The Smoke v0.5.23 — the sat nav on every mission, graffiti commissions that explain themselves, a whole-system sweep

Built on v0.5.22 (Heat ceilings, the smaller police response, lag guards, the mission buses), so it includes everything up to it.

## 1. The sat nav, on every mission
### What was going wrong
I checked the sat nav on all 179 missions at 1,788 points along the way, both in order and with the GM ticking objectives out of order. On 0.5.21, **112 missions sent it to the wrong place at some step**, usually back to the mission's first stop. There were three causes:
- **Cargo objectives had no place.** All 217 "collect the parcel" and "deliver it" objectives were skipped. The sat nav fell back to the mission's first stop, or to Pat's Arches on the opening missions. For example, on M6 after reaching Uncle's Cafe it sent you back to The Arches instead of to Roman Road Market.
- **Graffiti sites with no venue or street door to aim at couldn't be found.** Six sites have this problem: the Bow Flyover column, Bow Breakers yard, Bethnal Green Road and three more. Nine commissions use them. When one of those was next, the sat nav jumped back to the first site.
- **When only GM-ticked steps were left, it went back to the first place.** Examples are "talk to them" or "get back without being nicked".

### What it does now
- **Cargo:** the sat nav goes to the parcel itself if it is lying on a map, otherwise to where it's collected. Once one of the crew is carrying it, it goes to the handover. If someone drops it on the way, it goes back to the parcel.
- **Graffiti:** the sat nav goes to the actual paint surface (the marker or the parked bus, wherever the GM has moved it), or to where the game will place it. For the "one of them at Smashed It" objective, it goes to the nearest of the set and says "repaint at Smashed It or better".
- **GM-ticked steps:** when only GM-ticked steps are left, it stays with the last place the job took you.
- **Mission Board:** the **Directions** button names where the sat nav will actually go. Graffiti commissions also have a sat nav button for each site.
- **Result:** 0 wrong out of 1,788 points.
- **Broadway Market (M2):** "Get to Broadway Market" only ticked on the Haggerston map, but Broadway Market, the sat nav and the mission's own stop are all on Bethnal Green. It now ticks on either map.

## 2. Graffiti commissions
I painted every one of the 42 commissions end to end through the real paint code. Every one passes when painted at the right quality, with the right tag, by someone on the job. The failures you saw came from situations the game never explained:
- **No feedback when a paint didn't count.** A paint too rough for the job counted for nothing without saying so (the -02 jobs need Sorted; the -03 jobs need one piece at Smashed It). Free paint, the wrong tag, or a character not on the job did the same. The spray card and a notification now say exactly why, for example "needs Sorted or better here; this one was Just About. Paint over it with another charge." When the paint did count, they say what's still to paint.
- **Tag Studio picked the wrong surface.** It started on whichever surface came first on the map, often a passing bus. It now starts on the nearest surface a job still needs.
- **Tag Studio picked the wrong commission and tag.** It now picks the commission the surface counts for (one that still needs it first) and the tag that job asks for; a faction tag left selected no longer spoils an intro job. A line under the tag picker says what the job needs at this surface.
- **A character not on the job couldn't be added.** Characters added to the table after a commission started could never get credit. The Mission Board now has **Update who's on it** for any running mission. The GM can always use it; in Self-play, players can too.
- **Objectives showed internal codes.** They read "narrowSuccess … with TAG-CH"; they now read "Just About or better, with the Chainring Cog tag".
- **Parked buses were hard to stand beside.** A bus parked side-on could only be tagged from its middle. Standing beside the end of the bus now counts.
- **Mission Board site list:** each site now shows **Painted ✓** once it's done.

## 3. Missions in general
- **"Get to X" objectives** (294 of them) used to tick only when you crossed onto that map. They now also tick for anyone already standing there when the mission starts, and for a character the GM drops straight onto the map.
- **Jobs:** every shift type was played end to end through the real code: taxi, courier, ambulance, fire, bus, police disturbance, ANPR sweep, pursuit and Auntie Pat's orders. All work. The job system had no test of its own before; it does now.

## 4. Other fixes from the sweep
- **Courier vehicle:** Street Control's "spawn a courier vehicle" gave the Zap E-Scooter, which can't do courier work. It now gives the Deliverer E-Bike.
- **GM buttons with no map:** Respond, Stand down and Clear Street Life crashed if no map was open. They now say "Open a map first".
- **Police arrests:** an arrest no longer crashes if the stolen car has gone.
- **Auntie Pat's orders:** two bikes sold to Pat close together were both counted as the first, so the order could never complete. Sales are now counted one at a time, and the order completes once. The new jobs test found this.

## How the system was checked
- **Automated tests:** all 58 suites pass. Four are new:
  - `tagging-missions-e2e`: every commission, plus each way a paint can fail to count.
  - `satnav-missions`: every mission at every step.
  - `jobs-e2e`: every job type end to end.
  - Additions to `missions`.
- **Handlers:** every one of the 90 world handlers was called as a player and as the GM, with empty requests and with requests naming deleted things. All now fail cleanly instead of crashing.
- **Hooks:** every Foundry hook the system listens to was called with bare documents.
- **Code health:**
  - Every module imports cleanly.
  - Every handler a button calls exists, every setting read is registered, and every custom hook has a listener.
  - Every button in a template has a handler.
  - All 16 templates compile and render.
  - ESLint shows no new problems.
- **Data:** every mission's references to maps, venues, stops, props, cast and vehicles were cross-checked, along with every vehicle the code names.
- **Not checked:** there's no live Foundry server here, so check the points below in your world.

## Publish
1. Back up your world.
2. Create a GitHub release on `pacts-and-polyhedrals/the-smoke` tagged **`v0.5.23`**, marked **Latest**.
3. Upload two separate assets: **`the-smoke-v0.5.23.zip`** and **`system.json`**.
4. Update on Forge through `https://github.com/pacts-and-polyhedrals/the-smoke/releases/latest/download/system.json`.
5. Check live:
   - On M6 (or any cargo job), press Directions after each step. The sat nav should go to the parcel, then the handover.
   - On TG-CH-02, paint a site at Just About. The card should say it needs Sorted. Paint over it at Sorted and the site should tick.
   - Tick a graffiti objective by hand on the Mission Board. The sat nav should move to the next site, not the first.
   - Add a character on the Mission Board with **Update who's on it**. Tag Studio should then offer them the commission.
