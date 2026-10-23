// THE SMOKE — every capability the system has been asked for, from 0.1.0 to now, with where it lives (0.5.25).
// tests/capabilities.test.mjs proves each one is still there (its probes), and scripts/capabilities.mjs writes
// CAPABILITIES.md from this list. Adding a feature? Add it here. Retiring one on purpose? Move it to RETIRED with the
// reason, so the next upgrade can't drop something by accident.
const has = (file, ...needles) => ({kind: 'has', file, needles});
const tpl = (file, ...needles) => has(`templates/${file}`, ...needles);
const handler = (...names) => ({kind: 'handler', names});
const setting = (...keys) => ({kind: 'setting', keys});
const api = (...keys) => ({kind: 'api', keys});
const count = (key, min) => ({kind: 'count', key, min});
const file = (...files) => ({kind: 'file', files});

export const CAPABILITIES = [
  // ---------------------------------------------------------------- characters
  {area: 'Characters', name: 'Character Creator (eight steps: who, background, stats, perk, kit, story, token, done)', since: '0.2.0', where: 'Sheet → Character creator; GM Screen; game.smoke.openCreator',
   probes: [file('module/apps/creator.mjs', 'templates/creator.hbs'), has('module/rules/creation.mjs', "{key: 'token', label: 'Token'}", "{key: 'story', label: 'Story'}"), api('openCreator')]},
  {area: 'Characters', name: 'Backgrounds with stat spreads, three perks, kit and cash', since: '0.2.0', where: 'Character Creator step 2',
   probes: [has('module/rules/creation.mjs', 'export const BACKGROUNDS', "key: 'bike-thief'", "key: 'getaway-kid'", "key: 'ex-old-bill'")]},
  {area: 'Characters', name: 'Quick build: one d8, three d6, five d4', since: '0.2.1', where: 'Sheet (blank character) and the Blower', probes: [has('module/apps/phone.mjs', 'export async function quickBuild'), api('quickBuild')]},
  {area: 'Characters', name: 'Token Builder: layered top-down token parts, presets, randomise, reset, save to the actor', since: '0.5.25', where: 'Sheet header (Build / Randomise token), Character Creator step 7, game.smoke.tokens.open',
   probes: [file('module/apps/token-creator.mjs', 'module/tokens/compose.mjs', 'module/tokens/kit.mjs', 'module/tokens/panel.mjs', 'templates/token-creator.hbs', 'data/token-builder.json', 'scripts/tokens/draw_parts.py'),
     handler('token.save'), api('tokens', 'openTokenBuilder'), count('tokenParts', 100), count('tokenPresets', 16), tpl('actor-sheet.hbs', 'data-token-build', 'data-token-random'),
     has('module/data-models.mjs', 'tokenParts: new ObjectField')]},
  {area: 'Characters', name: 'Rep ladder 1–33 in five tiers, XP, stat caps, Growth', since: '0.5.0', where: 'Sheet Rep tab; Level Up wizard',
   probes: [has('module/rules/advancement.mjs', 'export function levelUpPlan', 'healthGrowth', 'guardGrowth', 'statCap'), file('module/apps/levelling.mjs', 'templates/levelup.hbs'), api('openLevelUp')]},
  {area: 'Characters', name: 'Rep milestone rewards', since: '0.5.12', where: 'Level Up at milestone levels', probes: [has('module/rules/advancement.mjs', 'milestoneChoices', 'REP_MILESTONES')]},
  {area: 'Characters', name: 'GM-awarded advances spent on the sheet', since: '0.2.1', where: 'Street Control / GM Screen rewards → sheet', probes: [handler('progression.advance'), api('advance'), tpl('street-control.hbs', 'data-award')]},
  {area: 'Characters', name: 'GM-editable base Guard', since: '0.1.3 (restored 0.5.25)', where: 'Character sheet, Guard box (GM only)', probes: [tpl('actor-sheet.hbs', 'name="system.guard.base"')]},
  {area: 'Characters', name: 'A character\'s tokens are the character: cash and kit added on a token\'s own sheet count (unlinked copies folded in and linked; new characters linked)', since: '0.5.27', where: 'Automatic at GM login; new characters and tokens', probes: [has('module/world/characters.mjs', 'export async function linkCharacterTokens', 'export async function foldTokenCopy', 'preCreateToken'), api('characters')]},
  {area: 'Characters', name: 'Self-play: players\' money and kit come through play; the GM always has full control', since: '0.5.27', where: 'Settings; character sheet', probes: [setting('selfPlayEarnedOnly'), has('module/apps/sheets.mjs', 'export const earnedOnly', 'EARNED_ONLY_TEXT')]},
  {area: 'Characters', name: 'Lock players\' progress fields on their sheets', since: '0.5.12', where: 'Settings', probes: [setting('lockPlayerSheets'), has('module/apps/sheets.mjs', 'GM_LOCKED_FIELDS')]},
  {area: 'Characters', name: 'Rep unlocks: Uncle\'s shooters (Rep 3), good stuff (6), don\'t-ask shelf (9)', since: '0.2.0', where: 'Shops', probes: [has('module/world/shops.mjs', 'minRep: 3', 'minRep: 6', 'minRep: 9')]},
  {area: 'Characters', name: 'Rep unlock: fences pay 10% more from Rep 6', since: '0.2.0', where: 'Selling nicked rides', probes: [has('module/world/theft.mjs', '>= 6 ? 1.1 : 1')]},
  {area: 'Characters', name: 'Rep unlock: Pat\'s bigger orders (Rep 3) and car jobs (Rep 9)', since: '0.2.0 (built 0.5.25)', where: 'Blower → Ask Pat for an order', probes: [has('module/world/jobs.mjs', 'export const patOrdersFor', 'minRep: 3', 'minRep: 9, car: true')]},
  {area: 'Characters', name: 'Rep unlock: your own crew — hired hands from Rep 13', since: '0.2.0 (built 0.5.25)', where: 'Blower → Your crew', probes: [handler('hire.take', 'hire.dismiss'), api('hires'), file('module/rules/hires-core.mjs', 'module/world/hires.mjs'), tpl('phone.hbs', 'data-hire')]},
  {area: 'Characters', name: 'Rep unlock: discounts (Chainring 3 at The Arches, Street 5 everywhere)', since: '0.2.0', where: 'Shops', probes: [has('module/world/shops.mjs', "hasUnlock(system, 'streetDiscount')", 'discountKey')]},
  {area: 'Characters', name: 'Known to police 3: they know your face', since: '0.2.0 (built 0.5.25)', where: 'Police stops', probes: [has('module/world/pursuit.mjs', 'knownFace')]},
  {area: 'Characters', name: 'Say nothing at a police stop (Bottle; never against armed crime)', since: '0.5.25', where: 'Police stop card', probes: [has('module/world/pursuit.mjs', "'Say nothing · Bottle'", "choice === 'silent'")]},
  {area: 'Characters', name: 'Every stat earns its keep: background d8, 5+ perks, a hired hand, GM checks and an even share of mission checks', since: '0.5.25', where: 'tests/stat-balance.test.mjs', probes: [file('tests/stat-balance.test.mjs')]},
  // ---------------------------------------------------------------- rules
  {area: 'Rules', name: 'Covenant dice: Effort + stat die + modifier, exploding, solved difficulty bands', since: '0.1.0', where: 'Every roll', probes: [file('module/rules/core.mjs', 'module/rules/difficulty.mjs', 'module/dice/roll.mjs'), handler('dice.stat', 'dice.attack')]},
  {area: 'Rules', name: '31 conditions with recovery, timed on the Banana Watch clock', since: '0.2.0 / 0.5.6', where: 'Sheet conditions', probes: [file('module/rules/conditions.mjs'), has('module/world/items.mjs', 'expiresAt')]},
  {area: 'Rules', name: 'First aid, rest at the flat or a safehouse', since: '0.2.1', where: 'Sheet quick actions', probes: [handler('aid.apply', 'aid.offer', 'recovery.rest'), api('firstAid', 'rest')]},
  {area: 'Rules', name: 'Wasted (A&E) and Busted (custody)', since: '0.2.0', where: 'When you go down or come quietly', probes: [handler('heat.busted', 'heat.wasted')]},
  {area: 'Rules', name: 'Teamwork / aid another, quick checks, hazards', since: '0.2.0', where: 'GM Screen', probes: [has('module/gm/catalogue.mjs', 'stop-search', 'pickpocket')]},
  // ---------------------------------------------------------------- combat
  {area: 'Combat', name: 'Speed-dice combat in the Combat Console', since: '0.2.0', where: 'Combat Console', probes: [file('module/apps/combat-console.mjs', 'templates/combat-console.hbs'), handler('combat.speed', 'combat.reveal', 'combat.resolve', 'combat.next', 'combat.begin'), api('openCombat')]},
  {area: 'Combat', name: 'Reactions (take the hit or dodge), cover, aim, surrender, grab, cuff', since: '0.2.1', where: 'Combat Console', probes: [handler('combat.hit', 'combat.flag', 'combat.surrender', 'combat.grab', 'combat.cuff', 'combat.release')]},
  {area: 'Combat', name: 'Police join the fight; reinforcements go on the tracker', since: '0.5.19', where: 'Combat', probes: [has('module/world/chase.mjs', 'export async function joinReinforcements'), handler('combat.policeFight', 'combat.dealIn')]},
  {area: 'Combat', name: 'Speed dice come back every fight', since: '0.5.17', where: 'Combat Console', probes: [handler('combat.npcSpeed')]},
  {area: 'Combat', name: 'Ram, PIT and evasive driving', since: '0.5.0', where: 'Vehicle sheet; Combat Console', probes: [handler('combat.ram', 'chase.pit', 'chase.evasive')]},
  // ---------------------------------------------------------------- vehicles & driving
  {area: 'Vehicles', name: 'Boarding, seats, exits, moving with your crew aboard', since: '0.1.0', where: 'Right-click a vehicle', probes: [has('module/vehicles/vehicle-boarding.mjs', 'export function boardVehicle', 'export function exitVehicle'), api('vehicles')]},
  {area: 'Vehicles', name: 'Movement gauge: green, yellow, red', since: '0.5.0', where: 'On the map while driving', probes: [file('module/map/drive-gauge.mjs')]},
  {area: 'Vehicles', name: 'Driving checks, evasive manoeuvres, collisions, fire and explosions', since: '0.5.0', where: 'Chat cards while driving', probes: [has('module/world/incidents.mjs', 'export async function promptCheck'), handler('drive.ignite', 'drive.explode', 'drive.putOut')]},
  {area: 'Vehicles', name: 'Driving rolls itself: evasive (default on), yellow / red and PIT (default off)', since: '0.5.1 (restored 0.5.25)', where: 'Street Control and the Blower', probes: [setting('autoEvade', 'autoDriveChecks'), has('module/world/incidents.mjs', "setting('autoDriveChecks', false)")]},
  {area: 'Vehicles', name: 'Vehicle sheet in the character-sheet format', since: '0.5.0', where: 'Vehicle actors', probes: [file('templates/vehicle-sheet.hbs'), has('module/apps/sheets.mjs', 'class SmokeVehicleSheet')]},
  {area: 'Vehicles', name: 'Blue lights and ANPR plate scans', since: '0.2.0', where: 'Police vehicles', probes: [has('module/vehicles/vehicle-abilities.mjs', 'export const toggleLights', 'export const scanPlate')]},
  {area: 'Vehicles', name: 'Travel meter: every journey counted', since: '0.5.4', where: 'Vehicle sheet', probes: [has('module/vehicles/travel-meter.mjs', 'export async function recordJourney', 'export function withMeters')]},
  {area: 'Vehicles', name: 'Refuel, repair, new plates, change of clothes', since: '0.2.1', where: 'Local services', probes: [handler('items.refuel', 'items.repair', 'items.plates', 'items.changedClothes', 'service.use'), api('services')]},
  // ---------------------------------------------------------------- crime, heat, police
  {area: 'Police', name: 'Heat 0–5 stars by crime severity (thieving 1★, fights 2★, guns 3★, killings 4–5★)', since: '0.2.0 / 0.5.22', where: 'Sheet Heat stars; Street Control crime table', probes: [has('module/config.mjs', 'export const CRIMES', 'copKiller', 'export function crimeHeatText'), handler('heat.crime', 'heat.set')]},
  {area: 'Police', name: 'Police response by star, map limit, helicopter, ARV, roadblocks', since: '0.2.0 / 0.5.22', where: 'Automatic; Street Control', probes: [setting('policeResponse', 'policeMaxUnits', 'policeChase', 'heatCooling'), handler('heat.respond', 'heat.standDown'), has('module/rules/core.mjs', 'export function policeResponse')]},
  {area: 'Police', name: 'Police stops with your decision: talk, run, come quietly, fight', since: '0.5.1', where: 'Chat card when stopped', probes: [has('module/world/pursuit.mjs', 'export async function offerStop'), handler('chase.respond')]},
  {area: 'Police', name: 'The escape move after a successful talk or run', since: '0.5.18', where: 'On the map', probes: [handler('chase.footMove')]},
  {area: 'Police', name: 'Turn-based chases: Full Auto, Assisted or Manual', since: '0.5.0 / 0.5.4', where: 'Combat Console', probes: [setting('autoChase', 'chaseMode', 'chaseDelay', 'chaseTrafficMode'), handler('chase.start', 'chase.end', 'chase.auto', 'chase.npcTurn'), api('chase')]},
  {area: 'Police', name: 'Chase switches in Street Control and the Blower', since: '0.5.1 (restored 0.5.25)', where: 'Street Control → Chases & driving; Blower → Police chases', probes: [handler('chase.settings'), tpl('phone.hbs', 'data-chase-switch'), tpl('street-control.hbs', 'data-chase-switch', 'data-chase-default-mode'), file('module/apps/chase-controls.mjs')]},
  {area: 'Police', name: 'Nicking bikes and cars, carjacking (moving traffic or an NPC at the wheel), pickpocketing', since: '0.1.0 / 0.5.24', where: 'Right-click a vehicle or person', probes: [handler('theft.carjack', 'theft.pickpocket', 'theft.resolve'), has('module/world/theft.mjs', 'export const npcAtWheel', 'export const carjackable')]},
  {area: 'Police', name: 'Fences: Pat buys two wheels, Bow Breakers buys motors; hot vehicles', since: '0.2.0', where: 'Pull up at the fence', probes: [handler('theft.sell'), has('module/world/theft.mjs', 'export const FENCES')]},
  {area: 'Police', name: 'Player right-click street menu on tokens they don\'t own (drawn before or after load)', since: '0.5.4 / 0.5.24', where: 'Right-click; Alt+I', probes: [file('module/interaction/player-context.mjs'), has('the-smoke.mjs', "safe('player right-click actions', installPlayerInteractions)")]},
  // ---------------------------------------------------------------- the street
  {area: 'Street', name: 'Street Life: traffic on the real roads, parked cars, pedestrians', since: '0.2.0 / 0.4.2', where: 'Street Control', probes: [setting('streetLife', 'trafficCars', 'parkedCars', 'pedestrians', 'trafficTick'), handler('traffic.populate', 'traffic.clear'), api('streetLife', 'traffic')]},
  {area: 'Street', name: 'People in moving cars (drivers, passengers, police crews)', since: '0.5.20', where: 'Street Life', probes: [file('module/world/traffic-crew.mjs')]},
  {area: 'Street', name: '20 street maps, the London overview, 160 venue interiors and 51 approaches', since: '0.1.1 / 0.4.0', where: 'Scenes; Travel', probes: [count('venues', 211), has('module/map/map-transit.mjs', 'export function importAllMaps'), api('travel', 'importAllMaps')]},
  {area: 'Street', name: 'Sat nav HUD with directions to jobs, missions and anywhere', since: '0.2.4', where: 'Blower → Sat nav; Alt+N', probes: [file('module/map/satnav.mjs'), api('satnav'), setting('satnavUnits')]},
  {area: 'Street', name: 'Banana Watch world clock', since: '0.5.0', where: 'Always on screen', probes: [setting('bananaWatch', 'clockMode', 'clockRate'), api('clock')]},
  {area: 'Street', name: 'Crew bar', since: '0.5.0', where: 'Always on screen', probes: [setting('crewBar'), api('crewBar')]},
  {area: 'Street', name: 'Drug highs and comedowns on screen', since: '0.5.0', where: 'Player screens', probes: [setting('drugFX'), api('drugFX')]},
  {area: 'Street', name: 'Shops with Rep locks and discounts; buying and selling', since: '0.2.0', where: 'Sheet → Shop here', probes: [handler('shop.buy', 'shop.sell', 'shop.service'), api('openShop', 'shops')]},
  {area: 'Street', name: 'Banana Basket: order high-street stock on the Blower, delivered to Your Flat (fee and delivery time set by the GM; GM can deliver now or cancel)', since: '0.5.27', where: 'The Blower → Shop / Order to the flat', probes: [handler('delivery.order', 'delivery.collect', 'delivery.cancel', 'delivery.now'), setting('phoneOrders', 'deliveryFee', 'deliveryMinutes'), api('deliveries', 'openOrders'), file('module/world/deliveries.mjs', 'module/apps/order.mjs', 'templates/order.hbs'), tpl('phone.hbs', 'data-orders', 'data-collect-orders')]},
  {area: 'Street', name: 'Lag guard: slow loops rest instead of freezing the table', since: '0.5.22', where: 'Automatic', probes: [file('module/world/slow-guard.mjs')]},
  // ---------------------------------------------------------------- jobs
  {area: 'Jobs', name: 'Shifts: taxi, courier, paramedic, fire, bus, police (disturbance, ANPR, pursuit)', since: '0.2.0', where: 'Get in a job vehicle → start a shift', probes: [handler('job.start', 'job.accept', 'job.decline', 'job.end', 'job.roll', 'job.tick', 'job.pause'), api('jobs')]},
  {area: 'Jobs', name: 'Auntie Pat\'s orders with Kez\'s tip-offs', since: '0.1.0', where: 'Blower → Ask Pat for an order', probes: [handler('job.crew'), tpl('phone.hbs', 'data-pat')]},
  // ---------------------------------------------------------------- missions
  {area: 'Missions', name: 'Mission Board: 125 London missions, 42 graffiti commissions, 12 radio wars', since: '0.2.0 / 0.3.0 / 0.5.8 / 0.5.14', where: 'Mission Board', probes: [count('londonMissions', 125), count('taggingMissions', 42), count('radioWarMissions', 12), api('openMissions', 'missions'), handler('mission.start', 'mission.tick', 'mission.set')]},
  {area: 'Missions', name: 'Story mode and Self-play', since: '0.5.0', where: 'Street Control; Mission Board', probes: [setting('playMode'), tpl('street-control.hbs', 'data-play-mode')]},
  {area: 'Missions', name: 'Objectives that tick themselves (maps, sales, services, jobs, cargo, tags, radio)', since: '0.3.0 / 0.5.6', where: 'Mission Board', probes: [has('module/world/missions.mjs', "on: 'map'", 'missionEvent')]},
  {area: 'Missions', name: 'Physical mission property: carry, drop, deliver', since: '0.5.6', where: 'Mission Board cargo panel', probes: [handler('missionProp.move', 'missionProp.respawn'), api('props')]},
  {area: 'Missions', name: 'Factions: Renown, Influence and stance', since: '0.3.0', where: 'Mission Board → Factions & Renown', probes: [handler('faction.set'), tpl('mission-board.hbs', 'Factions &amp; Renown')]},
  {area: 'Missions', name: 'Update who\'s on a running mission', since: '0.5.23', where: 'Mission Board', probes: [handler('mission.crew'), tpl('mission-board.hbs', 'data-crew')]},
  {area: 'Missions', name: 'Every job plays through by itself: a shared car counts for everyone in it, a nicked motor counts wherever it was nicked, Pat isn\'t the only buyer, set-up never blocks a job', since: '0.5.27', where: 'Mission Board / mission automation',
   probes: [has('module/rules/mission-contract.mjs', 'export function locationRelaxed', 'export function fenceOfAnchor', 'boarded:${ev.actorId}'), has('module/world/mission-automation.mjs', 'function adoptTarget'), file('tests/mission-playthrough.mjs', 'tests/mission-playthrough.test.mjs')]},
  {area: 'Missions', name: 'Mark a step done by hand: a player on the job (Self-play) for a ready step, the GM for any step, reopen or pass the job', since: '0.5.27', where: 'Mission Board → Mark done / Reopen', probes: [handler('mission.tick'), tpl('mission-board.hbs', 'data-complete="1"')]},
  {area: 'Missions', name: 'Sat nav to the job\'s motor, the wall to paint or the radio contact, finishing what\'s at the place you\'re in first', since: '0.5.27', where: 'Mission Board → Directions; the Blower', probes: [has('module/map/satnav.mjs', 'export function stepOrder', "o.auto?.on==='radioWar'")]},
  {area: 'Missions', name: 'Checkpoints where the objective says (Westfield, Big Night\'s lock-up, painted walls and more), checked against the GM files', since: '0.5.27', where: 'data/mission-automation.json', probes: [file('scripts/missions/fix-contracts.mjs'), has('scripts/missions/build-files.mjs', 'function contractSection')]},
  {area: 'Missions', name: 'A DM mission file for every mission (brief, read-aloud, scenes, cast, DM notes)', since: '0.5.25', where: 'Mission Board → the mission\'s page', probes: [{kind: 'missionPages'}]},
  // ---------------------------------------------------------------- graffiti & radio
  {area: 'Graffiti', name: 'Tag Studio: vector handstyles, quality tiers, decals that stay, vehicle decals', since: '0.5.8 / 0.5.11', where: 'Alt+G; right-click a surface', probes: [file('module/apps/tag-studio.mjs', 'module/graffiti/runtime.mjs', 'module/graffiti/paint-choices.mjs'), handler('graffiti.paint', 'graffiti.repair'), api('tags', 'graffiti', 'openTagStudio')]},
  {area: 'Graffiti', name: '57 tag sites including real parked buses', since: '0.5.8 / 0.5.22', where: 'Street maps', probes: [count('tagSites', 57), handler('graffiti.prepareMissionSpots', 'graffiti.repairMissionSpots')]},
  {area: 'Graffiti', name: 'Piece styles: street and marker tags, throw-ups, bubbles, old skool, blockbusters, 3D, new skool, burners, wildstyle, semi-wild, spikes, stencils, drips, fat cap, straight letters', since: '0.5.26', where: 'Tag Studio → Style',
   probes: [file('module/graffiti/pieces.mjs', 'module/graffiti/letters.mjs', 'data/graffiti-letters.json', 'tests/graffiti-pieces.test.mjs'), has('module/graffiti/pieces.mjs', 'throwup:', 'bubble:', 'oldskool:', 'newskool:', 'wildstyle:', 'burner:', 'deep3d:', 'export function renderPiece'), has('module/graffiti/runtime.mjs', 'await loadPieceLetters()')]},
  {area: 'Graffiti', name: 'Graffiti characters beside the letters (writers, one per faction, radio)', since: '0.5.26', where: 'Tag Studio → Piece → Character',
   probes: [has('module/graffiti/characters.mjs', 'DEF.bboy', 'DEF.d20', 'DEF.cog', 'DEF.boombox', 'DEF.staffy', 'DEF.spider', 'DEF.mic'), tpl('tag-studio.hbs', 'name="character"', 'name="fill2"')]},
  {area: 'Graffiti', name: 'Graffiti presets: ASMO and 2CB in every style, each faction\'s pieces, station shout-outs, street pieces', since: '0.5.26', where: 'Tag Studio → Presets',
   probes: [file('module/graffiti/presets.mjs', 'scripts/graffiti/build-art.mjs', 'assets/graffiti/presets/asmo-wildstyle.svg', 'assets/graffiti/presets/2cb-bubble.svg', 'assets/graffiti/svg/ch/exceptionalSuccess.svg', 'assets/graffiti/svg/street/fullSuccess.svg'),
     has('module/graffiti/presets.mjs', "'ASMO'", "'2CB'", 'Radio · '), tpl('tag-studio.hbs', 'data-preset')]},
  {area: 'Radio', name: 'Six live pirate radio presets, car and phone reception, studio inbox', since: '0.1.3 / 0.5.15', where: 'Blower; car radio', probes: [handler('radio.tune', 'radio.studio.submit'), setting('radioStations', 'radioEnabled'), api('radio')]},
  {area: 'Radio', name: 'Radio Wars', since: '0.5.14', where: 'Mission Board', probes: [handler('radioWar.act'), api('radioWar')]},
  // ---------------------------------------------------------------- GM tools
  {area: 'GM', name: 'GM Screen: quick checks, teamwork, hazards, street and police events, rewards, NPCs', since: '0.2.0', where: 'Scene controls; Settings', probes: [file('module/apps/gm-screen.mjs', 'templates/gm-screen.hbs'), handler('gm.reward', 'gm.placeNPC', 'gm.patrol', 'gm.tipoff', 'gm.rivals'), api('openGMScreen')]},
  {area: 'GM', name: 'GM Screen gives and takes cash and kit for any character', since: '0.2.0 / 0.5.27', where: 'GM Screen → Rewards', probes: [handler('gm.reward'), tpl('gm-screen.hbs', 'data-give-item="take"', 'data-give-cash="take"'), has('module/gm/automation.mjs', 'lib && take')]},
  {area: 'GM', name: 'Street Control: world setup, Street Life, police, Heat by name, advances, job vehicles', since: '0.2.0', where: 'Settings → Open Street Control', probes: [has('module/apps/phone.mjs', 'export class StreetControl'), api('control', 'openStreetControl', 'setup', 'diagnostics')]},
  {area: 'GM', name: 'World setup and upgrades that keep GM-edited journal pages', since: '0.2.1 / 0.5.2', where: 'Automatic', probes: [has('module/content.mjs', 'export async function migrateWorld', 'export async function refreshShippedPages')]},
  // Audit branch protections retained alongside every incoming capability.
  {area: 'Merged audit', name: 'Run-bound automatic mission receipts, location and prerequisite checks', since: '0.5.25-rc.1', where: 'Mission Board / mission automation', probes: [file('data/mission-automation.json','module/rules/mission-contract.mjs'), handler('mission.action.begin','mission.action.resolve','mission.repair')]},
  {area: 'Merged audit', name: 'Party-sized mission resources and contribution requirements', since: '0.5.25-rc.1', where: 'Mission start and completion', probes: [has('module/rules/mission-contract.mjs','crewMin2','contributionMissing'), file('tests/mission-preflight-v2.test.mjs')]},
  {area: 'Merged audit', name: 'Venue-specific positioned counters and scoped commerce', since: '0.5.25-rc.1', where: '199 counter profiles / 160 interiors', probes: [file('data/venue-services.json','module/world/venues.mjs','tests/venue-commerce-v2.test.mjs')]},
  {area: 'Merged audit', name: 'Recoverable authoritative item actions and inventory receipts', since: '0.5.25-rc.1', where: 'Item actions / operations', probes: [file('module/world/item-actions.mjs','tests/item-actions-v2.test.mjs'), handler('item.action','item.approvePerk')]},
  {area: 'Merged audit', name: 'Situational perk bridge including all nine new stat-balancing perks', since: '0.5.27-rc.1', where: 'Validated world, mission and GM-request contexts', probes: [file('tests/merged-context-bridge.test.mjs'), has('module/rules/item-context.mjs','authoredPerkTags','Shoulder Charge','Quick Draw','Poker Face')]},
  {area: 'Merged audit', name: 'Temporary weapon areas and conditional defensive equipment rules', since: '0.5.25-rc.1', where: 'Combat and item effects', probes: [file('module/world/weapon-areas.mjs','tests/context-and-areas-v2.test.mjs')]},
  {area: 'Merged audit', name: 'Main-stat roll state controls and one Blower alongside token editing', since: '0.5.25-rc.1', where: 'Character sheet', probes: [tpl('actor-sheet.hbs','smoke-roll-states','data-token-build','data-phone'), file('tests/merged-branch-preservation.test.mjs')]},
  {area: 'Merged audit', name: 'Immutable full-build v0.5.24 gate and three-branch content conservation', since: '0.5.27-rc.1', where: 'scripts/regression/check_upgrade.py / tests/merge-input-contract.json', probes: [file('scripts/regression/check_upgrade.py','tests/merge-input-contract.json','tests/merged-branch-preservation.test.mjs')]},
  // ---------------------------------------------------------------- content
  {area: 'Content', name: 'Item library: 171 weapons, armour, gear, drugs, food, clothes and perks', since: '0.2.1', where: 'The Smoke — Kit', probes: [count('items', 171)]},
  {area: 'Content', name: 'The cast: 115 named people', since: '0.4.0', where: 'Actors', probes: [count('cast', 115), api('cast')]},
  {area: 'Content', name: 'Guides: Player\'s Handbook, GM\'s Book, London Guide, faction files, local cases, venue register', since: '0.2.0 / 0.5.2', where: 'Journals', probes: [count('journals', 27), count('journalPages', 270)]},
  {area: 'Content', name: 'Guides written from the live rules: eight-step creation, the token builder, nine stats and where each is rolled, Rep 1-33, milestones, unlocks, Pat\'s orders, hired hands', since: '0.5.25', where: 'Player\'s Handbook; Player Guide; GM\'s Book → Rewards and XP', probes: [file('scripts/journals/edition-0525.mjs'), has('data/london-guides.json', 'The nine stats, and where the game uses them', 'All thirty-three levels', 'Hired hands (Rep 13+)', 'Calling for the right stat')]},
  {area: 'Content', name: 'GM mission-file journals for the street commissions and the radio wars', since: '0.5.25', where: 'Journals (GM only)', probes: [has('data/london-guides.json', 'Street Commissions — Mission Files', 'Radio Wars — Mission Files')]},
  {area: 'Content', name: 'Compendium packs', since: '0.1.0', where: 'Compendiums', probes: [count('packs', 10)]},
  {area: 'Content', name: 'Art: tokens, maps, icons, emblems, branding', since: '0.1.0', where: 'assets/', probes: [count('assets', 1000)]}
];

