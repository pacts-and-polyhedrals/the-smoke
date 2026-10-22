// The Blower's sat nav: a live route on the London overview map, in the bottom-right corner of the screen, from where
// your character (or the motor you're riding) is to where you're going. It re-routes every time you move, crosses
// from map to map with you, follows a job from stage to stage (pick-up, then drop-off), and draws the same route on
// the street map you're looking at. Everything here is local to each player's screen; nothing is sent to anyone.
import {NS} from '../config.mjs';
import {esc} from '../world/net.mjs';
import {mapIdOf} from '../world/spawn.mjs';
import {loadAtlas} from './map-transit.mjs';
import * as C from './satnav-core.mjs';
import {ridingNicked, buyerFor} from '../world/theft.mjs';
import {missionData, missionState, needed} from '../world/missions.mjs';
import {atlasRoads} from '../world/roads.mjs';
import {missionPaintPosition} from '../graffiti/mission-placements.mjs';
import {QUALITY_LABEL} from '../graffiti/core.mjs';
import {propUnits, propDestination, propMapId} from '../world/mission-props.mjs';

const IMG = `systems/${NS}/assets/maps/satnav/london-satnav.webp`;
/** How much of the overview the screen shows at each zoom step (overview px across). */
export const ZOOMS = Object.freeze([240, 400, 650, 1050, 1700, 2800]);
/** Within this many px of the kerb (about 60 m) you have arrived. */
export const ARRIVE = 260;
const STATE = 'satnavState';
const nav = {actorId: null, target: null, zoom: 2, fit: false, northUp: true, compact: false, heading: null, last: null, route: null, steps: [], arrived: false, error: '', view: null};
let data = null, loading = null, el = null, gfx = null, queued = null, tween = null;

/* ------------------------------------------------------------------ data */
export async function satnavData() {
  if (data) return data;
  loading ??= (async () => {
    const {atlas, places, venues} = await loadAtlas();
    let overview = {maps: []};
    try { const r = await fetch(`systems/${NS}/data/london-overview.json`); if (r.ok) overview = await r.json(); } catch (_e) {}
    const {net} = await atlasRoads(), missions = await missionData().catch(() => ({missions: []}));
    // graffiti commission sites: which street map each paint surface is on (0.5.23: so the sat nav can find every one)
    let paint = {sites: []};
    try { const r = await fetch(`systems/${NS}/data/tagging-catalogue.json`); if (r.ok) paint = await r.json(); } catch (_e) {}
    data = {atlas, places, venues, venueById: new Map((venues?.maps || []).map(v => [v.id, v])), overview, net, missions: missions.missions || [], k: C.overviewScale(atlas, overview), destinations: C.satnavDestinations(atlas, places, venues),
      paintSites: new Map((paint.sites || []).map(x => [x.id, x]))};
    return data;
  })();
  return loading;
}
export const satnavState = () => ({...nav, route: nav.route, steps: nav.steps});

/* ------------------------------------------------------------------ settings */
export function registerSatnavSettings() {
  game.settings.register(NS, 'satnavUnits', {name: 'Sat nav distances', hint: 'Miles and yards, like a UK sat nav, or kilometres and metres.', scope: 'client', config: true, type: String,
    choices: {imperial: 'Miles and yards', metric: 'Kilometres and metres'}, default: 'imperial', onChange: () => queueRefresh()});
  game.settings.register(NS, 'satnavMapRoute', {name: 'Sat nav: draw the route on the map', hint: 'Also draw your sat nav route on the street map (and the London overview) you are looking at. Only you see it.', scope: 'client', config: true, type: Boolean, default: true, onChange: () => queueRefresh()});
  game.settings.register(NS, STATE, {scope: 'client', config: false, type: Object, default: {}});
}
const setting = (k, d) => { try { return game.settings.get(NS, k) ?? d; } catch (_e) { return d; } };
function save() {
  const {actorId, target, zoom, fit, northUp, compact} = nav;
  try { game.settings.set(NS, STATE, target ? {actorId, target, zoom, fit, northUp, compact} : {}); } catch (_e) {}
}

/* ------------------------------------------------------------------ where things are */
const centreOf = (doc, pos = null) => { const g = doc.parent?.grid?.size || 100; return [Number(pos?.x ?? doc.x) + Number(doc.width || 1) * g / 2, Number(pos?.y ?? doc.y) + Number(doc.height || 1) * g / 2]; };
/** The street door of an interior (a character inside The Arches is, for the sat nav, at its door on Morning Lane). A venue
 * behind an approach (Clissold House in Clissold Park) is at the approach's street door. */
