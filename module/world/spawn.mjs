// Spawning and moving things in the open world: world Actors from the bundled catalogues, tokens on zones,
// and relocation between maps (Wasted → A&E, Busted → custody).
import {NS} from '../config.mjs';
import {networkOf} from './roads.mjs';
import {randomLane} from '../rules/roads.mjs';
import {pick, pointIn, kerbside, drivable, zoneAtPoint, ukPlate} from '../rules/jobs-core.mjs';
import {findOrImportScene, retarget, loadAtlas} from '../map/map-transit.mjs';

let catalogs = null;
export async function loadCatalogs() {
  if (catalogs) return catalogs;
  const load = async f => { const r = await fetch(`systems/${NS}/data/${f}`); return r.ok ? r.json() : {}; };
  const [vehicles, npcs] = await Promise.all([load('london-vehicles.json'), load('london-npcs.json')]);
  catalogs = {vehicles: vehicles.vehicles || [], npcs: npcs.npcs || [], peds: npcs.peds || []};
  return catalogs;
}
async function streetFolder(name = 'The Smoke — Street Life') {
  let f = game.folders.find(x => x.type === 'Actor' && x.name === name);
  if (!f) f = await Folder.implementation.create({name, type: 'Actor', color: '#ff8a3d'});
  return f;
}
/** World Actor for a catalogue vehicle (made once, then reused for every token of it). */
export async function ensureVehicleActor(idOrName) {
  const {vehicles} = await loadCatalogs();
  const v = vehicles.find(x => x.id === idOrName || x.name === idOrName); if (!v) throw new Error(`No vehicle ${idOrName} in the catalogue.`);
  let actor = game.actors.find(a => a.getFlag(NS, 'catalogId') === v.id && a.getFlag(NS, 'streetLife'));
  if (actor) return actor;
  const folder = await streetFolder();
  actor = await Actor.implementation.create(vehicleActorData(v, {folder: folder.id, streetLife: true}));
  return actor;
}
export function vehicleActorData(v, {folder = null, streetLife = false} = {}) {
  return {name: v.name, type: 'vehicle', img: v.img, folder, system: v.system, ownership: {default: 0},
    prototypeToken: {name: v.name, displayName: 20, actorLink: false, width: v.token.width, height: v.token.height, lockRotation: false, rotation: 0,
      texture: {src: v.tokenImg, fit: 'contain'}, disposition: 0, sight: {enabled: false}},
    flags: {[NS]: {catalogId: v.id, vehicleAbilities: v.abilities || [], lightsImg: v.lightsImg || null, jobs: v.jobs || [], streetLife}}};
}
/** World Actor for a named NPC or a generic Londoner (key from data/london-npcs.json). */
export async function ensurePersonActor(key) {
  const {npcs, peds} = await loadCatalogs();
  const rec = npcs.find(n => n.key === key) ?? peds.find(p => p.key === key);
  if (!rec) throw new Error(`No NPC ${key} in the catalogue.`);
  let actor = game.actors.find(a => a.getFlag(NS, 'npcKey') === key && a.getFlag(NS, 'streetLife'));
  if (actor) return actor;
  const folder = await streetFolder();
  actor = await Actor.implementation.create(personActorData(rec, {folder: folder.id, streetLife: true}));
  return actor;
}
export function personActorData(rec, {folder = null, streetLife = false} = {}) {
  return {name: rec.name, type: 'npc', img: rec.img, folder, system: rec.system, ownership: {default: 0}, items: rec.items || [],
    prototypeToken: {name: rec.name, displayName: 20, actorLink: false, width: 1, height: 1, texture: {src: rec.img, fit: 'contain'}, disposition: rec.disposition ?? 0, sight: {enabled: false}},
    flags: {[NS]: {npcKey: rec.key, role: rec.system?.role, streetLife}}};
}
export async function randomPedKey(r = Math.random) { const {peds} = await loadCatalogs(); return pick(peds, r)?.key; }

/** Place a token of `actor` with its centre at (x, y). Returns the TokenDocument. */
export async function placeToken(scene, actor, x, y, {rotation = 0, flags = {}, name = null, hidden = false, options = {}} = {}) {
  const g = scene.grid?.size || 100;
  const proto = (await actor.getTokenDocument({}, {parent: scene})).toObject();
  const data = retarget(proto, scene);
  data.x = Math.round(x - (data.width || 1) * g / 2); data.y = Math.round(y - (data.height || 1) * g / 2);
  data.rotation = rotation; data.hidden = hidden; if (name) data.name = name;
  data.flags = foundry.utils.mergeObject(data.flags || {}, {[NS]: flags});
  if (actor.type === 'vehicle' && !actor.system.vehicle?.plateless && !flags.plate) foundry.utils.setProperty(data, `flags.${NS}.plate`, ukPlate());
  const [doc] = await scene.createEmbeddedDocuments('Token', [data], {smokeSpawn: true, ...options});
  return doc;
}

