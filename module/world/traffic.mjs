// Street Life: random traffic, parked cars, locked bikes and pedestrians on whichever London map players are on.
// Traffic drives the real roads: each car is given a trip along the traced road network (the sat nav's), in at one
// edge of the map and out at another, keeps to the left-hand lane, eases off for sharp corners, queues behind whatever
// is in its lane (a car, a player, a bike) and pulls over for blue lights. Every move is animated over the gap between
// moves, so traffic flows. A car that leaves the map is replaced by one coming in. Parked cars and chained bikes are
// locked: nick them. Moving traffic can be carjacked.
import {NS} from '../config.mjs';
import {advanceRoad} from '../rules/roads.mjs';
import {networkOf, drivingNetwork} from './roads.mjs';
import * as TC from '../rules/traffic-core.mjs';
import {rng, pick, pointIn, drivable, zoneAtPoint, kerbside} from '../rules/jobs-core.mjs';
import {isLeader, registerHandler} from './net.mjs';
import {loadCatalogs, ensureVehicleActor, ensurePersonActor, placeToken, zonesOf, isStreetScene, lanePoint, tokenCentre, distanceSquares} from './spawn.mjs';
import {lightsOn} from '../vehicles/vehicle-abilities.mjs';
import {chaseOf} from './chase-state.mjs';
import {withMeters} from '../vehicles/travel-meter.mjs';
import {slowGuard} from './slow-guard.mjs';
import {ensureAmbientCrew,isBackgroundTraffic,carryCrewInBatch,removeDespawnedCrew} from './traffic-crew.mjs';

const TRAFFIC_POOL = ['LV14', 'LV14', 'LV16', 'LV16', 'LV13', 'LV13', 'LV12', 'LV12', 'LV15', 'LV17', 'LV21', 'LV21', 'LV07', 'LV09', 'LV06', 'LV20', 'LV22', 'LV18', 'LV28'];
const PARKED_POOL = ['LV14', 'LV16', 'LV15', 'LV17', 'LV21', 'LV18', 'LV20', 'LV19', 'LV09', 'LV07', 'LV08', 'LV10'];
const BIKE_POOL = ['LV01', 'LV01', 'LV01', 'LV02', 'LV02', 'LV02', 'LV03', 'LV04', 'LV05', 'LV06'];
const setting = (k, d) => { try { return game.settings.get(NS, k); } catch (_e) { return d; } };
const STEP = {E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1]};
const ROT = {E: 270, W: 90, N: 180, S: 0};
const LEFT_OF = {E: 'N', W: 'S', N: 'W', S: 'E'};
const RIGHT_OF = {E: 'S', W: 'N', N: 'E', S: 'W'};

export const trafficTokens = scene => scene.tokens.filter(t => t.getFlag(NS, 'traffic'));
const isCar = t => t.actor?.type === 'vehicle';

export function registerTrafficSettings() {
  const reg = (k, o) => { try { game.settings.register(NS, k, {scope: 'world', config: true, ...o}); } catch (_e) {} };
  reg('streetLife', {name: 'Street Life: traffic and pedestrians', hint: 'Spawn moving traffic, parked cars, chained bikes and pedestrians on any London street map a player is on.', type: Boolean, default: true});
  reg('trafficCars', {name: 'Street Life: moving cars per map', type: Number, default: 6, range: {min: 0, max: 20, step: 1}});
  reg('parkedCars', {name: 'Street Life: parked cars per map', type: Number, default: 5, range: {min: 0, max: 20, step: 1}});
  reg('lockedBikes', {name: 'Street Life: chained bikes per map', type: Number, default: 4, range: {min: 0, max: 15, step: 1}});
  reg('pedestrians', {name: 'Street Life: pedestrians per map', type: Number, default: 6, range: {min: 0, max: 25, step: 1}});
  reg('trafficTick', {name: 'Street Life: seconds between traffic moves', hint: 'Each move is animated over this gap, so traffic flows at any setting; raise it if your server struggles.', type: Number, default: 1, range: {min: 1, max: 5, step: 1}});
  reg('trafficSpeed', {name: 'Street Life: traffic speed (squares a second)', hint: 'How fast moving traffic drives. Police on a chase go a little faster; buses and vans a little slower.', type: Number, default: 2.5, range: {min: 1, max: 6, step: 0.5}});
}
const tickSeconds = () => Math.max(1, Math.min(5, Number(setting('trafficTick', 1)) || 1));
const SLOW = new Set(['LV21', 'LV22', 'LV24', 'LV26', 'LV27', 'LV28']);   // vans, buses, the ice-cream van, a fire pump