/** Taken out on purpose — never reported as lost. */
export const RETIRED = [
  {name: '0.1.3 sheet, Blower and Street Control templates (actor.hbs, control.hbs, item.hbs)', why: 'Merged into the 0.2.0 windows in 0.2.1; every feature kept.'},
  {name: '0.1.3 alternate pregen records (femi, jaz, sal, tealeaf duplicates)', why: 'Duplicates of the 0.2.0 pregens; dropped in 0.2.1.'},
  {name: 'Rep 1–5 unlock ladder', why: 'Replaced by the Rep 1–33 ladder in 0.5.0; the unlocks moved to new levels.'},
  {name: 'pickChaseTraffic / per-car traffic turns', why: 'Replaced by the shared traffic phase (or individual dice by setting) in 0.5.4.'},
  {name: 'crew.mjs (0.5.19 work in progress)', why: 'Superseded by the user\'s traffic-crew.mjs in 0.5.20.'},
  {name: 'Player-facing WhatsApp / SMS / email / phone studio links', why: 'Replaced in 0.5.15 by the private in-game studio inbox; the GM keeps the real contact panel.'},
  {name: 'CodeSouth and Esencia Urbana radio presets', why: 'Retired in 0.5.15.'},
  {name: 'The 0.1.3 GM-guide Mission 1–3 pages', why: 'Superseded by the opening mission pages in 0.5.2.'},
  {name: 'Unowned-vehicle boarding popup (0.5.1)', why: 'Replaced by the player street menu (player-context.mjs) in 0.5.4.'}
];
