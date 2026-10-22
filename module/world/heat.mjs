// Heat: the wanted level in play. Police units come to whichever map a wanted character is on — area cars,
// bikes, carriers, NPAS India 99 at three stars, armed response at four, roadblocks at five. Out of sight of every
// unit for long enough, a star drops. Down and out: Wasted (A&E). Caught: Busted (custody suite).
import {advanceRoad} from '../rules/roads.mjs';
import {networkOf, drivingNetwork} from './roads.mjs';
import * as TC from '../rules/traffic-core.mjs';
import {NS, HEAT} from '../config.mjs';
import {clampHeat, policeResponse, coolDownSeconds, wastedCost, bustedCost} from '../rules/core.mjs';
import {rng, pick, drivable, zoneAtPoint, nearestService} from '../rules/jobs-core.mjs';
import {isLeader, registerHandler, request, card, esc, ownersOf} from './net.mjs';
import {ensureVehicleActor, placeToken, zonesOf, isStreetScene, mapIdOf, lanePoint, tokenCentre, distanceSquares, relocate, actorToken} from './spawn.mjs';
import {loadAtlas} from '../map/map-transit.mjs';
import {chaseOf, stateOf} from './chase-state.mjs';
import {recordJourney, withMeters} from '../vehicles/travel-meter.mjs';
import {slowGuard} from './slow-guard.mjs';
import {offerStop} from './pursuit.mjs';
import {ensureAmbientCrew,carryCrewInBatch} from './traffic-crew.mjs';

const setting = (k, d) => { try { return game.settings.get(NS, k); } catch (_e) { return d; } };
const SIGHT = 14;      // squares a unit on the ground can see you
export const policeUnits = scene => scene.tokens.filter(t => t.getFlag(NS, 'police'));
const wantedTokens = scene => scene.tokens.filter(t => t.actor?.type === 'character' && clampHeat(t.actor.system.heat?.value) > 0);
/** The character's token in play (not a stale one left on another map). */
const tokenFor = actor => actorToken(actor);

export function registerHeatSettings() {
  const reg = (k, o) => { try { game.settings.register(NS, k, {scope: 'world', config: true, ...o}); } catch (_e) {} };
  reg('policeResponse', {name: 'Heat: police respond automatically', hint: 'Spawn police units on the map of a wanted character, and have them hunt.', type: Boolean, default: true});
  reg('policeChase', {name: 'Heat: police units drive themselves', hint: 'Units move toward the wanted character every few seconds. Turn off to move them yourself.', type: Boolean, default: true});
  reg('heatCooling', {name: 'Heat: stars drop when out of sight', hint: 'Lose one star after a while with no police unit in sight (longer at higher Heat).', type: Boolean, default: true});
  reg('policeMaxUnits', {name: 'Heat: most police vehicles on a map', hint: 'However many stars, never more police cars, vans and ARVs than this on one map (the helicopter and officers on foot are extra). Lower it if the screen gets swamped or the game slows down.', type: Number, default: 4, range: {min: 1, max: 12, step: 1}});
}