/* ------------------------------------------------------------------ trips along the roads */
/** A route flag for a trip: the left-hand lane as whole-pixel points. */
const laneOf = trip => trip && TC.lanePath(trip.pts, trip.widths);
/** The way a token faces (rotation 0 is south). */
export const headingOf = t => { const a = (Number(t.rotation) || 0) * Math.PI / 180; return [-Math.sin(a), Math.cos(a)]; };
/** Spawn a car on a trip across the map: coming in at an edge, or (`midway`) already part-way along. */
async function spawnMover(scene, local, r, {midway = false, catalogId = null, flags = {}} = {}) {
  const g = scene.grid?.size || 100, others = scene.tokens.filter(t => isCar(t));
  for (let attempt = 0; attempt < 6; attempt++) {
    const route = laneOf(TC.randomTrip(local, r)); if (!route || route.length < 2) continue;
    const total = TC.pathLength(route), id = catalogId ?? pick(TRAFFIC_POOL, r), actor = await ensureVehicleActor(id);
    const half = Math.max(Number(actor.prototypeToken?.width) || 2, Number(actor.prototypeToken?.height) || 3) * g / 2;
    const s = midway ? total * (0.1 + r() * 0.65) : Math.min(total / 2, half * 0.6);
    const p = TC.pointAt(route, s);
    if (others.some(o => Math.hypot(...tokenCentre(o).map((v, i) => v - [p.x, p.y][i])) < half * 2.2)) continue;   // somebody is already there
    const t=await placeToken(scene, actor, p.x, p.y, {rotation: TC.rotationOf(p.dx, p.dy), flags: {keeper: pick(KEEPERS, r), ...flags,
      traffic: {kind: 'moving', route, s: Math.round(s), pace: Math.round((0.85 + r() * 0.3) * 100) / 100, ...(flags.traffic || {})}}});
    if(t)await ensureAmbientCrew(t);
    return t;
  }
  return null;
}
/** A fresh trip for a car that has none (an older car, a job's target, a patrol): from where it is, the way it faces. */
export function tripForToken(local, t, r = Math.random, {goal = null, anyWay = false} = {}) {
  return laneOf(TC.tripFrom(local, tokenCentre(t), {heading: anyWay ? null : headingOf(t), goal, r}));
}

/* ------------------------------------------------------------------ spawning */
async function vehicleAt(scene, catalogId, zone, r, flags) {
  const actor = await ensureVehicleActor(catalogId);
  const p = lanePoint(zone, r, null, scene);
  const t=await placeToken(scene, actor, p.x, p.y, {rotation: p.rotation, flags: {...flags, ...(flags.traffic ? {traffic: {...flags.traffic, dir: p.dir, speed: 1 + Math.floor(r() * 2), edgeId:p.edgeId, distance:p.distance, travelDir:p.travelDir}} : {})}});
  if(t?.getFlag(NS,'traffic')?.kind==='moving')await ensureAmbientCrew(t);
  return t;
}
/** A spot in a lane on this street map, optionally well away from a point. Shape matches lanePoint, plus `road`
 *  (the lane state traffic flags carry), so callers can drop a moving car straight in. */
