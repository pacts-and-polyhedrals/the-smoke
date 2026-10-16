# The Smoke · v0.4.0 — London Crime Sandbox (Foundry VTT v14)

A GTA-inspired open-world crime game for Foundry VTT, by Pacts & Polyhedrals, set in London and starting in **Hackney**. You begin as crew for **The Chainring**, Auntie Pat's bike-theft ring under the railway arches on Morning Lane.

v0.2.1 combined the two lines of work from 15 October 2026: v0.1.3 (live pirate radio, local services, first aid, rest, advances, hardened requests and job/vehicle fixes, the numbered guides) and v0.2.0 (GM Screen, Combat Console, shops, missions, Character Creator and levelling, the item library, the books). v0.2.2 added **Message the studio** to the radio; v0.2.3 opens a station's own chat inside Foundry; v0.2.4 added the Blower's **sat nav**; v0.3.0 added the **Sandbox Campaign**: twelve faction careers and twenty local cases; v0.4.0 **maps every campaign venue** — 160 interiors, 51 approach maps, 152 entrance pins on the street maps — and adds a **cast of 108 campaign NPCs** with their own tokens. See CHANGELOG.md.

**Install:** Foundry → Game Systems → Install System → paste the manifest URL:
`https://github.com/pacts-and-polyhedrals/the-smoke/releases/latest/download/system.json`
(It installs this version once the v0.4.0 release is uploaded and marked Latest. To install the ZIP by hand, see INSTALL.md. The ZIP is about 75 MB, most of it the venue maps.)

**Start:** create a world. Street Control opens with **Set up the world** (the welcome card has the same button): assign the pregens to players, then it imports all 25 London maps (the overview, the 20 street maps in four folders north to south, the four interiors), the item library filed by type, 72 people and motors, and the guides. The 211 campaign venue maps stay in the **London Venues** compendium until they are needed (walk through a venue's ENTER pin, or *Prepare this mission's maps* on the Mission Board). New worlds begin in **Your Flat**; Pat, Spanner and Kez are at The Arches; starter job vehicles wait on Hackney Central. Running setup again only adds what is missing.

In an existing world (v0.1.0–0.1.3 or 0.2.x), the active GM upgrades it on login. Characters, notes, items, ownership and positions are kept; missing content is added. Back up the world first.