/* ------------------------------------------------------------------ spawning the response */
const UNIT = {car: 'LV23', bike: 'LV11', van: 'LV24', arv: 'LV25', heli: 'LV29'};
const responding=new Map();
export function respond(scene,target){
 if(!scene)return Promise.resolve(0);
 const next=(responding.get(scene.id)||Promise.resolve()).catch(()=>{}).then(()=>respondNow(scene,target));responding.set(scene.id,next);
 void next.finally(()=>{if(responding.get(scene.id)===next)responding.delete(scene.id);}).catch(()=>{});return next;
}
async function respondNow(scene, target) {
  if (!isLeader() || !setting('policeResponse', true) || !isStreetScene(scene)) return 0;
  const stars = clampHeat(target.actor.system.heat?.value); if (!stars) return 0;
  const want = policeResponse(stars), have = policeUnits(scene);
  const n = k => have.filter(t => t.getFlag(NS, 'police')?.unit === k).length;
  // A ceiling on police vehicles per map, whatever the stars (helicopter and officers on foot not counted).
  const cap = Math.max(1, Number(setting('policeMaxUnits', 4)) || 4);
  let ground = groundUnits(scene).length;
  const r = rng(Date.now()); const roads = drivable(zonesOf(scene)).filter(z => z.kind === 'road');
  const [tx, ty] = tokenCentre(target), far = roads.filter(z => Math.hypot(z.rect[0] + z.rect[2] / 2 - tx, z.rect[1] + z.rect[3] / 2 - ty) > scene.grid.size * 12);
  const pool = far.length ? far : roads; if(!pool.length)return 0; let made = 0;
  const spawn = async (unit, count) => {
    for (let i = n(unit); i < count && ground < cap; i++, ground++) {
      const actor = await ensureVehicleActor(UNIT[unit]); const p = lanePoint(pick(pool, r), r, null, scene);
      const t = await placeToken(scene, actor, p.x, p.y, {rotation: p.rotation, flags: {police: {unit, hunting: target.actor.id}, issued: true, locked: true}});
      if(t)await ensureAmbientCrew(t);
      if (t) await t.update({[`flags.${NS}.lightsOn`]: true, light: {dim: 5, bright: 1.5, color: '#3d5bff', alpha: .5, animation: {type: 'siren', speed: 7, intensity: 7}}, ...(actor.getFlag(NS, 'lightsImg') ? {'texture.src': actor.getFlag(NS, 'lightsImg')} : {})}, {acVehicleCarry: true});
      made++;
    }
  };
  // Most important first, so the ceiling cuts the extras: area cars, then armed response, then the carrier.
  await spawn('car', want.cars); await spawn('arv', want.arv); await spawn('van', want.vans); await spawn('bike', want.bikes);
  if (want.helicopter && !n('heli')) {
    const actor = await ensureVehicleActor(UNIT.heli);
    const heli=await placeToken(scene, actor, tx + scene.grid.size * 6, ty - scene.grid.size * 6, {flags: {police: {unit: 'heli', hunting: target.actor.id}, issued: true, locked: true}, options: {}});
    if(heli){await heli.update({elevation:60},{acVehicleCarry:true});await ensureAmbientCrew(heli);}
    made++;
  }
  if (made) await card('POLICE', `${HEAT[stars].name}: units dispatched`, `<p>${made} unit${made > 1 ? 's' : ''} inbound on <b>${esc(scene.name)}</b> for ${esc(target.name)}. ${esc(HEAT[stars].response)}</p>${await enlistDispatched(scene, target)}`, `heat h${stars}`);
  return made;
}
/** Police vehicles on the ground on this map (not the helicopter, not officers on foot, not wrecks). */
function groundUnits(scene) { return policeUnits(scene).filter(t => !['heli', 'officer'].includes(t.getFlag(NS, 'police')?.unit) && !t.actor?.system?.vehicle?.destroyed); }
/**
 * Stars come down: units beyond what the new Heat calls for go back to the station — the extras first (carrier, ARVs,
 * then cars), and only ones nobody can see, that aren't in a fight or chase and have no player in them. The
 * helicopter goes home below three stars. Leader only.
 */
export async function scaleBack(scene) {
  if (!isLeader() || !scene) return 0;
  const top = Math.max(0, ...wantedTokens(scene).map(t => clampHeat(t.actor.system.heat?.value)));
  if (!top) return 0;   // nobody wanted at all: standDown handles that
  const want = policeResponse(top), fights = new Set((game.combats?.filter?.(c => c.scene?.id === scene.id) ?? []).flatMap(c => c.combatants.map(x => x.tokenId)));
  const pcs = scene.tokens.filter(t => t.actor?.type === 'character');
  const unseen = u => !pcs.some(p => distanceSquares(u, p) <= SIGHT);
  const free = u => !fights.has(u.id) && !(u.getFlag(NS, 'vehicleOccupants') || []).some(o => scene.tokens.get(o.tokenId)?.actor?.type === 'character') && unseen(u);
  const go = [];
  for (const [unit, keep] of [['van', want.vans], ['arv', want.arv], ['bike', want.bikes], ['car', want.cars], ['heli', want.helicopter ? 1 : 0]]) {
    const list = policeUnits(scene).filter(t => t.getFlag(NS, 'police')?.unit === unit && !t.getFlag(NS, 'police')?.parked);
    for (const u of list.slice(keep)) if (free(u)) go.push(u.id);
  }
  if (go.length) await scene.deleteEmbeddedDocuments('Token', go, {smokeDespawn: true});
  return go.length;
}
/**
 * A fight or chase already on when more units are dispatched: they go straight onto its combat tracker and act on
 * their own speed dice (this round if the dice are still being rolled, otherwise from the next). Returns the line for
 * the dispatch card ('' when there is no fight).
 */
