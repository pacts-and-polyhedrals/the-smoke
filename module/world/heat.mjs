// Heat: the wanted level in play. Police units come to whichever map a wanted character is on — area cars,
// bikes, carriers, NPAS India 99 at three stars, armed response at four, roadblocks at five. Out of sight of every
// unit for long enough, a star drops. Down and out: Wasted (A&E). Caught: Busted (custody suite).
import {advanceRoad} from '../rules/roads.mjs';
import {networkOf} from './roads.mjs';
import {NS, HEAT} from '../config.mjs';
import {clampHeat, policeResponse, coolDownSeconds, wastedCost, bustedCost, isSuccess} from '../rules/core.mjs';
import {rng, pick, drivable, zoneAtPoint, nearestService} from '../rules/jobs-core.mjs';
import {isLeader, registerHandler, request, card, esc, notify, ownersOf} from './net.mjs';
import {ensureVehicleActor, ensurePersonActor, placeToken, zonesOf, isStreetScene, mapIdOf, lanePoint, tokenCentre, distanceSquares, relocate} from './spawn.mjs';
import {loadAtlas} from '../map/map-transit.mjs';
import {lightsOn} from '../vehicles/vehicle-abilities.mjs';

const setting = (k, d) => { try { return game.settings.get(NS, k); } catch (_e) { return d; } };
const SIGHT = 14;      // squares a unit on the ground can see you
export const policeUnits = scene => scene.tokens.filter(t => t.getFlag(NS, 'police'));
const wantedTokens = scene => scene.tokens.filter(t => t.actor?.type === 'character' && clampHeat(t.actor.system.heat?.value) > 0);
const tokenFor = actor => { for (const s of game.scenes) { const t = s.tokens.find(x => x.actorId === actor.id && x.actor?.type === 'character'); if (t && (s.id === canvas?.scene?.id || !t.hidden)) return t; } return null; };