export async function roadSpawn(scene, r = Math.random, {awayFrom = null, minDist = 0} = {}) {
  const roads = drivable(zonesOf(scene)).filter(z => z.kind === 'road'); if (!roads.length) return null;
  let p = null;
  for (let i = 0; i < 12; i++) {
    p = lanePoint(pick(roads, r), r, null, scene);
    if (!awayFrom || Math.hypot(p.x - awayFrom[0], p.y - awayFrom[1]) >= minDist) break;
  }
  return p && {...p, road: {dir: p.dir, edgeId: p.edgeId, distance: p.distance, travelDir: p.travelDir}};
}
const populations=new Set();
export async function populate(scene, {force = false, entering = false} = {}) {
  if(!scene || populations.has(scene.id))return 0; populations.add(scene.id);
  try{return await populateNow(scene,{force, entering});}finally{populations.delete(scene.id);}
}
async function populateNow(scene, {force = false, entering = false} = {}) {
  if (!isLeader() || !isStreetScene(scene)) return 0;
  if (!force && !setting('streetLife', true)) return 0;
  const r = rng(Date.now() ^ scene.id.length * 977);
  const zones = zonesOf(scene); const roads = drivable(zones).filter(z => z.kind === 'road'); const kerbs = kerbside(zones);
  if (!roads.length) return 0;
  // Older worlds may already have moving vehicles, populated before ambient crew existed.
  for(const t of scene.tokens.filter(t=>t.actor?.type==='vehicle'&&(t.getFlag(NS,'traffic')?.kind==='moving'||t.getFlag(NS,'police'))))await ensureAmbientCrew(t);
  const life = trafficTokens(scene);
  const count = kind => life.filter(t => t.getFlag(NS, 'traffic')?.kind === kind).length;
  let made = 0;
  const want = {moving: setting('trafficCars', 6), parked: setting('parkedCars', 5), bike: setting('lockedBikes', 4), ped: setting('pedestrians', 6)};
  const local = await drivingNetwork(scene).catch(() => null);
  for (let i = count('moving'); i < want.moving; i++) {
    if (local) { if (await spawnMover(scene, local, r, {midway: !entering})) made++; continue; }
    await vehicleAt(scene, pick(TRAFFIC_POOL, r), pick(roads, r), r, {traffic: {kind: 'moving'}, keeper: pick(KEEPERS, r)}); made++;
  }
  for (let i = count('parked'); i < want.parked; i++) {
    const z = pick(roads, r), p = lanePoint(z, r, null, scene, true);
    // parked at the kerb: pushed to the outside edge of the lane
    const kx=p.x,ky=p.y;
    const id = pick(PARKED_POOL, r); const actor = await ensureVehicleActor(id);
    await placeToken(scene, actor, kx, ky, {rotation: p.rotation, flags: {locked: true, parked: true, traffic: {kind: 'parked'}, keeper: pick(KEEPERS, r)}}); made++;
  }
  for (let i = count('bike'); i < want.bike && kerbs.length; i++) {
    const z = pick(kerbs, r); const [px, py] = pointIn(z, r, 90); const actor = await ensureVehicleActor(pick(BIKE_POOL, r));
    await placeToken(scene, actor, px, py, {rotation: r() < .5 ? 0 : 180, flags: {locked: true, parked: true, lock: r() < .15 ? 'hard' : null, traffic: {kind: 'bike'}}}); made++;
  }
  const {peds} = await loadCatalogs();
  for (let i = count('ped'); i < want.ped && kerbs.length; i++) {
    const z = pick(kerbs, r); const [px, py] = pointIn(z, r, 60); const actor = await ensurePersonActor(pick(peds, r).key);
    await placeToken(scene, actor, px, py, {rotation: Math.floor(r() * 4) * 90, flags: {traffic: {kind: 'ped', zone: z.id}}}); made++;
  }
  return made;
}
const KEEPERS = ['A. Okafor, Clapton', 'J. Smith, Dalston', 'Hackney Car Club', 'M. Begum, Bethnal Green', 'Lease Co. (fleet)', 'R. O\'Neill, Homerton', 'S. Patel, Stoke Newington', 'Shoreditch Media Ltd', 'P. Nowak, Leyton', 'T. Adeyemi, Bow'];
export async function clearStreetLife(scene) {
  const ids = trafficTokens(scene).filter(t => isBackgroundTraffic(t) && !t.getFlag(NS, 'stolen') && !t.getFlag(NS,'jobTarget') && !t.getFlag(NS,'orderFor') && !t.getFlag(NS,'fare') && !t.getFlag(NS,'patient')).map(t => t.id);
  if (ids.length) await scene.deleteEmbeddedDocuments('Token', ids, {smokeDespawn: true});
  return ids.length;
}

