# The Smoke — capabilities (v0.5.27-rc.3)

Everything the system has been asked to do, where to find it, and the release it arrived in. `tests/capabilities.test.mjs` checks every line on every build, and also checks that nothing the previous release had (every world action, setting, hook, button, API key and content count) has gone missing. If an upgrade drops something, the tests fail and name it.

Adding a feature: add it to `tests/capability-manifest.mjs`, then run `node scripts/capabilities.mjs` to refresh the documentation only. `--propose-baseline` writes a separate unapproved proposal; protected baselines are never overwritten by this command.

## Characters

| Capability | Since | Where |
|---|---|---|
| Character Creator (eight steps: who, background, stats, perk, kit, story, token, done) | 0.2.0 | Sheet → Character creator; GM Screen; game.smoke.openCreator |
| Backgrounds with stat spreads, three perks, kit and cash | 0.2.0 | Character Creator step 2 |
| Quick build: one d8, three d6, five d4 | 0.2.1 | Sheet (blank character) and the Blower |
| Token Builder: layered top-down token parts, presets, randomise, reset, save to the actor | 0.5.25 | Sheet header (Build / Randomise token), Character Creator step 7, game.smoke.tokens.open |
| Rep ladder 1–33 in five tiers, XP, stat caps, Growth | 0.5.0 | Sheet Rep tab; Level Up wizard |
| Rep milestone rewards | 0.5.12 | Level Up at milestone levels |
| GM-awarded advances spent on the sheet | 0.2.1 | Street Control / GM Screen rewards → sheet |
| GM-editable base Guard | 0.1.3 (restored 0.5.25) | Character sheet, Guard box (GM only) |
| A character's tokens are the character: cash and kit added on a token's own sheet count (unlinked copies folded in and linked; new characters linked) | 0.5.27 | Automatic at GM login; new characters and tokens |
| Self-play: players' money and kit come through play; the GM always has full control | 0.5.27 | Settings; character sheet |
| Lock players' progress fields on their sheets | 0.5.12 | Settings |
| Rep unlocks: Uncle's shooters (Rep 3), good stuff (6), don't-ask shelf (9) | 0.2.0 | Shops |
| Rep unlock: fences pay 10% more from Rep 6 | 0.2.0 | Selling nicked rides |
| Rep unlock: Pat's bigger orders (Rep 3) and car jobs (Rep 9) | 0.2.0 (built 0.5.25) | Blower → Ask Pat for an order |
| Rep unlock: your own crew — hired hands from Rep 13 | 0.2.0 (built 0.5.25) | Blower → Your crew |
| Rep unlock: discounts (Chainring 3 at The Arches, Street 5 everywhere) | 0.2.0 | Shops |
| Known to police 3: they know your face | 0.2.0 (built 0.5.25) | Police stops |
| Say nothing at a police stop (Bottle; never against armed crime) | 0.5.25 | Police stop card |
| Every stat earns its keep: background d8, 5+ perks, a hired hand, GM checks and an even share of mission checks | 0.5.25 | tests/stat-balance.test.mjs |

## Rules

| Capability | Since | Where |
|---|---|---|
| Covenant dice: Effort + stat die + modifier, exploding, solved difficulty bands | 0.1.0 | Every roll |
| 31 conditions with recovery, timed on the Banana Watch clock | 0.2.0 / 0.5.6 | Sheet conditions |
| First aid, rest at the flat or a safehouse | 0.2.1 | Sheet quick actions |
| Wasted (A&E) and Busted (custody) | 0.2.0 | When you go down or come quietly |
| Teamwork / aid another, quick checks, hazards | 0.2.0 | GM Screen |

## Combat

| Capability | Since | Where |
|---|---|---|
| Speed-dice combat in the Combat Console | 0.2.0 | Combat Console |
| Reactions (take the hit or dodge), cover, aim, surrender, grab, cuff | 0.2.1 | Combat Console |
| Police join the fight; reinforcements go on the tracker | 0.5.19 | Combat |
| Speed dice come back every fight | 0.5.17 | Combat Console |
| Ram, PIT and evasive driving | 0.5.0 | Vehicle sheet; Combat Console |

## Vehicles

| Capability | Since | Where |
|---|---|---|
| Boarding, seats, exits, moving with your crew aboard | 0.1.0 | Right-click a vehicle |
| Movement gauge: green, yellow, red | 0.5.0 | On the map while driving |
| Driving checks, evasive manoeuvres, collisions, fire and explosions | 0.5.0 | Chat cards while driving |
| Driving rolls itself: evasive (default on), yellow / red and PIT (default off) | 0.5.1 (restored 0.5.25) | Street Control and the Blower |
| Vehicle sheet in the character-sheet format | 0.5.0 | Vehicle actors |
| Blue lights and ANPR plate scans | 0.2.0 | Police vehicles |
| Travel meter: every journey counted | 0.5.4 | Vehicle sheet |
| Refuel, repair, new plates, change of clothes | 0.2.1 | Local services |

