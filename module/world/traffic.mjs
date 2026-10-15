// Street Life: random traffic, parked cars, locked bikes and pedestrians on whichever London map players are on.
// Traffic drives on the left, follows the road zones, turns at junctions, stops behind whatever is in front and
// pulls over for blue lights. Parked cars and chained bikes are locked: nick them. Moving traffic can be carjacked.
import {NS} from '../config.mjs';
import {rng, pick, pointIn, drivable, zoneAtPoint, kerbside} from '../rules/jobs-core.mjs';
import {isLeader, registerHandler, request, notify} from './net.mjs';
import {loadCatalogs, ensureVehicleActor, ensurePersonActor, placeToken, zonesOf, isStreetScene, lanePoint, tokenCentre, distanceSquares} from './spawn.mjs';
import {lightsOn} from '../vehicles/vehicle-abilities.mjs';
import {roadsFor, drivableIndexes} from './roads.mjs';
import {lanePosition, trafficStep, roadLength, pointAt} from '../rules/roads-core.mjs';

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
  reg('trafficTick', {name: 'Street Life: seconds between traffic moves', type: Number, default: 3, range: {min: 1, max: 15, step: 1}});
}

/* ------------------------------------------------------------------ spawning */
async function vehicleAt(scene, catalogId, zone, r, flags) {
  const actor = await ensureVehicleActor(catalogId);
  const net = await roadsFor(scene);
  if (net) {   // on the traced road lines, keeping left
    const ri = pick(drivableIndexes(net.roads), r), road = net.roads[ri], L = roadLength(road);
    const s = 100 + r() * Math.max(1, L - 200), dir = r() < .5 ? 1 : -1, p = lanePosition(road, s, dir);
    if (p.x < 40 || p.y < 40 || p.x > scene.width - 40 || p.y > scene.height - 40) return null;
    return placeToken(scene, actor, p.x, p.y, {rotation: p.rotation, flags: {...flags, ...(flags.traffic ? {traffic: {...flags.traffic, ri, s, dir, speed: 1 + Math.floor(r() * 2)}} : {})}});
  }
  const p = lanePoint(zone, r);
  return placeToken(scene, actor, p.x, p.y, {rotation: p.rotation, flags: {...flags, ...(flags.traffic ? {traffic: {...flags.traffic, dir: p.dir, speed: 1 + Math.floor(r() * 2)}} : {})}});
}
/** A lane spot on the traced roads for a vehicle that should drive about this map: {x, y, rotation, road:{ri,s,dir}} or null. */
export async function roadSpawn(scene, r = Math.random, {awayFrom = null, minDist = 0} = {}) {
  const net = await roadsFor(scene); if (!net) return null;
  for (let tries = 0; tries < 16; tries++) {
    const ri = pick(drivableIndexes(net.roads), r), road = net.roads[ri], sAt = 100 + r() * Math.max(1, roadLength(road) - 200), dir = r() < .5 ? 1 : -1, p = lanePosition(road, sAt, dir);
    if (p.x < 80 || p.y < 80 || p.x > scene.width - 80 || p.y > scene.height - 80) continue;
    if (awayFrom && Math.hypot(p.x - awayFrom[0], p.y - awayFrom[1]) < minDist && tries < 12) continue;
    return {...p, road: {ri, s: sAt, dir}};
  }
  return null;
}
export async function populate(scene, {force = false} = {}) {
  if (!isLeader() || !isStreetScene(scene)) return 0;
  if (!force && !setting('streetLife', true)) return 0;
  const r = rng(Date.now() ^ scene.id.length * 977);
  const zones = zonesOf(scene); const roads = drivable(zones).filter(z => z.kind === 'road'); const kerbs = kerbside(zones);
  if (!roads.length) return 0;
  const life = trafficTokens(scene);
  const count = kind => life.filter(t => t.getFlag(NS, 'traffic')?.kind === kind).length;
  let made = 0;
  const want = {moving: setting('trafficCars', 6), parked: setting('parkedCars', 5), bike: setting('lockedBikes', 4), ped: setting('pedestrians', 6)};
  for (let i = count('moving'); i < want.moving; i++) { await vehicleAt(scene, pick(TRAFFIC_POOL, r), pick(roads, r), r, {traffic: {kind: 'moving'}, keeper: pick(KEEPERS, r)}); made++; }
  for (let i = count('parked'); i < want.parked; i++) {
    const net = await roadsFor(scene);
    if (net) {
      const ri = pick(drivableIndexes(net.roads), r), road = net.roads[ri], L = roadLength(road), sAt = 100 + r() * Math.max(1, L - 200), dir = r() < .5 ? 1 : -1;
      const kerb = lanePosition({...road, width: (Number(road.width) || 250) * 1.7}, sAt, dir);
      if (kerb.x > 60 && kerb.y > 60 && kerb.x < scene.width - 60 && kerb.y < scene.height - 60) {
        await placeToken(scene, await ensureVehicleActor(pick(PARKED_POOL, r)), kerb.x, kerb.y, {rotation: kerb.rotation, flags: {locked: true, parked: true, traffic: {kind: 'parked'}, keeper: pick(KEEPERS, r)}}); made++;
      }
      continue;
    }
    const z = pick(roads, r), p = lanePoint(z, r);
    // parked at the kerb: pushed to the outside edge of the lane
    const [x, y, w, h] = z.rect; const kx = p.dir === 'N' ? x + w * .12 : p.dir === 'S' ? x + w * .88 : p.x, ky = p.dir === 'E' ? y + h * .12 : p.dir === 'W' ? y + h * .88 : p.y;
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
  const ids = trafficTokens(scene).filter(t => !(t.getFlag(NS, 'vehicleOccupants') || []).length && !t.getFlag(NS, 'stolen')).map(t => t.id);
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
  const f = t.getFlag(NS, 'traffic') || {}; let dir = f.dir || 'E';
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
let ticking = false;
export async function tick() {
  if (ticking || !isLeader() || !setting('streetLife', true)) return; ticking = true;
  try {
    const sceneIds = new Set(game.users.filter(u => u.active).map(u => u.viewedScene).filter(Boolean));
    for (const id of sceneIds) {
      const scene = game.scenes.get(id); if (!isStreetScene(scene)) continue;
      const zones = zonesOf(scene), g = scene.grid.size, r = rng(Date.now() ^ id.length);
      const net = await roadsFor(scene);
      const blues = scene.tokens.filter(t => lightsOn(t));
      const updates = [], gone = [];
      for (const t of trafficTokens(scene)) {
        const f = t.getFlag(NS, 'traffic'); if (!f || f.kind !== 'moving' || !isCar(t)) continue;
        if ((t.getFlag(NS, 'vehicleOccupants') || []).length) continue;               // someone got in
        if (blues.some(b => b.id !== t.id && distanceSquares(b, t) < 8)) continue;    // pull over for the blues
        if (net && Number.isInteger(f.ri)) {
          const st = trafficStep(net.roads, net.cross, {ri: f.ri, s: f.s, dir: f.dir}, ((f.speed || 1) * 1.5 + 1) * g, {width: scene.width, height: scene.height, r, keep: Boolean(f.keep)});
          if (st.despawn) { gone.push(t.id); continue; }
          const p = lanePosition(net.roads[st.ri], st.s, st.dir);
          if (blocked(scene, t, p.x, p.y, g)) continue;
          updates.push({_id: t.id, x: Math.round(p.x - t.width * g / 2), y: Math.round(p.y - t.height * g / 2), rotation: p.rotation, [`flags.${NS}.traffic`]: {...f, ri: st.ri, s: st.s, dir: st.dir}});
          continue;
        }
        const step = planStep(t, zones, g, r);
        if (step.despawn) { gone.push(t.id); continue; }
        if (blocked(scene, t, step.x, step.y, g)) continue;                            // queue behind it
        updates.push({_id: t.id, x: Math.round(step.x - t.width * g / 2), y: Math.round(step.y - t.height * g / 2), rotation: ROT[step.dir],
                      [`flags.${NS}.traffic`]: {...f, dir: step.dir, lastJunction: step.lastJunction}});
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
      if (updates.length) await scene.updateEmbeddedDocuments('Token', updates, {smokeTraffic: true, animate: true});
      if (gone.length) await scene.deleteEmbeddedDocuments('Token', gone, {smokeDespawn: true});
      if (gone.length) await populate(scene);
    }
  } catch (error) { console.warn('The Smoke | traffic tick', error); }
  finally { ticking = false; }
}

let timer = null;
export function startTraffic() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => tick(), Math.max(1, Number(setting('trafficTick', 3))) * 1000);
}
registerHandler('traffic.populate', async ({sceneId, userId}) => { if (!game.users.get(userId)?.isGM) throw new Error('GM only.'); return populate(game.scenes.get(sceneId), {force: true}); });
registerHandler('traffic.clear', async ({sceneId, userId}) => { if (!game.users.get(userId)?.isGM) throw new Error('GM only.'); return clearStreetLife(game.scenes.get(sceneId)); });
export function installTraffic() {
  Hooks.on('canvasReady', () => { if (isLeader()) for (const id of new Set(game.users.filter(u => u.active).map(u => u.viewedScene))) populate(game.scenes.get(id)).catch(e => console.warn('The Smoke | populate', e)); });
  Hooks.on('smokeTransit', ({target}) => { if (isLeader()) populate(target).catch(() => null); });
  Hooks.on('updateUser', (user, changes) => { if (isLeader() && 'viewedScene' in changes) populate(game.scenes.get(changes.viewedScene)).catch(() => null); });
  Hooks.on('updateSetting', s => { if (s.key === `${NS}.trafficTick`) startTraffic(); });
  startTraffic();
}