/* ------------------------------------------------------------------ moving */
function blocked(scene, mover, nx, ny, g) {
  const self = mover.id, me = mover;
  for (const t of scene.tokens) {
    if (t.id === self || t.getFlag(NS, 'vehicleSeat')) continue;
    const [cx, cy] = tokenCentre(t); const rad = isCar(t) ? Math.max(t.width, t.height) * g * .55 : g * .6;
    if (Math.hypot(cx - nx, cy - ny) < rad + Math.max(me.width, me.height) * g * .45) return t;
  }
  return null;
}
/** One step for one moving car: along its lane; at a junction maybe turn; off the road → despawn. */
export function planStep(t, zones, g, r) {
  const f = t.getFlag(NS, 'traffic') || {};
  const net=networkOf(t.parent);
  if(net.edges.length)return advanceRoad(net,tokenCentre(t),f,Math.max(60,(f.speed||1)*g),r);
  let dir = f.dir || 'E';
  const [cx, cy] = tokenCentre(t);
  const here = zoneAtPoint(zones, cx, cy);
  if (here?.kind === 'junction' && f.lastJunction !== here.id && r() < .35) {
    const turn = r() < .5 ? LEFT_OF[dir] : RIGHT_OF[dir];
    const [x, y, w, h] = here.rect;
    // swing into the left-hand lane of the new road
    const nx = turn === 'N' ? x + w * .3 : turn === 'S' ? x + w * .7 : cx, ny = turn === 'E' ? y + h * .3 : turn === 'W' ? y + h * .7 : cy;
    return {dir: turn, x: nx, y: ny, lastJunction: here.id};
  }
  const step = (f.speed || 1) * g * 1.5 + g;
  const [dx, dy] = STEP[dir];
  const nx = cx + dx * step, ny = cy + dy * step;
  const next = zoneAtPoint(zones, nx, ny);
  if (!next || !['road', 'junction'].includes(next.kind)) return {despawn: true};
  return {dir, x: nx, y: ny, lastJunction: here?.kind === 'junction' ? here.id : f.lastJunction};
}
/** What a moving car has to stop for: other vehicles in its lane, people on foot in the road. */
export function obstaclesOf(scene) {
  const g = scene.grid?.size || 100, out = [];
  for (const t of scene.tokens) {
    if (t.getFlag(NS, 'vehicleSeat') || t.hidden) continue;                     // riders move with their vehicle
    const [x, y] = tokenCentre(t), f = t.getFlag(NS, 'traffic');
    const half = Math.max(Number(t.width) || 1, Number(t.height) || 1) * g / 2;
    if (isCar(t)) { const parked = f?.kind === 'parked' || f?.kind === 'bike' || Boolean(t.getFlag(NS, 'parked')); out.push({id: t.id, x, y, half, reach: parked ? 26 : 34, traffic: f?.kind === 'moving', parked, rotation: Number(t.rotation) || 0}); }
    else if (t.actor?.type === 'character') out.push({id: t.id, x, y, half: g / 2, reach: 62, person: true});
    else out.push({id: t.id, x, y, half: g / 2, reach: 30, person: true});
  }
  return out;
}
/**
 * One move for one car along its trip: as far as its speed allows in `seconds`, no further than the next sharp corner,
 * and short of anything in its lane. After a few blocked moves it noses past other traffic (never past people).
 * Returns {route?, s, x, y, rotation, wait} or {exit: true} when it has left the map, or {wait} when it can't move.
 */