export async function enlistDispatched(scene, target) {
  const fight = combatFor(scene, target); if (!fight) return '';
  const {joinReinforcements} = await import('./chase.mjs');
  const joined = await joinReinforcements(fight, null, {announce: false}); if (!joined) return '';
  const when = stateOf(fight).phase === 'intent' ? 'roll speed dice this round' : 'roll speed dice from the next round';
  return `<p><b>${joined} join${joined === 1 ? 's' : ''} the ${fight.getFlag(NS, 'chase') ? 'chase' : 'fight'} on the combat tracker</b> and ${when}. Nobody drives in between turns.</p>`;
}
export async function standDown(scene) {
  const anyWanted = wantedTokens(scene).length;
  if (anyWanted) return 0;
  const ids = policeUnits(scene).filter(t => !(t.getFlag(NS, 'vehicleOccupants') || []).some(o => scene.tokens.get(o.tokenId)?.actor?.type === 'character')).map(t => t.id);
  if (ids.length) await scene.deleteEmbeddedDocuments('Token', ids, {smokeDespawn: true});
  return ids.length;
}

/* ------------------------------------------------------------------ hunting */
const STEP = {E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1]};
const ROT = {E: 270, W: 90, N: 180, S: 0};
/** Move a unit along the roads toward a point: keep to its road, turn at junctions toward the target. */
export function huntStep(unit, zones, g, [tx, ty], speedSquares = 3) {
  const net=networkOf(unit.parent);
  if(net.edges.length){if(Math.hypot(...tokenCentre(unit).map((v,i)=>v-[tx,ty][i]))<g*2.2)return null;return advanceRoad(net,tokenCentre(unit),unit.getFlag(NS,'policeRoad')||{},speedSquares*g,Math.random,[tx,ty]);}
  const [cx, cy] = tokenCentre(unit), here = zoneAtPoint(zones, cx, cy);
  const dx = tx - cx, dy = ty - cy;
  if (Math.hypot(dx, dy) < g * 2.2) return null;
  const options = [];
  const horizontal = !here || here.kind === 'junction' || here.o === 'h' || (!here.o && here.rect[2] >= here.rect[3]);
  const vertical = !here || here.kind === 'junction' || here.o === 'v' || (!here.o && here.rect[3] > here.rect[2]);
  if (horizontal && Math.abs(dx) > g) options.push(dx > 0 ? 'E' : 'W');
  if (vertical && Math.abs(dy) > g) options.push(dy > 0 ? 'S' : 'N');
  if (!options.length) options.push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N'));
  options.sort((a, b) => (Math.abs(b === 'E' || b === 'W' ? dx : dy)) - (Math.abs(a === 'E' || a === 'W' ? dx : dy)));
  for (const dir of options) {
    const [sx, sy] = STEP[dir]; const lim = dir === 'E' || dir === 'W' ? Math.abs(dx) : Math.abs(dy);
    const step = Math.min(speedSquares * g, lim - g * 1.5);
    if (step <= g * .5) continue;
    const nx = cx + sx * step, ny = cy + sy * step, next = zoneAtPoint(zones, nx, ny);
    if (next && ['road', 'junction'].includes(next.kind)) return {x: nx, y: ny, rotation: ROT[dir]};
  }
  return null;
}
/** Squares a second each kind of unit drives at on a chase (a little quicker than ordinary traffic). */
const CHASE_SPEED = {car: 4, arv: 4.5, bike: 5, van: 3};
const unitHeading = u => { const a = (Number(u.rotation) || 0) * Math.PI / 180; return [-Math.sin(a), Math.cos(a)]; };
/**
 * A unit's next move on a chase: along the roads (the sat nav's network) toward the wanted character, as far as it can
 * go in `seconds`, stopping at sharp corners and a couple of squares short of the target. Null when it's there.
 */