export const zonesOf = scene => scene?.getFlag?.(NS, 'zoneGraph')?.zones || [];
export const mapIdOf = scene => scene?.getFlag?.(NS, 'streetAtlas')?.id || scene?.getFlag?.(NS, 'place')?.id || null;
export const isStreetScene = scene => Boolean(scene?.getFlag?.(NS, 'streetAtlas')) && scene.getFlag(NS, 'streetAtlas').id !== 'LDN-OVERVIEW';
export function tokenCentre(t) { const g = t.parent?.grid?.size || 100; return [Number(t.x) + Number(t.width || 1) * g / 2, Number(t.y) + Number(t.height || 1) * g / 2]; }
export function tokenRect(t) { const g = t.parent?.grid?.size || 100; return [Number(t.x), Number(t.y), Number(t.width || 1) * g, Number(t.height || 1) * g]; }
export function distanceSquares(a, b) { const g = a.parent?.grid?.size || 100; const [ax, ay] = tokenCentre(a), [bx, by] = tokenCentre(b); return Math.hypot(ax - bx, ay - by) / g; }
export function zoneOfToken(t) { const [x, y] = tokenCentre(t); return zoneAtPoint(zonesOf(t.parent), x, y); }

/** Lane placement on a road zone: the UK drives on the left. Returns {x, y, rotation, dir}. */
export function lanePoint(zone, r = Math.random, dir = null, scene = null, kerb = false) {
  const net = scene && networkOf(scene);
  if(net?.edges.length){const p=randomLane(net,r,zone?.roads,{kerb});return {...p,dir:p.travelDir};}
  if(!zone)throw new Error('No road to spawn on.');
  const [x, y, w, h] = zone.rect;
  if (zone.o === 'h' || (!zone.o && w >= h)) {
    dir = dir || (r() < .5 ? 'E' : 'W');
    const laneY = dir === 'E' ? y + h * .3 : y + h * .7;   // eastbound keeps left = the north side
    return {x: x + 80 + r() * Math.max(1, w - 160), y: laneY, rotation: dir === 'E' ? 270 : 90, dir};
  }
  dir = dir || (r() < .5 ? 'N' : 'S');
  const laneX = dir === 'N' ? x + w * .3 : x + w * .7;     // northbound keeps left = the west side
  return {x: laneX, y: y + 80 + r() * Math.max(1, h - 160), rotation: dir === 'N' ? 180 : 0, dir};
}
export function spawnRoadZones(scene) { return drivable(zonesOf(scene)).filter(z => z.kind === 'road'); }
export function spawnKerbZones(scene) { return kerbside(zonesOf(scene)); }

/** Move a token to another map (and out of any vehicle), landing in the zone offering `service` there. */
export async function relocate(token, mapId, {service = null, zoneId = null} = {}) {
  const target = await findOrImportScene(mapId);
  const zones = zonesOf(target).length ? zonesOf(target) : ((await loadAtlas()).places.maps.concat((await loadAtlas()).atlas.maps).find(m => m.id === mapId)?.zones || []);
  let zone = zoneId ? zones.find(z => z.id === zoneId) : service ? zones.find(z => z.service === service) : null;
  if (zone && ['land', 'park'].includes(zone.kind)) {   // stand on the pavement outside, not inside the block
    const road = zones.find(z => (z.kind === 'road' || z.kind === 'junction') && (zone.adjacent || []).includes(z.id)); if (road) zone = road;
  }
  const [cx, cy] = zone ? pointIn(zone, Math.random, 50) : [target.width / 2, target.height / 2];
  const source = token.parent;
  const seat = token.getFlag(NS, 'vehicleSeat');
  if (seat) { try { const {exitVehicle} = await import('../vehicles/vehicle-boarding.mjs'); await exitVehicle(token); } catch (_e) {} }
  const fresh = source.tokens.get(token.id) ?? token;
  const data = retarget(fresh.toObject(), target); const g = target.grid?.size || 100;
  data.x = Math.round(cx - (data.width || 1) * g / 2); data.y = Math.round(cy - (data.height || 1) * g / 2); data.rotation = 0;
  foundry.utils.setProperty(data, `flags.${NS}.vehicleSeat`, null);
  const [created] = await target.createEmbeddedDocuments('Token', [data], {acTransit: true, acVehicleCarry: true});
  await source.deleteEmbeddedDocuments('Token', [fresh.id], {acTransit: true});
  return {scene: target, token: created};
}