export function registerHeatSettings() {
  const reg = (k, o) => { try { game.settings.register(NS, k, {scope: 'world', config: true, ...o}); } catch (_e) {} };
  reg('policeResponse', {name: 'Heat: police respond automatically', hint: 'Spawn police units on the map of a wanted character, and have them hunt.', type: Boolean, default: true});
  reg('policeChase', {name: 'Heat: police units drive themselves', hint: 'Units move toward the wanted character every few seconds. Turn off to move them yourself.', type: Boolean, default: true});
  reg('heatCooling', {name: 'Heat: stars drop when out of sight', hint: 'Lose one star after a while with no police unit in sight (longer at higher Heat).', type: Boolean, default: true});
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
  const r = rng(Date.now()); const roads = drivable(zonesOf(scene)).filter(z => z.kind === 'road');
  const [tx, ty] = tokenCentre(target), far = roads.filter(z => Math.hypot(z.rect[0] + z.rect[2] / 2 - tx, z.rect[1] + z.rect[3] / 2 - ty) > scene.grid.size * 12);
  const pool = far.length ? far : roads; if(!pool.length)return 0; let made = 0;
  const spawn = async (unit, count) => {
    for (let i = n(unit); i < count; i++) {
      const actor = await ensureVehicleActor(UNIT[unit]); const p = lanePoint(pick(pool, r), r, null, scene);
      const t = await placeToken(scene, actor, p.x, p.y, {rotation: p.rotation, flags: {police: {unit, hunting: target.actor.id}, issued: true, locked: true}});
      if (t) await t.update({[`flags.${NS}.lightsOn`]: true, light: {dim: 5, bright: 1.5, color: '#3d5bff', alpha: .5, animation: {type: 'siren', speed: 7, intensity: 7}}, ...(actor.getFlag(NS, 'lightsImg') ? {'texture.src': actor.getFlag(NS, 'lightsImg')} : {})}, {acVehicleCarry: true});
      made++;
    }
  };
  await spawn('car', want.cars); await spawn('bike', want.bikes); await spawn('van', want.vans); await spawn('arv', want.arv);
  if (want.helicopter && !n('heli')) {
    const actor = await ensureVehicleActor(UNIT.heli);
    await placeToken(scene, actor, tx + scene.grid.size * 6, ty - scene.grid.size * 6, {flags: {police: {unit: 'heli', hunting: target.actor.id}, issued: true, locked: true}, options: {}}).then(t => t?.update({elevation: 60}, {acVehicleCarry: true}));
    made++;
  }
  if (made) await card('POLICE', `${HEAT[stars].name}: units dispatched`, `<p>${made} unit${made > 1 ? 's' : ''} inbound on <b>${esc(scene.name)}</b> for ${esc(target.name)}. ${esc(HEAT[stars].response)}</p>`, `heat h${stars}`);
  return made;
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
async function huntTick(scene) {
  const zones = zonesOf(scene), g = scene.grid.size, updates = [];
  for (const u of policeUnits(scene)) {
    const f = u.getFlag(NS, 'police'); if (f?.unit === 'officer') continue;   // officers on foot fight in the Combat Console
    if ((u.getFlag(NS, 'vehicleOccupants') || []).some(o => scene.tokens.get(o.tokenId)?.actor?.type === 'character')) continue;
    const target = scene.tokens.find(t => t.actorId === f.hunting) ?? wantedTokens(scene)[0]; if (!target) continue;
    const goal = tokenCentre(target.getFlag(NS, 'vehicleSeat') ? scene.tokens.get(target.getFlag(NS, 'vehicleSeat').vehicleTokenId) ?? target : target);
    if (f.unit === 'heli') {   // the helicopter just follows, hovering behind
      const [cx, cy] = tokenCentre(u), d = Math.hypot(goal[0] - cx, goal[1] - cy);
      if (d > g * 4) updates.push({_id: u.id, x: Math.round(u.x + (goal[0] - cx) / d * Math.min(d - g * 3, g * 8)), y: Math.round(u.y + (goal[1] - cy) / d * Math.min(d - g * 3, g * 8))});
      continue;
    }
    const s = huntStep(u, zones, g, goal, f.unit === 'bike' ? 4 : f.unit === 'van' ? 2 : 3);
    if (s) updates.push({_id: u.id, x: Math.round(s.x - u.width * g / 2), y: Math.round(s.y - u.height * g / 2), rotation: s.rotation, [`flags.${NS}.policeRoad`]:{edgeId:s.edgeId,distance:s.distance,travelDir:s.travelDir}});
  }
  if (updates.length) await scene.updateEmbeddedDocuments('Token', updates, {smokeTraffic: true, animate: true});
}

/* ------------------------------------------------------------------ cooling, sightings */
const lastSeen = new Map();
async function sightTick(scene) {
  const units = policeUnits(scene), heli = units.some(u => u.getFlag(NS, 'police')?.unit === 'heli');
  for (const t of scene.tokens.filter(x => x.actor?.type === 'character')) {
    const a = t.actor, stars = clampHeat(a.system.heat?.value);
    const seen = units.some(u => distanceSquares(u, t) <= SIGHT) || (heli && stars >= 3 && !t.getFlag(NS, 'indoors'));
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
async function stopCard(t, unit) {
  const a = t.actor, stars = clampHeat(a.system.heat?.value);
  await card('POLICE', `"Stop! Police!" — ${t.name}`, `<p>A ${esc(unit.name)} pulls up beside ${esc(t.name)}${stars >= 4 ? ' and armed officers get out' : ''}.</p>
    <div class="smoke-buttons">
      <button type="button" data-smoke-roll="${esc(a.uuid)}" data-stat="mov" data-band="${stars >= 3 ? 'hard' : 'medium'}" data-label="Leg it" data-after="legIt"><i class="fa-solid fa-person-running"></i> Leg it (Moves)</button>
      <button type="button" data-smoke-roll="${esc(a.uuid)}" data-stat="frt" data-band="${stars >= 2 ? 'miracle' : 'hard'}" data-label="Talk your way out" data-after="talkOut"><i class="fa-solid fa-comments"></i> Talk your way out (Front)</button>
      <button type="button" data-smoke-busted="${esc(a.uuid)}"><i class="fa-solid fa-handcuffs"></i> Come quietly (Busted)</button>
      <button type="button" class="gm" data-smoke-police-fight="${esc(t.uuid)}"><i class="fa-solid fa-hand-fist"></i> They fight (start combat)</button>
    </div><p class="smoke-dim">GM: a failed Leg It or Talk means Busted unless they fight.</p>`, `heat h${stars}`);
}

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
  await actor.update({'system.resources.health.value': actor.system.resources.health.max, 'system.states.down': false,'system.states.downRounds':0,'system.states.reactionUsed':false, 'system.heat.value': 0, 'system.cash': Math.max(0, actor.system.cash - cost)});
  if(t)for(const combat of game.combats){const ids=combat.combatants.filter(c=>c.sceneId===t.parent.id&&c.tokenId===t.id).map(c=>c.id);if(ids.length)await combat.deleteEmbeddedDocuments?.('Combatant',ids);}
  await card('WASTED', actor.name, `<p>You wake up in ${esc(homerton ? 'Homerton A&E' : svc.label)} with a drip in your arm and a nurse who has seen it all before. Your pockets are £${cost} lighter. Heat cleared.</p>`, 'wasted');
  if (t) notifyView(actor);
}
export async function busted(actor) {
  const t = tokenFor(actor);
  const cost = bustedCost(actor.system.cash);
  // Evidence: weapons (not your fists), ammo, drugs, and any uniform you had no business wearing.
  const weapons = actor.items.filter(i => (i.type === 'weapon' && i.system.kind !== 'melee-fist' && !['fists', 'unarmed'].includes(i.name.toLowerCase())) || i.type === 'ammo' || i.type === 'drug' || (i.type === 'outfit' && ['police', 'paramedic'].includes(i.system.disguise)));
  if (t) await relocate(t, 'LDP-CUSTODY', {service: 'release'});
  await actor.deleteEmbeddedDocuments('Item', [...weapons.map(i => i.id), ...actor.items.filter(i => i.type === 'condition'&&i.name!=='Broken').map(i => i.id)]);
  await actor.update({'system.heat.value': 0, 'system.states.down': false,'system.states.downRounds':0,'system.states.reactionUsed':false, 'system.resources.health.value': Math.max(1, actor.system.resources.health.value), 'system.cash': Math.max(0, actor.system.cash - cost), 'system.rep.police': Number(actor.system.rep?.police || 0) + 1});
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
  if (!game.users.get(userId)?.isGM) throw new Error('GM only.'); const scene = game.scenes.get(sceneId);
  for (const t of wantedTokens(scene)) await respond(scene, t);
});
registerHandler('heat.standDown', async ({sceneId, userId}) => { if (!game.users.get(userId)?.isGM) throw new Error('GM only.'); const scene = game.scenes.get(sceneId); const ids = policeUnits(scene).filter(t=>!(t.getFlag(NS,'vehicleOccupants')||[]).length).map(t => t.id); if (ids.length) await scene.deleteEmbeddedDocuments('Token', ids, {smokeDespawn: true}); });

let timer = null;
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
    if (t && isStreetScene(t.parent)) { if (clampHeat(actor.system.heat.value)) await respond(t.parent,t); else await standDown(t.parent); }
  });
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    if (!isLeader() || game.paused) return;
    const ids = new Set(game.users.filter(u => u.active).map(u => u.viewedScene).filter(Boolean));
    for (const id of ids) { const s = game.scenes.get(id); if (!s) continue;
      try { await sightTick(s); if (setting('policeChase', true) && isStreetScene(s)) await huntTick(s); } catch (error) { console.warn('The Smoke | heat tick', error); } }
  }, 3000);
}
export const heatAPI = {respond, standDown, roadblockCheck, huntStep,
  setHeat: (actor, v, reason) => request('heat.set', {actorUuid: actor.uuid, value: v, reason}),
  reportCrime: (actor, crime) => request('heat.crime', {actorUuid: actor.uuid, crime}),
  wasted: (actor,options={}) => request('heat.wasted', {actorUuid: actor.uuid,...options}), busted: (actor,options={}) => request('heat.busted', {actorUuid: actor.uuid,...options})};