export function chaseStep(local, unit, goal, {seconds = 1, g = 100, speed = 4} = {}) {
  const here = tokenCentre(unit); if (Math.hypot(goal[0] - here[0], goal[1] - here[1]) < g * 2.2) return null;
  const trip = TC.tripFrom(local, here, {heading: unitHeading(unit), goal}); if (!trip) return null;
  const route = TC.lanePath(trip.pts, trip.widths, {offset: w => Math.round(TC.laneOffset(w) * 0.5)}), total = TC.pathLength(route);
  const room = total - g * 2.2; if (room <= 2) return null;
  const st = TC.stepAlong(route, 0, Math.min(room, speed * g * seconds)); if (st.s < 2) return null;
  const p = TC.pointAt(route, st.s, {incoming: true});
  return {x: p.x, y: p.y, rotation: TC.rotationOf(p.dx, p.dy)};
}
/** The fight or chase on this map that this character (or the vehicle they're in) is part of; else the map's chase. */
export function combatFor(scene, token) {
  const ids = new Set([token?.id, token?.getFlag?.(NS, 'vehicleSeat')?.vehicleTokenId].filter(Boolean));
  return game.combats?.find?.(c => c.scene?.id === scene?.id && c.combatants?.some?.(x => ids.has(x.tokenId))) ?? chaseOf(scene) ?? null;
}
/**
 * The units that drive themselves in real time this second. Officers on foot fight in the Combat Console; a unit a
 * player has taken over is theirs. While a fight or chase is on, the police in it — and any unit hunting someone in it,
 * which joins its combat tracker — act only on their own speed dice, never in between turns; the helicopter moves once
 * a round in a chase and holds station over a fight. Only units after someone outside every fight keep driving.
 */
export function huntingUnits(scene) {
  const fights = game.combats?.filter?.(c => c.scene?.id === scene.id) ?? [];
  const inFight = new Set(fights.flatMap(c => c.combatants.map(x => x.tokenId)));
  const huntedInFight = new Set(fights.flatMap(c => c.combatants.map(x => x.token?.actorId ?? x.actorId)).filter(Boolean));
  return policeUnits(scene).filter(u => {
    const f = u.getFlag(NS, 'police'); if (f?.unit === 'officer') return false;
    if (inFight.has(u.id)) return false;
    if (fights.length && (f?.unit === 'heli' || huntedInFight.has(f?.hunting))) return false;
    return !(u.getFlag(NS, 'vehicleOccupants') || []).some(o => scene.tokens.get(o.tokenId)?.actor?.type === 'character');
  });
}
async function huntTick(scene, seconds = 1) {
  const zones = zonesOf(scene), g = scene.grid.size, updates = [];
  const local = await drivingNetwork(scene).catch(() => null);
  for (const u of huntingUnits(scene)) {
    const f = u.getFlag(NS, 'police');
    const target = scene.tokens.find(t => t.actorId === f.hunting && clampHeat(t.actor?.system?.heat?.value) > 0) ?? wantedTokens(scene)[0]; if (!target || target.getFlag(NS, 'policeStop')) continue;
    let goal = tokenCentre(target.getFlag(NS, 'vehicleSeat') ? scene.tokens.get(target.getFlag(NS, 'vehicleSeat').vehicleTokenId) ?? target : target);
    // just lost them: search where they were last seen for a minute
    const cd = scene.getFlag(NS, 'chaseCooldown'); if (cd && Date.now() < Number(cd.until || 0) && cd.last?.[target.actorId]) goal = cd.last[target.actorId];
    if (f.unit === 'heli') {   // the helicopter just follows, hovering behind
      const [cx, cy] = tokenCentre(u), d = Math.hypot(goal[0] - cx, goal[1] - cy);
      if (d > g * 4) updates.push({_id: u.id, x: Math.round(u.x + (goal[0] - cx) / d * Math.min(d - g * 3, g * 6 * seconds)), y: Math.round(u.y + (goal[1] - cy) / d * Math.min(d - g * 3, g * 6 * seconds))});
      continue;
    }
    if (local) {
      const s = chaseStep(local, u, goal, {seconds, g, speed: CHASE_SPEED[f.unit] ?? 4});
      if (s) updates.push({_id: u.id, x: Math.round(s.x - u.width * g / 2), y: Math.round(s.y - u.height * g / 2), rotation: Math.round(s.rotation)});
      continue;
    }
    const s = huntStep(u, zones, g, goal, f.unit === 'bike' ? 4 : f.unit === 'van' ? 2 : 3);
    if (s) updates.push({_id: u.id, x: Math.round(s.x - u.width * g / 2), y: Math.round(s.y - u.height * g / 2), rotation: s.rotation, [`flags.${NS}.policeRoad`]:{edgeId:s.edgeId,distance:s.distance,travelDir:s.travelDir}});
  }
  if(updates.length){
    // one write a second: moves, crews and travel meters together (0.5.22)
    await scene.updateEmbeddedDocuments('Token',carryCrewInBatch(scene,withMeters(scene,updates,'police-roam')),{smokeTraffic:true,acVehicleCarry:true,animate:true,animation:{duration:Math.round(seconds*1000),movementSpeed:4}});
  }
}