export function doorOf(d, placeId) {
  const seen = new Set(); let id = placeId;
  while (id && !seen.has(id)) {
    seen.add(id);
    for (const m of d.atlas.maps) { const l = (m.links || []).find(x => x.kind === 'door' && x.to === id); if (l) return C.toGlobal(d.atlas, m.id, l.rect[0] + l.rect[2] / 2, l.rect[1] + l.rect[3] / 2); }
    id = d.venueById?.get(id)?.approach ?? null;
  }
  return null;
}
/** Global position of a token: on a street map, on the overview, or inside a place (its door). */
export function globalOf(d, doc, pos = null) {
  const scene = doc?.parent; if (!scene) return null; const id = mapIdOf(scene), [x, y] = centreOf(doc, pos);
  if (id === C.OVERVIEW_ID) return [x / d.k, y / d.k];
  if (C.tileOf(d.atlas, id)) return C.toGlobal(d.atlas, id, x, y);
  return id ? doorOf(d, id) : null;
}
/** Your character's token (the one on the scene you're looking at first), and the vehicle you're seated in. */
export function trackedTokens(actor) {
  if (!actor) return {token: null, vehicle: null};
  const scenes = [canvas?.scene, ...(game.scenes?.contents ?? [])].filter((s, i, a) => s && a.indexOf(s) === i);
  for (const s of scenes) {
    const token = s.tokens?.find?.(t => t.actorId === actor.id && (t.actorLink || t.actor?.id === actor.id));
    if (!token) continue;
    const seat = token.getFlag?.(NS, 'vehicleSeat'), vehicle = seat ? s.tokens.get(seat.vehicleTokenId) ?? null : null;
    return {token, vehicle};
  }
  return {token: null, vehicle: null};
}
const sceneTokenById = id => { for (const s of game.scenes ?? []) { const t = s.tokens?.get?.(id); if (t) return t; } return null; };
const zoneTarget = (d, mapId, zoneId, label) => {
  const m = C.tileOf(d.atlas, mapId), z = m?.zones?.find(q => q.id === zoneId); if (!z) return null;
  return {mapId, x: z.rect[0] + z.rect[2] / 2, y: z.rect[1] + z.rect[3] / 2, goal: C.kerbFor(m, z), label: label ?? z.name, sub: m.name, zoneId};
};
/* ------------------------------------------------------------------ the right motor */
const EMERGENCY = ['police', 'ambulance', 'fire', 'bus'];
/** The nicked vehicle a character is driving now (on whichever map they're on), with who buys it and why not. */
export function ridingNow(actor) {
  if (!actor) return null;
  const {token, vehicle} = trackedTokens(actor);
  try { return ridingNicked(actor, token?.parent) ?? null; }
  catch (_e) {   // a motor with odd stats: still tell what it is and who'd buy it
    const pilot = (vehicle?.getFlag?.(NS, 'vehicleOccupants') || []).find(o => o.seatId === 'pilot');
    return vehicle?.getFlag?.(NS, 'stolen') && pilot?.tokenId === token?.id ? {vt: vehicle, service: buyerFor(vehicle.actor), why: ''} : null;
  }
}
/** Does what they're driving do for this sale? `ids` is the catalogue list the buyer wants (null: any of its kind). */
export function rideFits(riding, {service = 'gang', ids = null} = {}) {
  if (!riding || riding.why || riding.service !== service) return false;
  return !ids?.length || ids.includes(riding.vt?.actor?.getFlag?.(NS, 'catalogId'));
}
const destinationOf = (d, test) => d.destinations.find(test) ?? null;
const asTarget = (x, extra = {}) => x && {mapId: x.mapId, x: x.x, y: x.y, goal: x.goal, label: x.label, ...extra};
/** Who buys it: Pat at The Arches (bikes), Bow Breakers (cars). */
export function fenceTarget(d, service, riding = null) {
  if (service === 'gang') return asTarget(destinationOf(d, x => x.placeId === 'LDP-ARCHES'), {sub: `${riding?.vt?.name ?? 'The bike'} for Pat`, fence: 'gang'});
  for (const m of d.atlas.maps) { const z = (m.zones || []).find(q => q.service === 'chop'); if (z) return {...zoneTarget(d, m.id, z.id), sub: `${riding?.vt?.name ?? 'The motor'} for the crusher`, fence: 'chop'}; }
  return null;
}
/** The nearest service of a kind (a respray …) to where you are. */
export function serviceTarget(d, service, here = null) {
  let best = null;
  for (const m of d.atlas.maps) for (const z of (m.zones || []).filter(q => q.service === service)) {
    const t = zoneTarget(d, m.id, z.id); if (!t) continue;
    const at = C.toGlobal(d.atlas, m.id, ...t.goal), dd = here ? Math.hypot(at[0] - here[0], at[1] - here[1]) : 0;
    if (!best || dd < best.dd) best = {t, dd};
  }
  return best?.t ?? null;
}
/**
 * The nearest parked or chained vehicle worth nicking for a sale: `ids` (the models wanted), else any the buyer takes
 * (`service`); `orderFor` keeps to the bikes Kez tipped off for one order. A moving target: it follows the token.
 */
export function nickableTarget(d, here, {ids = null, service = null, orderFor = null, label = 'Nick'} = {}) {
  let best = null;
  for (const s of game.scenes ?? []) {
    if (!C.tileOf(d.atlas, mapIdOf(s))) continue;
    for (const t of s.tokens ?? []) {
      if (t.actor?.type !== 'vehicle' || t.getFlag?.(NS, 'stolen') || (t.getFlag?.(NS, 'vehicleOccupants') || []).length) continue;
      if (!(t.getFlag(NS, 'locked') || t.getFlag(NS, 'parked') || t.getFlag(NS, 'orderFor'))) continue;
      if (orderFor && t.getFlag(NS, 'orderFor') !== orderFor) continue;
      if (ids?.length && !ids.includes(t.actor.getFlag?.(NS, 'catalogId'))) continue;
      if (service && buyerFor(t.actor) !== service) continue;
      if ((t.actor.system?.vehicle?.jobs || []).some(j => EMERGENCY.includes(j)) || !Number(t.actor.system?.vehicle?.value ?? 1)) continue;
      const at = globalOf(d, t); if (!at) continue;
      const dd = here ? Math.hypot(at[0] - here[0], at[1] - here[1]) : 0;
      if (!best || dd < best.dd) best = {t, dd};
    }
  }
  return best && {tokenId: best.t.id, label: `${label}: ${best.t.name}`, sub: 'Parked up'};
}