## Police

| Capability | Since | Where |
|---|---|---|
| Heat 0–5 stars by crime severity (thieving 1★, fights 2★, guns 3★, killings 4–5★) | 0.2.0 / 0.5.22 | Sheet Heat stars; Street Control crime table |
| Police response by star, map limit, helicopter, ARV, roadblocks | 0.2.0 / 0.5.22 | Automatic; Street Control |
| Police stops with your decision: talk, run, come quietly, fight | 0.5.1 | Chat card when stopped |
| The escape move after a successful talk or run | 0.5.18 | On the map |
| Turn-based chases: Full Auto, Assisted or Manual | 0.5.0 / 0.5.4 | Combat Console |
| Chase switches in Street Control and the Blower | 0.5.1 (restored 0.5.25) | Street Control → Chases & driving; Blower → Police chases |
| Nicking bikes and cars, carjacking (moving traffic or an NPC at the wheel), pickpocketing | 0.1.0 / 0.5.24 | Right-click a vehicle or person |
| Fences: Pat buys two wheels, Bow Breakers buys motors; hot vehicles | 0.2.0 | Pull up at the fence |
| Player right-click street menu on tokens they don't own (drawn before or after load) | 0.5.4 / 0.5.24 | Right-click; Alt+I |

## Street

| Capability | Since | Where |
|---|---|---|
| Street Life: traffic on the real roads, parked cars, pedestrians | 0.2.0 / 0.4.2 | Street Control |
| People in moving cars (drivers, passengers, police crews) | 0.5.20 | Street Life |
| 20 street maps, the London overview, 160 venue interiors and 51 approaches | 0.1.1 / 0.4.0 | Scenes; Travel |
| Sat nav HUD with directions to jobs, missions and anywhere | 0.2.4 | Blower → Sat nav; Alt+N |
| Banana Watch world clock | 0.5.0 | Always on screen |
| Crew bar | 0.5.0 | Always on screen |
| Drug highs and comedowns on screen | 0.5.0 | Player screens |
| Shops with Rep locks and discounts; buying and selling | 0.2.0 | Sheet → Shop here |
| Banana Basket: order high-street stock on the Blower, delivered to Your Flat (fee and delivery time set by the GM; GM can deliver now or cancel) | 0.5.27 | The Blower → Shop / Order to the flat |
| Lag guard: slow loops rest instead of freezing the table | 0.5.22 | Automatic |

## Jobs

| Capability | Since | Where |
|---|---|---|
| Shifts: taxi, courier, paramedic, fire, bus, police (disturbance, ANPR, pursuit) | 0.2.0 | Get in a job vehicle → start a shift |
| Auntie Pat's orders with Kez's tip-offs | 0.1.0 | Blower → Ask Pat for an order |

## Missions