/** During a turn-based chase the helicopter moves once per round, not in the halted free-roam timer.
 * It flies a bounded distance, uses a limited visual radius, and searches last-known ground positions. */
export async function helicopterPhase(combat){
  const scene=combat?.scene;if(!scene)return 0;
  const helicopters=policeUnits(scene).filter(t=>t.getFlag(NS,'police')?.unit==='heli'&&!t.actor?.system?.vehicle?.destroyed);
  const g=scene.grid.size;let moved=0;
  for(const heli of helicopters){
    const suspect=scene.tokens.find(t=>t.actor?.type==='character'&&t.actorId===heli.getFlag(NS,'police')?.hunting&&clampHeat(t.actor.system.heat?.value)>0)??wantedTokens(scene)[0];
    if(!suspect||suspect.getFlag(NS,'indoors'))continue;
    const body=suspect.getFlag(NS,'vehicleSeat')?scene.tokens.get(suspect.getFlag(NS,'vehicleSeat').vehicleTokenId)??suspect:suspect;
    const [cx,cy]=tokenCentre(heli),distance=distanceSquares(heli,body);
    const chase=combat.getFlag(NS,'chase')??{};
    const canSee=distance<=22;
    // Ground truth is only updated by actual line-of-sight. When visual contact breaks,
    // the helicopter searches the last seen coordinates instead of knowing the new position.
    if (canSee) await combat.update({[`flags.${NS}.chase.lastSeen.${suspect.actorId}`]:{at:Date.now(),point:tokenCentre(body)}});
    const known=combat.getFlag(NS,'chase')?.lastSeen?.[suspect.actorId]?.point;
    let goal=canSee?tokenCentre(body):known;
    if(!goal)continue;
    if(chase.searching&&!canSee){const turn=Math.max(0,Number(chase.aerialSearchTurn||0));
      const angle=turn*Math.PI/2,rad=(4+(turn%4)*3)*g;
      goal=[goal[0]+Math.cos(angle)*rad,goal[1]+Math.sin(angle)*rad];
      await combat.update({[`flags.${NS}.chase.aerialSearchTurn`]:turn+1});
    }
    const d=Math.hypot(goal[0]-cx,goal[1]-cy),step=Math.min(Math.max(0,d-g*3),g*8);
    if(step<=g*.1)continue;
    const x=Math.round(heli.x+(goal[0]-cx)/d*step),y=Math.round(heli.y+(goal[1]-cy)/d*step);
    await scene.updateEmbeddedDocuments('Token',carryCrewInBatch(scene,[{_id:heli.id,x,y,rotation:Math.round(TC.rotationOf((goal[0]-cx)/d,(goal[1]-cy)/d))}]),{smokeTraffic:true,acVehicleCarry:true,animate:true,animation:{duration:1100}});
    await recordJourney(heli,step/g,{source:'helicopter'});moved++;
  }
  return moved;
}