/** Where a job wants you now: the pick-up, the drop-off, the next bus stop, the patient, the car you're chasing … */
export function callTarget(d, call, here = null, actor = null) {
  if (!call) return null; const st = call.stage;
  if (call.dest && ['hospital', 'custody'].includes(st)) return zoneTarget(d, call.dest.mapId, call.dest.zoneId, call.dest.label);
  if (st === 'dropoff' && call.data?.dest) return zoneTarget(d, call.data.dest.mapId, call.data.dest.zoneId, call.data.dest.label);
  if (call.type === 'bus') { const s = call.data?.stops?.[call.index ?? 0]; if (s) return {...zoneTarget(d, s.mapId, s.zoneId, `Stop: ${s.label}`), stop: call.index ?? 0}; }
  if (call.type === 'crew') {
    // back to Pat's only on a nicked bike that's on her order; anything else, keep looking
    const order = call.data?.order || {}, ids = order.ids ?? null, riding = ridingNow(actor);
    const progress = `Pat's order: ${Number(call.data?.delivered || 0)}/${Number(order.want || 1)}`;
    if (rideFits(riding, {service: 'gang', ids})) return fenceTarget(d, 'gang', riding);
    const sub = riding ? `${riding.vt?.name ?? 'That'} isn't on Pat's order · ${progress}` : progress;
    const g = t => t.tokenId ? globalOf(d, sceneTokenById(t.tokenId)) : C.toGlobal(d.atlas, t.mapId, ...t.goal), far = t => { const p = g(t); return p && here ? Math.hypot(p[0] - here[0], p[1] - here[1]) : 0; };
    const tipped = nickableTarget(d, here, {orderFor: call.id, ids, label: 'Tip-off'});
    const spots = (call.data?.spots || []).filter(s => !s.seeded).map(s => zoneTarget(d, s.mapId, s.zoneId, `Tip-off: ${s.label}`)).filter(Boolean);
    const choice = [tipped, ...spots].filter(Boolean).sort((a, b) => far(a) - far(b))[0]
      ?? nickableTarget(d, here, {ids, service: 'gang', label: 'Nick'})
      ?? (call.data?.spots || []).map(s => zoneTarget(d, s.mapId, s.zoneId, `Tip-off: ${s.label}`)).filter(Boolean).sort((a, b) => far(a) - far(b))[0];
    return choice ? {...choice, sub} : null;
  }
  if (call.type === 'police' && ['stop', 'pursuit', 'arrest'].includes(st)) {
    const t = sceneTokenById(call.data?.stolenTokenId ?? call.data?.suspectTokenId);
    if (t) return {tokenId: t.id, label: call.data?.plate ? `${call.data.carName ?? 'Target'} · ${call.data.plate}` : 'The suspect', sub: 'Moving target'};
  }
  if (call.ping) {
    const scene = game.scenes?.get?.(call.ping.sceneId), mapId = mapIdOf(scene), m = C.tileOf(d.atlas, mapId);
    // name the spot after the block the job named (the fare's corner, the patient's street), else the job itself
    const zone = (m?.zones || []).find(z => z.id === call.data?.zoneId) ?? (m?.zones || []).find(z => z.rect && call.ping.x >= z.rect[0] && call.ping.x < z.rect[0] + z.rect[2] && call.ping.y >= z.rect[1] && call.ping.y < z.rect[1] + z.rect[3]);
    if (mapId) return {mapId, x: call.ping.x, y: call.ping.y, goal: [call.ping.x, call.ping.y], label: zone?.name ?? call.title, sub: call.title ?? scene?.name};
  }
  if (call.data?.zoneId) { const mapId = call.data.mapId ?? mapIdOf(game.scenes?.get?.(call.data.sceneId)); const t = mapId && zoneTarget(d, mapId, call.data.zoneId); if (t) return t; }
  if (call.dest) return zoneTarget(d, call.dest.mapId, call.dest.zoneId, call.dest.label);
  return null;
}
/** The target's pin and kerb as global positions, following a job or a moving token. */
function resolveTarget(d, here) {
  const t = nav.target; if (!t) return null;
  let cur = t;
  if (t.callId) {
    const call = game.smoke?.jobs?.state?.().calls?.[t.callId];
    if (!call || call.status !== 'active') return {ended: true, label: t.label};
    cur = callTarget(d, call, here, game.actors?.get?.(nav.actorId)); if (!cur) return {missing: true, label: call.title};
    cur = {...cur, callId: t.callId, title: call.title, stage: call.stage};
  }
  if (t.missionId) {
    const m = d.missions.find(x => x.id === t.missionId), st = missionState()[t.missionId];
    if (!m || ['done', 'failed'].includes(st?.status)) return {ended: true, label: t.label, passed: st?.status === 'done'};
    cur = missionTarget(d, m, st, null, {actor: game.actors?.get?.(nav.actorId), here}); if (!cur) return {missing: true, label: m.title};
    cur = {...cur, missionId: m.id};
  }
  if (cur.tokenId) {
    const tok = sceneTokenById(cur.tokenId), at = tok && globalOf(d, tok);
    return at ? {...cur, pin: at, goal: at} : {missing: true, label: cur.label};
  }
  // targets stored on an interior go to its street door
  const pin = C.toGlobal(d.atlas, cur.mapId, cur.x, cur.y) ?? doorOf(d, cur.mapId), goal = (cur.goal && C.toGlobal(d.atlas, cur.mapId, ...cur.goal)) ?? pin;
  return pin ? {...cur, pin, goal} : {missing: true, label: cur.label};
}

/**
 * A graffiti commission's paint site: the surface itself on its street map (the marker or parked bus, wherever the GM
 * has moved it), else the kerb where the game will put it. 0.5.23: before, a site with no venue or street door to aim
 * at (Bow Flyover, the breakers' yard, Bethnal Green Road …) could not be found, and the sat nav fell back to the first.
 */
function paintSiteTarget(d, m, s, sub) {
  const site = d.paintSites?.get?.(s.code); if (!site) return null;
  for (const scene of game.scenes ?? []) {
    if (mapIdOf(scene) !== site.sceneMapId) continue;
    const tok = scene.tokens?.find?.(t => !t.hidden && t.getFlag?.(NS, 'tagSpot')?.siteId === s.code);
    if (tok) { const [x, y] = centreOf(tok); return {mapId: site.sceneMapId, x, y, goal: [x, y], label: s.name, sub, stop: s.code, surface: true}; }
  }
  const map = C.tileOf(d.atlas, site.sceneMapId); if (!map) return null;
  const p = missionPaintPosition(map, site, s, d.venues?.maps, d.places?.maps, [], 100);
  return Number.isFinite(p?.x) && Number.isFinite(p?.y) ? {mapId: site.sceneMapId, x: p.x, y: p.y, goal: [p.x, p.y], label: s.name, sub, stop: s.code} : null;
}
/** A mission stop as a target: a graffiti surface, a mapped venue's street entrance, a zone on a street map, or an interior's door. */
function stopTarget(d, m, s) {
  const sub = `${m.code ?? `Mission ${m.n}`} · ${m.title}`;
  if (m.tagging) { const t = paintSiteTarget(d, m, s, sub); if (t) return t; }
  if (s.placeId) {   // a mapped venue: its street entrance (or its approach's)
    const door = doorOf(d, s.placeId);
    if (door) { const loc = C.toLocal(d.atlas, ...door); return {mapId: loc.mapId, x: loc.x, y: loc.y, goal: [loc.x, loc.y], label: s.name, sub, stop: s.code, placeId: s.placeId}; }
  }
  if (s.zoneId && C.tileOf(d.atlas, s.mapId)) { const z = zoneTarget(d, s.mapId, s.zoneId, s.name); if (z) return {...z, sub, stop: s.code}; }
  const door = doorOf(d, s.mapId); if (!door) return null;
  const loc = C.toLocal(d.atlas, ...door);
  return {mapId: loc.mapId, x: loc.x, y: loc.y, goal: [loc.x, loc.y], label: s.name, sub, stop: s.code};
}
/** "Get to Broadway Market": the place the objective names (on its map if it can), else the inside's door or the district's middle. */
function placeForMap(d, mapId, text = '') {
  const said = String(text).toLowerCase(), named = d.destinations.filter(x => x.label && said.includes(x.label.toLowerCase().replace(/ ·.*$/, '')));
  const pick = named.find(x => x.mapId === mapId) ?? named.sort((a, b) => b.label.length - a.label.length)[0];
  if (pick) return asTarget(pick);
  if (!C.tileOf(d.atlas, mapId)) { const door = doorOf(d, mapId); if (!door) return null; const loc = C.toLocal(d.atlas, ...door); const p = destinationOf(d, x => x.placeId === mapId); return {mapId: loc.mapId, x: loc.x, y: loc.y, goal: [loc.x, loc.y], label: p?.label ?? 'Inside'}; }
  return asTarget(destinationOf(d, x => x.group === 'Districts' && x.mapId === mapId));
}
/** A block (zone) on a street map, venue or interior, by its code or id: its middle; else the map itself. */
function zonePlace(d, mapId, zoneCode, label, sub) {
  const maps = [...(d.atlas?.maps || []), ...(d.places?.maps || []), ...(d.venues?.maps || [])], map = maps.find(x => x.id === mapId);
  const z = zoneCode ? (map?.zones || []).find(q => q.code === zoneCode || q.id === zoneCode) : null;
  if (z?.rect) { const x = z.rect[0] + z.rect[2] / 2, y = z.rect[1] + z.rect[3] / 2; return {mapId, x, y, goal: [x, y], label, sub}; }
  if (C.tileOf(d.atlas, mapId)) { const t = placeForMap(d, mapId, label); return t ? {...t, label, sub} : null; }
  return doorOf(d, mapId) ? {mapId, x: 0, y: 0, goal: [0, 0], label, sub} : null;   // an interior: the sat nav takes you to its door
}
/**
 * Mission cargo: the parcel itself if it is lying on a map (where the job put it, or where someone dropped it), else
 * where it is to be collected; once one of the crew is carrying it, the handover. 0.5.23: cargo objectives had no
 * place at all, so the sat nav skipped them and fell back to the mission's first place (or Pat's, for the opening).
 */