export function driveStep(t, route, s, {seconds = 1, g = 100, speed = 2.5, obstacles = []} = {}) {
  const total = TC.pathLength(route);
  if (s >= total - 2) return {exit: true};
  const f = t.getFlag(NS, 'traffic') || {}, front = Math.max(Number(t.width) || 2, Number(t.height) || 3) * g / 2;
  const v = speed * g * (Number(f.pace) || 1) * (f.speed >= 3 ? 1.6 : 1) * (SLOW.has(t.actor?.getFlag?.(NS, 'catalogId')) ? 0.8 : 1);
  const step = TC.stepAlong(route, s, v * seconds);
  let go = step.s - s;
  const others = obstacles.filter(o => o.id !== t.id), wait = Number(f.wait || 0), mine = Number(t.rotation) || 0;
  // held up a while: nose past traffic crossing in front, but never into the back of a car going our way, nor past people
  const sameWay = o => Math.abs(((Number(o.rotation) || 0) - mine + 540) % 360 - 180) < 50;
  const clear = TC.clearAhead(route, s, go, wait >= 5 ? others.filter(o => o.person || !o.traffic || sameWay(o)) : others, {front, gap: g * 0.35});
  go = Math.min(go, clear);
  if (go < 2) return {wait: wait + 1};
  // room to be there: no moving vehicle (not oncoming, not parked) right ahead of or beside where we'd end up.
  // Catches a car merging in from a side road, which isn't in our lane until it's there.
  const room = g * 1.5, crowd = others.filter(o => !o.person && !o.parked);
  const free = q => { const rot = TC.rotationOf(q.dx, q.dy); return crowd.every(o => {
    if (Math.abs(((Number(o.rotation) || 0) - rot + 540) % 360 - 180) > 120) return true;        // oncoming: its own lane
    const vx = o.x - q.x, vy = o.y - q.y, along = vx * q.dx + vy * q.dy;
    if (along < -front * 0.5 || (wait >= 5 && along < front * 0.5)) return true;                   // behind us (or, held up, beside us)
    return Math.hypot(vx, vy) >= room; }); };
  let p = TC.pointAt(route, Math.min(total, s + go), {incoming: true});
  for (let tries = 0; !free(p) && tries < 3; tries++) { go /= 2; if (go < 2) return {wait: wait + 1}; p = TC.pointAt(route, Math.min(total, s + go), {incoming: true}); }
  if (!free(p)) return {wait: wait + 1};
  const ns = Math.min(total, s + go);
  return {s: ns, x: p.x, y: p.y, rotation: TC.rotationOf(p.dx, p.dy), wait: 0};
}
let ticking = false;
export async function tick() {
  if (game.paused || ticking || !isLeader() || !setting('streetLife', true) || slowGuard.resting('traffic')) return; ticking = true;
  const started = Date.now();
  try {
    const sceneIds = new Set(game.users.filter(u => u.active).map(u => u.viewedScene).filter(Boolean));
    const seconds = tickSeconds(), speed = Number(setting('trafficSpeed', 2.5)) || 2.5;
    for (const id of sceneIds) {
      const scene = game.scenes.get(id); if (!isStreetScene(scene)) continue;
      const chased = Boolean(chaseOf(scene));   // in a chase, cars move in the traffic phase; pedestrians keep walking
      const zones = zonesOf(scene), g = scene.grid.size, r = rng(Date.now() ^ id.length);
      const local = await drivingNetwork(scene).catch(() => null);
      const blues = scene.tokens.filter(t => lightsOn(t));
      const wanted = scene.tokens.some(t => t.actor?.type === 'character' && Number(t.actor.system.heat?.value) > 0);
      const obstacles = obstaclesOf(scene);
      const updates = [], gone = [];
      for (const t of chased ? [] : trafficTokens(scene)) {
        const f = t.getFlag(NS, 'traffic'); if (!f || f.kind !== 'moving' || !isCar(t)) continue;
        if (!isBackgroundTraffic(t)) continue; // stop only for an actual player or separately boarded rider
        if (t.getFlag(NS, 'stolen')) continue;                                         // nicked and left: it stays put
        if (t.getFlag(NS, 'fire') || t.actor?.system?.vehicle?.destroyed) continue;     // burning, or burnt out
        if (Number(t.getFlag(NS, 'stalledUntil') || 0) > Date.now()) continue;         // just been hit: hazards on
        if (t.getFlag(NS, 'police') && wanted) continue;                              // a patrol joins the hunt instead
        if (blues.some(b => b.id !== t.id && distanceSquares(b, t) < 8)) continue;    // pull over for the blues
        if (!local) {                                                                 // a map with no traced roads: the old lane-following
          const step = planStep(t, zones, g, r);
          if (!step || step.despawn) { if (!f.keep) gone.push(t.id); continue; }
          if (blocked(scene, t, step.x, step.y, g)) continue;
          updates.push({_id: t.id, x: Math.round(step.x - t.width * g / 2), y: Math.round(step.y - t.height * g / 2), rotation: step.rotation ?? ROT[step.dir],
                        [`flags.${NS}.traffic`]: {...f, dir: step.dir, lastJunction: step.lastJunction, edgeId: step.edgeId, distance: step.distance, travelDir: step.travelDir}});
          continue;
        }
        let route = Array.isArray(f.route) && f.route.length >= 2 ? f.route : null, s = Number(f.s) || 0, fresh = false;
        if (!route) { route = tripForToken(local, t, r); s = 0; fresh = true; if (!route) continue; }
        let step = driveStep(t, route, s, {seconds, g, speed, obstacles});
        if (step.exit) {
          if (!f.keep) { gone.push(t.id); continue; }
          route = tripForToken(local, t, r, {anyWay: true}); s = 0; fresh = true; if (!route) continue;   // a job's car turns back in
          step = driveStep(t, route, s, {seconds, g, speed, obstacles});
        }
        const up = {_id: t.id};
        if (fresh) up[`flags.${NS}.traffic.route`] = route;
        if (step.s == null) { if (fresh || step.wait <= 6) { up[`flags.${NS}.traffic.wait`] = step.wait; if (fresh) up[`flags.${NS}.traffic.s`] = 0; updates.push(up); } continue; }
        Object.assign(up, {x: Math.round(step.x - t.width * g / 2), y: Math.round(step.y - t.height * g / 2), rotation: Math.round(step.rotation),
          [`flags.${NS}.traffic.s`]: step.s, [`flags.${NS}.traffic.wait`]: 0});
        updates.push(up);
        const me = obstacles.find(o => o.id === t.id); if (me) { me.x = step.x; me.y = step.y; me.rotation = step.rotation; }   // later cars see where it went
      }
      for (const t of trafficTokens(scene).filter(t => t.getFlag(NS, 'traffic')?.kind === 'ped')) {
        const f = t.getFlag(NS, 'traffic');
        if (f.flee) { const from = scene.tokens.get(f.flee); const [cx, cy] = tokenCentre(t); const [fx, fy] = from ? tokenCentre(from) : [cx - 1, cy];
          const d = Math.hypot(cx - fx, cy - fy) || 1; updates.push({_id: t.id, x: Math.round(t.x + (cx - fx) / d * g * 2), y: Math.round(t.y + (cy - fy) / d * g * 2)});
          if (d > g * 25) gone.push(t.id); continue; }
        if (r() > .3) continue;
        const z = zones.find(x => x.id === f.zone); if (!z) continue;
        const [px, py] = pointIn(z, r, 60); const [cx, cy] = tokenCentre(t);
        const nx = cx + Math.sign(px - cx) * Math.min(Math.abs(px - cx), g), ny = cy + Math.sign(py - cy) * Math.min(Math.abs(py - cy), g);
        if (!blocked(scene, t, nx, ny, g)) updates.push({_id: t.id, x: Math.round(nx - g / 2), y: Math.round(ny - g / 2)});
      }
      // every move is animated over the gap until the next one, so the cars glide rather than hop
      // one write a tick: moves, riders and travel meters together
      if (updates.length) await scene.updateEmbeddedDocuments('Token', carryCrewInBatch(scene,withMeters(scene,updates,'traffic-roam')), {smokeTraffic: true, acVehicleCarry: true, animate: true,
        animation: {duration: Math.round(seconds * 1000), movementSpeed: speed}});
      if (gone.length) await scene.deleteEmbeddedDocuments('Token', gone, {smokeDespawn: true});
      if (gone.length) await populate(scene, {entering: true});
    }
  } catch (error) { console.warn('The Smoke | traffic tick', error); }
  finally { ticking = false; slowGuard.took('traffic', Date.now() - started, tickSeconds() * 1000); }
}