/* ------------------------------------------------------------------ cooling, sightings */
const lastSeen = new Map();
async function sightTick(scene) {
  if(chaseOf(scene))return; // Only an actual chase owns all police turns, not a plain fight or roadside stop.
  const units = policeUnits(scene), helicopters=units.filter(u=>u.getFlag(NS,'police')?.unit==='heli');
  // eyes on a wanted player who is driving (or anyone at two stars and up): it goes turn-based
  const cd = scene.getFlag(NS, 'chaseCooldown');
  if (setting('autoChase', true) && isStreetScene(scene) && !(cd && Date.now() < Number(cd.until || 0))) {
    const ground = units.filter(u => !['heli', 'officer'].includes(u.getFlag(NS, 'police')?.unit) && !u.getFlag(NS, 'police')?.parked);
    for (const t of wantedTokens(scene)) {
      const seat = t.getFlag(NS, 'vehicleSeat'), body = seat ? scene.tokens.get(seat.vehicleTokenId) ?? t : t, stars = clampHeat(t.actor.system.heat?.value);
      if (!(seat || stars >= 2) || t.getFlag(NS, 'stopped') || t.getFlag(NS, 'indoors')) continue;
      if (game.combats.some(c => c.scene?.id === scene.id && c.combatants.some(x => x.tokenId === t.id))) continue;
      if (!ground.some(u => distanceSquares(u, body) <= SIGHT)) continue;
      await request('chase.start', {sceneId: scene.id, targetId: t.id, reason: seat ? 'Police pursuit' : 'Police chase'}).catch(error => console.warn('The Smoke | starting a chase', error));
      return;
    }
  }
  for (const t of scene.tokens.filter(x => x.actor?.type === 'character')) {
    const a = t.actor, stars = clampHeat(a.system.heat?.value);
    const body=t.getFlag(NS,'vehicleSeat')?scene.tokens.get(t.getFlag(NS,'vehicleSeat').vehicleTokenId)??t:t;
    const seen=!t.getFlag(NS,'indoors')&&(units.some(u=>u.getFlag(NS,'police')?.unit!=='heli'&&distanceSquares(u,body)<=SIGHT)||helicopters.some(u=>distanceSquares(u,body)<=22));
    // a police unit clocking you in a car with a stolen marker
    const seat = t.getFlag(NS, 'vehicleSeat'); const vt = seat && scene.tokens.get(seat.vehicleTokenId);
    if (vt && vt.getFlag(NS, 'stolen') && !vt.getFlag(NS, 'resprayed') && seat.seatId === 'pilot' && units.some(u => distanceSquares(u, vt) <= 8) && stars < 1) {
      await a.setHeat(1, `A passing unit's ANPR pings the ${vt.name}: reported stolen.`); continue;
    }
    if (!stars) { lastSeen.delete(a.id); continue; }
    if (seen) { lastSeen.set(a.id, Date.now()); continue; }
    if (!setting('heatCooling', true)) continue;
    const since = lastSeen.get(a.id) ?? Date.now(); if (!lastSeen.has(a.id)) lastSeen.set(a.id, since);
    if (Date.now() - since >= coolDownSeconds(stars) * 1000) { lastSeen.set(a.id, Date.now()); await a.setHeat(stars - 1, 'Out of sight long enough: the heat dies down a little.'); if (stars - 1 === 0) await standDown(scene); }
  }
  // close enough to nick someone on foot?
  for (const t of wantedTokens(scene)) {
    if (t.getFlag(NS, 'vehicleSeat')) continue;
    if (game.combats.some(c => c.scene?.id === scene.id && c.combatants.some(x => x.tokenId === t.id))) continue;   // already in a fight
    const near = units.find(u => !['heli', 'officer'].includes(u.getFlag(NS, 'police')?.unit) && distanceSquares(u, t) <= 2.5);
    if (near && !t.getFlag(NS, 'stopped')) { await t.setFlag(NS, 'stopped', Date.now()); await stopCard(t, near); }
    if (!near && t.getFlag(NS, 'stopped') && Date.now() - t.getFlag(NS, 'stopped') > 30000) await t.unsetFlag(NS, 'stopped');
  }
}
async function stopCard(t, unit) { return offerStop(t, unit); }