function cargoTarget(d, m, st, o, sub) {
  const units = propUnits(m).filter(u => u.prop.id === o.auto.propId); if (!units.length) return null;
  const rec = u => st?.parcels?.[u.serial] ?? {status: 'world'};
  const lying = u => {
    const r = rec(u); if (r.status !== 'world' || !r.sceneId) return null;
    const scene = game.scenes?.get?.(r.sceneId), tok = scene?.tokens?.get?.(r.tokenId), mapId = mapIdOf(scene); if (!tok || !mapId) return null;
    const [x, y] = centreOf(tok); return {mapId, x, y, goal: [x, y], sub};
  };
  const at = (point, zone, label) => {
    const dest = propDestination(m, point); if (!dest) return null;
    if (typeof point === 'number') { const t = stopTarget(d, m, dest); return t ? {...t, label} : null; }
    return zonePlace(d, propMapId(dest), zone, label, sub);
  };
  if (o.auto.on === 'cargoCollected') {
    const waiting = units.filter(u => !['held', 'delivered'].includes(rec(u).status));
    for (const u of waiting) { const t = lying(u); if (t) return {...t, label: `Collect: ${u.prop.name}`}; }
    return waiting.length ? at(waiting[0].prop.pickup, waiting[0].prop.pickupZone, `Collect: ${waiting[0].prop.name}`) : null;
  }
  const left = units.filter(u => rec(u).status !== 'delivered'); if (!left.length) return null;
  const carried = left.find(u => rec(u).status === 'held');
  if (carried) return at(carried.prop.delivery, carried.prop.deliveryZone, `Deliver: ${carried.prop.name}`);
  for (const u of left) { const t = lying(u); if (t) return {...t, label: `Pick up: ${u.prop.name}`}; }
  return at(left[0].prop.delivery, left[0].prop.deliveryZone, `Deliver: ${left[0].prop.name}`);
}
/**
 * Where a mission sends the crew next. In order through the objectives still to do: one tied to a place goes there;
 * one that ticks on reaching a map goes to the place it names; cargo goes to the parcel, then to its handover; a sale
 * goes to the buyer only when you're driving a nicked motor that fits (else to the nearest one worth nicking); a
 * respray only once you're in a nicked motor. Objectives with no place (the GM ticks them) are passed over; if nothing
 * still to do has a place, the sat nav stays with the last place the job took you to (0.5.23: it went back to the
 * first). `actor` and `here` say what you're driving and where.
 */