## What's in it
- **Covenant Dice System:** Effort die + Stat die + modifier, exploding; Easy / Medium / Hard / Long Shot targets solved exactly from each character's dice, fixed before Hustle and perks; outcomes from *Proper Mess* to *Legendary*.
- **Nine street stats:** Muscle, Grit, Moves, Wheels, Aim, Graft, Savvy, Front, Bottle. Plus Hustle, Perks and 31 Conditions.
- **Driving:** the vehicle's **Performance die replaces your Effort die** (BMX d4 … supercar d12), and Handling is added. Wrecked drops a step; written off cannot be driven.
- **Heat ★–★★★★★:** police units come and hunt along the real roads; India 99 at ★★★, armed response at ★★★★, roadblocks at ★★★★★. Lose stars out of sight, with a respray, a change of clothes or a night in. **Wasted** → Homerton A&E. **Busted** → Stoke Newington custody.
- **Altered Carbon vehicle engine:** seats, boarding, convoy movement, map-to-map driving, blue lights, the ANPR plate scanner and UK number plates; the driver controls their own copy of the vehicle.
- **Sat nav:** a job's **Directions** on the Blower, or **Sat nav** (Alt+N, or the scene-control button) for The Arches, your flat, A&E, a respray, a landmark or a district, opens a sat nav in the bottom-right corner: the London overview with your route along the real roads, the next turn and its distance (miles and yards, or metric), and the time on foot, by bike or by car. It re-routes every time your token moves, crosses maps with you and names the exit to leave by, follows a job from pick-up to drop-off, chases a moving target, and draws the route on the street map you're looking at. Each player's sat nav is their own; nothing is shared.
- **Live pirate radio:** six presets in the Blower, the scene-control radio and **Car radio** (right-click a vehicle). The driver tunes for everyone aboard; each player keeps their own volume. **Message the studio** sends a shout-out to the real station: **Studio chat** shows the station's own chat inside a Foundry window (Rude FM, Vision Radio UK, Point Blank FM), and WhatsApp, text and email open the player's own app with the message filled in. The GM can edit the presets and contacts. See [RADIO.md](RADIO.md).
- **20 linked street maps** traced from the real road layout, Highbury → Stratford and Lea Bridge → Bow, plus the overview and four interiors.
- **Street Life:** traffic on the left that turns at real junctions, parked cars, chained bikes, pedestrians. Nick anything (tools make locks easier, loud tools get you seen), carjack, sell bikes to Pat and motors to Bow Breakers Yard.
- **Job shifts:** taxi, police (ANPR sweeps, pursuits, arrests, disturbances), paramedic, fire, courier, bus, and Pat's bike orders. Callouts come to the Blower with the roll each stage needs and directions.
- **Combat:** the **Combat Console** (speed dice: roll in secret, reveal together, highest die first) with ranges, cover, ammo, bursts, drive-bys, ramming, grabs and arrests, and police who take their own turns; or the core combat tracker. Hits offer **Take hit** or **Dodge** (your reaction) and resolve once. Bleeding, Stunned, reactions and the three-round Down countdown run themselves.
- **Recovery and growth:** first aid, food and medicine, rest at the flat, A&E; XP and Rep levels with a **Level Up** wizard, plus GM-awarded **advances**; a 10-background **Character Creator** and a quick builder.
- **171 items** with their own art: weapons, ammo, armour, tools, drugs, food and medicine, clobber and perks.
- **Shops and local services:** a corner shop on every street, Pat's Arches, the markets, Uncle's Cafe (guns from Rep 2), respray (£100), clothes (£25), garage repairs (£10 per Body), A&E and your flat (rest, stash, wardrobe). Service prices are settings.
- **Twelve missions** (*On Your Bike*) on a **Mission Board** whose objectives tick themselves in play.
- **The Sandbox Campaign:** after the opening, London opens up. Twelve factions (The Chainring, Dead Air Collective, the Lea Boys, the Velvet Circuit, the Towpath Union, the Glasshouse Exchange, the Backroom Bookmakers, the Night Market, Borough Mutual, the Lantern Desk, Meridian Renewal, the Red Thread) each offer a career of eight commissions, and every district has a local case: **113 new missions**, each with a hook, objectives, a crew fee, scenes, pressure, a choice and what follows. **Renown** with each faction opens its next commission and raises its **Influence** cap; the Mission Board keeps Renown, Influence and stance, pays crew fees and awards Renown when a mission passes, and its **Directions** button puts the sat nav on the next place. CH1–CH3 are Missions 1–3. GM journals: the campaign book (the sandbox, access, running the city, the Quiet Ledger truth and its clue routes, starting nights, the final night and five endings, faction relationships, map production), one journal per faction, the local cases and a **Venue Register** of all 160 interiors, each with its map, room key and way in.
- **Every campaign venue mapped:** 160 interiors in the house noir style (six keyed rooms each — zone plaques HB1.1 … HB1.6 — with the public entry at room 1, the loading or secondary arrival at room 6, doors where the register connects rooms, furniture for what each room is: pews and an altar, a bar and a snug, stalls, tanks, a velodrome, a pool, a boxing ring, a moored barge…) and 51 **approach** maps (a park, a cemetery, a square, a yard under the arches, a market gate, a stadium forecourt, a towpath, a side street) for the 59 venues that sit off the drawn roads. Every street map has an **ENTER** pin for each venue or approach; walk in and the map is imported on the spot and filed under *The Smoke — Venues*, one folder per district. Each venue has a way out at the front and the back; vehicles park outside. The sat nav lists every venue and routes to its entrance; mission **Directions** go to the venue itself, and walking in ticks the objective.
- **The campaign cast:** 115 named people — the twelve faction patrons and their people, the mission givers and the contact at every venue — with top-down tokens in faction colours and NPC actors (stats, role, a GM biography with their venues and hooks) in the **Campaign Cast** compendium. The Mission Board shows who a mission involves and **Bring in the cast** imports them into *The Smoke — Campaign Cast*, filed by faction. The opening's own people keep their actors.
- **Twelve guides, 107 pages:** seven numbered quick guides (Player Guide, GM Guide & The Chainring, Work the Borough, Rules at a Glance, North & East London, The Chainring · Faces, Tools, Money & Connections) and the Player's Handbook, GM's Book, London Guide, Street Papers and the missions guide. GM guides and missions are private.
- **29 vehicles, 39 Londoners and crew, 108 campaign cast, 4 pregens.**

## Play
Click a stat to roll. Open **The Blower** from the scene controls or **Alt+B**. Right-click a vehicle to board and choose a seat. Target a foe (T) and use a weapon. **Local services**, **First aid**, **Rest** and **Shop here** are on your sheet; spend advances and level up on its Rep tab.

## For the GM
- One GM must be connected: world changes run on the GM's client, one at a time.
- **GM Screen** (scene controls → spy icon): roll requests, hazards, street and police events, Heat, rewards (including advances), NPCs, odds, and every tool.
- **Street Control** (scene controls → city icon): set up the world, Street Life, police, Heat, advances, job vehicles, clocks, shifts, guides and diagnostics.
- **Combat Console** (crosshairs) and **Mission Board** (GM Screen → Tools).

## Installation and validation
See [INSTALL.md](INSTALL.md) and [VALIDATION.md](VALIDATION.md). The release ZIP has `system.json` at its root. No other system or module is required. The automated checks use Foundry stand-ins; a licensed live Foundry 14 / Forge run is still to do, so no `verified` compatibility is claimed.

## Credits
Pacts & Polyhedrals. The dice engine is from the Covenant Dice System (its notice is kept in LICENSE-COVENANT.txt). The vehicle, boarding and transit engine is adapted from the unofficial Altered Carbon RPG system. See ATTRIBUTION.md.

Item icons are drawn from [game-icons.net](https://game-icons.net) glyphs by Lorc, Delapouite and contributors, licensed CC BY 3.0, recoloured into The Smoke's house style.

Radio presets link to independent broadcasters; no broadcasts, recordings or player code are bundled.

All people, gangs, brands and businesses are fictional, and public services carry parody names. Street names and places are real geography; the maps are drawn schematically.