/* ------------------------------------------------------------------ Wasted / Busted */
export async function wasted(actor) {
  const t = tokenFor(actor); const {atlas} = await loadAtlas();
  const from = t ? mapIdOf(t.parent) : 'LDN-HACKNEY';
  const svc = nearestService(atlas, String(from).startsWith('LDN-') ? from : 'LDN-HACKNEY', 'hospital') ?? {mapId: 'LDN-HACKNEY', label: 'Homerton Hospital'};
  const homerton = svc.mapId === 'LDN-HACKNEY';
  const cost = wastedCost(actor.system.cash);
  if (t) await relocate(t, homerton ? 'LDP-HOSPITAL' : svc.mapId, homerton ? {service: 'respawn'} : {zoneId: svc.zoneId});
  const keep = actor.items.filter(i => i.type === 'condition' && i.name === 'Broken').map(i => i.id);
  await actor.deleteEmbeddedDocuments('Item', actor.items.filter(i => i.type === 'condition' && !keep.includes(i.id)).map(i => i.id));
  await actor.update({'system.resources.health.value': actor.system.resources.health.max, 'system.states.down': false,'system.states.downRounds':0,'system.states.reactionUsed':false,'system.states.surrendered':false, 'system.heat.value': 0, [`flags.${NS}.recentCrimes`]: [], 'system.cash': Math.max(0, actor.system.cash - cost)});
  if(t)for(const combat of game.combats){const ids=combat.combatants.filter(c=>c.sceneId===t.parent.id&&c.tokenId===t.id).map(c=>c.id);if(ids.length)await combat.deleteEmbeddedDocuments?.('Combatant',ids);}
  await card('WASTED', actor.name, `<p>You wake up in ${esc(homerton ? 'Homerton A&E' : svc.label)} with a drip in your arm and a nurse who has seen it all before. Your pockets are £${cost} lighter. Heat cleared.</p>`, 'wasted');
  if (t) notifyView(actor);
}
export async function busted(actor) {
  const t = tokenFor(actor);
  if (t) { await t.setFlag(NS, 'policeStop', null); await t.setFlag(NS, 'stopped', null); await t.setFlag(NS, 'policeResisted', null); }
  const cost = bustedCost(actor.system.cash);
  // Evidence: weapons (not your fists), ammo, drugs, and any uniform you had no business wearing.
  const weapons = actor.items.filter(i => (i.type === 'weapon' && i.system.kind !== 'melee-fist' && !['fists', 'unarmed'].includes(i.name.toLowerCase())) || i.type === 'ammo' || i.type === 'drug' || (i.type === 'outfit' && ['police', 'paramedic'].includes(i.system.disguise)));
  if (t) await relocate(t, 'LDP-CUSTODY', {service: 'release'});
  await actor.deleteEmbeddedDocuments('Item', [...weapons.map(i => i.id), ...actor.items.filter(i => i.type === 'condition'&&i.name!=='Broken').map(i => i.id)]);
  await actor.update({'system.heat.value': 0, [`flags.${NS}.recentCrimes`]: [], 'system.states.down': false,'system.states.downRounds':0,'system.states.reactionUsed':false,'system.states.surrendered':false, 'system.resources.health.value': Math.max(1, actor.system.resources.health.value), 'system.cash': Math.max(0, actor.system.cash - cost), 'system.rep.police': Number(actor.system.rep?.police || 0) + 1});
  await card('BUSTED', actor.name, `<p>Booked in, swabbed, photographed, eight hours in a cell and released under investigation from Stoke Newington. Fine and duty solicitor: £${cost}.${weapons.length ? ` Confiscated: ${weapons.map(w => esc(w.name)).join(', ')}.` : ''} Heat cleared.</p>`, 'busted');
  if (t) notifyView(actor);
}
function notifyView(actor) { const t = tokenFor(actor); if (t) game.socket.emit(`system.${NS}`, {type: 'smokeWorld.view', data: {sceneId: t.parent.id, userIds: ownersOf(actor)}}); }

/** Five stars: every exit of a map has a roadblock. Crossing it in a vehicle takes a Hard Wheels roll. */
export async function roadblockCheck(source, vehicleToken, driverActor) {
  if (!driverActor || clampHeat(driverActor.system.heat?.value) < 5) return true;
  const out = await driverActor.rollStat('whl', {band: 'hard', label: 'Run the roadblock'});
  if (out?.result?.success) return true;
  await vehicleToken.actor?.applyDamage?.(6);
  throw new Error(`${vehicleToken.name} hits the roadblock and stops dead.`);
}