export function missionTarget(d, m, st = null, stop = null, {actor = null, here = null} = {}) {
  if (stop) return stopTarget(d, m, stop);
  const sub = `${m.code ?? `Mission ${m.n}`} · ${m.title}`, riding = actor ? ridingNow(actor) : null;
  const list = m.objectives || [], open = o => Number(st?.ticks?.[o.id] || 0) < needed(o);
  for (const o of list.filter(open)) {
    if (o.stop != null && m.stops?.[o.stop]) { const t = stopTarget(d, m, m.stops[o.stop]); if (t) return t; }
    const a = o.auto; if (!a) continue;
    // "one of them at Smashed It": the nearest of its sites, to paint over
    if (a.on === 'tagPlaced' && o.stop == null && (a.siteIds?.length || a.siteId)) {
      const options = (a.siteIds ?? [a.siteId]).map(id => m.stops?.find(x => x.code === id)).filter(Boolean).map(x => stopTarget(d, m, x)).filter(Boolean);
      const dist = t => { const g = here && C.toGlobal(d.atlas, t.mapId, t.x, t.y); return g ? Math.hypot(g[0] - here[0], g[1] - here[1]) : 0; };
      const best = here ? options.sort((p, q) => dist(p) - dist(q))[0] : options.at(-1);   // nearest; else the last of the set
      if (best) return {...best, label: `${best.label} · repaint at ${QUALITY_LABEL[a.minQuality] ?? 'a higher quality'} or better`};
      continue;
    }
    if (a.on === 'map') { const t = placeForMap(d, a.mapId, o.text); if (t) return {...t, sub}; continue; }
    if (a.on === 'cargoCollected' || a.on === 'cargoDelivered') { const t = cargoTarget(d, m, st, o, sub); if (t) return t; continue; }
    if (a.on === 'sold') {
      const service = a.service === 'chop' ? 'chop' : 'gang', ids = a.ids ?? null;
      if (rideFits(riding, {service, ids})) return {...fenceTarget(d, service, riding), sub: `${fenceTarget(d, service, riding)?.sub} · ${sub}`};
      const t = nickableTarget(d, here, {ids, service}) ?? (m.stops || []).map(s => s.code?.startsWith('EX-') ? stopTarget(d, m, s) : null).find(Boolean);
      if (t) return {...t, sub: riding ? `${riding.vt?.name ?? 'That'} won't do · ${sub}` : sub};
      continue;
    }
    if (a.on === 'service' && riding && !riding.why) { const t = serviceTarget(d, a.service, here); if (t) return {...t, sub: `${riding.vt?.name ?? 'The motor'} · ${sub}`}; }
  }
  // Nothing still to do has a place of its own: stay with the place of the last objective before the first open one.
  const first = list.findIndex(open);
  for (let i = first - 1; i >= 0; i--) {
    const o = list[i], a = o.auto;
    const t = o.stop != null && m.stops?.[o.stop] ? stopTarget(d, m, m.stops[o.stop]) : a?.on === 'map' ? placeForMap(d, a.mapId, o.text)
      : a?.on === 'cargoDelivered' || a?.on === 'cargoCollected' ? (() => { const p = (m.props || []).find(x => x.id === a.propId); const pt = p && (a.on === 'cargoDelivered' ? [p.delivery, p.deliveryZone] : [p.pickup, p.pickupZone]); const dest = pt && propDestination(m, pt[0]); return dest ? (typeof pt[0] === 'number' ? stopTarget(d, m, dest) : zonePlace(d, propMapId(dest), pt[1], p.name, sub)) : null; })() : null;
    if (t) return {...t, sub: t.sub ?? sub};
  }
  // a job with no places at all: the mission's first place (campaign jobs), or Pat's for the opening's
  if (m.group === 'opening' || !m.code || ['CH1', 'CH2', 'CH3'].includes(m.code)) { const a = destinationOf(d, x => x.placeId === 'LDP-ARCHES'); if (a && !list.some(o => o.stop != null)) return asTarget(a, {sub}); }
  const s = m.stops?.[0]; return s ? stopTarget(d, m, s) : null;
}
/* ------------------------------------------------------------------ start / stop */
export async function startSatNav(actor, target) {
  if (!actor) throw new Error('Pick a character for the sat nav.');
  if (!target) throw new Error('Choose where to go.');
  await satnavData();
  Object.assign(nav, {actorId: actor.id, target, arrived: false, error: '', heading: null, last: null, fit: false, compact: false});
  save(); await refresh({jump: true}); return nav;
}
export async function startCallNav(actor, call) {
  const d = await satnavData(), {token, vehicle} = trackedTokens(actor), here = token ? globalOf(d, vehicle ?? token) : null;
  const t = callTarget(d, call, here, actor); if (!t) throw new Error('This job has no place to go to yet. Check its instructions.');
  return startSatNav(actor, {callId: call.id, label: call.title});
}
/** Directions for a mission: follows it from place to place as its objectives tick. */
export async function startMissionNav(actor, m, stop = null) {
  const d = await satnavData(), mission = d.missions.find(x => x.id === m.id) ?? m, {token, vehicle} = trackedTokens(actor), here = token ? globalOf(d, vehicle ?? token) : null;
  const t = missionTarget(d, mission, missionState()[mission.id], stop, {actor, here}); if (!t) throw new Error('This mission has no place on the map yet.');
  return startSatNav(actor, stop ? {...t} : {missionId: mission.id, label: mission.title});
}
export function stopSatNav() {
  Object.assign(nav, {target: null, route: null, steps: [], arrived: false, error: ''}); save();
  el?.remove(); el = null; clearCanvasRoute(); updateBlower();
}
export const satnavActive = () => Boolean(nav.target);

/* ------------------------------------------------------------------ the route, worked out */
export function queueRefresh() { if (!nav.target) return; clearTimeout(queued); queued = setTimeout(() => refresh().catch(e => console.warn('The Smoke | sat nav', e)), 120); }
export async function refresh({jump = false} = {}) {
  if (!nav.target) return;
  const d = await satnavData(), actor = game.actors?.get?.(nav.actorId);
  const {token, vehicle} = trackedTokens(actor), mover = vehicle ?? token, here = mover ? globalOf(d, mover) : null;
  const tgt = resolveTarget(d, here);
  if (tgt?.ended) { ui.notifications?.info?.(tgt.passed ? `Sat nav: ${tgt.label} passed. Route ended.` : `Sat nav: ${tgt.label ?? 'that job'} is over. Route ended.`); return stopSatNav(); }
  nav.error = !actor ? 'Pick a character on the Blower.' : !here ? `Put ${actor.name} on a London map to get directions.` : tgt?.missing ? `Waiting for ${tgt.label ?? 'the next stop'}…` : '';
  if (nav.error) { nav.route = null; nav.steps = []; nav.tgt = tgt; render(d); clearCanvasRoute(); updateBlower(); return; }
  // which way you're facing: the way you last moved
  if (nav.last && Math.hypot(here[0] - nav.last[0], here[1] - nav.last[1]) > 40) nav.heading = C.bearing(nav.last, here);
  if (!nav.last || Math.hypot(here[0] - nav.last[0], here[1] - nav.last[1]) > 40) nav.last = here;
  const bike = vehicle?.actor?.system?.vehicle?.klass === 'bike', mode = vehicle && !bike ? 'drive' : 'walk', speed = vehicle ? (bike ? C.SPEED.bike : C.SPEED.drive) : C.SPEED.walk;
  const route = C.findRoute(d.net, here, tgt.goal, {mode});
  nav.route = route; nav.mode = vehicle ? (bike ? 'bike' : 'drive') : 'walk'; nav.speed = speed; nav.here = here; nav.tgt = tgt;
  nav.steps = route ? C.routeSteps(route, d.atlas, {label: tgt.label}) : [];
  if (nav.heading == null && nav.steps[0]?.heading != null) nav.heading = nav.steps[0].heading;
  const wasArrived = nav.arrived;
  nav.arrived = Boolean(route) && (route.length < ARRIVE || Math.hypot(here[0] - tgt.pin[0], here[1] - tgt.pin[1]) < ARRIVE);
  if (nav.arrived && !wasArrived) ui.notifications?.info?.(`Sat nav: you have arrived${tgt.label ? ` at ${tgt.label}` : ''}.`);
  render(d, {jump}); drawCanvasRoute(d); updateBlower();
}