let timer = null;
export function startTraffic() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => tick(), tickSeconds() * 1000);
}
registerHandler('traffic.populate', async ({sceneId, userId}) => { if (!game.users.get(userId)?.isGM) throw new Error('GM only.'); return populate(game.scenes.get(sceneId), {force: true}); });
registerHandler('traffic.clear', async ({sceneId, userId}) => { if (!game.users.get(userId)?.isGM) throw new Error('GM only.'); const scene = game.scenes.get(sceneId); if (!scene) throw new Error('Open a map first.'); return clearStreetLife(scene); });
export function installTraffic() {
  // GM-dragged unowned cars become moving traffic only once they actually move; never seed a parked,
  // locked, stolen, player-owned or deliberately empty motor.  Markers/NPCs must remain unaffected.
  Hooks.on('updateToken',(doc, changes, options)=>{
    if(!isLeader()||options?.acVehicleCarry||options?.acTransit||!doc?.parent||doc.actor?.type!=='vehicle')return;
    if(!('x' in changes || 'y' in changes))return;
    if(doc.getFlag(NS,'parked')||doc.getFlag(NS,'traffic')?.kind==='parked'||doc.getFlag(NS,'locked')||doc.getFlag(NS,'stolen')||doc.actor.hasPlayerOwner)return;
    if(!isStreetScene(doc.parent))return;
    if((doc.getFlag(NS,'vehicleOccupants')||[]).length)return;
    void ensureAmbientCrew(doc).catch(error=>console.warn('The Smoke | manual moving motor crew',error));
  });
  Hooks.on('deleteToken',(doc, options)=>{
    if(!isLeader()||doc.actor?.type!=='vehicle'||options?.acTransit)return;
    if(doc.getFlag?.(NS,'ambientCrew'))void removeDespawnedCrew(doc.parent,doc).catch(error=>console.warn('The Smoke | ambient crew cleanup',error));
  });
  Hooks.on('canvasReady', () => { if (isLeader()) for (const id of new Set(game.users.filter(u => u.active).map(u => u.viewedScene))) populate(game.scenes.get(id)).catch(e => console.warn('The Smoke | populate', e)); });
  Hooks.on('smokeTransit', ({target}) => { if (isLeader()) populate(target).catch(() => null); });
  Hooks.on('updateUser', (user, changes) => { if (isLeader() && 'viewedScene' in changes) populate(game.scenes.get(changes.viewedScene)).catch(() => null); });
  Hooks.on('updateSetting', s => { if (s.key === `${NS}.trafficTick`) startTraffic(); });
  startTraffic();
}