registerHandler('heat.set', async ({actorUuid, value, reason, userId}) => {
  const u = game.users.get(userId), a = await fromUuid(actorUuid); if (!a) return;
  if (!u?.isGM && !a.testUserPermission(u, 'OWNER')) throw new Error('Not yours.');
  if (!u?.isGM && Number(value) <= Number(a.system.heat?.value || 0)) throw new Error('Only the GM can lower Heat by hand.');
  return a.setHeat(value, reason);
});
registerHandler('heat.crime', async ({actorUuid, crime, userId}) => { const u = game.users.get(userId), a = await fromUuid(actorUuid); if (!a) return; if (!u?.isGM) throw new Error('GM only.'); return a.reportCrime(crime); });
registerHandler('heat.wasted', async ({actorUuid, userId,messageId}) => { const u = game.users.get(userId), a = await fromUuid(actorUuid); if (!a) return; if (!u?.isGM && !a.testUserPermission(u, 'OWNER')) throw new Error('Not yours.'); const msg=messageId&&game.messages.get(messageId);if(msg?.getFlag(NS,'outcomeResolved'))throw new Error('Already resolved.');await wasted(a);if(msg)await msg.setFlag(NS,'outcomeResolved',true); });
registerHandler('heat.busted', async ({actorUuid, userId,messageId}) => { const u = game.users.get(userId), a = await fromUuid(actorUuid); if (!a) return; if (!u?.isGM && !a.testUserPermission(u, 'OWNER')) throw new Error('Not yours.');const msg=messageId&&game.messages.get(messageId);if(msg?.getFlag(NS,'outcomeResolved'))throw new Error('Already resolved.');await busted(a);if(msg)await msg.setFlag(NS,'outcomeResolved',true); });
registerHandler('heat.respond', async ({sceneId, userId}) => {
  if (!game.users.get(userId)?.isGM) throw new Error('GM only.'); const scene = game.scenes.get(sceneId); if (!scene) throw new Error('Open a map first.');
  for (const t of wantedTokens(scene)) await respond(scene, t);
});
registerHandler('heat.standDown', async ({sceneId, userId}) => { if (!game.users.get(userId)?.isGM) throw new Error('GM only.'); const scene = game.scenes.get(sceneId); if (!scene) throw new Error('Open a map first.'); const ids = policeUnits(scene).filter(t=>!(t.getFlag(NS,'vehicleOccupants')||[]).length).map(t => t.id); if (ids.length) await scene.deleteEmbeddedDocuments('Token', ids, {smokeDespawn: true}); });

let timer = null, huntTimer = null;
export function installHeat() {
  Hooks.on('smokeHeatChanged', async (actor, before, after) => {
    if (!isLeader() || after <= before) return;
    const t = tokenFor(actor); if (t && isStreetScene(t.parent)) await respond(t.parent, t);
  });
  Hooks.on('smokeTransit', async ({target, idMap}) => {
    if (!isLeader()) return;
    for (const id of Object.values(idMap)) { const t = target.tokens.get(id); if (t?.actor?.type === 'character' && clampHeat(t.actor.system.heat?.value)) await respond(target, t); }
  });
  Hooks.on('updateActor', async (actor, changes) => {
    if (!isLeader() || !(Object.hasOwn(changes,'system.heat.value')||foundry.utils.hasProperty(changes,'system.heat.value'))) return;
    const t = tokenFor(actor);
    if (t && isStreetScene(t.parent)) { if (clampHeat(actor.system.heat.value)) { await respond(t.parent,t); await scaleBack(t.parent); } else await standDown(t.parent); }
  });
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    if (!isLeader() || game.paused) return;
    const ids = new Set(game.users.filter(u => u.active).map(u => u.viewedScene).filter(Boolean));
    for (const id of ids) { const s = game.scenes.get(id); if (!s) continue;
      try { await sightTick(s); } catch (error) { console.warn('The Smoke | heat tick', error); } }
  }, 3000);
  // the chase moves every second, each move animated over that second, so units drive rather than hop
  if (huntTimer) clearInterval(huntTimer);
  let hunting = false;
  huntTimer = setInterval(async () => {
    if (!isLeader() || game.paused || hunting || !setting('policeChase', true) || slowGuard.resting('police')) return; hunting = true;
    const started = Date.now();
    try {
      const ids = new Set(game.users.filter(u => u.active).map(u => u.viewedScene).filter(Boolean));
      for (const id of ids) { const s = game.scenes.get(id); if (s && isStreetScene(s) && policeUnits(s).length) await huntTick(s, 1); }
    } catch (error) { console.warn('The Smoke | chase tick', error); } finally { hunting = false; slowGuard.took('police', Date.now() - started, 1000); }
  }, 1000);
}
export const heatAPI = {respond, standDown, scaleBack, roadblockCheck, huntStep, chaseStep, huntingUnits, combatFor,
  setHeat: (actor, v, reason) => request('heat.set', {actorUuid: actor.uuid, value: v, reason}),
  reportCrime: (actor, crime) => request('heat.crime', {actorUuid: actor.uuid, crime}),
  wasted: (actor,options={}) => request('heat.wasted', {actorUuid: actor.uuid,...options}), busted: (actor,options={}) => request('heat.busted', {actorUuid: actor.uuid,...options})};