/* ------------------------------------------------------------------ the screen */
const ARROW = {
  depart: '<path d="M24 6 L36 40 L24 32 L12 40 Z" fill="currentColor"/>',
  arrive: '<path d="M14 44V6m0 2h20l-5 7 5 7H14" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>',
  cross: '<path d="M8 24h24m-9-10 10 10-10 10M40 8v32" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>'
};
/** A turn arrow drawn at the real angle of the turn. */
export function turnGlyph(angle = 0) {
  if (Math.abs(angle) >= 150) return '<path d="M30 44V20a8 8 0 0 0-16 0v10" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M7 26l7 10 7-10" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>';
  const r = angle * Math.PI / 180, ex = 24 + Math.sin(r) * 16, ey = 22 - Math.cos(r) * 16, hx = Math.sin(r), hy = -Math.cos(r), px = -hy, py = hx;
  const tip = [ex + hx * 5, ey + hy * 5], l = [ex - hx * 4 + px * 7, ey - hy * 4 + py * 7], rr = [ex - hx * 4 - px * 7, ey - hy * 4 - py * 7];
  const f = n => n.toFixed(1);
  return `<path d="M24 44V22L${f(ex)} ${f(ey)}" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M${f(tip[0])} ${f(tip[1])}L${f(l[0])} ${f(l[1])}L${f(rr[0])} ${f(rr[1])}Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`;
}
const glyph = s => !s ? ARROW.depart : s.type === 'turn' ? turnGlyph(s.kind === 'straight' ? 0 : s.angle) : ARROW[s.type] ?? ARROW.depart;
/** The instruction to show now (and the one after, if it comes soon), with distances from where you are. */
export function nextInstructions(route, steps, scale) {
  if (!route) return {next: null, then: null};
  const ahead = steps.filter(s => s.type !== 'depart' && s.dist > 30);
  const depart = steps.find(s => s.type === 'depart');
  let next = ahead[0] ?? null;
  // still off the road (in a yard, a car park, a building): get onto it first
  if (route.onto > 220 && depart) next = {...depart, type: 'join', text: `Head to ${depart.road}`, dist: route.onto};
  else if (next && next.type === 'arrive' && depart && ahead.length === 1) next = {...next, text: `Follow ${depart.road} to ${next.text.replace(/^Arrive at /, '')}`};
  const then = next && ahead.find(s => s !== next && s.dist > next.dist && s.dist - next.dist < 600 && s.type !== 'arrive') || null;
  return {next: next && {...next, metres: next.dist * scale}, then: then && {...then, metres: then.dist * scale}};
}
function ensureEl() {
  if (el?.isConnected) return el;
  el = document.createElement('section');
  el.id = 'smoke-satnav'; el.className = 'the-smoke smoke-satnav'; el.setAttribute('aria-label', 'Sat nav');
  el.innerHTML = `<header class="smoke-satnav-next" data-sn="compact" title="Show or hide the map">
    <svg class="smoke-satnav-turn" viewBox="0 0 48 48" aria-hidden="true" data-turn></svg>
    <div class="smoke-satnav-say" aria-live="polite"><b data-dist></b><span data-text></span><small data-then></small></div></header>
  <div class="smoke-satnav-map">
    <svg data-map preserveAspectRatio="xMidYMid slice" role="img" aria-label="Route on the London overview map">
      <g data-world><image href="${IMG}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" data-img/>
        <polyline data-casing class="casing" vector-effect="non-scaling-stroke"/><polyline data-line class="line" vector-effect="non-scaling-stroke"/><polyline data-walk class="walk" vector-effect="non-scaling-stroke"/>
        <g data-cross></g><g data-pin class="pin"><circle r="9"/><circle r="3.5" class="dot"/></g>
        <g data-me class="me"><circle r="15" class="halo"/><path d="M0 -11 L8 9 L0 4 L-8 9 Z"/></g></g>
    </svg>
    <span class="smoke-satnav-road" data-road></span>
    <div class="smoke-satnav-tools">
      <button type="button" data-sn="in" title="Zoom in" aria-label="Zoom in"><i class="fa-solid fa-plus"></i></button>
      <button type="button" data-sn="out" title="Zoom out" aria-label="Zoom out"><i class="fa-solid fa-minus"></i></button>
      <button type="button" data-sn="fit" title="Whole route / follow me" aria-label="Show the whole route"><i class="fa-solid fa-route"></i></button>
      <button type="button" data-sn="north" title="North up / heading up" aria-label="Switch north up or heading up"><b>N</b></button>
    </div>
  </div>
  <footer class="smoke-satnav-foot"><div><b data-dest></b><small data-eta></small></div>
    <button type="button" data-sn="end" title="End route" aria-label="End route"><i class="fa-solid fa-xmark"></i></button></footer>`;
  (document.getElementById('interface') ?? document.body).append(el);
  el.addEventListener('click', ev => {
    const b = ev.target.closest('[data-sn]'); if (!b) return; ev.preventDefault();
    const a = b.dataset.sn;
    if (a === 'end') return stopSatNav();
    if (a === 'in') { nav.zoom = Math.max(0, nav.zoom - 1); nav.fit = false; }
    if (a === 'out') { nav.zoom = Math.min(ZOOMS.length - 1, nav.zoom + 1); nav.fit = false; }
    if (a === 'fit') nav.fit = !nav.fit;
    if (a === 'north') nav.northUp = !nav.northUp;
    if (a === 'compact') nav.compact = !nav.compact;
    save(); render(data, {jump: true});
  });
  place(); return el;
}
/** Sit in the bottom-right corner of the game area, left of the sidebar. */
function place() {
  if (!el) return;
  const side = document.getElementById('sidebar') ?? document.getElementById('ui-right'), r = side?.getBoundingClientRect?.();
  const right = r && r.width ? Math.max(8, window.innerWidth - r.left + 10) : 16;
  el.style.right = `${Math.round(right)}px`;
}
const pts = list => list.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
function render(d, {jump = false} = {}) {
  if (!d || !nav.target || typeof document === 'undefined') return;
  const root = ensureEl(), k = d.k, q = s => root.querySelector(s), units = setting('satnavUnits', 'imperial');
  root.classList.toggle('compact', nav.compact); root.classList.toggle('arrived', nav.arrived); root.classList.toggle('error', Boolean(nav.error));
  root.classList.toggle('heading-up', !nav.northUp); root.classList.toggle('fit', nav.fit);
  const [W, H] = C.worldSize(d.atlas), img = q('[data-img]'); img.setAttribute('width', W * k); img.setAttribute('height', H * k);
  const tgt = nav.tgt ?? {}, route = nav.route;
  q('[data-dest]').textContent = tgt.label ?? nav.target.label ?? 'Destination';
  // the instruction
  if (nav.error) {
    q('[data-turn]').innerHTML = '<circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 14v12M24 32v2" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/>';
    q('[data-dist]').textContent = ''; q('[data-text]').textContent = nav.error; q('[data-then]').textContent = ''; q('[data-eta]').textContent = tgt.sub ?? '';
  } else if (nav.arrived) {
    q('[data-turn]').innerHTML = ARROW.arrive; q('[data-dist]').textContent = 'You have arrived';
    q('[data-text]').textContent = tgt.label ?? ''; q('[data-then]').textContent = nav.target.callId ? 'The job moves on when you are in place.' : ''; q('[data-eta]').textContent = tgt.sub ?? '';
  } else {
    const {next, then} = nextInstructions(route, nav.steps, d.net.scale);
    q('[data-turn]').innerHTML = next?.type === 'join' ? ARROW.depart : glyph(next);
    q('[data-dist]').textContent = next ? C.formatDistance(next.metres, units) : '';
    q('[data-text]').textContent = next?.text ?? 'Follow the route';
    q('[data-then]').textContent = then ? `Then ${then.text.charAt(0).toLowerCase()}${then.text.slice(1)}` : '';
    q('[data-eta]').textContent = route ? `${C.formatDistance(route.metres, units)} · ${C.formatMinutes(route.metres, nav.speed)} ${nav.mode === 'walk' ? 'on foot' : nav.mode === 'bike' ? 'by bike' : 'by car'}${tgt.sub ? ` · ${tgt.sub}` : ''}` : (tgt.sub ?? '');
  }
  // where you are on the road
  const loc = nav.here && C.toLocal(d.atlas, ...nav.here), road = route?.legs?.[0]?.name;
  q('[data-road]').textContent = [route && route.onto < 220 ? road : null, loc?.map?.name].filter(Boolean).join(' · ');
  // the map: route, pin, you
  const line = route ? route.points.slice(0, -1).map(p => [p[0] * k, p[1] * k]) : [];
  q('[data-line]').setAttribute('points', pts(line)); q('[data-casing]').setAttribute('points', pts(line));
  const walk = route && tgt.pin ? [route.points.at(-1), tgt.pin].map(p => [p[0] * k, p[1] * k]) : [];
  q('[data-walk]').setAttribute('points', pts(walk));
  q('[data-cross]').innerHTML = nav.steps.filter(s => s.type === 'cross').map(s => `<circle cx="${(s.at[0] * k).toFixed(1)}" cy="${(s.at[1] * k).toFixed(1)}" r="1" class="cross" vector-effect="non-scaling-stroke"/>`).join('');
  const svg = q('[data-map]'), box = svg.getBoundingClientRect(), cw = box.width || 320, ch = box.height || 220;
  // what the screen shows
  const me = nav.here ? [nav.here[0] * k, nav.here[1] * k] : (tgt.pin ? [tgt.pin[0] * k, tgt.pin[1] * k] : [W * k / 2, H * k / 2]);
  let vw = ZOOMS[nav.zoom] ?? ZOOMS[2], cx = me[0], cy = me[1], rot = 0;
  if (nav.fit && line.length) {
    const xs = [...line, ...walk].map(p => p[0]), ys = [...line, ...walk].map(p => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    vw = Math.max(ZOOMS[0], bw * 1.35, bh * 1.45 * cw / ch); cx = (Math.max(...xs) + Math.min(...xs)) / 2; cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  } else if (!nav.northUp) { rot = -(nav.heading ?? 0); cy = me[1] - vw * ch / cw * 0.22; }
  const vh = vw * ch / cw, s = vw / cw; // overview px per screen px
  nav.view = {cx, cy, vw, vh, rot};
  const view = () => { svg.setAttribute('viewBox', `${(cx - vw / 2).toFixed(1)} ${(cy - vh / 2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`); };
  if (!jump && tween?.from) {
    const from = tween.from, start = performance.now(), to = {cx, cy, vw};
    cancelAnimationFrame(tween.raf);
    const step = now => { const t = Math.min(1, (now - start) / 350), e = 1 - Math.pow(1 - t, 3);
      const x = from.cx + (to.cx - from.cx) * e, y = from.cy + (to.cy - from.cy) * e, w = from.vw + (to.vw - from.vw) * e, h = w * ch / cw;
      svg.setAttribute('viewBox', `${(x - w / 2).toFixed(1)} ${(y - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`); tween.from = {cx: x, cy: y, vw: w};
      if (t < 1) tween.raf = requestAnimationFrame(step); };
    tween.raf = requestAnimationFrame(step);
  } else { view(); tween = {from: {cx, cy, vw}, raf: 0}; }
  tween.from ??= {cx, cy, vw};
  q('[data-world]').setAttribute('transform', rot ? `rotate(${rot.toFixed(1)} ${me[0].toFixed(1)} ${me[1].toFixed(1)})` : '');
  const pin = tgt.pin ? [tgt.pin[0] * k, tgt.pin[1] * k] : null;
  q('[data-pin]').setAttribute('transform', pin ? `translate(${pin[0].toFixed(1)} ${pin[1].toFixed(1)}) rotate(${(-rot).toFixed(1)}) scale(${s.toFixed(3)})` : 'scale(0)');
  q('[data-me]').setAttribute('transform', nav.here ? `translate(${me[0].toFixed(1)} ${me[1].toFixed(1)}) rotate(${(nav.heading ?? 0).toFixed(1)}) scale(${s.toFixed(3)})` : 'scale(0)');
  q('[data-cross]').querySelectorAll('circle').forEach(c => c.setAttribute('r', (5 * s).toFixed(2)));
  place();
}

/* ------------------------------------------------------------------ the route on the street map */
function clearCanvasRoute() { try { gfx?.clear?.(); } catch (_e) {} }
function drawCanvasRoute(d) {
  try {
    if (!canvas?.ready || !globalThis.PIXI) return;
    if (!gfx || gfx.destroyed) { gfx = new PIXI.Graphics(); gfx.eventMode = 'none'; gfx.name = 'smoke-satnav-route'; (canvas.interface ?? canvas.controls ?? canvas.stage).addChildAt?.(gfx, 0); }
    gfx.clear();
    if (!nav.route || !setting('satnavMapRoute', true) || nav.arrived) return;
    const scene = canvas.scene, id = mapIdOf(scene), all = [...nav.route.points.slice(0, -1)];
    let pieces = [], width = 34, shift = p => p;
    if (id === C.OVERVIEW_ID) { pieces = [all.map(p => [p[0] * d.k, p[1] * d.k])]; width = 14; }
    else { const m = C.tileOf(d.atlas, id); if (!m) return; const [ox, oy] = C.origin(m); pieces = C.clipToRect(all, [ox, oy, m.width, m.height]); shift = p => [p[0] - ox, p[1] - oy]; }
    const v8 = typeof gfx.setStrokeStyle === 'function';
    const stroke = (list, w, color, alpha) => {
      for (const pl of list) {
        if (pl.length < 2) continue; const [a, ...rest] = pl.map(shift);
        if (!v8) gfx.lineStyle({width: w, color, alpha, cap: PIXI.LINE_CAP?.ROUND ?? 'round', join: PIXI.LINE_JOIN?.ROUND ?? 'round'});
        gfx.moveTo(a[0], a[1]); for (const p of rest) gfx.lineTo(p[0], p[1]);
        if (v8) gfx.stroke({width: w, color, alpha, cap: 'round', join: 'round'});
      }
    };
    stroke(pieces, width * 1.7, 0x041018, 0.55); stroke(pieces, width, 0x37d7ff, 0.8);
    // the destination, when it is on this map
    const pin = nav.tgt?.pin; if (!pin) return;
    let at = null; if (id === C.OVERVIEW_ID) at = [pin[0] * d.k, pin[1] * d.k]; else { const loc = C.toLocal(d.atlas, ...pin); if (loc?.mapId === id) at = [loc.x, loc.y]; }
    if (!at) return;
    const r = id === C.OVERVIEW_ID ? 22 : 60;
    if (!v8) { gfx.lineStyle({width: width * 0.5, color: 0xffd166, alpha: 0.95}); gfx.drawCircle(at[0], at[1], r); }
    else { gfx.circle(at[0], at[1], r); gfx.stroke({width: width * 0.5, color: 0xffd166, alpha: 0.95}); }
  } catch (error) { console.warn('The Smoke | sat nav route on the map', error); }
}

/* ------------------------------------------------------------------ the Blower */
/** What the Blower shows about the sat nav, updated in place as you move. */
export function satnavSummary() {
  if (!nav.target) return null; const units = setting('satnavUnits', 'imperial');
  return {label: nav.tgt?.label ?? nav.target.label ?? 'Destination', remaining: nav.arrived ? 'Arrived' : nav.route ? C.formatDistance(nav.route.metres, units) : '…', callId: nav.target.callId ?? null, actorId: nav.actorId};
}
function updateBlower() {
  if (typeof document === 'undefined') return; const s = satnavSummary();
  document.querySelectorAll('[data-satnav-remaining]').forEach(n => { n.textContent = s?.remaining ?? ''; });
  document.querySelectorAll('[data-satnav-label]').forEach(n => { n.textContent = s?.label ?? ''; });
}
/** The sat nav's destination list: this character's jobs first, then the crew's doors, services, landmarks and districts. */
export async function openSatnavPicker(actor) {
  if (!actor) throw new Error('Pick a character first.');
  const d = await satnavData(), calls = Object.values(game.smoke?.jobs?.state?.().calls ?? {}).filter(c => c.status === 'active' && (c.actorId === actor.id || (c.userIds || []).includes(game.user.id)));
  const groups = new Map(); for (const x of d.destinations) (groups.get(x.group) ?? groups.set(x.group, []).get(x.group)).push(x);
  const opt = (v, l, sel = false) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;
  const content = `<div class="the-smoke smoke-satnav-pick"><p>Where to, ${esc(actor.name)}? The sat nav opens bottom right and re-routes as you go.</p>
    <label>Destination <select name="dest">${calls.length ? `<optgroup label="Your jobs">${calls.map((c, i) => opt(`call:${c.id}`, `${c.title} — ${c.stage}`, !i)).join('')}</optgroup>` : ''}
    ${[...groups].map(([g, list]) => `<optgroup label="${esc(g)}">${list.map((x, i) => opt(x.key, x.group === 'Districts' ? `${x.label} (${x.sub})` : `${x.label} — ${x.sub}`, !calls.length && g === 'The Chainring' && !i)).join('')}</optgroup>`).join('')}</select></label></div>`;
  const res = await foundry.applications.api.DialogV2.input({window: {title: 'The Blower · Sat nav', icon: 'fa-solid fa-diamond-turn-right'}, content, ok: {label: 'Go', icon: 'fa-solid fa-route'}});
  const key = res?.dest; if (!key) return null;
  if (key.startsWith('call:')) { const call = game.smoke.jobs.state().calls[key.slice(5)]; return call ? startCallNav(actor, call) : null; }
  const dest = d.destinations.find(x => x.key === key); if (!dest) return null;
  return startSatNav(actor, {mapId: dest.mapId, x: dest.x, y: dest.y, goal: dest.goal, label: dest.label, sub: dest.sub, key: dest.key});
}
export function toggleSatNav(actor) {
  if (!nav.target) return openSatnavPicker(actor);
  nav.compact = !nav.compact; save(); return render(data, {jump: true});
}

/* ------------------------------------------------------------------ install */
export function installSatnav() {
  const moved = (doc, changes) => {
    if (!nav.target || !doc) return;
    const watched = new Set([...Object.values(trackedTokens(game.actors.get(nav.actorId))).filter(Boolean).map(t => t.id)]);
    if (nav.tgt?.tokenId) watched.add(nav.tgt.tokenId);
    if (watched.has(doc.id) || doc.actorId === nav.actorId) queueRefresh();
  };
  Hooks.on('updateToken', (doc, changes) => { if ('x' in changes || 'y' in changes || changes.flags) moved(doc, changes); });
  for (const h of ['createToken', 'deleteToken']) Hooks.on(h, doc => moved(doc, {}));
  for (const h of ['canvasReady', 'smokeTransit', 'smokeBoarded', 'smokeJobsChanged', 'smokeMissionsChanged']) Hooks.on(h, () => { if (h === 'canvasReady') gfx = null; queueRefresh(); });
  Hooks.on('collapseSidebar', () => setTimeout(place, 260));
  globalThis.addEventListener?.('resize', () => place());
  // carry on where you left off after a reload
  const saved = setting(STATE, {});
  if (saved?.target && game.actors?.get?.(saved.actorId)) { Object.assign(nav, saved); satnavData().then(() => refresh({jump: true})).catch(() => null); }
}
export const satnavAPI = {start: startSatNav, job: startCallNav, mission: startMissionNav, stop: stopSatNav, pick: openSatnavPicker, toggle: toggleSatNav, refresh, state: satnavState, data: satnavData};