| Capability | Since | Where |
|---|---|---|
| Mission Board: 125 London missions, 42 graffiti commissions, 12 radio wars | 0.2.0 / 0.3.0 / 0.5.8 / 0.5.14 | Mission Board |
| Story mode and Self-play | 0.5.0 | Street Control; Mission Board |
| Objectives that tick themselves (maps, sales, services, jobs, cargo, tags, radio) | 0.3.0 / 0.5.6 | Mission Board |
| Physical mission property: carry, drop, deliver | 0.5.6 | Mission Board cargo panel |
| Factions: Renown, Influence and stance | 0.3.0 | Mission Board → Factions & Renown |
| Update who's on a running mission | 0.5.23 | Mission Board |
| Every job plays through by itself: a shared car counts for everyone in it, a nicked motor counts wherever it was nicked, Pat isn't the only buyer, set-up never blocks a job | 0.5.27 | Mission Board / mission automation |
| Mark a step done by hand: a player on the job (Self-play) for a ready step, the GM for any step, reopen or pass the job | 0.5.27 | Mission Board → Mark done / Reopen |
| Sat nav to the job's motor, the wall to paint or the radio contact, finishing what's at the place you're in first | 0.5.27 | Mission Board → Directions; the Blower |
| Checkpoints where the objective says (Westfield, Big Night's lock-up, painted walls and more), checked against the GM files | 0.5.27 | data/mission-automation.json |
| A DM mission file for every mission (brief, read-aloud, scenes, cast, DM notes) | 0.5.25 | Mission Board → the mission's page |

## Graffiti

| Capability | Since | Where |
|---|---|---|
| Tag Studio: vector handstyles, quality tiers, decals that stay, vehicle decals | 0.5.8 / 0.5.11 | Alt+G; right-click a surface |
| 57 tag sites including real parked buses | 0.5.8 / 0.5.22 | Street maps |
| Piece styles: street and marker tags, throw-ups, bubbles, old skool, blockbusters, 3D, new skool, burners, wildstyle, semi-wild, spikes, stencils, drips, fat cap, straight letters | 0.5.26 | Tag Studio → Style |
| Graffiti characters beside the letters (writers, one per faction, radio) | 0.5.26 | Tag Studio → Piece → Character |
| Graffiti presets: ASMO and 2CB in every style, each faction's pieces, station shout-outs, street pieces | 0.5.26 | Tag Studio → Presets |

## Radio

| Capability | Since | Where |
|---|---|---|
| Six live pirate radio presets, car and phone reception, studio inbox | 0.1.3 / 0.5.15 | Blower; car radio |
| Radio Wars | 0.5.14 | Mission Board |

## GM

| Capability | Since | Where |
|---|---|---|
| GM Screen: quick checks, teamwork, hazards, street and police events, rewards, NPCs | 0.2.0 | Scene controls; Settings |
| GM Screen gives and takes cash and kit for any character | 0.2.0 / 0.5.27 | GM Screen → Rewards |
| Street Control: world setup, Street Life, police, Heat by name, advances, job vehicles | 0.2.0 | Settings → Open Street Control |
| World setup and upgrades that keep GM-edited journal pages | 0.2.1 / 0.5.2 | Automatic |

## Merged audit

| Capability | Since | Where |
|---|---|---|
| Run-bound automatic mission receipts, location and prerequisite checks | 0.5.25-rc.1 | Mission Board / mission automation |
| Party-sized mission resources and contribution requirements | 0.5.25-rc.1 | Mission start and completion |
| Venue-specific positioned counters and scoped commerce | 0.5.25-rc.1 | 199 counter profiles / 160 interiors |
| Recoverable authoritative item actions and inventory receipts | 0.5.25-rc.1 | Item actions / operations |
| Situational perk bridge including all nine new stat-balancing perks | 0.5.27-rc.1 | Validated world, mission and GM-request contexts |
| Temporary weapon areas and conditional defensive equipment rules | 0.5.25-rc.1 | Combat and item effects |
| Main-stat roll state controls and one Blower alongside token editing | 0.5.25-rc.1 | Character sheet |
| Immutable full-build v0.5.24 gate and three-branch content conservation | 0.5.27-rc.1 | scripts/regression/check_upgrade.py / tests/merge-input-contract.json |

## Content

| Capability | Since | Where |
|---|---|---|
| Item library: 171 weapons, armour, gear, drugs, food, clothes and perks | 0.2.1 | The Smoke — Kit |
| The cast: 115 named people | 0.4.0 | Actors |
| Guides: Player's Handbook, GM's Book, London Guide, faction files, local cases, venue register | 0.2.0 / 0.5.2 | Journals |
| Guides written from the live rules: eight-step creation, the token builder, nine stats and where each is rolled, Rep 1-33, milestones, unlocks, Pat's orders, hired hands | 0.5.25 | Player's Handbook; Player Guide; GM's Book → Rewards and XP |
| GM mission-file journals for the street commissions and the radio wars | 0.5.25 | Journals (GM only) |
| Compendium packs | 0.1.0 | Compendiums |
| Art: tokens, maps, icons, emblems, branding | 0.1.0 | assets/ |

## Retired on purpose

| What | Why |
|---|---|
| 0.1.3 sheet, Blower and Street Control templates (actor.hbs, control.hbs, item.hbs) | Merged into the 0.2.0 windows in 0.2.1; every feature kept. |
| 0.1.3 alternate pregen records (femi, jaz, sal, tealeaf duplicates) | Duplicates of the 0.2.0 pregens; dropped in 0.2.1. |
| Rep 1–5 unlock ladder | Replaced by the Rep 1–33 ladder in 0.5.0; the unlocks moved to new levels. |
| pickChaseTraffic / per-car traffic turns | Replaced by the shared traffic phase (or individual dice by setting) in 0.5.4. |
| crew.mjs (0.5.19 work in progress) | Superseded by the user's traffic-crew.mjs in 0.5.20. |
| Player-facing WhatsApp / SMS / email / phone studio links | Replaced in 0.5.15 by the private in-game studio inbox; the GM keeps the real contact panel. |
| CodeSouth and Esencia Urbana radio presets | Retired in 0.5.15. |
| The 0.1.3 GM-guide Mission 1–3 pages | Superseded by the opening mission pages in 0.5.2. |
| Unowned-vehicle boarding popup (0.5.1) | Replaced by the player street menu (player-context.mjs) in 0.5.4. |

Content counts at v0.5.27-rc.3: items 247, londonMissions 125, taggingMissions 42, radioWarMissions 12, venues 211, places 4, cast 115, journals 29, journalPages 328, tagSites 57, tokenParts 105, tokenPresets 16, assets 1232, packs 10.
